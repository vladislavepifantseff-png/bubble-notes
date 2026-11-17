import { esc, autosize } from './util.js';

function mount(inner, cls = '') {
  const ov = document.createElement('div');
  ov.className = `ov ${cls}`;
  ov.innerHTML = `<div class="ov-bg"></div><div class="sh" role="dialog" aria-modal="true">${inner}</div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(() => requestAnimationFrame(() => ov.classList.add('in')));
  return ov;
}
function unmount(ov) {
  document.activeElement?.blur?.();
  ov.classList.remove('in');
  setTimeout(() => ov.remove(), 320);
}

export function actionSheet(title, actions) {
  return new Promise((resolve) => {
    const ov = mount(
      `${title ? `<div class="sh-title">${esc(title)}</div>` : ''}
       <div class="sh-actions">${actions.map((a, i) => `<button class="sh-btn${a.danger ? ' danger' : ''}" data-i="${i}" type="button">${esc(a.label)}</button>`).join('')}</div>
       <button class="sh-btn cancel" type="button">Отмена</button>`
    );
    ov.addEventListener('click', (e) => {
      const btn = e.target.closest('.sh-btn');
      if (e.target.classList.contains('ov-bg') || btn?.classList.contains('cancel')) { unmount(ov); resolve(null); return; }
      if (btn) { unmount(ov); resolve(actions[+btn.dataset.i].value); }
    });
  });
}

export async function confirmSheet(title, okLabel) {
  return (await actionSheet(title, [{ label: okLabel, value: true, danger: true }])) === true;
}

export function textSheet({ title, value = '', placeholder = '', ok = 'Готово' }) {
  return new Promise((resolve) => {
    const ov = mount(
      `<div class="sh-title">${esc(title)}</div>
       <form class="sh-form" style="display:grid;gap:10px">
         <input class="sh-input" type="text" enterkeyhint="done" autocomplete="off" placeholder="${esc(placeholder)}" value="${esc(value)}">
         <div class="sh-row"><button class="sh-btn cancel" type="button">Отмена</button><button class="sh-btn ok" type="submit">${esc(ok)}</button></div>
       </form>`
    );
    const input = ov.querySelector('input');
    input.focus();
    input.select();
    const done = (v) => { unmount(ov); resolve(v); };
    ov.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      done(v || null);
    });
    ov.addEventListener('click', (e) => {
      if (e.target.classList.contains('ov-bg') || e.target.closest('.cancel')) done(null);
    });
  });
}

/** Быстрая запись идеи: текст + (необязательно) пузырь и ветка. */
export function captureSheet({ bubbles, bubbleId = null, branchesOf }) {
  return new Promise((resolve) => {
    let selB = bubbleId;
    let selBr = null;
    const ov = mount(
      `<form class="cap" style="display:grid;gap:10px">
         <textarea rows="3" placeholder="Что пришло в голову?" aria-label="Текст идеи"></textarea>
         <div class="chips" data-k="b"></div>
         <div class="chips sub" data-k="br"></div>
         <div class="cap-note"></div>
         <div class="sh-row"><button class="sh-btn cancel" type="button">Отмена</button><button class="sh-btn ok" type="submit">Записать</button></div>
       </form>`
    );
    const ta = ov.querySelector('textarea');
    const rowB = ov.querySelector('[data-k="b"]');
    const rowBr = ov.querySelector('[data-k="br"]');
    const note = ov.querySelector('.cap-note');
    ta.focus();
    ta.addEventListener('input', () => autosize(ta));

    const draw = () => {
      rowB.innerHTML = bubbles.map((b) => `<button type="button" class="chip${b.id === selB ? ' on' : ''}" data-b="${b.id}">${esc(b.name)}</button>`).join('');
      rowB.hidden = bubbles.length === 0;
      const brs = selB ? branchesOf(selB) : [];
      rowBr.hidden = brs.length < 2;
      rowBr.innerHTML = brs.map((br) => `<button type="button" class="chip${br.id === selBr ? ' on' : ''}" data-br="${br.id}">${esc(br.name)}</button>`).join('');
      if (!selB) note.textContent = bubbles.length ? 'Пузырь можно не выбирать: тогда запись попадёт во «Входящие».' : 'Запись попадёт во «Входящие».';
      else if (!selBr) note.textContent = brs.length > 1 ? 'Без ветки — в «Разное».' : '';
      else note.textContent = '';
    };
    draw();

    ov.addEventListener('click', (e) => {
      if (e.target.classList.contains('ov-bg') || e.target.closest('.cancel')) { unmount(ov); resolve(null); return; }
      const cb = e.target.closest('[data-b]');
      if (cb) { selB = selB === cb.dataset.b ? null : cb.dataset.b; selBr = null; draw(); return; }
      const cbr = e.target.closest('[data-br]');
      if (cbr) { selBr = selBr === cbr.dataset.br ? null : cbr.dataset.br; draw(); }
    });
    ov.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      unmount(ov);
      resolve({ text, bubbleId: selB, branchId: selBr });
    });
  });
}

let toastEl = null, toastTimer = null;
export function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  requestAnimationFrame(() => toastEl.classList.add('in'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('in'), 2200);
}
