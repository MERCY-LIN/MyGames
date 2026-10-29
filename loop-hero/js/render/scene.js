// Canvas 渲染：地形缓存 + 动态层（英雄/敌人/特效）
import { CELL, OFFSET_Y, CANVAS_W, CANVAS_H, GRID_W, GRID_H } from '../core/config.js';
import { CARDS } from '../data/cards.js';
import { canPlace } from '../world/loopMap.js';

const P = {
  ink: '#0d0f13',
  ground: '#14171d',
  ground2: '#171a21',
  road: '#2e2d27',
  roadTop: '#3a3830',
  roadLine: '#4c4738',
  gold: '#d8b25a',
  skin: '#d8c3a5',
  steel: '#c3c6cc',
  cape: '#8c3b3b',
  hp: '#c04a3d',
  hpBack: '#241b1b',
};

let noiseCanvas = null;
let vignette = null;
let terrainCanvas = null;
let terrainRev = -1;
let terrainMap = null;

export function render(ctx, game, t) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  if (!game.run) {
    drawCampBackdrop(ctx, t);
    return;
  }
  ensureNoise();
  ensureVignette(ctx);

  const shakeX = game.shake ? (Math.random() - 0.5) * game.shake : 0;
  const shakeY = game.shake ? (Math.random() - 0.5) * game.shake : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  ctx.drawImage(noiseCanvas, 0, 0);
  drawTerrain(ctx, game);
  drawCampfireGlow(ctx, game, t);
  drawPlacementHints(ctx, game, t);
  drawActors(ctx, game, t);
  drawEffects(ctx, game);
  drawFog(ctx, game);
  ctx.restore();

  ctx.drawImage(vignette, 0, 0);
  if (game.flash > 0) {
    ctx.fillStyle = `rgba(90, 70, 130, ${0.18 * game.flash})`;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  drawBossArrow(ctx, game, t);
}

function ensureNoise() {
  if (noiseCanvas) return;
  noiseCanvas = document.createElement('canvas');
  noiseCanvas.width = CANVAS_W;
  noiseCanvas.height = CANVAS_H;
  const g = noiseCanvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, '#101319');
  grad.addColorStop(0.55, '#151820');
  grad.addColorStop(1, '#0c0e12');
  g.fillStyle = grad;
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);

  let seed = 12345;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 5200; i++) {
    const x = rand() * CANVAS_W;
    const y = rand() * CANVAS_H;
    const a = rand() * 0.05;
    g.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * 1.6})`;
    g.fillRect(x, y, 1.5, 1.5);
  }
}

function ensureVignette(ctx) {
  if (vignette) return;
  vignette = document.createElement('canvas');
  vignette.width = CANVAS_W;
  vignette.height = CANVAS_H;
  const g = vignette.getContext('2d');
  const rad = g.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, CANVAS_H * 0.35, CANVAS_W / 2, CANVAS_H / 2, CANVAS_W * 0.72);
  rad.addColorStop(0, 'rgba(0,0,0,0)');
  rad.addColorStop(0.7, 'rgba(0,0,0,0.35)');
  rad.addColorStop(1, 'rgba(0,0,0,0.78)');
  g.fillStyle = rad;
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

function drawCampBackdrop(ctx, t) {
  ctx.fillStyle = '#0b0d11';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const cx = CANVAS_W / 2;
  const cy = CANVAS_H * 0.7;
  const glow = ctx.createRadialGradient(cx, cy, 10, cx, cy, 420);
  glow.addColorStop(0, 'rgba(216, 150, 70, 0.20)');
  glow.addColorStop(0.4, 'rgba(180, 90, 50, 0.07)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  for (let i = 0; i < 26; i++) {
    const y = cy - ((t * 22 + i * 47) % 260);
    const x = cx + Math.sin(t * 0.7 + i) * (30 + i * 7);
    ctx.fillStyle = `rgba(230, 160, 80, ${0.18 * (1 - (cy - y) / 260)})`;
    ctx.fillRect(x, y, 2, 2);
  }
}

// ---------- 地形缓存 ----------

function drawTerrain(ctx, game) {
  const map = game.run.map;
  if (!terrainCanvas) {
    terrainCanvas = document.createElement('canvas');
    terrainCanvas.width = CANVAS_W;
    terrainCanvas.height = CANVAS_H;
  }
  if (terrainRev !== game.mapRev || terrainMap !== map) {
    terrainRev = game.mapRev;
    terrainMap = map;
    const g = terrainCanvas.getContext('2d');
    g.clearRect(0, 0, CANVAS_W, CANVAS_H);
    paintStatic(g, map);
  }
  ctx.drawImage(terrainCanvas, 0, 0);
}

function paintStatic(g, map) {
  // 环线内部：更暖的草地底色，避免整张图空成黑块
  const b = map.bounds;
  const ix = (b.x0 + 1) * CELL;
  const iy = (b.y0 + 1) * CELL + OFFSET_Y;
  const iw = (b.x1 - b.x0 - 1) * CELL;
  const ih = (b.y1 - b.y0 - 1) * CELL;

  const grad = g.createLinearGradient(0, iy, 0, iy + ih);
  grad.addColorStop(0, 'rgba(32, 40, 34, 0.55)');
  grad.addColorStop(1, 'rgba(22, 27, 23, 0.55)');
  g.fillStyle = grad;
  g.fillRect(ix, iy, iw, ih);

  // 稀疏草点
  for (let y = b.y0 + 1; y < b.y1; y++) {
    for (let x = b.x0 + 1; x < b.x1; x++) {
      const seed = (x * 37 + y * 61) % 11;
      if (seed !== 0) continue;
      g.fillStyle = 'rgba(120, 145, 100, 0.10)';
      g.fillRect(x * CELL + 8 + (seed % 3) * 6, y * CELL + OFFSET_Y + 10 + (seed % 5) * 4, 2, 3);
    }
  }

  g.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  g.lineWidth = 1;
  g.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = map.grid[y][x];
      if (c.kind === 'path') drawRoad(g, c, map);
    }
  }
  // 路边空槽：极轻的点阵
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = map.grid[y][x];
      if (c.kind === 'roadside' && !c.card) {
        g.fillStyle = 'rgba(200, 200, 190, 0.05)';
        g.fillRect(c.x * CELL + 14, c.y * CELL + CELL + 14, 4, 4);
      }
    }
  }
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = map.grid[y][x];
      if (c.card) drawCardTile(g, c, map);
    }
  }
  drawCampBase(g, map);
}

function drawRoad(g, c) {
  const x = c.x * CELL;
  const y = c.y * CELL + OFFSET_Y;
  g.fillStyle = P.road;
  g.fillRect(x, y, CELL, CELL);
  g.fillStyle = P.roadTop;
  g.fillRect(x, y, CELL, 2);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(x, y + CELL - 4, CELL, 4);

  // 碎石
  const n = (c.x * 7 + c.y * 13) % 5;
  g.fillStyle = 'rgba(255,255,255,0.04)';
  for (let i = 0; i < n; i++) {
    g.fillRect(x + ((c.x * 31 + i * 11) % 26) + 2, y + ((c.y * 17 + i * 7) % 24) + 3, 2, 2);
  }
  for (let i = 0; i < 3; i++) {
    const sx = x + ((c.x * 19 + c.y * 23 + i * 9) % 24) + 2;
    const sy = y + ((c.x * 11 + c.y * 29 + i * 7) % 22) + 4;
    g.fillStyle = i % 2 ? 'rgba(90, 84, 68, 0.35)' : 'rgba(20, 19, 16, 0.35)';
    g.fillRect(sx, sy, 5, 3);
  }
}

function drawCampBase(g, map) {
  const c = map.path[0];
  const x = c.x * CELL + CELL / 2;
  const y = c.y * CELL + OFFSET_Y + CELL / 2;
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.beginPath(); g.ellipse(x, y + 6, 26, 12, 0, 0, Math.PI * 2); g.fill();
  // 帐篷
  g.fillStyle = '#4a3c2e';
  g.beginPath();
  g.moveTo(x - 30, y + 8);
  g.lineTo(x - 18, y - 14);
  g.lineTo(x - 6, y + 8);
  g.closePath(); g.fill();
  g.fillStyle = '#2a2119';
  g.beginPath();
  g.moveTo(x - 22, y + 8);
  g.lineTo(x - 18, y - 4);
  g.lineTo(x - 14, y + 8);
  g.closePath(); g.fill();
  // 柴堆
  g.strokeStyle = '#5a4530';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(x + 4, y + 8); g.lineTo(x + 20, y + 2); g.stroke();
  g.beginPath(); g.moveTo(x + 4, y + 2); g.lineTo(x + 20, y + 8); g.stroke();
}

function drawCampfireGlow(ctx, game, t) {
  const c = game.run.map.path[0];
  const x = c.x * CELL + CELL / 2;
  const y = c.y * CELL + OFFSET_Y + CELL / 2;
  const flick = 0.8 + Math.sin(t * 9) * 0.08 + Math.sin(t * 23) * 0.04;
  const grad = ctx.createRadialGradient(x, y, 2, x, y, 70);
  grad.addColorStop(0, `rgba(255, 170, 80, ${0.28 * flick})`);
  grad.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(x - 70, y - 70, 140, 140);
  // 火焰
  ctx.fillStyle = '#e8a04a';
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 3);
  ctx.quadraticCurveTo(x + 10, y - 8 * flick, x + 5, y - 16 * flick);
  ctx.quadraticCurveTo(x + 15, y - 8, x + 16, y + 3);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f5d27a';
  ctx.beginPath();
  ctx.moveTo(x + 7, y + 2);
  ctx.quadraticCurveTo(x + 11, y - 6 * flick, x + 9, y - 10 * flick);
  ctx.quadraticCurveTo(x + 14, y - 5, x + 13, y + 2);
  ctx.closePath(); ctx.fill();
}

// ---------- 卡牌地形美术 ----------

function drawCardTile(g, c, map) {
  const x = c.x * CELL;
  const y = c.y * CELL + OFFSET_Y;
  const id = c.card.variant || c.card.id;
  const def = CARDS[id];

  // 底色
  g.save();
  g.globalAlpha = 0.16;
  g.fillStyle = def.color;
  g.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
  g.restore();

  const cx = x + CELL / 2;
  const cy = y + CELL / 2;
  g.save();
  g.translate(cx, cy);

  // 地面投影
  g.fillStyle = 'rgba(0,0,0,0.32)';
  g.beginPath(); g.ellipse(0, 10, 12, 5, 0, 0, Math.PI * 2); g.fill();

  switch (id) {
    case 'rock': drawRock(g, 1); break;
    case 'mountain': drawMountain(g); break;
    case 'forest': drawTree(g, -7, 1, 0.85); drawTree(g, 6, 3, 0.7); break;
    case 'thicket': drawTree(g, -8, 2, 1); drawTree(g, 4, 0, 0.9); drawTree(g, 9, 5, 0.6); break;
    case 'meadow': drawGrass(g, false); break;
    case 'bloom': drawGrass(g, true); break;
    case 'river': drawRiver(g); break;
    case 'dunes': drawDunes(g); break;
    case 'bloodGrove': drawTree(g, -7, 1, 0.9, '#6b3438', '#3f2024'); drawTree(g, 6, 3, 0.7, '#6b3438', '#3f2024'); break;
    case 'wheat': drawWheat(g); break;
    case 'village': drawVillage(g); break;
    case 'cemetery': drawCemetery(g); break;
    case 'spiderNest': drawSpiderNest(g); break;
    case 'grove': drawTree(g, -8, 2, 0.9); drawTree(g, 5, 0, 0.75); break;
    case 'vampireMansion': drawMansion(g); break;
    case 'banditCamp': drawTent(g, '#7d4a32', '#4a2a1c'); break;
    case 'goblinCamp': drawTent(g, '#5f6b2e', '#38401c'); break;
    case 'ruins': drawRuins(g); break;
    case 'swamp': drawSwamp(g); break;
    case 'smithy': drawSmithy(g); break;
    case 'watchtower': drawTower(g); break;
    case 'stormTemple': drawTemple(g); break;
    case 'battlefield': drawBattlefield(g); break;
    case 'desert': drawDesert(g); break;
    case 'oasis': drawOasis(g); break;
    case 'overgrownField': drawOvergrown(g); break;
    case 'reed': drawReed(g); break;
    case 'burntForest': drawBurntForest(g); break;
    case 'bookery': drawBookery(g); break;
    case 'maze': drawMaze(g); break;
    case 'arsenal': drawArsenal(g); break;
    case 'treasury': drawTreasury(g); break;
    case 'temporalBeacon': drawBeacon(g); break;
    case 'ancestralCrypt': drawCrypt(g); break;
    case 'outpost': drawOutpost(g); break;
    case 'ruinedVillage': drawRuinedVillage(g); break;
    case 'ancientRuins': drawRuins(g); break;
    case 'giantNest': drawSpiderNest(g); break;
    case 'goblinMine': drawTent(g, '#5f6b2e', '#38401c'); break;
    case 'grandCemetery': drawCemetery(g); break;
    case 'emptyTreasury': drawTreasury(g); break;
    case 'peak': drawMountain(g); break;
    case 'library': drawBookery(g); break;
    case 'abandonedLibrary': drawBookery(g); break;
    case 'savanna': drawGrass(g, true); break;
    case 'villageQuestion': drawVillage(g); break;
    case 'suburb': drawVillage(g); break;
    case 'town': drawVillage(g); break;
    case 'countyEstate': drawMansion(g); break;
    case 'bridge': drawBridge(g); break;
    case 'streetlight': drawStreetlight(g); break;
    case 'lighthouse': drawBeacon(g); break;
    case 'timeCrystal': drawCrystal(g); break;
    case 'witchHouse': drawWitchHouse(g); break;
    case 'towerTemple': drawZiggurat(g); break;
    case 'shipwreck': drawShipwreck(g); break;
    case 'goblinTower': drawTower(g); break;
    case 'bloodPath': drawBloodPath(g); break;
    case 'hungryGrove': drawTree(g, -6, 2, 0.9, '#5f3535', '#3a2020'); break;
    case 'wasteland': drawWasteland(g); break;
    case 'dryBush': drawOvergrown(g); break;
    case 'lichPalace': drawMansion(g); break;
    case 'zeroBeacon': drawObelisk(g); break;
    case 'dimensionalCrack': drawRift(g); break;
    default: drawRock(g, 0.8);
  }
  g.restore();
}

function drawRock(g, scale = 1) {
  g.save(); g.scale(scale, scale);
  g.fillStyle = '#6d7078';
  g.beginPath();
  g.moveTo(-11, 8); g.lineTo(-8, -1); g.lineTo(-1, -6); g.lineTo(8, -2); g.lineTo(11, 8);
  g.closePath(); g.fill();
  g.fillStyle = '#8b8e96';
  g.beginPath();
  g.moveTo(-8, -1); g.lineTo(-1, -6); g.lineTo(8, -2); g.lineTo(2, 3);
  g.closePath(); g.fill();
  g.fillStyle = '#55585f';
  g.fillRect(-5, 4, 3, 3);
  g.restore();
}

function drawMountain(g) {
  g.fillStyle = '#5f636c';
  g.beginPath(); g.moveTo(-14, 10); g.lineTo(-2, -12); g.lineTo(12, 10); g.closePath(); g.fill();
  g.fillStyle = '#7c8089';
  g.beginPath(); g.moveTo(-2, -12); g.lineTo(12, 10); g.lineTo(4, 10); g.closePath(); g.fill();
  g.fillStyle = '#c9ccd4';
  g.beginPath(); g.moveTo(-2, -12); g.lineTo(1, -5); g.lineTo(-6, -4); g.closePath(); g.fill();
}

function drawTree(g, x, y, scale = 1, leaf = '#3f6b45', dark = '#2b4a30') {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  g.fillStyle = '#4a3826';
  g.fillRect(-1.5, 2, 3, 7);
  g.fillStyle = dark;
  g.beginPath(); g.moveTo(0, -13); g.lineTo(8, 4); g.lineTo(-8, 4); g.closePath(); g.fill();
  g.fillStyle = leaf;
  g.beginPath(); g.moveTo(0, -13); g.lineTo(6, 2); g.lineTo(-2, 2); g.closePath(); g.fill();
  g.fillStyle = dark;
  g.beginPath(); g.moveTo(0, -8); g.lineTo(9, 7); g.lineTo(-9, 7); g.closePath(); g.fill();
  g.fillStyle = leaf;
  g.beginPath(); g.moveTo(0, -8); g.lineTo(7, 5); g.lineTo(-3, 5); g.closePath(); g.fill();
  g.restore();
}

function drawGrass(g, flowers) {
  g.strokeStyle = '#6f8f4a';
  g.lineWidth = 1.4;
  for (let i = -8; i <= 8; i += 4) {
    g.beginPath();
    g.moveTo(i, 9);
    g.quadraticCurveTo(i + 1, 4, i + (i % 8 === 0 ? 3 : -2), 0);
    g.stroke();
  }
  if (flowers) {
    const cols = ['#d8b25a', '#d7d0e8', '#c77b6b'];
    for (let i = 0; i < 5; i++) {
      g.fillStyle = cols[i % 3];
      g.fillRect(-9 + i * 4.5, 2 - (i % 2) * 3, 2, 2);
    }
  }
}

function drawRiver(g) {
  g.fillStyle = '#2f5666';
  g.beginPath();
  g.moveTo(-14, 4);
  g.quadraticCurveTo(-4, -6, 4, 2);
  g.quadraticCurveTo(10, 7, 15, 2);
  g.lineTo(15, 10);
  g.quadraticCurveTo(4, 13, -14, 10);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(150, 200, 215, 0.55)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(-12, 6); g.quadraticCurveTo(-3, 0, 5, 6); g.stroke();
  g.beginPath(); g.moveTo(-6, 10); g.quadraticCurveTo(2, 5, 10, 9); g.stroke();
}

function drawDunes(g) {
  g.fillStyle = '#a08a5c';
  g.beginPath();
  g.moveTo(-14, 8); g.quadraticCurveTo(-4, -4, 6, 5); g.quadraticCurveTo(11, 9, 15, 6);
  g.lineTo(15, 11); g.lineTo(-14, 11); g.closePath(); g.fill();
  g.fillStyle = '#c2ab78';
  g.beginPath();
  g.moveTo(-14, 8); g.quadraticCurveTo(-4, -2, 6, 6); g.quadraticCurveTo(-4, 5, -14, 11);
  g.closePath(); g.fill();
}

function drawWheat(g) {
  g.strokeStyle = '#c9a94f';
  g.lineWidth = 1.2;
  for (let i = -9; i <= 9; i += 3.5) {
    g.beginPath(); g.moveTo(i, 9); g.lineTo(i + 1, -5); g.stroke();
    g.fillStyle = '#e0c063';
    g.fillRect(i - 1, -7, 4, 3);
  }
}

function drawVillage(g) {
  g.fillStyle = '#5a4736';
  g.fillRect(-10, -2, 20, 12);
  g.fillStyle = '#8a6a4a';
  g.beginPath(); g.moveTo(-13, -2); g.lineTo(0, -12); g.lineTo(13, -2); g.closePath(); g.fill();
  g.fillStyle = '#2a2018';
  g.fillRect(-3, 4, 6, 6);
  g.fillStyle = '#e0c063';
  g.fillRect(4, 2, 4, 4);
  g.fillStyle = '#6b5340';
  g.fillRect(-12, 8, 3, 3);
}

function drawCemetery(g) {
  g.fillStyle = '#7d818a';
  const stones = [[-9, 2, 5, 9], [-1, -1, 6, 12], [8, 3, 4, 8]];
  for (const [x, y, w, h] of stones) {
    g.beginPath();
    g.moveTo(x - w / 2, y + h);
    g.lineTo(x - w / 2, y);
    g.arc(x, y, w / 2, Math.PI, 0);
    g.lineTo(x + w / 2, y + h);
    g.closePath(); g.fill();
  }
  g.fillStyle = '#4b4f58';
  g.fillRect(-9, 6, 5, 1);
  g.fillRect(-1, 4, 6, 1);
}

function drawSpiderNest(g) {
  g.strokeStyle = 'rgba(210, 210, 220, 0.35)';
  g.lineWidth = 0.8;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 13, Math.sin(a) * 13); g.stroke();
  }
  for (let r = 5; r <= 12; r += 3.5) {
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke();
  }
  g.fillStyle = '#2a2730';
  g.beginPath(); g.ellipse(0, 2, 4, 5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#b4584f';
  g.fillRect(-2, 1, 1.5, 1.5);
  g.fillRect(1, 1, 1.5, 1.5);
}

function drawMansion(g) {
  g.fillStyle = '#3c2b3a';
  g.fillRect(-11, -8, 22, 18);
  g.fillStyle = '#5a3f55';
  g.beginPath(); g.moveTo(-13, -8); g.lineTo(-6, -15); g.lineTo(0, -8); g.lineTo(6, -15); g.lineTo(13, -8); g.closePath(); g.fill();
  g.fillStyle = '#d8b25a';
  g.fillRect(-7, -2, 3, 5);
  g.fillRect(3, -2, 3, 5);
  g.fillStyle = '#241a22';
  g.fillRect(-2, 3, 5, 7);
}

function drawTent(g, color, dark) {
  g.fillStyle = color;
  g.beginPath(); g.moveTo(-12, 10); g.lineTo(0, -12); g.lineTo(12, 10); g.closePath(); g.fill();
  g.fillStyle = dark;
  g.beginPath(); g.moveTo(-5, 10); g.lineTo(0, -12); g.lineTo(5, 10); g.closePath(); g.fill();
  g.strokeStyle = dark; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -12); g.lineTo(0, -16); g.stroke();
  g.fillStyle = color;
  g.beginPath(); g.moveTo(0, -16); g.lineTo(6, -13); g.lineTo(0, -11); g.closePath(); g.fill();
}

function drawRuins(g) {
  g.fillStyle = '#7a7466';
  for (const [x, h] of [[-10, 13], [-3, 17], [4, 9], [10, 12]]) {
    g.fillRect(x, 8 - h, 4, h);
  }
  g.fillStyle = '#5c574b';
  g.fillRect(-11, 5, 6, 3);
  g.fillRect(7, 7, 7, 3);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(-10, 6, 3, 2);
}

function drawSwamp(g) {
  g.fillStyle = '#33402f';
  g.beginPath(); g.ellipse(0, 6, 14, 7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#4a5f43';
  g.beginPath(); g.ellipse(-3, 5, 9, 4, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#7d8a4a'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(-8, 4); g.lineTo(-7, -6); g.stroke();
  g.beginPath(); g.moveTo(6, 5); g.lineTo(8, -4); g.stroke();
  g.fillStyle = 'rgba(180, 210, 170, 0.35)';
  g.fillRect(-10, 8, 4, 1.5);
  g.fillRect(2, 9, 5, 1.5);
}

function drawSmithy(g) {
  g.fillStyle = '#5a4636';
  g.fillRect(-10, -1, 20, 11);
  g.fillStyle = '#7a5c42';
  g.beginPath(); g.moveTo(-12, -1); g.lineTo(-2, -9); g.lineTo(8, -1); g.closePath(); g.fill();
  g.fillStyle = '#3a2c20';
  g.fillRect(5, -14, 4, 9);
  g.fillStyle = '#2a2622';
  g.beginPath(); g.moveTo(-6, 8); g.lineTo(-2, 3); g.lineTo(4, 3); g.lineTo(8, 8); g.closePath(); g.fill();
  g.fillStyle = '#e08a3a';
  g.fillRect(-2, 6, 4, 2);
}

function drawTower(g) {
  g.fillStyle = '#5c606b';
  g.fillRect(-7, -4, 14, 15);
  g.fillStyle = '#767b87';
  g.fillRect(-7, -4, 4, 15);
  g.fillStyle = '#3f434c';
  g.fillRect(-9, -10, 18, 6);
  g.fillStyle = '#2a2d34';
  g.fillRect(-4, -8, 8, 3);
  g.fillStyle = '#c9a94f';
  g.fillRect(-1, -10, 2, 4);
}

function drawTemple(g) {
  g.fillStyle = '#4b4a5e';
  g.beginPath(); g.moveTo(-7, 11); g.lineTo(-5, -11); g.lineTo(5, -11); g.lineTo(7, 11); g.closePath(); g.fill();
  g.fillStyle = '#6a6884';
  g.beginPath(); g.moveTo(-5, -11); g.lineTo(0, -16); g.lineTo(5, -11); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(170, 180, 255, 0.65)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, -6); g.lineTo(-3, 1); g.lineTo(2, 4); g.lineTo(-1, 9); g.stroke();
  g.fillStyle = 'rgba(170, 180, 255, 0.8)';
  g.fillRect(-1, -12, 2, 2);
}

function drawBattlefield(g) {
  g.strokeStyle = '#9a9284';
  g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(-8, 10); g.lineTo(-6, -8); g.stroke();
  g.beginPath(); g.moveTo(7, 10); g.lineTo(5, -5); g.stroke();
  g.fillStyle = '#8a8274';
  g.fillRect(-10, -8, 5, 1.6);
  g.fillRect(3, -5, 5, 1.6);
  g.fillStyle = 'rgba(120, 40, 40, 0.5)';
  g.fillRect(-3, 8, 8, 2);
}

function drawDesert(g) {
  g.fillStyle = '#a8895a';
  g.beginPath();
  g.moveTo(-15, 9); g.quadraticCurveTo(-6, -2, 4, 5); g.quadraticCurveTo(10, 9, 15, 6);
  g.lineTo(15, 11); g.lineTo(-15, 11); g.closePath(); g.fill();
  g.fillStyle = '#d8c08a';
  g.beginPath();
  g.moveTo(-13, 7); g.quadraticCurveTo(-2, -4, 9, 4); g.quadraticCurveTo(-2, 3, -13, 10);
  g.closePath(); g.fill();
  g.fillStyle = '#f2dda6';
  g.beginPath(); g.arc(9, -9, 3, 0, Math.PI * 2); g.fill();
}

function drawOasis(g) {
  g.fillStyle = '#2f5666';
  g.beginPath(); g.ellipse(0, 7, 13, 5, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(160, 210, 220, 0.5)';
  g.lineWidth = 1;
  g.beginPath(); g.ellipse(-2, 6, 8, 3, 0, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#6b5a3a';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-6, 4); g.lineTo(-3, -10); g.stroke();
  g.strokeStyle = '#4f7a52';
  g.lineWidth = 1.6;
  for (const a of [-0.9, -0.3, 0.3, 0.9]) {
    g.beginPath();
    g.moveTo(-3, -10);
    g.quadraticCurveTo(-3 + Math.sin(a) * 8, -13, -3 + Math.sin(a) * 11, -7);
    g.stroke();
  }
}

function drawOvergrown(g) {
  g.strokeStyle = '#7d8a4e';
  g.lineWidth = 1.2;
  for (let i = -9; i <= 9; i += 3) {
    g.beginPath();
    g.moveTo(i, 10);
    g.quadraticCurveTo(i + 2, 2, i + (i % 2 ? 4 : -3), -5);
    g.stroke();
  }
  g.fillStyle = '#c9b45a';
  g.fillRect(-6, -3, 2, 2);
  g.fillRect(3, 1, 2, 2);
}

function drawReed(g) {
  g.fillStyle = 'rgba(80, 120, 130, 0.5)';
  g.fillRect(-14, 7, 28, 3);
  g.strokeStyle = '#a8975e';
  g.lineWidth = 1.3;
  for (const x of [-9, -4, 1, 7]) {
    g.beginPath(); g.moveTo(x, 9); g.lineTo(x + 1, -8 + (x % 3)); g.stroke();
    g.fillStyle = '#c9b06a';
    g.beginPath(); g.ellipse(x + 1, -9 + (x % 3), 1.6, 3, 0, 0, Math.PI * 2); g.fill();
  }
}

function drawBurntForest(g) {
  for (const [x, y, s] of [[-7, 2, 0.9], [6, 4, 0.7]]) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.strokeStyle = '#2f2622';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 9); g.lineTo(0, -9); g.stroke();
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, -2); g.lineTo(-6, -8); g.stroke();
    g.beginPath(); g.moveTo(0, -4); g.lineTo(6, -10); g.stroke();
    g.restore();
  }
  g.fillStyle = 'rgba(220, 120, 50, 0.8)';
  g.fillRect(4, 3, 2, 2);
}

function drawBookery(g) {
  const cols = ['#8a5a4a', '#5a6a8a', '#6a7a4a'];
  for (let i = 0; i < 3; i++) {
    g.fillStyle = cols[i];
    g.fillRect(-9 + i, 7 - i * 4, 18, 4);
    g.fillStyle = 'rgba(240, 230, 200, 0.55)';
    g.fillRect(-6 + i, 8 - i * 4, 12, 1);
  }
  g.fillStyle = '#d8c58a';
  g.beginPath(); g.moveTo(8, -8); g.lineTo(12, -14); g.lineTo(13, -7); g.closePath(); g.fill();
}

function drawMaze(g) {
  g.strokeStyle = '#b9b3a3';
  g.lineWidth = 1.3;
  g.beginPath();
  g.arc(0, 0, 12, 0, Math.PI * 1.4);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, 8, Math.PI, Math.PI * 2.3);
  g.stroke();
  g.beginPath();
  g.arc(0, 0, 4, 0, Math.PI * 1.2);
  g.stroke();
  g.fillStyle = '#d8b25a';
  g.fillRect(-1, -1, 2, 2);
}

function drawArsenal(g) {
  g.strokeStyle = '#b9bcc4';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-9, 8); g.lineTo(8, -9); g.stroke();
  g.beginPath(); g.moveTo(9, 8); g.lineTo(-8, -9); g.stroke();
  g.strokeStyle = '#8a6a3a';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(-6, 5); g.lineTo(-9, 8); g.stroke();
  g.beginPath(); g.moveTo(6, 5); g.lineTo(9, 8); g.stroke();
  g.fillStyle = '#6d5a44';
  g.beginPath(); g.arc(0, 2, 4, 0, Math.PI * 2); g.fill();
}

function drawTreasury(g) {
  g.fillStyle = '#7a5a32';
  g.fillRect(-11, -2, 22, 11);
  g.fillStyle = '#9a7442';
  g.beginPath(); g.moveTo(-12, -2); g.quadraticCurveTo(0, -13, 12, -2); g.closePath(); g.fill();
  g.fillStyle = '#d8b25a';
  g.fillRect(-2, 2, 4, 5);
  g.fillStyle = '#f0d98a';
  g.beginPath(); g.arc(-7, -3, 2, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(6, -4, 2, 0, Math.PI * 2); g.fill();
}

function drawBeacon(g) {
  g.fillStyle = 'rgba(160, 190, 230, 0.16)';
  g.beginPath(); g.moveTo(-6, 10); g.lineTo(-14, -16); g.lineTo(14, -16); g.lineTo(6, 10); g.closePath(); g.fill();
  g.fillStyle = '#5c6472';
  g.fillRect(-5, -6, 10, 16);
  g.fillStyle = '#7d8798';
  g.fillRect(-5, -6, 3, 16);
  g.fillStyle = 'rgba(170, 200, 255, 0.9)';
  g.beginPath(); g.arc(0, -8, 3.2, 0, Math.PI * 2); g.fill();
}

function drawCrypt(g) {
  g.fillStyle = '#5a5560';
  g.fillRect(-11, -6, 22, 17);
  g.fillStyle = '#38343d';
  g.beginPath(); g.moveTo(-6, 11); g.lineTo(-6, -2); g.arc(0, -2, 6, Math.PI, 0); g.lineTo(6, 11); g.closePath(); g.fill();
  g.fillStyle = '#c9c4b4';
  g.beginPath(); g.arc(0, 2, 3.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2a262c';
  g.fillRect(-2, 1, 1.4, 1.4);
  g.fillRect(1, 1, 1.4, 1.4);
}

function drawOutpost(g) {
  g.fillStyle = '#6a6252';
  g.fillRect(-7, -2, 14, 13);
  g.fillStyle = '#857a62';
  g.fillRect(-9, -7, 18, 5);
  g.fillStyle = '#c9a94f';
  g.fillRect(-1, -14, 2, 8);
  g.beginPath(); g.moveTo(1, -14); g.lineTo(8, -11.5); g.lineTo(1, -9); g.closePath(); g.fill();
  g.fillStyle = '#2a2622';
  g.fillRect(-3, 2, 6, 4);
}

function drawRuinedVillage(g) {
  g.fillStyle = '#5a4a3a';
  g.fillRect(-10, 0, 8, 11);
  g.fillRect(3, 4, 7, 7);
  g.fillStyle = '#3a2f26';
  g.beginPath(); g.moveTo(-12, 0); g.lineTo(-8, -7); g.lineTo(-3, 1); g.closePath(); g.fill();
  g.fillStyle = '#8a7a5a';
  g.fillRect(-9, -5, 3, 8);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(-6, 2, 4, 5);
}

function drawBridge(g) {
  g.fillStyle = '#3f5f6a';
  g.fillRect(-15, 6, 30, 5);
  g.fillStyle = '#8a6a42';
  for (let i = -14; i <= 12; i += 4) g.fillRect(i, 4, 3, 8);
  g.fillStyle = '#6a5232';
  g.fillRect(-15, 3, 30, 2);
  g.fillStyle = '#5a7a6a';
  g.fillRect(-15, 11, 30, 2);
}

function drawStreetlight(g) {
  g.strokeStyle = '#4a4640';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(2, 11); g.lineTo(2, -10); g.stroke();
  g.beginPath(); g.moveTo(2, -10); g.lineTo(-4, -10); g.stroke();
  g.fillStyle = '#3a362e';
  g.fillRect(-8, -12, 6, 5);
  g.fillStyle = 'rgba(255, 210, 120, 0.85)';
  g.fillRect(-7, -11, 4, 3);
  g.fillStyle = 'rgba(255, 200, 100, 0.12)';
  g.beginPath(); g.arc(-5, -9, 11, 0, Math.PI * 2); g.fill();
}

function drawCrystal(g) {
  g.fillStyle = '#6f9ab8';
  g.beginPath(); g.moveTo(0, -13); g.lineTo(7, -2); g.lineTo(4, 10); g.lineTo(-4, 10); g.lineTo(-7, -2); g.closePath(); g.fill();
  g.fillStyle = '#a8d0e0';
  g.beginPath(); g.moveTo(0, -13); g.lineTo(7, -2); g.lineTo(0, 2); g.closePath(); g.fill();
  g.fillStyle = 'rgba(180, 220, 240, 0.18)';
  g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill();
}

function drawWitchHouse(g) {
  g.fillStyle = '#4a3a3a';
  g.fillRect(-9, -2, 18, 12);
  g.fillStyle = '#2f2430';
  g.beginPath(); g.moveTo(-12, -2); g.lineTo(0, -14); g.lineTo(12, -2); g.closePath(); g.fill();
  g.fillStyle = '#d8b25a';
  g.fillRect(-3, 3, 4, 5);
  g.strokeStyle = 'rgba(200, 200, 220, 0.35)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(8, -12); g.quadraticCurveTo(12, -18, 8, -22); g.stroke();
}

function drawZiggurat(g) {
  g.fillStyle = '#a8905e';
  g.fillRect(-13, 3, 26, 8);
  g.fillStyle = '#b8a06a';
  g.fillRect(-9, -3, 18, 6);
  g.fillStyle = '#c8b078';
  g.fillRect(-5, -9, 10, 6);
  g.fillStyle = '#6a5a38';
  g.fillRect(-2, -9, 4, 5);
  g.fillStyle = '#e0c078';
  g.fillRect(-1, -14, 2, 4);
}

function drawShipwreck(g) {
  g.fillStyle = '#4a3a2a';
  g.beginPath();
  g.moveTo(-13, 4); g.quadraticCurveTo(0, 12, 14, 3);
  g.lineTo(11, -2); g.quadraticCurveTo(0, 4, -10, -2);
  g.closePath(); g.fill();
  g.strokeStyle = '#7a5a3a';
  g.lineWidth = 1.4;
  for (const x of [-8, -2, 4, 9]) {
    g.beginPath(); g.moveTo(x, -1); g.lineTo(x - 1, 8); g.stroke();
  }
  g.strokeStyle = '#8a6a4a';
  g.beginPath(); g.moveTo(2, -2); g.lineTo(6, -14); g.stroke();
  g.fillStyle = 'rgba(150, 170, 170, 0.35)';
  g.fillRect(-15, 10, 30, 2);
}

function drawBloodPath(g) {
  g.fillStyle = '#5a2a2a';
  g.beginPath(); g.ellipse(0, 7, 14, 5, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#8a3a3a';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-12, 8); g.quadraticCurveTo(-3, 2, 5, 7); g.quadraticCurveTo(10, 10, 14, 6); g.stroke();
  g.fillStyle = 'rgba(200, 80, 80, 0.5)';
  g.fillRect(-4, 5, 4, 2);
}

function drawWasteland(g) {
  g.fillStyle = '#6a6450';
  g.beginPath(); g.ellipse(0, 7, 14, 6, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(40, 36, 28, 0.8)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(-10, 4); g.lineTo(-4, 7); g.lineTo(0, 3); g.lineTo(7, 7); g.lineTo(12, 4); g.stroke();
  g.fillStyle = '#8a825e';
  g.fillRect(-6, 8, 3, 2);
}

function drawObelisk(g) {
  g.fillStyle = '#2f2f3a';
  g.beginPath(); g.moveTo(-5, 11); g.lineTo(-3, -12); g.lineTo(0, -16); g.lineTo(3, -12); g.lineTo(5, 11); g.closePath(); g.fill();
  g.fillStyle = '#4a4a5e';
  g.beginPath(); g.moveTo(0, -16); g.lineTo(3, -12); g.lineTo(5, 11); g.lineTo(0, 11); g.closePath(); g.fill();
  g.fillStyle = 'rgba(160, 140, 220, 0.8)';
  g.fillRect(-1, -8, 2, 2);
  g.fillRect(-1, -2, 2, 2);
}

function drawRift(g) {
  g.fillStyle = 'rgba(120, 80, 170, 0.25)';
  g.beginPath(); g.ellipse(0, 2, 11, 14, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#a070d0';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-2, -13); g.lineTo(3, -5); g.lineTo(-2, 1); g.lineTo(4, 8); g.stroke();
  g.strokeStyle = 'rgba(220, 180, 255, 0.8)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, -12); g.lineTo(0, 9); g.stroke();
}

// ---------- 动态层 ----------

function drawActors(ctx, game, t) {
  const run = game.run;
  const h = run.hero;

  const enemies = run.enemies.filter((e) => e.alive).sort((a, b) => a.cell - b.cell);
  const bossFight = !!run.target?.boss;
  for (const e of enemies) {
    const pos = game.enemyPos(e);
    if (run.target && e.cell === run.target.cell) pos.x += bossFight ? 46 : 22;
    drawEnemy(ctx, e, pos, t, game);
  }

  const hp = game.heroPos();
  if (run.target) hp.x -= bossFight ? 34 : 20;
  if (run.hero.classId === 'necromancer') {
    run.hero.skeletons.forEach((sk, i) => {
      if (sk.hp <= 0) return;
      const ox = i === 0 ? -19 : i === 1 ? 19 : 0;
      const oy = i > 1 ? 12 : 0;
      drawAllySkeleton(ctx, hp.x + ox, hp.y + oy + Math.sin(t * 6 + sk.bob) * 1.4, sk);
    });
  }
  drawHero(ctx, hp, h, t, game);
}

function drawAllySkeleton(ctx, x, y, sk) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(x, y + 9, 7, 3, 0, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  // 腿
  ctx.strokeStyle = '#c9c4b4';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-2, 2); ctx.lineTo(-3, 9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2, 2); ctx.lineTo(3, 9); ctx.stroke();
  // 肋骨
  ctx.fillStyle = '#d6d0c0';
  ctx.fillRect(-4, -6, 8, 9);
  ctx.fillStyle = '#8f8a7a';
  for (let i = 0; i < 3; i++) ctx.fillRect(-3, -4 + i * 2.4, 6, 1);
  // 头骨
  ctx.fillStyle = '#e0dacb';
  ctx.beginPath(); ctx.arc(0, -10, 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a1a20';
  ctx.fillRect(-2, -11, 1.5, 1.5);
  ctx.fillRect(1, -11, 1.5, 1.5);
  // 小刀
  ctx.strokeStyle = '#b9bcc4';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(4, -4); ctx.lineTo(9, 2); ctx.stroke();
  ctx.restore();

  drawBar(ctx, x - 8, y - 20, 16, 2.5, sk.hp / sk.maxHp, '#cfd6c9');
}

function drawHero(ctx, pos, h, t, game) {
  const path = game.run.map.path;
  const a = path[h.cell % path.length];
  const b = path[(h.cell + 1) % path.length];
  const dir = b.x < a.x ? -1 : 1;
  const bob = Math.sin(t * 8 + h.pos) * 1.1;
  const x = pos.x;
  const y = pos.y + bob;

  // 阴影
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(x, pos.y + 10, 12, 4.5, 0, 0, Math.PI * 2); ctx.fill();

  // 脚下微光，避免角色在暗色路面上糊成一团
  const glow = ctx.createRadialGradient(x, pos.y + 2, 2, x, pos.y + 2, 24);
  glow.addColorStop(0, 'rgba(240, 214, 158, 0.14)');
  glow.addColorStop(1, 'rgba(240, 214, 158, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 24, pos.y - 22, 48, 48);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * 1.45, 1.45);
  ctx.shadowColor = 'rgba(240, 220, 170, 0.32)';
  ctx.shadowBlur = 5;

  if (h.hurtFlash > 0) {
    ctx.fillStyle = `rgba(255, 80, 60, ${0.35 * h.hurtFlash})`;
    ctx.beginPath(); ctx.arc(0, -6, 15, 0, Math.PI * 2); ctx.fill();
  }

  if (h.classId === 'rogue') {
    // 斗篷
    ctx.fillStyle = '#24382c';
    ctx.beginPath();
    ctx.moveTo(-6, -9);
    ctx.quadraticCurveTo(-11, 1, -7, 8);
    ctx.lineTo(4, 8);
    ctx.lineTo(2, -9);
    ctx.closePath(); ctx.fill();
    // 腿
    ctx.fillStyle = '#3a2d25';
    ctx.fillRect(-4, 3, 3, 5);
    ctx.fillRect(1, 3, 3, 5);
    // 身体
    ctx.fillStyle = '#6b5138';
    ctx.fillRect(-3.5, -8, 7, 11);
    ctx.fillStyle = '#8a6a46';
    ctx.fillRect(-3.5, -8, 2.5, 11);
    ctx.fillStyle = '#2a211b';
    ctx.fillRect(-3.5, 0, 7, 1.6);
    // 兜帽
    ctx.fillStyle = '#2e4a36';
    ctx.beginPath(); ctx.arc(0, -11, 4.4, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
    ctx.fillRect(-4.4, -11, 8.8, 4);
    ctx.fillStyle = '#151b16';
    ctx.fillRect(-2.8, -10, 5.6, 4);
    ctx.fillStyle = '#d8c58a';
    ctx.fillRect(-1.6, -9, 1.1, 1.1);
    ctx.fillRect(0.6, -9, 1.1, 1.1);
    // 双匕首
    ctx.strokeStyle = '#cdd2d8';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(9, 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(-9, 4); ctx.stroke();
    ctx.strokeStyle = '#7a5c3a';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(2.5, -4.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(-2.5, -2.5); ctx.stroke();
  } else if (h.classId === 'necromancer') {
    // 长袍
    ctx.fillStyle = '#322a40';
    ctx.beginPath();
    ctx.moveTo(-5, -9);
    ctx.lineTo(-8, 9);
    ctx.lineTo(8, 9);
    ctx.lineTo(5, -9);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#241d30';
    ctx.beginPath();
    ctx.moveTo(-5, -9);
    ctx.lineTo(-8, 9);
    ctx.lineTo(-2, 9);
    ctx.lineTo(-1, -9);
    ctx.closePath(); ctx.fill();
    // 腰带
    ctx.fillStyle = '#8a7440';
    ctx.fillRect(-5, 0, 10, 1.4);
    // 兜帽
    ctx.fillStyle = '#3e3352';
    ctx.beginPath(); ctx.arc(0, -11, 4.6, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
    ctx.fillRect(-4.6, -11, 9.2, 4.4);
    ctx.fillStyle = '#cfc6b4';
    ctx.fillRect(-2.6, -9.6, 5.2, 3.2);
    ctx.fillStyle = '#8ce0b0';
    ctx.fillRect(-1.8, -8.6, 1.2, 1.1);
    ctx.fillRect(0.6, -8.6, 1.2, 1.1);
    // 法杖
    ctx.strokeStyle = '#6b5436';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(7, -12); ctx.lineTo(9, 9); ctx.stroke();
    ctx.fillStyle = 'rgba(120, 230, 170, 0.85)';
    ctx.beginPath(); ctx.arc(7, -14, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120, 230, 170, 0.25)';
    ctx.beginPath(); ctx.arc(7, -14, 4.4, 0, Math.PI * 2); ctx.fill();
  } else {
    // 披风
    ctx.fillStyle = P.cape;
    ctx.beginPath();
    ctx.moveTo(-6, -10);
    ctx.quadraticCurveTo(-12, 2, -6, 8);
    ctx.lineTo(3, 8);
    ctx.lineTo(2, -10);
    ctx.closePath(); ctx.fill();

    // 身体
    ctx.fillStyle = '#8f938f';
    ctx.fillRect(-4, -9, 8, 12);
    ctx.fillStyle = '#b9b9b2';
    ctx.fillRect(-4, -9, 3, 12);
    // 腿
    ctx.fillStyle = '#4a4a48';
    ctx.fillRect(-4, 3, 3, 5);
    ctx.fillRect(1, 3, 3, 5);

    // 头盔
    ctx.fillStyle = '#c8c9c4';
    ctx.beginPath(); ctx.arc(0, -12, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, -13, 4, 1.6);
    ctx.fillStyle = P.cape;
    ctx.fillRect(-1, -17, 2, 3);

    // 剑
    ctx.strokeStyle = '#d8dbe2';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(4, -8); ctx.lineTo(11, 2); ctx.stroke();
    ctx.strokeStyle = '#7a5c3a';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(4, -8); ctx.lineTo(2, -10); ctx.stroke();

    // 盾
    ctx.fillStyle = '#6d5a44';
    ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(-4, -8); ctx.lineTo(-4, -1); ctx.lineTo(-8, 1); ctx.closePath(); ctx.fill();
  }

  ctx.restore();

  // 血条
  drawBar(ctx, x - 12, y - 30, 24, 3.5, h.hp / h.maxHp, P.hp);
}

function drawEnemy(ctx, e, pos, t, game) {
  const bob = Math.sin(t * 5 + e.bob) * 1.5;
  const x = pos.x;
  const y = pos.y + bob;
  const boss = e.boss;

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(x, pos.y + 9, e.r + 2, 4, 0, 0, Math.PI * 2); ctx.fill();

  ctx.save();
  ctx.translate(x, y);

  if (boss) {
    const aura = ctx.createRadialGradient(0, 0, 4, 0, 0, 40);
    aura.addColorStop(0, 'rgba(150, 120, 200, 0.25)');
    aura.addColorStop(1, 'rgba(150, 120, 200, 0)');
    ctx.fillStyle = aura;
    ctx.fillRect(-40, -40, 80, 80);
  }

  switch (e.shape) {
    case 'blob': drawBlob(ctx, e); break;
    case 'spider': drawSpider(ctx, e); break;
    case 'skull': drawSkull(ctx, e); break;
    case 'beast': drawBeast(ctx, e); break;
    case 'human': drawHumanoid(ctx, e); break;
    case 'ghost': drawGhost(ctx, e, t); break;
    case 'chest': drawMimic(ctx, e); break;
    case 'swarm': drawSwarm(ctx, e, t); break;
    case 'lich': drawLich(ctx, e, t); break;
    case 'book': drawBookEnemy(ctx, e, t); break;
    case 'priestess': drawPriestess(ctx, e, t); break;
    case 'hunter': drawHunter(ctx, e, t); break;
    case 'omega': drawOmega(ctx, e, t); break;
    default: drawBlob(ctx, e);
  }

  if (e.elite) {
    ctx.strokeStyle = 'rgba(216, 178, 90, 0.8)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, e.r + 5, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();

  drawBar(ctx, x - (boss ? 28 : 13), y - e.r - (boss ? 18 : 12), boss ? 56 : 26, boss ? 5 : 3, e.hp / e.maxHp, boss ? '#b07ad6' : P.hp);
  if (boss) {
    ctx.fillStyle = '#d8c9f0';
    ctx.font = 'bold 10px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('巫妖', x, y - e.r - 24);
  }
}

function drawBlob(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(0, 2, e.r, e.r * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.ellipse(-4, -4, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.fillRect(-4, 0, 2, 2);
  ctx.fillRect(2, 0, 2, 2);
}

function drawSpider(ctx, e) {
  ctx.strokeStyle = '#2a2430';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const a = 0.5 + i * 0.35;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * e.r * 1.5, Math.sin(a) * e.r * 0.9 + 3);
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(-Math.cos(a) * e.r * 1.5, Math.sin(a) * e.r * 0.9 + 3);
    ctx.stroke();
  }
  ctx.fillStyle = e.color;
  ctx.beginPath(); ctx.ellipse(0, 2, e.r * 0.8, e.r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e0d6c4';
  ctx.fillRect(-3, 0, 1.6, 1.6);
  ctx.fillRect(1.5, 0, 1.6, 1.6);
}

function drawSkull(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(0, -2, e.r * 0.8, Math.PI, 0);
  ctx.lineTo(e.r * 0.7, 6);
  ctx.lineTo(-e.r * 0.7, 6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath(); ctx.arc(-3.5, -2, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(3.5, -2, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(-2, 3, 4, 1.2);
  ctx.fillStyle = '#8a8478';
  ctx.fillRect(-5, 6, 10, 2);
}

function drawBeast(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.ellipse(0, 2, e.r, e.r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(e.r * 0.4, -2);
  ctx.lineTo(e.r * 1.2, -8);
  ctx.lineTo(e.r * 0.9, 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a2a28';
  ctx.fillRect(-e.r * 0.6, 6, 2.5, 5);
  ctx.fillRect(e.r * 0.4, 6, 2.5, 5);
  ctx.fillStyle = '#d8b25a';
  ctx.fillRect(e.r * 0.8, -4, 1.6, 1.6);
}

function drawHumanoid(ctx, e) {
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.moveTo(-7, 9); ctx.lineTo(-5, -6); ctx.lineTo(5, -6); ctx.lineTo(7, 9);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d8c3a5';
  ctx.beginPath(); ctx.arc(0, -9, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2320';
  ctx.fillRect(-4, -13, 8, 3);
  ctx.strokeStyle = '#b9b9b2';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(6, -4); ctx.lineTo(11, 4); ctx.stroke();
}

function drawGhost(ctx, e, t) {
  ctx.globalAlpha = 0.75 + Math.sin(t * 3 + e.bob) * 0.15;
  ctx.fillStyle = e.color;
  ctx.beginPath();
  ctx.arc(0, -3, e.r * 0.8, Math.PI, 0);
  ctx.lineTo(e.r * 0.8, 7);
  for (let i = 0; i < 3; i++) {
    ctx.quadraticCurveTo(e.r * (0.4 - i * 0.5), 10 + (i % 2) * 2, e.r * (0.2 - i * 0.5), 7);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(-4, -4, 2.5, 2.5);
  ctx.fillRect(2, -4, 2.5, 2.5);
  ctx.globalAlpha = 1;
}

function drawMimic(ctx, e) {
  ctx.fillStyle = '#8a6a3a';
  ctx.fillRect(-10, -4, 20, 13);
  ctx.fillStyle = '#5a4324';
  ctx.fillRect(-10, -8, 20, 5);
  ctx.fillStyle = '#e0d6c4';
  for (let i = -8; i < 9; i += 4) {
    ctx.beginPath();
    ctx.moveTo(i, -3); ctx.lineTo(i + 2, 1); ctx.lineTo(i + 4, -3);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#d8b25a';
  ctx.fillRect(-2, 3, 4, 4);
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(-1, 4, 1.5, 1.5);
}

function drawSwarm(ctx, e, t) {
  for (let i = 0; i < 5; i++) {
    const a = t * 2 + i * 1.3;
    const x = Math.cos(a) * 9;
    const y = Math.sin(a * 1.4) * 6;
    ctx.fillStyle = e.color;
    ctx.fillRect(x, y, 2.4, 2.4);
  }
}

function drawLich(ctx, e, t) {
  const pulse = 0.5 + Math.sin(t * 2) * 0.15;
  ctx.fillStyle = 'rgba(80, 60, 120, 0.25)';
  ctx.beginPath(); ctx.arc(0, 0, 26 * pulse + 14, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = '#2a2438';
  ctx.beginPath();
  ctx.moveTo(-12, 12); ctx.lineTo(-8, -10); ctx.lineTo(8, -10); ctx.lineTo(12, 12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#3f3556';
  ctx.fillRect(-8, -10, 5, 22);

  // 头骨
  ctx.fillStyle = '#d8d0c0';
  ctx.beginPath(); ctx.arc(0, -15, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6a4a8a';
  ctx.fillRect(-4, -17, 2.5, 3);
  ctx.fillRect(2, -17, 2.5, 3);

  // 王冠
  ctx.fillStyle = '#d8b25a';
  ctx.beginPath();
  ctx.moveTo(-7, -20); ctx.lineTo(-7, -25); ctx.lineTo(-3, -22); ctx.lineTo(0, -27);
  ctx.lineTo(3, -22); ctx.lineTo(7, -25); ctx.lineTo(7, -20);
  ctx.closePath(); ctx.fill();

  // 法杖
  ctx.strokeStyle = '#6a5a7a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(11, 10); ctx.lineTo(11, -24); ctx.stroke();
  ctx.fillStyle = `rgba(170, 140, 240, ${0.6 + pulse * 0.3})`;
  ctx.beginPath(); ctx.arc(11, -26, 3.5, 0, Math.PI * 2); ctx.fill();
}

function drawBookEnemy(ctx, e, t) {
  const flap = Math.sin(t * 4) * 2;
  ctx.fillStyle = '#e0d6b8';
  ctx.beginPath();
  ctx.moveTo(0, -2); ctx.lineTo(-11, -8 - flap); ctx.lineTo(-9, 6); ctx.lineTo(0, 9);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, -2); ctx.lineTo(11, -8 - flap); ctx.lineTo(9, 6); ctx.lineTo(0, 9);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8a5a3a';
  ctx.fillRect(-1.5, -3, 3, 12);
  ctx.fillStyle = '#7a2f2f';
  ctx.beginPath(); ctx.arc(0, 2, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0e0a0';
  ctx.fillRect(-1, 1, 2, 2);
}

function drawPriestess(ctx, e, t) {
  ctx.fillStyle = 'rgba(255, 220, 200, 0.16)';
  ctx.beginPath(); ctx.arc(0, -4, 22, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255, 230, 170, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, -14, 7 + Math.sin(t * 2) * 0.5, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = '#e8d8d0';
  ctx.beginPath();
  ctx.moveTo(-10, 12); ctx.quadraticCurveTo(-8, -6, 0, -8); ctx.quadraticCurveTo(8, -6, 10, 12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c07a8a';
  ctx.fillRect(-10, 5, 20, 3);
  ctx.fillStyle = '#e0c8b8';
  ctx.beginPath(); ctx.arc(0, -12, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a2a2a';
  ctx.fillRect(-2, -13, 1.6, 2);
  ctx.fillRect(1, -13, 1.6, 2);
  ctx.strokeStyle = '#d8b25a';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(9, 11); ctx.lineTo(9, -16); ctx.stroke();
  ctx.fillStyle = 'rgba(255, 220, 140, 0.9)';
  ctx.beginPath(); ctx.arc(9, -18, 3, 0, Math.PI * 2); ctx.fill();
}

function drawHunter(ctx, e, t) {
  ctx.fillStyle = '#3f4632';
  ctx.beginPath();
  ctx.moveTo(-9, 11); ctx.quadraticCurveTo(-7, -4, 0, -8); ctx.quadraticCurveTo(7, -4, 9, 11);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a2f22';
  ctx.beginPath(); ctx.arc(0, -10, 5, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#d8c3a5';
  ctx.fillRect(-3, -10, 6, 3);
  ctx.fillStyle = '#e0b050';
  ctx.fillRect(-2, -9, 1.4, 1.4);
  ctx.fillRect(1, -9, 1.4, 1.4);

  // 弓
  ctx.strokeStyle = '#b08a4a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(8, -14);
  ctx.quadraticCurveTo(16, 0, 8, 14);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(230, 220, 180, 0.8)';
  ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(8, 14); ctx.stroke();
  const pull = Math.sin(t * 3) * 2;
  ctx.strokeStyle = '#e8d9a8';
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(1 + pull, 0); ctx.stroke();
}

function drawOmega(ctx, e, t) {
  const pulse = 0.7 + Math.sin(t * 2.4) * 0.15;
  const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 32);
  halo.addColorStop(0, `rgba(240, 180, 90, ${0.3 * pulse})`);
  halo.addColorStop(1, 'rgba(240, 120, 50, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(-34, -34, 68, 68);

  ctx.fillStyle = '#2a2030';
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c98b5a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = `rgba(255, 200, 120, ${0.85 * pulse})`;
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();

  // 角
  ctx.strokeStyle = '#d8b25a';
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(-10, -10); ctx.quadraticCurveTo(-20, -24, -12, -26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, -10); ctx.quadraticCurveTo(20, -24, 12, -26); ctx.stroke();
  // 环
  ctx.strokeStyle = 'rgba(216, 178, 90, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(0, 0, 26, 8, 0.5, 0, Math.PI * 2); ctx.stroke();
}

function drawBar(ctx, x, y, w, h, pct, color) {
  pct = Math.max(0, Math.min(1, pct));
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = P.hpBack;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * pct, h);
}

// ---------- 放置提示 / 特效 ----------

function drawPlacementHints(ctx, game, t) {
  const run = game.run;
  if (game.selectedCard == null) return;
  const cardId = run.hand[game.selectedCard];
  if (!cardId) return;
  const def = CARDS[cardId];
  const pulse = 0.5 + Math.sin(t * 5) * 0.5;

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = run.map.grid[y][x];
      if (!canPlace(run.map, c, cardId)) continue;
      ctx.fillStyle = `rgba(127, 214, 160, ${0.025 + pulse * 0.02})`;
      ctx.fillRect(x * CELL + 2, y * CELL + OFFSET_Y + 2, CELL - 4, CELL - 4);
      ctx.fillStyle = `rgba(127, 214, 160, ${0.10 + pulse * 0.10})`;
      ctx.fillRect(x * CELL + CELL / 2 - 1, y * CELL + OFFSET_Y + CELL / 2 - 1, 2, 2);
    }
  }

  const hc = game.hoverCell;
  if (!hc) return;
  const c = run.map.grid[hc.y] && run.map.grid[hc.y][hc.x];
  if (!c) return;
  const ok = canPlace(run.map, c, cardId);
  ctx.strokeStyle = ok ? '#8fd6a0' : '#c0483f';
  ctx.lineWidth = 2;
  ctx.strokeRect(hc.x * CELL + 1, hc.y * CELL + OFFSET_Y + 1, CELL - 2, CELL - 2);
  ctx.fillStyle = hexA(ok ? '#8fd6a0' : '#c0483f', 0.12);
  ctx.fillRect(hc.x * CELL + 3, hc.y * CELL + OFFSET_Y + 3, CELL - 6, CELL - 6);

  if (ok) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.translate(hc.x * CELL + CELL / 2, hc.y * CELL + OFFSET_Y + CELL / 2);
    ctx.fillStyle = def.color;
    ctx.font = 'bold 18px "Microsoft YaHei", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.glyph, 0, 0);
    ctx.restore();
  }
}

function drawEffects(ctx, game) {
  const run = game.run;
  for (const p of run.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    if (p.type === 'beam') {
      ctx.strokeStyle = hexA(p.color, a);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x2, p.y2); ctx.stroke();
      ctx.fillStyle = hexA(p.color, a * 0.6);
      ctx.beginPath(); ctx.arc(p.x2, p.y2, 5 * a + 1, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = hexA(p.color, a);
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
  }

  ctx.textAlign = 'center';
  for (const f of run.floats) {
    const a = Math.min(1, f.life / 0.45);
    ctx.font = `bold ${f.size}px "Microsoft YaHei", sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(0,0,0,${0.8 * a})`;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = hexA(f.color, a);
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.textAlign = 'left';
}

function drawFog(ctx, game) {
  const run = game.run;
  if (!run.bossSpawned || run.bossDefeated) return;
  const boss = run.enemies.find((e) => e.boss && e.alive);
  if (!boss) return;
  const pos = game.enemyPos(boss);
  const grad = ctx.createRadialGradient(pos.x, pos.y, 10, pos.x, pos.y, 170);
  grad.addColorStop(0, 'rgba(90, 60, 130, 0.18)');
  grad.addColorStop(1, 'rgba(90, 60, 130, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(pos.x - 170, pos.y - 170, 340, 340);
}

function drawBossArrow(ctx, game, t) {
  const run = game.run;
  if (!run || !run.bossSpawned || run.bossDefeated) return;
  const boss = run.enemies.find((e) => e.boss && e.alive);
  if (!boss) return;
  const pos = game.enemyPos(boss);
  const y = Math.max(24, pos.y - 70);
  ctx.fillStyle = `rgba(200, 170, 240, ${0.5 + Math.sin(t * 4) * 0.2})`;
  ctx.beginPath();
  ctx.moveTo(pos.x, y + 10);
  ctx.lineTo(pos.x - 7, y);
  ctx.lineTo(pos.x + 7, y);
  ctx.closePath();
  ctx.fill();
}

function hexA(hex, a) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
