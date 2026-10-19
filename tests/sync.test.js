import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { STOP_WRITES_AT, cleanup } from '../server/worker.js';
import {
  syncKeys,
  encryptSyncMessage,
  decryptSyncMessage,
  SyncClient,
  parseSyncLink,
} from '../src/lib/sync-protocol.js';
import { D1 } from './helpers/d1.mjs';

const instance = 'synthetic_private_instance_key_1234567890123';
const link = 'https://sync.example.test/#key=' + instance;
const hash = (value) =>
  crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(value))
    .then((bytes) => Buffer.from(bytes).toString('base64url'));
const message = (number = 0, account = 'Nova') => ({
  account,
  name: 'Alma',
  key: 'fixture-' + number,
  text: 'Synthetic message ' + number,
  type: 'text',
  time: 1700000000000 + number,
});
async function setup() {
  const DB = new D1();
  const env = { DB, INSTANCE_KEY_HASH: await hash(instance) };
  const client = new SyncClient(link, await syncKeys('synthetic_sync_token_123'), (url, init) =>
    worker.fetch(new Request(url, init), env),
  );
  return { DB, env, client };
}

test('same received message on two devices has one encrypted identity and one database row', async () => {
  const { DB, client } = await setup();
  try {
    const first = await encryptSyncMessage(client.keys, message());
    const second = await encryptSyncMessage(await syncKeys('synthetic_sync_token_123'), {
      ...message(),
      id: 999,
    });
    assert.equal(first.id, second.id);
    assert.notEqual(first.data, second.data);
    const results = await Promise.allSettled([client.upload([first]), client.upload([second])]);
    assert.ok(results.some((result) => result.status === 'fulfilled'));
    for (const result of results)
      if (result.status === 'rejected') assert.equal(result.reason.status, 429);
    await client.upload([second]);
    assert.equal(DB.db.prepare('SELECT COUNT(*) AS total FROM sync_records').get().total, 1);
    const result = await client.latest();
    assert.deepEqual(await decryptSyncMessage(client.keys, result.records[0]), message());
    assert.equal(result.records[0].data.includes('Synthetic'), false);
    assert.equal(
      JSON.stringify(DB.db.prepare('SELECT * FROM sync_records').all()).includes(
        'synthetic_sync_token',
      ),
      false,
    );
    await assert.rejects(decryptSyncMessage(await syncKeys('another_token'), result.records[0]));
    await assert.rejects(
      decryptSyncMessage(client.keys, { ...result.records[0], time: result.records[0].time + 1 }),
    );
  } finally {
    DB.close();
  }
});

test('private instance authentication and token-derived vaults isolate history', async () => {
  const { DB, env, client } = await setup();
  try {
    await client.upload([await encryptSyncMessage(client.keys, message())]);
    const other = new SyncClient(link, await syncKeys('another_token'), (url, init) =>
      worker.fetch(new Request(url, init), env),
    );
    assert.equal((await other.latest()).records.length, 0);
    const before = DB.queries;
    const refused = await worker.fetch(new Request('https://sync.example.test/v1/messages'), env);
    assert.equal(refused.status, 401);
    assert.equal(DB.queries, before);
    assert.throws(() => parseSyncLink('http://public.example/#key=' + instance));
    assert.throws(() => parseSyncLink('https://sync.example.test/?token=secret#key=' + instance));
  } finally {
    DB.close();
  }
});

test('history paginates and incremental cursors include late uploads with old timestamps', async () => {
  const { DB, client } = await setup();
  try {
    for (let start = 0; start < 130; start += 30) {
      await client.upload(
        await Promise.all(
          Array.from({ length: Math.min(30, 130 - start) }, (_, index) =>
            encryptSyncMessage(client.keys, { ...message(start + index), log: index === 0 }),
          ),
        ),
      );
    }
    const latest = await client.latest();
    assert.equal(latest.records.length, 100);
    assert.equal(latest.hasMore, true);
    assert.equal((await client.latest('chat', latest.before)).records.length, 30);
    assert.equal((await client.latest('log')).records.length, 5);
    await client.upload([await encryptSyncMessage(client.keys, { ...message(-500), log: true })]);
    const changes = await client.changes(latest.head);
    assert.equal(changes.records.length, 1);
    assert.equal(changes.hasMore, false);
    assert.equal((await decryptSyncMessage(client.keys, changes.records[0])).key, 'fixture--500');
  } finally {
    DB.close();
  }
});

test('storage guard refuses writes with a margin below 400 MB; cleanup removes oldest records', async () => {
  const { DB, client } = await setup();
  try {
    await client.upload([await encryptSyncMessage(client.keys, message())]);
    await client.upload([await encryptSyncMessage(client.keys, message(1))]);
    DB.physical = STOP_WRITES_AT;
    await assert.rejects(
      client.upload([await encryptSyncMessage(client.keys, message(2))]),
      (error) => error.status === 507,
    );
    assert.equal(DB.db.prepare('SELECT COUNT(*) AS total FROM sync_records').get().total, 2);
    DB.db.exec('UPDATE sync_state SET charged = 251000000');
    await cleanup(DB, { physical: 360000000 });
    assert.equal(DB.db.prepare('SELECT COUNT(*) AS total FROM sync_records').get().total, 0);
  } finally {
    DB.close();
  }
});

test('free-plan daily guard defers records without deleting existing history', async () => {
  const { DB, client } = await setup();
  try {
    DB.db
      .prepare('UPDATE sync_state SET day = ?, inserted = 4000')
      .run(new Date().toISOString().slice(0, 10));
    await assert.rejects(
      client.upload([await encryptSyncMessage(client.keys, message())]),
      (error) => error.status === 429,
    );
    assert.equal(DB.db.prepare('SELECT COUNT(*) AS total FROM sync_records').get().total, 0);
    assert.equal(DB.db.prepare('SELECT lease_until FROM sync_state').get().lease_until, 0);
  } finally {
    DB.close();
  }
});
