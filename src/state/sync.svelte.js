import { readPreference, writePreference } from '../lib/storage.js';
import {
  validSyncMessage,
  syncMessageId,
  syncKeys,
  SyncClient,
  encryptSyncMessage,
  decryptSyncMessage,
  parseSyncLink,
  MAX_SYNC_MESSAGES,
} from '../lib/sync-protocol.js';
import { restoreMessage } from '../lib/message-text.js';
import { putPending, readPending, removePending } from '../lib/sync-outbox.js';

export class CloudSync {
  enabled = $state(false);
  busy = $state(false);
  loading = $state(false);
  status = $state('Device only');
  draftLink = $state('');
  rows = $state.raw([]);
  hasMore = $state(false);
  histories = new Map();
  accountStreams = new Map();
  cursor = null;
  persisting = Promise.resolve();
  persistTimer = null;
  token = '';
  scope = '';
  owner = '';
  generation = 0;
  timer = null;
  client = null;
  pending = new Map();
  seen = new Set();
  remoteSeen = new Set();
  retry = 30000;
  pausedUntil = 0;

  constructor(onMessages) {
    this.onMessages = onMessages;
  }

  async attach(token, scope) {
    this.detach();
    this.token = token;
    this.scope = scope;
    this.draftLink = readPreference('acidum-sync-' + scope);
    if (this.draftLink) await this.connect(this.draftLink);
  }

  async connect(link = this.draftLink) {
    try {
      parseSyncLink(link);
    } catch (error) {
      this.status = error.message;
      return false;
    }
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.status = 'Connecting sync…';
    this.pausedUntil = 0;
    this.busy = true;
    this.rows = [];
    this.seen.clear();
    this.remoteSeen.clear();
    this.histories.clear();
    this.accountStreams.clear();
    this.cursor = null;
    this.hasMore = false;
    try {
      const keys = await syncKeys(this.token);
      if (generation !== this.generation) return false;
      const client = new SyncClient(link, keys);
      this.client = client;
      this.owner = this.scope + ':' + client.endpoint;
      this.enabled = true;
      this.draftLink = link.trim();
      writePreference('acidum-sync-' + this.scope, this.draftLink);
      await this.snapshot(client, generation);
      if (generation !== this.generation) return false;
      this.status = 'Sync connected';
      this.schedule(1000);
      return true;
    } catch (error) {
      if (generation === this.generation) {
        this.status = error.message;
        if (error.code === 'daily_limit') this.pausedUntil = Date.now() + error.retryAfter;
        if (this.enabled) this.schedule(Math.max(60000, error.retryAfter || 0));
      }
      return false;
    } finally {
      if (generation === this.generation) this.busy = false;
    }
  }

  hasOlder(accounts = []) {
    return [...this.histories.values()].some(
      (page) =>
        page.hasMore &&
        (!accounts.length ||
          !page.accounts.size ||
          accounts.some((name) => page.accounts.has(name))),
    );
  }

  async snapshot(client, generation) {
    let catalog;
    try {
      catalog = await client.streams();
    } catch (error) {
      if (error.status !== 404) throw error;
      catalog = { streams: [null], head: null };
    }
    if (generation !== this.generation) return;
    let head = catalog.head;
    await Promise.all(
      catalog.streams.map(async (stream) => {
        const page = await client.latest('chat', '', stream);
        if (generation !== this.generation) return;
        const messages = await this.receive(page.records, generation);
        if (generation !== this.generation) return;
        const account = this.accountStreams.get(stream);
        this.histories.set(stream, {
          stream,
          before: page.before,
          hasMore: page.hasMore,
          accounts: new Set([
            ...messages.map((message) => message.account),
            ...(account ? [account] : []),
          ]),
        });
        if (head === null) head = page.head;
      }),
    );
    if (generation !== this.generation) return;
    await this.pullLog(client, generation);
    if (generation !== this.generation) return;
    this.cursor = head || 0;
    this.hasMore = this.hasOlder();
    this.onMessages([]);
  }

  queue(message) {
    if (!this.enabled || !validSyncMessage(message)) return;
    this.pending.set(syncMessageId(message), message);
    if (this.pending.size > MAX_SYNC_MESSAGES)
      this.pending.delete(this.pending.keys().next().value);
    if (!this.persistTimer)
      this.persistTimer = setTimeout(() => {
        this.persistTimer = null;
        this.flush();
      }, 500);
    if (!this.timer && !this.busy) this.schedule(10000);
  }

  schedule(delay = 60000) {
    clearTimeout(this.timer);
    if (!this.enabled) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.run();
    }, delay);
  }

  persistPending(client, owner) {
    const generation = this.generation;
    const messages = [...this.pending.entries()];
    const seen = new Set(this.remoteSeen);
    const operation = this.persisting
      .catch(() => {})
      .then(() => this.savePending(client, owner, messages, seen, generation));
    this.persisting = operation;
    return operation;
  }

  async savePending(client, owner, messages, seen, generation) {
    for (let start = 0; start < messages.length; start += 64) {
      const batch = messages.slice(start, start + 64);
      const records = await Promise.all(
        batch.map(([, message]) => encryptSyncMessage(client.keys, message)),
      );
      await putPending(
        owner,
        records.filter((record) => record && !seen.has(record.id)),
      );
      for (const [key, message] of batch)
        if (generation === this.generation && this.pending.get(key) === message)
          this.pending.delete(key);
    }
  }

  async receive(records, generation = this.generation, { history = true } = {}) {
    if (!records.length) return [];
    const messages = [];
    for (const record of records) {
      if (generation !== this.generation) return [];
      if ((history ? this.seen : this.remoteSeen).has(record.id)) continue;
      const message = restoreMessage(await decryptSyncMessage(this.client.keys, record));
      if (generation !== this.generation) return;
      this.remoteSeen.add(record.id);
      if (history) this.seen.add(record.id);
      if (record.stream) this.accountStreams.set(record.stream, message.account);
      messages.push(message);
    }
    // A received record is already stored remotely, including a copy queued by this device.
    await this.persisting.catch(() => {});
    if (generation !== this.generation) return;
    await removePending(
      this.owner,
      records.map((record) => record.id),
    );
    if (!messages.length) return [];
    if (history) {
      const unique = new Map(
        [...this.rows, ...messages].map((message) => [syncMessageId(message), message]),
      );
      this.rows = [...unique.values()]
        .sort((a, b) => a.time - b.time || a.key.localeCompare(b.key))
        .slice(-MAX_SYNC_MESSAGES);
    }
    if (this.remoteSeen.size > 20000) this.remoteSeen = new Set([...this.remoteSeen].slice(-10000));
    if (this.seen.size > 20000) this.seen = new Set([...this.seen].slice(-10000));
    this.onMessages(messages);
    return messages;
  }

  async pullLog(client, generation) {
    const result = await client.latest('log');
    if (generation !== this.generation) return;
    await this.receive(result.records, generation, { history: false });
  }

  async run() {
    if (!this.enabled || !this.client || this.busy) return;
    if (Date.now() < this.pausedUntil) {
      this.schedule(this.pausedUntil - Date.now());
      return;
    }
    if (document.hidden || !navigator.onLine) {
      this.schedule(60000);
      return;
    }
    const generation = this.generation;
    const client = this.client;
    const owner = this.owner;
    this.busy = true;
    try {
      if (this.cursor === null) {
        await this.snapshot(client, generation);
      } else {
        for (let page = 0; page < 5; page++) {
          const result = await client.changes(this.cursor);
          if (generation !== this.generation) return;
          await this.receive(result.records, generation);
          this.cursor = result.after;
          if (!result.hasMore) break;
        }
      }
      await this.persistPending(client, owner);
      for (let batch = 0; batch < 4; batch++) {
        if (generation !== this.generation) return;
        const pending = await readPending(owner);
        if (!pending.length) break;
        const accepted = await client.upload(pending);
        await removePending(owner, accepted.accepted);
      }
      if (generation !== this.generation) return;
      this.status =
        'Synced · ' +
        new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      this.retry = 30000;
    } catch (error) {
      if (generation === this.generation) this.status = error.message;
      this.retry = error.retryAfter || Math.min(this.retry * 2, 1800000);
      if (error.code === 'daily_limit') this.pausedUntil = Date.now() + this.retry;
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        this.schedule(this.pending.size ? this.retry : Math.max(60000, this.retry));
      }
    }
  }

  async loadOlder(accounts = []) {
    if (!this.enabled || !this.client || !this.hasOlder(accounts) || this.loading) return false;
    const page = [...this.histories.values()]
      .filter(
        (page) =>
          page.hasMore &&
          (!accounts.length ||
            !page.accounts.size ||
            accounts.some((name) => page.accounts.has(name))),
      )
      .sort((a, b) => JSON.parse(b.before).time - JSON.parse(a.before).time)[0];
    const generation = this.generation;
    const client = this.client;
    this.loading = true;
    try {
      const result = await client.latest('chat', page.before, page.stream);
      if (generation !== this.generation) return false;
      page.before = result.before;
      page.hasMore = result.hasMore;
      this.hasMore = this.hasOlder();
      await this.receive(result.records, generation);
      return true;
    } catch (error) {
      if (generation === this.generation) this.status = error.message;
      return false;
    } finally {
      if (generation === this.generation) this.loading = false;
    }
  }

  async importArchive() {
    if (!this.enabled || !this.scope) return;
    const { loadBefore } = await import('../lib/archive.js');
    const generation = this.generation;
    const client = this.client;
    const owner = this.owner;
    const importedKey = 'acidum-sync-imported-' + owner;
    if (readPreference(importedKey) === 'yes') return;
    let before = null;
    do {
      const result = await loadBefore(this.scope, '', before, { limit: 250 });
      if (generation !== this.generation) return;
      for (const message of result.messages) this.queue(message);
      await this.persistPending(client, owner);
      if (!result.hasMore) break;
      before = result.before;
    } while (before);
    if (generation !== this.generation) return;
    writePreference(importedKey, 'yes');
    this.schedule(1000);
  }

  disable() {
    const token = this.token;
    const scope = this.scope;
    if (this.scope) writePreference('acidum-sync-' + this.scope, null);
    this.detach();
    this.token = token;
    this.scope = scope;
    this.draftLink = '';
  }

  flush() {
    if (this.enabled && this.client && this.pending.size)
      return this.persistPending(this.client, this.owner).catch(() => {});
    return Promise.resolve();
  }

  detach() {
    ++this.generation;
    clearTimeout(this.timer);
    this.timer = null;
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    this.enabled = this.busy = this.loading = false;
    this.client = null;
    this.pending.clear();
    this.seen.clear();
    this.rows = [];
    this.hasMore = false;
    this.histories.clear();
    this.accountStreams.clear();
    this.remoteSeen.clear();
    this.cursor = null;
    this.token = this.scope = this.owner = '';
    this.status = 'Device only';
    this.pausedUntil = 0;
  }
}
