// 营地元进度：资源与建筑
import { BUILDINGS, BUILDING_BY_ID } from '../data/buildings.js';
import { cardPool } from '../data/cards.js';

export function resourceTotal(res) {
  return (res.wood || 0) + (res.stone || 0) + (res.soul || 0);
}

export function canAfford(meta, cost) {
  return Object.entries(cost).every(([k, v]) => (meta.resources[k] || 0) >= v);
}

export function buildingCost(meta, id) {
  const def = BUILDING_BY_ID[id];
  const lv = meta.buildings[id] || 0;
  if (lv >= def.maxLevel) return null;
  return def.cost(lv + 1);
}

export function build(meta, id) {
  const def = BUILDING_BY_ID[id];
  const lv = meta.buildings[id] || 0;
  if (lv >= def.maxLevel) return { ok: false, reason: '已满级' };
  const cost = def.cost(lv + 1);
  if (!canAfford(meta, cost)) return { ok: false, reason: '资源不足' };
  for (const [k, v] of Object.entries(cost)) meta.resources[k] -= v;
  meta.buildings[id] = lv + 1;
  return { ok: true, level: lv + 1, unlocked: unlockedNow(meta, id) };
}

function unlockedNow(meta, id) {
  // 建筑升到 1 级时解锁的卡牌
  const before = [];
  const after = [];
  const probe = { ...meta, buildings: { ...meta.buildings, [id]: (meta.buildings[id] || 0) - 1 } };
  return cardPool(meta).filter((c) => !cardPool(probe).includes(c));
}

export function buildingMax(meta, id) { return BUILDING_BY_ID[id].maxLevel; }
export function buildingLevel(meta, id) { return meta.buildings[id] || 0; }
export { BUILDINGS };
