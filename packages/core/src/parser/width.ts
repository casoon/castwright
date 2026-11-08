// Terminal column width of text, for the `output` line-width warning. Strips
// ANSI escape sequences, then counts each grapheme as 1 or 2 columns.

import { graphemes } from '../compiler/graphemes.js';

// CSI, OSC (BEL or ST terminated) and two-character escapes.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ESC is the point
const ESCAPE_SEQUENCE = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)?|[@-Z\\-_])/g;

const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]|\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u{20000}-\u{3fffd}]/u;

export function columnWidth(text: string): number {
  let width = 0;
  for (const g of graphemes(text.replace(ESCAPE_SEQUENCE, ''))) {
    if (/^\p{Mn}+$/u.test(g) || g === '\r') continue;
    width += WIDE.test(g) ? 2 : 1;
  }
  return width;
}
