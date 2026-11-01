// 营地、升级抉择、结算等全屏界面
import { BUILDINGS, RES_NAMES, BUILDING_BY_ID } from '../data/buildings.js';
import { cardPool, CARDS, deckFromMeta, autoDeck } from '../data/cards.js';
import { canAfford, buildingCost, missingRequires, requirementText } from '../systems/camp.js';
import { TRAITS } from '../data/traits.js';
import { CLASSES, CLASS_ORDER, classUnlocked } from '../data/classes.js';
import { chapterList, chapterUnlocked, chapterById } from '../data/chapters.js';
import { ENEMIES } from '../data/enemies.js';
import { describeAbilities } from '../data/abilities.js';
import { CROSS_COMBOS } from '../world/loopMap.js';
import { seenCard, seenCombo, seenEnemy } from '../systems/codex.js';
import { toast } from './hud.js';
import { STAT_LABELS, STAT_PERCENT } from '../core/config.js';

let G = null;

function notify(message, tone = '') {
  toast(message, tone);
}

const campEl = () => document.getElementById('campScreen');
const overlayEl = () => document.getElementById('overlay');

export function initScreens(game) {
  G = game;
}

export function showCamp(game) {
  G = game;
  const meta = game.meta;
  const pool = cardPool(meta);
  const camp = campEl();
  camp.classList.remove('hidden');

  const buildingCards = {};
  for (const b of BUILDINGS) {
    const lv = meta.buildings[b.id] || 0;
    const maxed = lv >= b.maxLevel;
    const missing = maxed ? [] : missingRequires(meta, b.id, lv + 1);
    const locked = missing.length > 0;
    const cost = buildingCost(meta, b.id);
    const afford = !locked && cost && canAfford(meta, cost);
    const costText = maxed ? '<span class="max">已满级</span>' : locked
      ? `<span class="req">需要：${requirementText(missing)}</span>`
      : Object.entries(cost)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `<span class="${k}">${RES_NAMES[k]} ${v}</span>`).join(' · ');
    const costPlain = maxed ? '已满级' : locked
      ? `需要：${requirementText(missing)}`
      : Object.entries(cost)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${RES_NAMES[k]} ${v}`).join(' · ');
    const tip = `<b>${b.name}</b><span class="tt-kind">${lv} / ${b.maxLevel}</span><p>${b.desc(Math.max(1, lv))}${maxed ? '' : `<br>${locked ? `前置：${requirementText(missing)}` : `费用：${costPlain}`}`}</p>`;

    buildingCards[b.id] = `<div class="bcard ${maxed ? 'maxed' : ''} ${locked ? 'locked' : ''} ${afford ? 'afford' : ''}" data-build="${b.id}" data-tip="${tip.replace(/"/g, '&quot;')}">
      <div class="bglyph">${b.glyph}</div>
      <div class="bmain">
        <div class="bhead"><span class="bname">${b.name}</span><span class="blv">${lv} / ${b.maxLevel}</span></div>
        <div class="bdesc">${b.desc(Math.max(1, lv))}</div>
        <div class="bcost">${costText}${maxed || locked ? '' : '<span class="build-tag">建造</span>'}</div>
      </div>
    </div>`;
  }

  const tierHtml = [1, 2, 3].map((tier) => {
    const list = BUILDINGS.filter((b) => (b.tier || 1) === tier);
    if (!list.length) return '';
    const label = tier === 1 ? '基础' : tier === 2 ? '进阶' : '高阶';
    return `<div class="tier-block"><h3>${label}</h3><div class="bgrid">${list.map((b) => buildingCards[b.id]).join('')}</div></div>`;
  }).join('');

  const nextGoal = BUILDINGS
    .filter((b) => (meta.buildings[b.id] || 0) < b.maxLevel && missingRequires(meta, b.id).length === 0)
    .map((b) => ({ b, cost: buildingCost(meta, b.id) }))
    .filter((x) => x.cost && canAfford(meta, x.cost))
    .sort((a, b) => Object.values(a.cost).reduce((s, v) => s + v, 0) - Object.values(b.cost).reduce((s, v) => s + v, 0))[0];

  const activeClass = classUnlocked(meta, meta.classId) ? meta.classId : 'warrior';
  const classCards = CLASS_ORDER.map((id) => {
    const c = CLASSES[id];
    const unlocked = classUnlocked(meta, id);
    const req = c.unlock ? (BUILDING_BY_ID[c.unlock]?.name || c.unlock) : '';
    const sub = unlocked ? c.tagline : `需建造：${req}`;
    const tip = `<b>${c.name}</b><span class="tt-kind">${unlocked ? c.tagline : '未解锁'}</span><p>${c.desc}</p>`;
    return `<button class="class-card ${activeClass === id ? 'selected' : ''} ${unlocked ? '' : 'locked'}"
      data-class="${id}" data-tip="${tip.replace(/"/g, '&quot;')}">
      <span class="cglyph">${c.glyph}</span>
      <span class="cname">${c.name}</span>
      <span class="cdesc">${sub}</span>
    </button>`;
  }).join('');

  const chapters = chapterList().map((ch) => {
    const unlocked = chapterUnlocked(meta, ch.id);
    const selected = meta.infinite ? ch.id === 'inf' : ch.id === meta.chapter;
    const label = ch.id === 'inf' ? '无尽' : `第 ${ch.id} 章`;
    const sub = unlocked ? `${ch.name} · ${ch.bossName}` : `通关第 ${ch.unlock} 章解锁`;
    const tip = `<b>${label} · ${ch.name}</b><span class="tt-kind">${ch.bossName}</span><p>${ch.desc}</p>`;
    return `<button class="chapter-card ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}"
      data-chapter="${ch.id}" data-tip="${tip.replace(/"/g, '&quot;')}">
      <span class="chnum">${label}</span>
      <span class="chname">${sub}</span>
    </button>`;
  }).join('');

  const deck = deckFromMeta(meta);
  const deckCounts = {};
  deck.forEach((id) => { deckCounts[id] = (deckCounts[id] || 0) + 1; });
  const allMaxed = pool.every((id) => (deckCounts[id] || 0) >= 2);

  camp.innerHTML = `<div class="camp-inner">
    <header class="camp-head">
      <div>
        <h1>循环勇者</h1>
        <p class="sub">LOOP HERO · 网页复刻</p>
      </div>
      <div class="camp-res">
        ${Object.entries(RES_NAMES).map(([k, n]) => `<span class="res ${k}">${n} <b>${meta.resources[k] || 0}</b></span>`).join('')}
      </div>
    </header>

    <div class="camp-body">
      <div class="camp-main">
        <section class="camp-intro">
          <h2>章节</h2>
          <div class="chapter-row">${chapters}</div>
          <h2>职业</h2>
          <div class="class-row">${classCards}</div>
        </section>
        <section class="camp-buildings">
          <h2>营地</h2>
          ${nextGoal ? `<button class="next-goal" data-build="${nextGoal.b.id}">下一目标：${nextGoal.b.name} · ${Object.entries(nextGoal.cost).filter(([, v]) => v > 0).map(([k, v]) => `${RES_NAMES[k]} ${v}`).join(' · ')}</button>` : ''}
          ${tierHtml}
        </section>
      </div>

      <aside class="camp-side">
        <section>
          <h2>牌组 <span class="deck-count">${deck.length} / 30</span></h2>
          <div class="deck-picker">
            ${pool.map((id) => {
              const c = CARDS[id];
              const n = deckCounts[id] || 0;
              const k = c.kind === 'roadside' ? '路边' : c.kind === 'special' ? '特殊' : '野地';
              const tip = `<b>${c.name}</b><span class="tt-kind">${k}</span><p>${c.desc}</p>`;
              return `<button class="pick ${n ? 'on' : ''}" data-pick="${id}" data-tip="${tip.replace(/"/g, '&quot;')}" style="--accent:${c.color}">
                <span class="pglyph">${c.glyph}</span><span class="pname">${c.name}</span>${n ? `<b>×${n}</b>` : ''}
              </button>`;
            }).join('')}
          </div>
          <div class="deck-actions">
            <button class="link" id="deckAuto">自动组牌</button>
            <span class="muted">左键加 / 满编时减 · 右键减一张</span>
          </div>
          <p class="muted">${allMaxed ? '当前已解锁卡牌已全部满编，建造更多营地建筑解锁新地形后再调整。<br>' : ''}${meta.deck.length >= 10
            ? '自定义牌组生效中。'
            : `未满 10 张时使用自动牌组（${autoDeck(meta).length} 张）。`}击杀敌人和每圈开始抽牌。</p>
        </section>

        <section>
          <h2>记录</h2>
          <div class="records">
            <div><span>最远圈数</span><b>${meta.bestLoop || 0}</b></div>
            <div><span>远征次数</span><b>${meta.runs || 0}</b></div>
            <div><span>击败首领</span><b>${meta.victories || 0}</b></div>
            <div><span>无尽层数</span><b>${meta.bestLayer || 0}</b></div>
          </div>
          <button class="link" id="btnCodex" style="margin-top:.6em">打开图鉴 →</button>
        </section>

        <section class="howto">
          <h2>怎么玩</h2>
          <ul>
            <li>英雄会自动沿着环线行走、自动战斗。</li>
            <li>把卡牌铺在道路旁或野地上，地形会持续强化你，也会招来敌人。</li>
            <li>巫妖的注视满格后，首领出现在环线上。</li>
            <li>死亡或撤退都会带回资源；资源用来建造营地、解锁新地形。</li>
          </ul>
          <button class="link" id="btnReset">清除存档</button>
        </section>
      </aside>
    </div>

    <footer class="camp-foot">
      <button class="start" id="btnStartRun">开始远征 <span>→</span></button>
      <span class="muted">空格暂停 · 1–7 选牌 · 右键弃牌 · Q 喝药</span>
    </footer>
  </div>`;

  camp.querySelectorAll('[data-build]').forEach((node) => {
    node.addEventListener('click', () => {
      const id = node.dataset.build;
      const res = game.build(id);
      if (!res.ok) { notify(`无法建造：${res.reason}`); return; }
      if (res.unlocked && res.unlocked.length) {
        notify(`解锁新地形：${res.unlocked.map((c) => CARDS[c].name).join('、')}`, 'good');
      } else {
        notify(`建造完成：${BUILDING_BY_ID[id].name}`);
      }
      showCamp(game);
    });
  });

  camp.querySelectorAll('[data-chapter]').forEach((node) => {
    node.addEventListener('click', () => {
      const id = node.dataset.chapter;
      if (!chapterUnlocked(meta, id)) { notify('先通关上一章才能进入', 'warn'); return; }
      if (game.setChapter(id)) showCamp(game);
    });
  });

  camp.querySelectorAll('[data-class]').forEach((node) => {
    node.addEventListener('click', () => {
      const id = node.dataset.class;
      if (!classUnlocked(meta, id)) { notify('尚未解锁该职业，先建造对应营地建筑', 'warn'); return; }
      if (game.setClass(id)) showCamp(game);
    });
  });

  const applyDeck = (deckNext) => {
    if (deckNext.length < 10) { notify('牌组至少需要 10 张', 'warn'); return; }
    if (deckNext.length > 30) { notify('牌组最多 30 张', 'warn'); return; }
    game.setDeck(deckNext);
    showCamp(game);
  };

  camp.querySelectorAll('[data-pick]').forEach((node) => {
    node.addEventListener('click', () => {
      const id = node.dataset.pick;
      let deckNext = [...deckFromMeta(meta)];
      const n = deckNext.filter((x) => x === id).length;

      if (deckNext.length >= 30) {
        // 满编时左键点已有牌 = 减一张，方便直接换牌
        if (n > 0) {
          deckNext.splice(deckNext.lastIndexOf(id), 1);
          applyDeck(deckNext);
        } else {
          notify('牌组已满 30 张：先点一张已选牌移除', 'warn');
        }
        return;
      }

      if (n >= 2) { notify('同名卡牌最多 2 张', 'warn'); return; }
      deckNext.push(id);
      applyDeck(deckNext);
    });

    node.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const id = node.dataset.pick;
      const deckNext = [...deckFromMeta(meta)];
      const i = deckNext.lastIndexOf(id);
      if (i < 0) return;
      if (deckNext.length <= 10) { notify('牌组至少需要 10 张：先加一张再移除', 'warn'); return; }
      deckNext.splice(i, 1);
      applyDeck(deckNext);
    });
  });

  const autoBtn = document.getElementById('deckAuto');
  if (autoBtn) {
    autoBtn.addEventListener('click', () => {
      game.setDeck([]);
      notify('已恢复自动组牌');
      showCamp(game);
    });
  }

  document.getElementById('btnCodex').addEventListener('click', () => showCodex(game));

  document.getElementById('btnStartRun').addEventListener('click', () => {
    hideCamp();
    game.startRun();
  });

  document.getElementById('btnReset').addEventListener('click', () => {
    if (confirm('确定清除营地存档？所有资源与建筑都会消失。')) {
      game.resetSave();
      showCamp(game);
    }
  });
}

export function hideCamp() {
  campEl().classList.add('hidden');
}

// ---------- 图鉴 ----------

function comboEntries() {
  const out = [];
  for (const [id, def] of Object.entries(CARDS)) {
    if (!def.combo) continue;
    out.push({
      key: `same:${id}`,
      label: `${def.name} × ${def.combo.same}`,
      into: def.combo.into,
      type: '同种连锁',
    });
  }
  for (const r of CROSS_COMBOS) {
    out.push({
      key: `cross:${r.a}:${r.b}`,
      label: `${CARDS[r.a].name} + ${CARDS[r.b].name}`,
      into: r.into,
      type: '相邻联动',
    });
  }
  return out;
}

function cardKind(kind) {
  return kind === 'roadside' ? '路边' : kind === 'scene' ? '场景' : '野地';
}

export function showCodex(game, initialTab = 'cards') {
  G = game;
  hideCamp();
  const el = document.getElementById('codexScreen');
  el.classList.remove('hidden');
  let tab = initialTab;

  const render = () => {
    const meta = game.meta;
    const baseCards = Object.entries(CARDS).filter(([, d]) => !d.scene);
    const combos = comboEntries();
    const enemies = Object.entries(ENEMIES).filter(([, e]) => !e.boss);
    const bosses = Object.entries(ENEMIES).filter(([, e]) => e.boss);

    const counts = {
      cards: baseCards.filter(([id]) => seenCard(meta, id)).length,
      combos: combos.filter((c) => seenCombo(meta, c.key)).length,
      enemies: enemies.filter(([id]) => seenEnemy(meta, id)).length,
      bosses: bosses.filter(([id]) => seenEnemy(meta, id)).length,
    };

    let body = '';
    if (tab === 'cards') {
      body = baseCards.map(([id, d]) => {
        const seen = seenCard(meta, id);
        const hint = d.unlock
          ? `建造「${BUILDING_BY_ID[d.unlock]?.name || d.unlock}」后解锁`
          : '隐藏地形，由组合产生';
        return `<article class="cx-entry ${seen ? '' : 'locked'}">
          <div class="cx-glyph" style="--c:${d.color}">${seen ? d.glyph : '？'}</div>
          <div class="cx-body">
            <div class="cx-head"><b>${seen ? d.name : '？？？'}</b><span>${d.hidden ? '隐藏' : cardKind(d.kind)}</span></div>
            <p>${seen ? d.desc : hint}</p>
          </div>
        </article>`;
      }).join('');
    } else if (tab === 'combos') {
      body = combos.map((c) => {
        const seen = seenCombo(meta, c.key);
        const into = CARDS[c.into];
        return `<article class="cx-entry ${seen ? '' : 'locked'}">
          <div class="cx-glyph" style="--c:${into.color}">${seen ? into.glyph : '？'}</div>
          <div class="cx-body">
            <div class="cx-head"><b>${c.label} → ${seen ? into.name : '？？？'}</b><span>${c.type}</span></div>
            <p>${seen ? into.desc : '隐藏组合，尚未发现。先在环线上凑出这个相邻关系。'}</p>
          </div>
        </article>`;
      }).join('');
    } else if (tab === 'enemies' || tab === 'bosses') {
      const list = tab === 'enemies' ? enemies : bosses;
      body = list.map(([id, e]) => {
        const seen = seenEnemy(meta, id);
        const abilities = describeAbilities({ abilities: e.abilities });
        return `<article class="cx-entry ${seen ? '' : 'locked'}">
          <div class="cx-glyph" style="--c:${e.color}">${seen ? '兽' : '？'}</div>
          <div class="cx-body">
            <div class="cx-head"><b>${seen ? e.name : '？？？'}</b><span>${e.boss ? '首领' : '敌人'}</span></div>
            <p>${seen ? `生命 ${e.hp} · 攻击 ${e.atk} · 攻速 ${e.speed}` : '在远征中遭遇后记录。'}</p>
            ${seen && abilities.length ? `<div class="ability-tags">${abilities.map((a) => `<span title="${a.desc}">${a.name}</span>`).join('')}</div>` : ''}
          </div>
        </article>`;
      }).join('');
    } else {
      body = BUILDINGS.map((b) => {
        const lv = meta.buildings[b.id] || 0;
        return `<article class="cx-entry">
          <div class="cx-glyph">${b.glyph}</div>
          <div class="cx-body">
            <div class="cx-head"><b>${b.name}</b><span>${lv} / ${b.maxLevel}</span></div>
            <p>${b.desc(Math.max(1, lv))}</p>
          </div>
        </article>`;
      }).join('');
    }

    el.innerHTML = `<div class="codex-inner">
      <header class="codex-head">
        <div>
          <h1>图鉴</h1>
          <p class="muted">卡牌 ${counts.cards}/${baseCards.length} · 组合 ${counts.combos}/${combos.length} · 敌人 ${counts.enemies}/${enemies.length} · 首领 ${counts.bosses}/${bosses.length}</p>
        </div>
        <button class="ghost" id="codexClose">返回营地</button>
      </header>
      <nav class="codex-tabs">
        ${[['cards', '卡牌'], ['combos', '隐藏组合'], ['enemies', '敌人'], ['bosses', '首领'], ['buildings', '建筑']]
          .map(([id, label]) => `<button data-ctab="${id}" class="${tab === id ? 'on' : ''}">${label}</button>`).join('')}
      </nav>
      <div class="codex-grid">${body}</div>
    </div>`;

    el.querySelectorAll('[data-ctab]').forEach((btn) => {
      btn.addEventListener('click', () => { tab = btn.dataset.ctab; render(); });
    });
    document.getElementById('codexClose').addEventListener('click', () => {
      el.classList.add('hidden');
      showCamp(game);
    });
  };

  render();
}

export function showLoot(game, payload) {
  const overlay = overlayEl();
  const labels = STAT_LABELS;
  const fmt = (k, v) => {
    if (STAT_PERCENT.has(k)) return `${Math.round(v * 1000) / 10}%`;
    if (k === 'atkSpeed') return `+${Math.round(v * 100) / 100}`;
    return `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}`;
  };
  const card = (item, title) => `<div class="loot-side">
    <h3>${title}</h3>
    <div class="loot-name">${item.name}</div>
    <div class="loot-stats">
      ${Object.entries(item.stats || {}).map(([k, v]) => `<span><i>${labels[k] || k}</i><b>${fmt(k, v)}</b></span>`).join('')}
    </div>
  </div>`;

  overlay.classList.remove('hidden');
  overlay.innerHTML = `<div class="overlay-inner loot-modal">
    <p class="kicker">拾取装备</p>
    <h2>${payload.item.name}</h2>
    <p class="muted">背包 ${game.run.hero.inventory.length} / ${game.run.hero.maxInventory}，选择如何处理这件装备。</p>
    <div class="loot-compare">
      ${card(payload.current || { name: '空', stats: {} }, '当前')}
      ${card(payload.item, '拾取')}
    </div>
    <div class="modal-actions">
      <button class="primary" id="lootEquip">换上（1）</button>
      <button class="ghost" id="lootStash">收进背包（2）</button>
      <button class="ghost" id="lootDiscard">丢弃（3）</button>
    </div>
  </div>`;
  document.getElementById('lootEquip').addEventListener('click', () => game.resolveLoot('equip'));
  document.getElementById('lootStash').addEventListener('click', () => game.resolveLoot('stash'));
  document.getElementById('lootDiscard').addEventListener('click', () => game.resolveLoot('discard'));
}

export function showTraits(game, choices) {
  const overlay = overlayEl();
  overlay.classList.remove('hidden');
  overlay.innerHTML = `<div class="overlay-inner trait-modal">
    <p class="kicker">LEVEL ${game.run.hero.level}</p>
    <h2>选择一项天赋</h2>
    <div class="trait-list">
      ${choices.map((t) => `<button class="trait" data-trait="${t.id}">
        <span class="tglyph">${t.glyph}</span>
        <span class="tname">${t.name}</span>
        <span class="tdesc">${t.desc}</span>
      </button>`).join('')}
    </div>
  </div>`;
  overlay.querySelectorAll('[data-trait]').forEach((node) => {
    node.addEventListener('click', () => game.chooseTrait(node.dataset.trait));
  });
}

export function showPause(game) {
  const overlay = overlayEl();
  const h = game.run.hero;
  const inv = h.inventory || [];
  overlay.classList.remove('hidden');
  overlay.innerHTML = `<div class="overlay-inner small-modal pause-modal">
    <h2>暂停</h2>
    <p class="muted">英雄停下了脚步，但首领仍在等待。</p>
    <div class="inv-head"><b>背包</b><span>${inv.length} / ${h.maxInventory}</span></div>
    <div class="inv-list">
      ${inv.length ? inv.map((it, i) => `<div class="inv-row">
        <span class="inv-name">${it.name}</span>
        <span class="inv-slot">${it.slotName}</span>
        <button data-invequip="${i}">换上</button>
        <button data-invdrop="${i}">丢弃</button>
      </div>`).join('') : '<p class="muted">背包为空。</p>'}
    </div>
    <div class="modal-actions">
      <button class="primary" id="btnResume">继续</button>
      <button class="ghost" id="btnAutoEquip">${game.meta.autoEquip ? '拾取面板：关' : '拾取面板：开'}</button>
      <button class="ghost" id="btnQuitRun">撤退回营地</button>
    </div>
  </div>`;
  document.getElementById('btnResume').addEventListener('click', () => game.togglePause());
  document.getElementById('btnQuitRun').addEventListener('click', () => { hideOverlay(); game.retreat(true); });
  document.getElementById('btnAutoEquip').addEventListener('click', () => game.toggleAutoEquip());
  overlay.querySelectorAll('[data-invequip]').forEach((node) => {
    node.addEventListener('click', () => game.equipFromInventory(Number(node.dataset.invequip)));
  });
  overlay.querySelectorAll('[data-invdrop]').forEach((node) => {
    node.addEventListener('click', () => game.discardInventory(Number(node.dataset.invdrop)));
  });
}

function bankRow(run) {
  const list = run.bankList || [];
  if (!list.length) return '';
  return `<div class="bank-list">${list.map((r) => `<span>${r.label} +${r.amount}</span>`).join('')}</div>`;
}

export function showDeath(game) {
  const run = game.run;
  const overlay = overlayEl();
  overlay.classList.remove('hidden');
  const where = run.infinite ? `无尽第 ${run.layer} 层` : `第 ${run.loop} 圈`;
  overlay.innerHTML = `<div class="overlay-inner result-modal lose">
    <p class="kicker">远征结束</p>
    <h2>你倒在了${where}</h2>
    <p class="muted">夜色吞没了盔甲上的最后一点火光。营地的人会记住这次远征。</p>
    <div class="result-stats">
      <div><span>击杀</span><b>${run.kills}</b></div>
      <div><span>到达圈数</span><b>${run.loop}</b></div>
      <div><span>铺牌</span><b>${run.cardsPlayed}</b></div>
      <div><span>造成伤害</span><b>${Math.round(run.dmgDealt)}</b></div>
      <div><span>承受伤害</span><b>${Math.round(run.dmgTaken)}</b></div>
    </div>
    ${bankRow(run)}
    <div class="modal-actions">
      <button class="primary" id="btnBackCamp">返回营地</button>
    </div>
  </div>`;
  document.getElementById('btnBackCamp').addEventListener('click', () => game.returnToCamp());
}

export function showVictory(game) {
  const run = game.run;
  const ch = chapterById(run.chapter);
  const overlay = overlayEl();
  overlay.classList.remove('hidden');
  overlay.innerHTML = `<div class="overlay-inner result-modal win">
    <p class="kicker">第 ${run.chapter} 章 · 完</p>
    <h2>${ch.bossName}已被击败</h2>
    <p class="muted">${ch.name}恢复了安静。你把战利品塞进背包，踏上回营的路。</p>
    <div class="result-stats">
      <div><span>圈数</span><b>${run.loop}</b></div>
      <div><span>击杀</span><b>${run.kills}</b></div>
      <div><span>铺牌</span><b>${run.cardsPlayed}</b></div>
      <div><span>造成伤害</span><b>${Math.round(run.dmgDealt)}</b></div>
      <div><span>承受伤害</span><b>${Math.round(run.dmgTaken)}</b></div>
    </div>
    ${bankRow(run)}
    <div class="modal-actions">
      <button class="primary" id="btnBackCamp">凯旋</button>
    </div>
  </div>`;
  document.getElementById('btnBackCamp').addEventListener('click', () => game.returnToCamp());
}

export function hideOverlay() {
  overlayEl().classList.add('hidden');
  overlayEl().innerHTML = '';
}

export function traitChoices(rng, hero) {
  const pool = TRAITS.filter((t) => !t.classes || t.classes.includes(hero.classId));
  const out = [];
  while (out.length < 3 && pool.length) {
    const i = Math.floor(rng.next() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
