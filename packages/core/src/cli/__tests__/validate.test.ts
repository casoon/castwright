import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliUsageError } from '../errors.js';
import { parseValidateArgs, runValidate } from '../validate.js';

describe('parseValidateArgs', () => {
  it('accepts one or more file paths', () => {
    expect(parseValidateArgs(['a.terminal.yaml'])).toEqual(['a.terminal.yaml']);
    expect(parseValidateArgs(['a.terminal.yaml', 'b.terminal.yaml'])).toEqual([
      'a.terminal.yaml',
      'b.terminal.yaml',
    ]);
  });

  it('rejects zero files', () => {
    expect(() => parseValidateArgs([])).toThrow(CliUsageError);
  });

  it('rejects an option-looking argument', () => {
    expect(() => parseValidateArgs(['--bogus'])).toThrow(/unknown option/);
  });
});

// A named helper, rather than `ReturnType<typeof vi.spyOn<...>>`, so TS resolves
// the actual method-spy overload instead of ambiguously picking the getter one.
function spyOnStderrWrite() {
  return vi.spyOn(process.stderr, 'write');
}
type WriteSpy = ReturnType<typeof spyOnStderrWrite>;

describe('runValidate', () => {
  let dir: string;
  let stderr: string[];
  let stderrSpy: WriteSpy;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'castwright-validate-'));
    stderr = [];
    stderrSpy = spyOnStderrWrite().mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns true and prints nothing for a valid file', () => {
    const file = join(dir, 'good.terminal.yaml');
    writeFileSync(
      file,
      'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - wait: 1\n',
      'utf8',
    );

    const ok = runValidate([file]);

    expect(ok).toBe(true);
    expect(stderr).toEqual([]);
  });

  it('returns false and reports a positioned error for an invalid file, without stopping at the first failure', () => {
    const bad = join(dir, 'bad.terminal.yaml');
    const good = join(dir, 'good.terminal.yaml');
    writeFileSync(
      bad,
      'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - clear: false\n',
      'utf8',
    );
    writeFileSync(
      good,
      'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - wait: 1\n',
      'utf8',
    );

    const ok = runValidate([bad, good]);

    expect(ok).toBe(false);
    expect(stderr.join('')).toContain('bad.terminal.yaml');
    expect(stderr.join('')).toContain('must be `true`');
  });

  it('checks every file even after an earlier one fails', () => {
    const bad = join(dir, 'bad.terminal.yaml');
    const alsoBad = join(dir, 'also-bad.terminal.yaml');
    writeFileSync(
      bad,
      'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - clear: false\n',
      'utf8',
    );
    writeFileSync(alsoBad, 'version: 2\nterminal: { cols: 80, rows: 24 }\nsteps: []\n', 'utf8');

    const ok = runValidate([bad, alsoBad]);

    expect(ok).toBe(false);
    const joined = stderr.join('');
    expect(joined).toContain('bad.terminal.yaml');
    expect(joined).toContain('also-bad.terminal.yaml');
  });

  it('prints a warning but still returns true', () => {
    const file = join(dir, 'warn.terminal.yaml');
    writeFileSync(
      file,
      'version: 1\nterminal: { cols: 5, rows: 24 }\nsteps:\n  - output: "this is way too wide"\n',
      'utf8',
    );

    const ok = runValidate([file]);

    expect(ok).toBe(true);
    expect(stderr.join('')).toContain('warning');
  });
});
