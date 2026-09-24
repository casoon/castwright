// Generates src/generated/xterm-css.ts from the installed @xterm/xterm's
// stylesheet.
//
// Why: xterm.js is unusable without its CSS, and the player's central promise
// is that a plain HTML page with one <script type="module"> works. Telling
// people to remember a second CSS import would break exactly the case the
// custom element exists for. Inlining it keeps setup at zero files.
//
// Run by the package's `prebuild` script, so the generated file always matches
// the installed xterm version rather than a copy that silently drifts.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const xtermPkg = require.resolve('@xterm/xterm/package.json');
const cssPath = join(dirname(xtermPkg), 'css', 'xterm.css');
const version = JSON.parse(readFileSync(xtermPkg, 'utf8')).version;

const css = readFileSync(cssPath, 'utf8');

const out = `// GENERATED FILE — do not edit. Run \`pnpm --filter @casoon/castwright-player generate:css\`.
//
// xterm.js ${version} stylesheet, inlined so the custom element works in a
// plain HTML page with no bundler and no second file to remember.
//
// Copyright (c) 2017, The xterm.js authors (https://github.com/xtermjs/xterm.js)
// Copyright (c) 2014, 2019, Fabrice Bellard
// Copyright (c) 2012-2013, Christopher Jeffrey (https://github.com/chjj/)
// Released under the MIT license. See node_modules/@xterm/xterm/LICENSE.

export const XTERM_VERSION = ${JSON.stringify(version)};

export const XTERM_CSS = ${JSON.stringify(css)};
`;

const target = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'generated',
  'xterm-css.ts',
);
writeFileSync(target, out, 'utf8');
console.error(`generated xterm-css.ts from @xterm/xterm@${version} (${css.length} bytes of CSS)`);
