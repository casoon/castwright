// KeyName → the bytes a terminal receives for that key. The key list is in
// docs/reference/dsl.md ("Steps").
//
// `enter` is `\r\n`, not a bare `\r`: `run` lowers to typed text plus a
// trailing `\r\n` from `key: enter`.
// `backspace` sends DEL (0x7F) to match xterm.js's default backspace
// behaviour, since xterm.js is this project's terminal engine. The arrow
// keys use the standard ANSI cursor-key sequences (CSI, normal/non-
// application mode).

import type { KeyName } from '../types.js';

const ESC = '\x1b';

const KEY_BYTES: Record<KeyName, string> = {
  enter: '\r\n',
  tab: '\t',
  escape: ESC,
  backspace: '\x7f',
  up: `${ESC}[A`,
  down: `${ESC}[B`,
  right: `${ESC}[C`,
  left: `${ESC}[D`,
  'ctrl+c': '\x03',
  'ctrl+d': '\x04',
  'ctrl+l': '\x0c',
};

export function keyBytes(key: KeyName): string {
  return KEY_BYTES[key];
}

/** `ESC[2J ESC[H` — clears the screen and homes the cursor. */
export const CLEAR_SCREEN = `${ESC}[2J${ESC}[H`;
