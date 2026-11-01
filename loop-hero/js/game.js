// 游戏编排层：营地 <-> 远征，移动 / 铺牌 / 输入 / 特效
// S0 拆分后本文件只做状态编排与表现；战斗 / 刷怪 / 手牌 / 经济下沉到 js/systems/*
import { rng } from './core/rng.js';
import { BOSS_METER_MAX, BOSS_METER_PER_CARD } from './core/config.js';
import { CARDS, deckFromMeta } from './data/cards.js';
import { TRAITS } from './data/traits.js';
import { classUnlocked } from './data/classes.js';
import { chapterById, chapterUnlocked, INFINITE } from './data/chapters.js';
import { createMap, cellAt, canPlaceReason, placeCard, mapStats } from './world/loopMap.js';
import { createHero, deriveHero, potionHeal } from './world/hero.js';
import { rollEquip, equipIfBetter } from './systems/loot.js';
import { markCard, markCombo } from './systems/codex.js';
import { loadMeta, saveMeta, clearSave } from './systems/save.js';
import { build as campBuild } from './systems/camp.js';
import { toast as hudToast, showHUD, resetHandCache } from './ui/hud.js';
import {
  showCamp, hideCamp, showTraits, showPause, showDeath, showVictory, showLoot, hideOverlay, traitChoices,
} from './ui/screens.js';
import * as combat from './systems/combat.js';
import * as spawner from './systems/spawner.js';
import * as hand from './systems/hand.js';
import * as economy from './systems/economy.js';
import * as board from './systems/board.js';
import * as tiles from './systems/tiles.js';
import * as fx from './systems/fx.js';
import {
  pathPoint as geomPathPoint, heroPos as geomHeroPos,
  cellCenter as geomCellCenter, enemyPos as geomEnemyPos,
} from './systems/geom.js';

const toast = hudToast;

// 逻辑模块与 Game 之间的通道：emit 管表现，ctrl 管游戏流程（内部可改 mode / paused）
function createContext(game) {
  const ctx = {
    rng,
    emit: {
      toast: (message, tone = '') => hudToast(message, tone),
      floatAt: (x, y, text, color, size = 13) => game.floatAt(x, y, text, color, size),
      burst: (pos, n, color) => game.burst(pos, n, color),
      flash: (v) => { game.flash = v; },
      flashMax: (v) => { game.flash = Math.max(game.flash, v); },
      shake: (v) => { game.shake = v; },
      shakeMax: (v) => { game.shake = Math.max(game.shake, v); },
    },
    ctrl: {
      die: () => game.die(),
      victory: () => game.victory(),
      clearLayer: () => game.clearLayer(),
      openTraits: () => game.openTraits(),
      openLoot: (payload) => game.openLoot(payload),
      offerLoot: (item, opts) => game.offerLoot(item, opts),
      saveMeta: () => saveMeta(game.meta),
    },
    isOver: () => game.mode !== 'run',
  };
  Object.defineProperty(ctx, 'meta', { get: () => game.meta });
  return ctx;
}

export class Game {
  constructor() {
    this.meta = loadMeta();
    this.mode = 'camp';       // camp | run | dead | victory
    this.run = null;
    this.speed = 1;
    this.paused = false;
    this.selectedCard = null;
    this.hoverCell = null;
    this.shake = 0;
    this.time = 0;
    this.flash = 0;
    this.mapRev = 0;
    this.ctx = createContext(this);
  }

  // ---------- 营地 ----------

  toast(message, tone = '') {
    hudToast(message, tone);
  }

  build(id) {
    const res = campBuild(this.meta, id);
    if (res.ok) saveMeta(this.meta);
    return res;
  }

  activeClass() {
    const id = this.meta.classId;
    return classUnlocked(this.meta, id) ? id : 'warrior';
  }

  setClass(id) {
    if (!classUnlocked(this.meta, id)) return false;
    this.meta.classId = id;
    saveMeta(this.meta);
    return true;
  }

  setDeck(deck) {
    this.meta.deck = deck.slice(0, 30);
    saveMeta(this.meta);
  }

  activeChapter() {
    if (this.meta.infinite && chapterUnlocked(this.meta, 'inf')) return INFINITE;
    return chapterById(this.meta.chapter);
  }

  setChapter(id) {
    if (id === 'inf') {
      if (!chapterUnlocked(this.meta, 'inf')) return false;
      this.meta.infinite = true;
    } else {
      if (!chapterUnlocked(this.meta, id)) return false;
      this.meta.infinite = false;
      this.meta.chapter = Number(id);
    }
    saveMeta(this.meta);
    return true;
  }

  resetSave() {
    clearSave();
    this.meta = loadMeta();
    toast('存档已清除', 'warn');
  }

  // ---------- 远征 ----------

  startRun() {
    const chapter = this.activeChapter();
    const map = createMap();
    const hero = createHero(this.meta, this.activeClass(), { starter: true });
    const deck = rng.shuffle(deckFromMeta(this.meta));
    deck.forEach((id) => markCard(this.meta, id));

    const run = {
      map, hero,
      chapter: chapter.id, chapterName: chapter.name,
      bossType: chapter.boss, bossName: chapter.bossName, bossLoop: chapter.bossLoop,
      enemyMul: chapter.enemyMul, infinite: chapter.id === 'inf', layer: 0,
      loop: 1, day: 1, time: 0, kills: 0,
      hand: [], deck, discard: [],
      enemies: [], target: null, group: [],
      bossMeter: 0, bossSpawned: false, bossDefeated: false,
      pendingLevels: 0, traitChoices: null,
      resources: { wood: 0, stone: 0, soul: 0, metal: 0, shard: 0, tome: 0 },
      lootBag: 0,
      mapMods: null, towers: [], slowCells: new Set(),
      particles: [], floats: [],
      drawProgress: 0, dmgDealt: 0, dmgTaken: 0, cardsPlayed: 0,
      hasLeftCamp: false, reviveUsed: false, quest: null,
      startedAt: Date.now(),
    };

    this.run = run;
    this.mode = 'run';
    this.paused = false;
    this.speed = 1;
    this.selectedCard = null;
    this.hoverCell = null;
    this.shake = 0;
    this.flash = 0;
    resetHandCache();

    run.mapMods = mapStats(map);
    this.syncSlots();
    deriveHero(hero, run.mapMods, this.meta);
    hero.hp = hero.maxHp;

    this.fillHand(true);
    spawner.spawnLoopEnemies(run, this.ctx);

    hideCamp();
    hideOverlay();
    showHUD(true);
    toast(`${chapter.name}：把卡牌铺在道路旁或野地里`, 'good');
  }

  returnToCamp() {
    const run = this.run;
    if (run) this.bankResources(run);
    this.run = null;
    this.mode = 'camp';
    this.paused = false;
    this.selectedCard = null;
    showHUD(false);
    hideOverlay();
    showCamp(this);
  }

  retreat(force = false) {
    if (this.mode !== 'run') return;
    if (!force && !confirm('撤退会结束本次远征，但带回所有资源。确定撤退？')) return;
    toast('你带着战利品撤回了营地');
    this.returnToCamp();
  }

  bankResources(run) {
    economy.bankResources(run, this.ctx);
  }

  // ---------- 输入 ----------

  cycleSpeed() {
    this.speed = this.speed === 1 ? 2 : this.speed === 2 ? 3 : 1;
  }

  togglePause() {
    if (this.mode !== 'run' || this.run.traitChoices) return;
    this.paused = !this.paused;
    if (this.paused) showPause(this);
    else hideOverlay();
  }

  drinkPotion() {
    if (this.mode !== 'run' || this.paused || this.run.traitChoices) return;
    const h = this.run.hero;
    if (potionHeal(h)) {
      toast(`饮下药水，回复 ${Math.round(h.potionPower * 100)}% 生命`, 'good');
      this.burst(this.heroPos(), 10, '#7fd1a3');
      this.floatAt(this.heroPos().x, this.heroPos().y - 20, `+${Math.round(h.potionPower * 100)}%`, '#7fd1a3', 15);
    } else {
      toast('药水已经喝完了', 'warn');
    }
  }

  selectCard(i) {
    if (this.mode !== 'run' || this.run.traitChoices) return;
    if (i < 0 || i >= this.run.hand.length) return;
    this.selectedCard = this.selectedCard === i ? null : i;
  }

  discardCard(i) {
    if (this.mode !== 'run' || this.paused || this.run.traitChoices) return;
    if (!hand.discardCard(this.run, this.ctx, i)) return;
    this.selectedCard = null;
  }

  cancelSelection() {
    this.selectedCard = null;
    this.hoverCell = null;
  }

  cellInfo(x, y) {
    return board.cellInfo(this.run, x, y);
  }

  placementHint(cardId) {
    return board.placementHint(cardId);
  }

  placementSummary() {
    const run = this.run;
    if (!run || this.selectedCard == null) return null;
    return board.placementSummary(run, run.hand[this.selectedCard]);
  }

  placementCheck(x, y) {
    const run = this.run;
    if (!run || this.selectedCard == null) return null;
    return board.placementCheck(run, x, y, run.hand[this.selectedCard]);
  }

  tryPlace(x, y) {
    if (this.mode !== 'run' || this.paused || this.run.traitChoices) return false;
    const run = this.run;
    if (this.selectedCard == null) return false;
    const cardId = run.hand[this.selectedCard];
    const c = cellAt(run.map, x, y);
    const reason = canPlaceReason(run.map, c, cardId);
    if (!cardId || reason) {
      toast(reason || '这里不能放置这张牌', 'warn');
      return false;
    }

    // 遗忘皆空：销毁一块已放置的地形
    if (cardId === 'forget') {
      const removed = c.card;
      c.card = null;
      this.mapRev += 1;
      run.hand.splice(this.selectedCard, 1);
      run.discard.push(cardId);
      run.cardsPlayed += 1;
      run.towers = run.towers.filter((t) => t.x !== c.x || t.y !== c.y);
      run.mapMods = mapStats(run.map);
      this.syncSlots();
      deriveHero(run.hero, run.mapMods, this.meta);
      this.selectedCard = null;
      this.hoverCell = null;
      toast(`遗忘了 ${CARDS[removed.variant || removed.id].name}`, 'warn');
      this.burst(this.cellCenter(c), 12, '#b9a8d6');
      return true;
    }

    const res = placeCard(run.map, c, cardId);
    markCard(this.meta, cardId);
    if (res.formed) {
      markCombo(this.meta, res.formed.key);
      markCard(this.meta, res.formed.into);
    }
    if (res.crossed) {
      markCombo(this.meta, res.crossed.key);
      markCard(this.meta, res.crossed.into);
    }
    this.mapRev += 1;
    run.hand.splice(this.selectedCard, 1);
    run.discard.push(cardId);
    run.cardsPlayed += 1;
    run.bossMeter = Math.min(BOSS_METER_MAX, run.bossMeter + BOSS_METER_PER_CARD);
    run.mapMods = mapStats(run.map);
    this.syncSlots();
    deriveHero(run.hero, run.mapMods, this.meta);
    if (res.slowCell >= 0) run.slowCells.add(res.slowCell);
    if (res.tower) run.towers.push({ ...res.tower, timer: rng.float(0, 1) });

    this.selectedCard = null;
    this.hoverCell = null;
    this.burst(this.cellCenter(c), 8, CARDS[cardId].color);

    if (res.formed) {
      toast(`地形转化：${CARDS[res.formed.into].name}（${res.formed.count} 格连成）`, 'good');
      this.burst(this.cellCenter(c), 18, CARDS[res.formed.into].color);
    }
    if (res.crossed) {
      toast(`地形联动：${CARDS[res.crossed.into].name}`, 'good');
      this.burst(this.cellCenter(c), 14, CARDS[res.crossed.into].color);
    }
    if (res.spawner) {
      toast(`这里出现了 ${CARDS[cardId].name} 的猎物气味，下一圈会有东西被吸引来…`, 'warn');
    }

    this.maybeSpawnBoss();
    return true;
  }

  // ---------- 更新 ----------

  update(dtRaw) {
    if (this.mode !== 'run' || this.paused) return;
    const run = this.run;
    if (!run) return;
    const dt = Math.min(0.05, dtRaw) * this.speed;
    this.time += dt;
    run.time += dt;
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 2.2);

    const h = run.hero;
    h.hurtFlash = Math.max(0, h.hurtFlash - dt * 3);
    h.attackAnim = Math.max(0, (h.attackAnim || 0) - dt);
    h.invuln = Math.max(0, (h.invuln || 0) - dt);

    if (run.traitChoices) return;

    if (h.regen < 0) {
      h.hp += h.regen * dt;
      if (h.hp <= 0) { this.die(); return; }
    }

    h.regenAcc += h.regen * dt;
    if (h.regenAcc >= 1) {
      const heal = Math.floor(h.regenAcc);
      h.regenAcc -= heal;
      h.hp = Math.min(h.maxHp, h.hp + heal);
    }

    combat.tickHeroStatus(run, this.ctx, dt);
    if (this.mode !== 'run') return;

    spawner.updateBossMarch(run, this.ctx, dt);
    if (this.mode !== 'run') return;

    spawner.updateTowers(run, this.ctx, dt);
    if (this.mode !== 'run') return;

    if (run.target && run.target.alive) {
      combat.updateCombat(run, this.ctx, dt);
    } else {
      run.target = null;
      run.group = [];
      this.updateMovement(dt);
    }

    this.updateEffects(dt);
    run.enemies = run.enemies.filter((e) => e.alive || e === run.target);
  }

  updateMovement(dt) {
    const run = this.run;
    const h = run.hero;
    const len = run.map.path.length;
    const slow = run.slowCells.has(h.cell) ? 0.45 : 0;
    const speed = h.speed * (1 - slow);

    h.pos += speed * dt;
    if (h.pos >= len) h.pos -= len;

    const newCell = Math.floor(h.pos) % len;
    if (newCell !== h.cell) {
      let c = h.cell;
      let guard = 0;
      do {
        c = (c + 1) % len;
        this.onEnterCell(c);
        guard += 1;
        if (this.mode !== 'run' || run.target) break;
      } while (c !== newCell && guard < 8);
    }
  }

  onEnterCell(cell) {
    const run = this.run;
    const h = run.hero;
    h.cell = cell;

    if (cell !== 0) run.hasLeftCamp = true;

    // 经过治疗地形
    for (const p of run.mapMods.healPass) {
      if (p.pathIndex !== cell) continue;
      const heal = h.maxHp * p.frac;
      if (h.hp < h.maxHp) {
        h.hp = Math.min(h.maxHp, h.hp + heal);
        this.floatAt(this.heroPos().x, this.heroPos().y - 24, `+${Math.round(heal)}`, '#8fd6a0', 14);
      }
    }

    // 经过时获得药水 / 资源
    for (const idx of run.mapMods.potionPass) {
      if (idx !== cell) continue;
      if (h.potions < h.maxPotions) {
        h.potions += 1;
        this.floatAt(this.heroPos().x, this.heroPos().y - 34, '+1 药水', '#7fd1a3', 12);
      }
    }
    for (const rp of run.mapMods.resourcePass) {
      if (rp.pathIndex !== cell) continue;
      const k = rng.pick(['wood', 'stone', 'soul']);
      run.resources[k] += rp.amount;
      this.floatAt(this.heroPos().x, this.heroPos().y - 40, `+${rp.amount} ${economy.resName(k)}`, '#c9b77a', 12);
    }

    for (const lp of run.mapMods.libraryPass) {
      if (lp.pathIndex !== cell) continue;
      this.useLibrary(lp);
      break;
    }

    for (const qp of run.mapMods.questPass) {
      if (qp.pathIndex !== cell) continue;
      this.startQuest(qp.tier);
      break;
    }

    if (run.mapMods.forgePass.includes(cell)) this.useForge();

    // 回到营火 = 结束一圈
    if (cell === 0 && run.hasLeftCamp) {
      run.hasLeftCamp = false;
      this.endLoop();
      if (this.mode !== 'run') return;
    }

    const enemy = run.enemies.find((e) => e.alive && e.cell === cell);
    if (enemy && !run.target) {
      combat.triggerEnterAbilities(run, this.ctx, enemy);
      if (this.mode !== 'run') return;
      this.startCombat(enemy);
    }
  }

  syncSlots() {
    const run = this.run;
    if (!run) return;
    const h = run.hero;
    const want = (run.mapMods.arsenal || 0) > 0;
    const has = h.slots.some((s) => s.id === 'arsenalSlot');
    if (want && !has) {
      h.slots.push({ id: 'arsenalSlot', label: '械', kind: 'amulet' });
      h.slotIds = h.slots.map((s) => s.id);
      h.equipment.arsenalSlot = null;
    } else if (!want && has) {
      h.slots = h.slots.filter((s) => s.id !== 'arsenalSlot');
      h.slotIds = h.slots.map((s) => s.id);
      delete h.equipment.arsenalSlot;
    }
  }

  useForge() {
    tiles.useForge(this.run, this.ctx);
  }

  startQuest(tier) {
    tiles.startQuest(this.run, this.ctx, tier);
  }

  useLibrary(lp) {
    const run = this.run;
    if (!run.hand.length) return;
    const n = Math.min(lp.count, run.hand.length);
    for (let i = 0; i < n; i++) {
      const idx = rng.int(0, run.hand.length - 1);
      run.discard.push(run.hand.splice(idx, 1)[0]);
    }
    this.drawCards(n);
    const prevUses = lp.cell.uses || 0;
    lp.cell.uses = prevUses + n;
    if (Math.floor(lp.cell.uses / 5) > Math.floor(prevUses / 5)) {
      run.resources.shard = (run.resources.shard || 0) + 1;
      toast('图书室：获得 1 记忆碎片', 'good');
    }
    this.floatAt(this.heroPos().x, this.heroPos().y - 42, `换牌 ${n}`, '#b8a8d6', 12);
    toast(`图书室：替换了 ${n} 张手牌`, 'good');
    if (lp.cell.uses >= lp.max) {
      lp.cell.card = null;
      this.mapRev += 1;
      run.mapMods = mapStats(run.map);
      this.syncSlots();
      deriveHero(run.hero, run.mapMods, this.meta);
      toast('图书室倒塌了', 'warn');
    }
  }

  endLoop() {
    const run = this.run;
    const h = run.hero;
    run.loop += 1;
    run.day += 1;

    const campfire = (this.meta.buildings.campfire || 0) * 0.1;
    const heal = h.maxHp * (0.22 + campfire);
    h.hp = Math.min(h.maxHp, h.hp + heal);
    if (h.classId === 'necromancer') {
      for (const sk of h.skeletons) sk.hp = Math.min(sk.maxHp, sk.hp + sk.maxHp * 0.5);
    }
    this.floatAt(this.heroPos().x, this.heroPos().y - 26, `+${Math.round(heal)}`, '#8fd6a0', 15);

    hand.fillHand(run, this.ctx);
    spawner.spawnLoopEnemies(run, this.ctx);
    this.maybeSpawnBoss();

    // 战场：新一圈的宝箱
    let chestOpened = false;
    for (const row of run.map.grid) {
      if (chestOpened) break;
      for (const c of row) {
        if (!c.card) continue;
        if ((c.card.variant || c.card.id) !== 'battlefield') continue;
        if (!rng.chance(0.5)) continue;
        const item = rollEquip(run.loop, h.lootBonus + 0.1, rng.pick(h.slotIds));
        this.offerLoot(item);
        toast(`战场宝箱：${item.name}`, 'good');
        chestOpened = true;
        break;
      }
    }

    if (run.lootBag > 0) {
      const gains = {};
      for (let i = 0; i < run.lootBag; i++) {
        const k = rng.pick(['wood', 'stone', 'soul', 'metal']);
        const amt = rng.int(1, 3);
        run.resources[k] = (run.resources[k] || 0) + amt;
        gains[k] = (gains[k] || 0) + amt;
      }
      const text = Object.entries(gains).map(([k, v]) => `${economy.resName(k)} ${v}`).join(' · ');
      toast(`战利品包：${text}`, 'good');
      run.lootBag = 0;
    }

    toast(`第 ${run.loop} 圈 · 第 ${run.day} 天`, '');
  }

  // ---------- 逻辑模块门面（UI / 渲染 / 测试通过它们调用）----------

  handMax() { return hand.handMax(this.ctx); }

  drawCards(n) { hand.drawCards(this.run, this.ctx, n); }

  fillHand(all = false) { hand.fillHand(this.run, this.ctx, all); }

  spawnLoopEnemies() { spawner.spawnLoopEnemies(this.run, this.ctx); }

  maybeSpawnBoss() { spawner.maybeSpawnBoss(this.run, this.ctx); }

  nearestEnemy(fromIndex, maxAhead = 22) { return spawner.nearestEnemy(this.run, fromIndex, maxAhead); }

  updateTowers(dt) { spawner.updateTowers(this.run, this.ctx, dt); }

  startCombat(enemy) { combat.startCombat(this.run, this.ctx, enemy); }

  updateCombat(dt) { combat.updateCombat(this.run, this.ctx, dt); }

  killEnemy(e) { combat.killEnemy(this.run, this.ctx, e); }

  heroAttack(e) { combat.heroAttack(this.run, this.ctx, e); }

  damageEnemy(e, dmg, kind = 'hit') { combat.damageEnemy(this.run, this.ctx, e, dmg, kind); }

  // ---------- Boss / 结算 ----------

  clearLayer() {
    const run = this.run;
    const h = run.hero;
    run.layer = (run.layer || 0) + 1;
    this.meta.bestLayer = Math.max(this.meta.bestLayer || 0, run.layer);
    run.bossSpawned = false;
    run.bossMeter = 0;
    run.bossDefeated = false;
    const heal = Math.round(h.maxHp * 0.3);
    h.hp = Math.min(h.maxHp, h.hp + heal);
    run.resources.soul += 2 + Math.floor(run.layer / 2);
    saveMeta(this.meta);
    this.flash = 1;
    toast(`第 ${run.layer} 层通过，终焉会再次归来`, 'good');
  }

  victory() {
    const run = this.run;
    run.bossDefeated = true;
    const num = Number(run.chapter);
    if (num >= 1 && num <= 4) {
      if (num === this.meta.chapterMax && num < 4) this.meta.chapterMax = num + 1;
      if (num === 4) this.meta.chapterMax = 4;
    }
    this.bankResources(run);
    this.meta.victories += 1;
    this.meta.resources.soul += 6;
    this.meta.resources.stone += 4;
    this.meta.resources.wood += 4;
    saveMeta(this.meta);
    this.mode = 'victory';
    this.selectedCard = null;
    this.paused = true;
    this.flash = 1;
    showVictory(this);
  }

  die() {
    const run = this.run;
    if (run.mapMods.revive && !run.reviveUsed) {
      run.reviveUsed = true;
      const h = run.hero;
      h.hp = Math.round(h.maxHp * 0.6);
      h.invuln = 2.5;
      this.floatAt(this.heroPos().x, this.heroPos().y - 30, '复活', '#a98bd0', 18);
      this.burst(this.heroPos(), 18, '#a98bd0');
      toast('祖先墓穴让你重新站了起来', 'good');
      return;
    }
    run.hero.hp = 0;
    this.mode = 'dead';
    this.paused = true;
    this.selectedCard = null;
    if (run.infinite) this.meta.bestLayer = Math.max(this.meta.bestLayer || 0, run.layer || 0);
    this.bankResources(run);
    this.shake = 16;
    showDeath(this);
  }

  // ---------- 天赋 ----------

  openTraits() {
    const run = this.run;
    if (run.pendingLevels <= 0) return;
    run.traitChoices = traitChoices(rng, run.hero);
    this.paused = true;
    showTraits(this, run.traitChoices);
  }

  chooseTrait(id) {
    const run = this.run;
    if (!run || !run.traitChoices) return;
    const trait = TRAITS.find((t) => t.id === id);
    if (!trait || !run.traitChoices.some((t) => t.id === id)) return;
    trait.apply(run.hero);
    run.hero.traits.push(id);
    deriveHero(run.hero, run.mapMods, this.meta);
    run.pendingLevels -= 1;
    run.traitChoices = null;
    this.paused = false;
    hideOverlay();
    toast(`获得天赋：${trait.name}`, 'good');
    if (run.pendingLevels > 0) this.openTraits();
  }

  offerLoot(item, { force = false } = {}) {
    const run = this.run;
    if (!item || !run) return;
    const h = run.hero;
    if (!force && this.meta.autoEquip) {
      const res = equipIfBetter(h, item);
      deriveHero(h, run.mapMods, this.meta);
      if (res.equipped) toast(`装备：${item.name}`, 'good');
      return;
    }
    run.lootQueue = run.lootQueue || [];
    run.lootQueue.push(item);
    if (!run.pendingLoot) this.nextLoot();
  }

  nextLoot() {
    const run = this.run;
    if (!run || run.pendingLoot) return;
    const item = run.lootQueue?.shift();
    if (!item) {
      this.paused = false;
      if (run.pendingLevels > 0) this.openTraits();
      return;
    }
    const slot = item.slot;
    const current = run.hero.equipment[slot] || null;
    run.pendingLoot = { item, current, slot };
    this.paused = true;
    showLoot(this, run.pendingLoot);
  }

  openLoot(payload) {
    if (!this.run) return;
    this.run.pendingLoot = payload;
    this.paused = true;
    showLoot(this, payload);
  }

  resolveLoot(action) {
    const run = this.run;
    const p = run?.pendingLoot;
    if (!p) return;
    if (typeof action === 'boolean') action = action ? 'equip' : 'discard';
    const h = run.hero;
    run.pendingLoot = null;

    if (action === 'equip') {
      if (p.current) {
        if (h.inventory.length < h.maxInventory) h.inventory.push(p.current);
        else toast(`背包已满，${p.current.name}被丢弃`, 'warn');
      }
      h.equipment[p.slot] = p.item;
      deriveHero(h, run.mapMods, this.meta);
      toast(`换上${p.item.name}`, 'good');
    } else if (action === 'stash') {
      if (h.inventory.length < h.maxInventory) {
        h.inventory.push(p.item);
        toast(`收进背包：${p.item.name}`, 'good');
      } else {
        toast('背包已满（12）', 'warn');
        run.pendingLoot = p;
        return;
      }
    } else {
      toast(`丢弃${p.item.name}`, '');
    }

    hideOverlay();
    if (run.lootQueue?.length) {
      this.nextLoot();
    } else {
      this.paused = false;
      if (run.pendingLevels > 0) this.openTraits();
    }
  }

  toggleAutoEquip() {
    this.meta.autoEquip = !this.meta.autoEquip;
    saveMeta(this.meta);
    showPause(this);
  }

  equipFromInventory(index) {
    const run = this.run;
    const h = run?.hero;
    const item = h?.inventory[index];
    if (!item) return;
    h.inventory.splice(index, 1);
    const old = h.equipment[item.slot];
    h.equipment[item.slot] = item;
    if (old) h.inventory.push(old);
    deriveHero(h, run.mapMods, this.meta);
    showPause(this);
  }

  discardInventory(index) {
    const run = this.run;
    const h = run?.hero;
    if (!h?.inventory[index]) return;
    const [item] = h.inventory.splice(index, 1);
    toast(`丢弃${item.name}`, '');
    showPause(this);
  }

  // ---------- 坐标与特效 ----------

  pathPoint(pos) { return geomPathPoint(this.run.map, pos); }

  heroPos() { return geomHeroPos(this.run); }

  cellCenter(c) { return geomCellCenter(c); }

  enemyPos(e) { return geomEnemyPos(this.run, e); }

  floatAt(x, y, text, color, size = 13) {
    fx.floatAt(this.run, x, y, text, color, size);
  }

  burst(pos, n, color) {
    fx.burst(this.run, pos, n, color);
  }

  updateEffects(dt) {
    fx.updateEffects(this.run, dt);
  }
}
