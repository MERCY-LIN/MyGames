// 集成模拟：用最小 DOM 桩直接驱动真实 Game 循环（无需浏览器）
// 同时充当数值平衡的粗略体检：node tests/sim.test.mjs
import assert from 'node:assert/strict';
import { rng } from '../js/core/rng.js';
import * as combat from '../js/systems/combat.js';
import * as spawner from '../js/systems/spawner.js';
import { itemScore } from '../js/systems/loot.js';

// ---------- 最小 DOM / localStorage 桩 ----------
class El {
  constructor(id = '') {
    this.id = id;
    this.innerHTML = '';
    this.textContent = '';
    this.disabled = false;
    this.dataset = {};
    this.style = {};
    this.classList = {
      add() {}, remove() {}, toggle() {}, contains() { return false; },
    };
  }
  addEventListener() {}
  removeEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
  appendChild() {}
  closest() { return null; }
}

const els = new Map();
globalThis.document = {
  getElementById(id) {
    if (!els.has(id)) els.set(id, new El(id));
    return els.get(id);
  },
  createElement() { return new El(); },
  querySelectorAll() { return []; },
  body: new El('body'),
};

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

// ---------- 加载游戏 ----------
const { Game } = await import('../js/game.js');
const { canPlace } = await import('../js/world/loopMap.js');
const { CARDS } = await import('../js/data/cards.js');
const { makeEnemy } = await import('../js/data/enemies.js');
const { initHUD } = await import('../js/ui/hud.js');
const { initScreens } = await import('../js/ui/screens.js');

function tryPlaceSomewhere(game) {
  const run = game.run;
  if (!run || !run.hand.length) return false;

  const spawnTiles = run.map.grid.flat()
    .filter((c) => c.card && CARDS[c.card.variant || c.card.id]?.spawn).length;
  const preferSpawn = spawnTiles < 4 || run.loop >= 5;
  const order = run.hand.map((id, i) => ({ id, i, spawn: !!CARDS[id]?.spawn }))
    .sort((a, b) => (preferSpawn ? Number(b.spawn) - Number(a.spawn) : Number(a.spawn) - Number(b.spawn)));
  const usable = order.filter((o) => o.id !== 'forget');
  const list = usable.length ? usable : order;

  for (const { id, i } of list) {
    for (const row of run.map.grid) {
      for (const c of row) {
        if (!canPlace(run.map, c, id)) continue;
        game.selectCard(i);
        if (game.tryPlace(c.x, c.y)) return true;
      }
    }
  }
  if (run.hand.length) game.discardCard(0);
  return false;
}

function simulate({ seconds = 1200, speed = 3, place = true, seedNote = '', classId = 'warrior', chapter = 1, infinite = false } = {}) {
  const game = new Game();
  game.meta = {
    version: 3,
    resources: { wood: 30, stone: 30, soul: 10 },
    buildings: {
      campfire: 1, gym: 1, farm: 1, cemetery: 1, lodge: 1,
      smithy: 1, watchtower: 1, fort: 1, guild: 1, crypt: 1, intel: 1,
      library: 1, armory: 1, beacon: 1,
    },
    classId,
    deck: [],
    chapter,
    chapterMax: 4,
    infinite,
    bestLayer: 0,
    bestLoop: 0, runs: 0, victories: 0, createdAt: Date.now(),
  };
  initHUD(game);
  initScreens(game);
  game.startRun();
  game.speed = speed;

  const dt = 1 / 30;
  let t = 0;
  let placeTimer = 0;
  let maxLoop = 1;
  let stuck = 0;
  let lastSig = '';
  let lastLoop = 0;
  const history = [];

  while (t < seconds && (game.mode === 'run')) {
    if (game.run.traitChoices) {
      const order = [
        'blade', 'vitality', 'bloodthirst', 'shield', 'swift', 'precision',
        'regrowth', 'agile', 'brutal', 'fortune',
        'boneLord', 'gravePower', 'riposte', 'deadly', 'unyielding', 'shadowStrike', 'plunder', 'soulSiphon', 'shieldWall',
      ];
      const pick = order.find((id) => game.run.traitChoices.some((x) => x.id === id));
      game.chooseTrait(pick || game.run.traitChoices[0].id);
    }
    if (game.run.pendingLoot) {
      const p = game.run.pendingLoot;
      const better = itemScore(p.item) > itemScore(p.current);
      const canStash = game.run.hero.inventory.length < game.run.hero.maxInventory;
      game.resolveLoot(better ? 'equip' : canStash ? 'stash' : 'discard');
    }
    game.update(dt);
    t += dt;
    placeTimer -= dt;

    if (game.run) {
      maxLoop = Math.max(maxLoop, game.run.loop);
      if (game.run.loop !== lastLoop) {
        history.push({
          loop: game.run.loop,
          t: Math.round(t),
          hp: Math.round(game.run.hero.hp),
          maxHp: Math.round(game.run.hero.maxHp),
          lv: game.run.hero.level,
          atk: game.run.hero.atk,
          kills: game.run.kills,
        });
        lastLoop = game.run.loop;
      }
      const sig = `${game.run.hero.cell}:${game.run.kills}:${game.run.loop}`;
      stuck = sig === lastSig ? stuck + dt : 0;
      lastSig = sig;
      if (stuck > 90) throw new Error(`模拟卡住：${sig}（可能战斗无法结束）`);
    }

    if (place && placeTimer <= 0 && game.mode === 'run' && !game.run.traitChoices) {
      placeTimer = 0.9;
      tryPlaceSomewhere(game);
    }
  }

  const r = game.run;
  const summary = {
    note: seedNote,
    class: r ? r.hero.classId : '',
    mode: game.mode,
    chapter: r ? r.chapter : 0,
    layer: r ? r.layer : 0,
    loop: r ? r.loop : maxLoop,
    day: r ? r.day : 0,
    level: r ? r.hero.level : 0,
    kills: r ? r.kills : 0,
    hp: r ? Math.round(r.hero.hp) : 0,
    maxHp: r ? Math.round(r.hero.maxHp) : 0,
    atk: r ? r.hero.atk : 0,
    cards: r ? r.cardsPlayed : 0,
    bossMeter: r ? r.bossMeter : 0,
    bossSpawned: r ? r.bossSpawned : false,
    bossDefeated: r ? r.bossDefeated : false,
    resources: r ? { ...r.resources } : null,
    traits: r ? r.hero.traits.length : 0,
    equipment: r ? Object.values(r.hero.equipment).filter(Boolean).length : 0,
    simSeconds: Math.round(t),
    history,
    metaVictories: game.meta.victories,
    metaResources: game.meta.resources,
  };
  return summary;
}

function runCase(name, opts, check) {
  const s = simulate(opts);
  const { history, ...rest } = s;
  console.log(`\n[${name}]`, JSON.stringify(rest, null, 2));
  if (history.length) console.table(history);
  check(s);
  return s;
}

console.log('开始模拟（真实 Game 循环，DOM 为桩）');

runCase('无铺牌：只走环线', { seconds: 75, place: false }, (s) => {
  assert.equal(s.kills, 0, '没铺牌不应有敌人');
  assert.ok(s.loop >= 2, `应该至少走过两圈，实际 ${s.loop}`);
});

runCase('自动铺牌：打满 8 圈看 Boss', { seconds: 1500, place: true }, (s) => {
  assert.ok(s.kills > 0, `应该击杀敌人，实际 ${s.kills}`);
  assert.ok(s.level >= 1, '应该升级');
  assert.equal(s.bossMeter > 0, true);
});

for (const cid of ['rogue', 'necromancer']) {
  runCase(`职业试跑：${cid}`, { seconds: 900, place: true, classId: cid }, (s) => {
    assert.ok(s.kills > 0, `${cid} 应该能击杀敌人，实际 ${s.kills}`);
    assert.ok(s.mode !== 'run' || s.kills > 0, `${cid} 应正常运行`);
  });
}

for (const ch of [2, 3, 4]) {
  runCase(`第 ${ch} 章`, { seconds: 1200, chapter: ch }, (s) => {
    assert.ok(s.mode !== 'run', `第 ${ch} 章应在 1200 秒内分出胜负`);
  });
}

runCase('无尽回廊', { seconds: 1000, infinite: true }, (s) => {
  assert.ok(s.mode !== 'run' || s.loop >= 1, '无尽模式应能正常结算');
});

// ---------- 章节 / 无尽 的确定性检查 ----------
function makeGame({ chapter = 1, infinite = false } = {}) {
  const g = new Game();
  g.meta = {
    version: 3,
    resources: { wood: 0, stone: 0, soul: 0 },
    buildings: {},
    classId: 'warrior',
    deck: [],
    chapter,
    chapterMax: 4,
    infinite,
    bestLayer: 0,
    bestLoop: 0, runs: 0, victories: 0, createdAt: Date.now(),
  };
  initHUD(g);
  initScreens(g);
  g.startRun();
  return g;
}

{
  const g = makeGame({ chapter: 2 });
  g.run.loop = 15;
  g.run.bossMeter = 100;
  g.maybeSpawnBoss();
  const boss = g.run.enemies.find((e) => e.boss && e.alive);
  assert.ok(boss, '第 2 章应生成首领');
  assert.equal(boss.type, 'priestess');
  console.log('  ✓ 第 2 章首领为女祭司');

  const h = makeGame({ chapter: 4 });
  h.run.loop = 15;
  h.run.bossMeter = 100;
  h.maybeSpawnBoss();
  const omega = h.run.enemies.find((e) => e.boss && e.alive);
  assert.equal(omega.type, 'omega');
  console.log('  ✓ 第 4 章首领为终焉');

  const inf = makeGame({ chapter: 1, infinite: true });
  inf.run.loop = 15;
  inf.run.bossMeter = 100;
  inf.maybeSpawnBoss();
  const b2 = inf.run.enemies.find((e) => e.boss && e.alive);
  assert.ok(b2, '无尽模式应生成首领');
  inf.killEnemy(b2);
  assert.equal(inf.run.layer, 1, '击败首领应推进一层');
  assert.equal(inf.mode, 'run', '无尽模式不结束远征');
  assert.equal(inf.run.bossSpawned, false, '下一层应可再次生成首领');
  console.log('  ✓ 无尽模式层数推进');
}

{
  const g = makeGame();
  const e1 = makeEnemy('bandit', 1, { cell: 6 });
  const e2 = makeEnemy('skeleton', 1, { cell: 6 });
  g.run.enemies.push(e1, e2);
  g.run.loop = 5;
  g.startCombat(e1);
  assert.equal(g.run.group.length, 2, '同格两个敌人应一起进入战斗');
  e1.hp = 1;
  g.heroAttack(e1);
  assert.equal(e1.alive, false);
  assert.equal(g.run.target, e2, '第一个敌人死亡后应切换到第二个');
  assert.equal(g.run.group.length, 1);
  console.log('  ✓ 同格双敌战斗');
}

{
  const g = makeGame();
  g.run.loop = 5;
  const e1 = makeEnemy('bandit', 1, { cell: 6 });
  const e2 = makeEnemy('skeleton', 1, { cell: 6 });
  const e3 = makeEnemy('wolf', 1, { cell: 6 });
  g.run.enemies.push(e1, e2, e3);
  g.startCombat(e1);
  assert.equal(g.run.group.length, 3, '第 4 圈起同格最多 3 敌');
  const xs = g.run.group.map((e) => Math.round(g.enemyPos(e).x));
  assert.equal(new Set(xs).size, 3, '三个敌人应有不同站位');
  console.log('  ✓ 三敌同格');
}

{
  const g = makeGame();
  g.run.loop = 5;
  const boss = makeEnemy('lich', 5, { cell: 6 });
  const extras = [makeEnemy('bandit', 1, { cell: 6 }), makeEnemy('skeleton', 1, { cell: 6 }), makeEnemy('wolf', 1, { cell: 6 })];
  g.run.enemies.push(boss, ...extras);
  g.startCombat(boss);
  assert.equal(g.run.group.length, 4, 'Boss 可临时加入 3 个非 Boss 单位');
  assert.equal(boss.slot, 0, 'Boss 固定 slot 0');
  console.log('  ✓ Boss 入组合法溢出 4 人');
}

{
  const g = makeGame();
  g.run.loop = 8;
  g.run.bossMeter = 100;
  g.maybeSpawnBoss();
  const boss = g.run.enemies.find((e) => e.boss);
  assert.ok(boss?.march?.active, 'Boss 生成后应进入追逐');
  const len = g.run.map.path.length;
  const towerTarget = spawner.nearestEnemy(g.run, (boss.cell - 1 + len) % len, 3);
  assert.notEqual(towerTarget, boss, '塔不应瞄准追逐中的 Boss');
  const cell0 = boss.cell;
  spawner.updateBossMarch(g.run, g.ctx, 1);
  assert.notEqual(boss.cell, cell0, '追逐 Boss 应沿路径移动');
  for (let i = 0; i < 300 && !g.run.target; i++) spawner.updateBossMarch(g.run, g.ctx, 0.2);
  assert.equal(g.run.target, boss, '追上后应进入 Boss 战');
  assert.equal(boss.march.active, false);
  console.log('  ✓ Boss 追逐与拦截');
}

{
  const g = makeGame();
  g.run.loop = 5;
  const e = makeEnemy('slime', 5, { cell: 6 });
  e.hp = 1;
  g.run.enemies.push(e);
  g.startCombat(e);
  g.heroAttack(e);
  const kids = g.run.enemies.filter((x) => x.noSplit);
  assert.equal(kids.length, 2, '史莱姆应分裂成两只幼体');
  assert.equal(e.alive, false);
  console.log('  ✓ 分裂');
}

{
  const g = makeGame();
  g.run.loop = 5;
  const e = makeEnemy('gargoyle', 5, { cell: 6 });
  g.run.enemies.push(e);
  g.startCombat(e);
  for (let i = 0; i < 5; i++) g.damageEnemy(e, 10);
  assert.equal(e.shieldStacks, 3, '硬化最多 3 层');
  console.log('  ✓ 硬化叠层封顶');
}

{
  const g = makeGame();
  g.run.loop = 5;
  const h = g.run.hero;
  h.equipment.weapon = { slot: 'weapon', slotName: '武器', name: '旧剑', rarity: 'common', stats: { atk: 2 } };
  const v = makeEnemy('vampire', 5, { cell: 6 });
  g.run.enemies.push(v);
  g.run.group = [v];
  g.run.target = v;
  const orig = rng.chance;
  const seq = [false, true, false];
  rng.chance = () => (seq.length ? seq.shift() : false);
  combat.enemyAttack(g.run, g.ctx, v);
  rng.chance = orig;
  assert.equal(h.equipment.weapon, null, '吸血鬼应偷走武器');
  assert.ok(v.stolenFrom, '应记录被偷装备');
  g.killEnemy(v);
  assert.ok(h.equipment.weapon, '击杀吸血鬼应归还装备');
  console.log('  ✓ 窃取与归还');
}

{
  const g = makeGame();
  g.run.loop = 5;
  const h = g.run.hero;
  const stolen = { slot: 'weapon', slotName: '武器', name: '旧剑', rarity: 'common', stats: { atk: 2 } };
  h.equipment.weapon = stolen;
  const v = makeEnemy('vampire', 5, { cell: 6 });
  g.run.enemies.push(v);
  g.run.group = [v];
  g.run.target = v;
  const orig = rng.chance;
  const seq = [false, true, false];
  rng.chance = () => (seq.length ? seq.shift() : false);
  combat.enemyAttack(g.run, g.ctx, v);
  rng.chance = orig;
  h.equipment.weapon = { slot: 'weapon', slotName: '武器', name: '新剑', rarity: 'rare', stats: { atk: 5 } };
  g.killEnemy(v);
  assert.equal(g.run.pendingLoot?.item?.name, '旧剑', '槽位被占时应进入夺回对比而不是静默覆盖');
  assert.equal(g.run.pendingLoot?.current?.name, '新剑');
  g.resolveLoot(true);
  assert.equal(h.equipment.weapon.name, '旧剑', '选择换上后应装备夺回物品');
  console.log('  ✓ 夺回装备对比');
}

{
  const g = makeGame();
  const item = { slot: 'weapon', slotName: '武器', name: '备用品', rarity: 'rare', stats: { atk: 4 } };
  g.offerLoot(item);
  assert.ok(g.run.pendingLoot, '拾取面板应接管普通掉落');
  g.resolveLoot('stash');
  assert.equal(g.run.hero.inventory.length, 1, '收进背包应增加库存');
  assert.equal(g.run.hero.inventory[0].name, '备用品');
  console.log('  ✓ 拾取面板与背包');
}

{
  const g = makeGame();
  g.run.loop = 5;
  const ghost = makeEnemy('ghost', 5, { cell: 6 });
  ghost.hp = 1;
  g.run.enemies.push(ghost);
  const orig = rng.chance;
  rng.chance = () => true;
  g.killEnemy(ghost);
  rng.chance = orig;
  assert.equal(ghost.alive, true, '幽灵应复生');
  assert.ok(ghost.hp > 0);
  console.log('  ✓ 复生一次');
}

{
  const g = makeGame();
  g.run.loop = 5;
  const h = g.run.hero;
  const hp0 = h.hp;
  const harpy = makeEnemy('harpy', 5, { cell: 6 });
  combat.triggerEnterAbilities(g.run, g.ctx, harpy);
  assert.ok(h.hp < hp0, '远程敌人应在进格时先手');
  console.log('  ✓ 远程先手');
}

{
  const g = makeGame();
  g.run.loop = 5;
  const h = g.run.hero;
  const spider = makeEnemy('spider', 5, { cell: 6 });
  g.run.enemies.push(spider);
  g.run.group = [spider];
  g.run.target = spider;
  const orig = rng.chance;
  const seq = [false, true, false];
  rng.chance = () => (seq.length ? seq.shift() : false);
  combat.enemyAttack(g.run, g.ctx, spider);
  rng.chance = orig;
  assert.equal(h.status.some((s) => s.kind === 'poison'), true, '蜘蛛命中应附加中毒');
  const hp0 = h.hp;
  combat.tickHeroStatus(g.run, g.ctx, 1);
  assert.ok(h.hp < hp0, '中毒应持续掉血');
  console.log('  ✓ 中毒持续伤害');
}

{
  const g = makeGame();
  g.run.hand = ['rock', 'forest', 'meadow', 'village', 'spiderNest'];
  const before = g.run.discard.length;
  const cell = { card: { id: 'library' }, uses: 0 };
  g.useLibrary({ count: 3, max: 20, cell });
  assert.equal(g.run.hand.length, 5);
  assert.equal(g.run.discard.length, before + 3);
  assert.equal(cell.uses, 3);
  console.log('  ✓ 图书室替换手牌');
}

{
  const g = makeGame();
  g.run.mapMods.revive = true;
  g.run.hero.hp = 1;
  g.die();
  assert.equal(g.mode, 'run', '复活后不应结束远征');
  assert.ok(g.run.hero.hp > 1, '复活应恢复生命');
  assert.equal(g.run.reviveUsed, true);
  console.log('  ✓ 祖先墓穴复活');
}

{
  const g = makeGame();
  const base = g.run.hero.slots.length;
  g.run.mapMods.arsenal = 1;
  g.syncSlots();
  assert.equal(g.run.hero.slots.length, base + 1);
  assert.equal(g.run.hero.slots[g.run.hero.slots.length - 1].id, 'arsenalSlot');
  g.run.mapMods.arsenal = 0;
  g.syncSlots();
  assert.equal(g.run.hero.slots.length, base);
  console.log('  ✓ 军械库额外装备栏');
}

{
  const g = makeGame();
  g.startQuest(1);
  assert.equal(g.run.quest.need, 5);
  for (let i = 0; i < 5; i++) {
    const e = makeEnemy('slime', 1, { cell: 6 });
    g.run.enemies.push(e);
    g.killEnemy(e);
  }
  assert.equal(g.run.quest, null, '任务完成后应清空');
  assert.ok(g.run.resources.soul >= 1, '任务应给魂晶');
  console.log('  ✓ 村庄任务');
}

{
  const g = makeGame();
  g.run.hero.equipment.weapon = { slot: 'weapon', stats: { atk: 2 }, rarity: 'common', name: '旧剑' };
  g.run.hero.equipment.armor = { slot: 'armor', stats: { def: 1 }, rarity: 'common', name: '旧甲' };
  g.useForge();
  assert.ok(g.run.hero.damageReduction >= 0.04, '熔炼应提供减伤');
  assert.equal(Object.values(g.run.hero.equipment).filter(Boolean).length, 1, '应熔掉一件装备');
  console.log('  ✓ 铁匠炉熔炼');
}

// ---------- 平衡回归（S7.4）----------
// 区间为「当前基线 ± 容差」：目的是防止后续改动把平衡调崩，而不是卡死平衡目标。
// 设计目标（M7 校准后收紧）：第 3 章战士胜率 40–75% · 三职业极差 < 25pp
{
  const { runBatch } = await import('../tools/simulate.mjs');
  // 样本量：20 局 / 900 秒，与 docs/balance.md 基线同口径（N=10 时波动过大：战士 ch3 曾在 0–40% 间跳动）
  const N = 20;
  const SECS = 900;
  const mk = (classId, chapter, infinite) => ({ key: `${classId}@${infinite ? 'inf' : chapter}`, classId, chapter, infinite });

  const w3 = runBatch(mk('warrior', 3, false), N, 1000, SECS);
  const r3 = runBatch(mk('rogue', 3, false), N, 2000, SECS);
  const n3 = runBatch(mk('necromancer', 3, false), N, 3000, SECS);
  const inf = runBatch(mk('warrior', 1, true), N, 4000, SECS);

  const rates = { warrior: w3.winRate, rogue: r3.winRate, necro: n3.winRate };
  const spread = Math.max(...Object.values(rates)) - Math.min(...Object.values(rates));
  const infDeathRate = Math.round((inf.outcomes.death / inf.n) * 1000) / 10;

  console.log('\n平衡回归（每组 20 局，900 模拟秒上限，与基线同口径）');
  console.log(`  第 3 章胜率：战士 ${rates.warrior}% / 盗贼 ${rates.rogue}% / 死灵 ${rates.necro}%（极差 ${spread}pp）`);
  console.log(`  无尽死亡率 ${infDeathRate}% · 通过层 P50 ${inf.layersCleared.p50}`);
  console.log('  ✓ 设计目标：战士 40–75%、三职业极差 < 25pp');

  // M7 校准后的设计目标区间
  assert.ok(rates.warrior >= 40 && rates.warrior <= 75,
    `第 3 章战士胜率应落在 40–75%，实际 ${rates.warrior}%`);
  assert.ok(spread <= 25, `三职业胜率极差应 ≤ 25pp，实际 ${spread}pp`);
  assert.ok(infDeathRate < 40, `无尽模式死亡率应 < 40%，实际 ${infDeathRate}%`);
  for (const [name, agg] of [['战士', w3], ['盗贼', r3], ['死灵', n3], ['无尽', inf]]) {
    assert.ok(agg.loop.p50 >= 5, `${name} 中位圈数应 ≥ 5，实际 ${agg.loop.p50}`);
    assert.ok(agg.killsPerLoop > 0, `${name} 应有击杀产出`);
  }
  console.log('  ✓ 平衡回归通过');
}

console.log('\n模拟完成');
