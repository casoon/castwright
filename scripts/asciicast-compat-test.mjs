#!/usr/bin/env node
// Checks the compiler's output against the reference implementations rather
// than against our own reading of the specification.
//
// This is the test that would have caught the format bug: the header used to
// carry xterm's field names (`foreground`, `background`, a palette array) where
// asciicast v2 has `fg`, `bg` and a colon-joined string. `asciinema` does not
// merely ignore that — it refuses the file outright with "not a v1, v2, v3
// asciicast file" — so every promise the documentation made about
// `asciinema play`, `agg` and `svg-term` was false. The last check here writes
// that old spelling deliberately and fails if anything can still read it.
//
//   node scripts/asciicast-compat-test.mjs                  # skips if the tools are absent
//   node scripts/asciicast-compat-test.mjs --require-tools  # what CI runs
//
// Install them with `brew install agg asciinema`, or from
// https://github.com/asciinema/agg/releases and
// https://github.com/asciinema/asciinema/releases.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireTools = process.argv.includes('--require-tools');

let failures = 0;

function ok(message) {
  process.stdout.write(`ok   ${message}\n`);
}

function check(condition, message, detail) {
  if (condition) {
    ok(message);
    return;
  }
  failures++;
  process.stdout.write(`FAIL ${message}${detail ? `\n     ${detail}` : ''}\n`);
}

function tool(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
}

function has(command) {
  return spawnSync(command, ['--version'], { encoding: 'utf8' }).status === 0;
}

const missing = ['asciinema', 'agg'].filter((command) => !has(command));
if (missing.length > 0) {
  const message = `asciicast compatibility check needs ${missing.join(' and ')} on PATH`;
  if (!requireTools) {
    process.stdout.write(`skip ${message} — install with \`brew install agg asciinema\`\n`);
    process.exit(0);
  }
  process.stdout.write(`FAIL ${message}\n`);
  process.exit(1);
}

const { compile, parse, serializeCast } = await import(
  pathToFileURL(join(repo, 'packages/core/dist/index.js')).href
);

const workdir = mkdtempSync(join(tmpdir(), 'castwright-compat-'));

try {
  const examples = readdirSync(join(repo, 'examples'))
    .filter((name) => name.endsWith('.terminal.yaml'))
    .sort();
  check(examples.length > 0, 'there are examples to check');

  let themed;
  for (const name of examples) {
    const file = join(repo, 'examples', name);
    const cast = compile(parse(readFileSync(file, 'utf8'), file));
    const castPath = join(workdir, `${basename(name, '.terminal.yaml')}.cast`);
    writeFileSync(castPath, serializeCast(cast));

    // `convert` is `play` without a TTY: it parses the file with asciinema's own
    // deserializer and re-emits it, so a header asciinema cannot read fails here.
    const out = join(workdir, `${basename(name, '.terminal.yaml')}.v3.cast`);
    const result = tool('asciinema', ['convert', castPath, out]);
    check(
      result.status === 0,
      `asciinema reads ${name}`,
      `${result.stderr.trim()}${result.stdout.trim()}`,
    );
    if (result.status !== 0) continue;

    // Not just "it parsed": the theme has to survive into asciinema's own model,
    // which is what proves the field names and the palette encoding are right.
    const header = JSON.parse(readFileSync(out, 'utf8').split('\n')[0]);
    const term = header.term ?? header;
    check(term.cols === cast.header.width, `asciinema keeps ${name}'s width`);
    check(term.rows === cast.header.height, `asciinema keeps ${name}'s height`);
    if (cast.header.theme) {
      check(
        term.theme?.palette === cast.header.theme.palette.join(':'),
        `asciinema keeps ${name}'s 16-colour palette`,
        `got ${JSON.stringify(term.theme)}`,
      );
      check(term.theme?.fg === cast.header.theme.foreground, `asciinema keeps ${name}'s fg`);
      themed ??= { name, castPath, cast };
    }
  }

  check(themed !== undefined, 'at least one example carries a theme');

  if (themed) {
    // agg has its own asciicast parser and its own renderer.
    const gif = join(workdir, 'themed.gif');
    const render = tool('agg', [themed.castPath, gif]);
    check(
      render.status === 0,
      `agg renders ${themed.name}`,
      `${render.stderr.trim()}${render.stdout.trim()}`,
    );
    check(render.status !== 0 || statSync(gif).size > 0, 'agg wrote a non-empty GIF');

    // Rendering the same events with the theme removed must look different —
    // otherwise agg parsed the header and silently ignored the colours, which
    // is indistinguishable from the bug unless it is checked.
    const stripped = join(workdir, 'stripped.cast');
    const lines = readFileSync(themed.castPath, 'utf8').split('\n');
    const header = JSON.parse(lines[0]);
    delete header.theme;
    writeFileSync(stripped, [JSON.stringify(header), ...lines.slice(1)].join('\n'));

    const strippedGif = join(workdir, 'stripped.gif');
    tool('agg', [stripped, strippedGif]);
    check(
      !readFileSync(gif).equals(readFileSync(strippedGif)),
      'agg applies the embedded theme rather than ignoring it',
    );
  }

  // The regression canary. If this ever starts passing, the wire format and the
  // in-memory model have been conflated again — see meta/decisions.md.
  const themedCast = themed?.cast;
  if (themedCast?.header.theme) {
    const lines = readFileSync(themed.castPath, 'utf8').split('\n');
    const header = JSON.parse(lines[0]);
    header.theme = {
      foreground: themedCast.header.theme.foreground,
      background: themedCast.header.theme.background,
      cursor: themedCast.header.theme.cursor,
      palette: themedCast.header.theme.palette,
    };
    const bad = join(workdir, 'xterm-spelling.cast');
    writeFileSync(bad, [JSON.stringify(header), ...lines.slice(1)].join('\n'));

    const result = tool('asciinema', ['convert', bad, join(workdir, 'xterm-spelling.v3.cast')]);
    check(
      result.status !== 0,
      'asciinema rejects the pre-fix header spelling (regression canary)',
      'the old xterm-named theme was accepted — the canary can no longer detect a relapse',
    );
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

if (failures > 0) {
  process.stdout.write(`\n${failures} compatibility assertion(s) failed\n`);
  process.exit(1);
}
process.stdout.write('\nall asciicast compatibility assertions passed\n');
