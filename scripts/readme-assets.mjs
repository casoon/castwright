// Regenerates the images in .github/readme/ that the root README shows.
//
// The terminal demos are castwright's own SVG export of files in examples/ —
// dogfooding, and the same fixtures the tests compile, so a README image can
// never show something the compiler does not produce. The pipeline diagram is
// rendered from pipeline.mmd with mermaid-cli, in a light and a dark variant
// for GitHub's <picture> switch.
//
//   pnpm readme:assets                       # the terminal demos
//   CHROME=/path/to/chrome pnpm readme:assets  # …and the diagram
//
// mermaid-cli drives a headless Chrome through Puppeteer; CHROME points it at
// one already installed (e.g. Playwright's) instead of downloading another.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repo = new URL('..', import.meta.url).pathname;
const out = join(repo, '.github', 'readme');
const cli = join(repo, 'packages', 'core', 'bin', 'castwright.mjs');

const run = (command, args, env = {}) =>
  execFileSync(command, args, { cwd: repo, stdio: 'inherit', env: { ...process.env, ...env } });

for (const demo of ['basic', 'show', 'recorded']) {
  run('node', [cli, 'build', `examples/${demo}.terminal.yaml`, '--format', 'svg', '-o', out]);
}

if (process.env.CHROME) {
  const scratch = mkdtempSync(join(tmpdir(), 'castwright-mermaid-'));
  try {
    const puppeteer = join(scratch, 'puppeteer.json');
    writeFileSync(puppeteer, JSON.stringify({ executablePath: process.env.CHROME }));
    for (const [variant, theme] of [
      ['light', 'neutral'],
      ['dark', 'dark'],
    ]) {
      run(
        'npx',
        [
          '-y',
          '@mermaid-js/mermaid-cli@11',
          '-i',
          join(out, 'pipeline.mmd'),
          '-o',
          join(out, `pipeline-${variant}.svg`),
          '-t',
          theme,
          '-b',
          'transparent',
          '-c',
          join(out, 'mermaid.json'),
          '-p',
          puppeteer,
        ],
        { PUPPETEER_SKIP_DOWNLOAD: '1' },
      );
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
} else {
  process.stdout.write('CHROME not set — pipeline diagram left as is.\n');
}
