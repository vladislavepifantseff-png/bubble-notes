// Поиск по всем записям всех пространств (вместе с архивом и выполненными).
import * as S from './store.js';
import { openList } from './list.js';
import { esc, zap } from './util.js';
import { slideAway } from './ui.js';

const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>';
export const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>';
const ICON_CAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="3.5"/><circle cx="12" cy="13" r="3.4"/></svg>';
const LIMIT = 80;

// без учёта регистра и «ё/е»; длина строки не меняется — индексы совпадают с исходным текстом
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');

/** Кусок текста вокруг совпадения с подсветкой. */
function snippet(text, q) {
  const t = text.replace(/\s+/g, ' ');
  const i = norm(t).indexOf(q);
  if (i < 0) return esc(t);
  const from = i > 48 ? t.lastIndexOf(' ', i - 30) + 1 || i - 30 : 0;
  return (from ? '…' : '') + esc(t.slice(from, i)) + `<mark>${esc(t.slice(i, i + q.length))}</mark>` + esc(t.slice(i + q.length));
}

export function openSearch({ onClose }) {
  const panel = document.createElement('section');
  panel.className = 'panel pond search';
  panel.setAttribute('aria-label', 'Поиск');
  panel.innerHTML = `
    <div class="p-head">
      <div class="p-top s-top">
        <button class="round glass back" type="button" aria-label="Закрыть поиск">${ICON_BACK}</button>
        <label class="s-field glass">${ICON_SEARCH}<input class="s-input" type="search" enterkeyhint="search" autocomplete="off" placeholder="Поиск по всем записям" aria-label="Поиск по всем записям"></label>
      </div>
      <div class="p-sub s-sub"></div>
    </div>
    <div class="sheet"><ul class="list res"></ul><p class="empty"></p></div>`;
  document.body.appendChild(panel);
  requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('in')));
  const $ = (s) => panel.querySelector(s);
  const input = $('.s-input');
  input.focus();

  let found = [];
  function run() {
    const q = norm(input.value.trim());
    const empty = $('.empty');
    if (!q) {
      found = [];
      $('.res').innerHTML = '';
      $('.s-sub').textContent = '';
      empty.hidden = false;
      empty.textContent = `Ищу по тексту записей во всех пространствах — и в архиве. Всего ${zap(S.allItems().length)}.`;
      return;
    }
    const all = S.allItems().filter(({ it }) => norm(it.text || '').includes(q));
    // сначала активные, затем выполненные; внутри — свежие выше
    all.sort((a, b) => (a.it.done - b.it.done) || (b.it.createdAt || 0) - (a.it.createdAt || 0));
    found = all.slice(0, LIMIT);
    $('.s-sub').textContent = all.length ? `Найдено: ${zap(all.length)}${all.length > LIMIT ? ` · показаны первые ${LIMIT}` : ''}` : '';
    empty.hidden = all.length > 0;
    empty.textContent = 'Ничего не нашлось.';
    const multi = S.state.spaces.length > 1;
    $('.res').innerHTML = found.map(({ sp, b, br, it }, i) => {
      const path = [multi ? sp.name : null, b.name, b.inbox ? null : br.name].filter(Boolean).map(esc).join(' › ');
      const tags = [
        it.done ? '<span class="tag">выполнено</span>' : '',
        b.archived ? '<span class="tag">архив</span>' : '',
        it.photos?.length ? `<span class="tag ph">${ICON_CAM}${it.photos.length}</span>` : '',
      ].join('');
      return `<li><button type="button" class="hit${it.done ? ' is-done' : ''}" data-i="${i}">
        <span class="hit-t">${snippet(it.text, q)}</span>
        <span class="hit-p">${path}${tags}</span>
      </button></li>`;
    }).join('');
  }
  let t = null;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 120); });
  panel.querySelector('.p-head').addEventListener('submit', (e) => e.preventDefault());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });

  $('.res').addEventListener('click', (e) => {
    const hit = e.target.closest('.hit');
    const f = hit && found[+hit.dataset.i];
    if (!f) return;
    input.blur();
    openList({
      bubble: f.b, branch: f.br, backLabel: 'Поиск', focusId: f.it.id,
      onClose: () => run(), // запись могли изменить — обновить результаты
    });
  });

  function close() {
    clearTimeout(t);
    slideAway(panel);
    onClose?.();
  }
  $('.back').addEventListener('click', close);
  run();
  return { close };
}
