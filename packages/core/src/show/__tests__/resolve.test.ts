import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from '../../compiler/compile.js';
import { CastwrightParseError } from '../../parser/errors.js';
import { parse } from '../../parser/parse.js';
import type { Script, Styled } from '../../types.js';
import { resolveShowSteps } from '../resolve.js';

const yaml = (steps: string, theme = 'catppuccin-mocha') =>
  `version: 1\nterminal: { cols: 60, rows: 10, theme: ${theme} }\nsteps:\n${steps}`;

describe('parse — show:', () => {
  it('reads the path and its options', () => {
    const script = parse(
      yaml('  - show: src/a.ts\n    lang: typescript\n    lines: 2-4\n    theme: dracula\n'),
      'demo.terminal.yaml',
    );
    expect(script.steps[0]).toMatchObject({
      kind: 'show',
      file: 'src/a.ts',
      lang: 'typescript',
      lines: { from: 2, to: 4 },
      theme: 'dracula',
      source: { line: 4, column: 11, text: '  - show: src/a.ts' },
    });
  });

  it('accepts a single line number', () => {
    const script = parse(yaml('  - show: a.ts\n    lines: 7\n'), 'demo.terminal.yaml');
    expect(script.steps[0]).toMatchObject({ lines: { from: 7, to: 7 } });
  });

  it('rejects a backwards or malformed range, with a position', () => {
    expect(() => parse(yaml('  - show: a.ts\n    lines: 9-3\n'), 'x.terminal.yaml')).toThrow(
      /x\.terminal\.yaml:5:12: step 'lines' must be/,
    );
    expect(() => parse(yaml('  - show: a.ts\n    lines: abc\n'), 'x.terminal.yaml')).toThrow(
      CastwrightParseError,
    );
  });

  it('rejects unknown keys', () => {
    expect(() => parse(yaml('  - show: a.ts\n    colour: red\n'), 'x.terminal.yaml')).toThrow(
      /unknown key/,
    );
  });
});

describe('resolveShowSteps', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'castwright-show-'));
    file = join(dir, 'demo.terminal.yaml');
    writeFileSync(join(dir, 'a.ts'), 'const a = 1;\n// two\nconst b = 2;\n');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const resolve = (steps: string, theme?: string) =>
    resolveShowSteps(parse(yaml(steps, theme), file), file);

  const text = (script: Script) =>
    (script.steps[0] as { text: Styled }).text.map((span) => span.text).join('');

  it('turns the step into highlighted output and reports the file', async () => {
    const { script, files } = await resolve('  - show: a.ts\n    pause: 50\n');
    expect(script.steps[0]).toMatchObject({ kind: 'output', lineDelay: 0, pause: 50 });
    expect(text(script)).toBe('const a = 1;\n// two\nconst b = 2;\n');
    expect(files).toEqual([join(dir, 'a.ts')]);
    // Coloured with the Shiki theme matching the terminal theme (catppuccin's mauve keyword).
    const keyword = (script.steps[0] as { text: Styled }).text[0];
    expect(keyword).toMatchObject({
      text: 'const',
      fg: { kind: 'rgb', r: 0xcb, g: 0xa6, b: 0xf7 },
    });
  });

  it("carries the theme's font styles", async () => {
    const { script } = await resolve('  - show: a.ts\n');
    const comment = (script.steps[0] as { text: Styled }).text.find((s) => s.text === '// two');
    expect(comment?.italic).toBe(true);
  });

  it('shows only the requested lines', async () => {
    const { script } = await resolve('  - show: a.ts\n    lines: 2-3\n');
    expect(text(script)).toBe('// two\nconst b = 2;\n');
  });

  it('compiles deterministically', async () => {
    const build = async () => JSON.stringify(compile((await resolve('  - show: a.ts\n')).script));
    expect(await build()).toBe(await build());
  });

  it('leaves a script without show: alone', async () => {
    const script = parse(yaml('  - output: hi\n'), file);
    const resolved = await resolveShowSteps(script, file);
    expect(resolved.script).toBe(script);
    expect(resolved.files).toEqual([]);
  });

  it('points at the step when the file is missing', async () => {
    await expect(resolve('  - output: x\n  - show: nope.ts\n')).rejects.toThrow(
      /demo\.terminal\.yaml:5:11: step 'show': file not found: .*nope\.ts/,
    );
  });

  it('points at the step for a range past the end of the file', async () => {
    await expect(resolve('  - show: a.ts\n    lines: 2-9\n')).rejects.toThrow(
      /step 'lines' 2-9 is past the end of a\.ts \(3 lines\)/,
    );
  });

  it('points at the step for an unknown language', async () => {
    await expect(resolve('  - show: a.ts\n    lang: klingon\n')).rejects.toThrow(
      /demo\.terminal\.yaml:4:11: step 'show': .*klingon/,
    );
  });

  it('asks for lang when the file has no extension', async () => {
    writeFileSync(join(dir, 'Makefile'), 'all:\n');
    await expect(resolve('  - show: Makefile\n')).rejects.toThrow(/set 'lang'/);
  });
});

describe('compile — unresolved show:', () => {
  it('refuses rather than silently dropping the step', () => {
    const script = parse(yaml('  - show: a.ts\n'), 'demo.terminal.yaml');
    expect(() => compile(script)).toThrow(/resolveShowSteps/);
  });
});
