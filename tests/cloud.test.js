import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCloud } from '../app/data/cloud.js';
import { emptyState, addSession, touchProfile, sanitize } from '../app/core/store.js';
import { sessionDoc, tombDoc, profileDoc } from '../app/core/merge.js';

/** One fake Firestore shared by every device that signs in. */
function fakeBackend() {
  const docs = new Map(); // path -> data
  const sdkFor = (uid, { failWrites = false } = {}) => ({
    initializeApp: () => ({}), initializeAuth: () => ({}), getFirestore: () => ({}),
    indexedDBLocalPersistence: 1, browserLocalPersistence: 2, browserPopupRedirectResolver: 3,
    onAuthStateChanged: (auth, cb) => { queueMicrotask(() => cb({ uid, displayName: 'Test', email: 't@example.com' })); },
    collection: (db, ...p) => ({ path: p.join('/') }),
    doc: (db, ...p) => ({ path: p.join('/') }),
    where: (field, op, value) => ({ field, value }),
    query: (col, w) => ({ ...col, since: w.value }),
    getDocs: async (q) => ({
      docs: [...docs].filter(([path, d]) => path.startsWith(`${q.path}/`) && (q.since == null || d.updatedAt > q.since))
        .map(([path, d]) => ({ id: path.split('/').pop(), data: () => structuredClone(d) })),
    }),
    getDoc: async (ref) => ({ exists: () => docs.has(ref.path), data: () => structuredClone(docs.get(ref.path)) }),
    writeBatch: () => {
      const pending = [];
      return { set: (ref, data) => pending.push([ref.path, data]), commit: async () => { if (failWrites) throw Object.assign(new Error('x'), { code: 'permission-denied' }); for (const [p, d] of pending) docs.set(p, structuredClone(d)); } };
    },
    signOut: async () => {},
  });
  return { docs, sdkFor };
}

function device(backend, uid, options) {
  const mem = new Map();
  const dev = { state: emptyState(), redraws: 0 };
  dev.cloud = createCloud({
    getState: () => dev.state,
    replaceState: (next, changed) => { dev.state = sanitize(JSON.parse(JSON.stringify(next))); if (changed) dev.redraws++; },
    patchState: (fn) => fn(dev.state),
    loadSdk: async () => backend.sdkFor(uid, options),
    config: { apiKey: 'k' },
    storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) },
  });
  dev.settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
  return dev;
}

test('without configuration the cloud stays off and says so', async () => {
  const cloud = createCloud({ getState: emptyState, replaceState() {}, patchState() {}, config: { apiKey: '' }, storage: { getItem: () => null, setItem() {} } });
  assert.equal(cloud.status, 'unconfigured');
  await assert.rejects(cloud.prepare());
  await cloud.signIn();
  assert.equal(cloud.status, 'unconfigured');
});

test('two devices of one account end with the same sessions', async () => {
  const backend = fakeBackend();
  const phone = device(backend, 'u1');
  addSession(phone.state, { date: '2026-11-16', dayId: 'TA', sets: { 'lat-pulldown': [{ kg: 70, reps: 10, done: true }] }, xp: 110 }, 1000);
  phone.state.starts = { 'lat-pulldown': 70 };
  touchProfile(phone.state, 1000);
  await phone.cloud.prepare(); await phone.settle();
  assert.equal(phone.cloud.status, 'synced');
  assert.deepEqual(phone.state.dirty, { sessions: [], profile: false });
  assert.equal(backend.docs.size, 2);

  const laptop = device(backend, 'u1');
  await laptop.cloud.prepare(); await laptop.settle();
  assert.equal(laptop.state.sessions.length, 1);
  assert.deepEqual(laptop.state.starts, { 'lat-pulldown': 70 });
  assert.equal(laptop.redraws, 1);

  // Another account sees nothing of it.
  const other = device(backend, 'u2');
  await other.cloud.prepare(); await other.settle();
  assert.equal(other.state.sessions.length, 0);
});

test('a failed upload keeps the edits marked for the next try', async () => {
  const backend = fakeBackend();
  const phone = device(backend, 'u1', { failWrites: true });
  const s = addSession(phone.state, { date: '2026-11-16', dayId: 'TA', sets: {}, xp: 10 }, 1000);
  await phone.cloud.prepare(); await phone.settle();
  assert.equal(phone.cloud.status, 'error');
  assert.deepEqual(phone.state.dirty.sessions, [s.id]);
  assert.equal(phone.state.sessions.length, 1);
  assert.equal(backend.docs.size, 0);
});

test('documents only carry the fields that firestore.rules allows', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const allowed = (fn) => new Set(rules.split(`function ${fn}(d)`)[1].match(/hasOnly\(\[([^\]]+)\]\)/)[1].match(/'([^']+)'/g).map((k) => k.slice(1, -1)));
  const state = emptyState();
  const s = addSession(state, { date: '2026-11-16', dayId: 'TA', sets: {}, xp: 10 }, 1000);
  for (const k of Object.keys(sessionDoc(s))) assert.ok(allowed('validSession').has(k), k);
  for (const k of Object.keys(tombDoc(5))) assert.ok(allowed('validTombstone').has(k), k);
  for (const k of Object.keys(profileDoc(state))) assert.ok(allowed('validProfile').has(k), k);
  assert.doesNotMatch(rules, /allow[^;]*:\s*if\s+true/);
});

test('signed in before but offline at launch: the sync starts when the connection returns', async () => {
  const backend = fakeBackend();
  const mem = new Map([['ascend.cloud', JSON.stringify({ on: true })]]);
  let net = false;
  const dev = { state: emptyState() };
  addSession(dev.state, { date: '2026-11-17', dayId: 'D1', sets: {}, xp: 10 }, 1000);
  const cloud = createCloud({
    getState: () => dev.state,
    replaceState: (next) => { dev.state = sanitize(JSON.parse(JSON.stringify(next))); },
    patchState: (fn) => fn(dev.state),
    loadSdk: async () => { if (!net) throw new Error('offline'); return backend.sdkFor('u1'); },
    config: { apiKey: 'k' },
    storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) },
    online: () => net,
  });
  const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
  await settle();
  assert.equal(cloud.status, 'offline');
  assert.equal(backend.docs.size, 0);
  net = true;
  cloud.wake();
  await settle();
  assert.equal(cloud.status, 'synced');
  assert.equal(backend.docs.size, 1);
});
