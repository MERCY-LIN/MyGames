// 敌人能力注册表（无 DOM）：数据驱动，钩子由 combat.js 在固定节点调用
export const ABILITIES = {
  split: {
    name: '分裂', desc: '死亡时分裂成两只幼体。',
    hooks: {
      onBeforeDeath(e, ctx, p) {
        ctx.combat.split(e, p.count || 2, p.hpMul || 0.5, p.atkMul || 0.6);
        return 'handled';
      },
    },
  },
  stealEquip: {
    name: '窃取', desc: '命中时有概率偷走英雄最弱的一件装备。',
    hooks: { onHitHero(e, ctx, p) { ctx.combat.steal(e, p.chance ?? 0.15); } },
  },
  revive: {
    name: '复生', desc: '首次被击杀时有概率以 40% 生命复活。',
    hooks: { onBeforeDeath(e, ctx, p) { return ctx.combat.revive(e, p.chance ?? 0.5, p.hpFrac ?? 0.4); } },
  },
  poison: {
    name: '毒素', desc: '命中时有概率使英雄中毒。',
    hooks: { onHitHero(e, ctx, p) { ctx.combat.poison(e, p.chance ?? 0.3, p.power ?? 2, p.ttl ?? 3); } },
  },
  ranged: {
    name: '远程', desc: '英雄进入格子时先手攻击。',
    hooks: { onHeroEnter(e, ctx, p) { ctx.combat.ranged(e, p.mult ?? 0.6); return 'ranged'; } },
  },
  armorUp: {
    name: '硬化', desc: '受到攻击时叠层，每层减少伤害。',
    hooks: { onHurt(e, ctx, p) { ctx.combat.armorUp(e, p.max ?? 3, p.per ?? 0.04); } },
  },
  summonOnDie: {
    name: '余烬', desc: '死亡时召唤一只魔血块。',
    hooks: { onBeforeDeath(e, ctx, p) { ctx.combat.summonOnDie(e, p.type || 'bloodClot', p.hpFrac ?? 0.4); } },
  },
  auraHeal: {
    name: '治疗光环', desc: '持续治疗同格友军。',
    hooks: { onTick(e, ctx, p, dt) { ctx.combat.auraHeal(e, dt, p.frac ?? 0.015); } },
  },
  regen: {
    name: '再生', desc: '每秒回复生命。',
    hooks: { onTick(e, ctx, p, dt) { ctx.combat.regen(e, dt, p.amount ?? 2); } },
  },
  frenzy: {
    name: '嗜血', desc: '生命低于一半时攻击力提升。',
    hooks: { onTick(e, ctx, p) { ctx.combat.frenzy(e, p.mult ?? 1.25); } },
  },
  sandVeil: {
    name: '沙幕', desc: '开战时获得额外闪避。',
    hooks: { onCombatStart(e, ctx, p) { ctx.combat.sandVeil(e, p.amount ?? 0.1); } },
  },
  lure: {
    name: '惑歌', desc: '开战时削弱英雄接下来两次攻击。',
    hooks: { onCombatStart(e, ctx, p) { ctx.combat.lure(e, p.charges ?? 2, p.reduction ?? 0.15); } },
  },
};

/** 敌人实例的能力列表（字符串或 { id, ...params }） */
export function abilityList(e) {
  const list = e.abilities || [];
  return list.map((a) => (typeof a === 'string' ? { id: a } : a));
}

/** 依次触发某个钩子；返回第一个非空结果（'revive' / 'handled' / 'ranged'） */
export function triggerHook(e, hook, ctx, ...args) {
  for (const inst of abilityList(e)) {
    const def = ABILITIES[inst.id];
    const fn = def?.hooks?.[hook];
    if (!fn) continue;
    const result = fn(e, ctx, inst, ...args);
    if (result) return result;
  }
  return null;
}

/** 图鉴/提示用：能力名称与说明 */
export function describeAbilities(e) {
  return abilityList(e)
    .map((a) => ABILITIES[a.id])
    .filter(Boolean)
    .map((a) => ({ name: a.name, desc: a.desc }));
}
