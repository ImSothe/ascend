// Local state: shape, sanitising, persistence and the mutations that the cloud
// copy needs to track. The storage key is prefixed because every GitHub Pages
// app of the same account shares one origin.
const KEY = 'ascend.v1';

export const REST_MIN = 30;
export const REST_MAX = 420;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const EXERCISE = /^[a-z0-9-]{1,40}$/;

export function emptyState() {
  return {
    version: 1,
    profile: { startXp: 0, weightKg: null, body: {} },
    sessions: [],      // live sessions, oldest first
    tombs: {},         // id of a deleted session -> time of the deletion
    weights: [],
    rest: {},          // exercise id -> seconds, when the person changed the recommendation
    starts: {},        // exercise id -> starting load in kg
    profileAt: 0,      // last edit of profile, weights, rest and starts (they travel together)
    dirty: { sessions: [], profile: false },   // what the cloud copy has not seen yet
    photos: [],        // progress photos on this device: { id, date }; the images live in IndexedDB
    draft: null,
  };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function cleanSets(sets, keepDone = true) {
  const out = {};
  if (!sets || typeof sets !== 'object') return out;
  for (const id of Object.keys(sets).slice(0, 30)) {
    if (!EXERCISE.test(id) || !Array.isArray(sets[id])) continue;
    out[id] = sets[id].slice(0, 12).map((s) => {
      const row = { kg: num(s?.kg), reps: Number.isInteger(s?.reps) ? s.reps : null };
      if (keepDone) row.done = s?.done === true;
      return row;
    });
  }
  return out;
}

export function cleanSession(s) {
  if (!s || !isDate(s.date) || typeof s.dayId !== 'string') return null;
  const dayId = s.dayId.slice(0, 4);
  return {
    id: typeof s.id === 'string' && ID.test(s.id) ? s.id : `${s.date}-${dayId.replace(/[^A-Za-z0-9]/g, '')}-0`,
    date: s.date, dayId, sets: cleanSets(s.sets),
    xp: Math.max(0, Math.min(100000, num(s.xp) ?? 0)),
    updatedAt: Math.max(0, num(s.updatedAt) ?? 0),
  };
}

/** Personal data the supervision uses. Every field is optional. */
export function cleanBody(raw) {
  const out = {};
  const pick = (k, min, max) => { const v = num(raw?.[k]); if (v != null && v >= min && v <= max) out[k] = Math.round(v * 10) / 10; };
  pick('age', 12, 100);
  pick('heightCm', 120, 230);
  pick('kcal', 800, 6000);
  pick('sleepH', 3, 14);
  if (typeof raw?.fat === 'string' && raw.fat.trim()) out.fat = raw.fat.trim().slice(0, 80);
  return out;
}

/** Profile, weights, rest and starts: the part of the state that syncs as one record. */
export function cleanProfileGroup(raw) {
  const out = { profile: { startXp: 0, weightKg: null, body: cleanBody(raw?.profile?.body) }, weights: [], rest: {}, starts: {}, profileAt: Math.max(0, num(raw?.profileAt) ?? 0) };
  out.profile.startXp = Math.max(0, Math.min(10000000, num(raw?.profile?.startXp) ?? 0));
  out.profile.weightKg = num(raw?.profile?.weightKg);
  for (const w of Array.isArray(raw?.weights) ? raw.weights.slice(0, 2000) : []) {
    const kg = num(w?.kg);
    if (isDate(w?.date) && kg && kg > 20 && kg < 400) out.weights.push({ date: w.date, kg });
  }
  out.weights.sort((a, b) => a.date.localeCompare(b.date));
  const map = (src, min, max, round) => {
    const res = {};
    if (src && typeof src === 'object') for (const id of Object.keys(src).slice(0, 200)) {
      const v = num(src[id]);
      if (EXERCISE.test(id) && v != null && v >= min && v <= max) res[id] = round ? Math.round(v) : v;
    }
    return res;
  };
  out.rest = map(raw?.rest, REST_MIN, REST_MAX, true);
  out.starts = map(raw?.starts, 0, 999, false);
  return out;
}

/** Accept only the shape this app writes; anything else falls back to empty. */
export function sanitize(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return base;
  Object.assign(base, cleanProfileGroup(raw));
  const seen = new Set();
  for (const s of Array.isArray(raw.sessions) ? raw.sessions : []) {
    const clean = cleanSession(s);
    if (!clean) continue;
    while (seen.has(clean.id)) clean.id = `${clean.id.slice(0, 60)}x`;
    seen.add(clean.id);
    base.sessions.push(clean);
  }
  base.sessions.sort(bySessionOrder);
  if (raw.tombs && typeof raw.tombs === 'object') for (const id of Object.keys(raw.tombs)) {
    const at = num(raw.tombs[id]);
    if (ID.test(id) && at != null && at >= 0 && !seen.has(id)) base.tombs[id] = at;
  }
  if (Array.isArray(raw.dirty?.sessions)) base.dirty.sessions = [...new Set(raw.dirty.sessions.filter((id) => typeof id === 'string' && ID.test(id)))];
  base.dirty.profile = raw.dirty?.profile === true;
  for (const p of Array.isArray(raw.photos) ? raw.photos.slice(-500) : []) {
    if (p && typeof p.id === 'string' && ID.test(p.id) && isDate(p.date)) base.photos.push({ id: p.id, date: p.date });
  }
  base.photos.sort((a, b) => a.date.localeCompare(b.date));
  if (raw.draft && typeof raw.draft.dayId === 'string') {
    base.draft = { dayId: raw.draft.dayId.slice(0, 4), sets: cleanSets(raw.draft.sets) };
  }
  return base;
}

export const bySessionOrder = (a, b) => a.date.localeCompare(b.date) || a.updatedAt - b.updatedAt || a.id.localeCompare(b.id);

// ── Mutations (every one marks what the cloud copy still has to learn) ────
const markSession = (state, id) => { if (!state.dirty.sessions.includes(id)) state.dirty.sessions.push(id); };

export function addSession(state, { date, dayId, sets, xp }, now = Date.now()) {
  const session = { id: `${date}-${dayId}-${now.toString(36)}`, date, dayId, sets, xp, updatedAt: now };
  state.sessions.push(session);
  state.sessions.sort(bySessionOrder);
  markSession(state, session.id);
  return session;
}

export function removeSession(state, id, now = Date.now()) {
  const i = state.sessions.findIndex((s) => s.id === id);
  if (i < 0) return false;
  state.sessions.splice(i, 1);
  state.tombs[id] = now;
  markSession(state, id);
  return true;
}

/** Call after editing profile, weights, rest or starts. */
export function touchProfile(state, now = Date.now()) {
  state.profileAt = now;
  state.dirty.profile = true;
}

/** Erase everything, in a way that also erases the cloud copy on the next sync. */
export function wipe(state, now = Date.now()) {
  const next = emptyState();
  next.tombs = { ...state.tombs };
  for (const s of state.sessions) next.tombs[s.id] = now;
  next.dirty.sessions = Object.keys(next.tombs);
  next.photos = state.photos;        // the images are deleted by the caller, on this device
  touchProfile(next, now);
  return next;
}

/** A backup read from a file replaces the local data and wins over the cloud copy. */
export function adopt(state, imported, now = Date.now()) {
  const next = sanitize(imported);
  for (const s of next.sessions) s.updatedAt = now;
  const ids = new Set(next.sessions.map((s) => s.id));
  for (const s of state.sessions) if (!ids.has(s.id)) next.tombs[s.id] = now;
  for (const id of Object.keys(state.tombs)) if (!ids.has(id)) next.tombs[id] ??= state.tombs[id];
  for (const id of ids) delete next.tombs[id];
  next.dirty.sessions = [...ids, ...Object.keys(next.tombs)];
  touchProfile(next, now);
  next.draft = null;
  next.photos = state.photos;        // a backup file carries no images
  return next;
}

export const hasData = (state) => state.sessions.length > 0 || state.weights.length > 0 || Object.keys(state.starts).length > 0;

export function load(storage = globalThis.localStorage) {
  try {
    return sanitize(JSON.parse(storage.getItem(KEY)));
  } catch {
    return emptyState();
  }
}

export function save(state, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
