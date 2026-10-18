// Optional on-device archive. Never stores the connection token.
let database;
function open() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open('acium-webchat-history', 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('messages', { keyPath: 'archiveId' });
        store.createIndex('timeline', ['scope', 'time', 'archiveId']);
        store.createIndex('account', ['scope', 'account', 'time', 'archiveId']);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        database = null;
        reject(new Error('Browseren tillader ikke lokal historik.'));
      };
    });
  return database;
}
export function archiveId(scope, message) {
  return JSON.stringify([scope, message.account, message.key]);
}
export async function saveMessages(scope, messages) {
  if (!messages.length) return;
  const db = await open();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite'),
      store = tx.objectStore('messages');
    for (const message of messages)
      store.put({ ...message, scope, archiveId: archiveId(scope, message) });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(new Error('Historikken kunne ikke gemmes.'));
  });
  // A hard cap bounds disk use, including sessions with many accounts.
  await new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite'),
      store = tx.objectStore('messages'),
      index = store.index('timeline');
    const range = IDBKeyRange.bound([scope, -Infinity], [scope, Infinity, []]);
    const count = index.count(range);
    count.onsuccess = () => {
      let excess = count.result - 10000;
      if (excess <= 0) return;
      const cursor = index.openCursor(range);
      cursor.onsuccess = () => {
        const current = cursor.result;
        if (current && excess-- > 0) {
          current.delete();
          current.continue();
        }
      };
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(new Error('Historikken kunne ikke begrænses.'));
  });
}
export async function loadBefore(
  scope,
  account,
  before,
  { limit = 250, logOnly = false, query = '', systems = true, accept = () => true } = {},
) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages'),
      index = tx.objectStore('messages').index(account ? 'account' : 'timeline');
    const prefix = account ? [scope, account] : [scope],
      lower = [...prefix, -Infinity];
    const upper = before ? [...prefix, before.time, before.archiveId] : [...prefix, Infinity, []];
    const range = IDBKeyRange.bound(lower, upper, false, Boolean(before));
    const request = index.openCursor(range, 'prev');
    const result = [];
    let cursorToken = before,
      hasMore = false;
    const search = query.toLocaleLowerCase('da');
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (result.length >= limit) {
        hasMore = true;
        return;
      }
      const message = cursor.value;
      cursorToken = { time: message.time, archiveId: message.archiveId };
      if (
        accept(message) &&
        (!logOnly || message.log) &&
        (systems || !message.system) &&
        (!search ||
          `${message.account} ${message.name} ${message.text}`
            .toLocaleLowerCase('da')
            .includes(search))
      )
        result.push(message);
      cursor.continue();
    };
    tx.oncomplete = () => resolve({ messages: result.reverse(), before: cursorToken, hasMore });
    tx.onerror = () => reject(new Error('Historikken kunne ikke læses.'));
  });
}
export async function clearScope(scope) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const request = tx
      .objectStore('messages')
      .index('timeline')
      .openCursor(IDBKeyRange.bound([scope, -Infinity], [scope, Infinity, []]));
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = resolve;
    tx.onerror = () => reject(new Error('Historikken kunne ikke slettes.'));
  });
}
