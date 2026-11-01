// 经济：远征结算、任务奖励、资源命名（无 DOM 依赖）
import { rng } from '../core/rng.js';
import { rollEquip } from './loot.js';
import { heroPos } from './geom.js';

export function resName(k) {
  return {
    wood: '木材', stone: '石料', soul: '魂晶',
    metal: '稳定金属', shard: '记忆碎片', tome: '古籍',
  }[k] || k;
}

// 远征结算：死亡 / 撤退 / 通关都会调用
export function bankResources(run, ctx) {
  if (run.banked) return run.bankList || [];
  run.banked = true;

  // 远征结算奖励：走得越远，带回的补给越多（原地撤退不刷资源）
  if (run.loop >= 2 || run.kills > 0) {
    run.resources.wood += 3 + Math.floor(run.loop * 0.8);
    run.resources.stone += 2 + Math.floor(run.loop * 0.5);
    if (run.loop >= 5) run.resources.soul += 1;
  }

  const list = [];
  for (const k of Object.keys(run.resources)) {
    const amount = run.resources[k] || 0;
    if (!amount) continue;
    ctx.meta.resources[k] = (ctx.meta.resources[k] || 0) + amount;
    list.push({ key: k, label: resName(k), amount });
  }
  run.bankList = list;
  ctx.meta.runs += 1;
  ctx.meta.bestLoop = Math.max(ctx.meta.bestLoop, run.loop);
  ctx.ctrl.saveMeta();
  return list;
}

// 村庄 / 伯爵任务完成奖励
export function completeQuest(run, ctx) {
  const h = run.hero;
  const q = run.quest;
  if (!q) return;
  run.quest = null;
  const item = rollEquip(run.loop, h.lootBonus + 0.2, rng.pick(h.slotIds));
  ctx.ctrl.offerLoot(item);
  run.resources.soul += q.tier === 2 ? 3 : 1;
  run.resources.stone += q.tier === 2 ? 4 : 2;
  ctx.emit.toast(`任务完成：${item.name}`, 'good');
  ctx.emit.burst(heroPos(run), 12, '#d8b25a');
}
