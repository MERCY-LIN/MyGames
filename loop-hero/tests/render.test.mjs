// 渲染冒烟测试：用假的 Canvas 2D 上下文跑一遍渲染，抓运行时错误
import assert from 'node:assert/strict';

class El {
  constructor(id = '') {
    this.id = id;
    this.innerHTML = '';
    this.textContent = '';
    this.disabled = false;
    this.dataset = {};
    this.style = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  }
  addEventListener() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
  appendChild() {}
  closest() { return null; }
}

const gradient = () => ({ addColorStop() {} });
const baseCtx = {
  createLinearGradient: gradient,
  createRadialGradient: gradient,
  measureText: () => ({ width: 10 }),
};
const ctx = new Proxy(baseCtx, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (typeof prop === 'string' && !prop.startsWith('__')) return () => {};
    return undefined;
  },
  set(target, prop, value) { target[prop] = value; return true; },
});

const els = new Map();
globalThis.document = {
  getElementById(id) {
    if (!els.has(id)) els.set(id, new El(id));
    return els.get(id);
  },
  createElement(tag) {
    if (tag === 'canvas') {
      return { width: 0, height: 0, getContext: () => ctx, style: {} };
    }
    return new El(tag);
  },
  querySelectorAll() { return []; },
  body: new El('body'),
};

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { Game } = await import('../js/game.js');
const { initHUD, renderHUD } = await import('../js/ui/hud.js');
const { initScreens, showCamp } = await import('../js/ui/screens.js');
const { render } = await import('../js/render/scene.js');
const { canPlace, placeCard } = await import('../js/world/loopMap.js');
const { makeEnemy } = await import('../js/data/enemies.js');

const game = new Game();
game.meta.resources = { wood: 50, stone: 50, soul: 20 };
initHUD(game);
initScreens(game);

// 营地画面
showCamp(game);
render(ctx, game, 0);
console.log('  ✓ 营地界面与画面渲染');

game.startRun();
renderHUD(game);
const run = game.run;

game.togglePause();
game.togglePause();
console.log('  ✓ 暂停界面开关');

// 铺一些牌，触发组合与特效
let placed = 0;
for (const row of run.map.grid) {
  if (placed >= 12) break;
  for (const c of row) {
    if (placed >= 12) break;
    const id = run.hand[0];
    if (!id || !canPlace(run.map, c, id)) continue;
    game.selectCard(0);
    if (game.tryPlace(c.x, c.y)) placed++;
  }
}
assert.ok(placed > 0, '应该能放置卡牌');
console.log(`  ✓ 放置 ${placed} 张牌`);

// 选中态 + 悬停高亮
game.selectCard(0);
game.hoverCell = { x: 20, y: 2 };
render(ctx, game, 1);
console.log('  ✓ 放置高亮渲染');

// 把所有新卡牌各放一张，覆盖新地形的绘制分支
const newCards = [
  'desert', 'oasis', 'wasteland', 'reed', 'burntForest', 'library',
  'maze', 'arsenal', 'treasury', 'emptyTreasury', 'temporalBeacon', 'ancestralCrypt',
  'outpost', 'ruinedVillage', 'peak', 'streetlight', 'bridge',
  'savanna', 'timeCrystal', 'witchHouse', 'towerTemple', 'shipwreck',
  'goblinTower', 'bloodPath', 'hungryGrove', 'suburb', 'town',
  'countyEstate', 'dryBush', 'lichPalace', 'zeroBeacon', 'dimensionalCrack',
  'lighthouse', 'villageQuestion', 'abandonedLibrary',
];
const flat = run.map.grid.flat();
let newPlaced = 0;
for (const id of newCards) {
  const cell = flat.find((c) => canPlace(run.map, c, id));
  if (!cell) continue;
  placeCard(run.map, cell, id);
  newPlaced++;
}
run.mapRev += 1;
render(ctx, game, 2.5);
console.log(`  ✓ 新地形绘制分支（${newPlaced} 张）`);

// 强制进入 Boss 状态并制造特效
run.loop = 8;
run.bossMeter = 100;
game.maybeSpawnBoss();
assert.equal(run.bossSpawned, true);
game.floatAt(400, 300, '-99', '#ff8f7a', 16);
game.burst({ x: 400, y: 300 }, 12, '#d8b25a');
game.shake = 8;
game.flash = 1;

// 在英雄前方放一只精英骷髅和几只不同敌人，覆盖各种绘制分支
const len = run.map.path.length;
const shapes = ['skeleton', 'spider', 'wolf', 'ghost', 'mimic', 'vampire', 'slime', 'mosquito', 'book', 'harpy', 'worm', 'bloodClot'];
shapes.forEach((type, i) => {
  const enemy = makeEnemy(type, 8, { cell: (run.hero.cell + 1 + i) % len });
  if (i === 0) enemy.elite = true;
  run.enemies.push(enemy);
});
render(ctx, game, 2);
console.log('  ✓ 敌人绘制分支覆盖');

// 跑一段真实更新，让战斗/粒子/浮动文字都走一遍
for (let i = 0; i < 300; i++) {
  game.update(1 / 30);
  render(ctx, game, i / 30);
  if (i % 10 === 0) renderHUD(game);
  if (game.run?.traitChoices) game.chooseTrait(game.run.traitChoices[0].id);
  if (game.mode !== 'run') break;
}
console.log(`  ✓ 运行 ${300} 帧，模式=${game.mode}，圈数=${run.loop}，击杀=${run.kills}`);

// 死亡 / 胜利界面
game.die();
render(ctx, game, 10);
console.log('  ✓ 结算界面渲染');

console.log('\n渲染冒烟测试通过');
