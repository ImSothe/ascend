// Training programme: 4 days, two muscle groups per day. Legs, the weakest
// area, get two days (quadriceps and posterior chain); forearms and abs ride
// along as finishers. Starting loads are personal: they live in the person's
// data, not here. `ref` is the load used to scale the stat bars.

/** @typedef {{id:string,name:string,sets:number,min:number,max:number,rir:string,inc:number,ref:number,rest:number,unit:string,cue:string,area:'upper'|'lower'|'core'}} Exercise */

const make = (area) => (id, name, sets, min, max, rir, inc, ref, rest, unit, cue) =>
  ({ id, name, sets, min, max, rir, inc, ref, rest, unit, cue, area });
const up = make('upper');
const low = make('lower');
const core = make('core');

export const DAYS = [
  {
    id: 'D1', groups: ['Pecho', 'Tríceps'], focus: 'Press inclinado primero, con la fuerza intacta',
    exercises: [
      up('incline-db-press', 'Press inclinado con mancuernas', 3, 6, 10, '1-2', 2, 45, 180, 'kg por mancuerna', 'Banco a 30°. Baja en 2-3 s hasta estirar el pecho, sin rebote.'),
      up('machine-press', 'Press sentado guiado en máquina', 3, 8, 12, '1-2', 5, 110, 150, 'kg', 'Asiento a la altura que deje los agarres en mitad del pecho.'),
      up('cable-fly', 'Aperturas en polea alta', 3, 12, 15, '0-1', 2.5, 60, 90, 'kg', 'Estiramiento profundo, cierra abrazando. Peso que permita 12 limpias.'),
      up('pec-deck', 'Peck deck', 2, 12, 15, '0-1', 5, 90, 75, 'kg', 'Pausa de 1 s con los brazos cerrados. Hombros atrás.'),
      up('overhead-ext', 'Jalón con cuerda tras nuca', 3, 10, 15, '0-1', 2.5, 45, 90, 'kg', 'Estira el tríceps detrás de la cabeza en cada repetición.'),
      up('katana-ext', 'Tríceps katana con codo apoyado', 3, 10, 15, '0-1', 2.5, 40, 90, 'kg', 'Codo fijo. Estira el tríceps al máximo en cada repetición.'),
      up('pushdown', 'Extensión de tríceps en polea', 2, 10, 15, '0-1', 2.5, 50, 75, 'kg', 'Codos pegados al costado. Bloquea abajo 1 s.'),
    ],
  },
  {
    id: 'D2', groups: ['Espalda', 'Bíceps'], focus: 'Dorsal, grosor y antebrazo al final',
    exercises: [
      up('lat-pulldown', 'Jalón al pecho', 3, 8, 12, '1-2', 5, 110, 150, 'kg', 'Sin balanceo: si el torso se mueve, sobra peso. Pecho hacia la barra.'),
      up('t-bar-row', 'Remo en T', 3, 8, 12, '1-2', 5, 100, 150, 'kg', 'Torso quieto. Si tiras con la lumbar, sobra peso.'),
      up('cable-row', 'Remo gironda', 3, 8, 12, '1-2', 5, 110, 150, 'kg', 'Pausa de 1 s con los codos atrás. Estira la espalda al volver.'),
      up('single-pulldown', 'Jalón unilateral en polea alta', 2, 10, 12, '1-2', 2.5, 50, 60, 'kg por brazo', 'Codo hacia la cadera. Descansa al terminar los dos brazos.'),
      up('bayesian-curl', 'Curl bayesian', 3, 10, 15, '0-1', 2.5, 50, 90, 'kg', 'Codo detrás del cuerpo, estiramiento completo abajo.'),
      up('cable-hammer', 'Martillo en polea unilateral', 3, 10, 15, '0-1', 2.5, 30, 60, 'kg por brazo', 'Codo pegado al costado, sin balanceo.'),
      up('wrist-curl', 'Curl de muñeca en polea', 2, 12, 20, '0-1', 2.5, 40, 60, 'kg', 'Antebrazo. Apoya los antebrazos, deja rodar la barra hasta los dedos y cierra.'),
      up('reverse-curl', 'Curl inverso en polea', 2, 10, 15, '0-1', 2.5, 45, 60, 'kg', 'Antebrazo. Agarre prono, muñecas rectas, codos pegados.'),
    ],
  },
  {
    id: 'D3', groups: ['Pierna', 'Abdomen'], focus: 'Cuádriceps. Las dos primeras semanas, RIR 3',
    exercises: [
      low('leg-press', 'Prensa', 3, 8, 12, '2', 10, 300, 180, 'kg', 'Baja hasta donde la lumbar siga pegada.'),
      low('bulgarian', 'Sentadilla búlgara con mancuernas', 2, 8, 12, '2', 2, 35, 120, 'kg por mancuerna', 'Paso largo. Cuenta las repeticiones por pierna.'),
      low('leg-extension', 'Extensión de cuádriceps', 3, 10, 15, '0-1', 5, 110, 90, 'kg', 'Pausa de 1 s arriba, bajada controlada.'),
      low('abductor', 'Abductores en máquina', 2, 12, 20, '0-1', 5, 90, 60, 'kg', 'Pausa de 1 s abierto, cierre lento.'),
      low('calf-press', 'Gemelo en prensa', 3, 10, 15, '0-1', 10, 200, 75, 'kg', 'Pausa de 2 s abajo en el estiramiento. Sin rebote.'),
      core('cable-crunch', 'Crunch en polea', 3, 10, 15, '0-1', 2.5, 70, 60, 'kg', 'Enrolla la columna; la cadera no se mueve.'),
      core('leg-raise', 'Elevación de piernas colgado', 3, 8, 15, '0-1', 2.5, 20, 60, 'kg de lastre', 'Sin balanceo. Sin lastre anota 0; al llegar a 15, mancuerna entre los pies.'),
    ],
  },
  {
    id: 'D4', groups: ['Hombro', 'Femoral'], focus: 'Deltoides completo y cadena posterior',
    exercises: [
      up('ohp', 'Press militar', 3, 8, 12, '1-2', 2, 40, 150, 'kg', 'Recorrido completo, sin arquear la lumbar.'),
      up('cable-lateral', 'Laterales en polea', 4, 12, 20, '0-1', 1.25, 40, 75, 'kg', 'Polea a la altura de la muñeca. Sube con el codo, no con la mano.'),
      up('rear-delt-cable', 'Pájaro en polea', 3, 12, 20, '0-1', 1.25, 35, 60, 'kg por brazo', 'Brazo casi recto, abre hasta la línea del hombro.'),
      low('rdl', 'Peso muerto rumano', 3, 8, 12, '2', 5, 140, 150, 'kg', 'Cadera atrás, espalda neutra, barra pegada a las piernas.'),
      low('hip-thrust', 'Hip thrust', 3, 8, 12, '1-2', 5, 180, 150, 'kg', 'Barbilla al pecho, pausa de 1 s arriba.'),
      low('leg-curl', 'Curl femoral', 3, 10, 15, '0-1', 5, 90, 90, 'kg', 'Cadera pegada al asiento. Bajada en 3 s.'),
      core('back-extension', 'Lumbares (hiperextensiones)', 2, 10, 15, '1-2', 5, 40, 90, 'kg de lastre', 'Sube hasta alinear el cuerpo, sin hiperextender. Sin lastre anota 0.'),
    ],
  },
].map((d, i) => ({ ...d, index: i, name: d.groups.join(' + ') }));

// Alternatives for the main lifts: same muscle and movement, a new stimulus
// when the original stops progressing (or the machine is taken).
export const VARIANTS = {
  'incline-db-press': [
    up('incline-machine-press', 'Press inclinado en máquina', 3, 6, 10, '1-2', 5, 100, 180, 'kg', 'Respaldo inclinado. Baja controlado hasta estirar el pecho.'),
    up('incline-smith', 'Press inclinado en multipower', 3, 6, 10, '1-2', 2.5, 100, 180, 'kg', 'Banco a 30°. La barra baja a la parte alta del pecho.'),
  ],
  'machine-press': [up('db-bench', 'Press banca con mancuernas', 3, 8, 12, '1-2', 2, 45, 150, 'kg por mancuerna', 'Escápulas atrás y abajo. Baja hasta estirar el pecho.')],
  'cable-fly': [up('low-cable-fly', 'Aperturas en polea baja', 3, 12, 15, '0-1', 2.5, 50, 90, 'kg', 'De abajo arriba hasta la altura de los ojos. Enfoca el pecho alto.')],
  'lat-pulldown': [
    up('wide-pulldown', 'Jalón agarre ancho', 3, 8, 12, '1-2', 5, 110, 150, 'kg', 'Agarre algo más ancho que los hombros. Pecho a la barra.'),
    up('neutral-pulldown', 'Jalón con agarre neutro', 3, 8, 12, '1-2', 5, 110, 150, 'kg', 'Codos hacia las caderas. Pausa abajo.'),
  ],
  't-bar-row': [
    up('chest-row', 'Remo con apoyo en el pecho', 3, 8, 12, '1-2', 5, 100, 150, 'kg', 'Pecho pegado al apoyo: ni un balanceo.'),
    up('db-row', 'Remo con mancuerna', 3, 8, 12, '1-2', 2, 50, 120, 'kg por mancuerna', 'Rodilla y mano en el banco. Lleva el codo a la cadera.'),
  ],
  'cable-row': [up('machine-row', 'Remo sentado en máquina', 3, 8, 12, '1-2', 5, 100, 150, 'kg', 'Pausa de 1 s atrás. Estira la espalda al volver.')],
  ohp: [
    up('machine-ohp', 'Press de hombro en máquina', 3, 8, 12, '1-2', 5, 80, 150, 'kg', 'Recorrido completo, espalda pegada al respaldo.'),
    up('arnold-press', 'Press Arnold', 3, 8, 12, '1-2', 2, 30, 120, 'kg por mancuerna', 'Gira las palmas mientras subes. Sin prisa.'),
  ],
  'bayesian-curl': [up('preacher-curl', 'Curl en banco Scott', 3, 10, 15, '0-1', 2.5, 40, 90, 'kg', 'Brazo apoyado entero. Estira abajo sin rebotar.')],
  'overhead-ext': [up('ez-skull', 'Press francés con barra Z', 3, 10, 15, '0-1', 2.5, 40, 90, 'kg', 'Codos fijos apuntando arriba. Baja detrás de la cabeza.')],
  'leg-press': [
    low('hack-squat', 'Sentadilla hack', 3, 8, 12, '2', 5, 180, 180, 'kg', 'Profundidad completa. Baja en 3 s.'),
    low('smith-squat', 'Sentadilla en multipower', 3, 8, 12, '2', 5, 140, 180, 'kg', 'Pies algo adelantados. Baja hasta paralelo o más.'),
  ],
  rdl: [low('db-rdl', 'Peso muerto rumano con mancuernas', 3, 8, 12, '2', 2, 45, 150, 'kg por mancuerna', 'Cadera atrás, mancuernas pegadas a las piernas.')],
  'hip-thrust': [low('machine-hip-thrust', 'Hip thrust en máquina', 3, 8, 12, '1-2', 5, 150, 150, 'kg', 'Pausa de 1 s arriba apretando glúteo.')],
};

/** The exercise and its alternatives, in the order the app rotates through them. */
export const optionsFor = (baseId) => [EXERCISES_BY_ID.get(baseId), ...(VARIANTS[baseId] ?? [])].filter(Boolean);

/** A day of the plan with the person's swaps applied. */
export function planDay(id, swaps = {}) {
  const day = dayById(id);
  return { ...day, exercises: day.exercises.map((e) => optionsFor(e.id).find((x) => x.id === swaps[e.id]) ?? e) };
}

/** Every exercise once, in programme order. */
export const EXERCISES = [...new Map(DAYS.flatMap((d) => d.exercises).map((e) => [e.id, e])).values()];
const EXERCISES_BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));
/** Base exercises and every variant: what the history can contain. */
export const ALL_EXERCISES = [...EXERCISES, ...Object.values(VARIANTS).flat()];

/** Why a rest lasts what it lasts, shown next to the timer. */
export function restReason(seconds) {
  if (seconds >= 150) return 'Básico pesado: recupera la fuerza para repetir las mismas repeticiones';
  if (seconds >= 90) return 'Ejercicio medio: recuperación casi completa';
  return 'Aislamiento: basta con recuperar el aliento';
}

export const WEEKLY_SESSIONS = DAYS.length;
export const WEEKLY_SETS = DAYS.reduce((n, d) => n + d.exercises.reduce((m, e) => m + e.sets, 0), 0);

export const dayById = (id) => DAYS.find((d) => d.id === id) ?? DAYS[0];

/** Next day in the rotation after the last completed session. */
export function nextDayId(sessions) {
  if (!sessions.length) return DAYS[0].id;
  const last = sessions[sessions.length - 1].dayId;
  const i = DAYS.findIndex((d) => d.id === last);
  return DAYS[(i + 1) % DAYS.length].id;
}
