// 运行中的 HUD：血条、属性、手牌、资源、提示
import { CARDS } from '../data/cards.js';
import { CLASSES } from '../data/classes.js';
import { RES_NAMES } from '../data/buildings.js';
import { STAT_LABELS, STAT_PERCENT } from '../core/config.js';

let G = null;
const el = {};
let handSig = '';
let toastTimer = 0;

export function initHUD(game) {
  G = game;
  const ids = [
    'hud', 'loopNum', 'dayNum', 'bossMeter', 'bossFill', 'bossPct', 'bossLabel', 'bossChase',
    'btnSpeed', 'btnPause', 'btnRetreat', 'btnPotion', 'potionNum',
    'heroLevel', 'classGlyph', 'heroName',
    'hpFill', 'hpText', 'xpFill', 'xpText',
    'stAtk', 'stDef', 'stSpd', 'stCrit', 'stVamp', 'stRegen',
    'equipRow', 'runRes', 'questBox', 'handCards', 'deckInfo', 'toast', 'combatTip', 'placeHint',
  ];
  ids.forEach((id) => { el[id] = document.getElementById(id); });

  el.btnSpeed.addEventListener('click', () => game.cycleSpeed());
  el.btnPause.addEventListener('click', () => game.togglePause());
  el.btnRetreat.addEventListener('click', () => game.retreat());
  el.btnPotion.addEventListener('click', () => game.drinkPotion());

  el.handCards.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    game.selectCard(Number(card.dataset.index));
  });

  el.handCards.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    e.preventDefault();
    game.discardCard(Number(card.dataset.index));
  });
}

export function showHUD(show) {
  el.hud.classList.toggle('hidden', !show);
}

export function renderHUD(game) {
  const run = game.run;
  if (!run) return;
  const h = run.hero;

  el.loopNum.textContent = run.loop;
  el.dayNum.textContent = run.day;

  const pct = Math.min(100, Math.round(run.bossMeter));
  el.bossFill.style.width = `${pct}%`;
  el.bossPct.textContent = `${pct}%`;
  el.bossLabel.textContent = `${run.bossName || '巫妖'}的注视`;
  el.bossMeter.classList.toggle('full', pct >= 100);
  el.bossMeter.classList.toggle('boss-live', !!run.bossSpawned);

  const chasing = (run.enemies || []).find((e) => e.alive && e.boss && e.march?.active);
  if (chasing) {
    el.bossChase.classList.remove('hidden');
    el.bossChase.textContent = `${chasing.name}正在追逐 · 距离 ${Math.max(0, Math.ceil(chasing.march.gap || 0))} 格`;
  } else {
    el.bossChase.classList.add('hidden');
  }

  const hpPct = Math.max(0, Math.min(100, (h.hp / h.maxHp) * 100));
  el.hpFill.style.width = `${hpPct}%`;
  el.hpFill.classList.toggle('low', hpPct < 30);
  el.hpText.textContent = `${Math.ceil(h.hp)} / ${Math.round(h.maxHp)}`;

  const xpPct = Math.min(100, (h.xp / h.xpNext) * 100);
  el.xpFill.style.width = `${xpPct}%`;
  el.xpText.textContent = `${Math.floor(h.xp)} / ${h.xpNext}`;
  el.heroLevel.textContent = `Lv.${h.level}`;

  const cls = CLASSES[h.classId] || CLASSES.warrior;
  el.classGlyph.textContent = cls.glyph;
  el.heroName.textContent = cls.name;

  el.stAtk.textContent = fmt(h.atk);
  el.stDef.textContent = fmt(h.def);
  el.stSpd.textContent = h.atkSpeed.toFixed(2);
  el.stCrit.textContent = `${Math.round(h.crit * 100)}%`;
  el.stVamp.textContent = `${Math.round(h.vamp * 100)}%`;
  el.stRegen.textContent = fmt(h.regen);

  el.potionNum.textContent = h.potions;
  el.btnPotion.disabled = h.potions <= 0;
  el.btnPotion.title = `药水 ${h.potions}/${h.maxPotions}`;
  el.btnPotion.dataset.tip = `<b>药水</b><p>回复 ${Math.round(h.potionPower * 100)}% 生命 · 剩余 ${h.potions}/${h.maxPotions} 瓶</p>`;

  el.btnSpeed.textContent = `×${game.speed}`;
  el.btnPause.textContent = game.paused ? '继续' : '暂停';

  renderEquip(run);
  renderResources(run);
  renderQuest(run);
  renderHand(game);
  renderPlacement(game);

  el.deckInfo.textContent = `牌库 ${run.deck.length} · 弃牌 ${run.discard.length} · 击杀 ${run.kills}`;

  if (run.target) {
    const t = run.target;
    const group = (run.group || []).filter((e) => e.alive).length;
    el.combatTip.classList.remove('hidden');
    el.combatTip.innerHTML = `<span class="sword">⚔</span> ${t.name}${group > 1 ? ` <span class="count">×${group}</span>` : ''} <span class="ehp">${Math.max(0, Math.ceil(t.hp))} / ${t.maxHp}</span>`;
  } else {
    el.combatTip.classList.add('hidden');
  }
}

function renderEquip(run) {
  const h = run.hero;
  el.equipRow.innerHTML = h.slots.map((slot) => {
    const it = h.equipment[slot.id];
    const cls = it ? `filled rarity-${it.rarity}` : 'empty';
    const tip = it
      ? `<b>${escapeHtml(it.name)}</b><span class="tt-kind">${it.slotName}</span><p>${escapeHtml(statLine(it.stats))}</p>`
      : `<b>空装备栏</b><span class="tt-kind">${slot.label}</span><p>击败敌人或完成任务可获得装备</p>`;
    return `<div class="equip ${cls}" data-tip="${tip.replace(/"/g, '&quot;')}"><span>${it ? slot.label : '·'}</span></div>`;
  }).join('');
}

function statLine(stats) {
  return Object.entries(stats).map(([k, v]) => {
    const val = STAT_PERCENT.has(k) ? `${Math.round(v * 1000) / 10}%` : k === 'atkSpeed' ? `+${Math.round(v * 100)}%` : `+${fmt(v)}`;
    return `${STAT_LABELS[k] || k} ${val}`;
  }).join('  ');
}

function renderResources(run) {
  const res = run.resources;
  const short = { wood: '木', stone: '石', soul: '魂', metal: '金', shard: '片', tome: '籍' };
  el.runRes.innerHTML = Object.entries(RES_NAMES)
    .map(([k, name]) => `<span class="res ${k}" title="${name}">${short[k] || name} <b>${res[k] || 0}</b></span>`)
    .join('');
}

function renderQuest(run) {
  if (!run.quest) {
    el.questBox.classList.add('hidden');
    return;
  }
  el.questBox.classList.remove('hidden');
  const label = run.quest.tier === 2 ? '伯爵任务' : '村庄任务';
  el.questBox.innerHTML = `<span>${label}</span><b>${run.quest.have} / ${run.quest.need}</b>`;
}

function renderHand(game) {
  const run = game.run;
  const sig = `${run.hand.join('|')}#${game.selectedCard}#${run.hand.length}`;
  if (sig === handSig) return;
  handSig = sig;

  el.handCards.innerHTML = run.hand.map((id, i) => {
    const c = CARDS[id];
    const sel = game.selectedCard === i ? ' selected' : '';
    const kind = c.kind === 'roadside' ? '路边' : c.kind === 'special' ? '特殊' : '野地';
    const tip = `<b>${c.name}</b><span class="tt-kind">${kind}</span><p>${escapeHtml(c.desc)}</p>`;
    return `<button class="card${sel}" data-index="${i}" data-tip="${tip.replace(/"/g, '&quot;')}" style="--accent:${c.color}">
      <span class="key">${i + 1}</span>
      <span class="glyph">${c.glyph}</span>
      <span class="name">${c.name}</span>
      <span class="desc">${c.desc}</span>
      <span class="kind">${kind}</span>
    </button>`;
  }).join('');

  if (!run.hand.length) {
    el.handCards.innerHTML = '<div class="hand-empty">手牌已空 · 每圈开始或击杀敌人可获得新牌</div>';
  }
}

function renderPlacement(game) {
  const info = game.mode === 'run' ? game.placementSummary() : null;
  if (!info) {
    el.placeHint.classList.add('hidden');
    return;
  }
  el.placeHint.classList.remove('hidden');
  el.placeHint.classList.toggle('bad', info.valid === 0);
  el.placeHint.innerHTML = `<b>${info.name}</b><span>${info.valid > 0 ? `${info.valid} 个可放置位置` : '没有可放置位置'}</span><em>${info.hint}</em>`;
}

export function toast(msg, tone = '') {
  el.toast.textContent = msg;
  el.toast.className = `toast show ${tone}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.toast.className = 'toast';
  }, 2600);
}

function fmt(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

export function resetHandCache() { handSig = ''; }
