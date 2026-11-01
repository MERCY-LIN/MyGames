// 三职业：基础属性、装备栏、被动
export const CLASSES = {
  warrior: {
    id: 'warrior',
    name: '战士',
    glyph: '♞',
    color: '#d8b25a',
    tagline: '铁壁与反击',
    desc: '生命与防御最高。受击时有 20% 概率以 80% 攻击力反击。',
    base: {
      maxHp: 123, atk: 10, def: 3, atkSpeed: 1.05,
      crit: 0.05, critDmg: 1.6, vamp: 0, regen: 0.3, evade: 0.02, speed: 2.15,
    },
    slots: [
      { id: 'weapon', label: '武', kind: 'weapon' },
      { id: 'armor', label: '甲', kind: 'armor' },
      { id: 'amulet', label: '饰', kind: 'amulet' },
    ],
    unlock: null,
    passives: { counter: 0.15 },
  },

  rogue: {
    id: 'rogue',
    name: '盗贼',
    glyph: '☙',
    color: '#8fbf9f',
    tagline: '双刃与战利品',
    desc: '双持武器，攻速与暴击更高，但护甲薄弱。攻击有 20% 概率打出 1.6 倍连击，击杀额外获得资源。',
    base: {
      maxHp: 105, atk: 11, def: 1, atkSpeed: 1.22,
      crit: 0.15, critDmg: 1.85, vamp: 0.03, regen: 0.25, evade: 0.12, speed: 2.4,
    },
    slots: [
      { id: 'weapon', label: '武', kind: 'weapon' },
      { id: 'offhand', label: '副', kind: 'weapon' },
      { id: 'amulet', label: '饰', kind: 'amulet' },
    ],
    unlock: 'guild',
    passives: { doubleStrike: 0.2, trophy: true },
  },

  necromancer: {
    id: 'necromancer',
    name: '死灵法师',
    glyph: '☠',
    color: '#a98bd0',
    tagline: '白骨之潮',
    desc: '不依赖自身攻击：每场战斗召唤骷髅作战，骷髅会替你承受大部分攻击。法杖强化骷髅。',
    base: {
      maxHp: 92, atk: 6, def: 1, atkSpeed: 0.9,
      crit: 0.06, critDmg: 1.5, vamp: 0, regen: 0.25, evade: 0.03, speed: 2.1,
    },
    slots: [
      { id: 'staff', label: '杖', kind: 'weapon' },
      { id: 'amulet', label: '饰', kind: 'amulet' },
      { id: 'ring', label: '戒', kind: 'amulet' },
    ],
    unlock: 'crypt',
    passives: { summon: true },
  },
};

export const CLASS_ORDER = ['warrior', 'rogue', 'necromancer'];

export function classById(id) {
  return CLASSES[id] || CLASSES.warrior;
}

export function classUnlocked(meta, id) {
  const cls = CLASSES[id];
  if (!cls) return false;
  if (!cls.unlock) return true;
  return (meta.buildings[cls.unlock] || 0) > 0;
}

export function availableClasses(meta) {
  return CLASS_ORDER.filter((id) => classUnlocked(meta, id));
}
