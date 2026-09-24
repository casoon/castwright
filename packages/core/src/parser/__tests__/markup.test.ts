import { describe, expect, it } from 'vitest';
import { CastwrightParseError } from '../errors.js';
import { parseMarkup } from '../markup.js';

function ctx(source: string) {
  return { source, file: 'test.terminal.yaml', baseOffset: 0 };
}

describe('parseMarkup', () => {
  it('returns a single unstyled span for plain text', () => {
    expect(parseMarkup('hello', ctx('hello'))).toEqual([{ text: 'hello' }]);
  });

  it('applies a base colour', () => {
    const src = '{green}✓{/}';
    expect(parseMarkup(src, ctx(src))).toEqual([{ text: '✓', fg: { kind: 'ansi', index: 2 } }]);
  });

  it('applies a bright colour variant', () => {
    const src = '{bright-red}x{/}';
    expect(parseMarkup(src, ctx(src))).toEqual([{ text: 'x', fg: { kind: 'ansi', index: 9 } }]);
  });

  it('applies a background colour via bg-<colour>', () => {
    const src = '{bg-blue}x{/}';
    expect(parseMarkup(src, ctx(src))).toEqual([{ text: 'x', bg: { kind: 'ansi', index: 4 } }]);
  });

  it('applies true colour via #rrggbb', () => {
    const src = '{#a6e3a1}x{/}';
    expect(parseMarkup(src, ctx(src))).toEqual([
      { text: 'x', fg: { kind: 'rgb', r: 0xa6, g: 0xe3, b: 0xa1 } },
    ]);
  });

  it('applies attribute tags', () => {
    expect(parseMarkup('{bold}x{/}', ctx('{bold}x{/}'))).toEqual([{ text: 'x', bold: true }]);
    expect(parseMarkup('{dim}x{/}', ctx('{dim}x{/}'))).toEqual([{ text: 'x', dim: true }]);
    expect(parseMarkup('{italic}x{/}', ctx('{italic}x{/}'))).toEqual([{ text: 'x', italic: true }]);
    expect(parseMarkup('{underline}x{/}', ctx('{underline}x{/}'))).toEqual([
      { text: 'x', underline: true },
    ]);
  });

  it('nests tags and merges their styles', () => {
    const src = '{green}a{bold}b{/}c{/}d';
    expect(parseMarkup(src, ctx(src))).toEqual([
      { text: 'a', fg: { kind: 'ansi', index: 2 } },
      { text: 'b', fg: { kind: 'ansi', index: 2 }, bold: true },
      { text: 'c', fg: { kind: 'ansi', index: 2 } },
      { text: 'd' },
    ]);
  });

  it('{//} resets every open tag at once', () => {
    const src = '{green}{bold}a{//}b';
    expect(parseMarkup(src, ctx(src))).toEqual([
      { text: 'a', fg: { kind: 'ansi', index: 2 }, bold: true },
      { text: 'b' },
    ]);
  });

  it('{{ is a literal brace', () => {
    expect(parseMarkup('a{{b', ctx('a{{b'))).toEqual([{ text: 'a{b' }]);
  });

  it('produces no spans for empty text', () => {
    expect(parseMarkup('', ctx(''))).toEqual([]);
  });

  it('throws with a position on an unknown tag', () => {
    const src = 'x {nope} y';
    expect(() => parseMarkup(src, ctx(src))).toThrow(CastwrightParseError);
    try {
      parseMarkup(src, ctx(src));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CastwrightParseError);
      const err = e as CastwrightParseError;
      expect(err.message).toContain("unknown markup tag '{nope}'");
      expect(err.position).toEqual({ line: 1, column: 3 });
    }
  });

  it('throws on an unterminated tag', () => {
    const src = 'x {green y';
    expect(() => parseMarkup(src, ctx(src))).toThrow(/unterminated markup tag/);
  });

  it('throws on an unmatched close tag', () => {
    const src = '{/}';
    expect(() => parseMarkup(src, ctx(src))).toThrow(/unmatched/);
  });

  it('throws on a tag left open at end of text, positioned at the opening brace', () => {
    const src = 'ab{green}cd';
    try {
      parseMarkup(src, ctx(src));
      expect.unreachable();
    } catch (e) {
      const err = e as CastwrightParseError;
      expect(err.message).toContain('unclosed markup tag');
      expect(err.position.column).toBe(3); // the '{' of {green}
    }
  });

  it('offsets positions by baseOffset within a larger source', () => {
    const source = 'terminal:\n  prompt: "x {nope} y"\n';
    const valueStart = source.indexOf('x {nope} y');
    try {
      parseMarkup('x {nope} y', { source, file: 'f.yaml', baseOffset: valueStart });
      expect.unreachable();
    } catch (e) {
      const err = e as CastwrightParseError;
      expect(err.position.line).toBe(2);
    }
  });
});
