import { describe, expect, it } from 'vitest';
import { CastwrightParseError } from '../errors.js';
import { parse } from '../parse.js';

const FILE = 'demo.terminal.yaml';

function fail(source: string): CastwrightParseError {
  try {
    parse(source, FILE);
  } catch (err) {
    if (err instanceof CastwrightParseError) return err;
    throw err;
  }
  throw new Error('expected a parse error');
}

function warnings(source: string): string[] {
  const out: string[] = [];
  parse(source, FILE, { onWarning: (m) => out.push(m) });
  return out;
}

function outputText(source: string): string {
  const step = parse(source, FILE).steps[0];
  if (step?.kind !== 'output') throw new Error('expected output step');
  return step.text.map((s) => s.text).join('');
}

describe('#40 raw escapes are not decoded twice', () => {
  it('keeps backslashes of a double-quoted raw scalar', () => {
    expect(
      outputText(
        'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - output: { raw: "C:\\\\Users\\\\me\\n" }\n',
      ),
    ).toBe('C:\\Users\\me\n');
  });

  it('does not turn a double-quoted literal backslash-e into ESC', () => {
    expect(
      outputText(
        'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - output: { raw: "\\\\e" }\n',
      ),
    ).toBe('\\e');
  });

  it('still decodes escapes in single-quoted raw scalars', () => {
    expect(
      outputText(
        "version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - output: { raw: '\\e[1mx\\n' }\n",
      ),
    ).toBe('\x1b[1mx\n');
  });
});

describe('#41 error positions inside quoted and block scalars', () => {
  it('points into the second line of a block scalar', () => {
    const err = fail(
      'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - output: |\n      ok\n      {nope}x\n',
    );
    expect(err.position).toEqual({ line: 6, column: 7 });
  });

  it('accounts for escape lengths in double-quoted scalars', () => {
    const err = fail(
      'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - output: "a\\tb{nope}"\n',
    );
    expect(err.position).toEqual({ line: 4, column: 18 });
  });

  it('points at the bad escape inside a raw block scalar', () => {
    const err = fail(
      'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - output:\n      raw: |\n        ok\n        a\\qb\n',
    );
    expect(err.position).toEqual({ line: 7, column: 10 });
  });
});

describe("#42 'pause' on a wait step", () => {
  it('is rejected with a positioned error', () => {
    const err = fail(
      'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - wait: 500\n    pause: 4000\n',
    );
    expect(err.message).toContain("'pause'");
    expect(err.position).toEqual({ line: 5, column: 5 });
  });
});

describe('#46 line-width warning measures terminal columns', () => {
  const head = 'version: 1\nterminal: { cols: 12, rows: 24 }\nsteps:\n';

  it('ignores ANSI escape sequences', () => {
    expect(warnings(`${head}  - output: { raw: "\\e[1;31mhello\\e[0m" }\n`)).toEqual([]);
  });

  it('counts wide CJK characters as two columns', () => {
    expect(warnings(`${head}  - output: "日本語日本語日本語日"\n`)).toHaveLength(1);
  });

  it('counts emoji as two columns', () => {
    expect(warnings(`${head}  - output: "🚀🚀🚀🚀🚀🚀🚀"\n`)).toHaveLength(1);
  });
});

describe("#60 hint for '{' in 'unknown markup tag'", () => {
  it('suggests the {{ escape for non-style tags', () => {
    const err = fail(
      "version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - run: awk '{print $1}'\n",
    );
    expect(err.message).toContain("'{{'");
  });

  it('does not suggest it for a misspelled style', () => {
    const err = fail(
      'version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - output: "{bold}x{/}{bg-nope}"\n',
    );
    expect(err.message).toContain('unknown markup tag');
    expect(err.message).not.toContain("'{{'");
  });
});
