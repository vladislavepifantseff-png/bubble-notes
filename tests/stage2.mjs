// Этап 2: фото, архив, поиск, резервная копия. Запуск: node stage2.mjs <папка-для-скриншотов>
import fs from 'node:fs';
import { launch, seed, sleep, tap, sheet, check, failures } from './lib.mjs';

const OUT = process.argv[2] || '.';
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch(OUT);

// «Поделиться» в headless нет — подменяем: запоминаем отданный файл
await page.evaluateOnNewDocument(() => {
  navigator.canShare = () => true;
  navigator.share = async ({ files }) => { window.__shared = { name: files[0].name, text: await files[0].text() }; };
});

await seed(page, (h) => [
  { id: h.id(), name: 'Проекты', bubbles: [
    h.bubble('Входящие', [h.br('Разное', [], true)], true),
    h.bubble('Ремонт', [h.br('Разное', [h.it('Плитка в ванную'), h.it('Купить ёлку')], true)]),
    h.bubble('Подкаст', [h.br('Разное', [], true), h.br('Гости', [h.it('Позвать плиточника')])]),
  ] },
]);
await sleep(2000);

// тестовые картинки: большой «скриншот» 3000×2000 и маленькая 300×300
const mk = (w, h, color) => page.evaluate((w, h, color) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(w / 4, h / 4, w / 2, h / 2);
  return c.toDataURL('image/png').split(',')[1];
}, w, h, color);
const BIG = `${OUT}/big.png`, SMALL = `${OUT}/small.png`;
fs.writeFileSync(BIG, Buffer.from(await mk(3000, 2000, '#c33'), 'base64'));
fs.writeFileSync(SMALL, Buffer.from(await mk(300, 300, '#36c'), 'base64'));

async function choose(sel, files, text) {
  const [ch] = await Promise.all([page.waitForFileChooser({ timeout: 4000 }), tap(page, sel, text)]);
  await ch.accept(files);
  await sleep(900);
}
const photoInfo = () => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('bubble-notes');
  r.onsuccess = async () => {
    const st = r.result.transaction('photos').objectStore('photos');
    const keys = await new Promise((ok) => { const q = st.getAllKeys(); q.onsuccess = () => ok(q.result); });
    const vals = await new Promise((ok) => { const q = r.result.transaction('photos').objectStore('photos').getAll(); q.onsuccess = () => ok(q.result); });
    const dims = [];
    for (const b of vals) { const bm = await createImageBitmap(b); dims.push([b.type, bm.width, bm.height, b.size]); }
    res({ keys, dims });
  };
}));
const state = () => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('bubble-notes');
  r.onsuccess = () => { const q = r.result.transaction('kv').objectStore('kv').get('state'); q.onsuccess = () => res(q.result); };
}));
const items = (st) => st.spaces.flatMap((s) => s.bubbles.flatMap((b) => b.branches.flatMap((br) => br.items.map((i) => ({ ...i, bubble: b.name, branch: br.name })))));

/* ---------- 1. Фото в ветке ---------- */
await tap(page, '.b', 'Ремонт'); await sleep(1500);
await tap(page, '.node', 'Разное'); await sleep(900);
await choose('.panel .addph', [BIG, SMALL]);
check(await page.$$eval('.panel .pending .pend', (e) => e.length) === 2, 'выбранные фото видны над строкой ввода');
await page.type('.panel .composer textarea', 'Образцы плитки');
await page.screenshot({ path: `${OUT}/s2-1-pending.png` });
await tap(page, '.panel .send'); await sleep(900);
let pi = await photoInfo();
check(pi.keys.length === 2, `фото сохранены в хранилище (${pi.keys.length})`);
check(pi.dims.every(([t, w, h]) => t === 'image/jpeg' && Math.max(w, h) <= 1600), `сжаты в JPEG ≤1600px: ${JSON.stringify(pi.dims)}`);
const loaded = await page.$$eval('.panel .row .thumb img', (imgs) => imgs.map((i) => i.complete && i.naturalWidth > 0));
check(loaded.length === 2 && loaded.every(Boolean), 'миниатюры в записи загрузились');
check(await page.$eval('.panel .composer .pending', (e) => e.hidden), 'после отправки полоска фото очищена');
await page.screenshot({ path: `${OUT}/s2-2-row-photos.png` });

// фото без текста
await choose('.panel .addph', [SMALL]);
await tap(page, '.panel .send'); await sleep(700);
let st = await state();
check(items(st).some((i) => i.text === '' && i.photos?.length === 1), 'запись только из фото (без текста)');

// просмотр и удаление одного фото
await tap(page, '.panel .row .thumb'); await sleep(500);
check(await page.$eval('.viewer .v-count', (e) => e.textContent) === '1 из 2', 'просмотр: «1 из 2»');
await page.screenshot({ path: `${OUT}/s2-3-viewer.png` });
await tap(page, '.viewer .v-del'); await sleep(400);
check(await page.$eval('.viewer .v-count', (e) => e.textContent) === '', 'после удаления осталось одно фото');
await tap(page, '.viewer .v-close'); await sleep(400);
check(await page.$$eval('.panel .row', (r) => r.filter((x) => x.querySelector('.thumb')).map((x) => x.querySelectorAll('.thumb').length).join(',')) === '1,1', 'в записях по одному фото');
pi = await photoInfo();
check(pi.keys.length === 2, `удалённое фото стёрто из хранилища (осталось ${pi.keys.length})`);

/* ---------- 2. Фото в быстрой записи ---------- */
await tap(page, '.panel .back'); await sleep(700);
await tap(page, '#back'); await sleep(900);
await tap(page, '#plus'); await sleep(500);
await choose('.ov.in .addph', [SMALL]);
await page.screenshot({ path: `${OUT}/s2-4-capture.png` });
await tap(page, '.ov.in .sh-btn.ok'); await sleep(800);
st = await state();
check(items(st).some((i) => i.bubble === 'Входящие' && i.photos?.length === 1), 'быстрая запись с фото → во «Входящие»');

/* ---------- 3. Архив ---------- */
await tap(page, '.b', 'Подкаст'); await sleep(1500);
await tap(page, '#more'); await sleep(450);
check((await sheet(page)).includes('В архив'), 'в меню пузыря есть «В архив»');
await tap(page, '.ov.in .sh-btn', 'В архив'); await sleep(1500);
const names = () => page.$$eval('.b:not(.gone) b', (e) => e.map((x) => x.textContent));
check(!(await names()).includes('Подкаст'), 'пузырь пропал с главного экрана');
check((await page.$eval('#meta', (e) => e.textContent)).includes('архив · 1'), 'под вкладками — «архив · 1»');
await page.screenshot({ path: `${OUT}/s2-5-main-archived.png` });
await tap(page, '.meta-arch'); await sleep(700);
check(await page.$$eval('.panel .arow b', (e) => e.map((x) => x.textContent).join()) === 'Подкаст', 'экран архива: «Подкаст»');
await page.screenshot({ path: `${OUT}/s2-6-archive.png` });
await tap(page, '.panel .arow'); await sleep(450);
await tap(page, '.ov.in .sh-btn', 'Вернуть'); await sleep(600);
check(await page.$$eval('.panel .arow', (e) => e.length) === 0, 'вернули — архив пуст');
await tap(page, '.panel .back'); await sleep(1500);
check((await names()).includes('Подкаст'), 'пузырь снова на главном');
// второй вход: через меню пространства
await tap(page, '.tab.on'); await sleep(450);
check((await sheet(page)).includes('Архив') && (await sheet(page)).includes('Резервная копия'), 'меню пространства: «Архив» и «Резервная копия»');
await tap(page, '.ov.in .sh-btn.cancel'); await sleep(450);

/* ---------- 4. Поиск ---------- */
await tap(page, '#search'); await sleep(600);
await page.type('.s-input', 'плит'); await sleep(400);
const hits = () => page.$$eval('.hit', (h) => h.map((x) => x.querySelector('.hit-t').textContent));
let hs = await hits();
check(hs.length === 3 && hs.includes('Позвать плиточника'), `«плит» — 3 записи: ${hs.join(' / ')}`);
check(await page.$$eval('.hit mark', (m) => m.every((x) => x.textContent.toLowerCase() === 'плит')), 'совпадение подсвечено');
await page.screenshot({ path: `${OUT}/s2-7-search.png` });
await page.$eval('.s-input', (e) => { e.value = ''; });
await page.type('.s-input', 'елку'); await sleep(400);
check((await hits()).join() === 'Купить ёлку', '«елку» находит «ёлку»');
await tap(page, '.hit'); await sleep(900);
check(await page.$eval('.panel:last-of-type .p-title', (e) => e.textContent) === 'Разное' && await page.$('.panel .row.flash'), 'тап по результату: ветка открыта, запись подсвечена');
await page.screenshot({ path: `${OUT}/s2-8-search-open.png` });
await tap(page, '.panel:last-of-type .back'); await sleep(700);
check(await page.$$eval('.panel', (p) => p.length) === 1 && await page.$('.panel.search'), '«Назад» возвращает к результатам поиска');
await tap(page, '.panel.search .back'); await sleep(700);

/* ---------- 5. Резервная копия ---------- */
await tap(page, '.tab.on'); await sleep(450);
await tap(page, '.ov.in .sh-btn', 'Резервная копия'); await sleep(450);
await tap(page, '.ov.in .sh-btn', 'Сохранить копию'); await sleep(1500);
const shared = await page.evaluate(() => window.__shared);
const bk = shared && JSON.parse(shared.text);
check(/^bubble-notes-\d{4}-\d\d-\d\d\.json$/.test(shared?.name || ''), `файл копии: ${shared?.name}`);
check(bk?.format === 'bubble-notes-backup' && Object.keys(bk.photos).length === 3 && Object.values(bk.photos).every((u) => u.startsWith('data:image/jpeg')), 'в копии — все записи и 3 фото');
const BK = `${OUT}/backup.json`;
fs.writeFileSync(BK, shared.text);
st = await state();
check(!!st.lastExport, 'дата последней копии запомнена');

// портим данные: удаляем «Ремонт» (с фото)
await tap(page, '.b', 'Ремонт'); await sleep(1500);
await tap(page, '#more'); await sleep(450);
await tap(page, '.ov.in .sh-btn', 'Удалить пузырь'); await sleep(450);
await tap(page, '.ov.in .sh-btn.danger'); await sleep(1200);
pi = await photoInfo();
check(pi.keys.length === 1, `фото удалённого пузыря стёрты (осталось ${pi.keys.length})`);

// восстанавливаем
await tap(page, '.tab.on'); await sleep(450);
await tap(page, '.ov.in .sh-btn', 'Резервная копия'); await sleep(450);
check((await sheet(page)).startsWith('Последняя копия:'), 'в меню копии видна дата последней');
await choose('.ov.in .sh-btn', [BK], 'Восстановить');
check((await sheet(page)).includes('Заменить всё') && (await sheet(page)).includes('фото: 3'), `подтверждение с содержимым копии: ${await sheet(page)}`);
await page.screenshot({ path: `${OUT}/s2-9-restore-confirm.png` });
await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0' }), tap(page, '.ov.in .sh-btn.danger')]);
await sleep(1800);
check((await names()).includes('Ремонт'), 'после восстановления «Ремонт» на месте');
pi = await photoInfo();
check(pi.keys.length === 3, `фото восстановлены (${pi.keys.length})`);

// чужой файл
await tap(page, '.tab.on'); await sleep(450);
await tap(page, '.ov.in .sh-btn', 'Резервная копия'); await sleep(450);
await choose('.ov.in .sh-btn', [SMALL], 'Восстановить');
check(await page.$eval('.toast', (t) => t.textContent) === 'Это не файл копии Заметок Бабл', 'не тот файл — понятное сообщение');
await page.screenshot({ path: `${OUT}/s2-10-main.png` });

check(errors.length === 0, `ошибок в консоли нет ${errors.join('; ')}`);
await browser.close();
console.log(failures() ? `\nПровалено: ${failures()}` : '\nВсё прошло');
process.exit(failures() ? 1 : 0);
