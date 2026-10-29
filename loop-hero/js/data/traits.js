// 升级时三选一的天赋
export const TRAITS = [
  { id: 'vitality', name: '体魄', glyph: '体', desc: '最大生命 +18，并立即回复等量生命。', apply(h) { h.bonus.maxHp += 18; h.hp += 18; } },
  { id: 'blade', name: '锋刃', glyph: '刃', desc: '攻击力 +2。', apply(h) { h.bonus.atk += 2; } },
  { id: 'shield', name: '铁壁', glyph: '壁', desc: '防御 +2。', apply(h) { h.bonus.def += 2; } },
  { id: 'swift', name: '迅捷', glyph: '迅', desc: '攻击速度 +6%。', apply(h) { h.bonus.atkSpeed += 0.06; } },
  { id: 'bloodthirst', name: '嗜血', glyph: '嗜', desc: '吸血 +3%。', apply(h) { h.bonus.vamp += 0.03; } },
  { id: 'precision', name: '精准', glyph: '准', desc: '暴击率 +6%。', apply(h) { h.bonus.crit += 0.06; } },
  { id: 'regrowth', name: '再生', glyph: '生', desc: '每秒回复 +0.8。', apply(h) { h.bonus.regen += 0.8; } },
  { id: 'agile', name: '灵巧', glyph: '巧', desc: '闪避 +4%。', apply(h) { h.bonus.evade += 0.04; } },
  { id: 'fortune', name: '幸运', glyph: '运', desc: '装备掉落品质 +15%。', apply(h) { h.bonus.lootBonus += 0.15; } },
  { id: 'brutal', name: '重击', glyph: '重', desc: '暴击伤害 +25%。', apply(h) { h.bonus.critDmg += 0.25; } },

  // 战士
  { id: 'shieldWall', name: '盾墙', glyph: '盾', desc: '防御 +3。', classes: ['warrior'], apply(h) { h.bonus.def += 3; } },
  { id: 'riposte', name: '还击', glyph: '还', desc: '反击概率 +12%。', classes: ['warrior'], apply(h) { h.counterChance += 0.12; } },
  { id: 'unyielding', name: '不屈', glyph: '屈', desc: '最大生命 +30，每秒回复 +0.3。', classes: ['warrior'], apply(h) { h.bonus.maxHp += 30; h.bonus.regen += 0.3; } },

  // 盗贼
  { id: 'shadowStrike', name: '影袭', glyph: '影', desc: '闪避 +6%。', classes: ['rogue'], apply(h) { h.bonus.evade += 0.06; } },
  { id: 'deadly', name: '致命', glyph: '致', desc: '暴击伤害 +30%。', classes: ['rogue'], apply(h) { h.bonus.critDmg += 0.3; } },
  { id: 'plunder', name: '战利品猎人', glyph: '猎', desc: '装备掉落品质 +20%。', classes: ['rogue'], apply(h) { h.bonus.lootBonus += 0.2; } },

  // 死灵法师
  { id: 'boneLord', name: '白骨领主', glyph: '骨', desc: '骷髅上限 +1。', classes: ['necromancer'], apply(h) { h.skeletonBonus += 1; } },
  { id: 'gravePower', name: '墓穴之力', glyph: '墓', desc: '骷髅攻击 +2。', classes: ['necromancer'], apply(h) { h.skeletonAtkBonus += 2; } },
  { id: 'soulSiphon', name: '灵魂虹吸', glyph: '吸', desc: '吸血 +4%。', classes: ['necromancer'], apply(h) { h.bonus.vamp += 0.04; } },
];
