export const DAILY_READ_LIMIT = 4750000;
export const DAILY_WRITE_LIMIT = 95000;
const MAX_REQUESTS = 15000;
const MAX_PENDING = 256;
export const READ_BUDGET = { reads: 2048, writes: 0 };
export const WRITE_BUDGET = { reads: 10000, writes: 2048 };
export const CLEANUP_BUDGET = { reads: 200000, writes: 50000 };

const dayAt = (time) => new Date(time).toISOString().slice(0, 10);
const resetAt = (time) => Date.parse(dayAt(time) + 'T00:00:00Z') + 86400000;

export class SyncQuota {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS budget (
      id INTEGER PRIMARY KEY CHECK (id = 1), day TEXT NOT NULL DEFAULT '',
      reads INTEGER NOT NULL DEFAULT 0, writes INTEGER NOT NULL DEFAULT 0,
      calls INTEGER NOT NULL DEFAULT 0, pending INTEGER NOT NULL DEFAULT 0,
      blocked INTEGER NOT NULL DEFAULT 0
    )`);
    this.sql.exec('INSERT OR IGNORE INTO budget (id) VALUES (1)');
    this.sql.exec(`CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY, reads INTEGER NOT NULL, writes INTEGER NOT NULL
    ) WITHOUT ROWID`);
    this.state = this.sql.exec('SELECT * FROM budget WHERE id = 1').one();
  }

  rollover(now) {
    const day = dayAt(now);
    if (this.state.day === day) return;
    const carry = this.sql
      .exec(
        'SELECT COALESCE(SUM(reads), 0) AS reads, COALESCE(SUM(writes), 0) AS writes, COUNT(*) AS pending FROM reservations',
      )
      .one();
    const seeded = this.env.QUOTA_BASELINE_DAY === day;
    this.state = {
      id: 1,
      day,
      reads: carry.reads + (seeded ? Number(this.env.QUOTA_BASELINE_READS || 0) : 0),
      writes: carry.writes + (seeded ? Number(this.env.QUOTA_BASELINE_WRITES || 0) : 0),
      calls: 0,
      pending: carry.pending,
      blocked: 0,
    };
    this.save();
  }

  save() {
    const q = this.state;
    this.sql.exec(
      'UPDATE budget SET day = ?, reads = ?, writes = ?, calls = ?, pending = ?, blocked = ? WHERE id = 1',
      q.day,
      q.reads,
      q.writes,
      q.calls,
      q.pending,
      q.blocked,
    );
  }

  denied(now, busy = false) {
    return Response.json(
      { code: busy ? 'busy' : 'daily_limit', resetAt: resetAt(now) },
      { status: 429 },
    );
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method !== 'POST' || !['/reserve', '/settle'].includes(path))
      return new Response(null, { status: 404 });
    const input = await request.json();
    return this.ctx.storage.transactionSync(() => {
      const now = Date.now();
      this.rollover(now);
      if (path === '/reserve') {
        const { reads, writes } = input;
        if (
          ![reads, writes].every((n) => Number.isSafeInteger(n) && n >= 0) ||
          reads > 200000 ||
          writes > 50000
        )
          return new Response(null, { status: 400 });
        const q = this.state;
        if (q.blocked) return this.denied(now);
        if (
          q.calls >= MAX_REQUESTS ||
          q.reads + reads > DAILY_READ_LIMIT ||
          q.writes + writes > DAILY_WRITE_LIMIT
        ) {
          q.blocked = 1;
          this.save();
          return this.denied(now);
        }
        if (q.pending >= MAX_PENDING) return this.denied(now, true);
        const id = crypto.randomUUID();
        this.sql.exec(
          'INSERT INTO reservations (id, reads, writes) VALUES (?, ?, ?)',
          id,
          reads,
          writes,
        );
        q.reads += reads;
        q.writes += writes;
        q.calls++;
        q.pending++;
        this.save();
        return Response.json({ id, reads, writes });
      }
      const reservation = this.sql
        .exec('SELECT reads, writes FROM reservations WHERE id = ?', input.id)
        .toArray()[0];
      if (!reservation) return new Response(null, { status: 204 });
      const measured = [input.reads, input.writes].every((n) => Number.isSafeInteger(n) && n >= 0);
      const reads = measured ? input.reads : reservation.reads;
      const writes = measured ? input.writes : reservation.writes;
      this.state.reads += reads - reservation.reads;
      this.state.writes += writes - reservation.writes;
      this.state.pending--;
      if (reads > reservation.reads || writes > reservation.writes) this.state.blocked = 1;
      this.sql.exec('DELETE FROM reservations WHERE id = ?', input.id);
      this.save();
      return new Response(null, { status: 204 });
    });
  }
}

class QuotaError extends Error {
  constructor(code, reset) {
    super(
      code === 'daily_limit'
        ? 'Daily sync limit reached. Sync resumes at 00:00 UTC.'
        : 'Sync budget is unavailable.',
    );
    this.code = code;
    this.resetAt = reset;
  }
}

export function quotaResponse(error) {
  const daily = error.code === 'daily_limit';
  return Response.json(
    { error: error.message, code: error.code, resetAt: error.resetAt },
    {
      status: daily || error.code === 'busy' ? 429 : 503,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Retry-After',
        'Cache-Control': 'no-store',
        'Retry-After': String(
          daily ? Math.max(1, Math.ceil((error.resetAt - Date.now()) / 1000)) : 60,
        ),
      },
    },
  );
}

function metered(db, usage) {
  const mark = (result) => {
    const reads = result.meta?.rows_read,
      writes = result.meta?.rows_written;
    if (![reads, writes].every((n) => Number.isSafeInteger(n) && n >= 0)) usage.failed = true;
    else {
      usage.reads += reads;
      usage.writes += writes;
    }
    return result;
  };
  const tracked = async (action) => {
    try {
      return mark(await action());
    } catch (error) {
      usage.failed = true;
      throw error;
    }
  };
  const wrap = (statement) => ({
    inner: statement,
    bind(...params) {
      return wrap(statement.bind(...params));
    },
    run: () => tracked(() => statement.run()),
    all: () => tracked(() => statement.all()),
    first: async () => (await tracked(() => statement.all())).results[0] ?? null,
  });
  return {
    prepare: (sql) => wrap(db.prepare(sql)),
    async batch(statements) {
      try {
        return (await db.batch(statements.map((s) => s.inner))).map(mark);
      } catch (error) {
        usage.failed = true;
        throw error;
      }
    },
  };
}

export async function withQuota(env, budget, action) {
  if (!env.QUOTA) throw new QuotaError('unavailable');
  const stub = env.QUOTA.get(env.QUOTA.idFromName('daily-budget'));
  let response;
  try {
    response = await stub.fetch('https://quota/reserve', {
      method: 'POST',
      body: JSON.stringify(budget),
    });
  } catch {
    throw new QuotaError('unavailable');
  }
  if (!response.ok) {
    const refusal = await response.json();
    throw new QuotaError(refusal.code || 'unavailable', refusal.resetAt);
  }
  const reservation = await response.json();
  const usage = { reads: 0, writes: 0, failed: false };
  try {
    return await action(metered(env.DB, usage));
  } finally {
    // An interrupted request keeps its whole reservation; it is never silently refunded.
    try {
      await stub.fetch('https://quota/settle', {
        method: 'POST',
        body: JSON.stringify({
          id: reservation.id,
          reads: usage.failed ? reservation.reads : usage.reads,
          writes: usage.failed ? reservation.writes : usage.writes,
        }),
      });
    } catch {}
  }
}
