// Argument parsing for `castwright dev`, split from dev.ts so the CLI can
// validate the command line without importing Vite.

import { CliUsageError } from './errors.js';

export interface DevArgs {
  file: string;
  port: number;
  /** Let `exec:` steps run their commands — on every save. */
  allowExec?: boolean;
  /** Let `show:` read files outside the working directory. */
  allowShowOutsideRoot?: boolean;
}

export const USAGE =
  'usage: castwright dev <file> [--port <n>] [--allow-exec] [--allow-show-outside-root]';
const DEFAULT_PORT = 4321;

export function parseDevArgs(args: string[]): DevArgs {
  let file: string | undefined;
  let port = DEFAULT_PORT;
  let allowExec = false;
  let allowShowOutsideRoot = false;

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
    } else if (arg === '--allow-exec') {
      allowExec = true;
    } else if (arg === '--allow-show-outside-root') {
      allowShowOutsideRoot = true;
    } else if (arg?.startsWith('-')) {
      throw new CliUsageError(`unknown option '${arg}'\n${USAGE}`);
    } else if (file === undefined) {
      file = arg;
    } else {
      throw new CliUsageError(`unexpected extra argument '${arg}'\n${USAGE}`);
    }
  }

  if (file === undefined) throw new CliUsageError(`missing <file>\n${USAGE}`);
  return {
    file,
    port,
    ...(allowExec ? { allowExec } : {}),
    ...(allowShowOutsideRoot ? { allowShowOutsideRoot } : {}),
  };
}
