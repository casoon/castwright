// `output: { raw: "..." }` escape processing — see docs/reference/dsl.mdx ("Raw
// escapes"). `raw` passes text through untouched except for a small, fixed set
// of backslash escapes: \e \n \r \t \xNN \uNNNN \\.
//
// Note on double-processing: if the YAML value is double-quoted, the `yaml`
// library has already resolved standard YAML escapes (which happen to include
// \e, \n, \r, \t, \xNN, \uNNNN) before this function ever sees the string, so
// there is nothing left here to convert. If the value is single-quoted or a
// plain/block scalar, YAML does not touch backslashes and this pass is what
// resolves them. Applying this pass unconditionally is safe for both cases.

import { errorAtOffset } from './errors.js';

const SIMPLE: Record<string, string> = {
  e: '\x1b',
  n: '\n',
  r: '\r',
  t: '\t',
  '\\': '\\',
};

export interface UnescapeContext {
  source: string;
  file: string;
  /** Offset of the raw value's first character in `source`, used for error position. */
  baseOffset: number;
}

export function unescapeRaw(text: string, ctx: UnescapeContext): string {
  let out = '';
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch !== '\\') {
      out += ch;
      i++;
      continue;
    }

    const next = text[i + 1];
    if (next === undefined) {
      throw errorAtOffset(
        ctx.source,
        ctx.file,
        ctx.baseOffset,
        "output.raw ends with a trailing '\\'",
      );
    }

    if (next in SIMPLE) {
      out += SIMPLE[next] as string;
      i += 2;
      continue;
    }

    if (next === 'x') {
      const hex = text.slice(i + 2, i + 4);
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
        throw errorAtOffset(
          ctx.source,
          ctx.file,
          ctx.baseOffset,
          `output.raw has an invalid '\\x' escape: '\\x${hex}' is not two hex digits`,
        );
      }
      out += String.fromCharCode(Number.parseInt(hex, 16));
      i += 4;
      continue;
    }

    if (next === 'u') {
      const hex = text.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        throw errorAtOffset(
          ctx.source,
          ctx.file,
          ctx.baseOffset,
          `output.raw has an invalid '\\u' escape: '\\u${hex}' is not four hex digits`,
        );
      }
      out += String.fromCharCode(Number.parseInt(hex, 16));
      i += 6;
      continue;
    }

    throw errorAtOffset(
      ctx.source,
      ctx.file,
      ctx.baseOffset,
      `output.raw has an unknown escape '\\${next}' — supported: \\e \\n \\r \\t \\xNN \\uNNNN \\\\`,
    );
  }

  return out;
}
