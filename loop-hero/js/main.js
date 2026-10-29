// 入口：装配游戏、HUD、输入与渲染循环
import { Game } from './game.js';
import { initHUD, renderHUD, showHUD } from './ui/hud.js';
import { initScreens, showCamp } from './ui/screens.js';
import { initInput } from './ui/input.js';
import { initTooltip } from './ui/tooltip.js';
import { render } from './render/scene.js';

function fatal(err) {
  const stage = document.getElementById('stage');
  let box = document.getElementById('fatal');
  if (!box) {
    box = document.createElement('div');
    box.id = 'fatal';
    box.style.cssText = 'position:absolute;left:0;right:0;top:0;z-index:99;background:#3a1111;color:#ffd0c8;' +
      'font:12px/1.5 monospace;padding:10px 14px;white-space:pre-wrap;max-height:45%;overflow:auto';
    stage.appendChild(box);
  }
  box.textContent += `${err}\n`;
  document.title = 'ERR ' + String(err).slice(0, 80);
}

window.addEventListener('error', (e) => fatal(`${e.message} @ ${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => fatal(`Promise: ${e.reason}`));

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const game = new Game();
initHUD(game);
initScreens(game);
initInput(game, canvas);
initTooltip();
showHUD(false);
showCamp(game);

const params = new URLSearchParams(location.search);
if (params.has('play')) game.startRun();

let last = performance.now();
let hudAt = 0;

function frame(now) {
  const dt = (now - last) / 1000;
  last = now;

  game.update(dt);
  if (game.paused) {
    game.flash = Math.max(0, game.flash - dt * 2);
    game.shake = Math.max(0, game.shake - dt * 20);
  }
  render(ctx, game, now / 1000);

  if (now - hudAt > 80) {
    hudAt = now;
    if (game.mode === 'run') renderHUD(game);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

window.__loopHero = game;
