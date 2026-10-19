import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.js';
import {
  SyncQuota,
  DAILY_READ_LIMIT,
  DAILY_WRITE_LIMIT,
  READ_BUDGET,
  withQuota,
} from '../server/quota.js';
import { D1, quotaBinding } from './helpers/d1.mjs';

const post = (binding, path, body) =>
  binding.get().fetch('https://quota/' + path, { method: 'POST', body: JSON.stringify(body) });
function seed(binding, reads, writes) {
  const day = new Date().toISOString().slice(0, 10);
  binding.db.prepare('UPDATE budget SET day = ?, reads = ?, writes = ?').run(day, reads, writes);
  Object.assign(binding.object.state, { day, reads, writes });
}

test('simultaneous devices share reservations and both reads and writes stop at the 95% ceilings', async () => {
  for (const dimension of ['reads', 'writes']) {
    const q = quotaBinding();
    const limit = dimension === 'reads' ? DAILY_READ_LIMIT : DAILY_WRITE_LIMIT;
    seed(q, dimension === 'reads' ? limit - 10 : 0, dimension === 'writes' ? limit - 10 : 0);
    const budget = {
      reads: dimension === 'reads' ? 10 : 0,
      writes: dimension === 'writes' ? 10 : 0,
    };
    const results = await Promise.all([post(q, 'reserve', budget), post(q, 'reserve', budget)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 429]);
    assert.equal((await post(q, 'reserve', { reads: 0, writes: 0 })).status, 429);
    assert.ok(q.object.state[dimension] <= limit);
    q.db.close();
  }
});

test('blocked quota refuses authenticated API requests without reading or writing D1', async () => {
  const DB = new D1(),
    QUOTA = quotaBinding();
  seed(QUOTA, DAILY_READ_LIMIT, DAILY_WRITE_LIMIT);
  const key = 'synthetic_instance_key_12345678901234567890';
  const INSTANCE_KEY_HASH = Buffer.from(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)),
  ).toString('base64url');
  const env = { DB, QUOTA, INSTANCE_KEY_HASH };
  for (const method of ['GET', 'POST']) {
    const result = await worker.fetch(
      new Request('https://sync.example/v1/messages', {
        method,
        headers: { 'X-Acidum-Key': key, Authorization: 'Bearer ' + 'a'.repeat(43) },
        body: method === 'POST' ? '{}' : undefined,
      }),
      env,
    );
    assert.equal(result.status, 429);
    assert.equal((await result.json()).code, 'daily_limit');
  }
  await worker.scheduled({}, env);
  assert.equal(DB.queries, 0);
  DB.close();
  QUOTA.db.close();
});

test('actual usage is reconciled and a lost response retains its full reservation', async () => {
  const q = quotaBinding();
  const response = await post(q, 'reserve', { reads: 100, writes: 50 });
  const reservation = await response.json();
  await post(q, 'settle', { id: reservation.id, reads: 17, writes: 9 });
  assert.equal(q.object.state.reads, 17);
  assert.equal(q.object.state.writes, 9);
  await post(q, 'reserve', { reads: 100, writes: 50 });
  assert.equal(q.object.state.reads, 117);
  assert.equal(q.object.state.writes, 59);
  // A new object instance reads the same persisted, conservative budget.
  const restarted = new SyncQuota(q.object.ctx, {});
  assert.equal(restarted.state.reads, 117);
  assert.equal(restarted.state.writes, 59);
  q.db.close();
});

test('UTC rollover retains in-flight reservations and resets spent usage', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-19T23:59:59Z') });
  const q = quotaBinding();
  const a = await (await post(q, 'reserve', { reads: 100, writes: 30 })).json();
  await post(q, 'settle', { id: a.id, reads: 50, writes: 10 });
  const pending = await (await post(q, 'reserve', { reads: 200, writes: 40 })).json();
  q.object.state.blocked = 1;
  q.object.save();
  t.mock.timers.tick(2000);
  assert.equal((await post(q, 'reserve', { reads: 1, writes: 0 })).status, 200);
  assert.equal(q.object.state.day, '2026-10-20');
  assert.equal(q.object.state.reads, 201);
  assert.equal(q.object.state.writes, 40);
  await post(q, 'settle', { id: pending.id, reads: 25, writes: 7 });
  assert.equal(q.object.state.reads, 26);
  assert.equal(q.object.state.writes, 7);
  q.db.close();
});

test('missing quota service fails closed; reads require no writes in D1', async () => {
  const DB = new D1();
  await assert.rejects(
    withQuota({ DB }, READ_BUDGET, () => DB.prepare('SELECT * FROM sync_state').all()),
  );
  assert.equal(DB.queries, 0);
  const QUOTA = quotaBinding();
  await withQuota({ DB, QUOTA }, READ_BUDGET, (db) => db.prepare('SELECT * FROM sync_state').all());
  assert.equal(QUOTA.object.state.reads, 2);
  assert.equal(QUOTA.object.state.writes, 0);
  DB.close();
  QUOTA.db.close();
});
