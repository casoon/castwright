// What the parser must never do, whatever it is handed: crash with something
// other than a CastwrightParseError, hang, or return a Script that is not a
// Script. Users paste YAML from anywhere, and a stack trace from deep inside
// the parser is a bug report about castwright rather than about their file.

import { describe, expect, it } from 'vitest';
import { CastwrightParseError } from '../errors.js';
import { parse } from '../parse.js';

const FILE = 'demo.terminal.yaml';

/**
 * Parses and asserts the only two allowed outcomes. Returns the script when
 * there is one, so a caller can make a stronger claim about a specific input.
 */
function parseOrParseError(source: string) {
  try {
    return parse(source, FILE);
  } catch (error) {
    // The message matters as much as the type: it is what the user reads, and
    // an internal error leaking through would still be a string.
    expect(error, `threw a non-parse error for:\n${source}`).toBeInstanceOf(CastwrightParseError);
    expect((error as Error).message).toContain(FILE);
    return undefined;
  }
}

const VALID = `version: 1
terminal:
  title: demo
  cols: 40
  rows: 8
  theme: dracula
  prompt: "{green}${'$'}{/} "
  cursor: { style: bar, blink: false }
defaults:
  speed: 20
  pause: 100
seed: 7
steps:
  - run: echo hi
  - output: "{bold}hi{/}\\n"
    delay: 10
  - key: enter
  - wait: 50
  - clear: true
  - prompt: "> "
  - marker: done
`;

describe('parse — malformed input', () => {
  it.each([
    ['empty', ''],
    ['only whitespace', '   \n\n  \n'],
    ['only a comment', '# nothing here\n'],
    ['an explicit null document', '---\nnull\n'],
    ['a scalar document', 'just a string\n'],
    ['a list document', '- a\n- b\n'],
    ['two documents', 'version: 1\n---\nversion: 1\n'],
    ['unclosed quote', 'version: 1\nterminal: { cols: "80 }\n'],
    ['unclosed flow mapping', 'version: 1\nterminal: { cols: 80\n'],
    ['a tab used for indentation', 'version: 1\nterminal:\n\tcols: 80\n'],
    ['a NUL byte', 'version: 1\nterminal: { cols: 80 }\nsteps:\n  - run: "a\u0000b"\n'],
    ['a lone surrogate', 'version: 1\nterminal: { cols: 80 }\nsteps:\n  - run: "a\ud800b"\n'],
    ['a numeric mapping key', 'version: 1\n1: 2\n'],
    ['a sequence as a mapping key', '? [a, b]\n: c\n'],
    ['a duplicate top-level key', 'version: 1\nversion: 2\nsteps: []\n'],
    ['steps as a mapping', 'version: 1\nterminal: { cols: 80 }\nsteps: { run: hi }\n'],
    ['a step that is a bare string', 'version: 1\nterminal: { cols: 80 }\nsteps:\n  - hello\n'],
    ['a step that is null', 'version: 1\nterminal: { cols: 80 }\nsteps:\n  - \n'],
    ['an unresolvable alias', 'version: 1\nterminal: *missing\n'],
    ['a merge key', 'version: 1\nterminal:\n  <<: { cols: 80 }\n  rows: 24\nsteps: []\n'],
    ['a binary tag', 'version: 1\nterminal: !!binary "aGk="\n'],
    ['a timestamp where a number goes', 'version: 1\nterminal: { cols: 2001-12-14 }\n'],
    ['a sexagesimal-looking value', 'version: 1\nterminal: { cols: 1:30 }\n'],
    ['an octal-looking value', 'version: 1\nterminal: { cols: 0o120, rows: 24 }\nsteps: []\n'],
    ['a BOM', '﻿version: 1\nterminal: { cols: 80, rows: 24 }\nsteps: []\n'],
  ])('survives %s', (_name, source) => {
    parseOrParseError(source);
  });

  it('accepts CRLF line endings, which is what a Windows editor writes', () => {
    const script = parse(VALID.replace(/\n/g, '\r\n'), FILE);
    expect(script.steps.length).toBeGreaterThan(0);
  });
});

describe('parse — resource exhaustion', () => {
  it('refuses an alias bomb instead of expanding it', () => {
    // "Billion laughs": each level references the one below it ten times, so a
    // naive expansion is 10^n nodes. What is asserted is termination — either
    // the YAML library's alias cap rejects it or the document is small enough to
    // expand, but the parser must not sit there building a million nodes.
    let source = 'version: 1\na: &a ["x","x","x","x","x","x","x","x","x","x"]\n';
    for (const [index, name] of ['b', 'c', 'd', 'e', 'f'].entries()) {
      const previous = index === 0 ? 'a' : ['b', 'c', 'd', 'e', 'f'][index - 1];
      source += `${name}: &${name} [${`*${previous},`.repeat(10).slice(0, -1)}]\n`;
    }
    const start = Date.now();
    parseOrParseError(source);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('handles a very deeply nested document', () => {
    const depth = 2000;
    const source = `version: 1\nterminal: ${'['.repeat(depth)}${']'.repeat(depth)}\n`;
    parseOrParseError(source);
  });

  it('handles a very long single line', () => {
    const source = `version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n  - output: "${'x'.repeat(200_000)}"\n`;
    const script = parse(source, FILE, { onWarning: () => {} });
    expect(script.steps).toHaveLength(1);
  });

  it('handles a document with many steps', () => {
    const steps = Array.from({ length: 5000 }, (_, i) => `  - wait: ${i % 100}`).join('\n');
    const script = parse(`version: 1\nterminal: { cols: 80, rows: 24 }\nsteps:\n${steps}\n`, FILE);
    expect(script.steps).toHaveLength(5000);
  });
});

describe('parse — fuzzing a valid document', () => {
  // Deterministic so a failure is reproducible from the seed in the message.
  // mulberry32, the same generator the compiler uses for jitter.
  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const INTERESTING = [
    '\t',
    '\u0000',
    '"',
    "'",
    ':',
    '-',
    '{',
    '}',
    '[',
    ']',
    '*',
    '&',
    '\\',
    '\n',
    '﻿',
    '  ',
  ];

  function mutate(source: string, random: () => number): string {
    const at = Math.floor(random() * source.length);
    switch (Math.floor(random() * 5)) {
      case 0: // delete a character
        return source.slice(0, at) + source.slice(at + 1);
      case 1: // insert something awkward
        return (
          source.slice(0, at) +
          INTERESTING[Math.floor(random() * INTERESTING.length)] +
          source.slice(at)
        );
      case 2: // truncate
        return source.slice(0, at);
      case 3: // duplicate a line
        return (
          source.slice(0, at) + source.slice(at, source.indexOf('\n', at) + 1) + source.slice(at)
        );
      default: // swap two adjacent characters
        return (
          source.slice(0, at) +
          source.slice(at + 1, at + 2) +
          source.charAt(at) +
          source.slice(at + 2)
        );
    }
  }

  it('never throws anything but a CastwrightParseError, over 2000 mutations', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const random = rng(seed);
      let source = VALID;
      // Between one and four mutations, so both near-valid and badly mangled
      // inputs are covered.
      for (let n = 0; n <= Math.floor(random() * 4); n++) source = mutate(source, random);

      const where = `seed ${seed}, source:\n${JSON.stringify(source)}`;
      let script: ReturnType<typeof parse>;
      try {
        script = parse(source, FILE, { onWarning: () => {} });
      } catch (error) {
        // Asserted outside the invariant block on purpose: an invariant failure
        // must not be caught here and reported as the wrong problem.
        expect(error, `${where}\nthrew a non-parse error`).toBeInstanceOf(CastwrightParseError);
        continue;
      }

      // When it does parse, the result must still satisfy the invariants the
      // compiler relies on — a half-validated Script is worse than an error.
      expect(script.version, where).toBe(1);
      expect(Number.isInteger(script.terminal.cols), `${where}\ncols`).toBe(true);
      expect(script.terminal.cols, `${where}\ncols`).toBeGreaterThan(0);
      expect(Number.isInteger(script.terminal.rows), `${where}\nrows`).toBe(true);
      expect(script.terminal.rows, `${where}\nrows`).toBeGreaterThan(0);
      expect(script.defaults.speed, `${where}\nspeed`).toBeGreaterThanOrEqual(0);
      expect(script.defaults.pause, `${where}\npause`).toBeGreaterThanOrEqual(0);
      for (const step of script.steps) {
        if (step.kind === 'wait') expect(step.ms, `${where}\nwait`).toBeGreaterThanOrEqual(0);
        else expect(step.pause, `${where}\npause`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
