// 敌人定义与随圈数成长
import { rng } from '../core/rng.js';

export const ENEMIES = {
  slime:      { name: '史莱姆', hp: 26, atk: 5, speed: 0.6, xp: 5,  color: '#6c9a5a', shape: 'blob',   r: 11, loot: { wood: 0.4, stone: 0.1 }, abilities: ['split'] },
  spider:     { name: '蜘蛛',   hp: 22, atk: 6, speed: 1.5, xp: 6,  color: '#7b6f8d', shape: 'spider', r: 11, loot: { wood: 0.2, stone: 0.2 }, abilities: [{ id: 'poison', chance: 0.3, power: 2, ttl: 3 }] },
  skeleton:   { name: '骷髅',   hp: 36, atk: 7, speed: 0.9, xp: 8,  color: '#c9c4b4', shape: 'skull',  r: 12, loot: { stone: 0.35, soul: 0.15 } },
  wolf:       { name: '野狼',   hp: 42, atk: 8, speed: 1.25, xp: 9, color: '#8a8578', shape: 'beast', r: 12, loot: { wood: 0.3 }, abilities: [{ id: 'frenzy', mult: 1.25 }] },
  bandit:     { name: '强盗',   hp: 58, atk: 9, speed: 1.0, xp: 11, color: '#a06a4a', shape: 'human', r: 12, loot: { wood: 0.5, stone: 0.2 } },
  goblin:     { name: '哥布林', hp: 48, atk: 8, speed: 1.15, xp: 10, color: '#7f9a44', shape: 'human', r: 11, loot: { stone: 0.25, soul: 0.1 } },
  vampire:    { name: '吸血鬼', hp: 74, atk: 11, speed: 0.95, xp: 15, color: '#b48a9a', shape: 'human', r: 13, vamp: 0.2, loot: { soul: 0.45 }, abilities: [{ id: 'stealEquip', chance: 0.15 }] },
  ghost:      { name: '幽灵',   hp: 52, atk: 10, speed: 0.85, xp: 13, color: '#9fb6c4', shape: 'ghost', r: 13, evade: 0.18, loot: { soul: 0.4 }, abilities: ['revive'] },
  mimic:      { name: '宝箱怪', hp: 96, atk: 9, speed: 0.7, xp: 18, color: '#b08a4a', shape: 'chest', r: 13, loot: { stone: 0.4, soul: 0.3, metal: 0.2 }, guaranteeEquip: true },
  mosquito:   { name: '蚊群',   hp: 18, atk: 4, speed: 1.9, xp: 4, color: '#8a8a6a', shape: 'swarm', r: 8, loot: { wood: 0.15 }, abilities: [{ id: 'poison', chance: 0.15, power: 1, ttl: 2 }] },
  harpy:      { name: '鹰身女妖', hp: 55, atk: 9, speed: 1.4, xp: 12, color: '#b0a0b8', shape: 'ghost', r: 12, evade: 0.15, loot: { soul: 0.25 }, abilities: [{ id: 'ranged', mult: 0.6 }] },
  scarecrow:  { name: '稻草人', hp: 60, atk: 8, speed: 0.9, xp: 10, color: '#b09a5a', shape: 'human', r: 12, loot: { wood: 0.4 } },
  murloc:     { name: '鱼人',   hp: 38, atk: 7, speed: 1.3, xp: 8, color: '#6a9a8a', shape: 'human', r: 11, loot: { wood: 0.2, soul: 0.15 } },
  book:       { name: '灵书',   hp: 40, atk: 7, speed: 0.8, xp: 9, color: '#b0a080', shape: 'book', r: 11, loot: { soul: 0.5, tome: 0.5 } },
  goblinArcher: { name: '哥布林弓箭手', hp: 42, atk: 9, speed: 1.2, xp: 10, color: '#7f9a44', shape: 'human', r: 11, loot: { wood: 0.2 }, abilities: [{ id: 'ranged', mult: 0.8 }] },
  worm:       { name: '焦火蠕虫', hp: 90, atk: 10, speed: 0.6, xp: 15, color: '#a06a4a', shape: 'blob', r: 13, loot: { stone: 0.4 }, abilities: [{ id: 'summonOnDie', type: 'bloodClot', hpFrac: 0.4 }] },
  gargoyle:   { name: '石像鬼', hp: 85, atk: 11, speed: 0.9, xp: 15, color: '#8a8a8a', shape: 'beast', r: 13, loot: { stone: 0.5, metal: 0.25 }, abilities: [{ id: 'armorUp', max: 3, per: 0.04 }] },
  sandSpirit: { name: '沙漠之灵', hp: 45, atk: 8, speed: 1.0, xp: 11, color: '#c2b08a', shape: 'ghost', r: 12, evade: 0.1, loot: { stone: 0.3 }, abilities: [{ id: 'sandVeil', amount: 0.1 }] },
  ghoul:      { name: '尸鬼',   hp: 55, atk: 9, speed: 1.0, xp: 11, color: '#8a9a7a', shape: 'human', r: 12, loot: { soul: 0.3 }, abilities: [{ id: 'regen', amount: 2 }] },
  woodWarrior: { name: '木制勇士', hp: 70, atk: 10, speed: 0.9, xp: 13, color: '#8a7a4a', shape: 'human', r: 12, loot: { wood: 0.5 }, abilities: [{ id: 'armorUp', max: 1, per: 0.06 }] },
  siren:      { name: '海妖',   hp: 50, atk: 9, speed: 1.1, xp: 12, color: '#6a9ab0', shape: 'ghost', r: 12, loot: { soul: 0.35 }, abilities: [{ id: 'lure', charges: 2, reduction: 0.15 }] },
  bloodClot:  { name: '魔血块', hp: 80, atk: 8, speed: 0.7, xp: 14, color: '#8a3a3a', shape: 'blob', r: 13, vamp: 0.15, loot: { soul: 0.3 } },
  lich:       { name: '巫妖',   hp: 560, atk: 24, speed: 0.75, xp: 0, color: '#c3b0e0', shape: 'lich', r: 18, boss: true, loot: { soul: 8, stone: 6, wood: 6 } },
  priestess:  { name: '女祭司', hp: 440, atk: 18, speed: 0.85, xp: 0, color: '#d8a0b0', shape: 'priestess', r: 16, boss: true, loot: { soul: 9, stone: 5, wood: 5 }, abilities: [{ id: 'auraHeal', frac: 0.015 }] },
  hunter:     { name: '猎手',   hp: 560, atk: 24, speed: 1.1, xp: 0, color: '#a8b07a', shape: 'hunter', r: 15, boss: true, loot: { soul: 10, stone: 6, wood: 6 } },
  omega:      { name: '终焉',   hp: 760, atk: 26, speed: 0.8, xp: 0, color: '#d8a060', shape: 'omega', r: 20, boss: true, loot: { soul: 14, stone: 8, wood: 8 } },
};

const LOOP_HP = 0.16;
const LOOP_ATK = 0.10;
const LOOP_XP = 0.12;

export function makeEnemy(typeId, loop, { elite = false, cell = 0, mul = 1 } = {}) {
  const def = ENEMIES[typeId] || ENEMIES.slime;
  const hpMul = def.boss ? 1 : 1 + LOOP_HP * (loop - 1);
  const atkMul = def.boss ? 1 : 1 + LOOP_ATK * (loop - 1);
  const eliteMul = elite ? 1.6 : 1;
  const hp = Math.round(def.hp * hpMul * eliteMul * mul);
  return {
    uid: `e${rng.int(1e6, 9e6)}`,
    type: typeId,
    name: elite ? `精英${def.name}` : def.name,
    alive: true,
    hp, maxHp: hp,
    atk: Math.round(def.atk * atkMul * (elite ? 1.25 : 1) * mul),
    baseAtk: Math.round(def.atk * atkMul * (elite ? 1.25 : 1) * mul),
    abilities: def.abilities || [],
    status: [],
    shieldStacks: 0,
    shieldPer: 0,
    stolenFrom: null,
    revived: false,
    speed: def.speed,
    xp: Math.round(def.xp * (1 + LOOP_XP * (loop - 1)) * (elite ? 1.5 : 1)),
    color: def.color,
    shape: def.shape,
    r: def.r + (elite ? 2 : 0),
    vamp: def.vamp || 0,
    evade: def.evade || 0,
    loot: def.loot || {},
    guaranteeEquip: !!def.guaranteeEquip,
    boss: !!def.boss,
    elite,
    cell,
    atkTimer: 0.6 + rng.float(0, 0.5),
    summonTimer: 5,
    enraged: false,
    phase2: false,
    bob: rng.float(0, Math.PI * 2),
  };
}
