// Фото и скриншоты: выбор из галереи / камеры, сжатие, миниатюры, просмотр на весь экран.
import * as S from './store.js';

export const ICON_PHOTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="15" rx="3.5"/><circle cx="12" cy="12.5" r="3.6"/><path d="M8.5 5 10 3h4l1.5 2"/></svg>';
const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';

const MAX_SIDE = 1600;   // длинная сторона после сжатия, px
const QUALITY = 0.82;    // JPEG

/**
 * Открыть выбор фото (iOS сам предложит «Медиатеку», «Снять фото», «Файлы»).
 * Вызывать прямо из обработчика нажатия. Вернёт File[] (пустой, если ничего не выбрали).
 */
export function pickPhotos({ accept = 'image/*', multiple = true } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.multiple = multiple;
    input.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(input);
    const done = (files) => { input.remove(); resolve(files); };
    input.addEventListener('change', () => done([...(input.files || [])]), { once: true });
    input.addEventListener('cancel', () => done([]), { once: true });
    input.click();
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось прочитать картинку'));
    img.src = src;
  });
}

/** Уменьшить до MAX_SIDE и пережать в JPEG. Скриншот ~3 МБ → ~200–400 КБ. */
export async function compress(file) {
  const src = URL.createObjectURL(file);
  try {
    const img = await loadImage(src);
    const w0 = img.naturalWidth, h0 = img.naturalHeight;
    const k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; // прозрачные PNG — на белом
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', QUALITY));
    c.width = c.height = 0; // iOS: освободить память холста сразу
    if (!blob) throw new Error('Не удалось сжать картинку');
    return blob;
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** Сжать выбранные файлы; вернёт [{id, blob, url}] — пока только в памяти. */
export async function preparePhotos(files) {
  const out = [];
  for (const f of files) {
    try {
      const blob = await compress(f);
      out.push({ id: S.uid(), blob, url: URL.createObjectURL(blob) });
    } catch (e) { console.warn(e); }
  }
  return out;
}

/** Сохранить подготовленные фото в хранилище; вернёт их id. */
export async function storePhotos(prepared) {
  const ids = [];
  for (const p of prepared) {
    await S.putPhoto(p.id, p.blob);
    URL.revokeObjectURL(p.url);
    ids.push(p.id);
  }
  return ids;
}

/** Разметка миниатюр записи; картинки подставляет hydrate(). */
export const thumbsHTML = (ids) => ids?.length
  ? `<div class="thumbs">${ids.map((id, i) => `<button type="button" class="thumb" data-ph="${id}" data-i="${i}" aria-label="Фото ${i + 1}"><img alt="" data-src="${id}"></button>`).join('')}</div>`
  : '';

/** Подставить адреса картинок во все <img data-src> внутри root. */
export function hydrate(root) {
  root.querySelectorAll('img[data-src]').forEach(async (img) => {
    const id = img.dataset.src;
    img.removeAttribute('data-src');
    const url = await S.photoURL(id);
    if (url) img.src = url; else img.closest('.thumb')?.classList.add('lost');
  });
}

/**
 * Просмотр фото на весь экран: листать вбок, закрыть крестиком или тапом.
 * onDelete(id) — если задан, есть кнопка «Удалить фото».
 */
export function viewPhotos(ids, start = 0, { onDelete } = {}) {
  let list = [...ids];
  const ov = document.createElement('div');
  ov.className = 'viewer';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-label', 'Фото');
  ov.innerHTML = `
    <div class="v-top">
      <span class="v-count"></span>
      <button type="button" class="v-close round" aria-label="Закрыть">${ICON_CLOSE}</button>
    </div>
    <div class="v-track"></div>
    ${onDelete ? '<div class="v-bot"><button type="button" class="v-del">Удалить фото</button></div>' : ''}`;
  document.body.appendChild(ov);
  const track = ov.querySelector('.v-track');
  const count = ov.querySelector('.v-count');

  const draw = () => {
    track.innerHTML = list.map((id) => `<div class="v-slide"><img alt="" data-src="${id}"></div>`).join('');
    hydrate(track);
  };
  const cur = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
  const label = () => { count.textContent = list.length > 1 ? `${cur() + 1} из ${list.length}` : ''; };
  draw();
  requestAnimationFrame(() => {
    track.scrollLeft = start * track.clientWidth;
    label();
    ov.classList.add('in');
  });
  track.addEventListener('scroll', label, { passive: true });

  const close = () => { ov.classList.remove('in'); setTimeout(() => ov.remove(), 250); };
  ov.querySelector('.v-close').addEventListener('click', close);
  track.addEventListener('click', (e) => { if (!e.target.closest('img')) close(); });
  ov.querySelector('.v-del')?.addEventListener('click', () => {
    const i = cur();
    const id = list[i];
    list = list.filter((x) => x !== id);
    onDelete(id);
    if (!list.length) { close(); return; }
    draw();
    track.scrollLeft = Math.min(i, list.length - 1) * track.clientWidth;
    label();
  });
  return { close };
}

/** Полоска выбранных, но ещё не сохранённых фото (с крестиком «убрать»). */
export function pendingStrip(el, pending, onChange) {
  const draw = () => {
    el.hidden = pending.length === 0;
    el.innerHTML = pending.map((p, i) => `<div class="pend"><img alt="" src="${p.url}"><button type="button" class="pend-x" data-i="${i}" aria-label="Убрать фото">${ICON_CLOSE}</button></div>`).join('');
  };
  el.addEventListener('click', (e) => {
    const x = e.target.closest('.pend-x');
    if (!x) return;
    const [p] = pending.splice(+x.dataset.i, 1);
    URL.revokeObjectURL(p.url);
    draw();
    onChange?.();
  });
  draw();
  return draw;
}

/** Выбрать и сжать фото, добавить в pending. Возвращает число добавленных. */
export async function addPending(pending, redraw, btn) {
  const files = await pickPhotos();
  if (!files.length) return 0;
  btn?.classList.add('busy');
  try {
    const ready = await preparePhotos(files);
    pending.push(...ready);
    redraw();
    return ready.length;
  } finally {
    btn?.classList.remove('busy');
  }
}

export const discardPending = (pending) => { pending.forEach((p) => URL.revokeObjectURL(p.url)); pending.length = 0; };
