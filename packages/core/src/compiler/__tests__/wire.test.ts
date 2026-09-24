// The one boundary where this codebase's model meets someone else's file
// format. These tests are written against the literal examples in
// https://docs.asciinema.org/manual/asciicast/v2/ rather than against our own
// output, because "matches what we produce" is exactly the property that let
// the two drift apart in the first place.

import { describe, expect, it } from 'vitest';
import { resolveTheme } from '../../themes/index.js';
import type { Cast, CastTheme } from '../../types.js';
import { serializeCast } from '../serialize.js';
import {
  type AsciicastTheme,
  fromWireHeader,
  fromWireTheme,
  toWireHeader,
  toWireTheme,
} from '../wire.js';

// Verbatim from the spec's own theme example.
const SPEC_THEME: AsciicastTheme = {
  fg: '#d0d0d0',
  bg: '#212121',
  palette:
    '#151515:#ac4142:#7e8e50:#e5b567:#6c99bb:#9f4e85:#7dd6cf:#d0d0d0:' +
    '#505050:#ac4142:#7e8e50:#e5b567:#6c99bb:#9f4e85:#7dd6cf:#f5f5f5',
};

describe('toWireTheme', () => {
  it('uses the spec field names and a colon-joined palette', () => {
    const theme: CastTheme = {
      foreground: '#d0d0d0',
      background: '#212121',
      cursor: '#ffffff',
      palette: ['#151515', '#ac4142'],
    };
    expect(toWireTheme(theme)).toEqual({
      fg: '#d0d0d0',
      bg: '#212121',
      palette: '#151515:#ac4142',
    });
  });

  it('emits no field the spec does not define', () => {
    const wire = toWireTheme(resolveTheme('catppuccin-mocha'));
    expect(Object.keys(wire).sort()).toEqual(['bg', 'fg', 'palette']);
  });
});

describe('fromWireTheme', () => {
  it('reads the spec example back into a 16-colour palette', () => {
    const theme = fromWireTheme(SPEC_THEME);
    expect(theme.foreground).toBe('#d0d0d0');
    expect(theme.background).toBe('#212121');
    expect(theme.palette).toHaveLength(16);
    expect(theme.palette[0]).toBe('#151515');
    expect(theme.palette[15]).toBe('#f5f5f5');
  });

  it('accepts the 8-colour palette the spec also allows', () => {
    const theme = fromWireTheme({ ...SPEC_THEME, palette: '#000000:#111111' });
    expect(theme.palette).toEqual(['#000000', '#111111']);
  });

  it('falls back to the foreground for the cursor, which v2 does not carry', () => {
    expect(fromWireTheme(SPEC_THEME).cursor).toBe('#d0d0d0');
  });
});

describe('round trip', () => {
  it('preserves every built-in theme except the cursor colour', () => {
    const original = resolveTheme('dracula');
    const back = fromWireTheme(toWireTheme(original));
    expect(back.foreground).toBe(original.foreground);
    expect(back.background).toBe(original.background);
    expect(back.palette).toEqual(original.palette);
  });

  it('preserves the header fields', () => {
    const header = {
      version: 2 as const,
      width: 90,
      height: 20,
      title: 'demo',
      theme: resolveTheme('default'),
    };
    const back = fromWireHeader(toWireHeader(header));
    expect(back.width).toBe(90);
    expect(back.height).toBe(20);
    expect(back.title).toBe('demo');
    expect(back.theme?.palette).toEqual(header.theme.palette);
  });

  it('omits title and theme when the cast has none', () => {
    expect(toWireHeader({ version: 2, width: 80, height: 24 })).toEqual({
      version: 2,
      width: 80,
      height: 24,
    });
  });
});

describe('serializeCast', () => {
  it('writes a header a spec-compliant reader can parse', () => {
    const cast: Cast = {
      header: { version: 2, width: 80, height: 24, theme: resolveTheme('default') },
      events: [
        [0, 'o', 'hi'],
        [1, 'm', 'chapter'],
      ],
    };
    const [headerLine, ...eventLines] = serializeCast(cast).trimEnd().split('\n');
    const header = JSON.parse(headerLine as string) as Record<string, unknown>;

    expect(header['version']).toBe(2);
    expect(header['width']).toBe(80);
    expect(header['height']).toBe(24);
    // The failure this guards: xterm's field names ended up in the file.
    expect(header).not.toHaveProperty('foreground');
    expect(header['theme']).toEqual({
      fg: '#e5e5e5',
      bg: '#000000',
      palette: resolveTheme('default').palette.join(':'),
    });

    expect(eventLines).toEqual(['[0,"o","hi"]', '[1,"m","chapter"]']);
  });
});
