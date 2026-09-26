// Builds the SVGs the site shows as plain <img>s, into public/svg/.
//
// With castwright's own CLI — the path a README author takes — rather than by
// importing the exporter, so what the page shows is exactly what
// `castwright build --format svg` produces.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const cli = join(
  dirname(require.resolve('@casoon/castwright/package.json')),
  'bin',
  'castwright.mjs',
);
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const out = join(here, '..', 'public', 'svg');

for (const file of [
  'site/src/demos/files/install.terminal.yaml',
  'site/src/demos/error-fix.terminal.yaml',
]) {
  execFileSync(process.execPath, [cli, 'build', join(repo, file), '--format', 'svg', '-o', out], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}
