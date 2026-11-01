// 特效：浮字、粒子爆发、每帧推进（Game 的表现层出口；注意它们会消耗随机数，顺序不可随意调整）
import { rng } from '../core/rng.js';

export function floatAt(run, x, y, text, color, size = 13) {
  run.floats.push({ x, y, text, color, size, life: 1.0, maxLife: 1.0, vx: rng.float(-12, 12) });
}

export function burst(run, pos, n, color) {
  for (let i = 0; i < n; i++) {
    const a = rng.float(0, Math.PI * 2);
    const sp = rng.float(30, 110);
    run.particles.push({
      type: 'spark', x: pos.x, y: pos.y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
      life: rng.float(0.25, 0.55), maxLife: 0.55,
      color, size: rng.float(1, 2.6),
    });
  }
}

export function updateEffects(run, dt) {
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
