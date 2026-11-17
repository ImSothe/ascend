// firestore.rules against the real Firestore emulator. The documents come from
// the same functions the app uses to write them (app/core/merge.js), so a
// change in the app's shape that the rules would refuse fails here first.
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where } from 'firebase/firestore';
import { sessionDoc, tombDoc, profileDoc } from '../../app/core/merge.js';
import { emptyState, addSession, touchProfile, cleanBody } from '../../app/core/store.js';

const RULES = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const ALICE = 'alice-uid';
const BOB = 'bob-uid';
let env;

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-ascend', firestore: { rules: RULES, host: '127.0.0.1', port: 8080 } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

/** A session exactly as the app builds and uploads it. */
function realSession() {
  const s = emptyState();
  const added = addSession(s, { date: '2026-11-17', dayId: 'D2', xp: 330, sets: { 'lat-pulldown': [{ kg: 70, reps: 10, done: true }, { kg: 70, reps: 9, done: true }] } }, 1_795_000_000_000);
  return { id: added.id, data: sessionDoc(added) };
}

function realProfile() {
  const s = emptyState();
  s.profile.startXp = 1600;
  s.profile.weightKg = 95;
  s.profile.body = cleanBody({ age: 25, heightCm: 186, kcal: 2500, sleepH: 7.5, fat: 'Abdomen y flancos' });
  s.weights = [{ date: '2026-11-17', kg: 95 }];
  s.rest = { 'lat-pulldown': 165 };
  s.starts = { 'lat-pulldown': 70, 'incline-db-press': 22 };
  touchProfile(s, 1_795_000_000_000);
  return profileDoc(s);
}

const seed = (path, data) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));

test('the owner writes and reads a real session, its tombstone and the profile', async () => {
  const { id, data } = realSession();
  const a = db(ALICE);
  await assertSucceeds(setDoc(doc(a, `users/${ALICE}/sessions/${id}`), data));
  await assertSucceeds(getDoc(doc(a, `users/${ALICE}/sessions/${id}`)));
  await assertSucceeds(setDoc(doc(a, `users/${ALICE}/sessions/${id}`), tombDoc(1_795_000_100_000)));
  await assertSucceeds(setDoc(doc(a, `users/${ALICE}/meta/profile`), realProfile()));
  await assertSucceeds(getDoc(doc(a, `users/${ALICE}/meta/profile`)));
});

test('the incremental pull query the app runs is allowed', async () => {
  const { id, data } = realSession();
  await seed(`users/${ALICE}/sessions/${id}`, data);
  const a = db(ALICE);
  await assertSucceeds(getDocs(collection(a, `users/${ALICE}/sessions`)));
  await assertSucceeds(getDocs(query(collection(a, `users/${ALICE}/sessions`), where('updatedAt', '>', 0))));
});

test('nobody else can read or write another person\'s data', async () => {
  const { id, data } = realSession();
  await seed(`users/${ALICE}/sessions/${id}`, data);
  await seed(`users/${ALICE}/meta/profile`, realProfile());
  for (const other of [db(BOB), db(null)]) {
    await assertFails(getDoc(doc(other, `users/${ALICE}/sessions/${id}`)));
    await assertFails(getDocs(collection(other, `users/${ALICE}/sessions`)));
    await assertFails(getDoc(doc(other, `users/${ALICE}/meta/profile`)));
    await assertFails(setDoc(doc(other, `users/${ALICE}/sessions/${id}`), data));
    await assertFails(setDoc(doc(other, `users/${ALICE}/meta/profile`), realProfile()));
  }
});

test('documents are never deleted, only tombstoned', async () => {
  const { id, data } = realSession();
  await seed(`users/${ALICE}/sessions/${id}`, data);
  await seed(`users/${ALICE}/meta/profile`, realProfile());
  await assertFails(deleteDoc(doc(db(ALICE), `users/${ALICE}/sessions/${id}`)));
  await assertFails(deleteDoc(doc(db(ALICE), `users/${ALICE}/meta/profile`)));
});

test('malformed sessions are refused', async () => {
  const { id, data } = realSession();
  const a = db(ALICE);
  const path = (x = id) => doc(a, `users/${ALICE}/sessions/${x}`);
  await assertFails(setDoc(path(), { ...data, extra: 1 }));
  await assertFails(setDoc(path(), { ...data, date: '17/11/2026' }));
  await assertFails(setDoc(path(), { ...data, dayId: 'DAY-TOO-LONG' }));
  await assertFails(setDoc(path(), { ...data, xp: 100001 }));
  await assertFails(setDoc(path(), { ...data, xp: -1 }));
  await assertFails(setDoc(path(), { ...data, updatedAt: 'now' }));
  await assertFails(setDoc(path(), { ...data, sets: 'x' }));
  await assertFails(setDoc(path(), { ...data, deleted: true }));
  await assertFails(setDoc(path(), { deleted: true, updatedAt: 1, date: '2026-11-17' }));
  await assertFails(setDoc(path('bad.id'), data));
  await assertFails(setDoc(path('x'.repeat(65)), data));
});

test('malformed profiles are refused; one without body data is fine', async () => {
  const a = db(ALICE);
  const ref = doc(a, `users/${ALICE}/meta/profile`);
  const p = realProfile();
  const { body, ...withoutBody } = p;
  await assertSucceeds(setDoc(ref, withoutBody));
  await assertFails(setDoc(ref, { ...p, email: 'x@y.z' }));
  await assertFails(setDoc(ref, { ...p, startXp: -1 }));
  await assertFails(setDoc(ref, { ...p, weightKg: '95' }));
  await assertFails(setDoc(ref, { ...p, weights: {} }));
  await assertFails(setDoc(ref, { ...p, body: 'x' }));
  await assertFails(setDoc(ref, { ...p, body: Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, i])) }));
});

test('every other path is closed', async () => {
  const a = db(ALICE);
  await assertFails(setDoc(doc(a, `users/${ALICE}`), { x: 1 }));
  await assertFails(getDoc(doc(a, `users/${ALICE}`)));
  await assertFails(setDoc(doc(a, `users/${ALICE}/meta/other`), { updatedAt: 1 }));
  await assertFails(setDoc(doc(a, `users/${ALICE}/photos/p1`), { updatedAt: 1 }));
  await assertFails(setDoc(doc(a, 'public/x'), { x: 1 }));
  await assertFails(getDocs(collection(a, 'users')));
});
