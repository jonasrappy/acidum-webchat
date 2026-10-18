import { messageAttention } from './core.js';
import { mergeRoomCopies } from './timeline.js';

export const MAX_LOG_EVENTS = 100;
const signature = (message) => JSON.stringify([message.type, message.name, message.text]);
const isLogEvent = (message) => message.log || messageAttention(message);
const sources = (rows) => rows.flatMap((row) => row.sources || [row]);

function valid(message) {
  return (
    message &&
    typeof message.account === 'string' &&
    typeof message.key === 'string' &&
    typeof message.name === 'string' &&
    typeof message.text === 'string' &&
    ['text', 'priv', 'join', 'part', 'quit', 'room', 'log'].includes(message.type) &&
    Number.isFinite(message.time) &&
    Number.isFinite(new Date(message.time).getTime()) &&
    !message.sources &&
    !message.accounts
  );
}

export class EventLog {
  rows = [];
  signatures = new Map();
  serialized = '[]';
  dirty = false;

  constructor(storage = null, scope = '') {
    this.storage = storage;
    this.key = 'acidum-events-' + scope;
    try {
      const saved = JSON.parse(storage?.getItem(this.key) || '[]');
      if (!Array.isArray(saved)) return;
      const restored = saved
        .slice(-MAX_LOG_EVENTS)
        .flatMap((row) => (Array.isArray(row?.sources) ? row.sources.slice(0, 50) : [row]));
      this.capture(restored.filter(valid));
    } catch {}
  }

  relevant(message) {
    return (
      isLogEvent(message) ||
      (this.signatures
        .get(signature(message))
        ?.some((row) => Math.abs(row.time - message.time) <= 1000) ??
        false)
    );
  }

  capture(messages) {
    const unique = new Map();
    for (const message of [...sources(this.rows), ...messages])
      unique.set(JSON.stringify([message.account, message.key]), message);
    const ordered = [...unique.values()].sort(
      (a, b) => a.time - b.time || a.account.localeCompare(b.account) || a.key.localeCompare(b.key),
    );
    const rows = mergeRoomCopies(ordered).filter(isLogEvent).slice(-MAX_LOG_EVENTS);
    const serialized = JSON.stringify(rows);
    if (serialized === this.serialized) return false;
    this.rows = rows;
    this.serialized = serialized;
    this.signatures = new Map();
    for (const row of rows) {
      const key = signature(row);
      const copies = this.signatures.get(key) || [];
      copies.push(row);
      this.signatures.set(key, copies);
    }
    this.dirty = true;
    return true;
  }

  flush() {
    if (!this.dirty || !this.storage) return;
    try {
      this.storage.setItem(this.key, this.serialized);
      this.dirty = false;
    } catch {}
  }
}
