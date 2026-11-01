// 纯逻辑冒烟测试：node tests/logic.test.mjs
import assert from 'node:assert/strict';
import { buildPath, createMap, canPlace, placeCard, mapStats, spawnEnemies, cellAt, neighbors } from '../js/world/loopMap.js';
import { createHero, deriveHero, gainXp, potionHeal, ensureSkeletons } from '../js/world/hero.js';
import { makeEnemy, ENEMIES } from '../js/data/enemies.js';
import { rollEquip, equipIfBetter, itemScore } from '../js/systems/loot.js';
import { TRAITS } from '../js/data/traits.js';
import { traitChoices } from '../js/ui/screens.js';
import { cardPool, autoDeck, deckFromMeta } from '../js/data/cards.js';
import { CLASSES, classUnlocked } from '../js/data/classes.js';
import { CHAPTERS, INFINITE, chapterUnlocked, chapterById } from '../js/data/chapters.js';
import { defaultMeta } from '../js/systems/save.js';
import { build } from '../js/systems/camp.js';
import { missingRequires } from '../js/systems/camp.js';
import { BUILDINGS } from '../js/data/buildings.js';
import { markCard, markCombo, markEnemy, seenCard, seenCombo, seenEnemy } from '../js/systems/codex.js';
import { AFFIX_KEYS } from '../js/data/itemAffixes.js';
import { handMax } from '../js/systems/hand.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

function firstRoadside(map) {
  return map.grid.flat().find((c) => c.kind === 'roadside');
}

function insideLandNeighbor(map, c) {
  const b = map.bounds;
  return neighbors(map, c).find((n) => n.kind === 'landscape' &&
    n.x > b.x0 && n.x < b.x1 && n.y > b.y0 && n.y < b.y1);
}

function firstInsideRoadside(map) {
  return map.grid.flat().find((c) => c.kind === 'roadside' && insideLandNeighbor(map, c));
}

console.log('地图');
test('环线闭合且不重复', () => {
  const path = buildPath();
  assert.equal(path.length, 76);
  const set = new Set(path.map((p) => `${p.x},${p.y}`));
  assert.equal(set.size, path.length);
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    assert.equal(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), 1, `第 ${i} 段不相邻`);
  }
});

test('地图槽位分类', () => {
  const map = createMap();
  assert.equal(map.pathIndex.size, 76);
  let road = 0, side = 0, land = 0;
  for (const row of map.grid) for (const c of row) {
    if (c.kind === 'path') road++;
    else if (c.kind === 'roadside') side++;
    else land++;
  }
  assert.equal(road, 76);
  assert.ok(side > 0 && land > 0);
  assert.equal(road + side + land, 40 * 22);
});

console.log('铺牌');
test('路边牌不能放野地，野地牌不能放路边', () => {
  const map = createMap();
  const land = cellAt(map, 15, 8);
  const side = firstRoadside(map);
  assert.equal(canPlace(map, land, 'rock'), true);
  assert.equal(canPlace(map, land, 'village'), false);
  assert.equal(canPlace(map, side, 'village'), true);
  assert.equal(canPlace(map, side, 'rock'), false);
  assert.equal(placeCard(map, land, 'rock') !== null, true);
  assert.equal(canPlace(map, land, 'rock'), false, '同一格不能重复放置');
});

test('三块相邻岩石转化为山岭', () => {
  const map = createMap();
  const cells = [cellAt(map, 15, 8), cellAt(map, 16, 8), cellAt(map, 17, 8)];
  for (const c of cells) assert.ok(canPlace(map, c, 'rock'));
  placeCard(map, cells[0], 'rock');
  placeCard(map, cells[1], 'rock');
  const res = placeCard(map, cells[2], 'rock');
  assert.equal(res.formed?.into, 'mountain');
  assert.ok(cells.every((c) => c.card.variant === 'mountain'));
  assert.equal(mapStats(map).maxHp, 26, '3 座山脉基础 18 + 相邻加成 8');
});

test('地形加成汇总', () => {
  const map = createMap();
  placeCard(map, cellAt(map, 15, 8), 'forest');
  placeCard(map, cellAt(map, 16, 8), 'meadow');
  const side = firstRoadside(map);
  assert.equal(side.kind, 'roadside');
  placeCard(map, side, 'village');
  const s = mapStats(map);
  assert.ok(Math.abs(s.atkSpeed - 0.01) < 1e-9);
  assert.ok(Math.abs(s.regen - 0.4) < 1e-9);
  assert.equal(s.healPass.length, 1);
});

test('墓地生成骷髅', () => {
  const map = createMap();
  placeCard(map, firstRoadside(map), 'cemetery');
  const enemies = spawnEnemies(map, 1, makeEnemy);
  assert.equal(enemies.length, 1);
  assert.equal(enemies[0].type, 'skeleton');
  assert.equal(enemies[0].alive, true);
});

test('沙丘组合转化为沙漠', () => {
  const map = createMap();
  const cells = [cellAt(map, 18, 8), cellAt(map, 19, 8), cellAt(map, 20, 8)];
  for (const c of cells) assert.ok(canPlace(map, c, 'dunes'));
  placeCard(map, cells[0], 'dunes');
  placeCard(map, cells[1], 'dunes');
  const res = placeCard(map, cells[2], 'dunes');
  assert.equal(res.formed?.into, 'desert');
  assert.ok(cells.every((c) => c.card.variant === 'desert'));
  assert.ok(Math.abs(mapStats(map).evade - 0.045) < 1e-9);
});

test('河流让相邻地形效果翻倍', () => {
  const map = createMap();
  placeCard(map, cellAt(map, 18, 8), 'forest');
  placeCard(map, cellAt(map, 19, 8), 'river');
  const s = mapStats(map);
  assert.ok(Math.abs(s.atkSpeed - 0.03) < 1e-9, `森林 0.02 + 河流 0.01，实际 ${s.atkSpeed}`);
});

test('时空水晶让相邻地形效果翻倍', () => {
  const map = createMap();
  placeCard(map, cellAt(map, 15, 8), 'forest');
  placeCard(map, cellAt(map, 16, 8), 'timeCrystal');
  const s = mapStats(map);
  assert.ok(Math.abs(s.atkSpeed - 0.02) < 1e-9, `森林 1% 翻倍，实际 ${s.atkSpeed}`);
});

test('零之界标记录道路位置', () => {
  const map = createMap();
  placeCard(map, firstRoadside(map), 'zeroBeacon');
  assert.equal(Number.isInteger(mapStats(map).zeroBeacon), true);
});

test('军械库提供额外装备栏', () => {
  const map = createMap();
  placeCard(map, firstRoadside(map), 'arsenal');
  assert.equal(mapStats(map).arsenal, 1);
});

test('麦田与血魔树林的放置限制', () => {
  const map = createMap();
  const side = firstInsideRoadside(map);
  const land = insideLandNeighbor(map, side);
  assert.ok(land, '路边格应有相邻的内部野地');
  assert.equal(canPlace(map, land, 'wheat'), false, '没有村庄不能放麦田');
  placeCard(map, side, 'village');
  assert.equal(canPlace(map, land, 'wheat'), true, '村庄旁可以放麦田');

  const fcell = cellAt(map, 15, 9);
  const bcell = cellAt(map, 16, 9);
  assert.equal(canPlace(map, fcell, 'bloodGrove'), false, '没有树不能放血魔树林');
  placeCard(map, fcell, 'forest');
  assert.equal(canPlace(map, bcell, 'bloodGrove'), true, '森林旁可以放血魔树林');
});

test('遗忘皆空只能销毁已有地形', () => {
  const map = createMap();
  const land = cellAt(map, 15, 8);
  placeCard(map, land, 'forest');
  assert.equal(canPlace(map, land, 'forget'), true);
  assert.equal(canPlace(map, cellAt(map, 16, 8), 'forget'), false);
});

test('跨卡牌联动', () => {
  // 沙丘 + 河流 → 绿洲
  let map = createMap();
  placeCard(map, cellAt(map, 15, 8), 'river');
  placeCard(map, cellAt(map, 16, 8), 'dunes');
  assert.equal(cellAt(map, 16, 8).card.variant, 'oasis');

  // 遗迹 + 遗迹 → 古老遗迹
  map = createMap();
  const sides = map.grid.flat().filter((c) => c.kind === 'roadside');
  let pair = null;
  for (const a of sides) {
    const b = neighbors(map, a).find((n) => n.kind === 'roadside');
    if (b) { pair = [a, b]; break; }
  }
  assert.ok(pair, '应存在相邻的路边格');
  placeCard(map, pair[0], 'ruins');
  placeCard(map, pair[1], 'ruins');
  assert.equal(pair[0].card.variant, 'ancientRuins');
  assert.equal(pair[1].card.variant, 'ancientRuins');

  // 村庄 + 吸血鬼别墅 → 伯爵领地
  map = createMap();
  const s2 = map.grid.flat().filter((c) => c.kind === 'roadside');
  let p2 = null;
  for (const a of s2) {
    const b = neighbors(map, a).find((n) => n.kind === 'roadside');
    if (b) { p2 = [a, b]; break; }
  }
  placeCard(map, p2[0], 'village');
  placeCard(map, p2[1], 'vampireMansion');
  assert.equal(p2[0].card.variant, 'countyEstate', '村庄应升级为伯爵领地');

  // 森林 + 焦土森林 → 饥饿树林
  map = createMap();
  placeCard(map, cellAt(map, 15, 8), 'forest');
  placeCard(map, cellAt(map, 16, 8), 'burntForest');
  assert.equal(cellAt(map, 15, 8).card.variant, 'hungryGrove');

  // 墓园 + 村庄 → 被洗劫的村庄
  map = createMap();
  const s3 = map.grid.flat().filter((c) => c.kind === 'roadside');
  let p3 = null;
  for (const a of s3) {
    const b = neighbors(map, a).find((n) => n.kind === 'roadside');
    if (b) { p3 = [a, b]; break; }
  }
  placeCard(map, p3[0], 'cemetery');
  placeCard(map, p3[1], 'village');
  assert.equal(p3[1].card.variant, 'ruinedVillage');

  // 村庄 + 麦田 → 伯爵领地
  map = createMap();
  const side = firstInsideRoadside(map);
  const land = insideLandNeighbor(map, side);
  placeCard(map, side, 'village');
  placeCard(map, land, 'wheat');
  assert.equal(side.card.variant, 'countyEstate');

  // 蜘蛛茧 + 森林 → 巨型蛛巢
  map = createMap();
  const s4 = map.grid.flat().filter((c) => c.kind === 'roadside');
  let p4 = null;
  for (const a of s4) {
    const b = insideLandNeighbor(map, a);
    if (b) { p4 = [a, b]; break; }
  }
  placeCard(map, p4[1], 'forest');
  placeCard(map, p4[0], 'spiderNest');
  assert.equal(p4[0].card.variant, 'giantNest');

  // 墓园 + 墓园 → 大墓园
  map = createMap();
  const s5 = map.grid.flat().filter((c) => c.kind === 'roadside');
  let p5 = null;
  for (const a of s5) {
    const b = neighbors(map, a).find((n) => n.kind === 'roadside');
    if (b) { p5 = [a, b]; break; }
  }
  placeCard(map, p5[0], 'cemetery');
  placeCard(map, p5[1], 'cemetery');
  assert.equal(p5[0].card.variant, 'grandCemetery');
  assert.equal(p5[1].card.variant, 'grandCemetery');
});

test('空洞宝库生成石像鬼', () => {
  const map = createMap();
  placeCard(map, firstRoadside(map), 'emptyTreasury');
  const enemies = spawnEnemies(map, 1, makeEnemy);
  assert.ok(enemies.some((e) => e.type === 'gargoyle'));
});

test('扩展地形：攻击、经验、移速、魂晶', () => {
  const map = createMap();
  placeCard(map, cellAt(map, 15, 8), 'burntForest');
  placeCard(map, cellAt(map, 15, 9), 'town');
  const sides = map.grid.flat().filter((c) => c.kind === 'roadside');
  placeCard(map, sides[0], 'library');
  placeCard(map, sides[1], 'temporalBeacon');
  placeCard(map, sides[2], 'treasury');
  const s = mapStats(map);
  assert.equal(s.atk, 1);
  assert.ok(Math.abs(s.xpBonus - 0.1) < 1e-9);
  assert.equal(s.libraryPass.length, 1);
  assert.ok(Math.abs(s.speedBonus - 0.08) < 1e-9);
  assert.ok(Math.abs(s.soulChance - 0.3) < 1e-9);

  const meta = defaultMeta();
  const h = createHero(meta);
  deriveHero(h, s, meta);
  assert.equal(h.atk, 11);
  assert.ok(h.speed > 2.15);
});

console.log('英雄');
test('营地训练场与装备参与属性推导', () => {
  const meta = defaultMeta();
  meta.buildings.gym = 2;
  const h = createHero(meta);
  assert.equal(h.maxHp, 123 + 24);
  const sword = { slot: 'weapon', stats: { atk: 4 }, rarity: 'rare' };
  equipIfBetter(h, sword);
  deriveHero(h, { maxHp: 5, atkSpeed: 0.1, regen: 1 }, meta);
  assert.equal(h.maxHp, 123 + 24 + 5);
  assert.equal(h.atk, 14);
  assert.ok(h.atkSpeed > 1.09);
});

test('升级与药水', () => {
  const meta = defaultMeta();
  const h = createHero(meta);
  const ups = gainXp(h, 60);
  assert.ok(ups >= 2);
  h.hp = 10;
  assert.equal(potionHeal(h), true);
  assert.ok(h.hp > 10);
  assert.equal(potionHeal(h), false, '只有一瓶药水');
});

test('天赋可叠加生效', () => {
  const meta = defaultMeta();
  const h = createHero(meta);
  const before = h.bonus.atk;
  TRAITS.find((t) => t.id === 'blade').apply(h);
  deriveHero(h, null, meta);
  assert.equal(h.bonus.atk, before + 2);
  assert.equal(h.atk, 12);
});

test('天赋按职业分组', () => {
  const rngObj = { next: Math.random };
  for (const cid of ['warrior', 'rogue', 'necromancer']) {
    const hero = createHero(defaultMeta(), cid);
    for (let i = 0; i < 30; i++) {
      const choices = traitChoices(rngObj, hero);
      assert.equal(choices.length, 3);
      for (const t of choices) {
        assert.ok(!t.classes || t.classes.includes(cid), `${cid} 不应出现 ${t.id}`);
      }
    }
  }

  const h = createHero(defaultMeta(), 'necromancer');
  TRAITS.find((t) => t.id === 'boneLord').apply(h);
  ensureSkeletons(h);
  assert.equal(h.skeletons.length, 3, '白骨领主使骷髅上限 +1');
});

console.log('职业');
test('三职业的基础与装备栏', () => {
  const meta = defaultMeta();
  const w = createHero(meta, 'warrior');
  const r = createHero(meta, 'rogue');
  const n = createHero(meta, 'necromancer');
  assert.equal(w.slots.length, 3);
  assert.ok(w.slots.some((s) => s.id === 'armor'));
  assert.ok(r.slots.some((s) => s.id === 'offhand'));
  assert.ok(r.slots.every((s) => s.id !== 'armor'));
  assert.ok(n.slots.some((s) => s.id === 'staff'));
  assert.ok(r.crit > w.crit);
  assert.ok(n.base.atk < w.base.atk);
});

test('盗贼双持武器叠加攻击', () => {
  const meta = defaultMeta();
  const h = createHero(meta, 'rogue');
  const base = h.atk;
  equipIfBetter(h, { slot: 'weapon', stats: { atk: 4 }, rarity: 'common' });
  equipIfBetter(h, { slot: 'offhand', stats: { atk: 3 }, rarity: 'common' });
  deriveHero(h, null, meta);
  assert.equal(h.atk, base + 7);
});

test('死灵法师召唤骷髅，法杖强化', () => {
  const meta = defaultMeta();
  const h = createHero(meta, 'necromancer');
  ensureSkeletons(h);
  assert.equal(h.skeletons.length, 2);
  const atk0 = h.skeletons[0].atk;
  h.equipment.staff = { slot: 'staff', stats: { atk: 6 }, rarity: 'rare' };
  deriveHero(h, null, meta);
  ensureSkeletons(h);
  assert.equal(h.skeletons.length, 2, '已有骷髅时不重复召唤');
  h.skeletons = [];
  ensureSkeletons(h);
  assert.ok(h.skeletons[0].atk > atk0, '法杖应强化骷髅');
});

test('职业解锁依赖营地建筑', () => {
  const meta = defaultMeta();
  assert.equal(classUnlocked(meta, 'warrior'), true);
  assert.equal(classUnlocked(meta, 'rogue'), false);
  assert.equal(classUnlocked(meta, 'necromancer'), false);
  meta.buildings.guild = 1;
  meta.buildings.crypt = 1;
  assert.equal(classUnlocked(meta, 'rogue'), true);
  assert.equal(classUnlocked(meta, 'necromancer'), true);
  assert.equal(CLASSES.rogue.unlock, 'guild');
});

console.log('战利品');
test('装备生成与比较', () => {
  const item = rollEquip(5, 0);
  assert.ok(['weapon', 'armor', 'amulet'].includes(item.slot));
  assert.ok(Object.keys(item.stats).length > 0);
  assert.ok(itemScore(item) > 0);
  const meta = defaultMeta();
  const h = createHero(meta);
  const r = equipIfBetter(h, item);
  assert.equal(r.equipped, true);
  assert.equal(h.equipment[item.slot], item);
});

console.log('营地');
test('建造扣资源并解锁卡牌', () => {
  const meta = defaultMeta();
  meta.resources = { wood: 100, stone: 100, soul: 100 };
  const before = cardPool(meta).length;
  const res = build(meta, 'cemetery');
  assert.equal(res.ok, true);
  assert.equal(meta.resources.stone, 90);
  assert.ok(cardPool(meta).includes('cemetery'));
  assert.equal(cardPool(meta).length, before + 5);
});

test('新建筑解锁新卡牌', () => {
  const meta = defaultMeta();
  meta.resources = { wood: 999, stone: 999, soul: 999 };
  const before = cardPool(meta).length;
  build(meta, 'library');
  build(meta, 'academy');
  build(meta, 'armory');
  build(meta, 'beacon');
  build(meta, 'crypt');
  const pool = cardPool(meta);
  for (const id of ['library', 'maze', 'arsenal', 'treasury', 'emptyTreasury', 'temporalBeacon', 'reed', 'ancestralCrypt', 'forget']) {
    assert.ok(pool.includes(id), `应解锁 ${id}`);
  }
  assert.equal(pool.length, before + 16);
});

test('资源不足时不能建造', () => {
  const meta = defaultMeta();
  const res = build(meta, 'fort');
  assert.equal(res.ok, false);
});

test('营地建筑数量与药剂/装备加成', () => {
  const meta = defaultMeta();
  assert.equal(Object.keys(meta.buildings).length, 23, '应有 23 座建筑');

  meta.buildings.supplies = 1;
  meta.buildings.inn = 1;
  meta.buildings.alchemist = 1;
  meta.buildings.healerHut = 1;
  meta.buildings.forge = 2;
  meta.buildings.forestCamp = 1;
  const h = createHero(meta, 'warrior', { starter: true });
  assert.equal(h.maxPotions, 4);
  assert.equal(h.potions, 2, '补给站额外给 1 瓶');
  assert.ok(Math.abs(h.potionPower - 0.6) < 1e-9);
  assert.equal(h.atk, 10 + 4, '基础 10 + 开局武器 2 + 铁炉 2');
  assert.ok(h.atkSpeed > 1.05, '森林营地 +5% 攻速');
});

test('自动牌组与自定义牌组', () => {
  const meta = defaultMeta();
  const auto = autoDeck(meta);
  assert.equal(auto.length, 10, '初始 5 张牌各 2 份');
  assert.equal(deckFromMeta(meta).length, 10);

  meta.deck = ['rock', 'rock', 'forest', 'meadow', 'village', 'spiderNest', 'rock', 'forest'];
  assert.equal(deckFromMeta(meta).length, 10, '不足 10 张时回退自动牌组');

  meta.deck = ['rock', 'rock', 'forest', 'forest', 'meadow', 'meadow', 'village', 'village', 'spiderNest', 'spiderNest', 'rock', 'forest'];
  assert.equal(deckFromMeta(meta).length, 12, '满 10 张后使用自定义牌组');

  meta.resources = { wood: 100, stone: 100, soul: 100 };
  build(meta, 'farm');
  build(meta, 'cemetery');
  build(meta, 'lodge');
  build(meta, 'smithy');
  build(meta, 'watchtower');
  build(meta, 'fort');
  assert.equal(autoDeck(meta).length, 30, '全部解锁后自动牌组封顶 30');
});

console.log('章节');
test('章节解锁链', () => {
  const meta = defaultMeta();
  assert.equal(meta.chapterMax, 1);
  assert.equal(chapterUnlocked(meta, 1), true);
  assert.equal(chapterUnlocked(meta, 2), false);
  assert.equal(chapterUnlocked(meta, 'inf'), false);
  meta.chapterMax = 2;
  assert.equal(chapterUnlocked(meta, 2), true);
  assert.equal(chapterUnlocked(meta, 3), false);
  meta.chapterMax = 4;
  assert.equal(chapterUnlocked(meta, 'inf'), true);
});

test('章节首领映射', () => {
  assert.equal(CHAPTERS[1].boss, 'lich');
  assert.equal(CHAPTERS[2].boss, 'priestess');
  assert.equal(CHAPTERS[3].boss, 'hunter');
  assert.equal(CHAPTERS[4].boss, 'omega');
  assert.equal(chapterById('inf').boss, 'omega');
  assert.equal(INFINITE.unlock, 4);
});

console.log('敌人');
test('敌人随圈数成长，Boss 不随圈数膨胀', () => {  const a = makeEnemy('skeleton', 1);
  const b = makeEnemy('skeleton', 5);
  assert.ok(b.maxHp > a.maxHp);
  const boss1 = makeEnemy('lich', 8);
  const boss2 = makeEnemy('lich', 12);
  assert.equal(boss1.maxHp, boss2.maxHp);
  assert.equal(ENEMIES.lich.boss, true);
});

console.log('图鉴');
test('图鉴记录与重复标记', () => {
  const meta = defaultMeta();
  assert.equal(seenCard(meta, 'forest'), false);
  markCard(meta, 'forest');
  markCard(meta, 'forest');
  assert.equal(seenCard(meta, 'forest'), true);
  markCombo(meta, 'same:forest');
  assert.equal(seenCombo(meta, 'same:forest'), true);
  markEnemy(meta, 'slime');
  assert.equal(seenEnemy(meta, 'slime'), true);
});

console.log('建筑树');
test('所有建筑 lv1 无前置', () => {
  const meta = defaultMeta();
  for (const b of BUILDINGS) {
    assert.deepEqual(missingRequires(meta, b.id, 1), [], `${b.name} lv1 不应有前置`);
  }
});

test('高阶建筑校验前置并给出原因', () => {
  const meta = defaultMeta();
  meta.resources = { wood: 9999, stone: 9999, soul: 9999, metal: 9999, shard: 9999, tome: 9999 };
  assert.equal(build(meta, 'forge').ok, true, 'forge lv1 可建');
  const blocked = build(meta, 'forge');
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /铁匠铺/);
  assert.equal(build(meta, 'smithy').ok, true);
  assert.equal(build(meta, 'forge').ok, true, '铁匠铺 lv1 后 forge 可升 lv2');
});

test('六资源与手牌上限生效', () => {
  const meta = defaultMeta();
  for (const k of ['wood', 'stone', 'soul', 'metal', 'shard', 'tome']) {
    assert.equal(typeof meta.resources[k], 'number');
  }
  meta.buildings.intel = 3;
  meta.buildings.library = 2;
  assert.equal(handMax({ meta }), 9);
});

console.log('装备词条');
test('随机装备只生成有消费点的词条', () => {
  const slots = ['weapon', 'offhand', 'armor', 'amulet', 'staff', 'ring'];
  for (const slot of slots) {
    for (let i = 0; i < 200; i++) {
      const item = rollEquip(5, 0.2, slot);
      assert.ok(Object.keys(item.stats).length > 0);
      for (const key of Object.keys(item.stats)) {
        assert.ok(AFFIX_KEYS.includes(key), `${slot} 生成了未接线词条 ${key}`);
      }
    }
  }
});

test('暴伤/反击/减伤/经验/回复/闪避接入 deriveHero', () => {
  const meta = defaultMeta();
  const h = createHero(meta, 'warrior');
  const base = { ...h };
  h.equipment.weapon = {
    slot: 'weapon',
    stats: { critDmg: 0.2, counterChance: 0.1, damageReduction: 0.05, lootBonus: 0.1, xpBonus: 0.08 },
  };
  h.equipment.armor = { slot: 'armor', stats: { regen: 0.5, evade: 0.03 } };
  deriveHero(h, null, meta);
  assert.ok(h.critDmg >= base.critDmg + 0.2);
  assert.ok(h.counterChance >= 0.3);
  assert.equal(h.damageReduction, 0.05);
  assert.ok(h.xpBonus >= 0.08);
  assert.ok(h.regen >= base.regen + 0.5);
  assert.ok(h.evade >= base.evade + 0.03);
});

console.log(`\n${passed} 项通过${failed ? `，${failed} 项失败` : ''}`);
if (failed) process.exitCode = 1;
