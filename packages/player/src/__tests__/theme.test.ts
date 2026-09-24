import { describe, expect, it } from 'vitest';
import { toXtermTheme } from '../theme.js';
import type { CastTheme } from '../types.js';

const theme: CastTheme = {
  foreground: '#ffffff',
  background: '#000000',
  cursor: '#ff0000',
  palette: [
    '#100000',
    '#110000',
    '#120000',
    '#130000',
    '#140000',
    '#150000',
    '#160000',
    '#170000',
    '#180000',
    '#190000',
    '#1a0000',
    '#1b0000',
    '#1c0000',
    '#1d0000',
    '#1e0000',
    '#1f0000',
  ],
};

describe('toXtermTheme', () => {
  it('maps foreground, background and cursor', () => {
    const t = toXtermTheme(theme);
    expect(t.foreground).toBe('#ffffff');
    expect(t.background).toBe('#000000');
    expect(t.cursor).toBe('#ff0000');
  });

  it('maps all 16 palette entries to xterm colour names in order', () => {
    const t = toXtermTheme(theme);
    expect(t.black).toBe('#100000');
    expect(t.white).toBe('#170000');
    expect(t.brightBlack).toBe('#180000');
    expect(t.brightWhite).toBe('#1f0000');
  });

  it('omits entries a short palette does not have', () => {
    const t = toXtermTheme({ ...theme, palette: ['#aaaaaa'] });
    expect(t.black).toBe('#aaaaaa');
    expect(t.red).toBeUndefined();
  });
});
