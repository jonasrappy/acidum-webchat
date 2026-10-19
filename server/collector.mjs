import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { Collector } from './collector-core.mjs';

process.umask(0o077);
const path = resolve(process.argv[2] || homedir() + '/.config/acidum/collector.json');
if ((statSync(path).mode & 0o077) !== 0)
  throw new Error('Set collector configuration permissions to 600.');
const config = JSON.parse(readFileSync(path, 'utf8'));
if (!config.token || !config.syncLink || !config.database)
  throw new Error('Collector configuration is incomplete.');
const collector = new Collector(config);
await collector.start();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await collector.stop();
    process.exit(0);
  });
process.on('uncaughtException', () => {
  console.error('Collector stopped unexpectedly; service restart required.');
  process.exit(1);
});
process.on('unhandledRejection', () => {
  console.error('Collector stopped unexpectedly; service restart required.');
  process.exit(1);
});
