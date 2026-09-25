import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compile } from '../../compiler/compile.js';
import { finalFrameText } from '../../compiler/final-frame.js';
import { CastwrightParseError } from '../../parser/errors.js';
import { parse } from '../../parser/parse.js';
import type { Step } from '../../types.js';
import { recordIntoSource } from '../record.js';
import { resolveExecSteps } from '../resolve.js';

const yaml = (steps: string) => `version: 1\nterminal: { cols: 60, rows: 10 }\nsteps:\n${steps}`;

describe('parse — exec:', () => {
  it('reads the command literally and its options', () => {
    const script = parse(
      yaml(
        "  - exec: awk '{print $1}' f\n    cwd: sub\n    env: { A: '1', B: 2 }\n    timeout: 500\n    idle: 300\n    prompt: false\n",
      ),
      'demo.terminal.yaml',
    );
    expect(script.steps[0]).toMatchObject({
      kind: 'exec',
      command: "awk '{print $1}' f",
      cwd: 'sub',
      env: { A: '1', B: '2' },
      timeout: 500,
      idle: 300,
      prompt: false,
      source: { line: 4, column: 11 },
    });
  });

  it('defaults to a 60 s timeout and writes the prompt', () => {
    const script = parse(yaml('  - exec: ls\n'), 'demo.terminal.yaml');
    expect(script.steps[0]).toMatchObject({ timeout: 60_000, prompt: true });
  });

  it('rejects unknown keys, an empty command and a zero timeout', () => {
    expect(() => parse(yaml('  - exec: ls\n    shell: zsh\n'), 'x.yaml')).toThrow(/unknown key/);
    expect(() => parse(yaml("  - exec: ' '\n"), 'x.yaml')).toThrow(/needs a command/);
    expect(() => parse(yaml('  - exec: ls\n    timeout: 0\n'), 'x.yaml')).toThrow(/at least 1/);
  });

  it('is refused by compile() until resolved', () => {
    const script = parse(yaml('  - exec: ls\n'), 'x.yaml');
    expect(() => compile(script)).toThrow(/resolveExecSteps/);
  });
});

describe('resolveExecSteps', () => {
  let dir: string;
  let file: string;
  // The build warns when exec: runs in CI; these tests assert exact warnings,
  // so they must not depend on where they run.
  const ci = process.env['CI'];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'castwright-exec-'));
    file = join(dir, 'demo.terminal.yaml');
    delete process.env['CI'];
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (ci === undefined) delete process.env['CI'];
    else process.env['CI'] = ci;
  });

  const resolve = (steps: string, warnings: string[] = []) =>
    resolveExecSteps(parse(yaml(steps), file), file, {
      allowExec: true,
      onWarning: (message) => warnings.push(message),
    });

  const outputOf = (steps: Step[]) =>
    steps
      .filter((step) => step.kind === 'output')
      .map((step) => (step.kind === 'output' ? step.text.map((span) => span.text).join('') : ''))
      .join('');

  it('refuses to run anything without allowExec, pointing at the step', async () => {
    const script = parse(yaml('  - output: x\n  - exec: echo hi\n'), file);
    await expect(resolveExecSteps(script, file)).rejects.toThrow(
      /demo\.terminal\.yaml:5:11: step 'exec' runs a real command — allow it with --allow-exec/,
    );
  });

  it('types the command, then records its output', async () => {
    const { script, recordings } = await resolve('  - exec: echo hello\n');
    expect(script.steps[0]).toMatchObject({
      kind: 'type',
      text: [{ text: 'echo hello' }],
      prompt: true,
    });
    expect(script.steps[1]).toMatchObject({ kind: 'key', key: 'enter' });
    expect(outputOf(script.steps)).toBe('hello\r\n');
    expect(recordings).toHaveLength(1);
    expect(recordings[0]?.exitCode).toBe(0);
  });

  it('runs in cwd, relative to the script, with env', async () => {
    mkdirSync(join(dir, 'work'));
    writeFileSync(join(dir, 'work', 'note.txt'), 'from a file\n');
    const { script } = await resolve(
      '  - exec: \'cat note.txt; echo "$GREETING"\'\n    cwd: work\n    env: { GREETING: hi }\n',
    );
    expect(outputOf(script.steps)).toBe('from a file\r\nhi\r\n');
  });

  it('keeps the real gaps between output, capped by idle', async () => {
    const { script } = await resolve(
      "  - exec: 'echo a; sleep 0.4; echo b'\n    idle: 100\n    pause: 0\n",
    );
    const waits = script.steps.filter((step) => step.kind === 'wait');
    expect(waits.length).toBeGreaterThan(0);
    for (const wait of waits) if (wait.kind === 'wait') expect(wait.ms).toBeLessThanOrEqual(100);
  });

  it('warns on a non-zero exit and records the output anyway', async () => {
    const warnings: string[] = [];
    const { script } = await resolve("  - exec: 'echo oops; exit 3'\n", warnings);
    expect(outputOf(script.steps)).toBe('oops\r\n');
    expect(warnings).toEqual([expect.stringMatching(/exited with code 3/)]);
  });

  it('warns about output that looks like a secret', async () => {
    const warnings: string[] = [];
    await resolve(`  - exec: echo ghp_${'a'.repeat(36)}\n`, warnings);
    expect(warnings).toEqual([expect.stringMatching(/GitHub token/)]);
  });

  it('warns when it runs in CI', async () => {
    process.env['CI'] = 'true';
    const warnings: string[] = [];
    await resolve('  - exec: echo hi\n', warnings);
    expect(warnings).toEqual([expect.stringMatching(/running 'exec' steps in CI/)]);
  });

  it('kills a command that runs past its timeout, pointing at the step', async () => {
    await expect(resolve('  - exec: sleep 5\n    timeout: 200\n')).rejects.toThrow(
      /demo\.terminal\.yaml:4:11: step 'exec' did not finish within 200 ms/,
    );
  });

  it('reports a cwd that does not exist', async () => {
    await expect(resolve('  - exec: ls\n    cwd: nope\n')).rejects.toThrow(CastwrightParseError);
  });

  it('leaves a script without exec: alone', async () => {
    const script = parse(yaml('  - output: hi\n'), file);
    const resolved = await resolveExecSteps(script, file);
    expect(resolved.script).toBe(script);
  });
});

describe('recordIntoSource', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'castwright-record-'));
    file = join(dir, 'demo.terminal.yaml');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('turns a real run into a simulated demo that shows the same screen', async () => {
    // Deliberately awkward: braces in the command (markup in run:), and output
    // with colour, a literal backslash and a carriage-return redraw.
    const source = yaml(
      [
        '  # checks the thing',
        '  - exec: "printf \'{x}\\\\033[32mok\\\\033[0m C:\\\\\\\\new\\\\n\'"',
        '  - exec: "printf \'progress 10%%\\\\rprogress 100%%\\\\nline two\\\\n\'"',
        '    pause: 300',
        '',
      ].join('\n'),
    );
    const executed = await resolveExecSteps(parse(source, file), file, { allowExec: true });
    const recorded = recordIntoSource(source, executed.recordings);

    expect(recorded).toContain('# checks the thing');
    expect(recorded).not.toContain('exec:');
    const replay = parse(recorded, file);
    expect(replay.steps.some((step) => step.kind === 'exec')).toBe(false);

    const screen = async (steps: typeof replay) =>
      finalFrameText(compile(steps), { includeScrollback: true });
    const live = await screen(executed.script);
    expect(live).toContain('{x}ok C:\\new');
    expect(live).toContain('progress 100%');
    expect(await screen(replay)).toBe(live);
  });

  it('replays the recorded demo byte for byte on every build', async () => {
    const source = yaml("  - exec: 'echo one; echo two'\n");
    const executed = await resolveExecSteps(parse(source, file), file, { allowExec: true });
    const recorded = recordIntoSource(source, executed.recordings);
    const build = () => JSON.stringify(compile(parse(recorded, file)));
    expect(build()).toBe(build());
  });
});
