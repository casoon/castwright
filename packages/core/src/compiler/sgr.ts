// Span → SGR conversion. One function, shared by the prompt, `type` text and `output`,
// which is why inline markup is parsed once in the parser and never
// re-parsed here: this module only ever sees already-resolved `Span`s.
//
// Resets with a plain `ESC[0m` after every styled span rather than computing
// minimal SGR transitions between adjacent spans — casts are small, and
// readable output beats a few saved bytes (see the spec for the reasoning).

import type { Color, Span, Styled } from '../types.js';

const ESC = '\x1b';

function colorCodes(color: Color, ground: 'fg' | 'bg'): string[] {
  if (color.kind === 'rgb') {
    return [ground === 'fg' ? '38' : '48', '2', String(color.r), String(color.g), String(color.b)];
  }
  const base = ground === 'fg' ? (color.index < 8 ? 30 : 90) : color.index < 8 ? 40 : 100;
  const offset = color.index < 8 ? color.index : color.index - 8;
  return [String(base + offset)];
}

function sgrCodes(span: Span): string[] {
  const codes: string[] = [];
  if (span.bold) codes.push('1');
  if (span.dim) codes.push('2');
  if (span.italic) codes.push('3');
  if (span.underline) codes.push('4');
  if (span.fg) codes.push(...colorCodes(span.fg, 'fg'));
  if (span.bg) codes.push(...colorCodes(span.bg, 'bg'));
  return codes;
}

export interface SpanSgr {
  /** Bytes to emit before the span's first character. Empty if the span has no style. */
  prefix: string;
  /** Bytes to emit after the span's last character. Empty if the span has no style. */
  suffix: string;
}

export function spanToSgr(span: Span): SpanSgr {
  const codes = sgrCodes(span);
  if (codes.length === 0) return { prefix: '', suffix: '' };
  return { prefix: `${ESC}[${codes.join(';')}m`, suffix: `${ESC}[0m` };
}

/**
 * Renders a full `Styled` block as one string: each span's SGR prefix, its
 * text, and its SGR suffix, concatenated.
 *
 * Deliberately does *not* normalise `\n` to `\r\n` here — that is done in
 * exactly one place, `Ctx.pushOutput` in compile.ts, so it can never be
 * applied twice (running the replacement on an already-`\r\n` string would
 * corrupt it into `\r\r\n`).
 */
export function renderStyled(styled: Styled): string {
  let out = '';
  for (const span of styled) {
    const { prefix, suffix } = spanToSgr(span);
    out += prefix + span.text + suffix;
  }
  return out;
}
