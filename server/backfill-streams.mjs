import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import {
  SyncClient,
  syncKeys,
  syncStreamId,
  decryptSyncMessage,
} from '../src/lib/sync-protocol.js';

const path = process.argv[2] || homedir() + '/.config/acidum/collector.json';
if ((statSync(path).mode & 0o077) !== 0) throw new Error('Set configuration permissions to 600.');
const config = JSON.parse(readFileSync(path, 'utf8'));
const keys = await syncKeys(config.token);
const client = new SyncClient(config.syncLink, keys);
let before = '',
  updated = 0;
do {
  const page = await client.latest('chat', before);
  const pending = [];
  for (const record of page.records) {
    if (record.stream) continue;
    const message = await decryptSyncMessage(keys, record);
    pending.push({ ...record, stream: await syncStreamId(keys, message.account) });
  }
  while (pending.length) {
    const result = await client.upload(pending.slice(0, 32));
    const accepted = new Set(result.accepted);
    if (!accepted.size) throw new Error('Indexing paused; rerun later.');
    for (let i = pending.length - 1; i >= 0; i--)
      if (accepted.has(pending[i].id)) {
        pending.splice(i, 1);
        updated++;
      }
  }
  before = page.before || '';
} while (before);
console.log('Updated account indexes for ' + updated + ' encrypted records.');
