// 地形/任务触发效果：铁匠炉熔炼、村庄任务（经过时触发）
import { itemScore } from './loot.js';
import { deriveHero } from '../world/hero.js';
import { heroPos } from './geom.js';

// 铁匠炉：熔掉最弱的一件装备，换取减伤
export function useForge(run, ctx) {
  const h = run.hero;
  const items = Object.entries(h.equipment).filter(([, it]) => it);
  if (items.length < 2) return;
  items.sort((a, b) => itemScore(a[1]) - itemScore(b[1]));
  const [slot, item] = items[0];
  h.equipment[slot] = null;
  h.bonus.damageReduction = Math.min(0.12, (h.bonus.damageReduction || 0) + 0.04);
  run.resources.metal = (run.resources.metal || 0) + 1;
  deriveHero(h, run.mapMods, ctx.meta);
  ctx.emit.toast(`铁匠炉熔掉了 ${item.name}，减伤 +4%`, 'good');
  const pos = heroPos(run);
  ctx.emit.floatAt(pos.x, pos.y - 44, '+4% 减伤', '#d8b25a', 12);
}

// 村庄 / 伯爵任务
export function startQuest(run, ctx, tier) {
  if (run.quest) return;
  const need = tier === 2 ? 8 : 5;
  run.quest = { tier, need, have: 0 };
  ctx.emit.toast(`${tier === 2 ? '伯爵任务' : '村庄任务'}：击杀 ${need} 个敌人`, 'good');
}
