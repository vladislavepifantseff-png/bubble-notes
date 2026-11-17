import * as S from './store.js';
import { BubbleField } from './physics.js';
import { actionSheet, textSheet, confirmSheet, toast, captureSheet } from './ui.js';
import { openList, branchMenu } from './list.js';
import { esc, pl, zap } from './util.js';

const $ = (s) => document.querySelector(s);
const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

/* --- клавиатура iOS: держим шторки и экран ветки над ней --- */
const vv = window.visualViewport;
function syncViewport() {
  const root = document.documentElement;
  if (!vv) return;
  root.style.setProperty('--vvh', `${vv.height}px`);
  root.style.setProperty('--vvt', `${vv.offsetTop}px`);
  root.classList.toggle('kb', innerHeight - vv.height > 120);
}
vv?.addEventListener('resize', syncViewport);
vv?.addEventListener('scroll', syncViewport);
syncViewport();

await S.load();

const ui = {
  tabs: $('#tabs'), meta: $('#meta'), top: $('#top'), top2: $('#top2'),
  back: $('#back'), backLabel: $('#backLabel'), more: $('#more'),
  wrap: $('#branchWrap'), layer: $('#branches'), links: $('#links'),
  hint: $('#hint'), plus: $('#plus'), newB: $('#newBubble'), bar: $('#bar'),
};

let view = 'space';   // 'space' | 'bubble'
let focused = null;   // id пузыря, открытого по центру
let listOpen = null;

const field = new BubbleField($('#field'), { onTap: tapBubble });

/* ---------- данные для поля ---------- */
function bubbleData() {
  return S.space().bubbles.filter((b) => !b.archived).map((b) => {
    const c = S.activeCount(b);
    return {
      id: b.id, name: b.name, count: c, inbox: b.inbox,
      sub: b.inbox ? (c ? `${c} ${pl(c, 'новая', 'новые', 'новых')}` : 'пусто') : zap(c),
    };
  });
}

function updateInsets() {
  if (view !== 'space') return;
  const top = ui.top.getBoundingClientRect().bottom + 10;
  const barTop = ui.plus.getBoundingClientRect().top - 14;
  field.setInsets(top, innerHeight - barTop);
  field.resize();
}

function renderTabs() {
  const cur = S.space().id;
  ui.tabs.innerHTML = S.state.spaces.map((s) => `<button type="button" class="tab glass${s.id === cur ? ' on' : ''}" data-s="${s.id}">${esc(s.name)}</button>`).join('')
    + '<button type="button" class="tab glass add" data-add="1" aria-label="Новое пространство">+</button>';
}

function renderMeta() {
  const bubbles = S.space().bubbles.filter((b) => !b.archived && !b.inbox);
  const total = S.space().bubbles.reduce((n, b) => n + S.activeCount(b), 0);
  ui.meta.textContent = `${bubbles.length} ${pl(bubbles.length, 'пузырь', 'пузыря', 'пузырей')} · ${zap(total)}`;
}

function renderHint() {
  if (view === 'bubble') { ui.hint.textContent = 'Тап по ветке — открыть · зажать — переименовать'; return; }
  const sp = S.space();
  const projects = sp.bubbles.filter((b) => !b.inbox && !b.archived).length;
  ui.hint.textContent = projects === 0
    ? 'Создай первый пузырь-проект кнопкой слева внизу. «+» — быстро записать идею.'
    : '';
}

function refresh() {
  field.setBubbles(bubbleData());
  renderTabs();
  renderMeta();
  renderHint();
  if (view === 'bubble') renderBranches(false);
}

/* ---------- пространства ---------- */
function switchSpace(id) {
  if (view === 'bubble') closeBubble(true);
  S.state.currentSpace = id;
  S.save();
  field.clear();
  field.setBubbles(bubbleData(), 'edges');
  renderTabs();
  renderMeta();
  renderHint();
}

async function spaceMenu() {
  const sp = S.space();
  const actions = [{ label: 'Переименовать', value: 'rename' }];
  if (S.state.spaces.length > 1) actions.push({ label: 'Удалить пространство', value: 'delete', danger: true });
  const v = await actionSheet(`Пространство «${sp.name}»`, actions);
  if (v === 'rename') {
    const name = await textSheet({ title: 'Название пространства', value: sp.name, ok: 'Сохранить' });
    if (name) { sp.name = name; S.save(); renderTabs(); }
  } else if (v === 'delete') {
    const n = sp.bubbles.reduce((a, b) => a + S.totalCount(b), 0);
    const bubbles = sp.bubbles.filter((b) => !b.inbox).length;
    const ok = await confirmSheet(`Удалить «${sp.name}»: ${bubbles} ${pl(bubbles, 'пузырь', 'пузыря', 'пузырей')}, ${zap(n)}?`, 'Удалить');
    if (!ok) return;
    S.state.spaces = S.state.spaces.filter((s) => s !== sp);
    switchSpace(S.state.spaces[0].id);
  }
}

ui.tabs.addEventListener('click', async (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  if (t.dataset.add) {
    const name = await textSheet({ title: 'Новое пространство', placeholder: 'Например, «Контент»', ok: 'Создать' });
    if (!name) return;
    const sp = S.newSpace(name);
    S.state.spaces.push(sp);
    switchSpace(sp.id);
    return;
  }
  if (t.dataset.s !== S.space().id) switchSpace(t.dataset.s);
  else spaceMenu();
});

/* ---------- пузыри ---------- */
function tapBubble(id) {
  const found = S.findBubble(id);
  if (!found) return;
  if (found.bubble.inbox) openBranch(found.bubble, S.miscOf(found.bubble), S.space().name);
  else openBubble(id);
}

function openBubble(id) {
  view = 'bubble';
  focused = id;
  field.focus(id);
  ui.top.hidden = true;
  ui.top2.hidden = false;
  ui.newB.style.visibility = 'hidden';
  ui.backLabel.textContent = S.space().name;
  renderHint();
  setTimeout(() => { if (view === 'bubble' && focused === id) renderBranches(true); }, 240);
}

function closeBubble(silent = false) {
  view = 'space';
  focused = null;
  ui.layer.innerHTML = '';
  ui.links.innerHTML = '';
  ui.top.hidden = false;
  ui.top2.hidden = true;
  ui.newB.style.visibility = '';
  field.unfocus();
  if (!silent) refresh();
}

function renderBranches(animate) {
  const found = S.findBubble(focused);
  if (!found) return;
  const { bubble } = found;
  const g = field.getFocus();
  const W = innerWidth, H = innerHeight;
  const bd = field.bounds();
  const nodes = [
    ...bubble.branches.map((br) => ({ br, c: br.items.filter((i) => !i.done).length })),
    { add: true },
  ];
  const n = nodes.length;
  const rx = Math.min(W * 0.34, 180);
  const ry = Math.min((bd.b - bd.t) * 0.37, rx * 1.75);
  let lines = '', html = '';
  nodes.forEach((nd, i) => {
    const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
    const x = g.x + rx * Math.cos(a), y = g.y + ry * Math.sin(a);
    const d = nd.add ? W * 0.13 : W * 0.13 + Math.min(W * 0.11, Math.sqrt(nd.c) * W * 0.035);
    const dx = x - g.x, dy = y - g.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const sx = g.x + ux * (g.r + 3), sy = g.y + uy * (g.r + 3);
    let ex = x - ux * (d / 2 + 3), ey = y - uy * (d / 2 + 3);
    // ветка выше центра: подпись под ней — линию ведём к низу подписи, а не через неё
    if (uy < -0.85) { ex = x; ey = y + d / 2 + 44; }
    const bend = Math.min(10, Math.hypot(ex - sx, ey - sy) * 0.12);
    const mx = (sx + ex) / 2 - uy * bend, my = (sy + ey) / 2 + ux * bend;
    lines += `<path pathLength="1" style="--i:${i}" d="M${sx.toFixed(1)} ${sy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}"/>`;
    const style = `left:${(x - d / 2).toFixed(1)}px;top:${(y - d / 2).toFixed(1)}px;width:${d.toFixed(1)}px;--d:${d.toFixed(1)}px;--i:${i};--bx:${(-dx * 0.8).toFixed(1)}px;--by:${(-dy * 0.8).toFixed(1)}px`;
    html += nd.add
      ? `<div class="node add" data-add="1" style="${style}" role="button" tabindex="0" aria-label="Новая ветка"><div class="pop">${ICON_PLUS}</div><div class="lbl">Новая ветка</div></div>`
      : `<div class="node" data-br="${nd.br.id}" style="${style}" role="button" tabindex="0"><div class="pop"><div class="bubble"><b>${nd.c}</b></div></div><div class="lbl">${esc(nd.br.name)}<em>${zap(nd.c)}</em></div></div>`;
  });
  ui.links.setAttribute('viewBox', `0 0 ${W} ${H}`);
  ui.links.innerHTML = lines;
  ui.layer.innerHTML = html;
  ui.wrap.classList.remove('anim');
  if (animate) { void ui.wrap.offsetWidth; ui.wrap.classList.add('anim'); }
}

/* тап / долгое нажатие по ветке */
let lp = null;
ui.layer.addEventListener('pointerdown', (e) => {
  const node = e.target.closest('.node');
  if (!node) return;
  lp = { node, x: e.clientX, y: e.clientY, fired: false };
  lp.timer = setTimeout(() => { if (lp) { lp.fired = true; onNodeLong(lp.node); } }, 520);
});
ui.layer.addEventListener('pointermove', (e) => {
  if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) { clearTimeout(lp.timer); lp = null; }
});
ui.layer.addEventListener('pointerup', () => {
  if (!lp) return;
  clearTimeout(lp.timer);
  const { node, fired } = lp;
  lp = null;
  if (!fired) onNodeTap(node);
});
ui.layer.addEventListener('pointercancel', () => { if (lp) { clearTimeout(lp.timer); lp = null; } });
ui.layer.addEventListener('contextmenu', (e) => e.preventDefault());
ui.layer.addEventListener('keydown', (e) => {
  const node = e.target.closest('.node');
  if (node && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onNodeTap(node); }
});

async function onNodeTap(node) {
  const { bubble } = S.findBubble(focused);
  if (node.dataset.add) {
    const name = await textSheet({ title: 'Новая ветка', placeholder: 'Например, «Гости»', ok: 'Создать' });
    if (!name) return;
    bubble.branches.push(S.newBranch(name));
    S.save();
    renderBranches(false);
    return;
  }
  const br = bubble.branches.find((b) => b.id === node.dataset.br);
  if (br) openBranch(bubble, br, bubble.name);
}

async function onNodeLong(node) {
  if (node.dataset.add) return;
  const { bubble } = S.findBubble(focused);
  const br = bubble.branches.find((b) => b.id === node.dataset.br);
  if (!br) return;
  const res = await branchMenu(bubble, br);
  if (res) refresh();
}

function openBranch(bubble, branch, backLabel) {
  field.stop();
  listOpen = openList({
    bubble, branch, backLabel,
    onClose: () => { listOpen = null; field.start(); refresh(); },
  });
}

/* ---------- верхние кнопки открытого пузыря ---------- */
ui.back.addEventListener('click', () => closeBubble());
ui.more.addEventListener('click', async () => {
  const found = S.findBubble(focused);
  if (!found) return;
  const { space, bubble } = found;
  const v = await actionSheet(`Пузырь «${bubble.name}»`, [
    { label: 'Переименовать', value: 'rename' },
    { label: 'Перенести в другое пространство', value: 'move' },
    { label: 'Удалить пузырь', value: 'delete', danger: true },
  ]);
  if (v === 'move') {
    await moveBubble(space, bubble);
  } else if (v === 'rename') {
    const name = await textSheet({ title: 'Название пузыря', value: bubble.name, ok: 'Сохранить' });
    if (name) { bubble.name = name; S.save(); refresh(); }
  } else if (v === 'delete') {
    const n = S.totalCount(bubble);
    const ok = await confirmSheet(n ? `Удалить «${bubble.name}» и ${zap(n)}?` : `Удалить «${bubble.name}»?`, 'Удалить');
    if (!ok) return;
    space.bubbles = space.bubbles.filter((b) => b !== bubble);
    S.save();
    closeBubble();
    toast('Пузырь удалён');
  }
});

/* перенос пузыря со всеми ветками и записями в другое пространство */
async function moveBubble(from, bubble) {
  const NEW = '\u0000new';
  const others = S.state.spaces.filter((s) => s !== from);
  const v = await actionSheet(`Перенести «${bubble.name}» в…`, [
    ...others.map((s) => ({ label: s.name, value: s.id })),
    { label: '＋ Новое пространство', value: NEW },
  ]);
  if (!v) return;
  let to = others.find((s) => s.id === v);
  if (v === NEW) {
    const name = await textSheet({ title: 'Новое пространство', placeholder: 'Например, «Контент»', ok: 'Создать' });
    if (!name) return;
    to = S.newSpace(name);
    S.state.spaces.push(to);
  }
  if (!to) return;
  from.bubbles = from.bubbles.filter((b) => b !== bubble);
  to.bubbles.push(bubble);
  S.save();
  closeBubble();
  toast(`«${bubble.name}» → пространство «${to.name}»`);
}

/* ---------- нижние кнопки ---------- */
ui.newB.addEventListener('click', async () => {
  const name = await textSheet({ title: 'Новый пузырь', placeholder: 'Название проекта', ok: 'Создать' });
  if (!name) return;
  S.space().bubbles.push(S.newBubble(name));
  S.save();
  field.setBubbles(bubbleData(), 'top');
  renderMeta();
  renderHint();
});

ui.plus.addEventListener('click', async () => {
  const sp = S.space();
  const bubbles = sp.bubbles.filter((b) => !b.archived && !b.inbox);
  const res = await captureSheet({
    bubbles,
    bubbleId: view === 'bubble' ? focused : null,
    branchesOf: (id) => sp.bubbles.find((b) => b.id === id)?.branches || [],
  });
  if (!res) return;
  const bubble = res.bubbleId ? sp.bubbles.find((b) => b.id === res.bubbleId) : S.inboxOf(sp);
  const br = (res.branchId && bubble.branches.find((x) => x.id === res.branchId)) || S.miscOf(bubble);
  br.items.push(S.newItem(res.text));
  S.save();
  refresh();
  field.pulse(bubble.id);
  toast(bubble.inbox ? 'Записано во «Входящие»' : `Записано: «${bubble.name}» → ${br.name}`);
});

/* ---------- жизненный цикл ---------- */
window.addEventListener('resize', () => {
  updateInsets();
  if (view === 'bubble') { field.focus(focused); renderBranches(false); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { field.stop(); S.save(true); }
  else if (!listOpen) field.start();
});

renderTabs();
renderMeta();
renderHint();
updateInsets();
field.setBubbles(bubbleData(), 'edges');
field.start();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
