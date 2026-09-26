import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from '../../compiler/compile.js';
import { finalFrameText } from '../../compiler/final-frame.js';
import { resolveExecSteps } from '../../exec/resolve.js';
import { CastwrightParseError } from '../../parser/errors.js';
import type { Step } from '../../types.js';
import { parseTape } from '../parse.js';

const collect = () => {
  const warnings: string[] = [];
  return { warnings, onWarning: (message: string) => warnings.push(message) };
};

const kinds = (steps: Step[]) => steps.map((step) => step.kind);

describe('parseTape — settings', () => {
  it("gives a tape that sets nothing VHS's terminal", () => {
    const script = parseTape('Type "hi"\n', 'demo.tape');
    expect(script.terminal).toMatchObject({ cols: 81, rows: 18, theme: 'default' });
    expect(script.defaults).toEqual({ speed: 50, pause: 0 });
  });

  it('maps size, typing speed, theme and cursor blink', () => {
    const script = parseTape(
      [
        'Set Width 1400',
        'Set Height 800',
        'Set FontSize 20',
        'Set Padding 20',
        'Set TypingSpeed 75ms',
        'Set Theme "Catppuccin Mocha"',
        'Set CursorBlink false',
        'Set WindowBar Colorful',
        '',
      ].join('\n'),
      'demo.tape',
    );
    expect(script.terminal).toMatchObject({
      cols: 113,
      rows: 31,
      theme: 'catppuccin-mocha',
      cursor: { blink: false },
    });
    expect(script.defaults.speed).toBe(75);
  });

  it('falls back to the default theme, with a warning, for one it does not have', () => {
    const { warnings, onWarning } = collect();
    const script = parseTape('Set Theme "Whimsy"\n', 'demo.tape', { onWarning });
    expect(script.terminal.theme).toBe('default');
    expect(warnings).toEqual([expect.stringMatching(/theme 'Whimsy' is not one castwright has/)]);
  });

  it('rejects an unknown setting and a bad value, pointing at them', () => {
    expect(() => parseTape('Set Colour red\n', 'demo.tape')).toThrow(
      /demo\.tape:1:5: unknown setting 'Colour'/,
    );
    expect(() => parseTape('Set Width wide\n', 'demo.tape')).toThrow(/positive number/);
  });
});

describe('parseTape — commands', () => {
  it('types, presses keys, sleeps and ends at a prompt', () => {
    const script = parseTape(
      'Type@20ms "ls"\nSleep 500ms\nBackspace 2\nCtrl+C\nSleep 1\n',
      'demo.tape',
    );
    expect(script.steps).toEqual([
      { kind: 'type', text: [{ text: 'ls' }], speed: 20, jitter: 0, prompt: true, pause: 0 },
      { kind: 'wait', ms: 500 },
      { kind: 'key', key: 'backspace', pause: 0 },
      { kind: 'wait', ms: 50 },
      { kind: 'key', key: 'backspace', pause: 0 },
      { kind: 'output', text: [{ text: '^C' }], lineDelay: 0, pause: 0 },
      { kind: 'key', key: 'enter', pause: 0 },
      { kind: 'wait', ms: 1000 },
      { kind: 'type', text: [], speed: 0, jitter: 0, prompt: true, pause: 0 },
    ]);
  });

  it('without exec, types the command and says its output is missing, once', () => {
    const { warnings, onWarning } = collect();
    const script = parseTape('Type "ls"\nEnter\nType "pwd"\nEnter\n', 'demo.tape', { onWarning });
    expect(kinds(script.steps)).toEqual(['type', 'key', 'type', 'key', 'type']);
    expect(script.steps.at(-1)).toMatchObject({ kind: 'type', text: [], prompt: true });
    expect(warnings).toEqual([expect.stringMatching(/pass --allow-exec/)]);
  });

  it('with exec, turns a typed line into one exec step', () => {
    const script = parseTape(
      'Env GREETING "hi"\nType@30ms "echo "\nType "$GREETING"\nSleep 200ms\nEnter\n',
      'demo.tape',
      { exec: true },
    );
    expect(script.steps[0]).toMatchObject({
      kind: 'exec',
      command: 'echo $GREETING',
      speed: 30,
      prompt: true,
      env: { GREETING: 'hi' },
      source: { line: 2, column: 1 },
    });
    expect(kinds(script.steps)).toEqual(['exec', 'type']);
  });

  it('with exec, keeps a line edited with arrow keys as typing, and says so', () => {
    const { warnings, onWarning } = collect();
    const script = parseTape('Type "lss"\nLeft\nEnter\n', 'demo.tape', { exec: true, onWarning });
    expect(kinds(script.steps)).toEqual(['type', 'key', 'key', 'type']);
    expect(warnings).toEqual([expect.stringMatching(/typed but not run/)]);
  });

  it('with exec, runs hidden commands as setup for the visible ones', () => {
    const script = parseTape(
      'Hide\nType "cd /tmp"\nEnter\nType "clear"\nEnter\nShow\nType "pwd"\nEnter\n',
      'demo.tape',
      { exec: true },
    );
    expect(script.steps[0]).toMatchObject({
      kind: 'exec',
      command: 'pwd',
      setup: 'cd /tmp\nclear',
    });
    expect(kinds(script.steps)).toEqual(['exec', 'type']);
  });

  it('drops a line cancelled with Ctrl+C, as the shell does', () => {
    const script = parseTape(
      'Hide\nType "secret" Ctrl+C\nShow\nType "ls" Enter\nType "rm -rf x" Ctrl+C\n',
      'demo.tape',
      { exec: true },
    );
    expect(kinds(script.steps)).toEqual(['exec', 'type', 'output', 'key', 'type']);
    expect(script.steps[0]).toMatchObject({ command: 'ls' });
    expect(script.steps[0]).not.toHaveProperty('setup');
  });

  it('warns about Output and Screenshot, ignores Wait and Require', () => {
    const { warnings, onWarning } = collect();
    parseTape(
      'Output demo.gif\nRequire git\nWait+Screen /\\$/\nScreenshot a.png\nType "x"\n',
      'demo.tape',
      { onWarning },
    );
    expect(warnings).toEqual([
      expect.stringMatching(/'Output' is ignored — castwright picks the format with --format/),
      expect.stringMatching(/'Screenshot' is ignored/),
    ]);
  });

  it('rejects Source and unknown commands, pointing at them', () => {
    expect(() => parseTape('Source other.tape\n', 'demo.tape')).toThrow(CastwrightParseError);
    expect(() => parseTape('Type "a"\n  Jump 3\n', 'demo.tape')).toThrow(
      /demo\.tape:2:3: unknown tape command 'Jump'/,
    );
    expect(() => parseTape('Type "open\n', 'demo.tape')).toThrow(/unterminated string/);
    expect(() => parseTape('Sleep soon\n', 'demo.tape')).toThrow(/needs a duration/);
  });
});

describe('parseTape — end to end', () => {
  let dir: string;
  const ci = process.env['CI'];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'castwright-tape-'));
    delete process.env['CI'];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (ci === undefined) delete process.env['CI'];
    else process.env['CI'] = ci;
  });

  it('runs a tape and shows what the commands printed', async () => {
    const file = join(dir, 'demo.tape');
    writeFileSync(join(dir, 'note.txt'), 'from a file\n');
    const source = [
      'Output demo.gif',
      'Set TypingSpeed 1ms',
      'Hide',
      'Type "export NAME=tape"',
      'Enter',
      'Show',
      'Type "cat note.txt"',
      'Enter',
      'Type "echo hello $NAME"',
      'Enter',
      '',
    ].join('\n');
    const script = parseTape(source, file, { exec: true });
    const { script: resolved } = await resolveExecSteps(script, file, { allowExec: true });
    const screen = await finalFrameText(compile(resolved));
    expect(screen).toContain('> cat note.txt\nfrom a file\n> echo hello $NAME\nhello tape\n>');
    expect(screen).not.toContain('export');
  });
});
