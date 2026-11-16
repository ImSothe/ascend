// Experience, levels, ranks, streak and the four stat bars. Pure functions.
import { DAYS, EXERCISES, WEEKLY_SESSIONS, WEEKLY_SETS } from './program.js';
import { validSets, earnedLoadUp, bestE1rm, e1rm } from './progression.js';

export const XP_PER_SET = 10;
export const XP_LOAD_UP = 30;
export const XP_COMPLETE = 100;

export const RANKS = [
  { id: 'E', min: 1, name: 'Rango E', title: 'Recién despertado', note: 'Aprendes a registrar cada serie. La constancia vale más que la carga.' },
  { id: 'D', min: 5, name: 'Rango D', title: 'Cazador en formación', note: 'Entrenas las cuatro sesiones. Las piernas ya no se saltan.' },
  { id: 'C', min: 12, name: 'Rango C', title: 'Cazador probado', note: 'Tres meses sin romper la racha. Las cargas suben cada pocas semanas.' },
  { id: 'B', min: 22, name: 'Rango B', title: 'Élite', note: 'Un año de trabajo serio. El cambio se ve con la camiseta puesta.' },
  { id: 'A', min: 35, name: 'Rango A', title: 'Clase alta', note: 'Dos años de sobrecarga progresiva. Físico que pocos alcanzan.' },
  { id: 'S', min: 50, name: 'Rango S', title: 'Cima', note: 'Más de tres años sin excusas. No hay atajo hasta aquí.' },
];

/** Total XP needed to reach a level. Level 1 costs nothing. */
export const xpForLevel = (level) => 100 * (level - 1) ** 2;

export function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
}

export function rankForLevel(level) {
  let rank = RANKS[0];
  for (const r of RANKS) if (level >= r.min) rank = r;
  return rank;
}

/** Everything the HUD needs to draw the level bar and the road to the next rank. */
export function progress(xp) {
  const level = levelFromXp(xp);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  const rank = rankForLevel(level);
  const next = RANKS[RANKS.indexOf(rank) + 1] ?? null;
  const rankFloor = xpForLevel(rank.min);
  const rankCeil = next ? xpForLevel(next.min) : null;
  return {
    xp, level, rank, next,
    levelPct: (xp - floor) / (ceil - floor),
    xpToLevel: ceil - xp,
    rankPct: rankCeil ? (xp - rankFloor) / (rankCeil - rankFloor) : 1,
    xpToRank: rankCeil ? rankCeil - xp : 0,
  };
}

/** XP earned by one session. */
export function sessionXp(day, sets) {
  let total = 0;
  let complete = true;
  let loadUps = 0;
  let count = 0;
  for (const exercise of day.exercises) {
    const done = validSets(sets?.[exercise.id]);
    count += done.length;
    if (done.length < exercise.sets) complete = false;
    if (earnedLoadUp(exercise, done)) loadUps++;
  }
  total += count * XP_PER_SET + loadUps * XP_LOAD_UP + (complete && count ? XP_COMPLETE : 0);
  return { total, sets: count, loadUps, complete: complete && count > 0 };
}

export function totalXp(state) {
  return (state.profile?.startXp ?? 0) + state.sessions.reduce((n, s) => n + (s.xp ?? 0), 0);
}

/** Typical XP of a full session, to turn "XP left" into "sessions left". */
export function averageSessionXp(sessions) {
  const recent = sessions.slice(-8).filter((s) => s.xp > 0);
  if (recent.length) return recent.reduce((n, s) => n + s.xp, 0) / recent.length;
  return (WEEKLY_SETS * XP_PER_SET) / WEEKLY_SESSIONS + XP_COMPLETE;
}

// ── Dates ────────────────────────────────────────────────────────────────
export function isoDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** ISO date of the Monday of the week that contains the date. */
export function weekStart(iso) {
  const d = parseDate(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDate(d);
}

export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

/**
 * Consecutive weeks with every planned session done. The current week counts
 * once it is complete and never breaks the chain while it is still open.
 */
export function weekStreak(sessions, today, target = WEEKLY_SESSIONS) {
  const perWeek = new Map();
  for (const s of sessions) perWeek.set(weekStart(s.date), (perWeek.get(weekStart(s.date)) ?? 0) + 1);
  const cursor = parseDate(weekStart(today));
  const thisWeek = perWeek.get(isoDate(cursor)) ?? 0;
  let streak = thisWeek >= target ? 1 : 0;
  for (;;) {
    cursor.setDate(cursor.getDate() - 7);
    if ((perWeek.get(isoDate(cursor)) ?? 0) < target) break;
    streak++;
  }
  return { weeks: streak, thisWeek, target };
}

// ── Stats ────────────────────────────────────────────────────────────────
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

function strength(sessions, group, starts) {
  const scores = [];
  const ids = new Set(DAYS.filter((d) => d.group === group).flatMap((d) => d.exercises.map((e) => e.id)));
  {
    for (const exercise of EXERCISES) {
      if (!ids.has(exercise.id) || !exercise.ref) continue;
      let best = 0;
      for (const s of sessions) best = Math.max(best, bestE1rm(s.sets?.[exercise.id]));
      if (!best && starts[exercise.id]) best = e1rm(starts[exercise.id], exercise.min);
      scores.push(Math.min(1, best / e1rm(exercise.ref, exercise.min)));
    }
  }
  return scores.length ? clamp((100 * scores.reduce((a, b) => a + b, 0)) / scores.length) : 0;
}

/**
 * FUE: upper-body loads against the reference. AGI: lower-body loads.
 * RES: hard sets in the last 7 days against the plan. VIT: sessions in the
 * last 28 days against the plan.
 */
export function stats(sessions, today, starts = {}) {
  let sets7 = 0;
  let sessions28 = 0;
  for (const s of sessions) {
    const age = daysBetween(s.date, today);
    if (age < 0) continue;
    if (age < 7) for (const id in s.sets) sets7 += validSets(s.sets[id]).length;
    if (age < 28) sessions28++;
  }
  return {
    FUE: strength(sessions, 'torso', starts),
    AGI: strength(sessions, 'pierna', starts),
    RES: clamp((100 * sets7) / WEEKLY_SETS),
    VIT: clamp((100 * sessions28) / (WEEKLY_SESSIONS * 4)),
  };
}

/** One line from the System about the current state of discipline. */
export function systemMessage(sessions, today) {
  if (!sessions.length) return { tone: 'info', text: 'Evaluación inicial pendiente. Completa la primera misión para calibrar tus cargas.' };
  const idle = daysBetween(sessions[sessions.length - 1].date, today);
  if (idle >= 7) return { tone: 'alert', text: `${idle} días sin registrar una misión. La racha está rota. Vuelve hoy.` };
  if (idle >= 4) return { tone: 'warn', text: `${idle} días de inactividad. Riesgo de brecha: entrena hoy para salvar la semana.` };
  if (idle === 0) return { tone: 'ok', text: 'Misión de hoy completada. Come proteína, duerme 7 horas y vuelve.' };
  return { tone: 'info', text: 'El Sistema espera tu siguiente misión.' };
}
