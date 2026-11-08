#!/usr/bin/env node
// castwright CLI — see docs/reference/cli.md.

import { readFileSync } from 'node:fs';
import { ExternalToolError } from '../exporters/raster.js';
import { CastwrightParseError } from '../parser/errors.js';
import { USAGE as BUILD_USAGE, parseBuildArgs, runBuild } from './build.js';
import { USAGE as DEV_USAGE, parseDevArgs } from './dev-args.js';
import { CliUsageError } from './errors.js';
import { parseValidateArgs, runValidate, USAGE as VALIDATE_USAGE } from './validate.js';

const USAGE = `castwright — declarative terminal demos for the web

Usage:
  castwright build <file> [-o <dir>] [--format cast|svg|gif|mp4] [--no-chrome] [--loop-delay <ms>] [--start final|beginning] [--allow-exec [--record]]
  castwright validate <file>...
  castwright dev <file> [--port <n>] [--allow-exec]

  castwright <command> --help
  castwright --version
  castwright --help
`;

const COMMAND_USAGE: Record<string, string> = {
  build: BUILD_USAGE,
  validate: VALIDATE_USAGE,
  dev: DEV_USAGE,
};

function version(): string {
  // dist/cli/index.js and src/cli/index.ts both sit two levels below package.json.
  const manifest = new URL('../../package.json', import.meta.url);
  return (JSON.parse(readFileSync(manifest, 'utf8')) as { version: string }).version;
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function main(argv: string[]): void {
  const [command, ...rest] = argv;

  if (command === undefined) fail(USAGE.trimEnd());
  if (command === '--help' || command === '-h') {
    process.stdout.write(USAGE);
    return;
  }

  if (command === '--version' || command === '-v' || command === '-V') {
    process.stdout.write(`${version()}\n`);
    return;
  }
  const commandUsage = COMMAND_USAGE[command];
  if (commandUsage !== undefined && rest.some((arg) => arg === '--help' || arg === '-h')) {
    process.stdout.write(`${commandUsage}\n`);
    return;
  }

  try {
    switch (command) {
      case 'build': {
        const options = parseBuildArgs(rest);
        void runBuild(options)
          .then((outPath) => process.stdout.write(`${outPath}\n`))
          .catch(handleError);
        return;
      }
      case 'validate': {
        const { files, allowShowOutsideRoot } = parseValidateArgs(rest);
        void runValidate(files, { allowShowOutsideRoot }).then((ok) => {
          process.exitCode = ok ? 0 : 1;
        });
        return;
      }
      case 'dev': {
        const options = parseDevArgs(rest);
        // Imported lazily: `dev` pulls in Vite, and `build`/`validate` must
        // keep working in a project that never installed it.
        void import('./dev.js').then(({ runDev }) => runDev(options)).catch(handleError);
        return;
      }
      default:
        fail(`unknown command '${command}'\n\n${USAGE}`);
    }
  } catch (error) {
    handleError(error);
  }
}

function handleError(error: unknown): never {
  if (
    error instanceof CliUsageError ||
    error instanceof CastwrightParseError ||
    error instanceof ExternalToolError
  ) {
    fail(error.message);
  }
  throw error; // an unexpected/internal error — let it surface with a stack trace
}

main(process.argv.slice(2));
