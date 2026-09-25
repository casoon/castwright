// Development only (root postinstall of this repo, never of a published
// package): node-pty 1.1.0 ships its macOS/Linux prebuilt `spawn-helper`
// without the executable bit and no install script sets it, so every spawn
// fails with "posix_spawnp failed". The exec: tests need a working PTY on a
// fresh clone. Users of the published package get a message naming the file
// and the chmod instead (packages/core/src/exec/resolve.ts).

import { chmodSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(new URL('../packages/core/package.json', import.meta.url));
let root;
try {
  root = dirname(require.resolve('node-pty/package.json'));
} catch {
  process.exit(0); // not installed (e.g. a production install) — nothing to fix
}
const prebuilds = join(root, 'prebuilds');
if (existsSync(prebuilds)) {
  for (const dir of readdirSync(prebuilds)) {
    const helper = join(prebuilds, dir, 'spawn-helper');
    if (existsSync(helper)) chmodSync(helper, 0o755);
  }
}
