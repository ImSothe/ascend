// Double progression: stay at a load until every set reaches the top of the
// rep range, then add the smallest plate. Pure functions, no I/O.

/** Sets that count: a positive number of reps and a non-negative load. */
export function validSets(sets) {
  return (sets ?? []).filter((s) => s && Number.isFinite(s.kg) && s.kg >= 0 && Number.isInteger(s.reps) && s.reps > 0);
}

/** Epley estimate of the one-rep max. Capped at 20 reps, where it stops meaning anything. */
export function e1rm(kg, reps) {
  return kg * (1 + Math.min(reps, 20) / 30);
}

export function bestE1rm(sets) {
  return validSets(sets).reduce((best, s) => Math.max(best, e1rm(s.kg, s.reps)), 0);
}

/** True when the performance earns a heavier load next time. */
export function earnedLoadUp(exercise, sets) {
  const done = validSets(sets);
  if (done.length < exercise.sets) return false;
  const top = Math.max(...done.map((s) => s.kg));
  const atTop = done.filter((s) => s.kg === top);
  return atTop.length >= exercise.sets && atTop.every((s) => s.reps >= exercise.max);
}

/**
 * What to do today, given the last time this exercise was trained.
 * `start` is the person's own starting load, used until there is a history.
 * @returns {{state:'CAL'|'UP'|'HOLD'|'ECC', kg:number|null, target:string}}
 */
export function verdict(exercise, lastSets, start = null) {
  const done = validSets(lastSets);
  if (!done.length) return { state: 'CAL', kg: start, target: `${exercise.min}-${exercise.max}` };
  const top = Math.max(...done.map((s) => s.kg));
  if (earnedLoadUp(exercise, done)) {
    return { state: 'UP', kg: round(top + exercise.inc), target: `${exercise.min}+` };
  }
  if (done.some((s) => s.kg === top && s.reps < exercise.min)) {
    return { state: 'ECC', kg: top, target: `${exercise.min}+` };
  }
  const total = done.filter((s) => s.kg === top).reduce((n, s) => n + s.reps, 0);
  return { state: 'HOLD', kg: top, target: `${total + 1} reps en total` };
}

/** Sets of the most recent session that trained the exercise, or null. */
export function lastSetsFor(sessions, exerciseId) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const sets = validSets(sessions[i].sets?.[exerciseId]);
    if (sets.length) return sets;
  }
  return null;
}

/** Best estimated 1RM per session, oldest first, for the trend line. */
export function history(sessions, exerciseId) {
  const out = [];
  for (const s of sessions) {
    const best = bestE1rm(s.sets?.[exerciseId]);
    if (best > 0) out.push({ date: s.date, value: best });
  }
  return out;
}

const round = (n) => Math.round(n * 100) / 100;
