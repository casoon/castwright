import { describe, expect, it } from 'vitest';
import { parse } from '../../parser/parse.js';
import { compile } from '../compile.js';
import { finalFrameText } from '../final-frame.js';

function castFrom(yaml: string) {
  return compile(parse(yaml, 'test.terminal.yaml'));
}

describe('finalFrameText', () => {
  it('returns the terminal contents as plain text, without SGR codes', async () => {
    const cast = castFrom(`
version: 1
terminal: { cols: 40, rows: 6 }
steps:
  - output: "{green}✓{/} done\\nsecond line\\n"
`);
    expect(await finalFrameText(cast)).toBe('✓ done\nsecond line');
  });

  it('reflects cursor movement and overwriting, not just concatenated output', async () => {
    // \r returns to column 0, so "world" overwrites "hello"
    const cast = castFrom(`
version: 1
terminal: { cols: 40, rows: 6 }
steps:
  - output:
      raw: "hello\\rworld\\r\\n"
`);
    expect(await finalFrameText(cast)).toBe('world');
  });

  it('honours a clear-screen step', async () => {
    const cast = castFrom(`
version: 1
terminal: { cols: 40, rows: 6 }
steps:
  - output: "gone\\n"
  - clear: true
  - output: "kept\\n"
`);
    expect(await finalFrameText(cast)).toBe('kept');
  });

  it('includes a typed command and its prompt', async () => {
    const cast = castFrom(`
version: 1
terminal: { cols: 40, rows: 6 }
steps:
  - run: ls -la
  - output: "total 0\\n"
`);
    expect(await finalFrameText(cast)).toBe('$ ls -la\ntotal 0');
  });

  it('trims trailing blank lines by default and keeps them on request', async () => {
    const cast = castFrom(`
version: 1
terminal: { cols: 40, rows: 6 }
steps:
  - output: "x\\n"
`);
    expect(await finalFrameText(cast)).toBe('x');
    const kept = await finalFrameText(cast, { keepTrailingBlankLines: true });
    expect(kept.split('\n')).toHaveLength(6); // rows
  });

  it('returns the visible screen, not everything that scrolled past it', async () => {
    // Eight lines into a three-row terminal. The visible rows are 7, 8 and the
    // blank one the cursor sits on; everything before that has scrolled off.
    const cast = castFrom(`
version: 1
terminal: { cols: 40, rows: 3 }
steps:
  - output: "1\\n2\\n3\\n4\\n5\\n6\\n7\\n8\\n"
`);
    expect(await finalFrameText(cast)).toBe('7\n8');
    expect(await finalFrameText(cast, { includeScrollback: true })).toBe('1\n2\n3\n4\n5\n6\n7\n8');
  });

  it('applies asciicast resize events and ignores input events', async () => {
    // Not something castwright compiles — this is a cast recorded elsewhere.
    const cast = {
      header: { version: 2 as const, width: 40, height: 2 },
      events: [
        [0, 'o', 'a\r\nb\r\nc\r\n'],
        [0.5, 'i', 'typed by a human, never printed'],
        [1, 'r', '40x4'],
        [1.5, 'o', 'd\r\n'],
      ] as import('../../types.js').CastEvent[],
    };
    // Four visible rows at the end instead of two, one of them blank below the
    // cursor — so three lines of history survive where one did before.
    const text = await finalFrameText(cast);
    expect(text.split('\n')).toEqual(['b', 'c', 'd']);
    // The keystrokes were never printed by the terminal, so they are not screen
    // contents and must not reach the accessibility fallback.
    expect(text).not.toContain('typed by a human');
  });

  it('returns an empty string for a cast with no output', async () => {
    const cast = castFrom(`
version: 1
terminal: { cols: 40, rows: 6 }
steps:
  - wait: 100
`);
    expect(await finalFrameText(cast)).toBe('');
  });
});
