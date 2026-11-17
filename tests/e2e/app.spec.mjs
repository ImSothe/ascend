// End-to-end: the real app in Chromium at a phone viewport, driven by taps and
// typing. No network beyond the local server: sign-in and AI are not exercised
// here (they need a real account); everything a person does on the device is.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PORT = 8797;
const URL_ = `http://localhost:${PORT}/`;
// 1x1 PNG, enough for createImageBitmap
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let server, browser, page;
const problems = [];

before(async () => {
  server = spawn(process.execPath, [fileURLToPath(new URL('../../tools/dev_server.mjs', import.meta.url)), String(PORT)], { stdio: 'pipe' });
  await new Promise((resolve) => server.stdout.once('data', resolve));
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES' });
  page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  await page.goto(URL_);
});

after(async () => {
  await browser?.close();
  server?.kill();
});

const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('ascend.v1')));
const tabTo = (name) => page.locator('.tabs button', { hasText: name }).click();
const noHorizontalScroll = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

test('welcome screen offers Google sign-in and a device-only mode', async () => {
  await page.locator('.welcome').waitFor();
  assert.ok(await page.getByRole('button', { name: 'Entrar con Google' }).isVisible());
  await page.getByRole('button', { name: /Usar sin cuenta/ }).click();
  await page.locator('.hud').waitFor();
  await page.reload();
  await page.locator('.hud').waitFor();                     // remembered: no welcome again
  await noHorizontalScroll();
});

test('starting point: rank D and a starting load reach today\'s mission', async () => {
  await tabTo('Estado');
  await page.getByLabel('Rango de partida').selectOption({ label: 'Rango D · Cazador en formación' });
  assert.match(await page.locator('.hud-title').innerText(), /nivel\s*5/i);
  await page.getByRole('button', { name: 'Editar cargas de partida' }).click();
  const incline = page.getByLabel('Press inclinado con mancuernas, carga de partida');
  await incline.fill('22');
  await incline.blur();
  assert.equal((await state()).starts['incline-db-press'], 22);
});

test('body data and a weigh-in are saved and clear their reminders', async () => {
  await page.getByLabel('Edad').fill('25');
  await page.getByLabel('Altura (cm)').fill('186');
  await page.getByLabel('Kcal diarias').fill('2500');
  await page.getByLabel('Horas de sueño').fill('7,5');
  await page.getByLabel('Dónde acumulas grasa').selectOption('Abdomen y flancos');
  await page.getByRole('button', { name: 'Guardar datos' }).click();
  await page.getByLabel('Peso corporal en kilos').fill('95');
  await page.locator('#weight').getByRole('button', { name: 'Registrar' }).click();
  const s = await state();
  assert.deepEqual(s.profile.body, { age: 25, heightCm: 186, kcal: 2500, sleepH: 7.5, fat: 'Abdomen y flancos' });
  assert.equal(s.weights.at(-1).kg, 95);
  await tabTo('Misión');
  const finds = await page.locator('.find b').allInnerTexts();
  assert.ok(!finds.includes('Completa tus datos') && !finds.includes('Pésate'), finds.join(' | '));
});

test('a full mission: every set at the top of the range earns every load increase', async () => {
  assert.equal(await page.locator('.ex .set input').first().inputValue(), '22');
  // An empty set cannot be checked.
  const firstSet = page.locator('.set').first();
  await firstSet.locator('.check').click();
  assert.match(await firstSet.getAttribute('class'), /bad/);

  const sets = page.locator('.set');
  const n = await sets.count();
  assert.equal(n, 19);
  for (let i = 0; i < n; i++) {
    const row = sets.nth(i);
    const kg = row.locator('input').nth(0);
    const reps = row.locator('input').nth(1);
    if (!(await kg.inputValue())) await kg.fill('20');
    const top = (await reps.getAttribute('placeholder')).split('-')[1];
    await reps.fill(top);
    await row.locator('.check').click();
    if (i === 0) assert.ok(await page.locator('#rest .rest').isVisible(), 'rest timer starts on the first checked set');
  }
  assert.match(await page.locator('.mission-meta').first().innerText(), /19\/19[\s\S]*\+500 XP/);
  await page.getByRole('button', { name: 'Completar misión' }).click();
  const dlg = page.locator('dialog#result');
  await dlg.waitFor();
  await page.waitForTimeout(1100);                          // the XP counter animates
  assert.equal(await dlg.locator('.xp').innerText(), '+500');
  assert.equal(await dlg.locator('li').count(), 7);         // seven "▲ next time" lines
  await dlg.getByRole('button', { name: 'Continuar' }).click();
  assert.equal(await page.locator('#rest').isHidden(), true);

  const s = await state();
  assert.equal(s.sessions.length, 1);
  assert.equal(s.sessions[0].xp, 500);
  assert.equal(s.draft, null);
  assert.match(await page.locator('.panel.sys').last().innerText(), /Siguiente misión: Espalda \+ Bíceps/);
});

test('the next session suggests the higher loads', async () => {
  await page.getByRole('button', { name: 'Adelantar la siguiente misión' }).click();
  await page.locator('.chip', { hasText: 'Pecho' }).click();
  const verdict = await page.locator('.verdict').first().innerText();
  assert.match(verdict, /Sube de carga[\s\S]*24 kg/);       // 22 + 2 kg per dumbbell
  assert.equal(await page.locator('.ex .set input').first().inputValue(), '24');
});

test('rest time per exercise is adjustable and remembered', async () => {
  const ctl = page.locator('.restctl').first();
  assert.equal(await ctl.locator('b').innerText(), '3:00');
  await ctl.getByRole('button', { name: 'Quitar 15 segundos de descanso' }).click();
  assert.equal(await ctl.locator('b').innerText(), '2:45');
  assert.equal((await state()).rest['incline-db-press'], 165);
});

test('a progress photo is stored on the device and clears the reminder', async () => {
  await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('ascend.v1')).photos.length === 1);
  const finds = await page.locator('.find b').allInnerTexts();
  assert.ok(!finds.some((f) => /foto/i.test(f)), finds.join(' | '));
  await tabTo('Estado');
  await page.locator('#photos img').first().waitFor();
  assert.match(await page.locator('#photos .label').innerText(), /· 1/);
});

test('closing the app mid-mission keeps the sets already done', async () => {
  await tabTo('Misión');
  const row = page.locator('.set').first();
  await row.locator('input').nth(1).fill('8');
  await row.locator('.check').click();
  await page.reload();
  await page.locator('.hud').waitFor();
  const again = page.locator('.set').first();
  assert.match(await again.getAttribute('class'), /done/);
  assert.equal(await again.locator('input').nth(0).inputValue(), '24');
  assert.equal(await again.locator('input').nth(1).inputValue(), '8');
  assert.match(await page.locator('.mission-meta').first().innerText(), /1\/19/);
  // The other days are locked while a mission is in progress.
  assert.equal(await page.locator('.chip', { hasText: 'Espalda' }).isDisabled(), true);
});

test('the log lists the session and deletes it on a second tap', async () => {
  await tabTo('Registro');
  assert.equal(await page.locator('.sess').count(), 1);
  assert.equal(await page.locator('.cal .d.g0').count(), 1);
  const del = page.locator('.sess button');
  await del.click();
  assert.equal(await page.locator('.sess').count(), 1);   // first tap only arms it
  await del.click();
  assert.equal(await page.locator('.sess').count(), 0);
  const s = await state();
  assert.equal(s.sessions.length, 0);
  assert.equal(Object.keys(s.tombs).length, 1);
});

test('wipe erases everything, photos included', async () => {
  await tabTo('Estado');
  const wipe = page.getByRole('button', { name: /Borrar todos los datos|Pulsa otra vez/ });
  await wipe.click();
  await wipe.click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('ascend.v1')).weights.length === 0);
  const s = await state();
  assert.deepEqual([s.sessions.length, s.photos.length, Object.keys(s.starts).length, s.profile.startXp], [0, 0, 0, 0]);
  const left = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('ascend-photos');
    r.onsuccess = () => { const q = r.result.transaction('photos').objectStore('photos').count(); q.onsuccess = () => res(q.result); };
  }));
  assert.equal(left, 0);
  await noHorizontalScroll();
});

test('a backup file is imported, and a broken one is refused', async () => {
  const backup = { version: 1, profile: { startXp: 1600, weightKg: 95 }, starts: { 'lat-pulldown': 70 }, weights: [{ date: '2026-11-16', kg: 95 }],
    sessions: [{ id: 'b1', date: '2026-11-16', dayId: 'D1', xp: 200, sets: { 'incline-db-press': [{ kg: 22, reps: 8 }] } }] };
  const input = page.locator('input[type=file][accept="application/json"]');
  await input.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{nope') });
  await page.getByText('Ese archivo no es una copia válida de Ascend.').waitFor();
  await input.setInputFiles({ name: 'ascend.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('ascend.v1')).sessions.length === 1);
  const s = await state();
  assert.equal(s.profile.startXp, 1600);
  assert.deepEqual(s.starts, { 'lat-pulldown': 70 });
  assert.match(await page.locator('.hud-title').innerText(), /nivel\s*5/i);
});

test('no script errors or CSP violations along the way', () => {
  assert.deepEqual(problems, []);
});
