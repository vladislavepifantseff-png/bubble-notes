// Архив: пузыри текущего пространства, убранные с главного экрана. Вернуть или удалить навсегда.
import * as S from './store.js';
import { actionSheet, confirmSheet, toast } from './ui.js';
import { esc, zap } from './util.js';

const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>';
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '');

export function openArchive({ onClose }) {
  const sp = S.space();
  const panel = document.createElement('section');
  panel.className = 'panel pond';
  panel.setAttribute('aria-label', 'Архив');
  panel.innerHTML = `
    <div class="p-head">
      <div class="p-top"><button class="pill glass back" type="button">${ICON_BACK}<span>${esc(sp.name)}</span></button></div>
      <h2 class="p-title">Архив</h2>
      <div class="p-sub"></div>
    </div>
    <div class="sheet"><div class="grab"></div><ul class="list arch"></ul><p class="empty" hidden>В архиве пусто.</p></div>`;
  document.body.appendChild(panel);
  requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('in')));
  const $ = (s) => panel.querySelector(s);
  let changed = false;

  const archived = () => sp.bubbles.filter((b) => b.archived).sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
  function render() {
    const list = archived();
    $('.p-sub').textContent = `Пространство «${sp.name}» · тап по пузырю — вернуть или удалить`;
    $('.empty').hidden = list.length > 0;
    $('.arch').innerHTML = list.map((b) => {
      const all = S.totalCount(b), done = all - S.activeCount(b);
      return `<li><button type="button" class="arow" data-b="${b.id}">
        <span class="adot" aria-hidden="true"></span>
        <span class="atext"><b>${esc(b.name)}</b><small>${zap(all)}${done ? ` · выполнено ${done}` : ''}${b.archivedAt ? ` · в архиве с ${fmtDate(b.archivedAt)}` : ''}</small></span>
      </button></li>`;
    }).join('');
  }

  $('.arch').addEventListener('click', async (e) => {
    const row = e.target.closest('.arow');
    const b = row && sp.bubbles.find((x) => x.id === row.dataset.b);
    if (!b) return;
    const v = await actionSheet(`«${b.name}»`, [
      { label: 'Вернуть на главный экран', value: 'restore' },
      { label: 'Удалить навсегда', value: 'delete', danger: true },
    ]);
    if (v === 'restore') {
      b.archived = false;
      delete b.archivedAt;
      changed = true;
      S.save(); render();
      toast(`«${b.name}» снова на главном экране`);
    } else if (v === 'delete') {
      const n = S.totalCount(b);
      if (!(await confirmSheet(n ? `Удалить «${b.name}» и ${zap(n)} навсегда?` : `Удалить «${b.name}» навсегда?`, 'Удалить'))) return;
      S.dropPhotos(S.itemsOf([b]));
      sp.bubbles = sp.bubbles.filter((x) => x !== b);
      changed = true;
      S.save(); render();
      toast('Пузырь удалён');
    }
  });

  function close() {
    panel.classList.remove('in');
    setTimeout(() => panel.remove(), 400);
    onClose?.(changed);
  }
  $('.back').addEventListener('click', close);
  render();
  return { close };
}
