// 敌人生成与塔（无 DOM 依赖）
import { rng } from '../core/rng.js';
import { BOSS_LOOP, BOSS_METER_MAX } from '../core/config.js';
import { CARDS } from '../data/cards.js';
import { makeEnemy } from '../data/enemies.js';
import { adjacentPath } from '../world/loopMap.js';
import { markEnemy } from './codex.js';
import { cellCenter, enemyPos } from './geom.js';
import { damageEnemy, startCombat } from './combat.js';

export function spawnLoopEnemies(run, ctx) {
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
      const enemy = makeEnemy(type, loop, { elite, cell: adjacentPath(run.map, c), mul });
      markEnemy(ctx.meta, type);
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

export function maybeSpawnBoss(run, ctx) {
  if (run.bossSpawned || run.bossDefeated) return;
  if (run.bossMeter < BOSS_METER_MAX) return;
  const loopGate = run.bossLoop || BOSS_LOOP;
  if (run.loop < loopGate) return;

  const len = run.map.path.length;
  const cell = Math.floor(len * 0.5);
  const boss = makeEnemy(run.bossType || 'lich', run.loop, { cell, mul: run.enemyMul || 1 });
  markEnemy(ctx.meta, run.bossType || 'lich');
  boss.spawnKey = 'boss';
  boss.march = { active: true, pos: cell, gap: len * 0.5, elapsed: 0, laps: 0 };
  const power = (1 + (run.mapMods.bossPower || 0)) *
    (1 + (run.layer || 0) * 0.28) *
    (1 + Math.max(0, run.loop - loopGate) * 0.12) *
    (ctx.meta.buildings.academy >= 2 ? 0.9 : 1);
  boss.hp = Math.round(boss.hp * power);
  boss.maxHp = boss.hp;
  boss.atk = Math.round(boss.atk * power);
  run.enemies.push(boss);
  run.bossSpawned = true;
  ctx.emit.flash(1);
  ctx.emit.shake(14);
  ctx.emit.toast(`${boss.name}开始追逐你`, 'warn');
}

export function updateBossMarch(run, ctx, dt) {
  const boss = run.enemies.find((e) => e.alive && e.boss && e.march?.active);
  if (!boss) return;
  const len = run.map.path.length;
  const prev = boss.march.pos;
  boss.march.elapsed += dt;
  const heroSpeed = run.hero.speed || 1;
  const speed = heroSpeed * 1.3 + 0.4;
  boss.march.pos = (prev + speed * dt) % len;
  boss.cell = Math.floor(boss.march.pos) % len;
  if (boss.march.pos < prev) boss.march.laps += 1;

  const forward = (run.hero.pos - boss.march.pos + len) % len;
  boss.march.gap = Math.min(forward, len - forward);
  boss.march.speed = speed;

  if (run.target) {
    if (run.target.boss) return;
    if (boss.march.gap < 1.4) {
      boss.march.pending = true;
      boss.cell = Math.floor(run.hero.pos) % len;
    }
    return;
  }

  if (boss.march.pending || boss.march.gap < 0.6 || boss.march.elapsed > 90 || boss.march.laps >= 1) {
    boss.march.active = false;
    boss.cell = Math.floor(run.hero.pos) % len;
    startCombat(run, ctx, boss);
  }
}

export function nearestEnemy(run, fromIndex, maxAhead = 22) {
  const len = run.map.path.length;
  if (run.target && run.target.alive) return run.target;
  let best = null, bestD = Infinity;
  for (const e of run.enemies) {
    if (!e.alive) continue;
    if (e.march?.active) continue;
    const d = (e.cell - fromIndex + len) % len;
    if (d > 0 && d <= maxAhead && d < bestD) { bestD = d; best = e; }
  }
  return best;
}

export function updateTowers(run, ctx, dt) {
  for (const t of run.towers) {
    t.timer += dt;
    if (t.timer < t.every) continue;
    t.timer = 0;
    const target = nearestEnemy(run, t.pathIndex, 22);
    if (!target) continue;
    damageEnemy(run, ctx, target, t.dmg, t.type);
    const from = cellCenter({ x: t.x, y: t.y });
    const to = enemyPos(run, target);
    run.particles.push({
      type: 'beam', x: from.x, y: from.y, x2: to.x, y2: to.y,
      life: 0.25, maxLife: 0.25, color: t.type === 'bolt' ? '#a9b6ff' : '#d8c58a', size: 2,
    });
    if (ctx.isOver()) return;
  }
}
