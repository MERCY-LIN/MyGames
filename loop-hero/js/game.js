// 游戏主循环：营地 <-> 远征，移动/战斗/铺牌/Boss
import {
  CELL, OFFSET_Y, BOSS_LOOP, BOSS_METER_MAX, BOSS_METER_PER_CARD, HAND_BASE,
} from './core/config.js';
import { rng } from './core/rng.js';
import { CARDS, deckFromMeta } from './data/cards.js';
import { makeEnemy } from './data/enemies.js';
import { TRAITS } from './data/traits.js';
import { classUnlocked, CLASSES } from './data/classes.js';
import { chapterById, chapterUnlocked, INFINITE } from './data/chapters.js';
import { createMap, cellAt, canPlace, canPlaceReason, placeCard, mapStats, adjacentPath } from './world/loopMap.js';
import { createHero, deriveHero, gainXp, potionHeal, ensureSkeletons } from './world/hero.js';
import { rollEquip, equipIfBetter, rollResources, itemScore } from './systems/loot.js';
import { markCard, markCombo, markEnemy } from './systems/codex.js';
import { loadMeta, saveMeta, clearSave } from './systems/save.js';
import { build as campBuild } from './systems/camp.js';
import { toast as hudToast, showHUD, resetHandCache } from './ui/hud.js';
import {
  showCamp, hideCamp, showTraits, showPause, showDeath, showVictory, hideOverlay, traitChoices,
} from './ui/screens.js';

const toast = hudToast;

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
      resources: { wood: 0, stone: 0, soul: 0 },
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
    this.spawnLoopEnemies();

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
    if (run.banked) return;
    run.banked = true;

    // 远征结算奖励：走得越远，带回的补给越多（原地撤退不刷资源）
    if (run.loop >= 2 || run.kills > 0) {
      run.resources.wood += 3 + Math.floor(run.loop * 0.8);
      run.resources.stone += 2 + Math.floor(run.loop * 0.5);
      if (run.loop >= 5) run.resources.soul += 1;
    }

    for (const k of Object.keys(run.resources)) {
      this.meta.resources[k] = (this.meta.resources[k] || 0) + run.resources[k];
    }
    this.meta.runs += 1;
    this.meta.bestLoop = Math.max(this.meta.bestLoop, run.loop);
    saveMeta(this.meta);
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
    const run = this.run;
    const id = run.hand[i];
    if (!id) return;
    run.hand.splice(i, 1);
    run.discard.push(id);
    this.selectedCard = null;
    toast(`弃掉了 ${CARDS[id].name}`);
  }

  cancelSelection() {
    this.selectedCard = null;
    this.hoverCell = null;
  }

  cellInfo(x, y) {
    const run = this.run;
    if (!run) return null;
    const c = cellAt(run.map, x, y);
    if (!c) return null;

    if (c.card) {
      const def = CARDS[c.card.variant || c.card.id];
      if (!def) return null;
      const kind = def.kind === 'roadside' ? '路边地形' : def.kind === 'special' ? '特殊' : '野地地形';
      return { name: def.name, kind, desc: def.desc };
    }

    const idx = run.map.pathIndex.get(`${x},${y}`);
    if (idx === undefined) return null;

    let enemy = null;
    if (run.target && run.target.cell === idx && run.target.alive) enemy = run.target;
    else enemy = run.enemies.find((e) => e.alive && e.cell === idx);

    if (enemy) {
      return {
        name: enemy.name,
        kind: enemy.boss ? '首领' : '敌人',
        desc: `生命 ${Math.ceil(enemy.hp)} / ${enemy.maxHp} · 攻击 ${enemy.atk} · 攻速 ${enemy.speed}${enemy.elite ? ' · 精英' : ''}`,
      };
    }

    if (run.hero.cell === idx) {
      const h = run.hero;
      return {
        name: CLASSES[h.classId]?.name || '英雄',
        kind: '英雄',
        desc: `生命 ${Math.ceil(h.hp)} / ${Math.round(h.maxHp)} · 攻击 ${h.atk} · 防御 ${h.def}`,
      };
    }
    return null;
  }

  placementHint(cardId) {
    const def = CARDS[cardId];
    if (!def) return '';
    if (cardId === 'forget') return '需要一块已放置的地形';
    if (cardId === 'wheat') return '需要紧挨着村庄';
    if (cardId === 'bloodGrove') return '需要紧挨着森林';
    if (def.kind === 'roadside') return '只能放在道路旁的空位';
    if (def.kind === 'landscape') return '可放在环线四周的野地';
    return '特殊卡牌不能在探索中放置';
  }

  placementSummary() {
    const run = this.run;
    if (!run || this.selectedCard == null) return null;
    const cardId = run.hand[this.selectedCard];
    const def = CARDS[cardId];
    if (!def) return null;
    let valid = 0;
    for (const row of run.map.grid) {
      for (const cell of row) if (canPlace(run.map, cell, cardId)) valid += 1;
    }
    return { name: def.name, valid, hint: this.placementHint(cardId) };
  }

  placementCheck(x, y) {
    const run = this.run;
    if (!run || this.selectedCard == null) return null;
    const cardId = run.hand[this.selectedCard];
    const def = CARDS[cardId];
    if (!def) return null;
    const reason = canPlaceReason(run.map, cellAt(run.map, x, y), cardId);
    return { name: def.name, ok: !reason, reason: reason || '点击放下这张牌' };
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

    this.updateTowers(dt);
    if (this.mode !== 'run') return;

    if (run.target && run.target.alive) {
      this.updateCombat(dt);
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
      this.floatAt(this.heroPos().x, this.heroPos().y - 40, `+${rp.amount} ${resName(k)}`, '#c9b77a', 12);
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
    if (enemy && !run.target) this.startCombat(enemy);
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
    const run = this.run;
    const h = run.hero;
    const items = Object.entries(h.equipment).filter(([, it]) => it);
    if (items.length < 2) return;
    items.sort((a, b) => itemScore(a[1]) - itemScore(b[1]));
    const [slot, item] = items[0];
    h.equipment[slot] = null;
    h.damageReduction = Math.min(0.12, (h.damageReduction || 0) + 0.04);
    deriveHero(h, run.mapMods, this.meta);
    toast(`铁匠炉熔掉了 ${item.name}，减伤 +4%`, 'good');
    this.floatAt(this.heroPos().x, this.heroPos().y - 44, '+4% 减伤', '#d8b25a', 12);
  }

  startQuest(tier) {
    const run = this.run;
    if (run.quest) return;
    const need = tier === 2 ? 8 : 5;
    run.quest = { tier, need, have: 0 };
    toast(`${tier === 2 ? '伯爵任务' : '村庄任务'}：击杀 ${need} 个敌人`, 'good');
  }

  completeQuest() {
    const run = this.run;
    const h = run.hero;
    const q = run.quest;
    if (!q) return;
    run.quest = null;
    const item = rollEquip(run.loop, h.lootBonus + 0.2, rng.pick(h.slotIds));
    equipIfBetter(h, item);
    deriveHero(h, run.mapMods, this.meta);
    run.resources.soul += q.tier === 2 ? 3 : 1;
    run.resources.stone += q.tier === 2 ? 4 : 2;
    toast(`任务完成：${item.name}`, 'good');
    this.burst(this.heroPos(), 12, '#d8b25a');
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
    lp.cell.uses = (lp.cell.uses || 0) + n;
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

    this.fillHand();
    this.spawnLoopEnemies();
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
        equipIfBetter(h, item);
        deriveHero(h, run.mapMods, this.meta);
        toast(`战场宝箱：${item.name}`, 'good');
        chestOpened = true;
        break;
      }
    }

    toast(`第 ${run.loop} 圈 · 第 ${run.day} 天`, '');
  }

  spawnLoopEnemies() {
    const run = this.run;
    const loop = run.loop;
    let alive = run.enemies.filter((e) => e.alive).length;
    const cap = Math.max(2, 2 + loop - (run.mapMods.enemyCapReduce || 0));
    const ramp = Math.min(1, (loop - 1) / 6);
    const mul = 1 + ((run.enemyMul || 1) - 1) * ramp;
    for (const row of run.map.grid) {
      for (const c of row) {
        if (!c.card) continue;
        const def = CARDS[c.card.variant || c.card.id];
        if (!def || (!def.spawn && !def.randomElite)) continue;
        if (alive >= cap) return;
        const spawnKey = `${c.x},${c.y}`;
        if (run.enemies.some((e) => e.alive && e.spawnKey === spawnKey)) continue;
        if (!rng.chance(0.7)) continue;
        let type = def.spawn;
        let elite = rng.chance(0.03 + loop * 0.009);
        if (def.randomElite) {
          if (!rng.chance(0.55)) continue;
          type = rng.pick(['bandit', 'vampire', 'ghoul', 'mimic']);
          elite = true;
        }
        const enemy = makeEnemy(type, loop, { elite, cell: this.adjPath(c), mul });
        markEnemy(this.meta, type);
        if (run.mapMods.zeroBeacon != null) {
          const len = run.map.path.length;
          const raw = Math.abs(enemy.cell - run.mapMods.zeroBeacon);
          const dist = Math.min(raw, len - raw);
          const factor = 0.7 + 0.6 * (dist / len);
          enemy.hp = Math.round(enemy.hp * factor);
          enemy.maxHp = enemy.hp;
          enemy.atk = Math.max(1, Math.round(enemy.atk * factor));
        }
        enemy.spawnKey = spawnKey;
        run.enemies.push(enemy);
        alive += 1;
      }
    }
  }

  adjPath(c) {
    return adjacentPath(this.run.map, c);
  }

  // ---------- 战斗 ----------

  startCombat(enemy) {
    const run = this.run;
    const group = enemy.boss
      ? [enemy]
      : run.enemies.filter((e) => e.alive && e.cell === enemy.cell).slice(0, run.loop >= 4 ? 2 : 1);
    group.forEach((e, i) => {
      e.slot = i;
      e.atkTimer = Math.max(e.atkTimer, 0.5 + i * 0.2);
    });
    run.group = group;
    run.target = group[0];
    run.hero.atkTimer = 0.15;
    if (run.hero.classId === 'necromancer') ensureSkeletons(run.hero);
    if (enemy.boss && !enemy.introShown) {
      enemy.introShown = true;
      this.flash = 1;
      this.shake = 10;
      toast(`${enemy.name}拦住了去路`, 'warn');
    }
  }

  updateCombat(dt) {
    const run = this.run;
    const h = run.hero;
    let group = (run.group || []).filter((x) => x.alive);
    if (!group.length || !run.target || !run.target.alive) {
      run.group = group;
      run.target = group[0] || null;
      if (!run.target) return;
    }
    const e = run.target;

    h.atkTimer -= dt;
    if (h.atkTimer <= 0) {
      h.atkTimer += 1 / Math.max(0.25, h.atkSpeed);
      this.heroAttack(e);
    }
    if (run.target !== e || !e.alive) return;

    if (h.classId === 'necromancer') {
      this.updateSkeletons(dt, e);
      if (run.target !== e || !e.alive) return;
    }

    for (const en of group) {
      if (!en.alive) continue;
      en.atkTimer -= dt;
      if (en.atkTimer <= 0) {
        en.atkTimer += 1 / Math.max(0.3, en.speed);
        this.enemyAttack(en);
        if (this.mode !== 'run') return;
      }
    }

    if (e.boss) {
      e.summonTimer -= dt;
      if (e.summonTimer <= 0) {
        e.summonTimer = 8;
        this.bossSpecial(e);
      }
    }
  }

  bossSpecial(e) {
    const run = this.run;
    const h = run.hero;
    switch (e.type) {
      case 'lich':
        this.summonSkeletons(e, 1);
        break;
      case 'priestess': {
        const heal = Math.round(e.maxHp * 0.03);
        e.hp = Math.min(e.maxHp, e.hp + heal);
        const pos = this.enemyPos(e);
        this.floatAt(pos.x, pos.y - e.r - 10, `+${heal}`, '#8fd6a0', 13);
        this.summonSkeletons(e, 1);
        break;
      }
      case 'hunter': {
        const dmg = Math.max(1, e.atk * 0.8 - h.def * 0.35);
        h.hp -= dmg;
        run.dmgTaken += dmg;
        h.hurtFlash = 1;
        const pos = this.heroPos();
        this.floatAt(pos.x, pos.y - 26, `-${Math.round(dmg)}`, '#ffb06a', 14);
        this.floatAt(pos.x, pos.y - 40, '飞刀', '#d8b25a', 11);
        this.burst(pos, 4, '#d8b25a');
        if (h.hp <= 0) this.die();
        break;
      }
      case 'omega':
        this.summonSkeletons(e, 2);
        this.shake = Math.max(this.shake, 6);
        break;
      default:
        this.summonSkeletons(e, 1);
    }
  }

  heroAttack(e) {
    const run = this.run;
    const h = run.hero;
    h.attackAnim = 0.22;
    const crit = rng.chance(h.crit);
    let dmg = h.atk * (crit ? h.critDmg : 1);
    let combo = false;
    if (h.classId === 'rogue' && rng.chance(0.2)) {
      dmg *= 1.6;
      combo = true;
    }
    dmg = Math.max(1, dmg);
    e.hp -= dmg;
    run.dmgDealt += dmg;

    if (h.vamp > 0) h.hp = Math.min(h.maxHp, h.hp + dmg * h.vamp);

    const pos = this.enemyPos(e);
    this.floatAt(pos.x, pos.y - e.r - 6, `-${Math.round(dmg)}`, crit ? '#ffd45e' : '#ff8f7a', crit ? 18 : 14);
    if (combo) this.floatAt(pos.x, pos.y - e.r - 22, '连击', '#8fbf9f', 12);
    this.burst(pos, crit ? 8 : 4, crit ? '#ffd45e' : '#e06a55');
    if (crit) this.shake = Math.max(this.shake, 4);

    if (e.hp <= 0) this.killEnemy(e);
    else if (e.boss && !e.phase2 && e.hp <= e.maxHp * 0.5) {
      e.phase2 = true;
      e.atk = Math.round(e.atk * 1.35);
      this.flash = 0.8;
      toast(`${e.name}进入狂暴，攻击力提升`, 'warn');
      this.summonSkeletons(e, 2);
    }
  }

  updateSkeletons(dt, e) {
    const h = this.run.hero;
    for (const sk of h.skeletons) {
      if (sk.hp <= 0) continue;
      sk.timer -= dt;
      if (sk.timer > 0) continue;
      sk.timer += 0.9;
      e.hp -= sk.atk;
      this.run.dmgDealt += sk.atk;
      const pos = this.enemyPos(e);
      this.floatAt(pos.x + rng.float(-9, 9), pos.y - e.r - 2, `-${Math.round(sk.atk)}`, '#cfd6c9', 11);
      this.burst(pos, 2, '#cfd6c9');
      if (e.hp <= 0) { this.killEnemy(e); return; }
    }
  }

  counterAttack(e) {
    const run = this.run;
    const h = run.hero;
    const dmg = Math.max(1, h.atk * 0.8);
    e.hp -= dmg;
    run.dmgDealt += dmg;
    const pos = this.enemyPos(e);
    this.floatAt(pos.x, pos.y - e.r - 20, '反击', '#e8c07a', 12);
    this.burst(pos, 3, '#e8c07a');
    if (e.hp <= 0) this.killEnemy(e);
  }

  enemyAttack(e) {
    const run = this.run;
    const h = run.hero;
    if (h.invuln > 0) return;

    const aliveSk = h.skeletons.filter((s) => s.hp > 0);
    if (aliveSk.length && rng.chance(0.65)) {
      const sk = rng.pick(aliveSk);
      const dmg = Math.max(1, e.atk * 0.85 - 1);
      sk.hp -= dmg;
      const pos = this.heroPos();
      this.floatAt(pos.x + rng.float(-14, 14), pos.y - 16, `-${Math.round(dmg)}`, '#cfd6c9', 11);
      this.burst(pos, 2, '#cfd6c9');
      if (sk.hp <= 0) {
        h.skeletons = h.skeletons.filter((s) => s !== sk);
        this.floatAt(pos.x, pos.y - 32, '骷髅倒下', '#8b8578', 12);
        this.burst(pos, 8, '#cfd6c9');
      }
      return;
    }

    if (rng.chance(h.evade)) {
      const pos = this.heroPos();
      this.floatAt(pos.x, pos.y - 26, '闪避', '#9fd6ff', 13);
      return;
    }
    const dmg = Math.max(1, (e.atk - h.def * 0.7) * (1 - Math.min(0.4, run.mapMods.enemyDmgReduce || 0)) * (1 - (h.damageReduction || 0)) * (run.group.length > 1 ? 0.9 : 1));
    h.hp -= dmg;
    run.dmgTaken += dmg;
    h.hurtFlash = 1;
    this.shake = Math.max(this.shake, 3.5);

    if (e.vamp > 0) e.hp = Math.min(e.maxHp, e.hp + dmg * e.vamp);

    const pos = this.heroPos();
    this.floatAt(pos.x, pos.y - 26, `-${Math.round(dmg)}`, '#ff6b5e', 14);
    this.burst(pos, 4, '#c0483f');

    if (h.hp <= 0) { this.die(); return; }
    if (h.classId === 'warrior' && e.alive && rng.chance(h.counterChance || 0.2)) this.counterAttack(e);
  }

  summonSkeletons(boss, count) {
    const run = this.run;
    for (let i = 0; i < count; i++) {
      const sk = makeEnemy('skeleton', run.loop, { cell: boss.cell, mul: run.enemyMul });
      sk.hp = Math.round(sk.hp * 0.5);
      sk.maxHp = sk.hp;
      sk.summoned = true;
      sk.atkTimer = 1.5;
      run.enemies.push(sk);
      if (run.group && run.group.length < 2) {
        sk.slot = run.group.length;
        run.group.push(sk);
      }
      const pos = this.enemyPos(sk);
      this.burst(pos, 8, '#c9c4b4');
    }
    toast('巫妖召唤了骷髅', 'warn');
  }

  killEnemy(e) {
    if (!e.alive) return;
    const run = this.run;
    const h = run.hero;
    e.alive = false;
    e.hp = 0;
    const wasTarget = run.target === e;
    if (wasTarget) run.target = null;
    run.group = (run.group || []).filter((x) => x !== e && x.alive);
    if (wasTarget && run.group.length) run.target = run.group[0];

    run.kills += 1;
    if (run.quest) {
      run.quest.have += 1;
      if (run.quest.have >= run.quest.need) this.completeQuest();
    }
    const pos = this.enemyPos(e);
    this.burst(pos, 14, e.color);
    this.floatAt(pos.x, pos.y - 30, '击杀', '#d8c58a', 13);

    const xp = Math.round(e.xp * (1 + (run.mapMods.xpBonus || 0)));
    if (xp > 0) {
      const ups = gainXp(h, xp);
      run.pendingLevels += ups;
    }

    const drops = rollResources(e, run.loop);
    if (drops.wood > 0 && this.meta.buildings.lumberjack) drops.wood += 1;
    if (drops.stone > 0 && this.meta.buildings.smelter) drops.stone += 1;
    for (const [k, v] of Object.entries(drops)) {
      if (!v) continue;
      run.resources[k] += v;
      this.floatAt(pos.x + rng.float(-10, 10), pos.y - 44, `+${v} ${resName(k)}`, '#c9b77a', 12);
    }

    // 盗贼：顺手牵羊
    if (h.classId === 'rogue' && rng.chance(0.6)) {
      const k = rng.pick(['wood', 'stone', 'soul']);
      run.resources[k] += 1;
      this.floatAt(pos.x + rng.float(-14, 14), pos.y - 56, `+1 ${resName(k)}`, '#8fbf9f', 11);
    }

    // 宝库：额外魂晶
    if (run.mapMods.soulChance && rng.chance(run.mapMods.soulChance)) {
      run.resources.soul += 1;
      this.floatAt(pos.x + rng.float(-18, 18), pos.y - 68, '+1 魂晶', '#a98bd0', 11);
    }

    // 祖先墓穴：击杀有灵魂的敌人提升生命上限
    if (run.mapMods.soulMaxHp && e.loot && e.loot.soul) {
      h.bonus.maxHp += run.mapMods.soulMaxHp;
      deriveHero(h, run.mapMods, this.meta);
      h.hp = Math.min(h.maxHp, h.hp + run.mapMods.soulMaxHp);
      this.floatAt(pos.x, pos.y - 78, `+${run.mapMods.soulMaxHp} 最大生命`, '#a98bd0', 11);
    }

    const lootChance = 0.2 + h.lootBonus + (e.elite ? 0.2 : 0);
    if (e.guaranteeEquip || rng.chance(lootChance)) {
      const item = rollEquip(run.loop, h.lootBonus, rng.pick(h.slotIds));
      const result = equipIfBetter(h, item);
      deriveHero(h, run.mapMods, this.meta);
      if (result.equipped) {
        toast(`装备：${item.name}（${item.slotName}）`, 'good');
        this.burst(pos, 10, '#d8b25a');
      } else {
        this.floatAt(pos.x, pos.y - 56, '装备不如身上', '#8a8578', 11);
      }
    }

    run.drawProgress += 1;
    if (run.drawProgress >= 2) {
      run.drawProgress = 0;
      this.fillHand();
    }

    if (e.boss) {
      if (run.infinite) this.clearLayer();
      else this.victory();
      return;
    }

    if (run.pendingLevels > 0 && !run.traitChoices) {
      this.openTraits();
      return;
    }

    if (this.mode !== 'run' || (run.target && run.target.alive)) return;
    const next = run.enemies.find((x) => x.alive && x.cell === h.cell);
    if (next) this.startCombat(next);
  }

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

  // ---------- 塔与周期伤害 ----------

  updateTowers(dt) {
    const run = this.run;
    for (const t of run.towers) {
      t.timer += dt;
      if (t.timer < t.every) continue;
      t.timer = 0;
      const target = this.nearestEnemy(t.pathIndex, 22);
      if (!target) continue;
      this.damageEnemy(target, t.dmg, t.type);
      const from = this.cellCenter({ x: t.x, y: t.y });
      const to = this.enemyPos(target);
      run.particles.push({
        type: 'beam', x: from.x, y: from.y, x2: to.x, y2: to.y,
        life: 0.25, maxLife: 0.25, color: t.type === 'bolt' ? '#a9b6ff' : '#d8c58a', size: 2,
      });
      if (this.mode !== 'run') return;
    }
  }

  nearestEnemy(fromIndex, maxAhead = 22) {
    const run = this.run;
    const len = run.map.path.length;
    if (run.target && run.target.alive) return run.target;
    let best = null, bestD = Infinity;
    for (const e of run.enemies) {
      if (!e.alive) continue;
      const d = (e.cell - fromIndex + len) % len;
      if (d > 0 && d <= maxAhead && d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  damageEnemy(e, dmg, kind = 'hit') {
    if (!e.alive) return;
    e.hp -= dmg;
    const pos = this.enemyPos(e);
    this.floatAt(pos.x, pos.y - e.r - 4, `-${Math.round(dmg)}`, kind === 'bolt' ? '#a9b6ff' : '#e8d9a8', 12);
    this.burst(pos, 3, kind === 'bolt' ? '#a9b6ff' : '#e8d9a8');
    if (e.hp <= 0) this.killEnemy(e);
  }

  // ---------- Boss / 结算 ----------

  maybeSpawnBoss() {
    const run = this.run;
    if (run.bossSpawned || run.bossDefeated) return;
    if (run.bossMeter < BOSS_METER_MAX) return;
    const loopGate = run.bossLoop || BOSS_LOOP;
    if (run.loop < loopGate) return;

    const len = run.map.path.length;
    const cell = Math.floor(len * 0.5);
    const boss = makeEnemy(run.bossType || 'lich', run.loop, { cell, mul: run.enemyMul || 1 });
    markEnemy(this.meta, run.bossType || 'lich');
    boss.spawnKey = 'boss';
    const power = (1 + (run.mapMods.bossPower || 0)) *
      (1 + (run.layer || 0) * 0.28) *
      (1 + Math.max(0, run.loop - loopGate) * 0.12);
    boss.hp = Math.round(boss.hp * power);
    boss.maxHp = boss.hp;
    boss.atk = Math.round(boss.atk * power);
    run.enemies.push(boss);
    run.bossSpawned = true;
    this.flash = 1;
    this.shake = 14;
    toast(`${boss.name}在环线对面等你`, 'warn');
  }

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

  // ---------- 手牌 ----------

  handMax() {
    return HAND_BASE + Math.min(2, this.meta.buildings.intel || 0);
  }

  drawCards(n) {
    const run = this.run;
    for (let i = 0; i < n; i++) {
      if (!run.deck.length) {
        if (!run.discard.length) return;
        run.deck = rng.shuffle(run.discard);
        run.discard = [];
      }
      run.hand.push(run.deck.pop());
      markCard(this.meta, run.hand[run.hand.length - 1]);
    }
  }

  fillHand(all = false) {
    const run = this.run;
    const max = this.handMax();
    const target = all ? max : Math.min(max, run.hand.length + 1);
    while (run.hand.length < target) {
      if (!run.deck.length) {
        if (!run.discard.length) break;
        run.deck = rng.shuffle(run.discard);
        run.discard = [];
      }
      run.hand.push(run.deck.pop());
      markCard(this.meta, run.hand[run.hand.length - 1]);
    }
  }

  // ---------- 坐标与特效 ----------

  pathPoint(pos) {
    const map = this.run.map;
    const len = map.path.length;
    const wrapped = ((pos % len) + len) % len;
    const i = Math.floor(wrapped);
    const f = wrapped - i;
    const a = map.path[i];
    const b = map.path[(i + 1) % len];
    return {
      x: (a.x + (b.x - a.x) * f + 0.5) * CELL,
      y: (a.y + (b.y - a.y) * f + 0.5) * CELL + OFFSET_Y,
    };
  }

  heroPos() { return this.pathPoint(this.run.hero.pos); }

  cellCenter(c) {
    return { x: (c.x + 0.5) * CELL, y: (c.y + 0.5) * CELL + OFFSET_Y };
  }

  enemyPos(e) {
    const p = this.run.map.path[e.cell] || this.run.map.path[0];
    const slot = e.slot;
    const ox = slot == null ? 0 : (slot - 0.5) * 22;
    const oy = slot == null ? 0 : slot * 5;
    return { x: (p.x + 0.5) * CELL + ox, y: (p.y + 0.5) * CELL + OFFSET_Y + oy };
  }

  floatAt(x, y, text, color, size = 13) {
    this.run.floats.push({ x, y, text, color, size, life: 1.0, maxLife: 1.0, vx: rng.float(-12, 12) });
  }

  burst(pos, n, color) {
    for (let i = 0; i < n; i++) {
      const a = rng.float(0, Math.PI * 2);
      const sp = rng.float(30, 110);
      this.run.particles.push({
        type: 'spark', x: pos.x, y: pos.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
        life: rng.float(0.25, 0.55), maxLife: 0.55,
        color, size: rng.float(1, 2.6),
      });
    }
  }

  updateEffects(dt) {
    const run = this.run;
    for (const p of run.particles) {
      if (p.type === 'beam') { p.life -= dt; continue; }
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 150 * dt;
    }
    run.particles = run.particles.filter((p) => p.life > 0);

    for (const f of run.floats) {
      f.life -= dt;
      f.y -= 26 * dt;
      f.x += f.vx * dt;
    }
    run.floats = run.floats.filter((f) => f.life > 0);
  }
}

function resName(k) {
  return { wood: '木材', stone: '石料', soul: '魂晶' }[k] || k;
}
