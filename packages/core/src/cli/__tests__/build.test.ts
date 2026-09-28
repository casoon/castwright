import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { finalFrameText } from '../../compiler/final-frame.js';
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

  it('accepts the SVG options with --format svg', () => {
    expect(
      parseBuildArgs(['d.terminal.yaml', '--format', 'svg', '--no-chrome', '--loop-delay', '500']),
    ).toEqual({
      file: 'd.terminal.yaml',
      outDir: 'dist',
      format: 'svg',
      noChrome: true,
      loopDelay: 500,
    });
  });

  it('rejects the SVG options with any other format', () => {
    expect(() => parseBuildArgs(['d.terminal.yaml', '--no-chrome'])).toThrow(
      /--no-chrome only applies to --format svg/,
    );
    expect(() =>
      parseBuildArgs(['d.terminal.yaml', '--format', 'gif', '--loop-delay', '1']),
    ).toThrow(/--loop-delay only applies/);
  });

  it('rejects a --loop-delay that is not whole milliseconds', () => {
    for (const bad of ['-1', '1.5', 'soon', '']) {
      expect(() =>
        parseBuildArgs(['d.terminal.yaml', '--format', 'svg', '--loop-delay', bad]),
      ).toThrow(/whole number of milliseconds/);
    }
    expect(() => parseBuildArgs(['d.terminal.yaml', '--format', 'svg', '--loop-delay'])).toThrow(
      /whole number/,
    );
  });

  it('accepts --allow-exec, and --record only together with it', () => {
    expect(parseBuildArgs(['d.terminal.yaml', '--allow-exec', '--record'])).toEqual({
      file: 'd.terminal.yaml',
      outDir: 'dist',
      format: 'cast',
      allowExec: true,
      record: true,
    });
    expect(() => parseBuildArgs(['d.terminal.yaml', '--record'])).toThrow(
      /--record runs the exec: steps, so it needs --allow-exec too/,
    );
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
    expect(readFileSync(outPath, 'utf8')).toContain('<circle');

    await runBuild({ file, outDir: dir, format: 'svg', noChrome: true });
    expect(readFileSync(outPath, 'utf8')).not.toContain('<circle');
  });

  it('builds a VHS tape', async () => {
    const file = join(dir, 'demo.tape');
    writeFileSync(file, 'Set Columns 40\nSet Rows 5\nType "hi"\n', 'utf8');

    const outPath = await runBuild({ file, outDir: dir, format: 'cast' });
    expect(outPath).toBe(join(dir, 'demo.cast'));
    expect(readFileSync(outPath, 'utf8')).toContain('"width":40');
  });

  it('records a tape into a new .terminal.yaml that replays the same screen', async () => {
    const ci = process.env['CI'];
    delete process.env['CI'];
    try {
      const file = join(dir, 'demo.tape');
      writeFileSync(
        file,
        [
          'Set Columns 50',
          'Set Rows 8',
          'Set Theme "Dracula"',
          'Hide',
          'Type "export NAME={tape}"',
          'Enter',
          'Show',
          'Type "echo hello $NAME" Enter',
          'Type "true" Enter',
          'Type "oops" Ctrl+C',
          'Sleep 500ms',
          '',
        ].join('\n'),
        'utf8',
      );
      const live = await runBuild({
        file,
        outDir: join(dir, 'live'),
        format: 'cast',
        allowExec: true,
      });
      const recordedPath = await runBuild({
        file,
        outDir: join(dir, 'recorded'),
        format: 'cast',
        allowExec: true,
        record: true,
      });

      const yamlFile = join(dir, 'demo.terminal.yaml');
      const yamlSource = readFileSync(yamlFile, 'utf8');
      expect(yamlSource).toContain('# Recorded from demo.tape');
      expect(yamlSource).toContain('theme: dracula');
      expect(yamlSource).not.toContain('exec:');
      expect(yamlSource).not.toContain('export');

      // The YAML now builds on its own, without running anything, to what the
      // recording build produced — and that shows what the live tape showed.
      const replay = await runBuild({
        file: yamlFile,
        outDir: join(dir, 'replay'),
        format: 'cast',
      });
      expect(readFileSync(replay, 'utf8')).toBe(readFileSync(recordedPath, 'utf8'));
      const screen = (path: string) => {
        const [header, ...events] = readFileSync(path, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        return finalFrameText({ header, events }, { includeScrollback: true });
      };
      const liveScreen = await screen(live);
      expect(liveScreen).toContain('> echo hello $NAME\nhello {tape}\n> true\n> oops^C\n>');
      expect(await screen(replay)).toBe(liveScreen);

      await expect(
        runBuild({ file, outDir: dir, format: 'cast', allowExec: true, record: true }),
      ).rejects.toThrow(/demo\.terminal\.yaml already exists/);
    } finally {
      if (ci === undefined) delete process.env['CI'];
      else process.env['CI'] = ci;
    }
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
