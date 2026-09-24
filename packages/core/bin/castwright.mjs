#!/usr/bin/env node
// Launcher for the castwright CLI.
//
// This file exists so that `bin` points at something that is present at *install*
// time. Pointing it straight at dist/cli/index.js meant pnpm could not create the
// symlink on a fresh clone — dist does not exist yet — and `pnpm exec castwright`
// stayed broken until you happened to run install a second time after building.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const entry = new URL('../dist/cli/index.js', import.meta.url);

if (!existsSync(fileURLToPath(entry))) {
  process.stderr.write(
    'castwright: the package has not been built.\n' +
      'In this repository, run `pnpm build`. If you see this from an installed\n' +
      'package, the published tarball is missing its dist/ — please report it.\n',
  );
  process.exit(1);
}

await import(entry.href);
