// Все данные живут только в телефоне: IndexedDB (запасной вариант — localStorage).
// Фото — отдельным хранилищем 'photos' (ключ = id фото, значение = Blob JPEG), в записи — только список id.
const DB_NAME = 'bubble-notes';
const STORE = 'kv';
const PHOTOS = 'photos';
const KEY = 'state';
const LS_KEY = 'bubble-notes-state';

let dbPromise = null;
function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}
async function readRaw() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
  }
}
async function writeRaw(value) {
  const plain = JSON.parse(JSON.stringify(value));
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(plain, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try { localStorage.setItem(LS_KEY, JSON.stringify(plain)); } catch (e) { console.error('Не удалось сохранить', e); }
  }
}

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);

export const newBranch = (name, misc = false) => ({ id: uid(), name, misc, items: [] });
export const newBubble = (name, { inbox = false } = {}) => ({ id: uid(), name, inbox, archived: false, createdAt: Date.now(), branches: [newBranch('Разное', true)] });
export const newSpace = (name) => ({ id: uid(), name, bubbles: [newBubble('Входящие', { inbox: true })] });
export const newItem = (text, photos = []) => ({ id: uid(), text, photos, done: false, main: false, createdAt: Date.now(), doneAt: null });

export let state = null;

export async function load() {
  state = await readRaw();
  if (!state || !Array.isArray(state.spaces) || !state.spaces.length) {
    const first = newSpace('Проекты');
    state = { version: 1, spaces: [first], currentSpace: first.id };
    await writeRaw(state);
  }
  try { navigator.storage?.persist?.(); } catch { /* not critical */ }
  setTimeout(() => gcPhotos().catch(() => {}), 3000);
  return state;
}

/** Подменить все данные (восстановление из копии). */
export function replaceState(st) { clearTimeout(timer); state = st; }

let timer = null;
export function save(now = false) {
  clearTimeout(timer);
  if (now) return writeRaw(state);
  timer = setTimeout(() => writeRaw(state), 200);
}

export const space = () => state.spaces.find((s) => s.id === state.currentSpace) || state.spaces[0];
export const activeCount = (b) => b.branches.reduce((n, br) => n + br.items.filter((i) => !i.done).length, 0);
export const totalCount = (b) => b.branches.reduce((n, br) => n + br.items.length, 0);
export const inboxOf = (sp) => sp.bubbles.find((b) => b.inbox);
export const miscOf = (b) => b.branches.find((br) => br.misc) || b.branches[0];
export function findBubble(id) {
  for (const sp of state.spaces) {
    const bubble = sp.bubbles.find((b) => b.id === id);
    if (bubble) return { space: sp, bubble };
  }
  return null;
}

/* ---------- фото ---------- */
async function photoTx(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTOS, mode);
    const out = fn(tx.objectStore(PHOTOS));
    tx.oncomplete = () => resolve(out?.result ?? out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export const putPhoto = (id, blob) => photoTx('readwrite', (st) => { st.put(blob, id); });
export const getPhoto = (id) => photoTx('readonly', (st) => st.get(id));
export const photoKeys = () => photoTx('readonly', (st) => st.getAllKeys());
export const clearPhotos = () => photoTx('readwrite', (st) => { st.clear(); });

const urls = new Map();
/** Адрес картинки для <img> (создаётся один раз на фото). */
export async function photoURL(id) {
  if (urls.has(id)) return urls.get(id);
  const blob = await getPhoto(id).catch(() => null);
  const url = blob ? URL.createObjectURL(blob) : '';
  urls.set(id, url);
  return url;
}

/** Удалить фото этих записей из хранилища. */
export function dropPhotos(items) {
  const ids = items.flatMap((i) => i.photos || []);
  if (!ids.length) return;
  for (const id of ids) { if (urls.get(id)) URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  photoTx('readwrite', (st) => ids.forEach((id) => st.delete(id))).catch(() => {});
}
export const itemsOf = (bubbles) => bubbles.flatMap((b) => b.branches.flatMap((br) => br.items));

/** Подчистить фото, на которые больше не ссылается ни одна запись. */
export async function gcPhotos() {
  const used = new Set(itemsOf(state.spaces.flatMap((s) => s.bubbles)).flatMap((i) => i.photos || []));
  const keys = await photoKeys();
  const stale = keys.filter((k) => !used.has(k));
  if (stale.length) await photoTx('readwrite', (st) => stale.forEach((k) => st.delete(k)));
  return stale.length;
}

/** Все записи всех пространств с их местом — для поиска. */
export function allItems() {
  const out = [];
  for (const sp of state.spaces) for (const b of sp.bubbles) for (const br of b.branches) for (const it of br.items) out.push({ sp, b, br, it });
  return out;
}
