let opening;
function database() {
  return (opening ||= new Promise((resolve, reject) => {
    const request = indexedDB.open('acidum-sync-outbox', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('pending', { keyPath: 'key' });
      store.createIndex('queued', ['owner', 'queued']);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(new Error('The sync queue could not be opened.'));
    };
  }));
}

const ownerRange = (owner) => IDBKeyRange.bound([owner, 0], [owner, Number.MAX_SAFE_INTEGER]);

export async function putPending(owner, records) {
  if (!records.length) return;
  const db = await database();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readwrite');
    const store = tx.objectStore('pending');
    for (const record of records)
      store.put({ owner, key: owner + ':' + record.id, queued: Date.now(), record });
    const index = store.index('queued');
    const count = index.count(ownerRange(owner));
    count.onsuccess = () => {
      let excess = count.result - 10000;
      if (excess <= 0) return;
      const cursor = index.openCursor(ownerRange(owner));
      cursor.onsuccess = () => {
        if (!cursor.result || excess-- <= 0) return;
        cursor.result.delete();
        cursor.result.continue();
      };
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(new Error('The offline sync queue could not be saved.'));
  });
}

export async function readPending(owner, limit = 32) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending');
    const request = tx.objectStore('pending').index('queued').getAll(ownerRange(owner), limit);
    request.onsuccess = () => resolve(request.result.map((row) => row.record));
    request.onerror = () => reject(new Error('The offline sync queue could not be read.'));
  });
}

export async function removePending(owner, ids) {
  const db = await database();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readwrite');
    for (const id of ids) tx.objectStore('pending').delete(owner + ':' + id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(new Error('The offline sync queue could not be updated.'));
  });
}
