// 战利品：装备生成、比较、资源掉落
import { RARITY } from '../core/config.js';
import { rng } from '../core/rng.js';

const NAMES = {
  weapon: ['铁剑', '战斧', '长枪', '弯刀', '碎骨锤'],
  offhand: ['短刃', '匕首', '手斧', '刺剑'],
  armor: ['皮甲', '锁子甲', '板甲', '旅人斗篷', '骨制胸甲'],
  amulet: ['骨戒', '银坠', '魂符', '血石', '旧怀表'],
  staff: ['骨杖', '槐木杖', '魂灯杖', '枯枝法杖'],
  ring: ['骨戒', '血石指环', '铜环', '刻纹指环'],
};

const SLOT_NAMES = {
  weapon: '武器', offhand: '副手', armor: '护甲',
  amulet: '饰品', staff: '法杖', ring: '戒指',
};

export function rollRarity(luck = 0) {
  const r = rng.next();
  const epic = 0.10 + luck * 0.35;
  const rare = 0.30 + luck * 0.5;
  if (r < epic) return 'epic';
  if (r < epic + rare) return 'rare';
  return 'common';
}

export function rollEquip(loop, luck = 0, slot = null) {
  slot = slot || rng.pick(['weapon', 'armor', 'amulet']);
  const kind = slot === 'armor' ? 'armor' : (slot === 'amulet' || slot === 'ring') ? 'amulet' : 'weapon';
  const rarity = rollRarity(luck);
  const mult = RARITY[rarity].mult;
  const stats = {};
  const lv = Math.max(1, loop);
  const factor = slot === 'offhand' ? 0.78 : slot === 'staff' ? 0.85 : 1;

  if (kind === 'weapon') {
    stats.atk = round1((2 + lv * 0.85) * mult * factor * rng.float(0.9, 1.1));
    if (rarity !== 'common') stats.crit = round3(0.02 * (rarity === 'epic' ? 2 : 1));
  } else if (kind === 'armor') {
    stats.def = round1((1 + lv * 0.4) * mult * rng.float(0.9, 1.1));
    stats.maxHp = Math.round((8 + lv * 3) * mult);
  } else {
    stats.vamp = round3(0.015 * mult * rng.float(0.9, 1.1));
    stats.maxHp = Math.round((4 + lv * 1.5) * mult);
    if (rarity === 'epic') stats.crit = 0.03;
  }

  const prefix = rarity === 'epic' ? '古老的' : rarity === 'rare' ? '精制的' : '';
  return {
    uid: `i${rng.int(1e5, 9e5)}`,
    slot,
    rarity,
    name: `${prefix}${rng.pick(NAMES[slot])}`,
    slotName: SLOT_NAMES[slot],
    stats,
    loop,
  };
}

export function itemScore(it) {
  if (!it) return 0;
  const s = it.stats || {};
  return (s.atk || 0) * 3.2 + (s.def || 0) * 4.5 + (s.maxHp || 0) * 0.45 +
    (s.vamp || 0) * 90 + (s.crit || 0) * 70 + (s.atkSpeed || 0) * 120;
}

export function equipIfBetter(h, item) {
  const cur = h.equipment[item.slot];
  if (itemScore(item) > itemScore(cur)) {
    h.equipment[item.slot] = item;
    return { equipped: true, old: cur };
  }
  return { equipped: false, old: cur };
}

export function rollResources(enemy, loop) {
  const out = { wood: 0, stone: 0, soul: 0 };
  const amount = 1 + Math.floor(loop / 3);
  for (const [res, chance] of Object.entries(enemy.loot || {})) {
    if (rng.chance(chance)) out[res] += rng.int(1, amount);
  }
  return out;
}

function round1(v) { return Math.round(v * 10) / 10; }
function round3(v) { return Math.round(v * 1000) / 1000; }
