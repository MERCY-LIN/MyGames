// 坐标换算：路径点、英雄/敌人/格子中心（纯函数，供战斗与经济模块使用，无 DOM）
import { CELL, OFFSET_Y } from '../core/config.js';

export function pathPoint(map, pos) {
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

export function heroPos(run) { return pathPoint(run.map, run.hero.pos); }

export function cellCenter(c) {
  return { x: (c.x + 0.5) * CELL, y: (c.y + 0.5) * CELL + OFFSET_Y };
}

export function enemyPos(run, e) {
  if (e.march?.active) {
    const p = pathPoint(run.map, e.march.pos);
    return { x: p.x, y: p.y };
  }
  const p = run.map.path[e.cell] || run.map.path[0];
  const slot = e.slot;
  const n = (run.group || []).length;
  let ox = 0;
  let oy = 0;
  if (slot != null) {
    if (n >= 4) {
      ox = slot === 1 ? -26 : slot === 2 ? 26 : 0;
      oy = slot === 3 ? 12 : 0;
    } else if (n === 3) {
      ox = (slot - 1) * 18;
      oy = slot * 4;
    } else if (n === 2) {
      ox = (slot - 0.5) * 22;
      oy = slot * 5;
    }
  }
  return { x: (p.x + 0.5) * CELL + ox, y: (p.y + 0.5) * CELL + OFFSET_Y + oy };
}
