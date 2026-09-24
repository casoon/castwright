import { describe, expect, it } from 'vitest';
import type { Script, Step, TerminalConfig } from '../../types.js';
import { compile } from '../compile.js';

const TERMINAL: TerminalConfig = {
  cols: 80,
  rows: 24,
  theme: 'default',
  prompt: [{ text: '$ ' }],
  cursor: { style: 'block', blink: true },
};

function script(steps: Step[], overrides: Partial<Script> = {}): Script {
  return {
    version: 1,
    terminal: TERMINAL,
    defaults: { speed: 45, pause: 300 },
    steps,
    ...overrides,
  };
}

describe('compile — header', () => {
  it('embeds size, resolved theme and omits title when absent', () => {
    const cast = compile(script([]));
    expect(cast.header.version).toBe(2);
    expect(cast.header.width).toBe(80);
    expect(cast.header.height).toBe(24);
    expect(cast.header.title).toBeUndefined();
    expect(cast.header.theme?.background).toBe('#000000'); // 'default' theme
    expect('timestamp' in cast.header).toBe(false);
  });

  it('includes title when the script has one', () => {
    const cast = compile(script([], { terminal: { ...TERMINAL, title: 'Demo' } }));
    expect(cast.header.title).toBe('Demo');
  });

  it('embeds the named theme, not the default, when terminal.theme differs', () => {
    const cast = compile(script([], { terminal: { ...TERMINAL, theme: 'dracula' } }));
    expect(cast.header.theme?.background).toBe('#282a36');
  });
});

describe('compile — wait', () => {
  it('advances time and emits no bytes', () => {
    const cast = compile(
      script([
        { kind: 'wait', ms: 500 },
        { kind: 'key', key: 'enter', pause: 0 },
      ]),
    );
    expect(cast.events).toEqual([[0.5, 'o', '\r\n']]);
  });

  it("does not add the step's own pause (wait has no pause field)", () => {
    // Two waits back to back must sum exactly, with nothing extra added.
    const cast = compile(
      script([
        { kind: 'wait', ms: 100 },
        { kind: 'wait', ms: 200 },
        { kind: 'key', key: 'enter', pause: 0 },
      ]),
    );
    expect(cast.events).toEqual([[0.3, 'o', '\r\n']]);
  });
});

describe('compile — key', () => {
  it('emits the key bytes instantly, then applies the trailing pause', () => {
    const cast = compile(
      script([
        { kind: 'key', key: 'tab', pause: 250 },
        { kind: 'key', key: 'enter', pause: 0 },
      ]),
    );
    expect(cast.events).toEqual([
      [0, 'o', '\t'],
      [0.25, 'o', '\r\n'],
    ]);
  });
});

describe('compile — type', () => {
  it('emits one event per grapheme, speed ms apart, with a trailing pause after the last one', () => {
    const cast = compile(
      script([
        { kind: 'type', text: [{ text: 'ab' }], speed: 100, jitter: 0, prompt: false, pause: 50 },
        { kind: 'key', key: 'enter', pause: 0 },
      ]),
    );
    expect(cast.events).toEqual([
      [0, 'o', 'a'],
      [0.1, 'o', 'b'],
      [0.25, 'o', '\r\n'], // 0.1 + 0.1 (speed) + 0.05 (pause) = 0.25
    ]);
  });

  it('emits the current prompt instantly before typing, when prompt: true', () => {
    const cast = compile(
      script([
        { kind: 'type', text: [{ text: 'x' }], speed: 10, jitter: 0, prompt: true, pause: 0 },
      ]),
    );
    expect(cast.events).toEqual([
      [0, 'o', '$ '], // the prompt, instant
      [0, 'o', 'x'], // typed text starts at the same instant
    ]);
  });

  it('uses the prompt last set by a `prompt` step, not the terminal default', () => {
    const cast = compile(
      script([
        { kind: 'prompt', prompt: [{ text: '> ' }], pause: 0 },
        { kind: 'type', text: [{ text: 'x' }], speed: 10, jitter: 0, prompt: true, pause: 0 },
      ]),
    );
    expect(cast.events).toEqual([
      [0, 'o', '> '],
      [0, 'o', 'x'],
    ]);
  });

  it("wraps a styled span's first and last grapheme with SGR, not every character", () => {
    const cast = compile(
      script([
        {
          kind: 'type',
          text: [{ text: 'abc', fg: { kind: 'ansi', index: 2 } }],
          speed: 10,
          jitter: 0,
          prompt: false,
          pause: 0,
        },
      ]),
    );
    expect(cast.events).toEqual([
      [0, 'o', '\x1b[32ma'],
      [0.01, 'o', 'b'],
      [0.02, 'o', 'c\x1b[0m'],
    ]);
  });

  it('segments by grapheme cluster, not UTF-16 code unit', () => {
    const cast = compile(
      script([
        { kind: 'type', text: [{ text: 'a👍' }], speed: 10, jitter: 0, prompt: false, pause: 0 },
      ]),
    );
    expect(cast.events).toEqual([
      [0, 'o', 'a'],
      [0.01, 'o', '👍'],
    ]);
  });

  it('speed: 0 types every grapheme at the same instant', () => {
    const cast = compile(
      script([
        { kind: 'type', text: [{ text: 'abc' }], speed: 0, jitter: 0, prompt: false, pause: 0 },
      ]),
    );
    expect(cast.events).toEqual([
      [0, 'o', 'a'],
      [0, 'o', 'b'],
      [0, 'o', 'c'],
    ]);
  });

  it('normalises an embedded newline in typed text to CRLF', () => {
    const cast = compile(
      script([
        { kind: 'type', text: [{ text: 'a\nb' }], speed: 10, jitter: 0, prompt: false, pause: 0 },
      ]),
    );
    // '\n' is one grapheme cluster on its own
    expect(cast.events).toEqual([
      [0, 'o', 'a'],
      [0.01, 'o', '\r\n'],
      [0.02, 'o', 'b'],
    ]);
  });

  it('jitter is deterministic for a given seed', () => {
    const steps: Step[] = [
      { kind: 'type', text: [{ text: 'abcdef' }], speed: 50, jitter: 0.5, prompt: false, pause: 0 },
    ];
    const a = compile(script(steps, { seed: 7 }));
    const b = compile(script(steps, { seed: 7 }));
    expect(a.events).toEqual(b.events);
    // and it must actually vary the delay, or the test above would be vacuous
    const delays = a.events.slice(1).map((e, i) => (e[0] as number) - (a.events[i]?.[0] as number));
    expect(new Set(delays).size).toBeGreaterThan(1);
  });

  it('a different seed produces a different jitter sequence', () => {
    const steps: Step[] = [
      { kind: 'type', text: [{ text: 'abcdef' }], speed: 50, jitter: 0.9, prompt: false, pause: 0 },
    ];
    const a = compile(script(steps, { seed: 1 }));
    const b = compile(script(steps, { seed: 2 }));
    expect(a.events).not.toEqual(b.events);
  });
});

describe('compile — output', () => {
  it('lineDelay: 0 emits the whole block as one event with CRLF newlines', () => {
    const cast = compile(
      script([{ kind: 'output', text: [{ text: 'a\nb' }], lineDelay: 0, pause: 0 }]),
    );
    expect(cast.events).toEqual([[0, 'o', 'a\r\nb']]);
  });

  it('lineDelay: n emits one event per line, n ms apart, each ending in CRLF', () => {
    const cast = compile(
      script([
        { kind: 'output', text: [{ text: 'a\nb\nc' }], lineDelay: 100, pause: 0 },
        { kind: 'key', key: 'enter', pause: 0 },
      ]),
    );
    expect(cast.events).toEqual([
      [0, 'o', 'a\r\n'],
      [0.1, 'o', 'b\r\n'],
      [0.2, 'o', 'c\r\n'],
      [0.3, 'o', '\r\n'],
    ]);
  });

  it('applies styling per line when splitting', () => {
    const cast = compile(
      script([
        {
          kind: 'output',
          text: [{ text: 'a\nb', fg: { kind: 'ansi', index: 2 } }],
          lineDelay: 10,
          pause: 0,
        },
      ]),
    );
    expect(cast.events).toEqual([
      [0, 'o', '\x1b[32ma\x1b[0m\r\n'],
      [0.01, 'o', '\x1b[32mb\x1b[0m\r\n'],
    ]);
  });
});

describe('compile — clear', () => {
  it('emits ESC[2J ESC[H instantly', () => {
    const cast = compile(script([{ kind: 'clear', pause: 0 }]));
    expect(cast.events).toEqual([[0, 'o', '\x1b[2J\x1b[H']]);
  });
});

describe('compile — marker', () => {
  it('emits an "m" event with the label, instantly', () => {
    const cast = compile(
      script([
        { kind: 'marker', label: 'setup-done', pause: 100 },
        { kind: 'key', key: 'enter', pause: 0 },
      ]),
    );
    expect(cast.events).toEqual([
      [0, 'm', 'setup-done'],
      [0.1, 'o', '\r\n'],
    ]);
  });
});

describe('compile — prompt step', () => {
  it('emits no bytes by itself, only a trailing pause', () => {
    const cast = compile(
      script([
        { kind: 'prompt', prompt: [{ text: '> ' }], pause: 100 },
        { kind: 'key', key: 'enter', pause: 0 },
      ]),
    );
    expect(cast.events).toEqual([[0.1, 'o', '\r\n']]);
  });
});

describe("compile — run lowering (via the parser's two-step output)", () => {
  it('a run-shaped [type(prompt:true, pause:0), key:enter(pause)] pair emits prompt, text, then CRLF, and only the trailing pause delays what comes after', () => {
    const cast = compile(
      script([
        { kind: 'type', text: [{ text: 'ls' }], speed: 100, jitter: 0, prompt: true, pause: 0 },
        { kind: 'key', key: 'enter', pause: 300 },
        { kind: 'key', key: 'tab', pause: 0 },
      ]),
    );
    expect(cast.events).toEqual([
      [0, 'o', '$ '],
      [0, 'o', 'l'],
      [0.1, 'o', 's'],
      [0.2, 'o', '\r\n'], // enter fires instantly at t=0.2 (after typing 'l','s' @ 100ms each)
      [0.5, 'o', '\t'], // 0.2 + 0.3 (enter's pause) = 0.5 — only visible via the next step
    ]);
  });
});
