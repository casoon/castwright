#!/usr/bin/env node
// Installs the three packages the way a user would — from their tarballs, into
// a throwaway project outside this workspace — and checks that what arrives is
// usable.
//
// The workspace itself proves almost nothing about this: every import inside it
// resolves through pnpm's symlinks to `src`, so a missing `files` entry, a
// wrong `exports` path, a bin that is not executable or a `dist` full of
// compiled tests all look fine right up until someone runs `npm install`.
//
// Run with `pnpm test:pack` (it builds first).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = ['core', 'player', 'astro'];
const NAMES = {
  core: '@casoon/castwright',
  player: '@casoon/castwright-player',
  astro: '@casoon/astro-castwright',
};

let failures = 0;

function ok(message) {
  process.stdout.write(`ok   ${message}\n`);
}

function check(condition, message) {
  if (condition) {
    ok(message);
    return;
  }
  failures++;
  process.stdout.write(`FAIL ${message}\n`);
}

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const workdir = mkdtempSync(join(tmpdir(), 'castwright-pack-'));
const tarballs = {};

try {
  // `pnpm pack`, not `npm pack`: it rewrites the `workspace:*` ranges that the
  // astro package depends on into real versions.
  for (const pkg of PACKAGES) {
    const out = run('pnpm', ['pack', '--pack-destination', workdir], join(repo, 'packages', pkg));
    const tarball = out.trim().split('\n').pop().trim();
    check(existsSync(tarball), `packed ${NAMES[pkg]}`);
    tarballs[pkg] = tarball;
  }

  // Overrides as well as dependencies: the astro package depends on the other
  // two at versions that are not on the registry yet.
  const specs = Object.fromEntries(PACKAGES.map((pkg) => [NAMES[pkg], `file:${tarballs[pkg]}`]));
  const consumer = join(workdir, 'consumer');
  await mkdir(consumer, { recursive: true });
  writeFileSync(
    join(consumer, 'package.json'),
    `${JSON.stringify(
      {
        name: 'castwright-pack-smoke',
        private: true,
        version: '0.0.0',
        type: 'module',
        dependencies: specs,
        overrides: specs,
      },
      null,
      2,
    )}\n`,
  );

  run('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], consumer);
  ok('npm install of the three tarballs succeeded');

  const modules = join(consumer, 'node_modules');

  for (const pkg of PACKAGES) {
    const dir = join(modules, ...NAMES[pkg].split('/'));
    check(existsSync(join(dir, 'README.md')), `${NAMES[pkg]} ships a README`);
    check(existsSync(join(dir, 'LICENSE')), `${NAMES[pkg]} ships a LICENSE`);

    const tests = [];
    const walk = (path) => {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name === '__tests__') tests.push(join(path, entry.name));
        else walk(join(path, entry.name));
      }
    };
    walk(dir);
    check(tests.length === 0, `${NAMES[pkg]} ships no compiled tests`);

    // Every target in `exports` must exist — a typo there is invisible in the
    // workspace, where nothing resolves through it. Only the values are paths;
    // the keys are subpaths and condition names.
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const targets = [];
    const collect = (node) => {
      if (typeof node === 'string') targets.push(node);
      else if (node && typeof node === 'object') Object.values(node).forEach(collect);
    };
    collect(manifest.exports);
    const missing = targets.filter((target) => !existsSync(join(dir, target)));
    check(
      missing.length === 0,
      `${NAMES[pkg]} exports resolve${missing.length > 0 ? ` (missing ${missing.join(', ')})` : ''}`,
    );
  }

  // The bin, through the symlink npm created — the failure mode that shipped a
  // `bin` pointing at a file the tarball did not contain.
  const demo = join(consumer, 'demo.terminal.yaml');
  writeFileSync(
    demo,
    'version: 1\nterminal: { cols: 40, rows: 6, theme: dracula }\nsteps:\n  - run: echo hi\n',
  );
  run(join(modules, '.bin', 'castwright'), ['validate', demo], consumer);
  ok('the castwright bin runs `validate` from the installed package');

  run(join(modules, '.bin', 'castwright'), ['build', demo, '-o', consumer], consumer);
  const header = JSON.parse(readFileSync(join(consumer, 'demo.cast'), 'utf8').split('\n')[0]);
  check(header.version === 2, 'the bin writes an asciicast v2 header');
  check(
    typeof header.theme?.palette === 'string' && header.theme.fg !== undefined,
    'the written theme uses the spec field names, not xterm’s',
  );

  // node-pty is an optional peer: a plain install must not pull a native
  // build, and exec: must then say what to install rather than crash.
  check(!existsSync(join(modules, 'node-pty')), 'a plain install does not pull node-pty');
  const execDemo = join(consumer, 'exec.terminal.yaml');
  writeFileSync(
    execDemo,
    'version: 1\nterminal: { cols: 40, rows: 6 }\nsteps:\n  - exec: echo hi\n',
  );
  let execError = '';
  try {
    run(
      join(modules, '.bin', 'castwright'),
      ['build', execDemo, '-o', consumer, '--allow-exec'],
      consumer,
    );
  } catch (error) {
    execError = String(error.stderr ?? error);
  }
  check(
    /node-pty, which is not installed/.test(execError),
    'exec: without node-pty names the missing package',
  );

  // The public entry points, imported for real.
  const core = await import(pathToFileURL(join(modules, '@casoon/castwright/dist/index.js')).href);
  check(typeof core.compile === 'function', '@casoon/castwright exports compile()');
  check(typeof core.toWireHeader === 'function', '@casoon/castwright exports toWireHeader()');

  const vite = await import(
    pathToFileURL(join(modules, '@casoon/castwright/dist/vite/index.js')).href
  );
  check(typeof vite.castwright === 'function', '@casoon/castwright/vite exports the plugin');

  const astro = await import(
    pathToFileURL(join(modules, '@casoon/astro-castwright/dist/index.js')).href
  );
  check(typeof astro.default === 'function', '@casoon/astro-castwright exports the integration');
  check(
    existsSync(join(modules, '@casoon/astro-castwright/src/TerminalDemo.astro')),
    '@casoon/astro-castwright ships TerminalDemo.astro',
  );

  // Server-side rendering, which is what this process is: bare Node, no DOM, no
  // bundler. SvelteKit, Nuxt, Remix, SolidStart and Qwik all evaluate a
  // component's module graph on the server, so importing the player there must
  // succeed and must quietly do nothing — the light-DOM fallback is what the
  // server renders. Both halves of this used to throw: xterm.js resolves to its
  // CJS build under Node, and `class extends HTMLElement` is a ReferenceError
  // before any guard could run.
  const player = await import(
    pathToFileURL(join(modules, '@casoon/castwright-player/dist/index.js')).href
  );
  ok('@casoon/castwright-player imports under Node (SSR)');
  check(
    typeof globalThis.customElements === 'undefined',
    'the SSR check really is running without a DOM',
  );
  check(typeof player.mount === 'function', 'the player exports mount()');
  check(
    typeof player.CastwrightDemoElement === 'function',
    'the player exports the element class without defining it',
  );

  let defineThrew = false;
  try {
    player.defineCastwrightDemo();
  } catch {
    defineThrew = true;
  }
  check(!defineThrew, 'defineCastwrightDemo() is a no-op without customElements');

  // The pure parts are genuinely usable on the server — a framework may want to
  // read a cast's geometry while rendering the fallback.
  const parsed = player.deserializeCast(
    '{"version":2,"width":80,"height":24,"theme":{"fg":"#fff","bg":"#000","palette":"#111:#222"}}\n[0,"o","hi"]',
  );
  check(parsed.header.theme.palette.length === 2, 'deserializeCast() works under Node');
  check(player.buildTimeline(parsed).durationMs === 0, 'buildTimeline() works under Node');
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

if (failures > 0) {
  process.stdout.write(`\n${failures} pack assertion(s) failed\n`);
  process.exit(1);
}
process.stdout.write('\nall pack assertions passed\n');
