// Общие помощники для проверок в headless Chrome (эмуляция iPhone 390×844).
import puppeteer from 'puppeteer-core';

export const URL = process.env.APP_URL || 'http://localhost:8765/index.html';
export const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Запуск браузера. hz=120 — имитация экрана 120 Гц (два кадра на каждый реальный). */
export async function launch(out, { hz = 60, notch = true } = {}) {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'],
    userDataDir: `${out}/profile-${Date.now()}`,
  });
  const page = await browser.newPage();
  await page.emulate({
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  // «чёлка» iPhone: безопасная зона сверху 59px
  if (notch) await page.evaluateOnNewDocument(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.style.setProperty('--safe-t', '59px')));
  if (hz === 120) await page.evaluateOnNewDocument(() => {
    let t = 0, q = [], sched = false, inTick = false;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => { q.push(cb); if (!sched && !inTick) { sched = true; raf(tick); } return 1; };
    function tick() {
      sched = false; inTick = true;
      for (let k = 0; k < 2; k++) { const run = q; q = []; t += 1000 / 120; run.forEach((cb) => cb(t)); }
      inTick = false;
      if (q.length && !sched) { sched = true; raf(tick); }
    }
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  return { browser, page, errors };
}

/** Записать состояние в IndexedDB и перезагрузить. build(h) получает помощники id/it/br/bubble. */
export async function seed(page, build) {
  await page.evaluate(async (src) => {
    const id = () => Math.random().toString(36).slice(2, 10);
    const h = {
      id,
      it: (text) => ({ id: id(), text, done: false, main: false, createdAt: Date.now(), doneAt: null }),
      many: (n, p) => Array.from({ length: n }, (_, i) => `${p} ${i + 1}`),
      br: (name, items, misc = false) => ({ id: id(), name, misc, items }),
      bubble: (name, branches, inbox = false) => ({ id: id(), name, inbox, archived: false, createdAt: Date.now(), branches }),
    };
    // eslint-disable-next-line no-new-func
    const spaces = new Function('h', `return (${src})(h)`)(h);
    const state = { version: 1, spaces, currentSpace: spaces[0].id };
    await new Promise((res, rej) => {
      const r = indexedDB.open('bubble-notes', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => { const tx = r.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put(state, 'state'); tx.oncomplete = res; tx.onerror = rej; };
    });
  }, build.toString());
  await page.reload({ waitUntil: 'networkidle0' });
}

/** Центр первого видимого элемента sel (с текстом text, если задан). */
export const center = (page, sel, text) => page.evaluate((sel, text) => {
  const el = [...document.querySelectorAll(sel)].find((e) => (!text || e.textContent.includes(text)) && e.getBoundingClientRect().width > 0);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, sel, text);

export async function tap(page, sel, text) {
  const p = await center(page, sel, text);
  if (!p) throw new Error(`не найдено: ${sel} ${text || ''}`);
  await page.touchscreen.tap(p.x, p.y);
}

/** Свайп строки записи влево (открывает «Перенести / Удалить»). */
export async function swipeRow(page, text) {
  const p = await center(page, '.list.open-list .row', text);
  if (!p) throw new Error(`нет записи: ${text}`);
  await page.touchscreen.touchStart(p.x + 100, p.y);
  for (let i = 1; i <= 12; i++) { await page.touchscreen.touchMove(p.x + 100 - i * 18, p.y); await sleep(16); }
  await page.touchscreen.touchEnd();
  await sleep(400);
}

/** Текст открытой шторки: «заголовок | кнопка | кнопка…». */
export const sheet = (page) => page.evaluate(() => [...document.querySelectorAll('.ov.in .sh-title, .ov.in .sh-btn')].map((b) => b.textContent).join(' | '));

/** Состояние из IndexedDB в виде строк «Пространство: Пузырь[Ветка(записи) …] …». */
export const dump = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('bubble-notes', 1);
  r.onsuccess = () => {
    const q = r.result.transaction('kv').objectStore('kv').get('state');
    q.onsuccess = () => res(q.result.spaces.map((s) => `${s.name}: ` + s.bubbles.map((b) => `${b.name}[${b.branches.map((x) => `${x.name}(${x.items.map((i) => i.text).join(',')})`).join(' ')}]`).join(' ')));
  };
}));

let failed = 0;
export function check(ok, label) {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failed++;
}
export const failures = () => failed;
