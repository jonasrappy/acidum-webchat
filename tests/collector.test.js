import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Collector } from '../server/collector-core.mjs';
import worker from '../server/worker.js';
import { D1 } from './helpers/d1.mjs';

class Socket extends EventTarget {
  static connections = [];
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
    Socket.connections.push(this);
  }
  send(text) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
  receive(data) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }));
  }
}
const instance = 'synthetic_private_instance_key_1234567890123';
const hash = (text) =>
  crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(text))
    .then((bytes) => Buffer.from(bytes).toString('base64url'));

test('collector persists encrypted offline records and cursors, resumes after restart and deduplicates replays', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'acidum-test-'));
  const DB = new D1();
  const env = { DB, INSTANCE_KEY_HASH: await hash(instance) };
  let offline = true;
  const fetcher = (url, init) =>
    offline
      ? Promise.reject(new Error('Synthetic outage'))
      : worker.fetch(new Request(url, init), env);
  const config = {
    token: 'synthetic_collector_token',
    syncLink: 'https://sync.example.test/#key=' + instance,
    database: join(dir, 'buffer.sqlite'),
    statusFile: join(dir, 'status.json'),
  };
  let collector;
  try {
    collector = new Collector(config, { Socket, fetcher });
    await collector.start();
    collector.socket.dispatchEvent(new Event('open'));
    collector.socket.receive({ tabs: ['Nova'] });
    const event = {
      me: { name: 'Nova' },
      user: { name: 'Alma' },
      type: 'text',
      time: 1700000000000,
      text: 'Private synthetic message',
    };
    collector.socket.receive([event]);
    await collector.chain;
    await collector.flush();
    assert.equal(collector.status.queued, 1);
    assert.equal(
      collector.db.prepare('SELECT data FROM pending').get().data.includes(event.text),
      false,
    );
    assert.equal(
      collector.socket.sent.some((frame) => 'say' in frame),
      false,
    );
    await collector.stop();
    collector = new Collector(config, { Socket, fetcher });
    await collector.start();
    collector.socket.dispatchEvent(new Event('open'));
    collector.socket.receive({ tabs: ['Nova'] });
    collector.socket.receive([event]);
    await collector.chain;
    assert.equal(collector.status.queued, 1);
    assert.equal(collector.socket.sent[0].lastLine, event.time - 1000);
    offline = false;
    collector.retryAt = 0;
    await collector.flush();
    assert.equal(collector.status.queued, 0);
    assert.equal(DB.db.prepare('SELECT COUNT(*) AS total FROM sync_records').get().total, 1);
    collector.socket.receive({
      ...event,
      time: event.time + 2000,
      text: 'Morning capture resumed',
    });
    await collector.chain;
    await collector.flush();
    assert.equal(DB.db.prepare('SELECT COUNT(*) AS total FROM sync_records').get().total, 2);
    const nightSocket = collector.socket;
    nightSocket.close();
    assert.equal(collector.connected, false);
    await new Promise((resolve) => setTimeout(resolve, 2100));
    assert.notEqual(collector.socket, nightSocket);
    collector.socket.dispatchEvent(new Event('open'));
    collector.socket.receive({ tabs: ['Nova'] });
    collector.socket.receive({
      ...event,
      time: event.time + 4000,
      text: 'After scheduled desktop restart',
    });
    await collector.chain;
    await collector.flush();
    assert.equal(DB.db.prepare('SELECT COUNT(*) AS total FROM sync_records').get().total, 3);
    const status = JSON.parse(readFileSync(config.statusFile, 'utf8'));
    assert.equal(status.connected, true);
    assert.ok(status.lastUpload);
    assert.equal(JSON.stringify(status).includes('synthetic_collector_token'), false);
  } finally {
    await collector?.stop();
    DB.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
