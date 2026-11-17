// AI progress review through Firebase AI Logic (Gemini Developer API, free
// tier). It reads the summary built by core/coach.js (loads, attendance,
// weights, rule findings; no name, no email) and, if the person allows it,
// the first and the latest progress photo. App Check (reCAPTCHA Enterprise)
// proves the request comes from this web app; the project enforces it.
import { APP_CHECK_SITE_KEY } from './firebase-config.js';

export const AI_MODEL = 'gemini-3.5-flash-lite';
const TIMEOUT_MS = 45000;
const CACHE_KEY = 'ascend.ai';
export const DAILY_LIMIT = 3;

const SYSTEM = `Eres "el Sistema", el supervisor de progreso de una app de gimnasio inspirada en un RPG.
Tono: directo, frío y motivador, en español de España, sin exageraciones ni promesas. Nunca humilles por el físico.
Objetivo del usuario: recomposición corporal (perder grasa manteniendo o ganando músculo) e hipertrofia.
Basa cada afirmación en los datos recibidos. Si faltan datos, dilo y pide el dato concreto.
Los "avisosDelSistema" vienen de reglas fiables: no los contradigas; explícalos y prioriza.
Si recibes fotos (la primera y la más reciente), comenta solo cambios visibles y objetivos (cintura, hombros, definición abdominal), con prudencia: la luz y la postura engañan.
No des consejo médico ni de fármacos. Si hay dolor o lesión, recomienda un profesional.
Responde SOLO con JSON con estas claves:
{"estado":"bien"|"atencion"|"alerta","titular":string (máx 80 caracteres),"resumen":string (máx 350),"acciones":[string,...] (2 a 4, cada una máx 160, concretas: ejercicio, kg, kcal, días),"fotos":string (máx 300, vacío si no hay fotos)}`;

const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** Parse and bound what the model returned. Anything malformed becomes null. */
export function parseReview(text) {
  let raw;
  try {
    raw = JSON.parse(String(text).replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const estado = ['bien', 'atencion', 'alerta'].includes(raw.estado) ? raw.estado : 'atencion';
  const acciones = (Array.isArray(raw.acciones) ? raw.acciones : []).map((a) => clip(a, 160)).filter(Boolean).slice(0, 4);
  const titular = clip(raw.titular, 80);
  const resumen = clip(raw.resumen, 700);
  if (!titular && !resumen) return null;
  return { estado, titular, resumen, acciones, fotos: clip(raw.fotos, 300) };
}

export function createAI({ cloud, siteKey = APP_CHECK_SITE_KEY, storage = globalThis.localStorage }) {
  let model = null;
  let appCheckDone = false;

  const readCache = () => { try { return JSON.parse(storage.getItem(CACHE_KEY)) ?? {}; } catch { return {}; } };
  const writeCache = (c) => { try { storage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* the review still shows; it just is not remembered */ } };

  async function getModel() {
    if (model) return model;
    await cloud.prepare();
    const fb = cloud.firebase();
    if (!fb) throw Object.assign(new Error('sdk'), { reason: 'unavailable' });
    const { sdk, app } = fb;
    if (!appCheckDone) {
      sdk.initializeAppCheck(app, { provider: new sdk.ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
      appCheckDone = true;
    }
    model = sdk.getGenerativeModel(sdk.getAI(app, { backend: new sdk.GoogleAIBackend() }), {
      model: AI_MODEL,
      systemInstruction: SYSTEM,
      generationConfig: { responseMimeType: 'application/json', temperature: 0.4, maxOutputTokens: 900 },
    });
    return model;
  }

  /**
   * @param {object} summary  coach.aiSummary(...)
   * @param {{label:string, base64:string}[]} photos  0 to 2 JPEGs
   * @returns {Promise<{ok:true, review:object} | {ok:false, reason:string}>}
   */
  async function run(summary, photos = [], today) {
    if (!siteKey) return { ok: false, reason: 'not-configured' };
    const cache = readCache();
    const used = cache.day === today ? cache.count ?? 0 : 0;
    if (used >= DAILY_LIMIT) return { ok: false, reason: 'limit' };
    try {
      const m = await getModel();
      const parts = [`Datos del jugador (JSON):\n${JSON.stringify(summary)}`];
      for (const p of photos) parts.push(p.label, { inlineData: { data: p.base64, mimeType: 'image/jpeg' } });
      const out = await Promise.race([
        m.generateContent(parts),
        new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { reason: 'timeout' })), TIMEOUT_MS)),
      ]);
      const review = parseReview(out.response.text());
      if (!review) return { ok: false, reason: 'bad-answer' };
      writeCache({ day: today, count: used + 1, review, at: Date.now(), withPhotos: photos.length });
      return { ok: true, review };
    } catch (e) {
      const msg = `${e?.reason ?? ''} ${e?.code ?? ''} ${e?.message ?? ''}`.toLowerCase();
      if (msg.includes('timeout')) return { ok: false, reason: 'timeout' };
      if (msg.includes('429') || msg.includes('quota') || msg.includes('resource')) return { ok: false, reason: 'quota' };
      if (!globalThis.navigator?.onLine) return { ok: false, reason: 'offline' };
      return { ok: false, reason: 'unavailable' };
    }
  }

  return {
    run,
    get configured() { return !!siteKey; },
    /** The last review, kept so the screen can show it without asking again. */
    last: () => readCache().review ?? null,
    lastAt: () => readCache().at ?? 0,
    usedToday: (today) => { const c = readCache(); return c.day === today ? c.count ?? 0 : 0; },
  };
}
