// 卡牌 / 地形定义（对照本机 Loop Hero 的 lang_chisimp.ini 整理）
// kind: landscape 只能放在野地，roadside 只能贴着道路
// mods: 放置后对英雄的持续加成
// spawn: 每圈在该地形旁生成一只敌人
// unlock: 需要营地建筑解锁（null 为初始牌）

export const CARDS = {
  rock: {
    id: 'rock', name: '岩石', glyph: '岩', kind: 'landscape',
    desc: '最大生命 +2。三块相邻岩石会隆起为山脉。',
    color: '#8d8f96', mods: { maxHp: 2 },
    combo: { same: 3, into: 'mountain' },
  },
  mountain: {
    id: 'mountain', name: '山脉', glyph: '山', kind: 'landscape',
    desc: '最大生命 +6。', color: '#a8aab2', mods: { maxHp: 6 }, hidden: true,
  },
  peak: {
    id: 'peak', name: '山峰', glyph: '峰', kind: 'landscape',
    desc: '最大生命 +8，每圈生成一只鹰身女妖。', color: '#b9bcc6',
    mods: { maxHp: 8 }, spawn: 'harpy', unlock: 'watchtower',
  },
  forest: {
    id: 'forest', name: '森林', glyph: '林', kind: 'landscape',
    desc: '攻击速度 +1%。三片相邻森林会生长为灌木丛。',
    color: '#4f7a52', mods: { atkSpeed: 0.01 },
    combo: { same: 3, into: 'thicket' },
  },
  thicket: {
    id: 'thicket', name: '灌木丛', glyph: '灌', kind: 'landscape',
    desc: '攻击速度 +2%。', color: '#3f6b45', mods: { atkSpeed: 0.02 }, hidden: true,
  },
  meadow: {
    id: 'meadow', name: '草地', glyph: '草', kind: 'landscape',
    desc: '每秒回复 +0.4。三片相邻草地会开成茂密草原。',
    color: '#6d8b4e', mods: { regen: 0.4 },
    combo: { same: 3, into: 'bloom' },
  },
  bloom: {
    id: 'bloom', name: '茂密草原', glyph: '茂', kind: 'landscape',
    desc: '每秒回复 +1.0。', color: '#8aa25a', mods: { regen: 1.0 }, hidden: true,
  },
  river: {
    id: 'river', name: '河流', glyph: '川', kind: 'landscape',
    desc: '攻击速度 +1%。', color: '#4b7d8f', mods: { atkSpeed: 0.01 }, unlock: 'farm',
  },
  bridge: {
    id: 'bridge', name: '桥', glyph: '桥', kind: 'landscape',
    desc: '没有实际效果，只是把河岸连起来。', color: '#8a7a5a', mods: {}, unlock: 'farm',
  },
  dunes: {
    id: 'dunes', name: '沙丘', glyph: '沙', kind: 'landscape',
    desc: '闪避 +1%。三块相邻沙丘会风化成沙漠。', color: '#b8a477',
    mods: { evade: 0.01 }, combo: { same: 3, into: 'desert' }, unlock: 'watchtower',
  },
  desert: {
    id: 'desert', name: '沙漠', glyph: '漠', kind: 'landscape',
    desc: '闪避 +1.5%。', color: '#c2a36b', mods: { evade: 0.015 }, hidden: true,
  },
  oasis: {
    id: 'oasis', name: '绿洲', glyph: '洲', kind: 'landscape',
    desc: '每秒回复 +0.6，经过时回复 5% 生命。', color: '#5f9aa8',
    mods: { regen: 0.6 }, healPass: 0.05, unlock: 'farm',
  },
  bloodGrove: {
    id: 'bloodGrove', name: '血魔树林', glyph: '血', kind: 'landscape',
    desc: '吸血 +1%。', color: '#7a3f43', mods: { vamp: 0.01 }, unlock: 'lodge',
  },
  wheat: {
    id: 'wheat', name: '麦田', glyph: '麦', kind: 'landscape',
    desc: '最大生命 +3，经过时回复 5% 生命。', color: '#a8974f',
    mods: { maxHp: 3 }, healPass: 0.05, unlock: 'farm',
  },
  burntForest: {
    id: 'burntForest', name: '焦土森林', glyph: '焦', kind: 'landscape',
    desc: '攻击 +1。', color: '#5a4a3e', mods: { atk: 1 }, unlock: 'lodge',
  },
  hungryGrove: {
    id: 'hungryGrove', name: '饥饿树林', glyph: '饿', kind: 'landscape',
    desc: '攻击 +2，但每秒流失 0.1 生命。', color: '#5f3a3a',
    mods: { atk: 2, regen: -0.1 }, unlock: 'lodge',
  },
  savanna: {
    id: 'savanna', name: '茂草原', glyph: '原', kind: 'landscape',
    desc: '最大生命 +2，每圈生成一个稻草人。', color: '#8f9a5a',
    mods: { maxHp: 2 }, spawn: 'scarecrow', unlock: 'farm',
  },
  suburb: {
    id: 'suburb', name: '郊区', glyph: '郊', kind: 'landscape',
    desc: '击杀经验 +5%。', color: '#7f7a68', mods: { xpBonus: 0.05 }, unlock: 'farm',
  },
  town: {
    id: 'town', name: '小镇', glyph: '镇', kind: 'landscape',
    desc: '击杀经验 +10%。', color: '#8a7d6a', mods: { xpBonus: 0.1 }, unlock: 'cemetery',
  },
  reed: {
    id: 'reed', name: '芦苇', glyph: '苇', kind: 'landscape',
    desc: '闪避 +1%，每圈生成一只鱼人。', color: '#8a9a5e',
    mods: { evade: 0.01 }, spawn: 'murloc', unlock: 'beacon',
  },
  timeCrystal: {
    id: 'timeCrystal', name: '时空水晶', glyph: '晶', kind: 'landscape',
    desc: '让相邻地形的效果翻倍。', color: '#7fa8c8', mods: {}, timeCrystal: true, unlock: 'beacon',
  },
  dryBush: {
    id: 'dryBush', name: '旱灌木', glyph: '旱', kind: 'landscape',
    desc: '敌人伤害 -5%。', color: '#8a7a4e', mods: { enemyDmgReduce: 0.05 }, unlock: 'beacon',
  },
  wasteland: {
    id: 'wasteland', name: '荒地', glyph: '荒', kind: 'landscape',
    desc: '最大生命 +2，每两圈生成一只史莱姆。', color: '#7a7562',
    mods: { maxHp: 2 }, spawn: 'slime', unlock: 'farm',
  },

  // ---- 路边 ----
  village: {
    id: 'village', name: '村庄', glyph: '村', kind: 'roadside',
    desc: '经过时回复 15% 生命，并给你一个击杀任务。', color: '#9a8358',
    healPass: 0.15, quest: 1,
  },
  countyEstate: {
    id: 'countyEstate', name: '伯爵领地', glyph: '伯', kind: 'roadside',
    desc: '经过时回复 30% 生命，任务奖励更丰厚。', color: '#a08a5a',
    healPass: 0.3, quest: 2, unlock: 'cemetery',
  },
  witchHouse: {
    id: 'witchHouse', name: '女巫之屋', glyph: '巫', kind: 'roadside',
    desc: '经过时获得一瓶药水（上限 3）。', color: '#7a6a8a', potionPass: true, unlock: 'fort',
  },
  cemetery: {
    id: 'cemetery', name: '墓园', glyph: '墓', kind: 'roadside',
    desc: '每圈生成一只骷髅。', color: '#6b6f78', spawn: 'skeleton', unlock: 'cemetery',
  },
  spiderNest: {
    id: 'spiderNest', name: '蜘蛛茧', glyph: '蛛', kind: 'roadside',
    desc: '每圈生成一只蜘蛛。', color: '#5d5a6b', spawn: 'spider',
  },
  grove: {
    id: 'grove', name: '小树林', glyph: '狼', kind: 'roadside',
    desc: '每圈生成一只野鼠狼。', color: '#57734a', spawn: 'wolf', unlock: 'lodge',
  },
  vampireMansion: {
    id: 'vampireMansion', name: '吸血鬼别墅', glyph: '宅', kind: 'roadside',
    desc: '每圈生成一只吸血鬼。', color: '#6d4657', spawn: 'vampire', unlock: 'lodge',
  },
  banditCamp: {
    id: 'banditCamp', name: '山贼营地', glyph: '盗', kind: 'roadside',
    desc: '每圈生成一名山贼，额外掉落木材。', color: '#8a5b40', spawn: 'bandit', unlock: 'fort',
  },
  goblinCamp: {
    id: 'goblinCamp', name: '哥布林营地', glyph: '哥', kind: 'roadside',
    desc: '每圈生成一只哥布林。', color: '#6f7a3c', spawn: 'goblin', unlock: 'fort',
  },
  goblinTower: {
    id: 'goblinTower', name: '哥布林瞭望台', glyph: '望', kind: 'roadside',
    desc: '每圈生成一名哥布林弓箭手。', color: '#7a824a', spawn: 'goblinArcher', unlock: 'fort',
  },
  ruins: {
    id: 'ruins', name: '遗迹', glyph: '遗', kind: 'roadside',
    desc: '每圈生成一只焦火蠕虫，经过时获得少量资源。', color: '#7c7463',
    spawn: 'worm', resourcePass: 1, unlock: 'smithy',
  },
  ancientRuins: {
    id: 'ancientRuins', name: '古老遗迹', glyph: '古', kind: 'roadside',
    desc: '两块相邻遗迹合并而成：生成蠕虫，装备掉落率提高。', color: '#9a8f76',
    spawn: 'worm', lootBonus: 0.2, resourcePass: 2, hidden: true,
  },
  giantNest: {
    id: 'giantNest', name: '巨型蛛巢', glyph: '巨', kind: 'roadside',
    desc: '蛛巢与森林结合：生成蜘蛛，装备掉落率提高。', color: '#6b5a7a',
    spawn: 'spider', lootBonus: 0.1, hidden: true,
  },
  goblinMine: {
    id: 'goblinMine', name: '哥布林矿洞', glyph: '矿', kind: 'roadside',
    desc: '哥布林营地靠上岩石：生成哥布林，额外掉落魂晶。', color: '#6f6a3c',
    spawn: 'goblin', soulChance: 0.15, hidden: true,
  },
  grandCemetery: {
    id: 'grandCemetery', name: '大墓园', glyph: '大', kind: 'roadside',
    desc: '两座墓园合并：生成骷髅，击杀额外获得魂晶。', color: '#7a7f88',
    spawn: 'skeleton', soulChance: 0.15, hidden: true,
  },
  swamp: {
    id: 'swamp', name: '沼泽', glyph: '沼', kind: 'roadside',
    desc: '经过时减速，每圈生成一群蚊虫。', color: '#4c5a4a', spawn: 'mosquito', slow: 0.45, unlock: 'fort',
  },
  smithy: {
    id: 'smithy', name: '铁匠炉', glyph: '锻', kind: 'roadside',
    desc: '经过时熔掉最弱的一件装备，获得 4% 减伤（最多 12%）。', color: '#8b6a4a',
    forgePass: true, lootBonus: 0.06, unlock: 'smithy',
  },
  arsenal: {
    id: 'arsenal', name: '军械库', glyph: '械', kind: 'roadside',
    desc: '额外解锁一个装备栏。', color: '#8b7c5e', arsenalSlot: true, unlock: 'armory',
  },
  treasury: {
    id: 'treasury', name: '宝库', glyph: '宝', kind: 'roadside',
    desc: '击杀有 30% 概率额外获得魂晶。', color: '#a8873f', soulChance: 0.3, unlock: 'armory',
  },
  emptyTreasury: {
    id: 'emptyTreasury', name: '空洞宝库', glyph: '空', kind: 'roadside',
    desc: '每圈生成一只石像鬼。', color: '#7d7462', spawn: 'gargoyle', unlock: 'armory',
  },
  forget: {
    id: 'forget', name: '遗忘皆空', glyph: '忘', kind: 'special',
    desc: '销毁任意一块已放置的地形。', color: '#b9a8d6', special: true, unlock: 'academy',
  },
  warmCamp: {
    id: 'warmCamp', name: '温暖营地', glyph: '暖', kind: 'special',
    desc: '营火所在的场景地块，不进入卡组。', color: '#d8a060',
    healPass: 0.15, hidden: true, scene: true,
  },
  evilInvasion: {
    id: 'evilInvasion', name: '邪灵入侵', glyph: '邪', kind: 'special',
    desc: '首领战的场景地块，不进入卡组。', color: '#a070d0', hidden: true, scene: true,
  },
  watchtower: {
    id: 'watchtower', name: '瞭望塔', glyph: '塔', kind: 'roadside',
    desc: '每 4 秒向路上敌人射出一箭（9 伤害）。', color: '#7d8290',
    periodic: { type: 'arrow', dmg: 9, every: 4 }, unlock: 'watchtower',
  },
  outpost: {
    id: 'outpost', name: '前哨站', glyph: '哨', kind: 'roadside',
    desc: '每 3.5 秒向路上敌人射击（6 伤害）。', color: '#7d7a6a',
    periodic: { type: 'arrow', dmg: 6, every: 3.5 }, unlock: 'watchtower',
  },
  towerTemple: {
    id: 'towerTemple', name: '塔庙', glyph: '庙', kind: 'roadside',
    desc: '每圈生成一只沙漠之灵。', color: '#b09a6a', spawn: 'sandSpirit', unlock: 'watchtower',
  },
  stormTemple: {
    id: 'stormTemple', name: '风暴神殿', glyph: '雷', kind: 'roadside',
    desc: '每 6 秒降下闪电（20 伤害）。', color: '#6d6a8f',
    periodic: { type: 'bolt', dmg: 20, every: 6 }, unlock: 'watchtower',
  },
  battlefield: {
    id: 'battlefield', name: '战场', glyph: '战', kind: 'roadside',
    desc: '每圈生成一只幽灵，装备掉落率提高。', color: '#7a6a5a',
    spawn: 'ghost', lootBonus: 0.1, unlock: 'cemetery',
  },
  ruinedVillage: {
    id: 'ruinedVillage', name: '被洗劫的村庄', glyph: '废', kind: 'roadside',
    desc: '每圈生成一只尸鬼。', color: '#6f6558', spawn: 'ghoul', unlock: 'cemetery',
  },
  villageQuestion: {
    id: 'villageQuestion', name: '一座村庄？', glyph: '？', kind: 'roadside',
    desc: '每圈生成一个木制勇士。', color: '#6f6a4a', spawn: 'woodWarrior', unlock: 'lodge',
  },
  shipwreck: {
    id: 'shipwreck', name: '沉船', glyph: '船', kind: 'roadside',
    desc: '每圈生成一只海妖。', color: '#5a6a6a', spawn: 'siren', unlock: 'fort',
  },
  bloodPath: {
    id: 'bloodPath', name: '血魔路径', glyph: '径', kind: 'roadside',
    desc: '每圈生成一个魔血块。', color: '#6a3a3e', spawn: 'bloodClot', unlock: 'smithy',
  },
  lichPalace: {
    id: 'lichPalace', name: '巫妖宫殿', glyph: '宫', kind: 'roadside',
    desc: '每座宫殿使巫妖的生命与伤害 +10%。', color: '#5a4a70',
    bossPower: 0.1, unlock: 'crypt',
  },
  lighthouse: {
    id: 'lighthouse', name: '灯塔', glyph: '灯', kind: 'roadside',
    desc: '移动速度 +15%，攻击速度 +5%。', color: '#8a8f7a',
    mods: { speedBonus: 0.15, atkSpeed: 0.05 }, unlock: 'beacon',
  },
  library: {
    id: 'library', name: '图书室', glyph: '书', kind: 'roadside',
    desc: '经过时替换 3 张手牌，替换 20 张后倒塌。', color: '#8a7a5a',
    swapPass: 3, collapseAfter: 20, unlock: 'library',
  },
  abandonedLibrary: {
    id: 'abandonedLibrary', name: '废弃图书室', glyph: '卷', kind: 'roadside',
    desc: '每圈生成一本灵书。', color: '#7a6a7a', spawn: 'book', unlock: 'library',
  },
  streetlight: {
    id: 'streetlight', name: '路灯', glyph: '路', kind: 'roadside',
    desc: '减少周围生成的敌人数量（每座 -1 上限）。', color: '#a8a070',
    enemyCapReduce: 1, unlock: 'watchtower',
  },
  zeroBeacon: {
    id: 'zeroBeacon', name: '零之界标', glyph: '零', kind: 'roadside',
    desc: '靠近它的敌人变弱，远离它的敌人变强。对首领无效。', color: '#7a7a8a',
    zeroBeacon: true, unlock: 'academy',
  },
  maze: {
    id: 'maze', name: '追忆迷宫', glyph: '迷', kind: 'roadside',
    desc: '没有实际效果，但占地方。', color: '#6f7288', unlock: 'library',
  },
  dimensionalCrack: {
    id: 'dimensionalCrack', name: '异次元裂缝', glyph: '隙', kind: 'roadside',
    desc: '不稳定的裂隙：每圈有概率吐出精英怪。', color: '#7a5a9a',
    randomElite: true, unlock: 'library',
  },
  temporalBeacon: {
    id: 'temporalBeacon', name: '时空灯塔', glyph: '时', kind: 'roadside',
    desc: '移动速度 +8%。', color: '#7f8fb0', mods: { speedBonus: 0.08 }, unlock: 'beacon',
  },
  ancestralCrypt: {
    id: 'ancestralCrypt', name: '祖先墓穴', glyph: '祖', kind: 'roadside',
    desc: '击杀有灵魂的敌人 +1 最大生命；每次远征有一次满血复活。', color: '#6b6470',
    soulMaxHp: 1, revive: true, unlock: 'crypt',
  },
};

// 解锁建筑 -> 卡牌
export const UNLOCK_BY_BUILDING = {
  farm: ['wheat', 'river', 'bridge', 'oasis', 'savanna', 'suburb', 'wasteland'],
  cemetery: ['cemetery', 'battlefield', 'ruinedVillage', 'countyEstate', 'town'],
  lodge: ['grove', 'vampireMansion', 'bloodGrove', 'burntForest', 'hungryGrove', 'villageQuestion'],
  smithy: ['smithy', 'ruins', 'bloodPath'],
  watchtower: ['watchtower', 'stormTemple', 'dunes', 'outpost', 'streetlight', 'towerTemple', 'peak'],
  fort: ['banditCamp', 'goblinCamp', 'swamp', 'goblinTower', 'shipwreck', 'witchHouse'],
  library: ['library', 'abandonedLibrary'],
  academy: ['maze', 'zeroBeacon', 'dimensionalCrack', 'forget'],
  armory: ['arsenal', 'treasury', 'emptyTreasury'],
  beacon: ['temporalBeacon', 'reed', 'lighthouse', 'timeCrystal', 'dryBush'],
  crypt: ['ancestralCrypt', 'lichPalace'],
};

export function cardById(id) { return CARDS[id]; }

export function cardPool(meta) {
  const unlocked = new Set(Object.keys(CARDS).filter((id) => !CARDS[id].hidden && !CARDS[id].unlock));
  for (const [b, list] of Object.entries(UNLOCK_BY_BUILDING)) {
    if (meta.buildings[b] > 0) list.forEach((id) => unlocked.add(id));
  }
  return [...unlocked];
}

// 自动牌组：每种解锁地形 1 份，再补第二份，最多 30 张
export function autoDeck(meta, cap = 30) {
  const pool = cardPool(meta);
  const out = pool.slice(0, cap);
  for (const id of pool) {
    if (out.length >= cap) break;
    out.push(id);
  }
  return out.slice(0, cap);
}

// 玩家牌组：显式选择至少 10 张才生效，否则回退到自动牌组
export function deckFromMeta(meta) {
  const pool = new Set(cardPool(meta));
  const chosen = (meta.deck || []).filter((id) => pool.has(id)).slice(0, 30);
  if (chosen.length >= 10) return chosen;
  return autoDeck(meta);
}
