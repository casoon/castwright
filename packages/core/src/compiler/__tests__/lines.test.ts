import { describe, expect, it } from 'vitest';
import { splitStyledLines } from '../lines.js';

describe('splitStyledLines', () => {
  it('returns one line for text with no newline', () => {
    expect(splitStyledLines([{ text: 'hello' }])).toEqual([[{ text: 'hello' }]]);
  });

  it('splits on newlines across a single span', () => {
    expect(splitStyledLines([{ text: 'a\nb\nc' }])).toEqual([
      [{ text: 'a' }],
      [{ text: 'b' }],
      [{ text: 'c' }],
    ]);
  });

  it('drops a wholly-empty trailing line', () => {
    expect(splitStyledLines([{ text: 'a\n' }])).toEqual([[{ text: 'a' }]]);
  });

  it('keeps a genuine interior blank line', () => {
    expect(splitStyledLines([{ text: 'a\n\nb' }])).toEqual([[{ text: 'a' }], [], [{ text: 'b' }]]);
  });

  it('preserves style per fragment when a newline splits a styled span', () => {
    const styled = [{ text: 'x\ny', fg: { kind: 'ansi' as const, index: 2 } }];
    expect(splitStyledLines(styled)).toEqual([
      [{ text: 'x', fg: { kind: 'ansi', index: 2 } }],
      [{ text: 'y', fg: { kind: 'ansi', index: 2 } }],
    ]);
  });

  it('joins multiple spans on the same line', () => {
    const styled = [{ text: 'a' }, { text: 'b', bold: true }];
    expect(splitStyledLines(styled)).toEqual([[{ text: 'a' }, { text: 'b', bold: true }]]);
  });

  it('returns an empty array for empty input', () => {
    expect(splitStyledLines([])).toEqual([]);
  });
});
