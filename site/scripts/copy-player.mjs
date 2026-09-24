// Copies the self-contained player bundle into public/.
//
// The demo page loads it with a plain <script is:inline> from inside the demo
// stage, because that is the only place the theme allows a page's own script —
// and an inline script is not processed by Astro, so the file has to exist as a
// real asset. Which is also the theme's origin rule: a demo loads its code from
// the site itself, never a CDN.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const playerPkg = require.resolve('@casoon/castwright-player/package.json');
const bundleDir = join(dirname(playerPkg), 'dist', 'standalone');
const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'public');

if (!existsSync(join(bundleDir, 'castwright-player.js'))) {
  console.error(
    'site: @casoon/castwright-player has no standalone bundle.\n' +
      'Build the packages first: pnpm --filter @casoon/castwright-player build',
  );
  process.exit(1);
}

mkdirSync(publicDir, { recursive: true });
for (const file of ['castwright-player.js', 'castwright-player.js.map']) {
  const from = join(bundleDir, file);
  if (existsSync(from)) copyFileSync(from, join(publicDir, file));
}
console.error('site: copied the player bundle into public/');
