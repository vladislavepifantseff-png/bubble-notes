// Сценарии: перенос записей и пузырей, уведомление. Запуск: node scenarios.mjs <папка-для-скриншотов>
import { launch, seed, sleep, tap, swipeRow, sheet, dump, check, failures } from './lib.mjs';

const OUT = process.argv[2] || '.';
const { browser, page, errors } = await launch(OUT);
await seed(page, (h) => [
  { id: h.id(), name: 'Проекты', bubbles: [
    h.bubble('Входящие', [h.br('Разное', [h.it('Мысль из входящих'), h.it('Вторая мысль')], true)], true),
    h.bubble('Подкаст', [h.br('Разное', [], true), h.br('Гости', [h.it('Гость 1')])]),
    h.bubble('Ремонт', [h.br('Разное', [h.it('Плитка')], true)]),
  ] },
  { id: h.id(), name: 'Контент', bubbles: [h.bubble('Входящие', [h.br('Разное', [], true)], true)] },
]);
await sleep(2500);

const toast = () => page.evaluate(() => {
  const t = document.querySelector('.toast'); const r = t.getBoundingClientRect(); const cs = getComputedStyle(t);
  return { top: r.top, bottom: r.bottom, visible: cs.visibility === 'visible' && +cs.opacity > 0.5, clickThrough: cs.pointerEvents === 'none' };
});
const firstRowTop = () => page.evaluate(() => document.querySelector('.panel .list.open-list .row')?.getBoundingClientRect().top ?? Infinity);

// 1. Входящие → пузырь с одной веткой: всё равно спрашиваем ветку, можно создать новую
await tap(page, '.b', 'Входящие'); await sleep(800);
await swipeRow(page, 'Мысль из'); await tap(page, '.row.swiped .act.mv'); await sleep(450);
check((await sheet(page)).startsWith('В какой пузырь? | Подкаст | Ремонт'), 'из «Входящих»: сначала выбор пузыря (без самих «Входящих»)');
await tap(page, '.ov.in .sh-btn', 'Ремонт'); await sleep(450);
check((await sheet(page)).includes('＋ Новая ветка'), 'после пузыря — выбор ветки с «＋ Новая ветка»');
await tap(page, '.ov.in .sh-btn', 'Новая ветка'); await sleep(450);
await page.keyboard.type('Кухня'); await tap(page, '.ov.in .sh-btn.ok'); await sleep(500);
let t = await toast();
check(t.visible && t.clickThrough, 'уведомление видно и не перехватывает нажатия');
check(t.top >= 59 + 40 && t.bottom <= await firstRowTop() + 2, 'уведомление в ветке — ниже кнопок и над первой записью');
await page.screenshot({ path: `${OUT}/1-toast-list.png` });
await sleep(2700);
check(!(await toast()).visible, 'уведомление исчезает');

// 2. «Назад» срабатывает сразу после действия
await swipeRow(page, 'Вторая'); await tap(page, '.row.swiped .act.mv'); await sleep(450);
await tap(page, '.ov.in .sh-btn', 'Подкаст'); await sleep(450);
await tap(page, '.ov.in .sh-btn', 'Гости'); await sleep(300);
await tap(page, '.panel .back'); await sleep(900);
check(await page.evaluate(() => !document.querySelector('.panel')), '«Назад» работает, пока висит уведомление');

// 3. Внутри пузыря «Перенести» сразу предлагает соседние ветки
await tap(page, '.b', 'Подкаст'); await sleep(1500);
await tap(page, '.node', 'Гости'); await sleep(900);
await swipeRow(page, 'Гость 1'); await tap(page, '.row.swiped .act.mv'); await sleep(450);
check(await sheet(page) === 'Перенести в ветку… | Разное | ＋ Новая ветка | В другой пузырь… | Отмена', 'внутри пузыря: ветки, новая ветка, другой пузырь');
await tap(page, '.ov.in .sh-btn', 'Разное'); await sleep(2900);
await tap(page, '.panel .back'); await sleep(900);

// 4. Пузырь → другое пространство
await tap(page, '#more'); await sleep(450);
await tap(page, '.ov.in .sh-btn', 'Перенести в другое'); await sleep(450);
check((await sheet(page)).includes('＋ Новое пространство'), 'шторка пространств с «＋ Новое пространство»');
await tap(page, '.ov.in .sh-btn', 'Контент'); await sleep(600);
t = await toast();
const barBottom = await page.evaluate(() => document.querySelector('#top').getBoundingClientRect().bottom);
const bubblesTop = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.b:not(.gone)')].map((b) => b.getBoundingClientRect().top)));
check(t.top >= barBottom && t.bottom <= bubblesTop + 4, 'уведомление на главном — между вкладками и пузырями');
await page.screenshot({ path: `${OUT}/2-toast-main.png` });
await sleep(1500);
check(JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.b b')].map((e) => e.textContent))) === '["Входящие","Ремонт"]', 'пузырь ушёл из текущего пространства');

const db = await dump(page);
check(db[0] === 'Проекты: Входящие[Разное()] Ремонт[Разное(Плитка) Кухня(Мысль из входящих)]', 'база: Проекты');
check(db[1] === 'Контент: Входящие[Разное()] Подкаст[Разное(Гость 1) Гости(Вторая мысль)]', 'база: Контент');
check(errors.length === 0, `ошибок в консоли нет ${errors.join('; ')}`);

await browser.close();
console.log(failures() ? `\nПровалено: ${failures()}` : '\nВсё прошло');
process.exit(failures() ? 1 : 0);
