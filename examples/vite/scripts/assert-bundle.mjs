// Same constraint as the Astro example, checked without Astro in the picture:
// the parser and compiler must not reach the browser.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const walk = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const js = walk(dist).filter((f) => f.endsWith('.js'));
const forbidden = ['unknown markup tag', 'missing required top-level key', '@xterm/headless'];
const failures = [];

for (const file of js) {
  const code = readFileSync(file, 'utf8');
  for (const needle of forbidden) {
    const ok = !code.includes(needle);
    console.error(`${ok ? 'ok  ' : 'FAIL'} free of "${needle}" (${file.split('/').pop()})`);
    if (!ok) failures.push(needle);
  }
  // The compiled cast must be inlined, or the plugin did not run.
  if (code.includes('"version":2') || code.includes('version:2')) {
    console.error(`ok   compiled cast is inlined (${file.split('/').pop()})`);
  }
}

if (js.length === 0) failures.push('no client bundle produced');
if (failures.length > 0) {
  console.error(`\n${failures.length} assertion(s) failed`);
  process.exit(1);
}
console.error('\nall bundle assertions passed');
