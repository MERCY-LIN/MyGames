// 图鉴发现记录
import { saveMeta } from './save.js';

function ensure(meta) {
  if (!meta.codex) meta.codex = { cards: {}, combos: {}, enemies: {} };
  for (const key of ['cards', 'combos', 'enemies']) {
    if (!meta.codex[key]) meta.codex[key] = {};
  }
  return meta.codex;
}

export function markCard(meta, id) {
  if (!id) return;
  const codex = ensure(meta);
  if (codex.cards[id]) return;
  codex.cards[id] = true;
  saveMeta(meta);
}

export function markCombo(meta, key) {
  if (!key) return;
  const codex = ensure(meta);
  if (codex.combos[key]) return;
  codex.combos[key] = true;
  saveMeta(meta);
}

export function markEnemy(meta, type) {
  if (!type) return;
  const codex = ensure(meta);
  if (codex.enemies[type]) return;
  codex.enemies[type] = true;
  saveMeta(meta);
}

export function seenCard(meta, id) { return !!meta.codex?.cards?.[id]; }
export function seenCombo(meta, key) { return !!meta.codex?.combos?.[key]; }
export function seenEnemy(meta, type) { return !!meta.codex?.enemies?.[type]; }
