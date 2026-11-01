// 战利品：装备生成、比较、资源掉落
import { RARITY } from '../core/config.js';
import { rng } from '../core/rng.js';
import { AFFIX_POOL, AFFIX_KEYS, affixValue } from '../data/itemAffixes.js';

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
  const rarity = rollRarity(luck);
  const stats = {};
  const lv = Math.max(1, loop);
  const tiers = ['common'];
  if (rarity === 'rare' || rarity === 'epic') tiers.push('rare');
  if (rarity === 'epic') tiers.push('epic');
  const pool = AFFIX_POOL[slot] || AFFIX_POOL.weapon;
  for (const tier of tiers) {
    for (const key of pool[tier] || []) {
      const base = affixValue(key, rarity, lv);
      const jitter = key === 'atk' || key === 'def' || key === 'maxHp' ? rng.float(0.9, 1.1) : 1;
      stats[key] = round3((stats[key] || 0) + base * jitter);
    }
  }
  for (const key of Object.keys(stats)) {
    if (!AFFIX_KEYS.includes(key)) delete stats[key];
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
    (s.vamp || 0) * 90 + (s.crit || 0) * 70 + (s.atkSpeed || 0) * 120 +
    (s.critDmg || 0) * 40 + (s.regen || 0) * 6 + (s.evade || 0) * 90 +
    (s.counterChance || 0) * 80 + (s.damageReduction || 0) * 600 +
    (s.lootBonus || 0) * 50 + (s.xpBonus || 0) * 40;
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
  const out = { wood: 0, stone: 0, soul: 0, metal: 0, shard: 0, tome: 0 };
  const amount = 1 + Math.floor(loop / 3);
  for (const [res, chance] of Object.entries(enemy.loot || {})) {
    if (rng.chance(chance)) out[res] += rng.int(1, amount);
  }
  if (enemy.elite) {
    if (rng.chance(0.25)) out.metal += 1;
    if (rng.chance(0.15)) out.shard += 1;
  }
  return out;
}

function round3(v) { return Math.round(v * 1000) / 1000; }
