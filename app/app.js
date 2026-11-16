import { DAYS, EXERCISES, dayById, nextDayId, restReason, WEEKLY_SESSIONS } from './core/program.js';
import { verdict, lastSetsFor, history, validSets, earnedLoadUp } from './core/progression.js';
import {
  RANKS, XP_PER_SET, XP_LOAD_UP, XP_COMPLETE, xpForLevel, progress, sessionXp, totalXp, averageSessionXp,
  isoDate, parseDate, weekStreak, stats, systemMessage,
} from './core/player.js';
import { load, save, addSession, removeSession, touchProfile, wipe, adopt, hasData, REST_MIN, REST_MAX } from './core/store.js';
import { createCloud } from './data/cloud.js';

let state = load();
let tab = 'mission';
let calMonth = null; // first day of the month shown in the log
const today = () => isoDate(new Date());

// ── DOM helpers (no HTML strings: the CSP forbids inline anything) ───────
function build(el, attrs, children) {
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style') for (const [p, val] of Object.entries(v)) el.style.setProperty(p, val);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c);
  return el;
}
const h = (tag, attrs, ...children) => build(document.createElement(tag), attrs, children);
const s = (tag, attrs, ...children) => build(document.createElementNS('http://www.w3.org/2000/svg', tag), attrs, children);
const panel = (cls, ...children) => h('section', { class: `panel ${cls ?? ''}` }, h('div', { class: 'in' }, children));
const label = (text) => h('div', { class: 'label' }, text);

const kgText = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
const parseKg = (v) => { const t = String(v).trim().replace(',', '.'); return t === '' ? null : Number(t); };
const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const longDate = (iso) => parseDate(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const persist = () => { save(state); cloud.schedule(); };
const startFor = (e) => state.starts[e.id] ?? null;

// The cloud copy is optional and never blocks the app. A merge that arrives
// while a number is being typed must not rebuild the screen under the keyboard.
const cloud = createCloud({
  getState: () => state,
  replaceState: (next, changed) => {
    next.draft = state.draft;
    state = next;
    save(state);
    if (changed && !document.activeElement?.closest?.('.set, .field')) render();
  },
  patchState: (fn) => { fn(state); save(state); },
});
const restFor = (e) => state.rest[e.id] ?? e.rest;

function icon(path) {
  return s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: path }));
}
const ICONS = {
  mission: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 8v8M8.5 10l3.5 2 3.5-2',
  status: 'M12 4a8 8 0 1 0 8 8M12 12l5-5M12 8v4',
  road: 'M5 20V9l7-5 7 5v11M5 14h14M9 20v-6M15 20v-6',
  log: 'M5 5h14v15H5zM5 9h14M9 3v4M15 3v4M8.5 13h2M13.5 13h2M8.5 16.5h2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
};

function sparkline(points, cls = '') {
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const pts = points.map((p, i) => `${(i / (points.length - 1)) * 100},${26 - ((p - min) / span) * 24}`).join(' ');
  return s('svg', { viewBox: '0 0 100 28', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    s('polyline', { class: `spark ${cls} ${points.at(-1) > points[0] ? 'up' : ''}`, points: pts }));
}

// ── Shell ────────────────────────────────────────────────────────────────
const VIEWS = { mission: missionView, status: statusView, road: roadView, log: logView };
const TABS = [['mission', 'Misión'], ['status', 'Estado'], ['road', 'Camino'], ['log', 'Registro']];

function render() {
  const p = progress(totalXp(state));
  document.documentElement.dataset.rank = p.rank.id;
  document.getElementById('app').replaceChildren(hud(p), ...VIEWS[tab](p), tabBar());
  requestAnimationFrame(() => {
    for (const el of document.querySelectorAll('[data-w]')) el.style.setProperty('width', `${el.dataset.w}%`);
    for (const el of document.querySelectorAll('[data-off]')) el.style.setProperty('stroke-dashoffset', el.dataset.off);
  });
}

const fill = (pct, color) => h('i', { 'data-w': Math.max(0, Math.min(100, pct * 100)).toFixed(1), style: color ? { '--fill': color } : null });

function hud(p) {
  const streak = weekStreak(state.sessions, today());
  return panel('glow',
    h('div', { class: 'hud' },
      h('div', { class: 'hex', role: 'img', 'aria-label': p.rank.name }, h('span', null, p.rank.id)),
      h('div', null,
        h('div', { class: 'hud-title' }, 'Nivel ', h('b', null, String(p.level)), h('span', null, p.rank.title)),
        h('div', { class: 'bar' }, fill(p.levelPct)),
        h('div', { class: 'hud-sub' },
          h('span', null, `${p.xp.toLocaleString('es-ES')} XP`),
          h('span', null, `${p.xpToLevel.toLocaleString('es-ES')} para nivel ${p.level + 1}`))),
      h('div', { class: 'streak' },
        h('div', { class: 'num' }, String(streak.weeks)),
        h('div', { class: 'label' }, streak.weeks === 1 ? 'semana' : 'semanas'))));
}

function tabBar() {
  return h('nav', { class: 'tabs', 'aria-label': 'Secciones' }, TABS.map(([id, name]) =>
    h('button', { 'aria-current': tab === id ? 'page' : null, onclick: () => { tab = id; render(); scrollTo(0, 0); } }, icon(ICONS[id]), name)));
}

// ── Mission ──────────────────────────────────────────────────────────────
function newDraft(dayId) {
  const day = dayById(dayId);
  const sets = {};
  for (const e of day.exercises) {
    const v = verdict(e, lastSetsFor(state.sessions, e.id), startFor(e));
    sets[e.id] = Array.from({ length: e.sets }, () => ({ kg: v.kg, reps: null, done: false }));
  }
  return { dayId: day.id, sets };
}

const draftDone = () => Object.values(state.draft?.sets ?? {}).flat().filter((x) => x.done).length;

function missionView(p) {
  const t = today();
  const last = state.sessions.at(-1);
  const streak = weekStreak(state.sessions, t);
  const msg = systemMessage(state.sessions, t);
  const out = [
    h('div', { class: `banner ${msg.tone}`, role: 'status' }, h('span', { class: 'label' }, 'Sistema'), h('span', null, msg.text)),
    h('div', { class: 'week' }, label(`Semana ${Math.min(streak.thisWeek, streak.target)}/${streak.target}`),
      h('div', { class: 'pips' }, Array.from({ length: streak.target }, (_, i) => h('i', { class: i < streak.thisWeek ? 'on' : '' })))),
  ];

  if (!state.draft && last?.date === t) {
    const next = dayById(nextDayId(state.sessions));
    out.push(panel('sys',
      label('Misión diaria completada'),
      h('div', { class: 'mission-head' }, h('h1', null, dayById(last.dayId).name)),
      h('p', { class: 'dim small', style: { 'margin-top': '8px' } }, `Has ganado ${last.xp} XP hoy. Siguiente misión: ${next.name} (${next.focus.toLowerCase()}).`),
      h('button', { class: 'btn ghost', onclick: () => { state.draft = newDraft(next.id); persist(); render(); } }, 'Adelantar la siguiente misión')));
    return out;
  }

  if (!state.draft) state.draft = newDraft(nextDayId(state.sessions));
  const day = dayById(state.draft.dayId);
  const locked = draftDone() > 0;
  const totalSets = day.exercises.reduce((n, e) => n + e.sets, 0);

  const count = h('b', null, '');
  const reward = h('b', null, '');
  const finish = h('button', { class: 'btn', onclick: () => completeMission(p) }, 'Completar misión');
  const refresh = () => {
    const done = draftDone();
    count.textContent = `${done}/${totalSets}`;
    reward.textContent = `+${sessionXp(day, doneSets()).total} XP`;
    finish.disabled = done === 0;
    chips.querySelectorAll('button').forEach((b) => { b.disabled = done > 0 && b.getAttribute('aria-pressed') !== 'true'; });
  };

  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Elegir sesión' }, DAYS.map((d) =>
    h('button', {
      class: 'chip', 'aria-pressed': String(d.id === day.id), disabled: locked && d.id !== day.id,
      onclick: () => { if (d.id !== day.id) { state.draft = newDraft(d.id); persist(); render(); } },
    }, d.name)));

  out.push(chips, panel('sys',
    label('Misión diaria'),
    h('div', { class: 'mission-head' }, h('h1', null, day.name)),
    h('div', { class: 'dim small' }, day.focus),
    h('div', { class: 'mission-meta' }, h('span', null, 'Series ', count), h('span', null, 'Recompensa ', reward))));

  day.exercises.forEach((e, i) => out.push(exerciseCard(e, i, refresh)));
  out.push(finish);
  refresh();
  return out;
}

const VERDICT_TEXT = {
  UP: (e, v) => ['Sube de carga', `Hoy ${kgText(v.kg)} kg. Completaste el rango en todas las series.`],
  HOLD: (e, v) => ['Mantén', `${kgText(v.kg)} kg. Objetivo: ${v.target}.`],
  ECC: (e, v) => ['Mantén', `${kgText(v.kg)} kg con bajada de 3 s. Aún no llegas a ${e.min} repeticiones.`],
  CAL: (e, v) => ['Calibra', v.kg != null
    ? `Empieza con ${kgText(v.kg)} kg y técnica estricta.`
    : `Elige un peso para ${Math.round((e.min + e.max) / 2)} repeticiones dejando 2 en reserva.`],
};

function exerciseCard(e, index, refresh) {
  const lastSets = lastSetsFor(state.sessions, e.id);
  const v = verdict(e, lastSets, startFor(e));
  const [tag, text] = VERDICT_TEXT[v.state](e, v);
  const rows = state.draft.sets[e.id];
  const card = panel('ex');
  const body = card.firstChild;
  const trend = sparkline(history(state.sessions, e.id).slice(-8).map((x) => x.value));

  const mark = () => card.classList.toggle('done-all', rows.every((r) => r.done));
  build(body, null, [
    h('div', { class: 'ex-top' }, h('span', { class: 'idx' }, String(index + 1).padStart(2, '0')), h('h2', null, e.name)),
    h('div', { class: 'ex-spec' }, h('b', null, `${e.sets} × ${e.min}-${e.max}`), ` · RIR ${e.rir} · ${e.unit}`),
    h('div', { class: `verdict ${v.state}` }, h('span', { class: 'tag' }, tag), h('span', null, text)),
    lastSets && h('div', { class: 'ex-last' }, trend, h('span', null, `Última: ${lastSets.map((x) => `${kgText(x.kg)}×${x.reps}`).join(' · ')}`)),
    h('p', { class: 'cue' }, e.cue),
    restControl(e),
    h('div', { class: 'sets' }, rows.map((row, i) => setRow(e, row, i, () => { mark(); refresh(); })))]);
  mark();
  return card;
}

function setRow(e, row, i, changed) {
  const kg = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'kg', 'aria-label': `Serie ${i + 1}, kilos`, value: row.kg != null ? kgText(row.kg) : '', autocomplete: 'off' });
  const reps = h('input', { type: 'text', inputmode: 'numeric', placeholder: `${e.min}-${e.max}`, 'aria-label': `Serie ${i + 1}, repeticiones`, value: row.reps != null ? String(row.reps) : '', autocomplete: 'off' });
  const check = h('button', { class: 'check', 'aria-label': `Marcar serie ${i + 1}`, 'aria-pressed': String(row.done) }, icon(ICONS.check));
  const el = h('div', { class: `set ${row.done ? 'done' : ''}` }, h('span', { class: 'n' }, `S${i + 1}`), kg, h('span', { class: 'x' }, '×'), reps, check);

  const read = () => {
    const k = parseKg(kg.value);
    const r = reps.value.trim() === '' ? null : Number(reps.value);
    row.kg = k != null && Number.isFinite(k) && k >= 0 && k < 1000 ? k : null;
    row.reps = Number.isInteger(r) && r > 0 && r < 200 ? r : null;
  };
  const edit = () => {
    read();
    el.classList.remove('bad');
    if (row.done && (row.kg == null || row.reps == null)) { row.done = false; el.classList.remove('done'); check.setAttribute('aria-pressed', 'false'); }
    persist();
    changed();
  };
  kg.addEventListener('input', edit);
  reps.addEventListener('input', edit);
  check.addEventListener('click', () => {
    read();
    if (!row.done && (row.kg == null || row.reps == null)) { el.classList.add('bad'); (row.kg == null ? kg : reps).focus(); return; }
    row.done = !row.done;
    el.classList.toggle('done', row.done);
    check.setAttribute('aria-pressed', String(row.done));
    if (row.done) {
      // Carry the load to the sets that are still empty.
      const sib = state.draft.sets[e.id];
      const inputs = el.parentElement.querySelectorAll('.set');
      sib.forEach((o, j) => { if (j > i && !o.done && o.kg == null) { o.kg = row.kg; inputs[j].querySelector('input').value = kgText(row.kg); } });
      startRest(restFor(e), e.name);
    }
    persist();
    changed();
  });
  return el;
}

function restControl(e) {
  const time = h('b', { class: 'num' }, '');
  const why = h('span', { class: 'why' }, '');
  const draw = () => {
    const sec = restFor(e);
    time.textContent = clock(sec);
    why.textContent = `${restReason(sec)}.${sec !== e.rest ? ` Recomendado: ${clock(e.rest)}.` : ''}`;
  };
  const step = (d) => () => {
    const next = Math.max(REST_MIN, Math.min(REST_MAX, restFor(e) + d));
    if (next === e.rest) delete state.rest[e.id]; else state.rest[e.id] = next;
    touchProfile(state); persist(); draw();
  };
  draw();
  return h('div', { class: 'restctl' },
    h('div', { class: 'restctl-top' },
      label('Descanso'),
      h('button', { 'aria-label': 'Quitar 15 segundos de descanso', onclick: step(-15) }, '−'),
      time,
      h('button', { 'aria-label': 'Añadir 15 segundos de descanso', onclick: step(15) }, '+'),
      h('button', { class: 'go', onclick: () => startRest(restFor(e), e.name) }, 'Iniciar')),
    why);
}

function doneSets() {
  const out = {};
  for (const [id, rows] of Object.entries(state.draft.sets)) {
    const done = validSets(rows.filter((r) => r.done)).map((r) => ({ kg: r.kg, reps: r.reps, done: true }));
    if (done.length) out[id] = done;
  }
  return out;
}

function completeMission(before) {
  const day = dayById(state.draft.dayId);
  const sets = doneSets();
  const xp = sessionXp(day, sets);
  if (!xp.sets) return;
  addSession(state, { date: today(), dayId: day.id, sets, xp: xp.total });
  state.draft = null;
  persist();
  stopRest();
  const after = progress(totalXp(state));
  const ups = day.exercises.filter((e) => earnedLoadUp(e, sets[e.id])).map((e) => ({ e, v: verdict(e, sets[e.id]) }));
  render();
  showResult(day, xp, before, after, ups);
  scrollTo(0, 0);
}

function showResult(day, xp, before, after, ups) {
  const dlg = document.getElementById('result');
  const amount = h('div', { class: 'xp' }, '+0');
  const rankUp = after.rank.id !== before.rank.id;
  dlg.replaceChildren(panel('glow res',
    label(xp.complete ? 'Misión diaria completada' : 'Misión registrada (incompleta)'),
    h('div', { class: 'display', style: { 'font-size': '22px', 'margin-top': '4px' } }, day.name),
    amount, label('Experiencia'),
    h('table', null,
      h('tr', null, h('td', null, `${xp.sets} series × ${XP_PER_SET}`), h('td', null, `+${xp.sets * XP_PER_SET}`)),
      h('tr', null, h('td', null, `${xp.loadUps} subidas de carga × ${XP_LOAD_UP}`), h('td', null, `+${xp.loadUps * XP_LOAD_UP}`)),
      h('tr', null, h('td', null, 'Todas las series hechas'), h('td', null, xp.complete ? `+${XP_COMPLETE}` : '0'))),
    after.level > before.level && h('div', { class: 'levelup' }, rankUp ? `Ascenso: ${after.rank.name}` : `Nivel ${before.level} → ${after.level}`),
    ups.length ? h('ul', null, ups.map(({ e, v }) => h('li', null, h('b', null, `▲ ${kgText(v.kg)} kg `), `${e.name} la próxima vez`))) : null,
    !xp.complete && h('p', { class: 'dim small', style: { 'margin-top': '10px' } }, 'Faltaron series. El bonus de misión exige completarlas todas.'),
    h('button', { class: 'btn', onclick: () => dlg.close() }, 'Continuar')));
  dlg.showModal();
  const start = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - start) / 900);
    amount.textContent = `+${Math.round(xp.total * (1 - (1 - k) ** 3))}`;
    if (k < 1) requestAnimationFrame(tick);
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) amount.textContent = `+${xp.total}`;
  else requestAnimationFrame(tick);
}

// ── Rest timer ───────────────────────────────────────────────────────────
let rest = null;
let audio = null; // created on a tap, so the end-of-rest beep is allowed to play
function beep() {
  if (!audio) return;
  [0, 0.22].forEach((at) => {
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.18, audio.currentTime + at);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + at + 0.18);
    osc.connect(gain).connect(audio.destination);
    osc.start(audio.currentTime + at); osc.stop(audio.currentTime + at + 0.2);
  });
}
const shift = (sec) => () => {
  rest.end = Math.max(Date.now(), rest.end + sec * 1000);
  rest.total = Math.max(1, rest.total + sec);
  rest.buzzed = false;
  drawRest();
};
function startRest(seconds, name = '') {
  stopRest();
  audio ??= globalThis.AudioContext ? new AudioContext() : null;
  audio?.resume?.();
  rest = { end: Date.now() + seconds * 1000, total: seconds, name, id: setInterval(drawRest, 500), buzzed: false };
  drawRest();
}
function stopRest() {
  if (rest) clearInterval(rest.id);
  rest = null;
  document.getElementById('rest').hidden = true;
}
function drawRest() {
  if (!rest) return;
  const host = document.getElementById('rest');
  const left = Math.ceil((rest.end - Date.now()) / 1000);
  const over = left <= 0;
  if (over && !rest.buzzed) { rest.buzzed = true; navigator.vibrate?.([120, 80, 120]); beep(); }
  if (left < -300) return stopRest();
  host.hidden = false;
  host.replaceChildren(h('div', { class: `rest ${over ? 'over' : ''}`, role: 'timer' },
    h('div', null, label(over ? 'A por la siguiente serie' : `Descanso · ${rest.name}`), h('div', { class: 't' }, over ? `+${clock(-left)}` : clock(left))),
    h('button', { 'aria-label': 'Quitar 15 segundos', onclick: shift(-15) }, '−15'),
    h('button', { 'aria-label': 'Añadir 30 segundos', onclick: shift(30) }, '+30'),
    h('button', { onclick: stopRest }, 'Saltar'),
    h('div', { class: 'bar' }, h('i', { style: { width: `${over ? 0 : Math.min(100, (left / rest.total) * 100)}%` } }))));
}

// ── Status ───────────────────────────────────────────────────────────────
const STAT_INFO = {
  FUE: ['Fuerza', 'Cargas del tren superior frente a la referencia', '#ff6b6b'],
  AGI: ['Tren inferior', 'Cargas de pierna frente a la referencia', '#3ddc97'],
  RES: ['Resistencia', 'Series de esta semana frente al plan', '#4cc2ff'],
  VIT: ['Vitalidad', 'Sesiones de los últimos 28 días frente al plan', '#ffb547'],
};

function statusView(p) {
  const C = 2 * Math.PI * 88;
  const st = stats(state.sessions, today(), state.starts);
  const ring = h('div', { class: 'ring-wrap' },
    s('svg', { class: 'ring', viewBox: '0 0 200 200', role: 'img', 'aria-label': `Nivel ${p.level}, ${Math.round(p.levelPct * 100)} % hacia el siguiente` },
      s('circle', { class: 'tick', cx: 100, cy: 100, r: 97, fill: 'none', 'stroke-width': 1, 'stroke-dasharray': '1 9.16' }),
      s('circle', { class: 'track', cx: 100, cy: 100, r: 88, fill: 'none', 'stroke-width': 7 }),
      s('circle', { class: 'fill', cx: 100, cy: 100, r: 88, fill: 'none', 'stroke-width': 7, 'stroke-linecap': 'butt', transform: 'rotate(-90 100 100)', 'stroke-dasharray': C.toFixed(1), 'stroke-dashoffset': C.toFixed(1), 'data-off': (C * (1 - p.levelPct)).toFixed(1) })),
    h('div', { class: 'ring-center' }, label('Nivel'), h('div', { class: 'lvl' }, String(p.level)), h('div', { class: 'rk' }, p.rank.name.toUpperCase())));

  const weights = state.weights;
  const wInput = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Peso de hoy en kg', 'aria-label': 'Peso corporal en kilos', autocomplete: 'off' });
  const logWeight = () => {
    const kg = parseKg(wInput.value);
    if (!(kg > 20 && kg < 400)) { wInput.focus(); return; }
    state.weights = weights.filter((w) => w.date !== today()).concat({ date: today(), kg });
    state.profile.weightKg = kg;
    touchProfile(state); persist(); render();
  };
  const first = weights[0], lastW = weights.at(-1);
  const delta = first && lastW ? lastW.kg - first.kg : 0;

  return [
    panel('', ring, h('div', { class: 'hud-sub', style: { 'justify-content': 'center', gap: '14px' } },
      h('span', null, `${p.xp.toLocaleString('es-ES')} XP totales`), h('span', null, `${state.sessions.length} misiones`))),
    panel('', label('Estadísticas'), Object.entries(STAT_INFO).map(([k, [name, info, color]]) =>
      h('div', { class: 'stat', style: { '--fill': color } },
        h('span', { class: 'k' }, k), h('div', { class: 'bar thick' }, fill(st[k] / 100, color)), h('span', { class: 'v' }, String(st[k])),
        h('p', null, `${name}. ${info}.`)))),
    panel('', label('Peso corporal'),
      lastW ? h('div', { class: 'mission-meta' }, h('span', null, 'Actual ', h('b', null, `${kgText(lastW.kg)} kg`)),
        h('span', null, weights.length > 1 ? `${delta > 0 ? '+' : ''}${kgText(delta)} kg desde ${longDate(first.date)}` : 'Primer registro'))
        : h('p', { class: 'dim small', style: { 'margin-top': '6px' } }, 'Pésate una vez por semana, en ayunas, el mismo día.'),
      weights.length > 1 && h('div', { class: 'trend' }, sparkline(weights.slice(-20).map((w) => w.kg))),
      h('div', { class: 'field' }, wInput, h('button', { class: 'btn', onclick: logWeight }, 'Registrar'))),
    cloudPanel(),
    dataPanel(),
  ];
}

const CLOUD_TEXT = {
  unconfigured: 'La copia en la nube todavía no está disponible en esta versión.',
  off: 'Tus datos están solo en este dispositivo.',
  loading: 'Cargando…',
  'signed-out': 'Inicia sesión para guardar tu progreso y verlo en cualquier dispositivo.',
  syncing: 'Sincronizando…',
  synced: 'Todo guardado en tu cuenta.',
  offline: 'Sin conexión. Se sincronizará al volver.',
  error: 'No se pudo sincronizar.',
};

function cloudPanel() {
  const text = h('p', { class: 'dim small', style: { 'margin-top': '8px' }, role: 'status' }, '');
  const who = h('div', { class: 'mission-meta' });
  const button = h('button', { class: 'btn ghost' }, '');
  const draw = () => {
    if (mounted && !button.isConnected) { stop(); return; }   // the panel was redrawn: this copy is gone
    const u = cloud.user;
    text.textContent = cloud.error || CLOUD_TEXT[cloud.status];
    who.replaceChildren(...(u ? [h('span', null, 'Cuenta ', h('b', null, u.name || u.email))] : []));
    who.hidden = !u;
    button.hidden = cloud.status === 'unconfigured';
    button.disabled = cloud.status === 'loading' || cloud.status === 'syncing';
    button.textContent = u ? 'Cerrar sesión' : 'Iniciar sesión con Google';
    button.onclick = u ? () => cloud.signOut() : () => cloud.signIn();
  };
  let mounted = false;
  requestAnimationFrame(() => { mounted = true; });
  const stop = cloud.subscribe(draw);
  draw();
  // Load the sign-in code now, so the tap opens Google's window at once (browsers block a popup that waits).
  if (cloud.status === 'off') cloud.prepare().catch(() => {});
  return panel('', label('Cuenta y copia en la nube'), who, text, button,
    h('p', { class: 'dim small', style: { 'margin-top': '8px' } }, 'La copia no va cifrada de extremo a extremo: la protege tu cuenta de Google y quien administra el proyecto puede verla.'));
}

function dataPanel() {
  const file = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: async () => {
    try {
      const next = adopt(state, JSON.parse(await file.files[0].text()));
      if (!hasData(next)) throw new Error('empty');
      state = next; persist(); render();
    } catch { note.textContent = 'Ese archivo no es una copia válida de Ascend.'; }
  } });
  const note = h('p', { class: 'dim small', style: { 'margin-top': '8px' }, role: 'status' }, 'Copia de seguridad en un archivo. Importar sustituye los datos de este dispositivo y de tu cuenta.');
  let armed = false;
  const wipe = h('button', { class: 'btn ghost danger', onclick: () => {
    if (!armed) { armed = true; wipe.textContent = 'Pulsa otra vez para borrar todo'; return; }
    state = wipe(state); persist(); render();
  } }, 'Borrar todos los datos');
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    h('a', { href: url, download: `ascend-${today()}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return panel('', label('Datos'), note, file,
    h('div', { class: 'row' },
      h('button', { class: 'btn ghost', onclick: exportData }, 'Exportar'),
      h('button', { class: 'btn ghost', onclick: () => file.click() }, 'Importar')),
    wipe);
}

// ── Road ─────────────────────────────────────────────────────────────────
const RANK_COLOR = { E: '#9fb0c8', D: '#4ade80', C: '#38bdf8', B: '#a78bfa', A: '#fbbf24', S: '#ff4d6d' };

function roadView(p) {
  const avg = averageSessionXp(state.sessions);
  const sessionsLeft = Math.ceil(p.xpToRank / avg);
  const out = [];
  out.push(panel('glow',
    label(p.next ? `Siguiente rango: ${p.next.name}` : 'Rango máximo alcanzado'),
    h('div', { class: 'bar thick' }, fill(p.rankPct)),
    p.next && h('div', { class: 'mission-meta' },
      h('span', null, 'Faltan ', h('b', null, `${p.xpToRank.toLocaleString('es-ES')} XP`)),
      h('span', null, `≈ ${sessionsLeft} misiones · ${Math.ceil(sessionsLeft / WEEKLY_SESSIONS)} semanas`))));

  out.push(panel('', label('Camino de rangos'),
    h('div', { class: 'road' }, [...RANKS].reverse().map((r) => {
      const reached = p.level >= r.min;
      return h('div', { class: `node ${reached ? 'reached' : ''} ${r.id === p.rank.id ? 'current' : ''}`, style: { '--c': RANK_COLOR[r.id] } },
        h('div', { class: 'hex' }, h('span', null, r.id)),
        h('div', null,
          h('div', { class: 'req' }, `NIVEL ${r.min} · ${xpForLevel(r.min).toLocaleString('es-ES')} XP`),
          h('h3', null, r.title, r.id === p.rank.id && h('span', { class: 'here' }, 'Estás aquí')),
          h('p', null, r.note)));
    }))));

  const lifts = [];
  for (const e of EXERCISES) {
    const hist = history(state.sessions, e.id);
    if (!hist.length) continue;
    const lastSets = lastSetsFor(state.sessions, e.id);
    const top = Math.max(...lastSets.map((x) => x.kg));
    const gain = hist.length > 1 ? (hist.at(-1).value / hist[0].value - 1) * 100 : 0;
    lifts.push(h('div', { class: 'lift' },
      h('span', { class: 'name' }, e.name),
      sparkline(hist.slice(-10).map((x) => x.value)) ?? h('span'),
      h('span', { class: 'kg' }, `${kgText(top)} kg`,
        h('span', { class: `delta ${gain > 0 ? 'pos' : ''}` }, hist.length > 1 ? `${gain >= 0 ? '+' : ''}${gain.toFixed(1)} %` : 'inicio'))));
  }
  out.push(panel('', label('Progresión de cargas'),
    lifts.length ? lifts : h('p', { class: 'empty' }, 'Aquí verás cada ejercicio con su tendencia de fuerza estimada en cuanto registres la primera misión.')));

  out.push(panel('', label('Protocolo de sobrecarga'),
    h('ul', { class: 'rules' },
      h('li', null, h('b', null, 'Sube de carga: '), 'todas las series llegan al tope del rango con técnica estricta. La app suma el incremento mínimo.'),
      h('li', null, h('b', null, 'Mantén: '), 'estás dentro del rango. El objetivo es una repetición más que la última vez.'),
      h('li', null, h('b', null, 'Mantén con bajada lenta: '), 'no llegas al mínimo del rango. Mismo peso, 3 segundos de bajada.'),
      h('li', null, h('b', null, 'Experiencia: '), `${XP_PER_SET} XP por serie, ${XP_LOAD_UP} por cada subida de carga ganada y ${XP_COMPLETE} por completar la misión.`),
      h('li', null, h('b', null, 'Racha: '), `semanas seguidas con las ${WEEKLY_SESSIONS} misiones hechas.`))));
  return out;
}

// ── Log ──────────────────────────────────────────────────────────────────
function logView() {
  const t = today();
  calMonth ??= new Date(parseDate(t).getFullYear(), parseDate(t).getMonth(), 1);
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const byDate = new Map(state.sessions.map((x) => [x.date, dayById(x.dayId).group]));
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const days = new Date(y, m + 1, 0).getDate();
  const cells = ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => h('div', { class: 'dow' }, d));
  for (let i = 0; i < lead; i++) cells.push(h('div', { class: 'd' }));
  for (let d = 1; d <= days; d++) {
    const iso = isoDate(new Date(y, m, d));
    cells.push(h('div', { class: `d in ${byDate.get(iso) ?? ''} ${iso === t ? 'today' : ''}` }, String(d)));
  }
  const move = (n) => { calMonth = new Date(y, m + n, 1); render(); };
  const title = calMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const list = [...state.sessions].reverse().slice(0, 40).map((x) => {
    const all = Object.values(x.sets).flat();
    const volume = all.reduce((n, r) => n + r.kg * r.reps, 0);
    let armed = false;
    const del = h('button', { onclick: () => {
      if (!armed) { armed = true; del.textContent = 'Pulsa otra vez para eliminar'; return; }
      removeSession(state, x.id); persist(); render();
    } }, 'Eliminar');
    return h('div', { class: 'sess' },
      h('div', { class: 'sess-top' }, h('b', null, dayById(x.dayId).name), h('span', { class: 'xp' }, `+${x.xp} XP`)),
      h('div', { class: 'meta' }, `${longDate(x.date)} · ${all.length} series · ${Math.round(volume).toLocaleString('es-ES')} kg movidos`),
      del);
  });

  return [
    panel('',
      h('div', { class: 'cal-head' },
        h('button', { 'aria-label': 'Mes anterior', onclick: () => move(-1) }, '‹'),
        h('div', { class: 'display' }, title),
        h('button', { 'aria-label': 'Mes siguiente', onclick: () => move(1) }, '›')),
      h('div', { class: 'cal' }, cells),
      h('div', { class: 'legend' },
        h('span', null, h('i', { style: { '--c': 'var(--sys)' } }), 'Torso'),
        h('span', null, h('i', { style: { '--c': 'var(--ok)' } }), 'Pierna'))),
    panel('', label('Misiones registradas'), list.length ? list : h('p', { class: 'empty' }, 'Todavía no hay misiones. La primera calibra tus cargas.')),
  ];
}

render();
document.addEventListener('visibilitychange', () => { if (!document.hidden) { drawRest(); cloud.wake(); } });

const local = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator && !local) navigator.serviceWorker.register('sw.js').catch(() => {});
