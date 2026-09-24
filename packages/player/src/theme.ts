// CastTheme → xterm.js ITheme. A pure mapping over data the cast carries
// itself, which is why the player needs no theme registry and no runtime
// dependency on core (see meta/decisions.md).

import type { CastTheme } from './types.js';

export interface XtermTheme {
  foreground?: string;
  background?: string;
  cursor?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}

const PALETTE_KEYS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const;

export function toXtermTheme(theme: CastTheme): XtermTheme {
  const result: XtermTheme = {
    foreground: theme.foreground,
    background: theme.background,
    cursor: theme.cursor,
  };
  PALETTE_KEYS.forEach((key, index) => {
    const color = theme.palette[index];
    if (color !== undefined) result[key] = color;
  });
  return result;
}
