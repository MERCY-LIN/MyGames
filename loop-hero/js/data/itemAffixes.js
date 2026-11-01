// 装备词条池：按槽位 × 稀有度生成，保证每个词条都在 deriveHero 有消费点
export const AFFIX_POOL = {
  weapon: {
    common: ['atk'],
    rare: ['crit'],
    epic: ['critDmg', 'atkSpeed'],
  },
  offhand: {
    common: ['def', 'maxHp'],
    rare: ['evade'],
    epic: ['counterChance'],
  },
  armor: {
    common: ['def', 'maxHp'],
    rare: ['regen'],
    epic: ['damageReduction'],
  },
  amulet: {
    common: ['maxHp'],
    rare: ['vamp'],
    epic: ['lootBonus', 'xpBonus'],
  },
  staff: {
    common: ['atk'],
    rare: ['regen'],
    epic: ['vamp'],
  },
  ring: {
    common: ['maxHp'],
    rare: ['crit', 'evade'],
    epic: ['vamp'],
  },
};

export const AFFIX_KEYS = [
  'maxHp', 'atk', 'def', 'atkSpeed', 'crit', 'critDmg', 'vamp', 'regen', 'evade',
  'lootBonus', 'xpBonus', 'counterChance', 'damageReduction',
];

const PERCENT = new Set(['crit', 'critDmg', 'vamp', 'evade', 'lootBonus', 'xpBonus', 'counterChance', 'damageReduction']);

/** 词条数值：以「1 点战力」为基准，随圈数缓慢成长 */
export function affixValue(key, rarity, loop) {
  const lv = Math.max(1, loop);
  const mult = rarity === 'epic' ? 2 : rarity === 'rare' ? 1.4 : 1;
  switch (key) {
    case 'atk': return round1((2 + lv * 0.85) * mult);
    case 'def': return round1((1 + lv * 0.4) * mult);
    case 'maxHp': return Math.round((8 + lv * 3) * mult);
    case 'atkSpeed': return round3(0.04);
    case 'crit': return round3(rarity === 'epic' ? 0.03 : 0.02);
    case 'critDmg': return round3(0.15);
    case 'vamp': return round3(0.015 * mult);
    case 'regen': return round1(rarity === 'epic' ? 0.8 : 0.4);
    case 'evade': return round3(rarity === 'epic' ? 0.03 : 0.02);
    case 'lootBonus': return round3(0.10);
    case 'xpBonus': return round3(0.08);
    case 'counterChance': return round3(0.06);
    case 'damageReduction': return round3(rarity === 'epic' ? 0.04 : 0.02);
    default: return 0;
  }
}

export function isPercentAffix(key) {
  return PERCENT.has(key);
}

function round1(v) { return Math.round(v * 10) / 10; }
function round3(v) { return Math.round(v * 1000) / 1000; }
