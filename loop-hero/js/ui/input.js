// 输入：鼠标铺牌、键盘快捷键
import { CELL, OFFSET_Y, CANVAS_W, CANVAS_H } from '../core/config.js';
import { showTip, hideTip, tipHtml } from './tooltip.js';

export function initInput(game, canvas) {
  const toCell = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((ev.clientY - rect.top) / rect.height) * CANVAS_H;
    const cx = Math.floor(x / CELL);
    const cy = Math.floor((y - OFFSET_Y) / CELL);
    return { x: cx, y: cy };
  };

  canvas.addEventListener('pointermove', (ev) => {
    if (game.mode !== 'run') { hideTip(); return; }
    const c = toCell(ev);
    game.hoverCell = c;
    canvas.style.cursor = game.selectedCard != null ? 'crosshair' : 'default';

    if (game.selectedCard == null) {
      const info = game.cellInfo(c.x, c.y);
      if (info) showTip(tipHtml(info.name, info.kind, info.desc), ev.clientX, ev.clientY);
      else hideTip();
    } else {
      const info = game.placementCheck(c.x, c.y);
      if (info) showTip(tipHtml(`${info.ok ? '✓ ' : '✕ '}${info.name}`, info.ok ? '可放置' : '无法放置', info.reason), ev.clientX, ev.clientY);
      else hideTip();
    }
  });

  canvas.addEventListener('pointerleave', () => {
    game.hoverCell = null;
    hideTip();
  });

  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    if (game.mode !== 'run' || game.paused) return;
    if (game.selectedCard == null) return;
    const c = toCell(ev);
    game.tryPlace(c.x, c.y);
    hideTip();
  });

  canvas.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    game.cancelSelection();
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    const key = ev.key;

    if (key === 'Escape') {
      if (game.mode === 'run' && game.paused && !game.run?.traitChoices) {
        game.togglePause();
      } else {
        game.cancelSelection();
      }
      return;
    }

    if (game.mode !== 'run' || !game.run) return;
    if (game.run.traitChoices) return;

    if (/^[1-7]$/.test(key)) {
      game.selectCard(Number(key) - 1);
      ev.preventDefault();
    } else if (key === 'q' || key === 'Q') {
      game.drinkPotion();
    } else if (key === ' ') {
      game.togglePause();
      ev.preventDefault();
    } else if (key === 's' || key === 'S') {
      game.cycleSpeed();
    }
  });
}
