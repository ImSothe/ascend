import { test } from 'node:test';
import assert from 'node:assert/strict';
import { review, stalls, regressions, weightTrend, aiSummary, PHOTO_EVERY_DAYS } from '../app/core/coach.js';
import { emptyState, sanitize, cleanBody } from '../app/core/store.js';
import { dayById } from '../app/core/program.js';

const set = (kg, reps) => ({ kg, reps, done: true });
const sess = (date, sets, dayId = 'D2') => ({ id: `${date}-${dayId}`, date, dayId, sets, xp: 100, updatedAt: 1 });
const full = (day, kg = 50, reps = 10) => Object.fromEntries(dayById(day).exercises.map((e) => [e.id, Array.from({ length: e.sets }, () => set(kg, reps))]));
const codes = (f) => f.map((x) => x.code);

function base() {
  const s = emptyState();
  s.profile.body = { age: 25, heightCm: 186 };
  s.weights = [{ date: '2026-11-16', kg: 95 }];
  s.photos = [{ id: 'p1', date: '2026-11-16' }];
  return s;
}

test('a fresh account is told how to start, nothing alarming', () => {
  const f = review(emptyState(), '2026-11-17');
  assert.deepEqual(codes(f).sort(), ['body', 'photo', 'weigh']);
  assert.ok(f.every((x) => x.level === 'info' || x.level === 'ok'));
});

test('three sessions at the same load without more reps is a stall, with a 10 % deload', () => {
  const s = [sess('2026-11-03', { 'lat-pulldown': [set(70, 10), set(70, 9), set(70, 8)] }),
    sess('2026-11-10', { 'lat-pulldown': [set(70, 10), set(70, 9), set(70, 8)] }),
    sess('2026-11-17', { 'lat-pulldown': [set(70, 9), set(70, 9), set(70, 8)] })];
  const out = stalls(s);
  assert.equal(out.length, 1);
  assert.equal(out[0].exercise.id, 'lat-pulldown');
  assert.equal(out[0].deloadKg, 60);         // 63 rounded down to the 5 kg step
  // One more rep in total is progress, not a stall.
  s[2].sets['lat-pulldown'] = [set(70, 10), set(70, 10), set(70, 8)];
  assert.equal(stalls(s).length, 0);
  // A heavier load in between is progress too.
  s[1].sets['lat-pulldown'] = [set(75, 8)];
  assert.equal(stalls(s).length, 0);
});

test('a drop of more than 7 % in estimated strength is flagged', () => {
  const mk = (d, kg) => sess(d, { 'cable-row': [set(kg, 10)] });
  assert.equal(regressions([mk('2026-10-27', 60), mk('2026-11-03', 62), mk('2026-11-10', 64), mk('2026-11-17', 58)]).length, 1);
  assert.equal(regressions([mk('2026-10-27', 60), mk('2026-11-03', 62), mk('2026-11-10', 64), mk('2026-11-17', 61)]).length, 0);
  assert.equal(regressions([mk('2026-11-10', 64), mk('2026-11-17', 40)]).length, 0, 'too little history');
});

test('weight trend: rate per week over the last four weeks', () => {
  const w = [{ date: '2026-10-20', kg: 99 }, { date: '2026-10-27', kg: 97 }, { date: '2026-11-10', kg: 95 }, { date: '2026-11-17', kg: 94 }];
  const t = weightTrend(w, '2026-11-17');
  assert.equal(t.fromKg, 99);
  assert.ok(t.ratePct < -1, String(t.ratePct));
  assert.equal(weightTrend([{ date: '2026-11-15', kg: 95 }, { date: '2026-11-17', kg: 94 }], '2026-11-17'), null, 'span too short');
  const s = base();
  s.weights = w;
  assert.ok(codes(review(s, '2026-11-17')).includes('weight'));
});

test('photos are asked for every 14 days', () => {
  const s = base();
  assert.ok(!codes(review(s, '2026-11-29')).includes('photo'));
  const due = review(s, `2026-11-${16 + PHOTO_EVERY_DAYS}`).find((x) => x.code === 'photo');
  assert.equal(due.level, 'warn');
  assert.equal(due.action, 'photo');
});

test('weigh-in reminder after a week', () => {
  const s = base();
  assert.ok(!codes(review(s, '2026-11-20')).includes('weigh'));
  assert.ok(codes(review(s, '2026-11-23')).includes('weigh'));
});

test('an incomplete mission and a week that cannot be finished are reported', () => {
  const s = base();
  s.sessions = [sess('2026-11-20', { 'lat-pulldown': [set(70, 10)] }, 'D2')];   // Friday, 1 of 21 sets
  const f = review(s, '2026-11-21');                                             // Saturday: 3 missions left, 2 days
  assert.ok(codes(f).includes('incomplete'));
  assert.equal(f[0].code, 'week');
  assert.equal(f[0].level, 'alert');
});

test('a clean week says all is well', () => {
  const s = base();
  s.sessions = [sess('2026-11-16', full('D1'), 'D1'), sess('2026-11-17', full('D2'), 'D2')];
  const f = review(s, '2026-11-17');
  assert.deepEqual(codes(f), ['ok']);
});

test('the AI summary carries data, not identity', () => {
  const s = base();
  s.profile.body = cleanBody({ age: 25, heightCm: 186, kcal: 2500, sleepH: 7.5, fat: 'abdomen y flancos', email: 'x@y.z' });
  s.sessions = [sess('2026-11-17', { 'lat-pulldown': [set(70, 10), set(70, 9)] })];
  const out = aiSummary(s, '2026-11-17');
  assert.equal(out.perfil.edad, 25);
  assert.equal(out.perfil.acumulaGrasaEn, 'abdomen y flancos');
  assert.deepEqual(out.ejercicios[0].sesiones, ['2026-11-17: 70x10 70x9']);
  assert.deepEqual(out.misionesPorSemana.ultimas4, [0, 0, 0, 1]);
  assert.doesNotMatch(JSON.stringify(out), /@|uid|x@y/);
});

test('body data and photo dates survive sanitising; photos never sync', () => {
  const s = sanitize({ version: 1, profile: { body: { age: 25, heightCm: 999, fat: '  panza ', sleepH: 'x' } }, photos: [{ id: 'a1', date: '2026-11-17' }, { id: '<x>', date: '2026-11-17' }] });
  assert.deepEqual(s.profile.body, { age: 25, fat: 'panza' });
  assert.deepEqual(s.photos, [{ id: 'a1', date: '2026-11-17' }]);
});

test('AI answers are parsed defensively', async () => {
  const { parseReview } = await import('../app/data/ai.js');
  assert.equal(parseReview('no json'), null);
  assert.equal(parseReview('{}'), null);
  const r = parseReview('```json\n{"estado":"raro","titular":"' + 'x'.repeat(200) + '","resumen":"ok","acciones":["a","",5,"b","c","d","e"]}\n```');
  assert.equal(r.estado, 'atencion');
  assert.equal(r.titular.length, 80);
  assert.deepEqual(r.acciones, ['a', 'b', 'c', 'd']);
  assert.equal(r.fotos, '');
});

test('a stall turns into an automatic 10 % deload, then progression resumes', async () => {
  const { verdictFor } = await import('../app/core/progression.js');
  const { ALL_EXERCISES } = await import('../app/core/program.js');
  const e = ALL_EXERCISES.find((x) => x.id === 'lat-pulldown');   // 3 x 8-12, +5 kg
  const s = [sess('2026-11-03', { 'lat-pulldown': [set(70, 10), set(70, 9), set(70, 8)] }),
    sess('2026-11-10', { 'lat-pulldown': [set(70, 10), set(70, 9), set(70, 8)] }),
    sess('2026-11-17', { 'lat-pulldown': [set(70, 10), set(70, 8), set(70, 8)] })];
  assert.deepEqual(verdictFor(e, s), { state: 'DELOAD', kg: 60, target: '8-12' });
  s.push(sess('2026-11-24', { 'lat-pulldown': [set(60, 12), set(60, 12), set(60, 12)] }));
  assert.equal(verdictFor(e, s).state, 'UP');
  assert.equal(verdictFor(e, s).kg, 65);
  assert.equal(verdictFor(e, s.slice(0, 2)).state, 'HOLD', 'two sessions are not a stall');
});

test('six sessions without a new best suggest the next variant; swaps change the plan', async () => {
  const { planDay, optionsFor } = await import('../app/core/program.js');
  const { plateaus } = await import('../app/core/coach.js');
  const st = base();
  const dates = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29', '2026-11-05'];
  st.sessions = dates.map((d) => sess(d, { 'chest-row': [set(50, 10), set(50, 10), set(50, 9)] }));
  const p = plateaus(st.sessions, {}, '2026-11-06');
  assert.equal(p.length, 1);
  assert.equal(p[0].to.id, optionsFor('chest-row')[1].id);
  const f = review(st, '2026-11-06').find((x) => x.code === 'swap');
  assert.deepEqual(f.swap, { base: 'chest-row', to: 't-bar-row' });

  st.swaps = { 'chest-row': 't-bar-row' };
  assert.ok(planDay('D2', st.swaps).exercises.some((e) => e.id === 't-bar-row'));
  assert.ok(!planDay('D2', st.swaps).exercises.some((e) => e.id === 'chest-row'));
  assert.equal(plateaus(st.sessions, st.swaps, '2026-11-06').length, 0, 'the new variant starts fresh');
  // A new best in the last three sessions is progress.
  st.sessions[5] = sess(dates[5], { 'chest-row': [set(55, 10)] });
  assert.equal(plateaus(st.sessions, {}, '2026-11-06').length, 0);
});

test('swaps are sanitised and strength counts the best option once', async () => {
  const { stats } = await import('../app/core/player.js');
  const s = sanitize({ version: 1, swaps: { 'chest-row': 't-bar-row', rdl: 'nope', '<x>': 't-bar-row' } });
  assert.deepEqual(s.swaps, { 'chest-row': 't-bar-row' });
  const plain = stats([sess('2026-11-17', { 't-bar-row': [set(60, 10)] })], '2026-11-17').FUE;
  const swapped = stats([sess('2026-11-17', { 'chest-row': [set(60, 10)] })], '2026-11-17').FUE;
  assert.ok(plain > 0 && swapped > 0);
});

test('a first load is always proposed: from a sibling lift, or a cautious guess', async () => {
  const { verdictFor, guess } = await import('../app/core/progression.js');
  const { ALL_EXERCISES } = await import('../app/core/program.js');
  const ex = (id) => ALL_EXERCISES.find((x) => x.id === id);
  // Old lift logged as 70 kg: the new pulldown starts at 90 % rounded to its 5 kg step.
  const fromLog = verdictFor(ex('neutral-pulldown'), [sess('2026-11-17', { 'lat-pulldown': [set(70, 10)] })]);
  assert.deepEqual([fromLog.source, fromLog.kg, fromLog.from], ['sibling', 60, 'Jalón al pecho']);
  // A different unit (bar vs dumbbells) is not converted: cautious guess instead.
  const smith = verdictFor(ex('incline-smith'), [], null, { 'incline-db-press': 22 });
  assert.deepEqual([smith.source, smith.kg], ['guess', 40]);
  assert.equal(guess(ex('leg-raise')), 0, 'no added weight to start');
  assert.equal(guess(ex('leg-press')), 120);
  // A real start always wins.
  assert.equal(verdictFor(ex('neutral-pulldown'), [], 65, { 'lat-pulldown': 70 }).kg, 65);
});
