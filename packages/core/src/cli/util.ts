// Small helpers shared by the CLI subcommands.

import { basename, extname } from 'node:path';
import { CliUsageError } from './errors.js';

const FS_REASONS: Record<string, string> = {
  ENOENT: 'no such file or directory',
  EACCES: 'permission denied',
  EISDIR: 'is a directory',
  ENOTDIR: 'not a directory',
};

/**
 * A one-line CLI error for the file-system failures a user causes (missing,
 * unreadable or unwritable path). Anything else is returned as it came, so an
 * unexpected failure keeps its stack.
 */
export function fsUsageError(action: 'read' | 'write', file: string, error: unknown): Error {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const reason = code === undefined ? undefined : FS_REASONS[code];
  if (reason === undefined) return error as Error;
  return new CliUsageError(`castwright: cannot ${action} ${file}: ${reason}`);
}

/**
 * The output file's base name, with the `.terminal.yaml` (or, failing that,
 * whatever single extension) stripped — `demo.terminal.yaml` → `demo`.
 */
export function outputBaseName(file: string): string {
  const name = basename(file);
  if (name.endsWith('.terminal.yaml')) {
    return name.slice(0, -'.terminal.yaml'.length);
  }
  const ext = extname(name);
  return ext.length > 0 ? name.slice(0, -ext.length) : name;
}

export function printWarning(file: string, message: string, line: number, column: number): void {
  process.stderr.write(`${file}:${line}:${column}: warning: ${message}\n`);
}
