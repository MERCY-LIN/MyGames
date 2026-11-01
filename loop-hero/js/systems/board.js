// 棋盘查询：悬停信息、放置合法性提示（纯函数，供 Game / UI 调用）
import { CARDS } from '../data/cards.js';
import { CLASSES } from '../data/classes.js';
import { cellAt, canPlace, canPlaceReason } from '../world/loopMap.js';
import { describeAbilities } from '../data/abilities.js';

export function cellInfo(run, x, y) {
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

  const cellEnemies = run.enemies.filter((e) => e.alive && e.cell === idx);
  let enemy = null;
  if (run.target && run.target.cell === idx && run.target.alive) enemy = run.target;
  else enemy = cellEnemies[0];

  if (enemy) {
    const abs = describeAbilities(enemy).map((a) => a.name);
    const extra = [];
    if (abs.length) extra.push(`能力：${abs.join('/')}`);
    if (cellEnemies.length > 1) extra.push(`同格 ${cellEnemies.length} 敌`);
    return {
      name: enemy.name,
      kind: enemy.boss ? '首领' : '敌人',
      desc: `生命 ${Math.ceil(enemy.hp)} / ${enemy.maxHp} · 攻击 ${enemy.atk} · 攻速 ${enemy.speed}${enemy.elite ? ' · 精英' : ''}${extra.length ? ` · ${extra.join(' · ')}` : ''}`,
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

export function placementHint(cardId) {
  const def = CARDS[cardId];
  if (!def) return '';
  if (cardId === 'forget') return '需要一块已放置的地形';
  if (cardId === 'wheat') return '需要紧挨着村庄';
  if (cardId === 'bloodGrove') return '需要紧挨着森林';
  if (def.kind === 'roadside') return '只能放在道路旁的空位';
  if (def.kind === 'landscape') return '可放在环线四周的野地';
  return '特殊卡牌不能在探索中放置';
}

export function placementSummary(run, cardId) {
  const def = CARDS[cardId];
  if (!def) return null;
  let valid = 0;
  for (const row of run.map.grid) {
    for (const cell of row) if (canPlace(run.map, cell, cardId)) valid += 1;
  }
  return { name: def.name, valid, hint: placementHint(cardId) };
}

export function placementCheck(run, x, y, cardId) {
  const def = CARDS[cardId];
  if (!def) return null;
  const reason = canPlaceReason(run.map, cellAt(run.map, x, y), cardId);
  return { name: def.name, ok: !reason, reason: reason || '点击放下这张牌' };
}
