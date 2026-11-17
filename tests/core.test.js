import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAYS, EXERCISES, WEEKLY_SETS, nextDayId, dayById, restReason } from '../app/core/program.js';
import { verdict, earnedLoadUp, e1rm, lastSetsFor, history, validSets } from '../app/core/progression.js';
import {
  levelFromXp, xpForLevel, rankForLevel, progress, sessionXp, weekStreak, weekStart, stats, systemMessage, RANKS,
} from '../app/core/player.js';
import { sanitize, emptyState, load, save } from '../app/core/store.js';

const STARTS = { 'lat-pulldown': 70, 'cable-row': 60, 'incline-db-press': 22 };

const pulldown = dayById('D2').exercises.find((e) => e.id === 'lat-pulldown'); // 3 x 8-12, +5 kg
const set = (kg, reps) => ({ kg, reps, done: true });

test('programme: unique ids and sane ranges', () => {
  for (const d of DAYS) {
    const ids = d.exercises.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, d.id);
  }
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length);
  assert.equal(EXERCISES.length, DAYS.flatMap((d) => d.exercises).length, 'no exercise is repeated across days');
  for (const d of DAYS) assert.equal(d.groups.length, 2, d.id);
  for (const e of EXERCISES) assert.ok(['upper', 'lower', 'core'].includes(e.area), e.id);
  assert.ok(EXERCISES.filter((e) => e.area === 'lower').length >= 8, 'legs get two days of work');
  for (const e of DAYS.flatMap((d) => d.exercises)) {
    assert.ok(e.min < e.max && e.sets >= 2 && e.rest >= 60, e.id);
  }
  assert.equal(DAYS.length, 4);
  assert.ok(WEEKLY_SETS > 60 && WEEKLY_SETS < 100);
});

test('rotation follows the last session', () => {
  assert.equal(nextDayId([]), 'D1');
  assert.equal(nextDayId([{ dayId: 'D1' }]), 'D2');
  assert.equal(nextDayId([{ dayId: 'D4' }]), 'D1');
});

test('verdict: no history calibrates from the starting weight', () => {
  assert.deepEqual(verdict(pulldown, null, 70), { state: 'CAL', kg: 70, target: '8-12' });
  assert.equal(verdict(pulldown, null).kg, null);
});

test('verdict: top of the range in every set raises the load', () => {
  const v = verdict(pulldown, [set(70, 12), set(70, 12), set(70, 13)]);
  assert.equal(v.state, 'UP');
  assert.equal(v.kg, 75);
});

test('verdict: one set short of the top holds the load and asks for one more rep', () => {
  const v = verdict(pulldown, [set(70, 12), set(70, 11), set(70, 10)]);
  assert.equal(v.state, 'HOLD');
  assert.equal(v.kg, 70);
  assert.equal(v.target, '34 reps en total');
});

test('verdict: below the bottom of the range holds and slows the eccentric', () => {
  assert.equal(verdict(pulldown, [set(75, 8), set(75, 7), set(75, 6)]).state, 'ECC');
});

test('load-up needs every planned set at the top weight', () => {
  assert.equal(earnedLoadUp(pulldown, [set(70, 12), set(70, 12)]), false);
  assert.equal(earnedLoadUp(pulldown, [set(70, 12), set(70, 12), set(65, 15)]), false);
  assert.equal(earnedLoadUp(pulldown, [set(70, 12), set(70, 12), set(70, 12)]), true);
});

test('invalid sets are ignored', () => {
  assert.equal(validSets([set(70, 0), { kg: NaN, reps: 5 }, { kg: 50, reps: 2.5 }, null, set(0, 8)]).length, 1);
});

test('history and last sets read sessions in order', () => {
  const sessions = [
    { date: '2026-11-02', sets: { 'lat-pulldown': [set(70, 10)] } },
    { date: '2026-11-05', sets: { 'cable-row': [set(65, 10)] } },
    { date: '2026-11-09', sets: { 'lat-pulldown': [set(70, 12)] } },
  ];
  assert.deepEqual(lastSetsFor(sessions, 'lat-pulldown'), [set(70, 12)]);
  assert.equal(lastSetsFor(sessions, 'rdl'), null);
  assert.deepEqual(history(sessions, 'lat-pulldown').map((p) => Math.round(p.value)), [93, 98]);
  assert.equal(e1rm(100, 30), e1rm(100, 20));
});

test('levels and ranks', () => {
  assert.equal(levelFromXp(0), 1);
  assert.equal(levelFromXp(99), 1);
  assert.equal(levelFromXp(100), 2);
  assert.equal(levelFromXp(1600), 5);
  for (let l = 1; l < 60; l++) assert.equal(levelFromXp(xpForLevel(l)), l);
  assert.equal(rankForLevel(4).id, 'E');
  assert.equal(rankForLevel(5).id, 'D');
  assert.equal(rankForLevel(999).id, 'S');
  for (let i = 1; i < RANKS.length; i++) assert.ok(RANKS[i].min > RANKS[i - 1].min);
});

test('progress reports the road to the next rank', () => {
  const p = progress(1600);
  assert.equal(p.rank.id, 'D');
  assert.equal(p.next.id, 'C');
  assert.equal(p.rankPct, 0);
  assert.equal(p.xpToRank, xpForLevel(12) - 1600);
  assert.equal(progress(xpForLevel(50)).next, null);
});

test('session XP: sets, load-ups and completion bonus', () => {
  const day = { exercises: [pulldown] };
  assert.deepEqual(sessionXp(day, {}), { total: 0, sets: 0, loadUps: 0, complete: false });
  assert.equal(sessionXp(day, { 'lat-pulldown': [set(70, 10)] }).total, 10);
  assert.equal(sessionXp(day, { 'lat-pulldown': [set(70, 10), set(70, 9), set(70, 8)] }).total, 130);
  assert.equal(sessionXp(day, { 'lat-pulldown': [set(70, 12), set(70, 12), set(70, 12)] }).total, 160);
});

test('week streak counts full weeks and tolerates the open week', () => {
  assert.equal(weekStart('2026-11-16'), '2026-11-16'); // Monday
  assert.equal(weekStart('2026-11-22'), '2026-11-16'); // Sunday
  const week = (monday) => [0, 1, 3, 4].map((d) => {
    const [y, m, day] = monday.split('-').map(Number);
    const date = new Date(y, m - 1, day + d);
    return { date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` };
  });
  const sessions = [...week('2026-11-02'), ...week('2026-11-09'), { date: '2026-11-16' }];
  assert.deepEqual(weekStreak(sessions, '2026-11-17'), { weeks: 2, thisWeek: 1, target: 4 });
  assert.equal(weekStreak([...sessions, ...week('2026-11-16').slice(1)], '2026-11-21').weeks, 3);
  assert.equal(weekStreak(week('2026-11-02'), '2026-11-17').weeks, 0);
});

test('stats: starting weights give upper strength, untrained legs give none', () => {
  assert.equal(stats([], '2026-11-16').FUE, 0);
  const s = stats([], '2026-11-16', STARTS);
  assert.ok(s.FUE > 5 && s.FUE < 70, String(s.FUE));
  assert.equal(s.AGI, 0);
  assert.equal(s.RES, 0);
  assert.equal(s.VIT, 0);
  const after = stats([{ date: '2026-11-16', sets: { 'leg-press': [set(150, 8), set(150, 8), set(150, 8)] } }], '2026-11-16');
  assert.ok(after.AGI > 0 && after.RES > 0 && after.VIT > 0);
});

test('system message escalates with inactivity', () => {
  assert.equal(systemMessage([], '2026-11-16').tone, 'info');
  assert.equal(systemMessage([{ date: '2026-11-16' }], '2026-11-16').tone, 'ok');
  assert.equal(systemMessage([{ date: '2026-11-12' }], '2026-11-16').tone, 'warn');
  assert.equal(systemMessage([{ date: '2026-11-01' }], '2026-11-16').tone, 'alert');
});

test('store: sanitize rejects foreign shapes and keeps valid data', () => {
  assert.deepEqual(sanitize(null), emptyState());
  assert.deepEqual(sanitize({ version: 2 }), emptyState());
  const s = sanitize({
    version: 1,
    profile: { startXp: 'x', weightKg: 95 },
    starts: { 'lat-pulldown': 70, rdl: -4 },
    sessions: [
      { date: '2026-11-16', dayId: 'TA', xp: 200, sets: { 'lat-pulldown': [{ kg: 70, reps: 10, done: true }], '<script>': [] } },
      { date: 'nope', dayId: 'TA' },
    ],
    weights: [{ date: '2026-11-16', kg: 95 }, { date: '2026-11-16', kg: 9000 }],
    rest: { 'lat-pulldown': 165, 'cable-row': 5, '<x>': 90, rdl: 'no' },
    draft: { dayId: 'PA', sets: {} },
  });
  assert.deepEqual(s.rest, { 'lat-pulldown': 165 });
  assert.equal(s.profile.startXp, 0);
  assert.deepEqual(s.starts, { 'lat-pulldown': 70 });
  assert.equal(s.sessions.length, 1);
  assert.equal(s.sessions[0].id, '2026-11-16-TA-0');
  assert.deepEqual(Object.keys(s.sessions[0].sets), ['lat-pulldown']);
  assert.equal(s.weights.length, 1);
  assert.equal(s.draft.dayId, 'PA');
});

test('store: load and save round-trip, corrupt data falls back', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const state = emptyState();
  state.profile.weightKg = 95;
  assert.equal(save(state, storage), true);
  assert.deepEqual(load(storage), state);
  mem.set('ascend.v1', '{broken');
  assert.deepEqual(load(storage), emptyState());
});

test('rest reason follows the length of the rest', () => {
  assert.match(restReason(180), /pesado/);
  assert.match(restReason(90), /medio/);
  assert.match(restReason(60), /Aislamiento/);
  for (const e of EXERCISES) assert.ok(e.rest >= 60 && e.rest <= 180, e.id);
});
