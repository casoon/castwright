import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Runs the built CLI (the launcher), as a user would.
const bin = fileURLToPath(new URL('../../../bin/castwright.mjs', import.meta.url));
const built = existsSync(fileURLToPath(new URL('../../../dist/cli/index.js', import.meta.url)));
const run = (...args: string[]) =>
  spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });

describe.skipIf(!built)('castwright CLI (built)', () => {
  it('prints the package version for --version', () => {
    const { version } = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8'),
    ) as { version: string };
    const result = run('--version');
    expect(result.stdout).toBe(`${version}\n`);
    expect(result.status).toBe(0);
  });

  it('prints per-command usage for <command> --help', () => {
    const result = run('build', '--help');
    expect(result.stdout).toMatch(/^usage: castwright build /);
    expect(result.status).toBe(0);
  });

  it('prints a clean error, not a stack, for a missing input file', () => {
    const result = run('build', 'nope.terminal.yaml');
    expect(result.stderr).toBe(
      'castwright: cannot read nope.terminal.yaml: no such file or directory\n',
    );
    expect(result.status).toBe(1);
  });
});
