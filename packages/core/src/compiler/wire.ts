// The asciicast v2 *wire format* — the exact object shape that goes into a
// `.cast` file — and the conversion to and from this codebase's own `Cast`.
//
// These are two different things and were once conflated, which is how casts
// came to be written with xterm's field names (`foreground`, `background`, a
// palette array) instead of the spec's (`fg`, `bg`, a colon-joined string).
// Files written that way load in castwright and nowhere else. Everything that
// reads or writes a cast file now goes through this module; nothing else in the
// package may spell a header field itself.
//
// Spec: https://docs.asciinema.org/manual/asciicast/v2/
//
// Note that v2 has no field for the cursor colour, so `toWireTheme` drops it.
// A cast read back from a file therefore renders its cursor in the foreground
// colour, which is also xterm's own default. Inventing a non-standard key to
// keep it would trade the compatibility this module exists to guarantee for a
// tint that six of the seven built-in themes do not use.

import type { CastHeader, CastTheme } from '../types.js';

export interface AsciicastTheme {
  fg: string;
  bg: string;
  /** 8 or 16 `#rrggbb` colours joined with `:`. */
  palette: string;
}

export interface AsciicastHeader {
  version: 2;
  width: number;
  height: number;
  title?: string;
  theme?: AsciicastTheme;
  // Deliberately no `timestamp` — see the determinism rule in meta/decisions.md.
}

export function toWireTheme(theme: CastTheme): AsciicastTheme {
  return {
    fg: theme.foreground,
    bg: theme.background,
    palette: theme.palette.join(':'),
  };
}

export function fromWireTheme(theme: AsciicastTheme): CastTheme {
  return {
    foreground: theme.fg,
    background: theme.bg,
    // v2 carries no cursor colour; the foreground is what a terminal falls back
    // to, so the round trip lands where the reader would have landed anyway.
    cursor: theme.fg,
    palette: theme.palette.split(':').filter((color) => color.length > 0),
  };
}

export function toWireHeader(header: CastHeader): AsciicastHeader {
  const wire: AsciicastHeader = {
    version: 2,
    width: header.width,
    height: header.height,
  };
  if (header.title !== undefined) wire.title = header.title;
  if (header.theme !== undefined) wire.theme = toWireTheme(header.theme);
  return wire;
}

export function fromWireHeader(header: AsciicastHeader): CastHeader {
  const result: CastHeader = {
    version: 2,
    width: header.width,
    height: header.height,
  };
  if (header.title !== undefined) result.title = header.title;
  if (header.theme !== undefined) result.theme = fromWireTheme(header.theme);
  return result;
}
