// 地图：闭合环线、路边/野地槽位、卡牌放置与地形统计
import { CARDS } from '../data/cards.js';
import { GRID_W, GRID_H } from '../core/config.js';

export function key(x, y) { return `${x},${y}`; }

export function buildPath() {
  const pts = [];
  const y0 = 3, y1 = 14, x0 = 6, x1 = 33;
  for (let x = 20; x <= x1; x++) pts.push({ x, y: y1 });      // 底部右半
  for (let y = y1 - 1; y >= y0; y--) pts.push({ x: x1, y });   // 右侧上行
  for (let x = x1 - 1; x >= x0; x--) pts.push({ x, y: y0 });   // 顶部左行
  for (let y = y0 + 1; y <= y1; y++) pts.push({ x: x0, y });   // 左侧下行
  for (let x = x0 + 1; x <= 19; x++) pts.push({ x, y: y1 });   // 底侧收口
  return pts;
}

export function createMap() {
  const path = buildPath();
  const pathIndex = new Map();
  path.forEach((p, i) => pathIndex.set(key(p.x, p.y), i));

  const grid = [];
  for (let y = 0; y < GRID_H; y++) {
    const row = [];
    for (let x = 0; x < GRID_W; x++) {
      row.push({ x, y, kind: 'landscape', card: null, adj: null });
    }
    grid.push(row);
  }

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (pathIndex.has(key(x, y))) grid[y][x].kind = 'path';
    }
  }

  // 路边槽位：紧贴道路、非道路
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      const c = grid[y][x];
      if (c.kind === 'path') continue;
      const adj = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
        .map(([nx, ny]) => pathIndex.get(key(nx, ny)))
        .find((i) => i !== undefined);
      if (adj !== undefined) {
        c.kind = 'roadside';
        c.adj = adj;
      }
    }
  }

  return {
    path, pathIndex, grid,
    bounds: {
      x0: Math.min(...path.map((p) => p.x)),
      x1: Math.max(...path.map((p) => p.x)),
      y0: Math.min(...path.map((p) => p.y)),
      y1: Math.max(...path.map((p) => p.y)),
    },
    campIndex: 0,
    spawners: [],   // {x,y,type,pathIndex}
    towers: [],     // {x,y,cardId,pathIndex,timer,every,dmg,type}
    passives: [],   // {pathIndex,frac}
    slowCells: new Set(),
  };
}

export function cellAt(map, x, y) {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
  return map.grid[y][x];
}

export function pathCellIndex(map, x, y) { return map.pathIndex.get(key(x, y)); }

export function neighbors(map, c) {
  return [[c.x + 1, c.y], [c.x - 1, c.y], [c.x, c.y + 1], [c.x, c.y - 1]]
    .map(([x, y]) => cellAt(map, x, y))
    .filter(Boolean);
}

export function canPlaceReason(map, c, cardId) {
  if (!c) return '超出地图范围';
  const def = CARDS[cardId];
  if (!def) return '未知卡牌';
  if (cardId === 'forget') return c.card ? null : '这里没有可遗忘的地形';
  if (def.hidden) return '这张牌不能直接放置';
  if (c.card) return '这里已经有地形';

  if (def.kind === 'roadside') {
    return c.kind === 'roadside' ? null : '只能放在道路旁的空位';
  }
  if (def.kind === 'special') return '特殊卡牌不能在探索中放置';
  if (c.kind !== 'landscape') return '只能放在野地上，不能压住道路';

  if (cardId === 'wheat') {
    return neighbors(map, c).some((n) => n.card && (n.card.variant || n.card.id) === 'village')
      ? null : '需要紧挨着村庄';
  }
  if (cardId === 'bloodGrove') {
    return neighbors(map, c).some((n) => n.card && ['forest', 'thicket'].includes(n.card.variant || n.card.id))
      ? null : '需要紧挨着森林';
  }
  return null;
}

export function canPlace(map, c, cardId) {
  return canPlaceReason(map, c, cardId) === null;
}

export const CROSS_COMBOS = [
  { a: 'village', b: 'vampireMansion', into: 'countyEstate' },
  { a: 'village', b: 'wheat', into: 'countyEstate' },
  { a: 'cemetery', b: 'village', into: 'ruinedVillage', transform: 'b' },
  { a: 'desert', b: 'river', into: 'oasis' },
  { a: 'dunes', b: 'river', into: 'oasis' },
  { a: 'battlefield', b: 'bloodGrove', into: 'bloodPath' },
  { a: 'forest', b: 'burntForest', into: 'hungryGrove' },
  { a: 'swamp', b: 'river', into: 'reed', transform: 'b' },
  { a: 'spiderNest', b: 'forest', into: 'giantNest' },
  { a: 'goblinCamp', b: 'rock', into: 'goblinMine' },
  { a: 'cemetery', b: 'cemetery', into: 'grandCemetery', both: true },
  { a: 'ruins', b: 'ruins', into: 'ancientRuins', both: true },
];

function applyCrossCombo(map, c, cardId) {
  for (const rule of CROSS_COMBOS) {
    const selfIsA = cardId === rule.a;
    const selfIsB = cardId === rule.b;
    if (!selfIsA && !selfIsB) continue;
    const other = neighbors(map, c).find((n) => n.card && (n.card.variant || n.card.id) === (selfIsA ? rule.b : rule.a));
    if (!other) continue;

    const same = rule.a === rule.b;
    const aCell = same ? other : (selfIsA ? c : other);
    const bCell = same ? c : (selfIsB ? c : other);

    if (rule.both) {
      aCell.card.variant = rule.into;
      bCell.card.variant = rule.into;
    } else if (rule.transform === 'b') {
      bCell.card.variant = rule.into;
    } else {
      aCell.card.variant = rule.into;
    }
    return { into: rule.into, both: !!rule.both, key: `cross:${rule.a}:${rule.b}` };
  }
  return null;
}

function connectedGroup(map, start, baseId) {
  const seen = new Set([key(start.x, start.y)]);
  const stack = [start];
  const out = [];
  while (stack.length) {
    const c = stack.pop();
    out.push(c);
    for (const n of neighbors(map, c)) {
      const k = key(n.x, n.y);
      if (seen.has(k) || !n.card) continue;
      const id = n.card.variant || n.card.id;
      if (id === baseId) {
        seen.add(k);
        stack.push(n);
      }
    }
  }
  return out;
}

export function placeCard(map, c, cardId) {
  if (!canPlace(map, c, cardId)) return null;
  const def = CARDS[cardId];
  c.card = { id: cardId, variant: null };

  let formed = null;
  if (def.combo) {
    const group = connectedGroup(map, c, cardId);
    if (group.length >= def.combo.same) {
      for (const g of group) g.card.variant = def.combo.into;
      // 变形后可能触发连锁（仅记录展示）
      formed = { from: cardId, into: def.combo.into, count: group.length, key: `same:${cardId}` };
    }
  }

  const crossed = applyCrossCombo(map, c, cardId);

  return {
    formed,
    crossed,
    spawner: def.spawn ? { x: c.x, y: c.y, type: def.spawn, pathIndex: adjacentPath(map, c) } : null,
    tower: def.periodic ? { x: c.x, y: c.y, cardId, pathIndex: adjacentPath(map, c), timer: 0, ...def.periodic } : null,
    passive: def.healPass ? { pathIndex: adjacentPath(map, c), frac: def.healPass } : null,
    slowCell: def.slow ? adjacentPath(map, c) : -1,
  };
}

export function adjacentPath(map, c) {
  for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    const i = pathIndexAt(map, c.x + dx, c.y + dy);
    if (i !== undefined) return i;
  }
  // 兜底：全图搜索最近道路
  let best = 0, bestD = Infinity;
  map.path.forEach((p, i) => {
    const d = Math.abs(p.x - c.x) + Math.abs(p.y - c.y);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

function pathIndexAt(map, x, y) { return map.pathIndex.get(key(x, y)); }

export function mapStats(map) {
  const s = {
    maxHp: 0, atk: 0, atkSpeed: 0, regen: 0, vamp: 0, evade: 0,
    lootBonus: 0, xpBonus: 0, speedBonus: 0, soulChance: 0,
    enemyDmgReduce: 0, enemyCapReduce: 0, bossPower: 0, soulMaxHp: 0, arsenal: 0,
    zeroBeacon: null, revive: false,
    healPass: [], towers: [], spawners: [], potionPass: [], resourcePass: [], libraryPass: [], questPass: [], forgePass: [],
  };
  for (const row of map.grid) {
    for (const c of row) {
      if (!c.card) continue;
      const id = c.card.variant || c.card.id;
      const def = CARDS[id];
      if (!def) continue;

      // 河流：相邻地形效果翻倍
      let mult = 1;
      const near = neighbors(map, c);
      if (def.kind === 'landscape' && id !== 'river' && id !== 'bridge' &&
          near.some((n) => n.card && (n.card.variant || n.card.id) === 'river')) {
        mult = 2;
      }
      if (near.some((n) => n.card && (n.card.variant || n.card.id) === 'timeCrystal')) {
        mult *= 2;
      }

      for (const [k, v] of Object.entries(def.mods || {})) {
        if (k in s) s[k] += v * mult;
      }

      // 岩石 / 山脉：每块相邻岩石额外 +2 生命
      if (id === 'rock' || id === 'mountain') {
        const adjRocks = near.filter((n) => n.card && ['rock', 'mountain'].includes(n.card.variant || n.card.id)).length;
        s.maxHp += 2 * adjRocks;
      }

      if (def.lootBonus) s.lootBonus += def.lootBonus;
      if (def.xpBonus) s.xpBonus += def.xpBonus;
      if (def.speedBonus) s.speedBonus += def.speedBonus;
      if (def.soulChance) s.soulChance += def.soulChance;
      if (def.enemyDmgReduce) s.enemyDmgReduce += def.enemyDmgReduce;
      if (def.enemyCapReduce) s.enemyCapReduce += def.enemyCapReduce;
      if (def.bossPower) s.bossPower += def.bossPower;
      if (def.soulMaxHp) s.soulMaxHp += def.soulMaxHp;
      if (def.potionPass) s.potionPass.push(adjacentPath(map, c));
      if (def.resourcePass) s.resourcePass.push({ pathIndex: adjacentPath(map, c), amount: def.resourcePass });
      if (def.swapPass) {
        s.libraryPass.push({
          pathIndex: adjacentPath(map, c),
          count: def.swapPass,
          max: def.collapseAfter || 20,
          cell: c,
        });
      }
      if (def.zeroBeacon && s.zeroBeacon == null) s.zeroBeacon = adjacentPath(map, c);
      if (def.revive) s.revive = true;
      if (def.arsenalSlot) s.arsenal += 1;
      if (def.quest) s.questPass.push({ pathIndex: adjacentPath(map, c), tier: def.quest });
      if (def.forgePass) s.forgePass.push(adjacentPath(map, c));
      if (def.healPass) {
        let frac = def.healPass;
        if (id === 'village') {
          frac += near.filter((n) => n.card && (n.card.variant || n.card.id) === 'wheat').length * 0.05;
        }
        s.healPass.push({ pathIndex: adjacentPath(map, c), frac });
      }
      if (def.periodic) {
        s.towers.push({ x: c.x, y: c.y, cardId: def.id, pathIndex: adjacentPath(map, c), timer: 0, ...def.periodic });
      }
    }
  }
  return s;
}

// 敌人从地形旁的道路格生成
export function spawnEnemies(map, loop, makeEnemy) {
  const out = [];
  for (const row of map.grid) {
    for (const c of row) {
      if (!c.card) continue;
      const def = CARDS[c.card.variant || c.card.id];
      if (!def || !def.spawn) continue;
      const elite = Math.random() < 0.06 + loop * 0.012;
      out.push(makeEnemy(def.spawn, loop, { elite, cell: adjacentPath(map, c) }));
    }
  }
  return out;
}
