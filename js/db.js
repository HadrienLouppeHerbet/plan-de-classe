'use strict';

/** Stockage des classes dans IndexedDB (le navigateur), photos comprises. */
const DB = (() => {
  const NAME = 'plan-de-classe';
  const STORE = 'classes';
  let opening = null;

  function open() {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const req = indexedDB.open(NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return opening;
  }

  async function run(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  return {
    all: () => run('readonly', s => s.getAll()),
    get: id => run('readonly', s => s.get(id)),
    put: cls => run('readwrite', s => s.put(cls)),
    remove: id => run('readwrite', s => s.delete(id)),
  };
})();
