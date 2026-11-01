// 战斗系统：战斗流程、伤害与击杀结算
// 无 DOM 依赖：表现副作用走 ctx.emit，游戏流程走 ctx.ctrl
// S0.3：所有对敌伤害收敛到单一入口 dealDamageToEnemy，为 S1 的 onHurt / onBeforeDeath 钩子提供唯一挂载点
import { rng } from '../core/rng.js';
import { makeEnemy } from '../data/enemies.js';
import { triggerHook } from '../data/abilities.js';
import { gainXp, deriveHero, ensureSkeletons } from '../world/hero.js';
import { rollEquip, equipIfBetter, rollResources, itemScore } from './loot.js';
import { heroPos, enemyPos } from './geom.js';
import { completeQuest, resName } from './economy.js';
import { fillHand } from './hand.js';
import { applyStatus, tickStatusList } from './status.js';

// ---------- 能力上下文 ----------
// abilities.js 只描述“做什么”，具体动作通过 ctx.combat 暴露，避免与 combat 循环依赖
function addToGroup(run, e) {
  if (!run.group) run.group = [];
  const nonBoss = run.group.filter((x) => x.alive && !x.boss).length;
  if (nonBoss >= 3) return false;
  if (run.group.some((x) => x === e)) return true;
  e.slot = run.group.length;
  run.group.push(e);
  return true;
}

function makeAbilityCtx(run, ctx) {
  const actx = Object.create(ctx);
  actx.run = run;
  actx.hero = run.hero;
  actx.combat = {
    split(e, count, hpMul, atkMul) {
      if (e.noSplit) return;
      for (let i = 0; i < count; i++) {
        const sk = makeEnemy(e.type, run.loop, { cell: e.cell, mul: run.enemyMul });
        sk.hp = sk.maxHp = Math.max(1, Math.round(e.maxHp * hpMul));
        sk.atk = Math.max(1, Math.round(e.atk * atkMul));
        sk.baseAtk = sk.atk;
        sk.noSplit = true;
        sk.name = `幼体${e.name}`;
        sk.atkTimer = 0.8 + i * 0.25;
        run.enemies.push(sk);
        addToGroup(run, sk);
      }
      ctx.emit.toast(`${e.name}分裂了`, 'warn');
    },
    steal(e, chance) {
      if (!rng.chance(chance)) return;
      const h = run.hero;
      const items = Object.entries(h.equipment).filter(([, it]) => it);
      if (!items.length) return;
      items.sort((a, b) => itemScore(a[1]) - itemScore(b[1]));
      const [slot, item] = items[0];
      h.equipment[slot] = null;
      e.stolenFrom = { slot, item };
      deriveHero(h, run.mapMods, ctx.meta);
      ctx.emit.toast(`${e.name}偷走了${item.name}`, 'warn');
    },
    revive(e, chance, hpFrac) {
      if (e.revived || !rng.chance(chance)) return null;
      e.revived = true;
      e.hp = Math.max(1, Math.round(e.maxHp * hpFrac));
      e.alive = true;
      const pos = enemyPos(run, e);
      ctx.emit.floatAt(pos.x, pos.y - e.r - 6, '复生', '#a9d6b0', 14);
      ctx.emit.burst(pos, 10, '#a9d6b0');
      return 'revive';
    },
    poison(e, chance, power, ttl) {
      if (!rng.chance(chance)) return;
      const h = run.hero;
      applyStatus(h, { kind: 'poison', power, ttl, source: e.type });
      ctx.emit.floatAt(heroPos(run).x, heroPos(run).y - 34, '中毒', '#8fd6a0', 12);
    },
    ranged(e, mult) {
      const h = run.hero;
      if (h.invuln > 0) return;
      const dmg = Math.max(1, e.atk * mult);
      h.hp -= dmg;
      run.dmgTaken += dmg;
      h.hurtFlash = 1;
      const pos = heroPos(run);
      ctx.emit.floatAt(pos.x, pos.y - 26, `-${Math.round(dmg)}`, '#ffb06a', 14);
      ctx.emit.floatAt(pos.x, pos.y - 40, '先手', '#d8b25a', 11);
      ctx.emit.burst(pos, 4, '#d8b25a');
      if (h.hp <= 0) ctx.ctrl.die();
    },
    armorUp(e, max, per) {
      if (e.shieldStacks >= max) return;
      e.shieldStacks += 1;
      e.shieldPer = per;
      const pos = enemyPos(run, e);
      ctx.emit.floatAt(pos.x, pos.y - e.r - 10, `硬化 ${e.shieldStacks}`, '#b8c4d0', 11);
    },
    summonOnDie(e, type, hpFrac) {
      const sk = makeEnemy(type, run.loop, { cell: e.cell, mul: run.enemyMul });
      sk.hp = sk.maxHp = Math.max(1, Math.round(e.maxHp * hpFrac));
      sk.atkTimer = 1;
      run.enemies.push(sk);
      addToGroup(run, sk);
      ctx.emit.toast(`${e.name}留下了余烬`, 'warn');
    },
    auraHeal(e, dt, frac) {
      const group = (run.group || []).filter((x) => x.alive && x !== e);
      let healed = 0;
      for (const ally of group) {
        const amount = ally.maxHp * frac * dt;
        if (ally.hp >= ally.maxHp) continue;
        ally.hp = Math.min(ally.maxHp, ally.hp + amount);
        healed += amount;
      }
      e.healAcc = (e.healAcc || 0) + healed;
      if (e.healAcc > 4) {
        e.healAcc = 0;
        const pos = enemyPos(run, e);
        ctx.emit.floatAt(pos.x, pos.y - e.r - 14, '+治疗', '#8fd6a0', 11);
      }
    },
    regen(e, dt, amount) {
      e.hp = Math.min(e.maxHp, e.hp + amount * dt);
    },
    frenzy(e, mult) {
      if (e.frenzyActive || e.hp >= e.maxHp * 0.5) return;
      e.frenzyActive = true;
      e.atk = Math.round((e.baseAtk || e.atk) * mult);
      const pos = enemyPos(run, e);
      ctx.emit.floatAt(pos.x, pos.y - e.r - 10, '嗜血', '#e08a7a', 12);
    },
    sandVeil(e, amount) {
      if (e.sandVeilApplied) return;
      e.sandVeilApplied = true;
      e.evade = (e.evade || 0) + amount;
    },
    lure(e, charges, reduction) {
      const h = run.hero;
      h.lureCharges = Math.max(h.lureCharges || 0, charges);
      h.lureReduction = reduction;
      ctx.emit.toast(`${e.name}的歌声削弱了你的攻击`, 'warn');
    },
    poisonEnemy(e, power, ttl) {
      e.status.push({ kind: 'poison', power, ttl });
    },
  };
  return actx;
}

export function triggerEnterAbilities(run, ctx, enemy) {
  const actx = makeAbilityCtx(run, ctx);
  return triggerHook(enemy, 'onHeroEnter', actx);
}

export function startCombat(run, ctx, enemy) {
  const cap = run.loop >= 4 ? 3 : 2;
  let group;
  if (enemy.boss) {
    const others = run.enemies
      .filter((e) => e.alive && e !== enemy && e.cell === enemy.cell && !e.boss)
      .slice(0, 3);
    group = [enemy, ...others];
  } else {
    group = run.enemies
      .filter((e) => e.alive && e.cell === enemy.cell)
      .slice(0, cap);
    if (!group.includes(enemy)) group.unshift(enemy);
  }
  group.forEach((e, i) => {
    e.slot = i;
    e.atkTimer = Math.max(e.atkTimer, 0.5 + i * 0.2);
  });
  run.group = group;
  run.target = group[0];
  run.hero.atkTimer = 0.15;
  run.hero.lureCharges = 0;
  run.hero.lureReduction = 0;
  if (run.hero.classId === 'necromancer') ensureSkeletons(run.hero);
  const actx = makeAbilityCtx(run, ctx);
  for (const e of group) triggerHook(e, 'onCombatStart', actx);
  if (enemy.boss && !enemy.introShown) {
    enemy.introShown = true;
    ctx.emit.flash(1);
    ctx.emit.shake(10);
    ctx.emit.toast(`${enemy.name}拦住了去路`, 'warn');
  }
}

export function updateCombat(run, ctx, dt) {
  const h = run.hero;
  let group = (run.group || []).filter((x) => x.alive);
  if (!group.length || !run.target || !run.target.alive) {
    run.group = group;
    run.target = group[0] || null;
    if (!run.target) return;
  }
  const e = run.target;

  const actx = makeAbilityCtx(run, ctx);
  for (const en of group) {
    if (en.alive) triggerHook(en, 'onTick', actx, dt);
  }
  if (run.target !== e || !e.alive) return;

  h.atkTimer -= dt;
  if (h.atkTimer <= 0) {
    h.atkTimer += 1 / Math.max(0.25, h.atkSpeed);
    heroAttack(run, ctx, e);
  }
  if (run.target !== e || !e.alive) return;

  if (h.classId === 'necromancer') {
    updateSkeletons(run, ctx, e, dt);
    if (run.target !== e || !e.alive) return;
  }

  for (const en of group) {
    if (!en.alive) continue;
    en.atkTimer -= dt;
    if (en.atkTimer <= 0) {
      en.atkTimer += 1 / Math.max(0.3, en.speed);
      enemyAttack(run, ctx, en);
      if (ctx.isOver()) return;
    }
  }

  if (e.boss) {
    e.summonTimer -= dt;
    if (e.summonTimer <= 0) {
      e.summonTimer = 8;
      bossSpecial(run, ctx, e);
    }
  }
}

export function tickHeroStatus(run, ctx, dt) {
  const h = run.hero;
  const active = tickStatusList(h, dt);
  let dmg = 0;
  for (const st of active) {
    if (st.kind === 'poison') dmg += st.power * dt;
  }
  if (dmg <= 0) return;
  h.hp -= dmg;
  run.dmgTaken += dmg;
  h.poisonAcc = (h.poisonAcc || 0) + dt;
  if (h.poisonAcc >= 0.5) {
    h.poisonAcc = 0;
    const pos = heroPos(run);
    ctx.emit.floatAt(pos.x + rng.float(-7, 7), pos.y - 34, `-${Math.max(1, Math.round(dmg * 2))}`, '#8fd6a0', 11);
  }
  if (h.hp <= 0) ctx.ctrl.die();
}

export function bossSpecial(run, ctx, e) {
  const h = run.hero;
  switch (e.type) {
    case 'lich':
      summonSkeletons(run, ctx, e, 1);
      break;
    case 'priestess': {
      const heal = Math.round(e.maxHp * 0.03);
      e.hp = Math.min(e.maxHp, e.hp + heal);
      const pos = enemyPos(run, e);
      ctx.emit.floatAt(pos.x, pos.y - e.r - 10, `+${heal}`, '#8fd6a0', 13);
      summonSkeletons(run, ctx, e, 1);
      break;
    }
    case 'hunter': {
      const dmg = Math.max(1, e.atk * 0.7 - h.def * 0.35);
      h.hp -= dmg;
      run.dmgTaken += dmg;
      h.hurtFlash = 1;
      const pos = heroPos(run);
      ctx.emit.floatAt(pos.x, pos.y - 26, `-${Math.round(dmg)}`, '#ffb06a', 14);
      ctx.emit.floatAt(pos.x, pos.y - 40, '飞刀', '#d8b25a', 11);
      ctx.emit.burst(pos, 4, '#d8b25a');
      if (h.hp <= 0) ctx.ctrl.die();
      break;
    }
    case 'omega':
      summonSkeletons(run, ctx, e, 2);
      ctx.emit.shakeMax(6);
      break;
    default:
      summonSkeletons(run, ctx, e, 1);
  }
}

export function heroAttack(run, ctx, e) {
  const h = run.hero;
  h.attackAnim = 0.22;
  const crit = rng.chance(h.crit);
  let dmg = h.atk * (crit ? h.critDmg : 1);
  let combo = false;
  if (h.classId === 'rogue' && rng.chance(0.15)) {
    dmg *= 1.6;
    combo = true;
  }
  dmg = Math.max(1, dmg);
  if (h.lureCharges > 0) {
    dmg *= 1 - (h.lureReduction || 0);
    h.lureCharges -= 1;
  }
  if (h.vamp > 0) h.hp = Math.min(h.maxHp, h.hp + dmg * h.vamp);

  // 注意：浮字 / 爆发 / 击杀结算的随机数消耗顺序必须与拆分前完全一致
  // （burst 每粒子消耗 4 个随机数，killEnemy 也会消耗随机数，顺序错即随机流错位）
  const dead = dealDamageToEnemy(run, ctx, e, dmg, 'hero', {
    pos: enemyPos(run, e),
    text: `-${Math.round(dmg)}`,
    color: crit ? '#ffd45e' : '#ff8f7a',
    size: crit ? 18 : 14,
    dy: 6,
    extraText: combo ? { text: '连击', dy: 22, color: '#8fbf9f', size: 12 } : null,
    burst: crit ? 8 : 4,
    burstColor: crit ? '#ffd45e' : '#e06a55',
  });
  if (crit) ctx.emit.shakeMax(4);

  if (dead) return;
  if (e.boss && !e.phase2 && e.hp <= e.maxHp * 0.5) {
    e.phase2 = true;
    e.atk = Math.round(e.atk * 1.35);
    ctx.emit.flash(0.8);
    ctx.emit.toast(`${e.name}进入狂暴，攻击力提升`, 'warn');
    summonSkeletons(run, ctx, e, 2);
  }
}

export function updateSkeletons(run, ctx, e, dt) {
  const h = run.hero;
  for (const sk of h.skeletons) {
    if (sk.hp <= 0) continue;
    sk.timer -= dt;
    if (sk.timer > 0) continue;
    sk.timer += 0.9;
    const dead = dealDamageToEnemy(run, ctx, e, sk.atk, 'skeleton', {
      text: `-${Math.round(sk.atk)}`,
      color: '#cfd6c9',
      size: 11,
      dy: 2,
      burst: 2,
      burstColor: '#cfd6c9',
      jitter: 9,
    });
    if (dead) return;
  }
}

export function counterAttack(run, ctx, e) {
  const dmg = Math.max(1, run.hero.atk * 0.8);
  dealDamageToEnemy(run, ctx, e, dmg, 'counter', {
    text: '反击',
    color: '#e8c07a',
    size: 12,
    dy: 20,
    burst: 3,
    burstColor: '#e8c07a',
  });
}

export function enemyAttack(run, ctx, e) {
  const h = run.hero;
  if (h.invuln > 0) return;

  const aliveSk = h.skeletons.filter((s) => s.hp > 0);
  if (aliveSk.length && rng.chance(0.35)) {
    const sk = rng.pick(aliveSk);
    const dmg = Math.max(1, e.atk * 0.85 - 1);
    sk.hp -= dmg;
    const pos = heroPos(run);
    ctx.emit.floatAt(pos.x + rng.float(-14, 14), pos.y - 16, `-${Math.round(dmg)}`, '#cfd6c9', 11);
    ctx.emit.burst(pos, 2, '#cfd6c9');
    if (sk.hp <= 0) {
      h.skeletons = h.skeletons.filter((s) => s !== sk);
      ctx.emit.floatAt(pos.x, pos.y - 32, '骷髅倒下', '#8b8578', 12);
      ctx.emit.burst(pos, 8, '#cfd6c9');
    }
    return;
  }

  if (rng.chance(h.evade)) {
    const pos = heroPos(run);
    ctx.emit.floatAt(pos.x, pos.y - 26, '闪避', '#9fd6ff', 13);
    return;
  }
  const n = (run.group || []).length;
  const groupRelief = Math.max(0.85, 1 - 0.05 * Math.max(0, n - 1));
  const dmg = Math.max(1, (e.atk - h.def * 0.7) * (1 - Math.min(0.4, run.mapMods.enemyDmgReduce || 0)) * (1 - (h.damageReduction || 0)) * (n > 1 ? groupRelief : 1));
  h.hp -= dmg;
  run.dmgTaken += dmg;
  h.hurtFlash = 1;
  ctx.emit.shakeMax(3.5);

  if (e.vamp > 0) e.hp = Math.min(e.maxHp, e.hp + dmg * e.vamp);

  const pos = heroPos(run);
  ctx.emit.floatAt(pos.x, pos.y - 26, `-${Math.round(dmg)}`, '#ff6b5e', 14);
  ctx.emit.burst(pos, 4, '#c0483f');

  if (h.hp <= 0) { ctx.ctrl.die(); return; }
  triggerHook(e, 'onHitHero', makeAbilityCtx(run, ctx));
  if (h.classId === 'warrior' && e.alive && rng.chance(h.counterChance || 0.2)) counterAttack(run, ctx, e);
}

export function summonSkeletons(run, ctx, boss, count) {
  for (let i = 0; i < count; i++) {
    const sk = makeEnemy('skeleton', run.loop, { cell: boss.cell, mul: run.enemyMul });
    sk.hp = Math.round(sk.hp * 0.5);
    sk.maxHp = sk.hp;
    sk.summoned = true;
    sk.atkTimer = 1.5;
    run.enemies.push(sk);
    addToGroup(run, sk);
    ctx.emit.burst(enemyPos(run, sk), 8, '#c9c4b4');
  }
  ctx.emit.toast(`${boss.name}召唤了骷髅`, 'warn');
}

// ---------- 单一对敌伤害入口（S0.3）----------
// source ∈ 'hero' | 'skeleton' | 'counter' | 'tower' | 'status'（S1 的 onHurt / onBeforeDeath 钩子按它分派）
// fx.pos 可由调用方预取，避免击杀后 e.cell 变化导致坐标偏移；fx 为 null 时不产生表现（预留给 S1 的毒伤 tick）
export function dealDamageToEnemy(run, ctx, e, dmg, source = 'hero', fx = null) {
  if (!e.alive) return false;
  const reduction = Math.min(0.5, (e.shieldStacks || 0) * (e.shieldPer || 0));
  const dealt = dmg * (1 - reduction);
  e.hp -= dealt;
  run.dmgDealt += dealt;
  if (fx) {
    const pos = fx.pos || enemyPos(run, e);
    if (fx.text) {
      const jx = fx.jitter ? rng.float(-fx.jitter, fx.jitter) : 0;
      ctx.emit.floatAt(pos.x + jx, pos.y - e.r - (fx.dy == null ? 4 : fx.dy),
        fx.text, fx.color || '#ffffff', fx.size || 12);
    }
    if (fx.extraText) {
      const x = fx.extraText;
      ctx.emit.floatAt(pos.x, pos.y - e.r - (x.dy == null ? 22 : x.dy), x.text, x.color || '#ffffff', x.size || 12);
    }
    if (fx.burst) ctx.emit.burst(pos, fx.burst, fx.burstColor || '#ffffff');
  }
  if (e.hp > 0) triggerHook(e, 'onHurt', makeAbilityCtx(run, ctx));
  if (e.hp <= 0) {
    killEnemy(run, ctx, e);
    return !e.alive;
  }
  return false;
}

// 塔攻击等外部伤害入口
export function damageEnemy(run, ctx, e, dmg, kind = 'hit') {
  dealDamageToEnemy(run, ctx, e, dmg, 'tower', {
    pos: enemyPos(run, e),
    text: `-${Math.round(dmg)}`,
    color: kind === 'bolt' ? '#a9b6ff' : '#e8d9a8',
    size: 12,
    dy: 4,
    burst: 3,
    burstColor: kind === 'bolt' ? '#a9b6ff' : '#e8d9a8',
  });
}

export function killEnemy(run, ctx, e) {
  if (!e.alive) return;
  const h = run.hero;
  const deathRes = triggerHook(e, 'onBeforeDeath', makeAbilityCtx(run, ctx));
  if (deathRes === 'revive') return;
  e.alive = false;
  e.hp = 0;
  const wasTarget = run.target === e;
  if (wasTarget) run.target = null;
  run.group = (run.group || []).filter((x) => x !== e && x.alive);
  if (wasTarget && run.group.length) run.target = run.group[0];

  run.kills += 1;
  if (run.quest) {
    run.quest.have += 1;
    if (run.quest.have >= run.quest.need) completeQuest(run, ctx);
  }

  if (e.stolenFrom) {
    const { slot, item } = e.stolenFrom;
    e.stolenFrom = null;
    if (!h.equipment[slot]) {
      h.equipment[slot] = item;
      deriveHero(h, run.mapMods, ctx.meta);
      ctx.emit.toast(`夺回了${item.name}`, 'good');
    } else {
      ctx.ctrl.offerLoot(item, { force: true });
    }
  }
  const pos = enemyPos(run, e);
  ctx.emit.burst(pos, 14, e.color);
  ctx.emit.floatAt(pos.x, pos.y - 30, '击杀', '#d8c58a', 13);

  const xp = Math.round(e.xp * (1 + (run.mapMods.xpBonus || 0) + (h.xpBonus || 0)));
  if (xp > 0) {
    const ups = gainXp(h, xp);
    run.pendingLevels += ups;
  }

  const drops = rollResources(e, run.loop);
  if (drops.wood > 0 && ctx.meta.buildings.lumberjack) drops.wood += 1;
  if (drops.stone > 0 && ctx.meta.buildings.smelter) drops.stone += ctx.meta.buildings.smelter;
  if (ctx.meta.buildings.smelter >= 2 && rng.chance(0.2)) drops.metal += 1;
  for (const [k, v] of Object.entries(drops)) {
    if (!v) continue;
    run.resources[k] += v;
    ctx.emit.floatAt(pos.x + rng.float(-10, 10), pos.y - 44, `+${v} ${resName(k)}`, '#c9b77a', 12);
  }

  // 盗贼：顺手牵羊（战利品包，回营结算）
  if (h.classId === 'rogue' && rng.chance(0.35)) {
    run.lootBag = (run.lootBag || 0) + 1;
    ctx.emit.floatAt(pos.x + rng.float(-14, 14), pos.y - 56, '+1 战利品包', '#8fbf9f', 11);
  }

  // 宝库：额外魂晶
  if (run.mapMods.soulChance && rng.chance(run.mapMods.soulChance)) {
    run.resources.soul += 1;
    ctx.emit.floatAt(pos.x + rng.float(-18, 18), pos.y - 68, '+1 魂晶', '#a98bd0', 11);
  }

  // 祖先墓穴：击杀有灵魂的敌人提升生命上限
  if (run.mapMods.soulMaxHp && e.loot && e.loot.soul) {
    h.bonus.maxHp += run.mapMods.soulMaxHp;
    deriveHero(h, run.mapMods, ctx.meta);
    h.hp = Math.min(h.maxHp, h.hp + run.mapMods.soulMaxHp);
    ctx.emit.floatAt(pos.x, pos.y - 78, `+${run.mapMods.soulMaxHp} 最大生命`, '#a98bd0', 11);
  }

  const lootChance = 0.2 + h.lootBonus + (e.elite ? 0.2 : 0);
  if (e.guaranteeEquip || rng.chance(lootChance)) {
    const item = rollEquip(run.loop, h.lootBonus, rng.pick(h.slotIds));
    ctx.emit.burst(pos, 8, '#d8b25a');
    ctx.ctrl.offerLoot(item);
    ctx.emit.floatAt(pos.x, pos.y - 56, `装备：${item.name}`, '#d8b25a', 11);
  }

  run.drawProgress += 1;
  if (run.drawProgress >= 2) {
    run.drawProgress = 0;
    fillHand(run, ctx);
  }

  if (e.boss) {
    run.resources.shard += 2;
    run.resources.tome += 1;
    if (run.infinite) ctx.ctrl.clearLayer();
    else ctx.ctrl.victory();
    return;
  }

  if (run.pendingLevels > 0 && !run.traitChoices && !run.pendingLoot) {
    ctx.ctrl.openTraits();
    return;
  }

  if (ctx.isOver() || (run.target && run.target.alive)) return;
  const next = run.enemies.find((x) => x.alive && x.cell === h.cell);
  if (next) startCombat(run, ctx, next);
}
