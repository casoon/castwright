// `castwright validate <file>...` — see docs/reference/cli.md. Checks every given
// file (not just the first failure) and reports each one, since that is what
// makes it useful as a pre-commit hook over many files at once. Glob patterns
// are not expanded here: the common invocation is either a pre-commit hook
// passing an explicit file list, or a shell that has already expanded
// `*.terminal.yaml` before this process ever sees argv — both already give
// this command a plain file list, so no glob dependency is pulled in for it.

import { readFileSync } from 'node:fs';
import { parse } from '../parser/parse.js';
import { validateShowSteps } from '../show/resolve.js';
import { isTapeFile, parseTape } from '../tape/parse.js';
import { CliUsageError } from './errors.js';
import { fsUsageError, printWarning } from './util.js';

export const USAGE = 'usage: castwright validate <file>... [--allow-show-outside-root]';

export interface ValidateArgs {
  files: string[];
  /** Let `show:` read files outside the working directory. */
  allowShowOutsideRoot: boolean;
}

export function parseValidateArgs(args: string[]): ValidateArgs {
  let allowShowOutsideRoot = false;
  const files = args.filter((a) => {
    if (a === '--allow-show-outside-root') {
      allowShowOutsideRoot = true;
      return false;
    }
    if (a.startsWith('-')) throw new CliUsageError(`unknown option '${a}'\n${USAGE}`);
    return true;
  });
  if (files.length === 0) {
    throw new CliUsageError(`missing <file>...\n${USAGE}`);
  }
  return { files, allowShowOutsideRoot };
}

/** @returns true if every file is valid (warnings do not count as failure). */
export async function runValidate(
  files: string[],
  options: { allowShowOutsideRoot?: boolean } = {},
): Promise<boolean> {
  let ok = true;
  for (const file of files) {
    try {
      const source = readInput(file);
      const onWarning = (message: string, line: number, column: number): void =>
        printWarning(file, message, line, column);
      // `exec` only shapes the steps; validating runs nothing either way.
      const script = isTapeFile(file)
        ? parseTape(source, file, { exec: true, onWarning })
        : parse(source, file, { onWarning });
      // `show:` files are resolved too (path, range, language), just not highlighted.
      await validateShowSteps(script, file, {
        ...(options.allowShowOutsideRoot ? { allowOutsideRoot: true } : {}),
        onWarning,
      });
    } catch (error) {
      ok = false;
      process.stderr.write(`${errorMessage(error)}\n`);
    }
  }
  return ok;
}

function readInput(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    throw fsUsageError('read', file, error);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
