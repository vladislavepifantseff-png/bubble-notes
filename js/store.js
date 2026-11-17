// Все данные живут только в телефоне: IndexedDB (запасной вариант — localStorage).
const DB_NAME = 'bubble-notes';
const STORE = 'kv';
const KEY = 'state';
const LS_KEY = 'bubble-notes-state';

let dbPromise = null;
function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
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
export const newItem = (text) => ({ id: uid(), text, done: false, main: false, createdAt: Date.now(), doneAt: null });

export let state = null;

export async function load() {
  state = await readRaw();
  if (!state || !Array.isArray(state.spaces) || !state.spaces.length) {
    const first = newSpace('Проекты');
    state = { version: 1, spaces: [first], currentSpace: first.id };
    await writeRaw(state);
  }
  try { navigator.storage?.persist?.(); } catch { /* not critical */ }
  return state;
}

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
