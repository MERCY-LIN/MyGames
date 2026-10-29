// 全局常量：画布、网格、数值基准
export const CELL = 32;
export const GRID_W = 40;
export const GRID_H = 22;
export const WORLD_W = CELL * GRID_W; // 1280
export const WORLD_H = CELL * GRID_H; // 704
export const CANVAS_W = 1280;
export const CANVAS_H = 720;
export const OFFSET_Y = 8;

export const SAVE_KEY = 'loop-hero-save-v1';

// 英雄基础属性（未含装备 / 天赋 / 地形）
export const HERO_BASE = {
  maxHp: 110,
  atk: 9,
  def: 2,
  atkSpeed: 1.0,   // 每秒攻击次数
  crit: 0.05,
  critDmg: 1.6,
  vamp: 0,          // 吸血比例
  regen: 0.3,       // 每秒回血
  evade: 0.02,
  speed: 2.15,      // 每秒走过多少格
};

export const STARTING_DECK = ['rock', 'forest', 'meadow', 'village', 'spiderNest'];
export const HAND_BASE = 5;
export const BOSS_LOOP = 8;          // 第 8 圈起可遇巫妖
export const BOSS_METER_MAX = 100;
export const BOSS_METER_PER_CARD = 5;

export const RARITY = {
  common: { name: '普通', color: '#b9b3a3', mult: 1.0 },
  rare: { name: '稀有', color: '#6fa8d6', mult: 1.55 },
  epic: { name: '史诗', color: '#c98bd6', mult: 2.2 },
};
