// Экран ветки: список записей, перетаскивание, выполнено, главный шаг (карандаш), свайп.
import * as S from './store.js';
import { actionSheet, textSheet, confirmSheet, toast } from './ui.js';
import { esc, pl, zap, linkify, autosize } from './util.js';
import { ICON_PHOTO, thumbsHTML, hydrate, viewPhotos, pendingStrip, addPending, storePhotos, discardPending } from './photos.js';

const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>';
const ICON_MORE = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
const ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_GRIP = '<svg viewBox="0 0 10 16"><circle cx="2" cy="2" r="1.6"/><circle cx="8" cy="2" r="1.6"/><circle cx="2" cy="8" r="1.6"/><circle cx="8" cy="8" r="1.6"/><circle cx="2" cy="14" r="1.6"/><circle cx="8" cy="14" r="1.6"/></svg>';
const PENCIL_EXCL = `<svg viewBox="0 0 20 30" aria-hidden="true"><g filter="url(#pencil)">
  <path class="pg" pathLength="1" d="M11.6 3.2 C10.9 9.4 10.1 14.2 9.4 19.6" stroke-width="2.9"/>
  <path class="pg" pathLength="1" d="M12.4 4.4 C11.4 10.2 10.7 14.6 10.2 18.4" stroke-width="1.3" opacity=".55"/>
  <path class="pg" pathLength="1" d="M8.7 24.8 c.5 -.6 1.4 -.4 1.3 .4 c-.1 .7 -1.1 .8 -1.4 .1" stroke-width="2.6"/>
</g></svg>`;

/** Меню ветки (переименовать / удалить). Возвращает 'renamed' | 'deleted' | null. */
export async function branchMenu(bubble, branch) {
  const actions = [{ label: 'Переименовать', value: 'rename' }];
  if (!branch.misc) actions.push({ label: 'Удалить ветку', value: 'delete', danger: true });
  const v = await actionSheet(`Ветка «${branch.name}»`, actions);
  if (v === 'rename') {
    const name = await textSheet({ title: 'Название ветки', value: branch.name, ok: 'Сохранить' });
    if (!name) return null;
    branch.name = name;
    S.save();
    return 'renamed';
  }
  if (v === 'delete') {
    const n = branch.items.length;
    const ok = await confirmSheet(n ? `Удалить ветку «${branch.name}» и ${zap(n)}?` : `Удалить ветку «${branch.name}»?`, 'Удалить');
    if (!ok) return null;
    S.dropPhotos(branch.items);
    bubble.branches = bubble.branches.filter((b) => b !== branch);
    S.save();
    return 'deleted';
  }
  return null;
}

/* карандашная рамка */
const seeded = (str) => {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
};
function roughRect(w, h, p, r) {
  const j = (a = 2.2) => +((r() - 0.5) * a).toFixed(1);
  const x0 = p, y0 = p, x1 = p + w, y1 = p + h;
  return `M${x0 - 4 + j()} ${y0 + 1.5 + j()} Q${(x0 + x1) / 2 + j(6)} ${y0 - 1.2 + j(3)} ${x1 + 4 + j()} ${y0 + j()}`
    + ` M${x1 - 1 + j()} ${y0 - 4 + j()} Q${x1 + 1.4 + j(3)} ${(y0 + y1) / 2 + j(4)} ${x1 + j()} ${y1 + 4 + j()}`
    + ` M${x1 + 4 + j()} ${y1 - 0.5 + j()} Q${(x0 + x1) / 2 + j(6)} ${y1 + 1.6 + j(3)} ${x0 - 3 + j()} ${y1 + j()}`
    + ` M${x0 + 1 + j()} ${y1 + 4 + j()} Q${x0 - 1.4 + j(3)} ${(y0 + y1) / 2 + j(4)} ${x0 + j()} ${y0 - 4 + j()}`;
}

export function openList({ bubble, branch, backLabel, onClose, focusId = null }) {
  const panel = document.createElement('section');
  panel.className = 'panel pond';
  panel.setAttribute('aria-label', 'Ветка');
  panel.innerHTML = `
    <div class="p-head">
      <div class="p-top">
        <button class="pill glass back" type="button">${ICON_BACK}<span>${esc(backLabel)}</span></button>
        ${bubble.inbox ? '' : `<button class="round glass more" type="button" aria-label="Ветка: переименовать или удалить">${ICON_MORE}</button>`}
      </div>
      <h2 class="p-title"></h2>
      <div class="p-sub"></div>
    </div>
    <div class="sheet">
      <div class="grab"></div>
      <ul class="list open-list"></ul>
      <p class="empty" hidden></p>
      <div class="sec" hidden></div>
      <ul class="list done"></ul>
    </div>
    <form class="composer" autocomplete="off">
      <div class="pending" hidden></div>
      <button class="addph" type="button" aria-label="Добавить фото или скриншот">${ICON_PHOTO}</button>
      <textarea rows="1" placeholder="Новая запись…" enterkeyhint="send" aria-label="Новая запись"></textarea>
      <button class="send" type="submit" aria-label="Добавить запись">${ICON_UP}</button>
    </form>`;
  document.body.appendChild(panel);
  requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('in')));

  const $ = (s) => panel.querySelector(s);
  const elAct = $('.list.open-list'), elDone = $('.list.done'), sheet = $('.sheet');
  const fresh = new Set();

  const rowHTML = (it, isDone) => `
    <li class="row${it.main && !isDone ? ' main' : ''}" data-id="${it.id}">
      <div class="clip">
        <div class="acts"><button class="act mv" type="button">Перенести</button><button class="act del" type="button">Удалить</button></div>
        <div class="content">
          ${isDone ? '' : `<span class="grip" aria-label="Перетащить">${ICON_GRIP}</span>`}
          <button class="check" type="button" aria-label="${isDone ? 'Вернуть в работу' : 'Отметить выполненным'}">${ICON_CHECK}</button>
          <div class="body">${it.text ? `<p class="txt">${linkify(it.text)}</p>` : ''}${thumbsHTML(it.photos)}</div>
          ${isDone ? '' : `<button class="mark${fresh.has(it.id) ? ' fresh' : ''}" type="button" aria-pressed="${!!it.main}" aria-label="Главный шаг">${it.main ? PENCIL_EXCL : '!'}</button>`}
        </div>
      </div>
      ${it.main && !isDone ? `<svg class="frame${fresh.has(it.id) ? ' fresh' : ''}" aria-hidden="true"><path pathLength="1" filter="url(#pencil)"/></svg>` : ''}
    </li>`;

  function render() {
    const act = branch.items.filter((i) => !i.done);
    const done = branch.items.filter((i) => i.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    $('.p-title').textContent = bubble.inbox ? bubble.name : branch.name;
    $('.p-sub').textContent = bubble.inbox
      ? 'Разбери: свайп влево → «Перенести»'
      : `${act.length} ${pl(act.length, 'активная', 'активные', 'активных')} · ${done.length} выполнено`;
    elAct.innerHTML = act.map((i) => rowHTML(i, false)).join('');
    elDone.innerHTML = done.map((i) => rowHTML(i, true)).join('');
    const empty = $('.empty');
    empty.hidden = act.length > 0;
    empty.textContent = done.length ? 'Всё сделано. Новую запись можно добавить внизу.' : 'Пока пусто. Напиши первую запись внизу.';
    const sec = $('.sec');
    sec.hidden = done.length === 0;
    sec.textContent = `Выполнено · ${done.length}`;
    fresh.clear();
    hydrate(sheet);
    requestAnimationFrame(drawFrames);
  }

  function drawFrames() {
    elAct.querySelectorAll('.row.main').forEach((row) => {
      const svg = row.querySelector('svg.frame');
      if (!svg) return;
      const clip = row.querySelector('.clip');
      const w = clip.offsetWidth, h = clip.offsetHeight, p = 7;
      svg.setAttribute('width', w + p * 2);
      svg.setAttribute('height', h + p * 2);
      svg.setAttribute('viewBox', `0 0 ${w + p * 2} ${h + p * 2}`);
      const r = seeded(row.dataset.id);
      svg.querySelector('path').setAttribute('d', `${roughRect(w, h, p, r)} ${roughRect(w, h, p, r)}`);
    });
  }
  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => drawFrames()) : null;
  ro?.observe(elAct);

  const find = (id) => branch.items.find((i) => i.id === id);
  const closeSwipes = (except) => panel.querySelectorAll('.row.swiped').forEach((r) => { if (r !== except) r.classList.remove('swiped'); });

  /* edit text */
  function startEdit(row, it) {
    const body = row.querySelector('.body');
    const ta = document.createElement('textarea');
    ta.className = 'edit';
    ta.rows = 1;
    ta.enterKeyHint = 'done';
    ta.setAttribute('aria-label', 'Текст записи');
    ta.placeholder = 'Подпись к фото';
    const txt = body.querySelector('.txt');
    if (txt) txt.replaceWith(ta); else body.prepend(ta);
    ta.value = it.text;
    autosize(ta);
    ta.focus();
    const len = ta.value.length;
    ta.setSelectionRange(len, len);
    ta.addEventListener('input', () => autosize(ta));
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); } });
    ta.addEventListener('blur', () => {
      const v = ta.value.trim();
      if (v !== it.text && (v || it.photos?.length)) { it.text = v; S.save(); }
      render();
    }, { once: true });
  }

  /* move item: сначала ветки этого пузыря, потом «Новая ветка» и «В другой пузырь…» */
  const NEW_BRANCH = '\u0000new', OTHER_BUBBLE = '\u0000other';
  const branchOpts = (b) => [
    ...b.branches.filter((x) => x !== branch).map((x) => ({ label: x.name, value: x.id })),
    { label: '＋ Новая ветка', value: NEW_BRANCH },
  ];
  async function resolveBranch(b, v) {
    if (v !== NEW_BRANCH) return b.branches.find((x) => x.id === v) || null;
    const name = await textSheet({ title: `Новая ветка в «${b.name}»`, placeholder: 'Например, «Гости»', ok: 'Создать' });
    if (!name) return null;
    const nb = S.newBranch(name);
    b.branches.push(nb);
    return nb;
  }
  async function pickOtherBubble() {
    const home = S.findBubble(bubble.id)?.space || S.space(); // из поиска ветка может быть в другом пространстве
    const others = home.bubbles.filter((b) => !b.archived && b !== bubble && !(bubble.inbox && b.inbox));
    if (!others.length) { toast('Сначала создай пузырь-проект'); return null; }
    const bid = await actionSheet('В какой пузырь?', others.map((b) => ({ label: b.name, value: b.id })));
    return others.find((b) => b.id === bid) || null;
  }
  async function moveItem(it) {
    let tb = bubble, target = null;
    if (!bubble.inbox) {
      const v = await actionSheet('Перенести в ветку…', [...branchOpts(bubble), { label: 'В другой пузырь…', value: OTHER_BUBBLE }]);
      if (!v) return;
      if (v !== OTHER_BUBBLE) target = await resolveBranch(bubble, v);
      else tb = await pickOtherBubble();
    } else {
      tb = await pickOtherBubble();
    }
    if (!tb) return;
    if (!target) {
      if (tb.inbox) target = S.miscOf(tb);
      else {
        const v = await actionSheet(`«${tb.name}»: в какую ветку?`, branchOpts(tb));
        if (!v) return;
        target = await resolveBranch(tb, v);
      }
    }
    if (!target || target === branch) return;
    branch.items = branch.items.filter((i) => i !== it);
    target.items.push(it);
    S.save();
    render();
    toast(tb === bubble ? `Перенесено в «${target.name}»`
      : tb.inbox ? 'Перенесено во «Входящие»'
      : `Перенесено: «${tb.name}» → ${target.name}`);
  }

  /* clicks */
  let lastSwipe = 0;
  sheet.addEventListener('click', async (e) => {
    if (Date.now() - lastSwipe < 350) return;
    if (e.target.closest('a.lnk')) return;
    const row = e.target.closest('.row');
    if (!row) { closeSwipes(); return; }
    const it = find(row.dataset.id);
    if (!it) return;
    if (e.target.closest('.act.del')) {
      S.dropPhotos([it]);
      branch.items = branch.items.filter((i) => i !== it);
      S.save(); render(); toast('Запись удалена'); return;
    }
    if (e.target.closest('.act.mv')) { row.classList.remove('swiped'); moveItem(it); return; }
    if (row.classList.contains('swiped')) { row.classList.remove('swiped'); return; }
    closeSwipes();
    if (e.target.closest('.check')) {
      it.done = !it.done;
      it.doneAt = it.done ? Date.now() : null;
      if (it.done) it.main = false;
      S.save(); render(); return;
    }
    if (e.target.closest('.mark')) {
      it.main = !it.main;
      if (it.main) fresh.add(it.id);
      S.save(); render(); return;
    }
    const th = e.target.closest('.thumb');
    if (th) { openPhoto(it, +th.dataset.i); return; }
    if (e.target.closest('.txt') || (!it.text && e.target.closest('.body'))) startEdit(row, it);
  });

  function openPhoto(it, i) {
    viewPhotos(it.photos, i, {
      onDelete: (id) => {
        it.photos = it.photos.filter((x) => x !== id);
        S.dropPhotos([{ photos: [id] }]);
        if (!it.text && !it.photos.length) branch.items = branch.items.filter((x) => x !== it);
        S.save();
        render();
        toast('Фото удалено');
      },
    });
  }

  /* swipe */
  let sw = null;
  sheet.addEventListener('pointerdown', (e) => {
    const content = e.target.closest('.content');
    if (!content || e.target.closest('.grip, .check, .mark, textarea')) return;
    sw = { content, row: content.closest('.row'), x: e.clientX, y: e.clientY, dx: 0, lock: null };
  });
  const onMove = (e) => {
    if (!sw) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (!sw.lock && Math.hypot(dx, dy) > 8) sw.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
    if (sw.lock !== 'x') return;
    const w = sw.row.querySelector('.acts').offsetWidth;
    const base = sw.row.classList.contains('swiped') ? -w : 0;
    sw.dx = Math.min(0, Math.max(-w * 1.2, base + dx));
    sw.row.classList.add('dragging');
    sw.content.style.transform = `translateX(${sw.dx}px)`;
  };
  const onUp = () => {
    if (!sw) return;
    if (sw.lock === 'x') {
      const w = sw.row.querySelector('.acts').offsetWidth;
      sw.row.classList.remove('dragging');
      sw.content.style.transform = '';
      closeSwipes(sw.row);
      sw.row.classList.toggle('swiped', sw.dx < -w * 0.4);
      lastSwipe = Date.now();
    }
    sw = null;
  };
  const onCancel = () => { if (sw) { sw.row.classList.remove('dragging'); sw.content.style.transform = ''; } sw = null; };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);

  /* reorder */
  let sortable = null;
  if (window.Sortable) {
    sortable = window.Sortable.create(elAct, {
      handle: '.grip', animation: 180, forceFallback: true, fallbackTolerance: 3,
      ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen',
      onStart: () => closeSwipes(),
      onEnd: () => {
        const order = [...elAct.children].map((li) => li.dataset.id);
        const act = order.map(find).filter(Boolean);
        branch.items = [...act, ...branch.items.filter((i) => i.done)];
        S.save();
        requestAnimationFrame(drawFrames);
      },
    });
  }

  /* composer */
  const form = $('.composer');
  const input = form.querySelector('textarea');
  input.addEventListener('input', () => autosize(input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  const pending = [];
  const addBtn = form.querySelector('.addph');
  const redrawPending = pendingStrip(form.querySelector('.pending'), pending);
  addBtn.addEventListener('click', () => addPending(pending, redrawPending, addBtn).then((n) => { if (n) input.focus(); }));
  let sending = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = input.value.trim();
    if ((!t && !pending.length) || sending) return;
    sending = true;
    let ids = [];
    try { ids = await storePhotos(pending.splice(0)); } catch (err) { console.error(err); toast('Не удалось сохранить фото'); }
    sending = false;
    redrawPending();
    if (!t && !ids.length) return;
    branch.items.push(S.newItem(t, ids));
    S.save();
    input.value = '';
    autosize(input);
    render();
    requestAnimationFrame(() => {
      const last = elAct.lastElementChild;
      if (last) sheet.scrollTo({ top: last.offsetTop - 60, behavior: 'smooth' });
    });
  });

  /* header */
  function close() {
    document.activeElement?.blur?.();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    ro?.disconnect();
    sortable?.destroy();
    discardPending(pending);
    panel.classList.remove('in');
    setTimeout(() => panel.remove(), 400);
    onClose?.();
  }
  $('.back').addEventListener('click', close);
  $('.more')?.addEventListener('click', async () => {
    const res = await branchMenu(bubble, branch);
    if (res === 'deleted') close();
    else if (res === 'renamed') render();
  });

  render();
  if (focusId) {
    const row = sheet.querySelector(`.row[data-id="${focusId}"]`);
    if (row) {
      requestAnimationFrame(() => {
        const y = row.getBoundingClientRect().top - sheet.getBoundingClientRect().top + sheet.scrollTop;
        sheet.scrollTo({ top: Math.max(0, y - sheet.clientHeight / 3) });
      });
      row.classList.add('flash');
      setTimeout(() => row.classList.remove('flash'), 2200);
    }
  }
  return { close, render };
}
