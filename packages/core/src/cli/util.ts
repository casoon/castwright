// Small helpers shared by the CLI subcommands.

import { basename, extname } from 'node:path';

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
