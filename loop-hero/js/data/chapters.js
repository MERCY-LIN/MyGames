// 章节与首领配置
export const CHAPTERS = {
  1: {
    id: 1, name: '被遗忘的环', bossName: '巫妖', boss: 'lich',
    bossLoop: 8, enemyMul: 1.0, unlock: null, color: '#a98bd0',
    desc: '环线第一次合拢。击败巫妖，证明你能走出这片遗忘之地。',
  },
  2: {
    id: 2, name: '血色修道院', bossName: '女祭司', boss: 'priestess',
    bossLoop: 9, enemyMul: 1.08, unlock: 1, color: '#c07a8a',
    desc: '钟声在环线中央响起。女祭司会治愈自己，也会唤醒墓中的白骨。',
  },
  3: {
    id: 3, name: '猎手之夜', bossName: '猎手', boss: 'hunter',
    bossLoop: 10, enemyMul: 1.15, unlock: 2, color: '#8f9a6a',
    desc: '雾里有人吹响号角。猎手会在远处投掷飞刀，并伺机打出致命一击。',
  },
  4: {
    id: 4, name: '终焉之环', bossName: '终焉', boss: 'omega',
    bossLoop: 12, enemyMul: 1.25, unlock: 3, color: '#c98b5a',
    desc: '环线开始自我吞噬。终焉会在半血时撕开两次形态。',
  },
};

export const INFINITE = {
  id: 'inf', name: '无尽回廊', bossName: '终焉', boss: 'omega',
  bossLoop: 9, enemyMul: 1.1, unlock: 4, color: '#d8b25a',
  desc: '没有终点。每击败一次终焉，它都会以更强的姿态回到环上。',
};

export function chapterById(id) {
  if (id === 'inf' || id === 0) return INFINITE;
  return CHAPTERS[id] || CHAPTERS[1];
}

export function chapterUnlocked(meta, id) {
  const max = meta.chapterMax || 1;
  if (id === 'inf' || id === 0) return max >= 4;
  return Number(id) <= max;
}

export function chapterList() {
  return [...Object.values(CHAPTERS), INFINITE];
}
