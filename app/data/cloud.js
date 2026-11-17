// Cloud copy: Google sign-in and sync with Firestore. Local-first: the app
// never waits for this. The Firebase SDK is loaded only when the person has
// signed in before or opens the account card, and a failed connection just
// leaves the data on the device.
//
// One sync = pull what changed in the cloud, merge it with the local data
// (core/merge.js), save the merge, then push only the difference.
import { FIREBASE_CONFIG } from './firebase-config.js';
import { mergeState, readRemote, sessionDoc, tombDoc, profileDoc } from '../core/merge.js';

const META_KEY = 'ascend.cloud';
const PULL_MARGIN_MS = 10 * 60 * 1000;   // devices' clocks differ a little: re-read the last few minutes
const PUSH_DELAY_MS = 3000;              // wait for a burst of edits to settle
const MIN_GAP_MS = 60 * 1000;            // do not sync on every tab switch
const BATCH = 400;

/** @typedef {'unconfigured'|'off'|'loading'|'signed-out'|'syncing'|'synced'|'offline'|'error'} CloudStatus */

/**
 * @param {object} deps
 * @param {() => object} deps.getState                 the live local state
 * @param {(next:object, changed:boolean) => void} deps.replaceState   adopt a merged state
 * @param {(fn:(state:object) => void) => void} deps.patchState        small bookkeeping edit, no redraw
 */
export function createCloud({ getState, replaceState, patchState, loadSdk = () => import('../vendor/firebase.js'),
  config = FIREBASE_CONFIG, storage = globalThis.localStorage, now = () => Date.now(), online = () => globalThis.navigator?.onLine !== false }) {
  const listeners = new Set();
  let sdk = null, sdkPromise = null, app = null, auth = null, db = null, user = null;
  let status = /** @type {CloudStatus} */ (config.apiKey ? 'off' : 'unconfigured');
  let lastError = '';
  let lastSyncAt = 0;
  let running = false, again = false, timer = 0;

  const readMeta = () => { try { return JSON.parse(storage.getItem(META_KEY)) ?? {}; } catch { return {}; } };
  const writeMeta = (m) => { try { storage.setItem(META_KEY, JSON.stringify(m)); } catch { /* storage full or blocked: sync still works, it just pulls everything next time */ } };
  const set = (next, error = '') => { status = next; lastError = error; for (const fn of [...listeners]) { try { fn(); } catch { /* a broken listener must not stop the sync */ } } };

  function prepare() {
    if (status === 'unconfigured') return Promise.reject(new Error('unconfigured'));
    if (!sdk && status !== 'loading') set('loading');
    sdkPromise ||= loadSdk().then((m) => {
      sdk = m;
      app = m.initializeApp(config);
      auth = m.initializeAuth(app, { persistence: [m.indexedDBLocalPersistence, m.browserLocalPersistence], popupRedirectResolver: m.browserPopupRedirectResolver });
      db = m.getFirestore(app);
      m.onAuthStateChanged(auth, onAuth);
      return m;
    }).catch((e) => {
      sdkPromise = null;
      // Offline at the gym is normal: wake() retries when the connection or the app comes back.
      if (online()) set('error', 'No se pudo cargar el inicio de sesión.'); else set('offline');
      throw e;
    });
    return sdkPromise;
  }

  function onAuth(u) {
    user = u;
    if (!u) { set('signed-out'); return; }
    writeMeta({ ...readMeta(), on: true });
    sync();
  }

  async function signIn() {
    try {
      const m = await prepare();
      await m.signInWithPopup(auth, new m.GoogleAuthProvider());
    } catch (e) {
      const code = String(e?.code ?? '');
      if (code.includes('popup-closed') || code.includes('cancelled-popup')) set('signed-out');
      else if (code.includes('popup-blocked')) set('signed-out', 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes y vuelve a intentarlo.');
      else if (status !== 'unconfigured') set('error', 'No se pudo iniciar sesión.');
    }
  }

  async function signOut() {
    clearTimeout(timer);
    writeMeta({});
    if (auth) await sdk.signOut(auth).catch(() => {});
    user = null;
    set('signed-out');
  }

  async function sync() {
    if (!user || !sdk) return;
    if (running) { again = true; return; }
    running = true;
    set('syncing');
    try {
      const uid = user.uid;
      const meta = readMeta();
      const full = meta.uid !== uid;
      const started = now();
      const col = sdk.collection(db, 'users', uid, 'sessions');
      const since = Math.max(0, (meta.pulledAt ?? 0) - PULL_MARGIN_MS);
      const [snap, profileSnap] = await Promise.all([
        sdk.getDocs(full ? col : sdk.query(col, sdk.where('updatedAt', '>', since))),
        sdk.getDoc(sdk.doc(db, 'users', uid, 'meta', 'profile')),
      ]);
      const remote = readRemote(snap.docs.map((d) => ({ id: d.id, data: d.data() })), profileSnap.exists() ? profileSnap.data() : null);

      // No await between reading the local state and replacing it: an edit cannot slip in between.
      const local = getState();
      const { state, push } = mergeState(local, remote, full);
      const sent = new Map([...push.sessions.map((s) => [s.id, s.updatedAt]), ...push.tombs]);
      // Until the upload succeeds these stay marked, so a failure here is retried.
      state.dirty = { sessions: [...sent.keys()], profile: push.profile };
      const before = JSON.stringify([local.sessions, local.profile, local.weights, local.rest, local.starts]);
      const changed = before !== JSON.stringify([state.sessions, state.profile, state.weights, state.rest, state.starts]);
      const sentProfileAt = state.profileAt;
      const profile = push.profile ? profileDoc(state) : null;
      replaceState(state, changed);

      const writes = [
        ...push.sessions.map((s) => [sdk.doc(db, 'users', uid, 'sessions', s.id), sessionDoc(s)]),
        ...push.tombs.map(([id, at]) => [sdk.doc(db, 'users', uid, 'sessions', id), tombDoc(at)]),
      ];
      if (profile) writes.push([sdk.doc(db, 'users', uid, 'meta', 'profile'), profile]);
      for (let i = 0; i < writes.length; i += BATCH) {
        const batch = sdk.writeBatch(db);
        for (const [ref, data] of writes.slice(i, i + BATCH)) batch.set(ref, data);
        await batch.commit();
      }

      // Forget what was uploaded, unless it was edited again while the upload ran.
      patchState((s) => {
        const stamp = new Map(s.sessions.map((x) => [x.id, x.updatedAt]));
        s.dirty.sessions = s.dirty.sessions.filter((id) => !sent.has(id) || (stamp.get(id) ?? s.tombs[id]) !== sent.get(id));
        if (profile && s.profileAt === sentProfileAt) s.dirty.profile = false;
      });
      writeMeta({ on: true, uid, pulledAt: started });
      lastSyncAt = now();
      set('synced');
    } catch (e) {
      const code = String(e?.code ?? '');
      if (!online() || code.includes('unavailable') || code.includes('network')) set('offline');
      else if (code.includes('permission-denied')) set('error', 'La nube rechazó los datos. Tu copia local está intacta.');
      else set('error', 'No se pudo sincronizar. Tu copia local está intacta.');
    } finally {
      running = false;
      if (again) { again = false; schedule(); }
    }
  }

  /** Call after every local edit. */
  function schedule() {
    if (!user) return;
    clearTimeout(timer);
    timer = setTimeout(sync, PUSH_DELAY_MS);
  }

  /** Call when the app comes back to the foreground or the connection returns. */
  function wake() {
    if (!sdk) { if (readMeta().on) prepare().catch(() => {}); return; }
    if (user && now() - lastSyncAt > MIN_GAP_MS) sync();
  }

  // Somebody who signed in before gets their session back without tapping anything.
  if (status === 'off' && readMeta().on) prepare().catch(() => {});

  return {
    prepare, signIn, signOut, sync, schedule, wake,
    /** The initialised Firebase SDK and app, once loaded (the AI review reuses them). */
    firebase: () => (sdk && app ? { sdk, app } : null),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    get status() { return status; },
    get error() { return lastError; },
    get user() { return user ? { name: user.displayName ?? '', email: user.email ?? '' } : null; },
    get lastSyncAt() { return lastSyncAt; },
  };
}
