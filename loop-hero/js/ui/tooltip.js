// 悬浮说明：手牌 / 地形 / 装备 / 建筑
let el = null;
let active = null;

export function initTooltip() {
  el = document.createElement('div');
  el.id = 'tooltip';
  el.className = 'hidden';
  document.body.appendChild(el);

  document.addEventListener('pointerover', (e) => {
    const target = e.target.closest?.('[data-tip]');
    if (!target || target === active) return;
    active = target;
    el.innerHTML = target.dataset.tip || '';
    el.classList.remove('hidden');
    place(e.clientX, e.clientY);
  });

  document.addEventListener('pointermove', (e) => {
    if (active && !active.isConnected) { hideTip(); return; }
    if (active) place(e.clientX, e.clientY);
  });

  document.addEventListener('pointerout', (e) => {
    if (!active) return;
    const to = e.relatedTarget;
    if (to && active.contains(to)) return;
    if (active.contains(e.target)) hideTip();
  });
}

export function showTip(html, x, y) {
  if (!el) return;
  el.innerHTML = html;
  el.classList.remove('hidden');
  active = null;
  place(x, y);
}

export function hideTip() {
  if (!el) return;
  el.classList.add('hidden');
  active = null;
}

function place(x, y) {
  const pad = 16;
  let left = x + pad;
  let top = y - el.offsetHeight - 14;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (top < 8) top = y + 18;
  if (left + w > window.innerWidth - 8) left = x - w - pad;
  if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, top)}px`;
}

export function tipHtml(title, kind, desc) {
  const k = kind ? `<span class="tt-kind">${esc(kind)}</span>` : '';
  return `<b>${esc(title)}</b>${k}<p>${esc(desc)}</p>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
