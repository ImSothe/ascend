import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, sanitize, addSession, removeSession, touchProfile, wipe, adopt, hasData } from '../app/core/store.js';
import { mergeState, readRemote, sessionDoc, tombDoc, profileDoc } from '../app/core/merge.js';

const sets = { 'lat-pulldown': [{ kg: 70, reps: 10, done: true }] };

/** A fake Firestore: applies a push and serves pulls. */
function fakeCloud() {
  const docs = new Map();
  let profile = null;
  return {
    apply(state, push) {
      for (const s of push.sessions) docs.set(s.id, sessionDoc(s));
      for (const [id, at] of push.tombs) docs.set(id, tombDoc(at));
      if (push.profile) profile = profileDoc(state);
    },
    pull(since = 0) {
      const list = [...docs].filter(([, d]) => d.updatedAt > since).map(([id, data]) => ({ id, data: structuredClone(data) }));
      return readRemote(list, structuredClone(profile));
    },
    size: () => docs.size,
  };
}

function sync(device, cloud, full) {
  const { state, push } = mergeState(device.state, cloud.pull(), full);
  cloud.apply(state, push);
  device.state = sanitize(JSON.parse(JSON.stringify(state)));
  return push;
}

test('mutations mark what the cloud has not seen', () => {
  const s = emptyState();
  const a = addSession(s, { date: '2026-11-16', dayId: 'TA', sets, xp: 110 }, 1000);
  assert.match(a.id, /^2026-11-16-TA-/);
  assert.deepEqual(s.dirty.sessions, [a.id]);
  assert.equal(removeSession(s, a.id, 2000), true);
  assert.equal(removeSession(s, 'nope', 2000), false);
  assert.deepEqual(s.tombs, { [a.id]: 2000 });
  assert.equal(s.sessions.length, 0);
  touchProfile(s, 3000);
  assert.equal(s.dirty.profile, true);
  assert.equal(hasData(s), false);
});

test('two devices converge: additions, a deletion and a profile edit', () => {
  const cloud = fakeCloud();
  const phone = { state: emptyState() };
  const laptop = { state: emptyState() };
  const a = addSession(phone.state, { date: '2026-11-16', dayId: 'TA', sets, xp: 110 }, 1000);
  phone.state.starts = { 'lat-pulldown': 70 };
  touchProfile(phone.state, 1000);
  sync(phone, cloud, true);

  addSession(laptop.state, { date: '2026-11-17', dayId: 'PA', sets: {}, xp: 50 }, 1500);
  sync(laptop, cloud, true);
  assert.equal(laptop.state.sessions.length, 2);
  assert.deepEqual(laptop.state.starts, { 'lat-pulldown': 70 });

  removeSession(laptop.state, a.id, 2000);
  laptop.state.rest = { 'lat-pulldown': 180 };
  touchProfile(laptop.state, 2000);
  sync(laptop, cloud, false);

  sync(phone, cloud, false);
  assert.deepEqual(phone.state.sessions.map((s) => s.dayId), ['PA']);
  assert.deepEqual(phone.state.rest, { 'lat-pulldown': 180 });
  assert.deepEqual(phone.state.starts, { 'lat-pulldown': 70 });
  assert.deepEqual(phone.state.sessions, laptop.state.sessions);
  assert.deepEqual(phone.state.tombs, laptop.state.tombs);

  // Nothing left to say: a further sync pushes nothing.
  assert.deepEqual(sync(phone, cloud, false), { sessions: [], tombs: [], profile: false });
  assert.deepEqual(sync(laptop, cloud, true), { sessions: [], tombs: [], profile: false });
});

test('sessions keep their sets across the cloud round-trip', () => {
  const cloud = fakeCloud();
  const phone = { state: emptyState() };
  addSession(phone.state, { date: '2026-11-16', dayId: 'TA', sets, xp: 110 }, 1000);
  sync(phone, cloud, true);
  const fresh = { state: emptyState() };
  sync(fresh, cloud, true);
  assert.deepEqual(fresh.state.sessions[0].sets, sets);
  assert.equal(fresh.state.sessions[0].xp, 110);
});

test('a newer profile on this device is not overwritten by an older cloud copy', () => {
  const cloud = fakeCloud();
  const a = { state: emptyState() };
  a.state.profile.weightKg = 95; touchProfile(a.state, 1000);
  sync(a, cloud, true);
  const b = { state: emptyState() };
  b.state.profile.weightKg = 93; touchProfile(b.state, 5000);
  const push = sync(b, cloud, true);
  assert.equal(push.profile, true);
  assert.equal(b.state.profile.weightKg, 93);
  sync(a, cloud, false);
  assert.equal(a.state.profile.weightKg, 93);
});

test('an untouched device never uploads an empty profile over a real one', () => {
  const cloud = fakeCloud();
  const a = { state: emptyState() };
  a.state.starts = { rdl: 60 }; touchProfile(a.state, 1000);
  sync(a, cloud, true);
  const blank = { state: emptyState() };
  assert.equal(sync(blank, cloud, true).profile, false);
  assert.deepEqual(blank.state.starts, { rdl: 60 });
  const lonely = mergeState(emptyState(), readRemote([], null), true);
  assert.equal(lonely.push.profile, false);
});

test('wipe erases the cloud copy too', () => {
  const cloud = fakeCloud();
  const a = { state: emptyState() };
  addSession(a.state, { date: '2026-11-16', dayId: 'TA', sets, xp: 110 }, 1000);
  sync(a, cloud, true);
  a.state = wipe(a.state, 2000);
  sync(a, cloud, false);
  const b = { state: emptyState() };
  sync(b, cloud, true);
  assert.equal(b.state.sessions.length, 0);
  assert.equal(cloud.size(), 1); // the tombstone remains
});

test('adopt: an imported backup replaces local data and wins', () => {
  const s = emptyState();
  const old = addSession(s, { date: '2026-11-10', dayId: 'TA', sets, xp: 10 }, 1000);
  const backup = { version: 1, profile: { startXp: 1600 }, starts: { rdl: 60 }, sessions: [{ id: 'keep-1', date: '2026-11-12', dayId: 'PA', sets: {}, xp: 5 }] };
  const next = adopt(s, backup, 9000);
  assert.deepEqual(next.sessions.map((x) => x.id), ['keep-1']);
  assert.equal(next.sessions[0].updatedAt, 9000);
  assert.equal(next.tombs[old.id], 9000);
  assert.equal(next.profile.startXp, 1600);
  assert.equal(next.profileAt, 9000);
  assert.ok(next.dirty.profile && next.dirty.sessions.includes('keep-1') && next.dirty.sessions.includes(old.id));
});

test('readRemote distrusts the cloud', () => {
  const r = readRemote([
    { id: 'ok-1', data: { date: '2026-11-16', dayId: 'TA', sets: { 'lat-pulldown': [{ kg: 70, reps: 10 }], '<img>': [] }, xp: 1e12, updatedAt: 5 } },
    { id: 'bad date', data: { date: 'x', dayId: 'TA', updatedAt: 5 } },
    { id: 'gone', data: { deleted: true, updatedAt: 7 } },
    { id: 'junk', data: null },
  ], { startXp: -5, weights: [{ date: '2026-11-16', kg: 9999 }], rest: { rdl: 5 }, starts: { rdl: 60, '<x>': 1 }, updatedAt: 3 });
  assert.deepEqual(r.sessions.map((s) => s.id), ['ok-1']);
  assert.deepEqual(Object.keys(r.sessions[0].sets), ['lat-pulldown']);
  assert.equal(r.sessions[0].xp, 100000);
  assert.deepEqual(r.tombs, { gone: 7 });
  assert.deepEqual(r.group, { profile: { startXp: 0, weightKg: null, body: {} }, weights: [], rest: {}, starts: { rdl: 60 }, profileAt: 3 });
});

test('a session edited after its deletion elsewhere comes back', () => {
  const local = emptyState();
  local.sessions.push({ id: 'a', date: '2026-11-16', dayId: 'TA', sets: {}, xp: 1, updatedAt: 9 });
  const { state } = mergeState(local, { sessions: [], tombs: { a: 5 }, group: null }, true);
  assert.equal(state.sessions.length, 1);
  assert.equal('a' in state.tombs, false);
});
