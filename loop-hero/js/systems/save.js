// 存档：只存营地元进度（资源、建筑、记录）
import { SAVE_KEY } from '../core/config.js';
import { BUILDINGS } from '../data/buildings.js';
import { CLASSES } from '../data/classes.js';

export function defaultMeta() {
  const buildings = {};
  BUILDINGS.forEach((b) => { buildings[b.id] = 0; });
  return {
    version: 4,
    resources: { wood: 0, stone: 0, soul: 0, metal: 0, shard: 0, tome: 0 },
    buildings,
    codex: { cards: {}, combos: {}, enemies: {} },
    classId: 'warrior',
    deck: [],
    autoEquip: false,
    chapter: 1,
    chapterMax: 1,
    infinite: false,
    bestLayer: 0,
    bestLoop: 0,
    runs: 0,
    victories: 0,
    createdAt: Date.now(),
  };
}

export function loadMeta() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultMeta();
    const data = JSON.parse(raw);
    const meta = defaultMeta();
    if (data.resources) Object.assign(meta.resources, data.resources);
    if (data.buildings) {
      for (const b of BUILDINGS) {
        meta.buildings[b.id] = Math.max(0, Math.min(b.maxLevel, Number(data.buildings[b.id]) || 0));
      }
    }
    meta.bestLoop = Number(data.bestLoop) || 0;
    meta.runs = Number(data.runs) || 0;
    meta.victories = Number(data.victories) || 0;
    if (data.codex && typeof data.codex === 'object') {
      for (const key of ['cards', 'combos', 'enemies']) {
        if (data.codex[key] && typeof data.codex[key] === 'object') meta.codex[key] = { ...data.codex[key] };
      }
    }
    if (typeof data.classId === 'string' && CLASSES[data.classId]) meta.classId = data.classId;
    if (Array.isArray(data.deck)) {
      meta.deck = data.deck.filter((id) => typeof id === 'string').slice(0, 30);
    }
    meta.autoEquip = !!data.autoEquip;
    const ch = Number(data.chapter);
    if (ch >= 1 && ch <= 4) meta.chapter = ch;
    const max = Number(data.chapterMax);
    if (max >= 1 && max <= 4) meta.chapterMax = max;
    meta.infinite = !!data.infinite && meta.chapterMax >= 4;
    meta.bestLayer = Number(data.bestLayer) || 0;
    return meta;
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(meta) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(meta));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* 忽略 */ }
}
