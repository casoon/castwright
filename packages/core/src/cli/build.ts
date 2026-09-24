// `castwright build <file> [-o dist] [--format cast]` — see docs/reference/cli.md.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from '../compiler/compile.js';
import { parse } from '../parser/parse.js';
import { CliUsageError } from './errors.js';
import { FORMAT_NAMES, getFormat } from './formats.js';
import { outputBaseName, printWarning } from './util.js';

export interface BuildOptions {
  file: string;
  outDir: string;
  format: string;
}

const USAGE = 'usage: castwright build <file> [-o <dir>] [--format <name>]';

export function parseBuildArgs(args: string[]): BuildOptions {
  let file: string | undefined;
  let outDir = 'dist';
  let format = 'cast';

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

  return { file, outDir, format };
}

/** @returns the written file's path, for the caller to print to stdout. */
export function runBuild(options: BuildOptions): string {
  const outputFormat = getFormat(options.format);
  if (!outputFormat) {
    throw new CliUsageError(
      `unknown --format '${options.format}' — known formats: ${FORMAT_NAMES.join(', ')}`,
    );
  }

  const source = readFileSync(options.file, 'utf8');
  const script = parse(source, options.file, {
    onWarning: (message, line, column) => printWarning(options.file, message, line, column),
  });
  const cast = compile(script);
  const content = outputFormat.render(cast);

  mkdirSync(options.outDir, { recursive: true });
  const outPath = join(options.outDir, `${outputBaseName(options.file)}.${outputFormat.extension}`);
  writeFileSync(outPath, content, 'utf8');
  return outPath;
}
