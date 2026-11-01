// 营地建筑：解锁卡牌、永久强化
// 资源：wood 木材 / stone 石料 / soul 魂晶

export const BUILDINGS = [
  {
    id: 'campfire', name: '营火', glyph: '火', maxLevel: 3,
    desc: (lv) => `每圈结束额外回复 ${10 * lv}% 生命。`,
    cost: (lv) => ({ wood: 6 * lv, stone: 4 * lv, soul: 0 }),
  },
  {
    id: 'gym', name: '训练场', glyph: '训', maxLevel: 3,
    desc: (lv) => `英雄最大生命 +${10 * lv}。`,
    cost: (lv) => ({ wood: 8 * lv, stone: 3 * lv, soul: 0 }),
  },
  {
    id: 'farm', name: '农田', glyph: '田', maxLevel: 1,
    desc: () => '解锁地形：麦田、河流。',
    cost: () => ({ wood: 8, stone: 4, soul: 0 }),
  },
  {
    id: 'cemetery', name: '墓园', glyph: '墓', maxLevel: 1,
    desc: () => '解锁地形：墓地、战场。',
    cost: () => ({ wood: 4, stone: 10, soul: 0 }),
  },
  {
    id: 'lodge', name: '猎人小屋', glyph: '猎', maxLevel: 1,
    desc: () => '解锁地形：小树林、吸血鬼宅邸、血林。',
    cost: () => ({ wood: 12, stone: 6, soul: 0 }),
  },
  {
    id: 'smithy', name: '铁匠铺', glyph: '锻', maxLevel: 1,
    desc: () => '解锁地形：铁匠铺、废墟；装备掉落品质 +10%。',
    cost: () => ({ wood: 6, stone: 12, soul: 1 }),
  },
  {
    id: 'watchtower', name: '瞭望塔', glyph: '塔', maxLevel: 1,
    desc: () => '解锁地形：瞭望塔、风暴神殿、沙丘。',
    cost: () => ({ wood: 8, stone: 14, soul: 1 }),
  },
  {
    id: 'fort', name: '强盗要塞', glyph: '寨', maxLevel: 1,
    desc: () => '解锁地形：强盗营地、哥布林营地、沼泽。',
    cost: () => ({ wood: 16, stone: 8, soul: 2 }),
  },
  {
    id: 'guild', name: '盗贼公会', glyph: '会', maxLevel: 1,
    desc: () => '解锁职业：盗贼。',
    cost: () => ({ wood: 14, stone: 8, soul: 1 }),
  },
  {
    id: 'crypt', name: '地下墓穴', glyph: '穴', maxLevel: 1,
    desc: () => '解锁职业：死灵法师；解锁地形：先祖墓穴。',
    cost: () => ({ wood: 6, stone: 18, soul: 3 }),
  },
  {
    id: 'library', name: '图书馆', glyph: '书', maxLevel: 1,
    desc: () => '解锁地形：图书室、废弃图书室。',
    cost: () => ({ wood: 10, stone: 8, soul: 2 }),
  },
  {
    id: 'armory', name: '军械库', glyph: '械', maxLevel: 1,
    desc: () => '解锁地形：军械库、宝库。',
    cost: () => ({ wood: 8, stone: 16, soul: 2 }),
  },
  {
    id: 'beacon', name: '灯塔', glyph: '灯', maxLevel: 1,
    desc: () => '解锁地形：时空灯塔、芦苇。',
    cost: () => ({ wood: 12, stone: 10, soul: 2 }),
  },
  {
    id: 'inn', name: '客栈', glyph: '栈', maxLevel: 1,
    desc: () => '药剂携带上限 +1。',
    cost: () => ({ wood: 12, stone: 6, soul: 1 }),
  },
  {
    id: 'healerHut', name: '医师的小屋', glyph: '医', maxLevel: 1,
    desc: () => '药剂治疗效果 +10%。',
    cost: () => ({ wood: 8, stone: 8, soul: 2 }),
  },
  {
    id: 'forge', name: '出色的铁炉', glyph: '炉', maxLevel: 2,
    desc: (lv) => `开局武器攻击 +${lv}。`,
    cost: (lv) => ({ wood: 10 * lv, stone: 14 * lv, soul: 2 * lv }),
  },
  {
    id: 'supplies', name: '补给站', glyph: '补', maxLevel: 1,
    desc: () => '每次远征额外携带 1 瓶药剂。',
    cost: () => ({ wood: 8, stone: 6, soul: 1 }),
  },
  {
    id: 'lumberjack', name: '伐木工', glyph: '木', maxLevel: 1,
    desc: () => '木材掉落 +1。',
    cost: () => ({ wood: 14, stone: 4, soul: 0 }),
  },
  {
    id: 'forestCamp', name: '森林', glyph: '林', maxLevel: 1,
    desc: () => '英雄攻击速度 +5%。',
    cost: () => ({ wood: 16, stone: 6, soul: 1 }),
  },
  {
    id: 'smelter', name: '熔炼炉', glyph: '熔', maxLevel: 1,
    desc: () => '石料掉落 +1。',
    cost: () => ({ wood: 10, stone: 16, soul: 2 }),
  },
  {
    id: 'academy', name: '学院', glyph: '院', maxLevel: 1,
    desc: () => '解锁地形：追忆迷宫、零之界标、异次元裂缝。',
    cost: () => ({ wood: 8, stone: 10, soul: 6 }),
  },
  {
    id: 'alchemist', name: '炼金术士帐篷', glyph: '炼', maxLevel: 1,
    desc: () => '药剂上限 +1，治疗效果 +5%。',
    cost: () => ({ wood: 6, stone: 12, soul: 3 }),
  },
  {
    id: 'intel', name: '情报所', glyph: '情', maxLevel: 2,
    desc: (lv) => `手牌上限 +${lv}。`,
    cost: (lv) => ({ wood: 5 * lv, stone: 5 * lv, soul: 3 * lv }),
  },
];

const UPGRADE_TREE = {
  gym: { requires: (lv) => (lv >= 2 ? [{ id: 'campfire', level: 2 }] : []) },
  smelter: {
    maxLevel: 2, tier: 2,
    requires: (lv) => (lv >= 2 ? [{ id: 'forge', level: 1 }] : []),
    cost: (lv) => ({ wood: 10 * lv, stone: 16 * lv, soul: 2 * lv, metal: lv >= 2 ? 3 : 0 }),
  },
  library: {
    maxLevel: 2, tier: 2,
    requires: (lv) => (lv >= 2 ? [{ id: 'academy', level: 1 }] : []),
    cost: (lv) => ({ wood: 10 * lv, stone: 8 * lv, soul: 2 * lv, shard: lv >= 2 ? 2 : 0 }),
  },
  academy: {
    maxLevel: 2, tier: 2,
    requires: (lv) => (lv >= 2 ? [{ id: 'library', level: 1 }] : []),
    cost: (lv) => ({ wood: 8 * lv, stone: 10 * lv, soul: 6 * lv, shard: lv >= 2 ? 3 : 0 }),
  },
  intel: {
    maxLevel: 3, tier: 3,
    requires: (lv) => (lv >= 3 ? [{ id: 'library', level: 1 }] : []),
    cost: (lv) => ({ wood: 5 * lv, stone: 5 * lv, soul: 3 * lv, shard: lv >= 3 ? 3 : 0 }),
  },
  healerHut: {
    maxLevel: 2, tier: 2,
    requires: (lv) => (lv >= 2 ? [{ id: 'inn', level: 1 }] : []),
  },
  armory: {
    maxLevel: 2, tier: 2,
    requires: (lv) => (lv >= 2 ? [{ id: 'forge', level: 1 }] : []),
    cost: (lv) => ({ wood: 8 * lv, stone: 16 * lv, soul: 2 * lv, metal: lv >= 2 ? 4 : 0 }),
  },
  forge: {
    tier: 2,
    requires: (lv) => (lv >= 2 ? [{ id: 'smithy', level: 1 }] : []),
    cost: (lv) => ({ wood: 10 * lv, stone: 14 * lv, soul: 2 * lv, metal: lv >= 2 ? 4 : 0 }),
  },
};

for (const b of BUILDINGS) {
  Object.assign(b, { tier: 1, requires: () => [] }, UPGRADE_TREE[b.id] || {});
}

export const BUILDING_BY_ID = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

export const RES_NAMES = {
  wood: '木材', stone: '石料', soul: '魂晶',
  metal: '稳定金属', shard: '记忆碎片', tome: '古籍',
};
