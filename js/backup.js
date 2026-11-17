// Резервная копия: всё (пространства, пузыри, записи, фото) — в один файл .json и обратно.
import * as S from './store.js';

const FORMAT = 'bubble-notes-backup';

const toDataURL = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

/** Собрать файл копии. */
export async function buildBackup() {
  const ids = [...new Set(S.allItems().flatMap(({ it }) => it.photos || []))];
  const photos = {};
  for (const id of ids) {
    const blob = await S.getPhoto(id).catch(() => null);
    if (blob) photos[id] = await toDataURL(blob);
  }
  const data = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), state: { ...S.state, lastExport: undefined }, photos };
  const day = new Date().toLocaleDateString('sv-SE'); // 2026-11-17
  return new File([JSON.stringify(data)], `bubble-notes-${day}.json`, { type: 'application/json' });
}

/**
 * Сохранить копию: на iPhone — через «Поделиться» (→ «Сохранить в Файлы», AirDrop, почта…),
 * иначе — обычной загрузкой. Возвращает 'shared' | 'downloaded' | 'cancelled'.
 */
export async function exportData() {
  const file = await buildBackup();
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Заметки Бабл — копия' });
      return mark('shared');
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
      console.warn('share failed, fallback to download', e);
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return mark('downloaded');
}
function mark(res) {
  S.state.lastExport = Date.now();
  S.save(true);
  return res;
}

/** Разобрать и проверить файл копии. Бросает ошибку с понятным текстом. */
export async function readBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('Это не файл копии Заметок Бабл'); }
  const st = data?.state;
  if (data?.format !== FORMAT || !Array.isArray(st?.spaces) || !st.spaces.length) throw new Error('Это не файл копии Заметок Бабл');
  for (const sp of st.spaces) {
    if (!sp.id || !Array.isArray(sp.bubbles)) throw new Error('Файл копии повреждён');
    for (const b of sp.bubbles) {
      if (!b.id || !Array.isArray(b.branches)) throw new Error('Файл копии повреждён');
      for (const br of b.branches) if (!br.id || !Array.isArray(br.items)) throw new Error('Файл копии повреждён');
    }
  }
  const counts = {
    spaces: st.spaces.length,
    bubbles: st.spaces.reduce((n, s) => n + s.bubbles.filter((b) => !b.inbox).length, 0),
    items: st.spaces.reduce((n, s) => n + S.itemsOf(s.bubbles).length, 0),
    photos: Object.keys(data.photos || {}).length,
    date: data.exportedAt ? new Date(data.exportedAt) : null,
  };
  return { data, counts };
}

/** Заменить все данные на содержимое копии. После — перезапуск приложения. */
export async function restore(data) {
  const blobs = [];
  for (const [id, url] of Object.entries(data.photos || {})) {
    try { blobs.push([id, await (await fetch(url)).blob()]); } catch { /* битое фото пропускаем */ }
  }
  await S.clearPhotos();
  for (const [id, blob] of blobs) await S.putPhoto(id, blob);
  const st = data.state;
  if (!st.spaces.some((s) => s.id === st.currentSpace)) st.currentSpace = st.spaces[0].id;
  S.replaceState(st);
  await S.save(true);
}
