import { describe, expect, it } from 'vitest';
import { unescapeRaw } from '../unescape.js';

function ctx(source: string) {
  return { source, file: 'test.terminal.yaml', baseOffset: 0 };
}

describe('unescapeRaw', () => {
  it('passes plain text through untouched', () => {
    expect(unescapeRaw('hello', ctx('hello'))).toBe('hello');
  });

  it('converts \\e to ESC (0x1B)', () => {
    expect(unescapeRaw('\\e[32m', ctx('\\e[32m'))).toBe('\x1b[32m');
  });

  it('converts \\n \\r \\t', () => {
    expect(unescapeRaw('a\\nb\\rc\\td', ctx(''))).toBe('a\nb\rc\td');
  });

  it('converts \\xNN', () => {
    expect(unescapeRaw('\\x41', ctx(''))).toBe('A');
  });

  it('converts \\uNNNN', () => {
    expect(unescapeRaw('\\u0041', ctx(''))).toBe('A');
  });

  it('converts \\\\ to a literal backslash', () => {
    expect(unescapeRaw('a\\\\b', ctx(''))).toBe('a\\b');
  });

  it('matches the DSL spec example', () => {
    const input = '\\e[32m\u2713\\e[0m Installed\\r\\n';
    expect(unescapeRaw(input, ctx(input))).toBe('\x1b[32m\u2713\x1b[0m Installed\r\n');
  });

  it('throws on an unknown escape', () => {
    expect(() => unescapeRaw('\\q', ctx('\\q'))).toThrow(/unknown escape/);
  });

  it('throws on a trailing backslash', () => {
    expect(() => unescapeRaw('a\\', ctx('a\\'))).toThrow(/trailing/);
  });

  it('throws on an incomplete \\x escape', () => {
    expect(() => unescapeRaw('\\x4', ctx('\\x4'))).toThrow(/\\x/);
  });

  it('throws on an incomplete \\u escape', () => {
    expect(() => unescapeRaw('\\u12', ctx('\\u12'))).toThrow(/\\u/);
  });
});
