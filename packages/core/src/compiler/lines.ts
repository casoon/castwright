// Splits a `Styled` block into per-line `Styled` arrays on literal `\n`,
// preserving each fragment's style. Used by the compiler's `output` handling
// when `lineDelay > 0` — n ms per line, not per character. A single
// span's text can itself contain `\n`, so this operates on spans, not lines.
//
// A wholly empty trailing line — the artifact of the source text ending in
// `\n` — is dropped; it has no visual purpose and nothing to time. A genuine
// blank line *inside* the text (`"a\n\nb"`) is kept as an empty line.

import type { Span, Styled } from '../types.js';

export function splitStyledLines(styled: Styled): Styled[] {
  const lines: Styled[] = [];
  let current: Span[] = [];

  for (const span of styled) {
    const parts = span.text.split('\n');
    parts.forEach((part, i) => {
      if (part.length > 0) {
        current.push({ ...span, text: part });
      }
      if (i < parts.length - 1) {
        lines.push(current);
        current = [];
      }
    });
  }

  if (current.length > 0) {
    lines.push(current);
  }

  return lines;
}
