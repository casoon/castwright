import { describe, expect, it } from 'vitest';
import { CLEAR_SCREEN, keyBytes } from '../keys.js';

describe('keyBytes', () => {
  it('enter is CRLF, matching "run lowers to ... a trailing \\r\\n from key: enter"', () => {
    expect(keyBytes('enter')).toBe('\r\n');
  });

  it('maps every documented key name to a distinct byte sequence', () => {
    const names = [
      'enter',
      'tab',
      'escape',
      'backspace',
      'up',
      'down',
      'left',
      'right',
      'ctrl+c',
      'ctrl+d',
      'ctrl+l',
    ] as const;
    const seen = new Set<string>();
    for (const name of names) {
      const bytes = keyBytes(name);
      expect(bytes.length).toBeGreaterThan(0);
      seen.add(bytes);
    }
    expect(seen.size).toBe(names.length);
  });

  it('control keys send the documented ASCII control codes', () => {
    expect(keyBytes('ctrl+c')).toBe('\x03');
    expect(keyBytes('ctrl+d')).toBe('\x04');
    expect(keyBytes('ctrl+l')).toBe('\x0c');
    expect(keyBytes('tab')).toBe('\t');
    expect(keyBytes('backspace')).toBe('\x7f');
  });

  it('arrow keys use standard ANSI cursor sequences', () => {
    expect(keyBytes('up')).toBe('\x1b[A');
    expect(keyBytes('down')).toBe('\x1b[B');
    expect(keyBytes('right')).toBe('\x1b[C');
    expect(keyBytes('left')).toBe('\x1b[D');
  });
});

describe('CLEAR_SCREEN', () => {
  it('matches the DSL spec byte sequence', () => {
    expect(CLEAR_SCREEN).toBe('\x1b[2J\x1b[H');
  });
});
