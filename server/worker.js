export const STORAGE_LIMIT = 400000000;
export const STOP_WRITES_AT = 380000000;
export const CLEANUP_AT = 350000000;
export const CLEANUP_TARGET = 200000000;
const MAX_BODY = 262144;
const PAGE_SIZE = 100;

const bytes = new TextEncoder();
const base64 = (array) =>
  btoa(String.fromCharCode(...array))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
const hash = async (value) =>
  base64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.encode(value))));

function response(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function validRecord(record) {
  return (
    record &&
    /^[A-Za-z0-9_-]{43}$/.test(record.id) &&
    ['chat', 'log'].includes(record.kind) &&
    Number.isSafeInteger(record.time) &&
    record.time >= 0 &&
    record.time <= Date.now() + 300000 &&
    /^[A-Za-z0-9_-]{16}$/.test(record.iv) &&
    typeof record.data === 'string' &&
    /^[A-Za-z0-9_-]{24,87382}$/.test(record.data)
  );
}

export async function cleanup(db, { physical = 0, incoming = 0 } = {}) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = await db.prepare('SELECT charged, records FROM sync_state WHERE id = 1').run();
    const state = result.results[0];
    if (state.charged + incoming <= 250000000 && physical < CLEANUP_AT) return;
    if (state.charged <= CLEANUP_TARGET && incoming < 5000000) return;
    await db
      .prepare(
        'DELETE FROM sync_records WHERE seq IN (SELECT seq FROM sync_records ORDER BY time, seq LIMIT 500)',
      )
      .run();
  }
}

async function acquire(db) {
  const lease = crypto.randomUUID();
  const now = Date.now();
  const result = await db
    .prepare(
      'UPDATE sync_state SET lease = ?, lease_until = ? WHERE id = 1 AND lease_until < ? RETURNING charged, records',
    )
    .bind(lease, now + 30000, now)
    .run();
  return result.results.length
    ? { lease, physical: Number(result.meta.size_after), started: now }
    : null;
}

async function release(db, lease) {
  await db
    .prepare("UPDATE sync_state SET lease = '', lease_until = 0 WHERE id = 1 AND lease = ?")
    .bind(lease)
    .run();
}

async function upload(request, env, vault) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY)
    return response({ error: 'Upload too large' }, 413);
  const reader = request.body?.getReader();
  if (!reader) return response({ error: 'Missing body' }, 400);
  const chunks = [];
  let length = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.length;
    if (length > MAX_BODY) {
      await reader.cancel();
      return response({ error: 'Upload too large' }, 413);
    }
    chunks.push(next.value);
  }
  const raw = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.length;
  }
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return response({ error: 'Invalid JSON' }, 400);
  }
  if (
    data.version !== 1 ||
    !Array.isArray(data.records) ||
    !data.records.length ||
    data.records.length > 32 ||
    !data.records.every(validRecord)
  )
    return response({ error: 'Invalid encrypted records' }, 400);
  const lock = await acquire(env.DB);
  if (!lock) return response({ error: 'Sync busy' }, 429, { 'Retry-After': '5' });
  try {
    const day = new Date().toISOString().slice(0, 10);
    await env.DB.prepare(
      'UPDATE sync_state SET day = ?, uploads = 0, inserted = 0 WHERE id = 1 AND day <> ?',
    )
      .bind(day, day)
      .run();
    const budget = await env.DB.prepare(
      'SELECT uploads, inserted FROM sync_state WHERE id = 1',
    ).first();
    if (budget.uploads >= 3000 || budget.inserted + data.records.length > 4000)
      return response({ error: 'Daily free-plan budget reached' }, 429, { 'Retry-After': '3600' });
    const records = data.records.map((record) => ({
      ...record,
      charge: record.data.length * 2 + 4096,
    }));
    const incoming = records.reduce((sum, record) => sum + record.charge, 0);
    await cleanup(env.DB, { physical: lock.physical, incoming });
    if (!Number.isFinite(lock.physical) || lock.physical >= STOP_WRITES_AT)
      return response({ error: 'Storage guard active', limit: STORAGE_LIMIT }, 507);
    if (Date.now() - lock.started > 15000)
      return response({ error: 'Sync busy' }, 429, { 'Retry-After': '10' });
    const results = await env.DB.batch([
      env.DB.prepare('UPDATE sync_state SET uploads = uploads + 1 WHERE id = 1'),
      env.DB.prepare(
        "INSERT OR IGNORE INTO sync_records (vault, id, kind, time, iv, data, charge) SELECT ?, json_extract(value, '$.id'), json_extract(value, '$.kind'), json_extract(value, '$.time'), json_extract(value, '$.iv'), json_extract(value, '$.data'), json_extract(value, '$.charge') FROM json_each(?) WHERE (SELECT lease FROM sync_state WHERE id = 1) = ? AND (SELECT lease_until FROM sync_state WHERE id = 1) > CAST(strftime('%s', 'now') AS INTEGER) * 1000",
      ).bind(vault, JSON.stringify(records), lock.lease),
      env.DB.prepare(
        'SELECT id FROM sync_records WHERE vault = ? AND id IN (SELECT value FROM json_each(?))',
      ).bind(vault, JSON.stringify(records.map((record) => record.id))),
    ]);
    const physical = Number(results.at(-1).meta.size_after);
    if (physical >= CLEANUP_AT) await cleanup(env.DB, { physical });
    return response({
      accepted: results.at(-1).results.map((record) => record.id),
      limit: STORAGE_LIMIT,
    });
  } finally {
    await release(env.DB, lock.lease);
  }
}

async function download(url, env, vault) {
  if (url.searchParams.has('after')) {
    const after = Number(url.searchParams.get('after'));
    if (!Number.isSafeInteger(after) || after < 0)
      return response({ error: 'Invalid sync cursor' }, 400);
    const rows = (
      await env.DB.prepare(
        'SELECT seq, id, kind, time, iv, data FROM sync_records WHERE vault = ? AND seq > ? ORDER BY seq LIMIT ?',
      )
        .bind(vault, after, PAGE_SIZE + 1)
        .all()
    ).results;
    const records = rows.slice(0, PAGE_SIZE);
    return response({
      version: 1,
      records,
      after: records.at(-1)?.seq ?? after,
      hasMore: rows.length > PAGE_SIZE,
    });
  }
  // Capture the cursor first: a concurrent insert is then included by the next changes request.
  const head = await env.DB.prepare('SELECT MAX(seq) AS head FROM sync_records WHERE vault = ?')
    .bind(vault)
    .first();
  const kind = url.searchParams.get('kind') || 'chat';
  if (!['chat', 'log'].includes(kind)) return response({ error: 'Invalid history type' }, 400);
  let cursor;
  if (url.searchParams.has('before')) {
    try {
      cursor = JSON.parse(url.searchParams.get('before'));
      if (!Number.isSafeInteger(cursor.time) || !/^[A-Za-z0-9_-]{43}$/.test(cursor.id))
        throw new Error();
    } catch {
      return response({ error: 'Invalid history cursor' }, 400);
    }
  }
  const sql =
    'SELECT id, kind, time, iv, data FROM sync_records WHERE vault = ?' +
    (kind === 'log' ? " AND kind = 'log'" : '') +
    (cursor ? ' AND (time, id) < (?, ?)' : '') +
    ' ORDER BY time DESC, id DESC LIMIT ?';
  const params = [vault, ...(cursor ? [cursor.time, cursor.id] : []), PAGE_SIZE + 1];
  const rows = (
    await env.DB.prepare(sql)
      .bind(...params)
      .all()
  ).results;
  const more = rows.length > PAGE_SIZE;
  const records = rows.slice(0, PAGE_SIZE);
  const last = records.at(-1);
  return response({
    version: 1,
    records,
    head: head.head || 0,
    before: more ? JSON.stringify({ time: last.time, id: last.id }) : null,
    hasMore: more,
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS')
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Acidum-Key',
          'Access-Control-Max-Age': '86400',
        },
      });
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET')
      return response({ service: 'acidum-sync', version: 1, storageLimit: STORAGE_LIMIT });
    if (url.pathname !== '/v1/messages') return response({ error: 'Not found' }, 404);
    const instance = request.headers.get('X-Acidum-Key') || '';
    if (!env.INSTANCE_KEY_HASH || (await hash(instance)) !== env.INSTANCE_KEY_HASH)
      return response({ error: 'Unauthorized' }, 401);
    const auth = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!auth) return response({ error: 'Unauthorized' }, 401);
    const vault = await hash(auth);
    try {
      if (request.method === 'POST') return await upload(request, env, vault);
      if (request.method === 'GET') return await download(url, env, vault);
      return response({ error: 'Method not allowed' }, 405);
    } catch (error) {
      if (String(error).includes('sync_capacity'))
        return response({ error: 'Storage guard active' }, 507);
      if (String(error).includes('sync_daily_limit'))
        return response({ error: 'Daily budget reached' }, 429, { 'Retry-After': '3600' });
      return response({ error: 'Sync temporarily unavailable' }, 503, { 'Retry-After': '60' });
    }
  },
  async scheduled(event, env) {
    const lock = await acquire(env.DB);
    if (!lock) return;
    try {
      await cleanup(env.DB, { physical: lock.physical });
    } finally {
      await release(env.DB, lock.lease);
    }
  },
};
