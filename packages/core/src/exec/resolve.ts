// `exec:` steps → a typed command plus its recorded output (plan item 10).
//
// Runs between parse() and compile(), like `show:`: each command really runs
// in a pseudo-terminal the size of the demo, and the step is replaced by the
// typing of the command, then its output as `output` and `wait` steps with the
// timing it actually had. compile() stays synchronous and free of I/O.
//
// Nothing runs unless the caller passes `allowExec` — a demo file is not a
// script anyone should be surprised to find executing. node-pty is an optional
// peer dependency, imported only when a script contains `exec:`, so the CLI
// stays installable without a native build for everyone who only simulates.
//
// Real output is the opposite of deterministic: it depends on the machine,
// the time and the network. `recordIntoSource()` (record.ts) writes it back
// into the YAML once, after which the demo replays the same bytes forever.

import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { CastwrightParseError } from '../parser/errors.js';
import type { ExecStep, Script, Step } from '../types.js';

export interface ExecOptions {
  /** Without it, a script containing `exec:` is rejected. */
  allowExec?: boolean;
  onWarning?: (message: string, line: number, column: number) => void;
}

/** One `exec:` step as it actually ran. */
export interface Recording {
  step: ExecStep;
  /** Output chunks with ms since the command started. */
  chunks: { time: number; data: string }[];
  exitCode: number;
  durationMs: number;
}

export interface ResolvedExec {
  script: Script;
  /** In the order the `exec:` steps appear — what `recordIntoSource()` consumes. */
  recordings: Recording[];
}

// Chunks closer together than this become one `output` step; a PTY hands
// output over in many small pieces that no viewer could tell apart.
const COALESCE_MS = 16;
// node-pty can report the exit before the last output has arrived.
const DRAIN_MS = 50;

type Pty = typeof import('node-pty');

function stepError(step: ExecStep, file: string, message: string): CastwrightParseError {
  return new CastwrightParseError(
    message,
    file,
    { line: step.source.line, column: step.source.column },
    step.source.text,
  );
}

async function loadPty(step: ExecStep, file: string): Promise<Pty> {
  try {
    const module = await import('node-pty');
    return ((module as { default?: Pty }).default ?? module) as Pty;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
      throw stepError(
        step,
        file,
        "step 'exec' runs commands through node-pty, which is not installed — add it: pnpm add -D node-pty",
      );
    }
    throw error;
  }
}

/**
 * node-pty 1.1.0 ships its macOS helper without the executable bit, and no
 * install script sets it; spawning then fails with a bare "posix_spawnp
 * failed". Name the file and the fix instead.
 */
function spawnHelperHint(): string {
  try {
    const require = createRequire(import.meta.url);
    const root = dirname(require.resolve('node-pty/package.json'));
    const helper = join(root, 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper');
    if (!existsSync(helper)) return '';
    try {
      accessSync(helper, constants.X_OK);
      return '';
    } catch {
      return ` — node-pty's helper is not executable; fix it with: chmod +x "${helper}"`;
    }
  } catch {
    return '';
  }
}

function run(
  pty: Pty,
  step: ExecStep,
  file: string,
  cols: number,
  rows: number,
): Promise<Recording> {
  const cwd = resolve(dirname(file), step.cwd ?? '.');
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
    return Promise.reject(stepError(step, file, `step 'exec': cwd is not a directory: ${cwd}`));
  }

  return new Promise((done, fail) => {
    let term: ReturnType<Pty['spawn']>;
    try {
      term = pty.spawn('/bin/sh', ['-c', step.command], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: { ...process.env, ...step.env, TERM: 'xterm-256color' } as Record<string, string>,
      });
    } catch (error) {
      fail(
        stepError(
          step,
          file,
          `step 'exec' could not start: ${(error as Error).message}${spawnHelperHint()}`,
        ),
      );
      return;
    }

    const start = Date.now();
    const chunks: Recording['chunks'] = [];
    let finished = false;
    term.onData((data) => {
      if (!finished) chunks.push({ time: Date.now() - start, data });
    });
    const timer = setTimeout(() => {
      finished = true;
      term.kill();
      fail(
        stepError(
          step,
          file,
          `step 'exec' did not finish within ${step.timeout} ms — raise 'timeout' or check the command`,
        ),
      );
    }, step.timeout);
    term.onExit(({ exitCode }) => {
      clearTimeout(timer);
      if (finished) return;
      const durationMs = Date.now() - start;
      setTimeout(() => {
        finished = true;
        done({ step, chunks, exitCode, durationMs });
      }, DRAIN_MS);
    });
  });
}

/** The typed command, then the output with the gaps it really had. */
function toSteps(recording: Recording): Step[] {
  const { step } = recording;
  const steps: Step[] = [
    {
      kind: 'type',
      text: [{ text: step.command }],
      speed: step.speed,
      jitter: 0,
      prompt: step.prompt,
      pause: 0,
    },
    { kind: 'key', key: 'enter', pause: 0 },
  ];

  let groupTime = -Infinity;
  let previous = 0;
  let pending = '';
  const flush = (): void => {
    if (pending === '') return;
    steps.push({ kind: 'output', text: [{ text: pending }], lineDelay: 0, pause: 0 });
    pending = '';
  };
  for (const chunk of recording.chunks) {
    if (chunk.time - groupTime >= COALESCE_MS) {
      flush();
      const gap = Math.round(chunk.time - previous);
      const ms = step.idle === undefined ? gap : Math.min(gap, step.idle);
      if (ms > 0) steps.push({ kind: 'wait', ms });
      groupTime = chunk.time;
      previous = chunk.time;
    }
    pending += chunk.data;
  }
  flush();
  if (step.pause > 0) steps.push({ kind: 'wait', ms: step.pause });
  return steps;
}

// Things that should not end up in a published demo. A hint, not a scanner:
// it catches the common shapes and says so, it does not promise anything.
const SENSITIVE: [RegExp, string][] = [
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/, 'a GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}/, 'an API key'],
  [/\bnpm_[A-Za-z0-9]{36}\b/, 'an npm token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
];

function warnings(recording: Recording): string[] {
  const out: string[] = [];
  const text = recording.chunks.map((chunk) => chunk.data).join('');
  if (recording.exitCode !== 0) {
    out.push(`step 'exec' exited with code ${recording.exitCode} — its output is recorded anyway`);
  }
  for (const [pattern, what] of SENSITIVE) {
    if (pattern.test(text))
      out.push(`step 'exec' output looks like it contains ${what} — check it before publishing`);
  }
  const home = homedir();
  if (home.length > 1 && text.includes(home)) {
    out.push(
      `step 'exec' output contains your home directory (${home}) — check it before publishing`,
    );
  }
  return out;
}

/**
 * Runs every `exec:` step in `script` and replaces it with the typed command
 * and its recorded output. `file` is the script's own path; `cwd` resolves
 * against its directory. Scripts without `exec:` come back unchanged, and
 * node-pty is not loaded for them.
 */
export async function resolveExecSteps(
  script: Script,
  file: string,
  options: ExecOptions = {},
): Promise<ResolvedExec> {
  const first = script.steps.find((step): step is ExecStep => step.kind === 'exec');
  if (!first) return { script, recordings: [] };
  if (!options.allowExec) {
    throw stepError(
      first,
      file,
      "step 'exec' runs a real command — allow it with --allow-exec (CLI) or allowExec: true (Vite plugin)",
    );
  }

  const warn = options.onWarning ?? (() => {});
  if (process.env['CI']) {
    warn(
      "running 'exec' steps in CI: the output depends on this machine — record it once with --record to make the demo deterministic",
      first.source.line,
      first.source.column,
    );
  }

  const pty = await loadPty(first, file);
  const recordings: Recording[] = [];
  const steps: Step[] = [];
  for (const step of script.steps) {
    if (step.kind !== 'exec') {
      steps.push(step);
      continue;
    }
    const recording = await run(pty, step, file, script.terminal.cols, script.terminal.rows);
    for (const message of warnings(recording)) warn(message, step.source.line, step.source.column);
    recordings.push(recording);
    steps.push(...toSteps(recording));
  }
  return { script: { ...script, steps }, recordings };
}
