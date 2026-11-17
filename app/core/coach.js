// Progress supervision. Pure rules over the log: stalls, regressions, missed
// sessions, incomplete missions, body-weight trend, weigh-ins, progress photos
// and deloads. These are deterministic and tested; the AI review only
// comments on top of them, it never replaces them.
import { DAYS, EXERCISES, ALL_EXERCISES, optionsFor, planDay, WEEKLY_SESSIONS } from './program.js';
import { validSets, history, e1rm } from './progression.js';
import { weekStreak, daysBetween, parseDate, isoDate } from './player.js';

export const PHOTO_EVERY_DAYS = 14;
export const WEIGH_EVERY_DAYS = 7;
const RANK = { alert: 0, warn: 1, info: 2, ok: 3 };

const roundDown = (kg, step) => Math.max(0, Math.floor(kg / (step || 1)) * (step || 1));
const r2 = (n) => Math.round(n * 100) / 100;

/** Sessions that trained the exercise, oldest first, with their valid sets. */
function trainings(sessions, id) {
  const out = [];
  for (const s of sessions) {
    const sets = validSets(s.sets?.[id]);
    if (sets.length) out.push({ date: s.date, sets });
  }
  return out;
}

/** Three sessions in a row at the same load without adding reps. */
export function stalls(sessions) {
  const out = [];
  for (const e of ALL_EXERCISES) {
    const t = trainings(sessions, e.id).slice(-3);
    if (t.length < 3) continue;
    const tops = t.map((x) => Math.max(...x.sets.map((s) => s.kg)));
    if (!tops.every((k) => k === tops[0]) || tops[0] <= 0) continue;
    const reps = t.map((x) => x.sets.filter((s) => s.kg === tops[0]).reduce((n, s) => n + s.reps, 0));
    if (reps[2] > reps[0]) continue;
    out.push({ exercise: e, kg: tops[0], deloadKg: r2(roundDown(tops[0] * 0.9, e.inc)) });
  }
  return out;
}

/**
 * Main lifts whose current choice has gone six sessions (within eight weeks)
 * without beating the best of the three before: time for the next variant.
 */
export function plateaus(sessions, swaps = {}, today) {
  const out = [];
  for (const base of EXERCISES) {
    const list = optionsFor(base.id);
    if (list.length < 2) continue;
    const cur = list.find((e) => e.id === swaps[base.id]) ?? base;
    const h = history(sessions, cur.id).filter((p) => { const age = daysBetween(p.date, today); return age >= 0 && age <= 56; });
    if (h.length < 6) continue;
    const six = h.slice(-6).map((p) => p.value);
    if (Math.max(...six.slice(3)) > Math.max(...six.slice(0, 3)) * 1.01) continue;
    out.push({ base, from: cur, to: list[(list.indexOf(cur) + 1) % list.length] });
  }
  return out;
}

/** Last estimated 1RM more than 7 % under the best of the three before it. */
export function regressions(sessions) {
  const out = [];
  for (const e of ALL_EXERCISES) {
    const h = history(sessions, e.id);
    if (h.length < 4) continue;
    const last = h[h.length - 1].value;
    const best = Math.max(...h.slice(-4, -1).map((p) => p.value));
    if (last < best * 0.93) out.push({ exercise: e, dropPct: Math.round((1 - last / best) * 100) });
  }
  return out;
}

/** Weekly rate of body-weight change over the last 4 weeks, in % per week. */
export function weightTrend(weights, today) {
  const recent = weights.filter((w) => { const age = daysBetween(w.date, today); return age >= 0 && age <= 28; });
  if (recent.length < 2) return null;
  const first = recent[0], last = recent[recent.length - 1];
  const span = daysBetween(first.date, last.date);
  if (span < 10) return null;
  return { ratePct: r2(((last.kg - first.kg) / first.kg / (span / 7)) * 100), spanDays: span, fromKg: first.kg, toKg: last.kg };
}

/**
 * @param {object} state  sanitised state (sessions, weights, profile, photos)
 * @param {string} today  ISO date
 * @returns {{level:'alert'|'warn'|'info'|'ok', code:string, title:string, text:string, action?:string}[]}
 */
export function review(state, today) {
  const f = [];
  const add = (level, code, title, text, action, extra) => f.push({ level, code, title, text, ...(action ? { action } : {}), ...extra });
  const sessions = state.sessions;
  const body = state.profile.body ?? {};

  if (!body.age || !body.heightCm) add('info', 'body', 'Completa tus datos', 'Edad y altura afinan la supervisión y la revisión con IA.', 'body');

  // This week's missions against the days left.
  if (sessions.length) {
    const { thisWeek } = weekStreak(sessions, today);
    const dow = (parseDate(today).getDay() + 6) % 7;              // Monday = 0
    const left = Math.max(0, WEEKLY_SESSIONS - thisWeek);
    const daysLeft = 7 - dow;
    const trainedToday = sessions.some((s) => s.date === today);
    const usable = daysLeft - (trainedToday ? 1 : 0);
    if (left > usable) add('alert', 'week', 'La semana no llega a 4 misiones', `Llevas ${thisWeek}/${WEEKLY_SESSIONS} y quedan ${usable} días. Haz las que puedas: prioriza ${nextGroups(sessions)}.`);
    else if (left > 0 && left === usable) add('warn', 'week', 'Sin margen esta semana', `Te faltan ${left} misiones y quedan ${usable} días: hoy toca entrenar.`);
  }

  // The last mission, completed or not.
  const last = sessions[sessions.length - 1];
  if (last) {
    const day = planDay(last.dayId, state.swaps);
    const planned = day.exercises.reduce((n, e) => n + e.sets, 0);
    const done = day.exercises.reduce((n, e) => n + Math.min(e.sets, validSets(last.sets?.[e.id]).length), 0);
    if (done < planned * 0.75) add('warn', 'incomplete', 'Última misión incompleta', `${day.name}: ${done}/${planned} series. Si faltó tiempo, quita un ejercicio de aislamiento, no las series de los básicos.`);
  }

  for (const s of stalls(sessions)) {
    add('warn', 'stall', `Estancado en ${s.exercise.name}`, `Tres sesiones con ${s.kg} kg sin sumar repeticiones. Baja a ${s.deloadKg} kg, haz el rango completo con técnica estricta y vuelve a subir.`);
  }
  for (const r of regressions(sessions)) {
    add('warn', 'regress', `${r.exercise.name} va a peor`, `Tu fuerza estimada cayó un ${r.dropPct} % respecto a tus últimas sesiones. Revisa sueño, comida y que llegues descansado.`);
  }

  const flat = plateaus(sessions, state.swaps, today);
  for (const p of flat) {
    add('warn', 'swap', `Cambia ${p.from.name}`, `Seis sesiones sin superar tu mejor marca, también tras la descarga. Cámbialo por ${p.to.name}: mismo músculo, estímulo nuevo. Tu historial de ${p.from.name} se guarda.`, 'swap', { swap: { base: p.base.id, to: p.to.id } });
  }
  if (flat.length >= 4) add('alert', 'routine', 'Rutina estancada', `${flat.length} ejercicios principales sin progresar. Haz una semana de descarga (mismas cargas, mitad de series) y aplica los cambios de ejercicio. Revisa sueño y kcal.`);

  // Body weight.
  const lastW = state.weights[state.weights.length - 1];
  if (!lastW) add('info', 'weigh', 'Pésate', 'Una vez por semana, en ayunas, mismo día. Sin peso no se puede vigilar la recomposición.', 'weigh');
  else if (daysBetween(lastW.date, today) >= WEIGH_EVERY_DAYS) add('info', 'weigh', 'Toca pesarse', `Último registro hace ${daysBetween(lastW.date, today)} días.`, 'weigh');
  const trend = weightTrend(state.weights, today);
  if (trend) {
    if (trend.ratePct < -1) add('warn', 'weight', 'Bajas demasiado rápido', `${trend.ratePct} % por semana. Por encima del 1 % se pierde músculo: sube unas 150 kcal al día.`);
    else if (trend.ratePct > 0.3) add('warn', 'weight', 'Estás subiendo de peso', `+${trend.ratePct} % por semana en recomposición. Revisa las kcal en foodie.`);
    else if (trend.ratePct > -0.2 && trend.spanDays >= 21) add('info', 'weight', 'Peso estable 3 semanas', 'Si tus cargas suben, es recomposición y va bien. Si también están paradas, baja 150 kcal o suma 2.000 pasos al día.');
  }

  // Progress photos.
  const photos = state.photos ?? [];
  const lastPhoto = photos[photos.length - 1];
  if (!lastPhoto) add('info', 'photo', 'Primera foto de progreso', 'Frente y perfil, misma luz y postura. La app te la pedirá cada 14 días.', 'photo');
  else if (daysBetween(lastPhoto.date, today) >= PHOTO_EVERY_DAYS) add('warn', 'photo', 'Toca foto de progreso', `Han pasado ${daysBetween(lastPhoto.date, today)} días desde la última. Misma luz y postura que la primera.`, 'photo');

  // Deload after a long block of complete weeks.
  const streak = weekStreak(sessions, today).weeks;
  if (streak >= 6) add('info', 'deload', 'Semana de descarga', `${streak} semanas completas seguidas. La próxima: mismas cargas, la mitad de series, y vuelve con más fuerza.`);

  if (!f.length) add('ok', 'ok', 'Todo en orden', sessions.length ? 'Sigues el plan y las cargas avanzan. Sigue así.' : 'Completa tu primera misión para empezar la supervisión.');
  return f.sort((a, b) => RANK[a.level] - RANK[b.level]);
}

function nextGroups(sessions) {
  const done = new Set(sessions.slice(-4).map((s) => s.dayId));
  const missing = DAYS.filter((d) => !done.has(d.id)).map((d) => d.name.toLowerCase());
  return missing.length ? missing.join(' y ') : 'pierna';
}

/**
 * The data the AI review sees: no names, no email, no ids. Loads per exercise
 * for the last sessions, weekly attendance, weights and the rule findings.
 */
export function aiSummary(state, today, findings = review(state, today)) {
  const body = state.profile.body ?? {};
  const exercises = [];
  for (const e of ALL_EXERCISES) {
    const t = trainings(state.sessions, e.id).slice(-4);
    if (!t.length) continue;
    exercises.push({
      ejercicio: e.name, rango: `${e.sets}x${e.min}-${e.max}`,
      sesiones: t.map((x) => `${x.date}: ${x.sets.map((s) => `${s.kg}x${s.reps}`).join(' ')}`),
      e1rm: Math.round(Math.max(...t[t.length - 1].sets.map((s) => e1rm(s.kg, s.reps)))),
    });
  }
  const weeks = [];
  for (let i = 3; i >= 0; i--) {
    const end = new Date(parseDate(today)); end.setDate(end.getDate() - 7 * i);
    const endIso = isoDate(end);
    weeks.push(state.sessions.filter((s) => { const age = daysBetween(s.date, endIso); return age >= 0 && age < 7; }).length);
  }
  return {
    hoy: today,
    perfil: {
      edad: body.age ?? null, alturaCm: body.heightCm ?? null, pesoKg: state.weights.at(-1)?.kg ?? state.profile.weightKg ?? null,
      kcalDiarias: body.kcal ?? null, suenoHoras: body.sleepH ?? null, acumulaGrasaEn: body.fat || null, objetivo: 'recomposición',
    },
    plan: DAYS.map((d) => d.name),
    misionesPorSemana: { objetivo: WEEKLY_SESSIONS, ultimas4: weeks },
    pesos: state.weights.slice(-8).map((w) => `${w.date}: ${w.kg}`),
    ejercicios: exercises,
    avisosDelSistema: findings.filter((x) => x.level !== 'ok').map((x) => `${x.title}. ${x.text}`),
    fotos: (state.photos ?? []).length,
  };
}
