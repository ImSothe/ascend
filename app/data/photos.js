// Progress photos, stored only on this device (IndexedDB). They are never
// uploaded to the database; a reduced copy goes to the AI review only when the
// person asks for one.
const DB = 'ascend-photos';
const STORE = 'photos';
export const MAX_SIDE = 1280;
export const AI_SIDE = 768;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out?.result ?? out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}

/** Downscale an image file to a JPEG whose longest side is at most `side`. */
export async function shrink(blob, side = MAX_SIDE, quality = 0.82) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const k = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', quality));
}

export async function addPhoto(file, date) {
  const blob = await shrink(file);
  const id = `${date.replace(/-/g, '')}${Date.now().toString(36)}`;
  await tx('readwrite', (s) => s.put({ id, date, blob }));
  return { id, date };
}

export async function getPhoto(id) {
  const row = await tx('readonly', (s) => s.get(id));
  return row?.blob ?? null;
}

export async function removePhoto(id) {
  await tx('readwrite', (s) => s.delete(id));
}

export async function clearPhotos() {
  await tx('readwrite', (s) => s.clear());
}

export function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
