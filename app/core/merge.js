// Merge of the local state with what the cloud holds. Pure: no network, no
// clock. The newest edit wins per session, deletions travel as tombstones, and
// profile, weights, rest and starts travel as one record. Running it twice, or
// from two devices in any order, converges to the same data.
import { cleanSession, cleanSets, cleanProfileGroup, bySessionOrder } from './store.js';

/** Session -> Firestore document. */
export function sessionDoc(s) {
  return { date: s.date, dayId: s.dayId, sets: cleanSets(s.sets, false), xp: s.xp, updatedAt: s.updatedAt, deleted: false };
}

export function tombDoc(at) {
  return { deleted: true, updatedAt: at };
}

export function profileDoc(state) {
  return {
    startXp: state.profile.startXp, weightKg: state.profile.weightKg, body: state.profile.body ?? {},
    weights: state.weights, rest: state.rest, starts: state.starts, updatedAt: state.profileAt,
  };
}

/**
 * Read what came from the cloud. Nothing in it is trusted: every record goes
 * through the same cleaning as a local file.
 * @param {{id:string,data:object}[]} docs  session documents
 * @param {object|null} profile             the profile document, if any
 */
export function readRemote(docs, profile) {
  const remote = { sessions: [], tombs: {}, group: null };
  for (const { id, data } of docs) {
    const at = typeof data?.updatedAt === 'number' && Number.isFinite(data.updatedAt) ? Math.max(0, data.updatedAt) : 0;
    if (data?.deleted === true) { remote.tombs[id] = at; continue; }
    const s = cleanSession({ ...data, id });
    if (s && s.id === id) {
      for (const rows of Object.values(s.sets)) for (const r of rows) r.done = true;
      remote.sessions.push(s);
    }
  }
  if (profile && typeof profile === 'object') {
    remote.group = cleanProfileGroup({
      profile: { startXp: profile.startXp, weightKg: profile.weightKg, body: profile.body },
      weights: profile.weights, rest: profile.rest, starts: profile.starts, profileAt: profile.updatedAt,
    });
  }
  return remote;
}

/**
 * @param {object} local   sanitised local state
 * @param {object} remote  result of readRemote
 * @param {boolean} full   the pull read everything (first sync of this account on this device)
 * @returns {{state:object, push:{sessions:object[], tombs:[string,number][], profile:boolean}}}
 */
export function mergeState(local, remote, full) {
  const tombs = { ...local.tombs };
  for (const [id, at] of Object.entries(remote.tombs)) tombs[id] = Math.max(tombs[id] ?? 0, at);

  const byId = new Map(local.sessions.map((s) => [s.id, s]));
  const remoteAt = new Map(remote.sessions.map((s) => [s.id, s.updatedAt]));
  for (const s of remote.sessions) {
    const mine = byId.get(s.id);
    if (!mine || s.updatedAt > mine.updatedAt) byId.set(s.id, s);
  }
  // A session edited after its deletion comes back; otherwise the tombstone wins.
  for (const [id, s] of byId) {
    if (id in tombs) { if (tombs[id] >= s.updatedAt) byId.delete(id); else delete tombs[id]; }
  }

  const remoteWins = remote.group && remote.group.profileAt > local.profileAt;
  const group = remoteWins ? remote.group : { profile: local.profile, weights: local.weights, rest: local.rest, starts: local.starts, profileAt: local.profileAt };

  const state = { ...local, ...group, sessions: [...byId.values()].sort(bySessionOrder), tombs, dirty: { sessions: [], profile: false } };

  // What the cloud does not have yet. After a partial pull only the records
  // edited on this device can be newer than the cloud's.
  const candidates = full ? new Set([...byId.keys(), ...Object.keys(tombs)]) : new Set(local.dirty.sessions);
  const push = { sessions: [], tombs: [], profile: false };
  for (const id of candidates) {
    const s = byId.get(id);
    if (s) { if (!(remoteAt.get(id) >= s.updatedAt)) push.sessions.push(s); }
    else if (id in tombs && !(remote.tombs[id] >= tombs[id])) push.tombs.push([id, tombs[id]]);
  }
  push.profile = !remoteWins && state.profileAt > 0 && (full ? !(remote.group?.profileAt >= state.profileAt) : local.dirty.profile);
  return { state, push };
}
