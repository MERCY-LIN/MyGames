#!/usr/bin/env node
// 平衡校准工具（S7 阶段 A）：批量无头模拟，输出胜率 / 圈数分布 / 资源收入 / Boss 战数据
// 用法：
//   node tools/simulate.mjs --n 40 --chapter 3 --class rogue
//   node tools/simulate.mjs --all --n 40                        # 3 职业 × 5 模式
//   node tools/simulate.mjs --all --n 40 --out docs/balance.md  # 汇总表写入 markdown
//   node tools/simulate.mjs --all --n 40 --out docs/balance/all.json
// 结果固定 seed = seedBase + i*7919，保证可复现
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- 最小 DOM / localStorage 桩（与 tests/sim.test.mjs 一致）----------
class El {
  constructor(id = '') {
    this.id = id;
    this.innerHTML = ''; this.textContent = ''; this.disabled = false;
    this.dataset = {}; this.style = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  addEventListener() {} removeEventListener() {}
  querySelectorAll() { return []; } querySelector() { return null; }
  appendChild() {} closest() { return null; }
}
const els = new Map();
globalThis.document = {
  getElementById(id) { if (!els.has(id)) els.set(id, new El(id)); return els.get(id); },
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

const { rng } = await import('../js/core/rng.js');
const { Game } = await import('../js/game.js');
const { canPlace } = await import('../js/world/loopMap.js');
const { CARDS } = await import('../js/data/cards.js');
const { itemScore } = await import('../js/systems/loot.js');
const { initHUD } = await import('../js/ui/hud.js');
const { initScreens } = await import('../js/ui/screens.js');

const TRAIT_ORDER = [
  'blade', 'vitality', 'bloodthirst', 'shield', 'swift', 'precision',
  'regrowth', 'agile', 'brutal', 'fortune',
  'boneLord', 'gravePower', 'riposte', 'deadly', 'unyielding', 'shadowStrike', 'plunder', 'soulSiphon', 'shieldWall',
];

// 满资源 + 全建筑：模拟“全解锁档位”的平衡上限
function metaLike(classId, chapter, infinite) {
  return {
    version: 3,
    resources: { wood: 30, stone: 30, soul: 10, metal: 8, shard: 8, tome: 8 },
    buildings: {
      campfire: 1, gym: 1, farm: 1, cemetery: 1, lodge: 1,
      smithy: 1, watchtower: 1, fort: 1, guild: 1, crypt: 1, intel: 1,
      library: 1, armory: 1, beacon: 1,
    },
    classId, deck: [], chapter, chapterMax: 4, infinite,
    bestLayer: 0, bestLoop: 0, runs: 0, victories: 0, createdAt: 0,
  };
}

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

export function simulateOne(seed, opts, seconds = 900) {
  const game = new Game();
  game.meta = metaLike(opts.classId, opts.chapter, opts.infinite);
  initHUD(game);
  initScreens(game);
  rng.reset(seed);
  game.startRun();
  game.speed = 3;

  const dt = 1 / 30;
  let t = 0;
  let placeTimer = 0;
  const perLoop = [];
  let lastLoop = 1;
  let lastRes = { wood: 0, stone: 0, soul: 0, metal: 0, shard: 0, tome: 0 };
  let lastKills = 0;
  let lastDmg = 0;
  let bossFights = 0;
  let bossSeconds = 0;
  let bossStartAt = -1;
  let summonedKills = 0;
  let summonedAlive = new Set();
  let snap = null;   // 撤退前的快照（撤退会清空 game.run）

  while (t < seconds && game.mode === 'run') {
    if (game.run.traitChoices) {
      const pick = TRAIT_ORDER.find((id) => game.run.traitChoices.some((x) => x.id === id));
      game.chooseTrait(pick || game.run.traitChoices[0].id);
    }
    // 自动喝药：血线低于 40% 且有药水（S7.2 策略，此前遗漏会导致基线系统性偏难）
    const hh = game.run.hero;
    if (game.mode === 'run' && hh.hp < hh.maxHp * 0.4 && hh.potions > 0) game.drinkPotion();

    if (game.run?.pendingLoot) {
      const p = game.run.pendingLoot;
      const better = itemScore(p.item) > itemScore(p.current);
      const canStash = game.run.hero.inventory.length < game.run.hero.maxInventory;
      game.resolveLoot(better ? 'equip' : canStash ? 'stash' : 'discard');
    }
    game.update(dt);
    t += dt;
    placeTimer -= dt;

    // Boss 战计时
    const trg = game.run.target;
    if (trg && trg.boss && bossStartAt < 0) bossStartAt = t;
    if (bossStartAt >= 0 && (!trg || !trg.boss)) { bossSeconds += t - bossStartAt; bossFights += 1; bossStartAt = -1; }

    // 召唤物击杀：快照差分
    const now = new Set();
    for (const e of game.run.enemies) if (e.summoned && e.alive) now.add(e.uid);
    for (const uid of summonedAlive) if (!now.has(uid)) summonedKills += 1;
    summonedAlive = now;

    if (game.run.loop !== lastLoop) {
      const r = game.run;
      perLoop.push({
        loop: r.loop,
        kills: r.kills - lastKills,
        dmgTaken: Math.round((r.dmgTaken - lastDmg) * 10) / 10,
        wood: r.resources.wood - lastRes.wood,
        stone: r.resources.stone - lastRes.stone,
        soul: r.resources.soul - lastRes.soul,
        metal: (r.resources.metal || 0) - (lastRes.metal || 0),
        shard: (r.resources.shard || 0) - (lastRes.shard || 0),
        tome: (r.resources.tome || 0) - (lastRes.tome || 0),
      });
      lastKills = r.kills;
      lastDmg = r.dmgTaken;
      lastRes = { ...r.resources };
      lastLoop = r.loop;
    }

    // 自动撤退：血线过低且已过首领圈（S7.2 策略）
    // 撤退会清空 game.run，先快照，避免本局指标丢失
    const h = game.run.hero;
    if (game.mode === 'run' && h.hp < h.maxHp * 0.25 && game.run.loop >= (game.run.bossLoop || 8)) {
      snap = {
        layer: game.run.layer, loop: game.run.loop, level: game.run.hero.level,
        kills: game.run.kills, cards: game.run.cardsPlayed,
        dmgTaken: game.run.dmgTaken, resources: { ...game.run.resources },
      };
      game.retreat(true);
      break;
    }

    if (placeTimer <= 0 && game.mode === 'run' && !game.run.traitChoices) {
      placeTimer = 0.9;
      tryPlaceSomewhere(game);
    }
  }

  if (bossStartAt >= 0) { bossSeconds += t - bossStartAt; bossFights += 1; }

  // 无尽模式不会进入 victory：以通过层数衡量推进
  const outcome = game.mode === 'victory' ? 'victory'
    : game.mode === 'dead' ? 'death'
      : game.mode === 'camp' ? 'retreat' : 'timeout';

  // 撤退会清空 game.run，统一成扁平快照再统计
  const src = game.run ? {
    layer: game.run.layer, loop: game.run.loop, level: game.run.hero.level,
    kills: game.run.kills, cards: game.run.cardsPlayed,
    dmgTaken: game.run.dmgTaken, resources: { ...game.run.resources },
  } : (snap || {
    layer: 0, loop: 1, level: 0, kills: 0, cards: 0, dmgTaken: 0, resources: { wood: 0, stone: 0, soul: 0 },
  });
  const loop = Math.max(1, src.loop);

  return {
    seed,
    class: opts.classId,
    chapter: opts.infinite ? 'inf' : opts.chapter,
    infinite: !!opts.infinite,
    outcome,
    layer: src.layer,
    loop: src.loop,
    level: src.level,
    kills: src.kills,
    killsPerLoop: Math.round((src.kills / loop) * 10) / 10,
    dmgTakenPerLoop: Math.round((src.dmgTaken / loop) * 10) / 10,
    cards: src.cards,
    bossFights,
    bossSecondsAvg: bossFights ? Math.round((bossSeconds / bossFights) * 10) / 10 : 0,
    summonedKills,
    incomePerLoop: {
      wood: Math.round((src.resources.wood / loop) * 100) / 100,
      stone: Math.round((src.resources.stone / loop) * 100) / 100,
      soul: Math.round((src.resources.soul / loop) * 100) / 100,
      metal: Math.round(((src.resources.metal || 0) / loop) * 100) / 100,
      shard: Math.round(((src.resources.shard || 0) / loop) * 100) / 100,
      tome: Math.round(((src.resources.tome || 0) / loop) * 100) / 100,
    },
    resources: src.resources,
    perLoop,
    simSeconds: Math.round(t),
  };
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
  return a[i];
}

function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }

export function aggregate(key, runs) {
  const wins = runs.filter((r) => r.outcome === 'victory').length;
  const deaths = runs.filter((r) => r.outcome === 'death').length;
  const retreats = runs.filter((r) => r.outcome === 'retreat').length;
  const timeouts = runs.filter((r) => r.outcome === 'timeout').length;
  const winnerLoops = runs.filter((r) => r.outcome === 'victory').map((r) => r.loop);
  const deathLoops = runs.filter((r) => r.outcome === 'death').map((r) => r.loop);
  const infinite = runs.some((r) => r.infinite);

  // 连续指标用中位数：跑飞的单局（无尽后期可刷到几十层）会把均值带偏
  return {
    key,
    n: runs.length,
    infinite,
    // 无尽模式无胜利态，胜率恒为 0，改看层数
    winRate: infinite ? 0 : Math.round((wins / runs.length) * 1000) / 10,
    layersCleared: {
      p50: pct(runs.map((r) => r.layer), 0.5),
      max: Math.max(0, ...runs.map((r) => r.layer)),
    },
    outcomes: { victory: wins, death: deaths, retreat: retreats, timeout: timeouts },
    clearLoopMedian: pct(winnerLoops, 0.5),
    deathLoop: { p25: pct(deathLoops, 0.25), p50: pct(deathLoops, 0.5), p75: pct(deathLoops, 0.75) },
    loop: { p50: pct(runs.map((r) => r.loop), 0.5), max: Math.max(0, ...runs.map((r) => r.loop)) },
    level: { p50: pct(runs.map((r) => r.level), 0.5), max: Math.max(0, ...runs.map((r) => r.level)) },
    killsPerLoop: pct(runs.map((r) => r.killsPerLoop), 0.5),
    dmgTakenPerLoop: pct(runs.map((r) => r.dmgTakenPerLoop), 0.5),
    incomePerLoop: {
      wood: pct(runs.map((r) => r.incomePerLoop.wood), 0.5),
      stone: pct(runs.map((r) => r.incomePerLoop.stone), 0.5),
      soul: pct(runs.map((r) => r.incomePerLoop.soul), 0.5),
      metal: pct(runs.map((r) => r.incomePerLoop.metal), 0.5),
      shard: pct(runs.map((r) => r.incomePerLoop.shard), 0.5),
      tome: pct(runs.map((r) => r.incomePerLoop.tome), 0.5),
    },
    boss: {
      fights: pct(runs.map((r) => r.bossFights), 0.5),
      seconds: pct(runs.filter((r) => r.bossSecondsAvg > 0).map((r) => r.bossSecondsAvg), 0.5),
      summonedKills: pct(runs.map((r) => r.summonedKills), 0.5),
    },
  };
}

export function runBatch(opts, n = 40, seedBase = 1000, seconds = 900, quiet = true) {
  const runs = [];
  for (let i = 0; i < n; i++) {
    runs.push(simulateOne(seedBase + i * 7919, opts, seconds));
    if (!quiet && (i + 1) % 10 === 0) process.stdout.write(`  ${opts.key}: ${i + 1}/${n}\r`);
  }
  if (!quiet) process.stdout.write('\n');
  return aggregate(opts.key, runs);
}

export const COMBOS = [
  { key: 'warrior@ch1', classId: 'warrior', chapter: 1, infinite: false },
  { key: 'warrior@ch2', classId: 'warrior', chapter: 2, infinite: false },
  { key: 'warrior@ch3', classId: 'warrior', chapter: 3, infinite: false },
  { key: 'warrior@ch4', classId: 'warrior', chapter: 4, infinite: false },
  { key: 'warrior@inf', classId: 'warrior', chapter: 1, infinite: true },
  { key: 'rogue@ch1', classId: 'rogue', chapter: 1, infinite: false },
  { key: 'rogue@ch3', classId: 'rogue', chapter: 3, infinite: false },
  { key: 'rogue@inf', classId: 'rogue', chapter: 1, infinite: true },
  { key: 'necro@ch1', classId: 'necromancer', chapter: 1, infinite: false },
  { key: 'necro@ch3', classId: 'necromancer', chapter: 3, infinite: false },
  { key: 'necro@inf', classId: 'necromancer', chapter: 1, infinite: true },
];

function toMarkdown(payload) {
  const m = payload.meta;
  const lines = [
    '# 平衡基线图（tools/simulate.mjs 生成）',
    '',
    `- 样本：每组 ${m.n} 局 · 每局上限 ${m.seconds} 模拟秒 · seed 基数 ${m.seedBase}`,
    `- 生成时间：${m.createdAt}`,
    '',
    '| 组合 | 胜率 | 通过层 P50/最大 | 通关中位圈 | 总圈数 P50/最大 | 死亡圈 P25/50/75 | 等级 P50 | 每圈击杀 | 每圈承伤 | 每圈木/石/魂/金/片/籍 | Boss 场/秒 | 召唤击杀 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of payload.report) {
    const winCell = r.infinite ? '—' : `${r.winRate}%`;
    lines.push(`| ${r.key} | ${winCell} | ${r.layersCleared.p50}/${r.layersCleared.max} | ${r.clearLoopMedian} | ${r.loop.p50}/${r.loop.max} | ${r.deathLoop.p25}/${r.deathLoop.p50}/${r.deathLoop.p75} | ${r.level.p50} | ${r.killsPerLoop} | ${r.dmgTakenPerLoop} | ${r.incomePerLoop.wood}/${r.incomePerLoop.stone}/${r.incomePerLoop.soul}/${r.incomePerLoop.metal}/${r.incomePerLoop.shard}/${r.incomePerLoop.tome} | ${r.boss.fights} / ${r.boss.seconds}s | ${r.boss.summonedKills} |`);
  }
  lines.push('', '### 结局分布', '');
  for (const r of payload.report) {
    lines.push(`- **${r.key}**：${JSON.stringify(r.outcomes)}`);
  }
  return `${lines.join('\n')}\n`;
}

// ---------- CLI（仅在直接执行时运行，被测试 import 时不触发）----------
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const arg = (name, def = null) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
  };
  const N = Number(arg('n', 50));
  const SEED_BASE = Number(arg('seed', 1000));
  const SECONDS = Number(arg('seconds', 900));
  const OUT = arg('out', null);
  const targets = [];
  if (argv.includes('--all')) {
    targets.push(...COMBOS);
  } else {
    const classId = arg('class', 'warrior');
    const ch = arg('chapter', '1');
    const infinite = ch === 'inf';
    targets.push({ key: `${classId}@${ch}`, classId, chapter: infinite ? 1 : Number(ch), infinite });
  }

  console.log(`平衡模拟：${targets.length} 组 × ${N} 局（seed ${SEED_BASE}…, 上限 ${SECONDS}s/局）`);
  const t0 = Date.now();
  const report = targets.map((o) => runBatch(o, N, SEED_BASE, SECONDS, false));
  const elapsed = Math.round((Date.now() - t0) / 1000);

  for (const r of report) {
    const head = r.infinite
      ? `[${r.key}] 通过层 P50 ${r.layersCleared.p50} / 最大 ${r.layersCleared.max}`
      : `[${r.key}] 胜率 ${r.winRate}%  通关中位圈 ${r.clearLoopMedian}`;
    console.log(`\n${head}  死亡圈 P25/50/75 ${r.deathLoop.p25}/${r.deathLoop.p50}/${r.deathLoop.p75}`);
    console.log(`  总圈数 P50 ${r.loop.p50}/最大 ${r.loop.max} · 等级 P50 ${r.level.p50} · 每圈击杀 ${r.killsPerLoop} · 每圈承伤 ${r.dmgTakenPerLoop}`);
    console.log(`  每圈收入 木${r.incomePerLoop.wood} 石${r.incomePerLoop.stone} 魂${r.incomePerLoop.soul}`);
    console.log(`  Boss 战 ${r.boss.fights} 场 · 时长 ${r.boss.seconds}s · 召唤物击杀 ${r.boss.summonedKills}`);
    console.log(`  结局分布 ${JSON.stringify(r.outcomes)}`);
  }
  console.log(`\n耗时 ${elapsed}s`);

  const payload = {
    meta: { n: N, seedBase: SEED_BASE, seconds: SECONDS, elapsedSec: elapsed, createdAt: new Date().toISOString() },
    report,
  };

  if (OUT) {
    const path = resolve(process.cwd(), OUT);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, OUT.endsWith('.md') ? toMarkdown(payload) : `${JSON.stringify(payload, null, 1)}\n`);
    console.log(`已写入 ${OUT}`);
  }
}
