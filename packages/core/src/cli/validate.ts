// `castwright validate <file>...` — see docs/reference/cli.md. Checks every given
// file (not just the first failure) and reports each one, since that is what
// makes it useful as a pre-commit hook over many files at once. Glob patterns
// are not expanded here: the common invocation is either a pre-commit hook
// passing an explicit file list, or a shell that has already expanded
// `*.terminal.yaml` before this process ever sees argv — both already give
// this command a plain file list, so no glob dependency is pulled in for it.

import { readFileSync } from 'node:fs';
import { parse } from '../parser/parse.js';
import { isTapeFile, parseTape } from '../tape/parse.js';
import { CliUsageError } from './errors.js';
import { printWarning } from './util.js';

const USAGE = 'usage: castwright validate <file>...';

export function parseValidateArgs(args: string[]): string[] {
  const files = args.filter((a) => {
    if (a.startsWith('-')) throw new CliUsageError(`unknown option '${a}'\n${USAGE}`);
    return true;
  });
  if (files.length === 0) {
    throw new CliUsageError(`missing <file>...\n${USAGE}`);
  }
  return files;
}

/** @returns true if every file is valid (warnings do not count as failure). */
export function runValidate(files: string[]): boolean {
  let ok = true;
  for (const file of files) {
    try {
      const source = readFileSync(file, 'utf8');
      const onWarning = (message: string, line: number, column: number): void =>
        printWarning(file, message, line, column);
      // `exec` only shapes the steps; validating runs nothing either way.
      if (isTapeFile(file)) parseTape(source, file, { exec: true, onWarning });
      else parse(source, file, { onWarning });
    } catch (error) {
      ok = false;
      process.stderr.write(`${errorMessage(error)}\n`);
    }
  }
  return ok;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
