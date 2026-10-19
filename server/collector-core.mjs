import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { ChatStore } from '../src/lib/core.js';
import { SyncClient, syncKeys, encryptSyncMessage } from '../src/lib/sync-protocol.js';

export class Collector {
  constructor(config, { Socket = WebSocket, fetcher = fetch } = {}) {
    this.config = config;
    this.Socket = Socket;
    this.fetcher = fetcher;
    this.stopped = true;
    this.connected = false;
    this.chain = Promise.resolve();
    this.attempt = 0;
    this.status = { connected: false, queued: 0, lastReceived: null, lastUpload: null, error: '' };
    mkdirSync(dirname(config.database), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(config.database);
    if (config.database !== ':memory:') chmodSync(config.database, 0o600);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA busy_timeout=5000;
      PRAGMA max_page_count=20000;
      CREATE TABLE IF NOT EXISTS pending (id TEXT PRIMARY KEY, time INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS buffer_state (id INTEGER PRIMARY KEY, bytes INTEGER NOT NULL DEFAULT 0);
      INSERT OR IGNORE INTO buffer_state (id) VALUES (1);
      CREATE TRIGGER IF NOT EXISTS buffer_insert AFTER INSERT ON pending BEGIN
        UPDATE buffer_state SET bytes = bytes + LENGTH(NEW.data) WHERE id = 1;
      END;
      CREATE TRIGGER IF NOT EXISTS buffer_delete AFTER DELETE ON pending BEGIN
        UPDATE buffer_state SET bytes = bytes - LENGTH(OLD.data) WHERE id = 1;
      END;
      CREATE TABLE IF NOT EXISTS cursors (account TEXT PRIMARY KEY, last_line INTEGER NOT NULL, room TEXT, room_since INTEGER);
    `);
  }

  async start() {
    this.keys = await syncKeys(this.config.token);
    this.client = new SyncClient(this.config.syncLink, this.keys, this.fetcher);
    this.stopped = false;
    this.connect();
    this.poller = setInterval(() => this.poll(), this.config.pollMs || 60000);
    this.flusher = setInterval(() => this.flush(), this.config.flushMs || 30000);
    this.flush();
  }

  connect() {
    if (this.stopped) return;
    clearTimeout(this.reconnectTimer);
    const previous = this.socket;
    this.socket = null;
    previous?.close();
    const store = new ChatStore(500);
    this.store = store;
    const url = this.config.socketUrl || 'wss://ws0.acium.app/chat/ws';
    const socket = new this.Socket(url + '?token=' + encodeURIComponent(this.config.token));
    this.socket = socket;
    this.lastFrame = Date.now();
    socket.addEventListener('open', () => {
      if (socket !== this.socket) return;
      this.connected = true;
      this.updateStatus();
    });
    socket.addEventListener('message', (event) => {
      if (socket !== this.socket || typeof event.data !== 'string' || event.data.length > 8000000)
        return;
      this.lastFrame = Date.now();
      this.attempt = 0;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      this.chain = this.chain
        .then(() => this.ingest(data, store))
        .catch(() => {
          this.status.error = 'Capture paused; reconnecting';
          socket.close();
        });
    });
    socket.addEventListener('error', () => socket.close());
    socket.addEventListener('close', () => {
      if (socket !== this.socket || this.stopped) return;
      this.connected = false;
      this.updateStatus();
      const delay = Math.min(60000, 2000 * 2 ** Math.min(this.attempt++, 5));
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    });
  }

  sendHistory(name) {
    const cursor = this.db.prepare('SELECT last_line FROM cursors WHERE account = ?').get(name);
    const lastLine = Math.max(0, (cursor?.last_line || 0) - 1000);
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify({ name, lastLine }));
  }

  async ingest(payload, store = this.store) {
    const messages = [];
    const changed = new Set();
    for (const event of (Array.isArray(payload) ? payload : [payload]).slice(0, 10000)) {
      if (Array.isArray(event?.tabs)) {
        store.setTabs(event.tabs);
        for (const name of store.names) {
          const cursor = this.db.prepare('SELECT * FROM cursors WHERE account = ?').get(name);
          if (cursor) {
            const tab = store.tab(name);
            tab.lastLine = cursor.last_line;
            tab.room = cursor.room ? JSON.parse(cursor.room) : null;
            tab.roomSince = cursor.room_since ?? -Infinity;
          }
          this.sendHistory(name);
        }
        continue;
      }
      const message = store.add(event);
      if (!message) continue;
      const record = await encryptSyncMessage(this.keys, message);
      if (record) messages.push(record);
      changed.add(message.account);
    }
    if (!messages.length) return;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const insert = this.db.prepare(
        'INSERT OR IGNORE INTO pending (id, time, data) VALUES (?, ?, ?)',
      );
      for (const record of messages) insert.run(record.id, record.time, JSON.stringify(record));
      const save = this.db.prepare(
        'INSERT INTO cursors VALUES (?, ?, ?, ?) ON CONFLICT(account) DO UPDATE SET last_line = excluded.last_line, room = excluded.room, room_since = excluded.room_since WHERE excluded.last_line >= cursors.last_line',
      );
      for (const name of changed) {
        const tab = store.tab(name);
        save.run(
          name,
          tab.lastLine,
          tab.room ? JSON.stringify(tab.room) : null,
          Number.isFinite(tab.roomSince) ? tab.roomSince : null,
        );
      }
      const size = this.db.prepare('SELECT bytes FROM buffer_state WHERE id = 1').get().bytes;
      if (size > 40000000) {
        this.db.exec(`DELETE FROM pending WHERE rowid NOT IN (
          SELECT rowid FROM (SELECT rowid, SUM(LENGTH(data)) OVER (ORDER BY time DESC, rowid DESC) AS total FROM pending) WHERE total <= 35000000
        )`);
        this.status.error = 'Offline buffer full; oldest pending records removed';
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.status.lastReceived = Date.now();
    this.updateStatus();
  }

  poll() {
    if (!this.connected || Date.now() - this.lastFrame > (this.config.staleMs || 600000)) {
      if (this.connected) this.socket.close();
      return;
    }
    for (const name of this.store.names) this.sendHistory(name);
  }

  async flush() {
    if (this.flushing || this.stopped || Date.now() < (this.retryAt || 0)) return;
    this.flushing = true;
    try {
      for (let batch = 0; batch < 4; batch++) {
        const records = this.db
          .prepare('SELECT data FROM pending ORDER BY time, rowid LIMIT 32')
          .all()
          .map((row) => JSON.parse(row.data));
        if (!records.length) break;
        const result = await this.client.upload(records);
        this.db.exec('BEGIN IMMEDIATE');
        try {
          const remove = this.db.prepare('DELETE FROM pending WHERE id = ?');
          for (const id of result.accepted) remove.run(id);
          this.db.exec('COMMIT');
        } catch (error) {
          this.db.exec('ROLLBACK');
          throw error;
        }
        this.status.lastUpload = Date.now();
        this.status.error = '';
      }
      this.retryDelay = 30000;
      this.retryAt = 0;
    } catch (error) {
      this.status.error =
        error.code === 'daily_limit'
          ? 'Daily sync limit reached; waiting for 00:00 UTC'
          : error.status === 429
            ? 'Sync busy or daily quota reached; waiting'
            : 'Upload unavailable; encrypted records queued';
      this.retryDelay = Math.min((this.retryDelay || 30000) * 2, 1800000);
      this.retryAt = Date.now() + (error.retryAfter || this.retryDelay);
    } finally {
      this.flushing = false;
      this.updateStatus();
    }
  }

  updateStatus() {
    this.status.connected = this.connected;
    this.status.queued = this.db.prepare('SELECT COUNT(*) AS total FROM pending').get().total;
    if (!this.config.statusFile) return;
    const path = this.config.statusFile;
    writeFileSync(path + '.tmp', JSON.stringify(this.status, null, 2) + '\n', { mode: 0o600 });
    renameSync(path + '.tmp', path);
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    clearInterval(this.poller);
    clearInterval(this.flusher);
    this.socket?.close();
    await this.chain;
    while (this.flushing) await new Promise((resolve) => setTimeout(resolve, 20));
    this.connected = false;
    this.updateStatus();
    this.db.close();
  }
}
