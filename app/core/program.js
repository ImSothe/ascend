// Training programme: 4-day upper/lower split built for body recomposition.
// Starting loads are personal: they live in the person's data, not here.
// `ref` is the load used to scale the stat bars.

/** @typedef {{id:string,name:string,sets:number,min:number,max:number,rir:string,inc:number,ref:number,rest:number,unit:string,cue:string}} Exercise */

const ex = (id, name, sets, min, max, rir, inc, ref, rest, unit, cue) =>
  ({ id, name, sets, min, max, rir, inc, ref, rest, unit, cue });

// Exercises that appear on both leg days share one definition, so they share
// one history and one load verdict.
const LEG_EXT = ex('leg-extension', 'Extensión de cuádriceps', 3, 10, 15, '0-1', 5, 110, 90, 'kg', 'Pausa de 1 s arriba, bajada controlada.');
const LEG_CURL = ex('leg-curl', 'Curl femoral', 3, 10, 15, '0-1', 5, 90, 90, 'kg', 'Cadera pegada al asiento. Bajada en 3 s.');
const CALF = ex('calf-press', 'Gemelo en prensa', 3, 10, 15, '0-1', 10, 200, 75, 'kg', 'Nuevo. Pausa de 2 s abajo en el estiramiento. Sin rebote.');

export const DAYS = [
  {
    id: 'TA', name: 'Torso A', group: 'torso', focus: 'Press inclinado y dorsal',
    exercises: [
      ex('incline-db-press', 'Press inclinado con mancuernas', 3, 6, 10, '1-2', 2, 45, 180, 'kg por mancuerna', 'Banco a 30°. Baja en 2-3 s hasta estirar el pecho, sin rebote.'),
      ex('lat-pulldown', 'Jalón al pecho', 3, 8, 12, '1-2', 5, 110, 150, 'kg', 'Sin balanceo: si el torso se mueve, sobra peso. Pecho hacia la barra.'),
      ex('ohp', 'Press militar', 3, 8, 12, '1-2', 2, 40, 150, 'kg', 'Recorrido completo, sin arquear la lumbar.'),
      ex('cable-row', 'Remo gironda', 3, 8, 12, '1-2', 5, 110, 150, 'kg', 'Pausa de 1 s con los codos atrás. Estira la espalda al volver.'),
      ex('cable-lateral', 'Laterales en polea', 3, 12, 20, '0-1', 1.25, 40, 75, 'kg', 'Polea a la altura de la muñeca. Sube con el codo, no con la mano.'),
      ex('bayesian-curl', 'Curl bayesian', 3, 10, 15, '0-1', 2.5, 50, 90, 'kg', 'Codo detrás del cuerpo, estiramiento completo abajo.'),
      ex('katana-ext', 'Tríceps katana con codo apoyado', 3, 10, 15, '0-1', 2.5, 40, 90, 'kg', 'Codo fijo. Estira el tríceps al máximo en cada repetición.'),
      ex('wrist-curl', 'Curl de muñeca en polea', 2, 12, 20, '0-1', 2.5, 40, 60, 'kg', 'Antebrazo. Apoya los antebrazos, deja rodar la barra hasta los dedos y cierra.'),
    ],
  },
  {
    id: 'PA', name: 'Pierna A', group: 'pierna', focus: 'Cuádriceps',
    exercises: [
      ex('leg-press', 'Prensa', 3, 8, 12, '2', 10, 300, 180, 'kg', 'Baja hasta donde la lumbar siga pegada. Las dos primeras semanas RIR 3.'),
      ex('rdl', 'Peso muerto rumano', 3, 8, 12, '2', 5, 140, 150, 'kg', 'Nuevo. Cadera atrás, espalda neutra, barra pegada a las piernas.'),
      LEG_EXT,
      LEG_CURL,
      CALF,
      ex('cable-crunch', 'Crunch en polea', 3, 10, 15, '0-1', 2.5, 70, 60, 'kg', 'Nuevo. Enrolla la columna; la cadera no se mueve.'),
    ],
  },
  {
    id: 'TB', name: 'Torso B', group: 'torso', focus: 'Máquina, remo en T y deltoide posterior',
    exercises: [
      ex('machine-press', 'Press sentado guiado en máquina', 3, 8, 12, '1-2', 5, 110, 150, 'kg', 'Asiento a la altura que deje los agarres en mitad del pecho.'),
      ex('t-bar-row', 'Remo en T', 3, 8, 12, '1-2', 5, 100, 150, 'kg', 'Torso quieto. Si tiras con la lumbar, sobra peso.'),
      ex('cable-fly', 'Aperturas en polea alta', 3, 12, 15, '0-1', 2.5, 60, 90, 'kg', 'Estiramiento profundo, cierra abrazando. Peso que permita 12 limpias.'),
      ex('single-pulldown', 'Jalón unilateral en polea alta', 3, 10, 12, '1-2', 2.5, 50, 60, 'kg por brazo', 'Codo hacia la cadera. Descansa al terminar los dos brazos.'),
      ex('rear-delt-cable', 'Pájaro en polea', 3, 12, 20, '0-1', 1.25, 35, 60, 'kg por brazo', 'Brazo casi recto, abre hasta la línea del hombro.'),
      ex('cable-hammer', 'Martillo en polea unilateral', 3, 10, 15, '0-1', 2.5, 30, 60, 'kg por brazo', 'Codo pegado al costado, sin balanceo.'),
      ex('overhead-ext', 'Jalón con cuerda tras nuca', 3, 10, 15, '0-1', 2.5, 45, 90, 'kg', 'Estira el tríceps detrás de la cabeza en cada repetición.'),
      ex('reverse-curl', 'Curl inverso en polea', 2, 10, 15, '0-1', 2.5, 45, 60, 'kg', 'Antebrazo. Agarre prono, muñecas rectas, codos pegados.'),
    ],
  },
  {
    id: 'PB', name: 'Pierna B', group: 'pierna', focus: 'Glúteo y femoral',
    exercises: [
      ex('hip-thrust', 'Hip thrust', 3, 8, 12, '1-2', 5, 180, 150, 'kg', 'Barbilla al pecho, pausa de 1 s arriba.'),
      LEG_CURL,
      LEG_EXT,
      ex('back-extension', 'Lumbares (hiperextensiones)', 3, 10, 15, '1-2', 5, 40, 90, 'kg de lastre', 'Sube hasta alinear el cuerpo, sin hiperextender. Sin lastre anota 0.'),
      ex('abductor', 'Abductores en máquina', 2, 12, 20, '0-1', 5, 90, 60, 'kg', 'Pausa de 1 s abierto, cierre lento.'),
      CALF,
      ex('leg-raise', 'Elevación de piernas colgado', 3, 8, 15, '0-1', 2.5, 20, 60, 'kg de lastre', 'Abdomen. Sin balanceo. Sin lastre anota 0; al llegar a 15, mancuerna entre los pies.'),
    ],
  },
];

/** Every exercise once, in programme order. */
export const EXERCISES = [...new Map(DAYS.flatMap((d) => d.exercises).map((e) => [e.id, e])).values()];

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
