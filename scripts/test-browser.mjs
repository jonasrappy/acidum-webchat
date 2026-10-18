import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const suites = readdirSync('tests')
  .filter((file) => file.endsWith('.browser.cjs'))
  .sort();
for (const suite of suites) {
  process.stdout.write(`\n${suite}\n`);
  const result = spawnSync(process.execPath, ['tests/' + suite], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
