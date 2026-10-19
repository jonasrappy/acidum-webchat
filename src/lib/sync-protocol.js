import { messageAttention } from './core.js';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const SYNC_VERSION = 1;
export const MAX_SYNC_MESSAGES = 10000;

function base64(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function unbase64(text) {
  return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (char) =>
    char.charCodeAt(0),
  );
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', value));
}

export function syncMessageId(message) {
  return JSON.stringify([message.account, message.key]);
}

export function validSyncMessage(message) {
  return Boolean(
    message &&
    typeof message.account === 'string' &&
    message.account.length <= 100 &&
    typeof message.name === 'string' &&
    message.name.length <= 100 &&
    typeof message.key === 'string' &&
    message.key.length <= 32000 &&
    typeof message.text === 'string' &&
    message.text.length <= 8000 &&
    ['text', 'priv', 'join', 'part', 'quit', 'room', 'log'].includes(message.type) &&
    Number.isSafeInteger(message.time) &&
    message.time >= 0 &&
    Number.isFinite(new Date(message.time).getTime()),
  );
}

export function parseSyncLink(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    throw new Error('Paste a valid sync server link.');
  }
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw new Error('The sync server must use HTTPS.');
  if (url.username || url.password || url.search)
    throw new Error('Use the sync server link without query parameters.');
  const key = new URLSearchParams(url.hash.slice(1)).get('key');
  if (!key || !/^[A-Za-z0-9_-]{32,128}$/.test(key))
    throw new Error('The sync link is missing its private connection key.');
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return { endpoint: url.href.replace(/\/$/, ''), key };
}

export async function syncKeys(token) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(token), 'HKDF', false, [
    'deriveBits',
    'deriveKey',
  ]);
  const params = (purpose) => ({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: encoder.encode('acidum-sync-v1'),
    info: encoder.encode(purpose),
  });
  const auth = base64(
    new Uint8Array(await crypto.subtle.deriveBits(params('authentication'), material, 256)),
  );
  return {
    auth,
    vault: base64(await digest(encoder.encode(auth))),
    encryption: await crypto.subtle.deriveKey(
      params('encryption'),
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    ),
    signing: await crypto.subtle.deriveKey(
      params('record-identity'),
      material,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign'],
    ),
  };
}

async function compress(bytes) {
  if (bytes.length < 1024 || typeof CompressionStream === 'undefined')
    return { bytes, compressed: false };
  const compressed = new Uint8Array(
    await new Response(
      new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer(),
  );
  return compressed.length < bytes.length
    ? { bytes: compressed, compressed: true }
    : { bytes, compressed: false };
}

export async function encryptSyncMessage(keys, input) {
  if (!validSyncMessage(input)) return null;
  const { id: localId, sources, accounts, archiveId, scope, ...message } = input;
  const text = JSON.stringify(message);
  const kind = message.log || messageAttention(message) ? 'log' : 'chat';
  const id = base64(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', keys.signing, encoder.encode(syncMessageId(message))),
    ),
  );
  const time = message.time;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const packed = await compress(encoder.encode(text));
  const bytes = new Uint8Array(packed.bytes.length + 1);
  bytes[0] = Number(packed.compressed);
  bytes.set(packed.bytes, 1);
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: encoder.encode(`${keys.vault}:${kind}:${id}:${time}`),
      },
      keys.encryption,
      bytes,
    ),
  );
  if (data.length > 65536) throw new Error('A history batch is too large to sync.');
  return { id, time, kind, iv: base64(iv), data: base64(data) };
}

export async function decryptSyncMessage(keys, record) {
  const decrypted = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: unbase64(record.iv),
        additionalData: encoder.encode(`${keys.vault}:${record.kind}:${record.id}:${record.time}`),
      },
      keys.encryption,
      unbase64(record.data),
    ),
  );
  let bytes = decrypted.subarray(1);
  if (decrypted[0] === 1) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    const chunks = [];
    let length = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > 2000000) {
        await reader.cancel();
        throw new Error('The history batch is too large.');
      }
      chunks.push(next.value);
    }
    bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
  } else if (decrypted[0] !== 0) throw new Error('Unsupported history format.');
  const result = JSON.parse(decoder.decode(bytes));
  if (!validSyncMessage(result)) throw new Error('Invalid history batch.');
  return result;
}

export class SyncClient {
  constructor(link, keys, fetcher = fetch) {
    Object.assign(this, parseSyncLink(link));
    this.keys = keys;
    this.fetcher = fetcher;
  }

  async request(path, { method = 'GET', body, signal } = {}) {
    const response = await (0, this.fetcher)(this.endpoint + '/v1/' + path, {
      method,
      signal: signal || AbortSignal.timeout(20000),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: {
        Authorization: 'Bearer ' + this.keys.auth,
        'X-Acidum-Key': this.key,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const error = new Error(
        response.status === 401 || response.status === 403
          ? 'The sync link was refused. Check its connection key.'
          : response.status === 429
            ? 'Sync is busy or its daily limit was reached. It will retry later.'
            : response.status === 507
              ? 'Sync storage is full. Local chat continues; upload will retry later.'
              : 'The sync server is unavailable. Local chat continues.',
      );
      error.status = response.status;
      error.retryAfter = Math.min(
        3600000,
        Math.max(0, Number(response.headers.get('Retry-After')) * 1000),
      );
      throw error;
    }
    return response.json();
  }

  upload(records) {
    const batch = [];
    let size = 64;
    for (const record of records.slice(0, 32)) {
      const length = JSON.stringify(record).length + 1;
      if (size + length > 240000) break;
      batch.push(record);
      size += length;
    }
    if (!batch.length) throw new Error('The sync record is too large.');
    return this.request('messages', {
      method: 'POST',
      body: { version: SYNC_VERSION, records: batch },
    });
  }
  changes(after) {
    return this.request('messages?after=' + encodeURIComponent(after));
  }
  latest(kind = 'chat', before = '') {
    return this.request(
      `messages?kind=${kind}${before ? '&before=' + encodeURIComponent(before) : ''}`,
    );
  }
}
