// Thin IndexedDB wrapper. Every store has a single key field; nothing here
// knows about planner rules (that lives in store.js and friends).

const DB_NAME = 'planner';
export const DB_VERSION = 1;

export const STORES = {
  settings: 'key', // one record: { key: 'main', ... }
  routine: 'id',
  tasks: 'id',
  days: 'date', // "YYYY-MM-DD"
};

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      // Migrations run by version so later phases can add stores or indexes
      // (e.g. a "weeks" store for Sunday planning) without touching old data.
      if (e.oldVersion < 1) {
        for (const [name, keyPath] of Object.entries(STORES)) {
          const store = db.createObjectStore(name, { keyPath });
          if (name === 'tasks') store.createIndex('plannedDate', 'plannedDate');
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(storeNames, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeNames, mode);
        let result;
        const req = fn(t);
        if (req) req.onsuccess = () => (result = req.result);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const get = (store, key) => run(store, 'readonly', (t) => t.objectStore(store).get(key));
export const all = (store) => run(store, 'readonly', (t) => t.objectStore(store).getAll());
export const put = (store, value) => run(store, 'readwrite', (t) => t.objectStore(store).put(value));
export const del = (store, key) => run(store, 'readwrite', (t) => t.objectStore(store).delete(key));

export const uid = () =>
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

// ---- Backup -----------------------------------------------------------

export async function exportAll() {
  const data = {};
  for (const name of Object.keys(STORES)) data[name] = await all(name);
  return { app: 'planner', schema: DB_VERSION, exportedAt: new Date().toISOString(), data };
}

export function validateBackup(json) {
  if (!json || json.app !== 'planner' || typeof json.data !== 'object') return 'This file is not a Planner backup.';
  for (const name of Object.keys(STORES)) {
    if (json.data[name] && !Array.isArray(json.data[name])) return `Backup is damaged ("${name}" is not a list).`;
  }
  if (json.schema > DB_VERSION) return 'This backup is from a newer version of the app.';
  return null;
}

// Replaces everything in one transaction, so a bad import can't leave half the data.
export function replaceAll(data = {}) {
  const names = Object.keys(STORES);
  return run(names, 'readwrite', (t) => {
    for (const name of names) {
      const store = t.objectStore(name);
      store.clear();
      for (const row of data[name] || []) store.put(row);
    }
  });
}
