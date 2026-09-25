// `castwright build <file> [-o dist] [--format cast|svg|gif|mp4]` — see docs/reference/cli.md.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../compiler/compile.js';
import { recordIntoSource } from '../exec/record.js';
import { resolveExecSteps } from '../exec/resolve.js';
import { parse } from '../parser/parse.js';
import { resolveShowSteps } from '../show/resolve.js';
import { CliUsageError } from './errors.js';
import { FORMAT_NAMES, getFormat } from './formats.js';
import { outputBaseName, printWarning } from './util.js';

export interface BuildOptions {
  file: string;
  outDir: string;
  format: string;
  /** SVG only: drop the window title bar. */
  noChrome?: boolean;
  /** SVG only: ms the last frame holds before the loop restarts. */
  loopDelay?: number;
  /** Let `exec:` steps run their commands. */
  allowExec?: boolean;
  /** Write what `exec:` steps produced back into the YAML file. Implies running them. */
  record?: boolean;
}

const USAGE =
  'usage: castwright build <file> [-o <dir>] [--format cast|svg|gif|mp4] [--no-chrome] [--loop-delay <ms>] [--allow-exec [--record]]';

export function parseBuildArgs(args: string[]): BuildOptions {
  let file: string | undefined;
  let outDir = 'dist';
  let format = 'cast';
  let noChrome = false;
  let loopDelay: number | undefined;
  let allowExec = false;
  let record = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-o' || arg === '--out') {
      const value = args[++i];
      if (value === undefined) throw new CliUsageError(`${arg} requires a value\n${USAGE}`);
      outDir = value;
    } else if (arg === '--format') {
      const value = args[++i];
      if (value === undefined) throw new CliUsageError(`--format requires a value\n${USAGE}`);
      format = value;
    } else if (arg === '--no-chrome') {
      noChrome = true;
    } else if (arg === '--loop-delay') {
      const value = args[++i];
      const ms = Number(value);
      if (value === undefined || value.trim() === '' || !Number.isInteger(ms) || ms < 0) {
        throw new CliUsageError(`--loop-delay requires a whole number of milliseconds\n${USAGE}`);
      }
      loopDelay = ms;
    } else if (arg === '--allow-exec') {
      allowExec = true;
    } else if (arg === '--record') {
      record = true;
    } else if (arg?.startsWith('-')) {
      throw new CliUsageError(`unknown option '${arg}'\n${USAGE}`);
    } else if (file === undefined) {
      file = arg;
    } else {
      throw new CliUsageError(`unexpected extra argument '${arg}'\n${USAGE}`);
    }
  }

  if (file === undefined) {
    throw new CliUsageError(`missing <file>\n${USAGE}`);
  }

  if ((noChrome || loopDelay !== undefined) && format !== 'svg') {
    const flag = noChrome ? '--no-chrome' : '--loop-delay';
    throw new CliUsageError(`${flag} only applies to --format svg\n${USAGE}`);
  }

  // Recording runs the commands, and running them is never implied.
  if (record && !allowExec) {
    throw new CliUsageError(
      `--record runs the exec: steps, so it needs --allow-exec too\n${USAGE}`,
    );
  }

  return {
    file,
    outDir,
    format,
    ...(noChrome ? { noChrome } : {}),
    ...(loopDelay === undefined ? {} : { loopDelay }),
    ...(allowExec ? { allowExec } : {}),
    ...(record ? { record } : {}),
  };
}

/** @returns the written file's path, for the caller to print to stdout. */
export async function runBuild(options: BuildOptions): Promise<string> {
  const outputFormat = getFormat(options.format);
  if (!outputFormat) {
    throw new CliUsageError(
      `unknown --format '${options.format}' — known formats: ${FORMAT_NAMES.join(', ')}`,
    );
  }

  const onWarning = (message: string, line: number, column: number): void =>
    printWarning(options.file, message, line, column);
  let source = readFileSync(options.file, 'utf8');
  let script = parse(source, options.file, { onWarning });
  const executed = await resolveExecSteps(script, options.file, {
    ...(options.allowExec ? { allowExec: true } : {}),
    onWarning,
  });
  script = executed.script;
  if (options.record && executed.recordings.length > 0) {
    // From here on the file replays what was recorded; build from that, so the
    // artifact matches what every later build will produce.
    source = recordIntoSource(source, executed.recordings);
    writeFileSync(options.file, source);
    script = parse(source, options.file, { onWarning });
  }
  const { script: resolved } = await resolveShowSteps(script, options.file);
  const cast = compile(resolved);
  const content = await outputFormat.render(cast, {
    chrome: !options.noChrome,
    ...(options.loopDelay === undefined ? {} : { loopDelay: options.loopDelay }),
  });

  mkdirSync(options.outDir, { recursive: true });
  const outPath = join(options.outDir, `${outputBaseName(options.file)}.${outputFormat.extension}`);
  writeFileSync(outPath, content);
  return outPath;
}
