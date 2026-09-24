// Asserts, against the real built output, that the promises in
// meta/constraints.md hold. Verifying that the YAML parser and compiler
// genuinely do not reach the client needs an actual bundle inspection, not an
// assumption.
//
// Runs as part of this example's `build`, so CI fails on a regression.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(dist);
const clientJs = files.filter((f) => f.endsWith('.js'));
const html = files.filter((f) => f.endsWith('.html'));

const failures = [];
const note = (ok, message) => {
  console.error(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};

// --- The client must not carry the build-time half of the pipeline ----------
// Strings unique to the parser/compiler. If any appears in a client chunk, a
// build-time module has leaked into the browser bundle.
const FORBIDDEN = [
  'unknown markup tag',
  'missing required top-level key',
  'output.raw has an unknown escape',
  'YAMLParseError',
  '@xterm/headless',
];

for (const file of clientJs) {
  const code = readFileSync(file, 'utf8');
  for (const needle of FORBIDDEN) {
    note(!code.includes(needle), `client bundle is free of "${needle}" (${file.split('/').pop()})`);
  }
}

// --- The page must be useful before and without JavaScript -----------------
for (const file of html) {
  const page = readFileSync(file, 'utf8');
  note(page.includes('<castwright-demo'), `${file.split('/').pop()} renders <castwright-demo>`);
  note(
    page.includes('data-castwright-cast'),
    `${file.split('/').pop()} inlines the cast (no runtime fetch)`,
  );
  note(
    /<pre>[^<]*\S[^<]*<\/pre>/.test(page),
    `${file.split('/').pop()} ships a non-empty accessibility fallback`,
  );
}

note(clientJs.length > 0, 'a client bundle was produced at all');

if (failures.length > 0) {
  console.error(`\n${failures.length} bundle assertion(s) failed`);
  process.exit(1);
}
console.error('\nall bundle assertions passed');
