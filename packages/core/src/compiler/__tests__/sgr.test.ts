import { describe, expect, it } from 'vitest';
import { renderStyled, spanToSgr } from '../sgr.js';

describe('spanToSgr', () => {
  it('returns empty prefix/suffix for an unstyled span', () => {
    expect(spanToSgr({ text: 'x' })).toEqual({ prefix: '', suffix: '' });
  });

  it('renders a base ANSI foreground colour', () => {
    expect(spanToSgr({ text: 'x', fg: { kind: 'ansi', index: 2 } })).toEqual({
      prefix: '\x1b[32m',
      suffix: '\x1b[0m',
    });
  });

  it('renders a bright ANSI foreground colour', () => {
    expect(spanToSgr({ text: 'x', fg: { kind: 'ansi', index: 9 } })).toEqual({
      prefix: '\x1b[91m',
      suffix: '\x1b[0m',
    });
  });

  it('renders a background colour', () => {
    expect(spanToSgr({ text: 'x', bg: { kind: 'ansi', index: 4 } })).toEqual({
      prefix: '\x1b[44m',
      suffix: '\x1b[0m',
    });
  });

  it('renders a bright background colour', () => {
    expect(spanToSgr({ text: 'x', bg: { kind: 'ansi', index: 12 } })).toEqual({
      prefix: '\x1b[104m',
      suffix: '\x1b[0m',
    });
  });

  it('renders true colour foreground', () => {
    expect(spanToSgr({ text: 'x', fg: { kind: 'rgb', r: 166, g: 227, b: 161 } })).toEqual({
      prefix: '\x1b[38;2;166;227;161m',
      suffix: '\x1b[0m',
    });
  });

  it('combines attributes and colour into one SGR sequence', () => {
    expect(spanToSgr({ text: 'x', bold: true, fg: { kind: 'ansi', index: 2 } })).toEqual({
      prefix: '\x1b[1;32m',
      suffix: '\x1b[0m',
    });
  });

  it('renders all four attributes', () => {
    expect(spanToSgr({ text: 'x', bold: true, dim: true, italic: true, underline: true })).toEqual({
      prefix: '\x1b[1;2;3;4m',
      suffix: '\x1b[0m',
    });
  });
});

describe('renderStyled', () => {
  it('concatenates spans with their SGR wrapping', () => {
    const out = renderStyled([{ text: 'a' }, { text: 'b', fg: { kind: 'ansi', index: 1 } }]);
    expect(out).toBe('a\x1b[31mb\x1b[0m');
  });

  it("does not touch newlines — that is pushOutput's job", () => {
    expect(renderStyled([{ text: 'a\nb' }])).toBe('a\nb');
  });

  it('returns an empty string for empty input', () => {
    expect(renderStyled([])).toBe('');
  });
});
