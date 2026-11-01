// 手牌与卡堆（无 DOM 依赖）
import { rng } from '../core/rng.js';
import { HAND_BASE } from '../core/config.js';
import { CARDS } from '../data/cards.js';
import { markCard } from './codex.js';

export function handMax(ctx) {
  const b = ctx.meta.buildings;
  return HAND_BASE + Math.min(3, b.intel || 0) + ((b.library || 0) >= 2 ? 1 : 0);
}

export function drawCards(run, ctx, n) {
  for (let i = 0; i < n; i++) {
    if (!run.deck.length) {
      if (!run.discard.length) return;
      run.deck = rng.shuffle(run.discard);
      run.discard = [];
    }
    run.hand.push(run.deck.pop());
    markCard(ctx.meta, run.hand[run.hand.length - 1]);
  }
}

export function fillHand(run, ctx, all = false) {
  const max = handMax(ctx);
  const target = all ? max : Math.min(max, run.hand.length + 1);
  while (run.hand.length < target) {
    if (!run.deck.length) {
      if (!run.discard.length) break;
      run.deck = rng.shuffle(run.discard);
      run.discard = [];
    }
    run.hand.push(run.deck.pop());
    markCard(ctx.meta, run.hand[run.hand.length - 1]);
  }
}

// 核心弃牌逻辑：由 Game.discardCard 做守卫后调用
export function discardCard(run, ctx, i) {
  const id = run.hand[i];
  if (!id) return null;
  run.hand.splice(i, 1);
  run.discard.push(id);
  ctx.emit.toast(`弃掉了 ${CARDS[id].name}`);
  return id;
}
