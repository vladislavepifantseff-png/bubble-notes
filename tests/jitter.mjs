// Замер плавности пузырей. Запуск: node jitter.mjs <папка> [60|120] [rest|drag]
//   rest — пузыри разлетаются после загрузки; drag — пузырь «A» таскают сквозь остальные.
// Метрики (меньше — лучше): рывок положения (px), рывок формы (‰), «вздрагивания» формы
// (сжался-разжался подряд), «замирания» (кадр без движения посреди движения), наложение пузырей.
// Ориентиры на 2026-11-17 (drag, 60 Гц): рывок формы ≈3–5‰, вздрагиваний 8–35, замираний 0, наложение 0.
import { launch, seed, sleep } from './lib.mjs';

const [OUT = '.', HZ = '60', MODE = 'drag'] = process.argv.slice(2);
const { browser, page } = await launch(OUT, { hz: +HZ });
await seed(page, (h) => [{ id: h.id(), name: 'Проекты', bubbles: [
  h.bubble('Входящие', [h.br('Разное', h.many(3, 'x').map(h.it), true)], true),
  ...[['A', 20], ['B', 12], ['C', 8], ['D', 5], ['E', 3], ['F', 1]].map(([n, c]) => h.bubble(n, [h.br('Разное', h.many(c, 'x').map(h.it), true)])),
] }]);
await sleep(MODE === 'drag' ? 1500 : 200);

const rec = page.evaluate((N) => new Promise((resolve) => {
  const frames = [];
  const grab = () => {
    frames.push([...document.querySelectorAll('.b')].map((el) => { const m = new DOMMatrix(el.style.transform); return [m.e, m.f, m.a, m.d, m.b]; }));
    if (frames.length < N) requestAnimationFrame(grab); else resolve(frames);
  };
  requestAnimationFrame(grab);
}), 300);
if (MODE === 'drag') {
  const p = await page.evaluate(() => { const r = [...document.querySelectorAll('.b')].find((b) => b.querySelector('b').textContent === 'A').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.touchscreen.touchStart(p.x, p.y);
  for (let i = 1; i <= 60; i++) { await page.touchscreen.touchMove(p.x + Math.sin(i / 9) * 120, p.y + Math.cos(i / 11) * 160 - 80); await sleep(20); }
  await page.touchscreen.touchEnd();
}
const res = await rec;

let pj = 0, sj = 0, n = 0, flips = 0, stalls = 0, moving = 0;
for (let i = 2; i < res.length; i++) for (let k = 0; k < res[i].length; k++) {
  const q = (f, c) => res[f][k][c];
  pj += Math.hypot(q(i, 0) - 2 * q(i - 1, 0) + q(i - 2, 0), q(i, 1) - 2 * q(i - 1, 1) + q(i - 2, 1));
  sj += [2, 3, 4].reduce((s, c) => s + Math.abs(q(i, c) - 2 * q(i - 1, c) + q(i - 2, c)), 0);
  n++;
  const d1 = q(i, 2) - q(i - 1, 2), d0 = q(i - 1, 2) - q(i - 2, 2);
  if (Math.abs(d1) > 0.002 && Math.abs(d0) > 0.002 && Math.sign(d1) !== Math.sign(d0)) flips++;
  const v1 = Math.hypot(q(i, 0) - q(i - 1, 0), q(i, 1) - q(i - 1, 1)), v0 = Math.hypot(q(i - 1, 0) - q(i - 2, 0), q(i - 1, 1) - q(i - 2, 1));
  if (v0 > 0.15) { moving++; if (v1 < 0.02) stalls++; }
}
const overlap = await page.evaluate(() => {
  const r = [...document.querySelectorAll('.b')].map((el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: Math.min(b.width, b.height) / 2 }; });
  let w = 0;
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) w = Math.max(w, r[i].r + r[j].r - Math.hypot(r[i].x - r[j].x, r[i].y - r[j].y));
  return w;
});
await page.screenshot({ path: `${OUT}/jitter-${MODE}-${HZ}.png` });
console.log(`[${MODE}, ${HZ} Гц] рывок положения ${(pj / n).toFixed(3)} px · рывок формы ${(sj / n * 1000).toFixed(2)}‰ · вздрагиваний ${flips} · замираний ${stalls}/${moving} · наложение ${overlap.toFixed(1)} px`);
await browser.close();
