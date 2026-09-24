import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseBuildArgs, runBuild } from '../build.js';
import { CliUsageError } from '../errors.js';

describe('parseBuildArgs', () => {
  it('accepts a bare file with defaults', () => {
    expect(parseBuildArgs(['demo.terminal.yaml'])).toEqual({
      file: 'demo.terminal.yaml',
      outDir: 'dist',
      format: 'cast',
    });
  });

  it('accepts -o and --format overrides, in either order', () => {
    expect(parseBuildArgs(['demo.terminal.yaml', '-o', 'build', '--format', 'cast'])).toEqual({
      file: 'demo.terminal.yaml',
      outDir: 'build',
      format: 'cast',
    });
    expect(parseBuildArgs(['--format', 'cast', 'demo.terminal.yaml'])).toEqual({
      file: 'demo.terminal.yaml',
      outDir: 'dist',
      format: 'cast',
    });
  });

  it('rejects a missing file', () => {
    expect(() => parseBuildArgs([])).toThrow(CliUsageError);
  });

  it('rejects an unknown option', () => {
    expect(() => parseBuildArgs(['demo.terminal.yaml', '--bogus'])).toThrow(/unknown option/);
  });

  it('rejects -o with no value', () => {
    expect(() => parseBuildArgs(['demo.terminal.yaml', '-o'])).toThrow(/requires a value/);
  });

  it('rejects a second positional argument', () => {
    expect(() => parseBuildArgs(['a.terminal.yaml', 'b.terminal.yaml'])).toThrow(/extra argument/);
  });
});

describe('runBuild', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'castwright-build-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('compiles a script to dist/<name>.cast', async () => {
    const file = join(dir, 'demo.terminal.yaml');
    writeFileSync(
      file,
      'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - output: "hi"\n',
      'utf8',
    );

    const outPath = await runBuild({ file, outDir: join(dir, 'dist'), format: 'cast' });

    expect(outPath).toBe(join(dir, 'dist', 'demo.cast'));
    expect(existsSync(outPath)).toBe(true);
    const content = readFileSync(outPath, 'utf8');
    expect(content).toContain('"version":2');
    expect(content).toContain('"hi"');
  });

  it('creates the output directory if it does not exist', async () => {
    const file = join(dir, 'demo.terminal.yaml');
    writeFileSync(file, 'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps: []\n', 'utf8');

    const outPath = await runBuild({ file, outDir: join(dir, 'nested', 'dist'), format: 'cast' });
    expect(existsSync(outPath)).toBe(true);
  });

  it('rejects an unknown --format', async () => {
    const file = join(dir, 'demo.terminal.yaml');
    writeFileSync(file, 'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps: []\n', 'utf8');

    await expect(runBuild({ file, outDir: dir, format: 'png' })).rejects.toThrow(CliUsageError);
    await expect(runBuild({ file, outDir: dir, format: 'png' })).rejects.toThrow(
      /unknown --format/,
    );
  });

  it('writes an svg', async () => {
    const file = join(dir, 'demo.terminal.yaml');
    writeFileSync(
      file,
      'version: 1\nterminal: { cols: 40, rows: 5 }\nsteps:\n  - output: "hi"\n',
      'utf8',
    );

    const outPath = await runBuild({ file, outDir: dir, format: 'svg' });
    expect(outPath).toBe(join(dir, 'demo.svg'));
    expect(readFileSync(outPath, 'utf8')).toMatch(/^<svg /);
  });

  it('propagates a positioned parse error for an invalid script', async () => {
    const file = join(dir, 'bad.terminal.yaml');
    writeFileSync(
      file,
      'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - bogus: 1\n',
      'utf8',
    );

    await expect(runBuild({ file, outDir: dir, format: 'cast' })).rejects.toThrow(/no primary key/);
  });
});
