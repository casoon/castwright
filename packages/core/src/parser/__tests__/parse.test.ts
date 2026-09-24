import { describe, expect, it } from 'vitest';
import { CastwrightParseError } from '../errors.js';
import { parse } from '../parse.js';

const FILE = 'demo.terminal.yaml';

describe('parse — happy paths', () => {
  it('parses the full worked example from docs/reference/dsl.md', () => {
    const source = `
version: 1

terminal:
  title: Casoon CLI
  cols: 90
  rows: 24
  theme: catppuccin-mocha
  prompt: "$ "
  cursor: block

defaults:
  speed: 45
  pause: 300

steps:
  - run: npx casoon create my-app
  - output: |
      {green}✓{/} Creating project
      {green}✓{/} Installing dependencies
      {green}✓{/} Project ready
    delay: 250
  - wait: 800
  - run: cd my-app && npm run dev
  - output: "{dim}ready in 412ms{/}\\n\\n  {cyan}➜{/}  Local:  http://localhost:4321/\\n"
  - wait: 2000
`;
    const script = parse(source, FILE);

    expect(script.version).toBe(1);
    expect(script.terminal).toEqual({
      title: 'Casoon CLI',
      cols: 90,
      rows: 24,
      theme: 'catppuccin-mocha',
      prompt: [{ text: '$ ' }],
      cursor: { style: 'block', blink: true },
    });
    expect(script.defaults).toEqual({ speed: 45, pause: 300 });

    // run -> [type(prompt:true), key:enter], twice, plus output/wait/output/wait
    expect(script.steps.map((s) => s.kind)).toEqual([
      'type',
      'key',
      'output',
      'wait',
      'type',
      'key',
      'output',
      'wait',
    ]);

    const firstType = script.steps[0];
    if (firstType?.kind !== 'type') throw new Error('expected type step');
    expect(firstType.prompt).toBe(true);
    expect(firstType.text).toEqual([{ text: 'npx casoon create my-app' }]);
    expect(firstType.pause).toBe(0);

    const firstEnter = script.steps[1];
    if (firstEnter?.kind !== 'key') throw new Error('expected key step');
    expect(firstEnter.key).toBe('enter');
    expect(firstEnter.pause).toBe(300); // defaults.pause

    const output = script.steps[2];
    if (output?.kind !== 'output') throw new Error('expected output step');
    expect(output.lineDelay).toBe(250);
    expect(output.text[0]).toEqual({ text: '✓', fg: { kind: 'ansi', index: 2 } });

    const wait = script.steps[3];
    if (wait?.kind !== 'wait') throw new Error('expected wait step');
    expect(wait.ms).toBe(800);
  });

  it('applies baked-in defaults when terminal/defaults are minimal', () => {
    const source = `
version: 1
terminal:
  cols: 80
  rows: 24
steps:
  - wait: 100
`;
    const script = parse(source, FILE);
    expect(script.terminal.theme).toBe('default');
    expect(script.terminal.prompt).toEqual([{ text: '$ ' }]);
    expect(script.terminal.cursor).toEqual({ style: 'block', blink: true });
    expect(script.defaults).toEqual({ speed: 45, pause: 300 });
    expect(script.terminal.title).toBeUndefined();
  });

  it('parses a mapping-form cursor with a blink override', () => {
    const source = `
version: 1
terminal:
  cols: 80
  rows: 24
  cursor:
    style: bar
    blink: false
steps:
  - wait: 1
`;
    const script = parse(source, FILE);
    expect(script.terminal.cursor).toEqual({ style: 'bar', blink: false });
  });

  it('parses type/key/output/wait/clear/marker steps', () => {
    const source = `
version: 1
terminal: { cols: 80, rows: 24 }
steps:
  - type: npm inst
  - key: tab
  - wait: 200
  - key: enter
  - clear: true
  - marker: setup-done
`;
    const script = parse(source, FILE);
    expect(script.steps.map((s) => s.kind)).toEqual([
      'type',
      'key',
      'wait',
      'key',
      'clear',
      'marker',
    ]);
    const marker = script.steps[5];
    if (marker?.kind !== 'marker') throw new Error('expected marker step');
    expect(marker.label).toBe('setup-done');
  });

  it('parses output.raw and unescapes it', () => {
    const source = `
version: 1
terminal: { cols: 80, rows: 24 }
steps:
  - output:
      raw: "\\e[32m\\u2713\\e[0m Installed\\r\\n"
`;
    const script = parse(source, FILE);
    const step = script.steps[0];
    if (step?.kind !== 'output') throw new Error('expected output step');
    expect(step.text).toEqual([{ text: '\x1b[32m✓\x1b[0m Installed\r\n' }]);
  });

  it('treats a standalone `prompt:` step as changing the prompt', () => {
    const source = `
version: 1
terminal: { cols: 80, rows: 24 }
steps:
  - prompt: "{green}➜{/} "
`;
    const script = parse(source, FILE);
    const step = script.steps[0];
    if (step?.kind !== 'prompt') throw new Error('expected prompt step');
    expect(step.prompt).toEqual([{ text: '➜', fg: { kind: 'ansi', index: 2 } }, { text: ' ' }]);
  });

  it('treats `prompt:` alongside `run:`/`type:` as the suppress-prompt modifier', () => {
    const source = `
version: 1
terminal: { cols: 80, rows: 24 }
steps:
  - type: "secret input"
    prompt: false
`;
    const script = parse(source, FILE);
    const step = script.steps[0];
    if (step?.kind !== 'type') throw new Error('expected type step');
    expect(step.prompt).toBe(false);
  });

  it('accepts jitter when a top-level seed is present', () => {
    const source = `
version: 1
seed: 42
terminal: { cols: 80, rows: 24 }
steps:
  - type: "x"
    jitter: 0.3
`;
    const script = parse(source, FILE);
    expect(script.seed).toBe(42);
    const step = script.steps[0];
    if (step?.kind !== 'type') throw new Error('expected type step');
    expect(step.jitter).toBe(0.3);
  });

  it('calls onWarning for an output line wider than cols, without throwing', () => {
    const source = `
version: 1
terminal: { cols: 10, rows: 24 }
steps:
  - output: "this line is definitely wider than ten columns"
`;
    const warnings: Array<{ message: string; line: number; column: number }> = [];
    const script = parse(source, FILE, {
      onWarning: (message, line, column) => warnings.push({ message, line, column }),
    });
    expect(script.steps).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toMatch(/wider than terminal.cols/);
  });
});

describe('parse — validation errors', () => {
  function expectError(source: string, match: RegExp) {
    expect(() => parse(source, FILE)).toThrow(CastwrightParseError);
    try {
      parse(source, FILE);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(match);
    }
  }

  it('rejects a document that is not a mapping', () => {
    expectError('- just\n- a\n- list\n', /must be a mapping/);
  });

  it('rejects an unknown top-level key', () => {
    expectError(
      `
version: 1
terminal: { cols: 80, rows: 24 }
steps: []
bogus: true
`,
      /unknown key 'bogus'/,
    );
  });

  it('rejects a missing version', () => {
    expectError(
      `
terminal: { cols: 80, rows: 24 }
steps: []
`,
      /missing required top-level key 'version'/,
    );
  });

  it('rejects an unsupported version', () => {
    expectError(
      `
version: 2
terminal: { cols: 80, rows: 24 }
steps: []
`,
      /unsupported 'version'/,
    );
  });

  it('rejects a missing terminal block', () => {
    expectError(
      `
version: 1
steps: []
`,
      /missing required top-level key 'terminal'/,
    );
  });

  it('rejects a missing steps list', () => {
    expectError(
      `
version: 1
terminal: { cols: 80, rows: 24 }
`,
      /missing required top-level key 'steps'/,
    );
  });

  it('rejects an unknown key inside terminal', () => {
    expectError(
      `
version: 1
terminal: { cols: 80, rows: 24, bogus: 1 }
steps: []
`,
      /unknown key 'bogus' in terminal/,
    );
  });

  it('rejects a step with two primary keys', () => {
    expectError(
      `
version: 1
terminal: { cols: 80, rows: 24 }
steps:
  - run: echo hi
    output: "not allowed together"
`,
      /more than one primary key/,
    );
  });

  it('rejects a step with no primary key', () => {
    expectError(
      `
version: 1
terminal: { cols: 80, rows: 24 }
steps:
  - speed: 10
`,
      /no primary key/,
    );
  });

  it('rejects an unknown modifier key on a step', () => {
    expectError(
      `
version: 1
terminal: { cols: 80, rows: 24 }
steps:
  - wait: 100
    bogus: true
`,
      /unknown key 'bogus'/,
    );
  });

  it('rejects an unknown key name', () => {
    expectError(
      `
version: 1
terminal: { cols: 80, rows: 24 }
steps:
  - key: pageup
`,
      /unknown key name 'pageup'/,
    );
  });

  it('rejects `clear: false`', () => {
    expectError(
      `
version: 1
terminal: { cols: 80, rows: 24 }
steps:
  - clear: false
`,
      /must be `true`/,
    );
  });

  it('rejects jitter > 0 without a top-level seed', () => {
    expectError(
      `
version: 1
terminal: { cols: 80, rows: 24 }
steps:
  - type: "x"
    jitter: 0.5
`,
      /requires a top-level 'seed'/,
    );
  });

  it('rejects jitter outside 0..1', () => {
    expectError(
      `
version: 1
seed: 1
terminal: { cols: 80, rows: 24 }
steps:
  - type: "x"
    jitter: 1.5
`,
      /must be at most 1/,
    );
  });

  it('rejects an output mapping with an unknown key', () => {
    expectError(
      `
version: 1
terminal: { cols: 80, rows: 24 }
steps:
  - output: { bogus: 1 }
`,
      /unknown key 'bogus' in output/,
    );
  });

  it('rejects an output mapping with no raw key', () => {
    expectError(
      `
version: 1
terminal: { cols: 80, rows: 24 }
steps:
  - output: {}
`,
      /must have a 'raw' key/,
    );
  });

  it('rejects invalid markup inside output and reports a position', () => {
    const source = `version: 1
terminal: { cols: 80, rows: 24 }
steps:
  - output: "{nope}x{/}"
`;
    try {
      parse(source, FILE);
      expect.unreachable();
    } catch (e) {
      const err = e as CastwrightParseError;
      expect(err.message).toContain("unknown markup tag '{nope}'");
      expect(err.position.line).toBe(4);
    }
  });

  it('reports file, line, column and the source line in the formatted message', () => {
    const source = `version: 1
terminal: { cols: 80, rows: 24 }
steps:
  - clear: false
`;
    try {
      parse(source, FILE);
      expect.unreachable();
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain(`${FILE}:4:`);
      expect(msg).toContain('clear: false');
      expect(msg).toContain('^');
    }
  });
});

// Every numeric key in the DSL. `typeof x === 'number'` used to be the whole
// check, which let `cols: 0.5` reach xterm and `pause: -700` compile to a cast
// whose timestamps run backwards — neither is a shape any consumer expects.
describe('parse — numeric bounds', () => {
  function expectError(source: string, match: RegExp) {
    expect(() => parse(source, FILE)).toThrow(CastwrightParseError);
    try {
      parse(source, FILE);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).toMatch(match);
    }
  }

  function withTerminal(body: string): string {
    return `version: 1\nterminal: { cols: 80, rows: 24 }\n${body}`;
  }

  it.each([
    ['cols: 0.5', /terminal.cols must be a whole number/],
    ['cols: 0', /terminal.cols must be at least 1/],
    ['cols: -10', /terminal.cols must be at least 1/],
    ['cols: 100000', /terminal.cols must be at most/],
    ['rows: -2', /terminal.rows must be at least 1/],
    ['rows: 3.5', /terminal.rows must be a whole number/],
  ])('rejects terminal geometry `%s`', (entry, match) => {
    expectError(`version: 1\nterminal: { ${entry} }\nsteps: []\n`, match);
  });

  it.each([
    ['defaults:\n  speed: -1\nsteps: []\n', /defaults.speed must be at least 0/],
    ['defaults:\n  pause: -700\nsteps: []\n', /defaults.pause must be at least 0/],
    ['steps:\n  - type: "x"\n    speed: -5\n', /step 'speed' must be at least 0/],
    ['steps:\n  - type: "x"\n    pause: -5\n', /step 'pause' must be at least 0/],
    ['steps:\n  - wait: -1\n', /step 'wait' must be at least 0/],
    ['steps:\n  - output: "x"\n    delay: -3\n', /step 'delay' must be at least 0/],
  ])('rejects a negative duration in `%s`', (body, match) => {
    expectError(withTerminal(body), match);
  });

  it('rejects a duration beyond an hour, which is a typo not an intent', () => {
    expectError(withTerminal('steps:\n  - wait: 99999999\n'), /step 'wait' must be at most/);
  });

  it.each([
    ['seed: 1.5', /seed must be a whole number/],
    ['seed: -1', /seed must be at least 0/],
    ['seed: 99999999999', /seed must be at most/],
  ])('rejects `%s`, which mulberry32 would silently coerce', (entry, match) => {
    expectError(`version: 1\n${entry}\nterminal: { cols: 80, rows: 24 }\nsteps: []\n`, match);
  });

  it('rejects .inf and .nan, which YAML parses as numbers', () => {
    expectError(withTerminal('steps:\n  - wait: .inf\n'), /must be a finite number/);
    expectError(withTerminal('steps:\n  - wait: .nan\n'), /must be a number/);
  });

  it('still accepts the legitimate values at the edges', () => {
    const script = parse(
      withTerminal('defaults:\n  pause: 0\nsteps:\n  - wait: 0\n  - type: "x"\n    jitter: 0\n'),
      FILE,
    );
    expect(script.defaults.pause).toBe(0);
  });
});
