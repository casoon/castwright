// Argument parsing for `castwright dev`, split from dev.ts so the CLI can
// validate the command line without importing Vite.

import { CliUsageError } from './errors.js';

export interface DevArgs {
  file: string;
  port: number;
}

const USAGE = 'usage: castwright dev <file> [--port <n>]';
const DEFAULT_PORT = 4321;

export function parseDevArgs(args: string[]): DevArgs {
  let file: string | undefined;
  let port = DEFAULT_PORT;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      const value = args[++i];
      if (value === undefined) throw new CliUsageError(`${arg} requires a value\n${USAGE}`);
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
        throw new CliUsageError(`${arg} must be a port number, got '${value}'\n${USAGE}`);
      }
      port = parsed;
    } else if (arg?.startsWith('-')) {
      throw new CliUsageError(`unknown option '${arg}'\n${USAGE}`);
    } else if (file === undefined) {
      file = arg;
    } else {
      throw new CliUsageError(`unexpected extra argument '${arg}'\n${USAGE}`);
    }
  }

  if (file === undefined) throw new CliUsageError(`missing <file>\n${USAGE}`);
  return { file, port };
}
