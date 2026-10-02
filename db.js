// Data layer — the ONLY module that touches IndexedDB.
// Schema versioning: bump DB_VERSION and add a branch in onupgradeneeded.
// Never delete stores in a migration; add/transform so existing transactions survive.
const DB_NAME = 'ledger-db', DB_VERSION = 1;
let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB is not available in this browser.'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = req.result;
      if (e.oldVersion < 1) {
        db.createObjectStore('transactions', { keyPath: 'id' });
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      // if (e.oldVersion < 2) { migrate here, using req.transaction }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open the database.'));
    req.onblocked = () => reject(new Error('Database is blocked by another tab. Close other Ledger tabs.'));
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}
// Resolves only when the transaction COMMITS (oncomplete) — a real "saved" guarantee.
async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let out;
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted.'));
    out = fn(t);
  });
}
const wrap = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export const DB = {
  init: () => open(),
  async all() { const db = await open(); return wrap(db.transaction('transactions').objectStore('transactions').getAll()); },
  put: rec => tx('transactions', 'readwrite', t => { t.objectStore('transactions').put(rec); }),
  remove: id => tx('transactions', 'readwrite', t => { t.objectStore('transactions').delete(id); }),
  clearAll: () => tx(['transactions', 'meta'], 'readwrite', t => { t.objectStore('transactions').clear(); t.objectStore('meta').clear(); }),
  // Atomic: clear + insert in ONE transaction. If anything fails the old data stays untouched.
  replaceAll: list => tx('transactions', 'readwrite', t => {
    const s = t.objectStore('transactions'); s.clear(); list.forEach(r => s.put(r));
  }),
  async getMeta(key, fallback) {
    const db = await open(); const r = await wrap(db.transaction('meta').objectStore('meta').get(key));
    return r ? r.value : fallback;
  },
  setMeta: (key, value) => tx('meta', 'readwrite', t => { t.objectStore('meta').put({ key, value }); }),
};
