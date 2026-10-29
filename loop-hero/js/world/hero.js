// 英雄：职业、属性推导、经验、装备、骷髅
import { classById } from '../data/classes.js';

export function createHero(meta, classId = 'warrior', { starter = false } = {}) {
  const cls = classById(classId);
  const b = cls.base;

  const h = {
    classId: cls.id,
    base: b,
    level: 1,
    xp: 0,
    xpNext: 12,
    hp: b.maxHp,
    maxHp: b.maxHp,
    atk: b.atk,
    def: b.def,
    atkSpeed: b.atkSpeed,
    crit: b.crit,
    critDmg: b.critDmg,
    vamp: b.vamp,
    regen: b.regen,
    evade: b.evade,
    speed: b.speed,
    lootBonus: 0,
    bonus: {
      maxHp: 0, atk: 0, def: 0, atkSpeed: 0, crit: 0,
      critDmg: 0, vamp: 0, regen: 0, evade: 0, lootBonus: 0,
    },
    slots: cls.slots,
    slotIds: cls.slots.map((s) => s.id),
    equipment: {},
    traits: [],
    potions: 1,
    pos: 0,
    cell: 0,
    stepPhase: 0,
    atkTimer: 0,
    regenAcc: 0,
    hurtFlash: 0,
    attackAnim: 0,
    invuln: 0,
    damageReduction: 0,
    skeletons: [],
    counterChance: cls.id === 'warrior' ? 0.2 : 0,
    skeletonBonus: 0,
    skeletonAtkBonus: 0,
  };

  for (const slot of cls.slots) h.equipment[slot.id] = null;

  if (starter) {
    const slot = cls.slots[0];
    h.equipment[slot.id] = {
      uid: 'starter',
      slot: slot.id,
      rarity: 'common',
      name: cls.id === 'necromancer' ? '旧骨杖' : cls.id === 'rogue' ? '旧短刃' : '旧铁剑',
      slotName: slot.id === 'staff' ? '法杖' : '武器',
      stats: { atk: 2 + ((meta.buildings.forge) || 0) },
      loop: 0,
    };
  }

  deriveHero(h, null, meta);
  h.hp = h.maxHp;
  h.potions = Math.min(h.maxPotions, 1 + ((meta.buildings.supplies) ? 1 : 0));
  return h;
}

export function equipmentBonus(h) {
  const sum = { maxHp: 0, atk: 0, def: 0, atkSpeed: 0, crit: 0, vamp: 0 };
  for (const it of Object.values(h.equipment)) {
    if (!it) continue;
    for (const [k, v] of Object.entries(it.stats || {})) {
      if (k in sum) sum[k] += v;
    }
  }
  return sum;
}

export function deriveHero(h, mapStats, meta) {
  const eq = equipmentBonus(h);
  const m = mapStats || {};
  const base = h.base;
  const gym = ((meta && meta.buildings.gym) || 0) * 10;
  const forestCamp = ((meta && meta.buildings.forestCamp) || 0) * 0.05;
  const b = h.bonus;

  h.maxHp = Math.round(base.maxHp + b.maxHp + gym + (m.maxHp || 0) + eq.maxHp);
  h.atk = Math.round((base.atk + b.atk + (m.atk || 0) + eq.atk) * 10) / 10;
  h.def = Math.round((base.def + b.def + eq.def) * 10) / 10;
  h.atkSpeed = Math.max(0.3, Math.round((base.atkSpeed * (1 + b.atkSpeed + (m.atkSpeed || 0) + eq.atkSpeed + forestCamp)) * 100) / 100);
  h.crit = clamp(base.crit + b.crit + eq.crit, 0, 0.75);
  h.critDmg = base.critDmg + b.critDmg;
  h.vamp = clamp(base.vamp + b.vamp + (m.vamp || 0) + eq.vamp, 0, 0.8);
  h.regen = Math.round((base.regen + b.regen + (m.regen || 0)) * 10) / 10;
  h.evade = clamp(base.evade + b.evade + (m.evade || 0), 0, 0.6);
  h.speed = Math.round(base.speed * (1 + (m.speedBonus || 0)) * 1000) / 1000;
  h.lootBonus = b.lootBonus + (m.lootBonus || 0) + ((meta && meta.buildings.smithy) ? 0.1 : 0);

  const builds = (meta && meta.buildings) || {};
  h.maxPotions = 1 + (builds.supplies ? 1 : 0) + (builds.inn ? 1 : 0) + (builds.alchemist ? 1 : 0);
  h.potionPower = 0.45 + (builds.healerHut ? 0.1 : 0) + (builds.alchemist ? 0.05 : 0);
  if (h.potions > h.maxPotions) h.potions = h.maxPotions;

  if (h.hp > h.maxHp) h.hp = h.maxHp;
}

export function gainXp(h, amount) {
  h.xp += amount;
  let ups = 0;
  while (h.xp >= h.xpNext) {
    h.xp -= h.xpNext;
    h.level += 1;
    h.xpNext = 12 + h.level * 9;
    ups += 1;
  }
  return ups;
}

export function potionHeal(h) {
  if (h.potions <= 0) return false;
  h.potions -= 1;
  h.hp = Math.min(h.maxHp, h.hp + h.maxHp * (h.potionPower || 0.45));
  return true;
}

// 死灵法师的骷髅：数量与强度随等级、法杖成长
export function skeletonMax(hero) {
  return Math.min(4, 2 + Math.floor((hero.level - 1) / 6) + (hero.skeletonBonus || 0));
}

export function makeSkeleton(hero) {
  const staff = hero.equipment.staff;
  const staffAtk = staff ? (staff.stats.atk || 0) : 0;
  const hp = Math.round(20 + hero.level * 4 + hero.maxHp * 0.06 + staffAtk * 2);
  return {
    uid: `s${Math.random().toString(36).slice(2, 8)}`,
    hp,
    maxHp: hp,
    atk: Math.round((3 + hero.level * 0.7 + hero.atk * 0.35 + staffAtk * 0.5 + (hero.skeletonAtkBonus || 0)) * 10) / 10,
    timer: 0.3 + Math.random() * 0.4,
    bob: Math.random() * Math.PI * 2,
  };
}

export function ensureSkeletons(hero) {
  if (hero.classId !== 'necromancer') return;
  const max = skeletonMax(hero);
  hero.skeletons = hero.skeletons.filter((s) => s.hp > 0);
  while (hero.skeletons.length < max) hero.skeletons.push(makeSkeleton(hero));
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
