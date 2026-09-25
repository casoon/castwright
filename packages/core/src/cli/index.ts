#!/usr/bin/env node
// castwright CLI — see docs/reference/cli.md.

import { ExternalToolError } from '../exporters/raster.js';
import { CastwrightParseError } from '../parser/errors.js';
import { parseBuildArgs, runBuild } from './build.js';
import { parseDevArgs } from './dev-args.js';
import { CliUsageError } from './errors.js';
import { parseValidateArgs, runValidate } from './validate.js';

const USAGE = `castwright — declarative terminal demos for the web

Usage:
  castwright build <file> [-o <dir>] [--format cast|svg|gif|mp4] [--no-chrome] [--loop-delay <ms>] [--allow-exec [--record]]
  castwright validate <file>...
  castwright dev <file> [--port <n>] [--allow-exec]

  castwright --help
`;

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
        const files = parseValidateArgs(rest);
        const ok = runValidate(files);
        process.exitCode = ok ? 0 : 1;
        return;
      }
      case 'dev': {
        const options = parseDevArgs(rest);
        // Imported lazily: `dev` pulls in Vite, and `build`/`validate` must
        // keep working in a project that never installed it.
        void import('./dev.js')
          .then(({ runDev }) => runDev(options))
          .catch((error: unknown) => {
            if (error instanceof CliUsageError) fail(error.message);
            throw error;
          });
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
