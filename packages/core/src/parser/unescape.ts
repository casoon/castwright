// `output: { raw: "..." }` escape processing — see docs/reference/dsl.mdx ("Raw
// escapes"). `raw` passes text through untouched except for a small, fixed set
// of backslash escapes: \e \n \r \t \xNN \uNNNN \\.
//
// Note on double-processing: a double-quoted YAML scalar already has its
// escapes resolved by the `yaml` library, so the parser applies this pass only
// to plain, single-quoted and block scalars (see parseOutputText()).

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
  /** Maps an index in the scalar's value to a `source` offset; defaults to `baseOffset + index`. */
  offsetAt?: (index: number) => number;
}

export function unescapeRaw(text: string, ctx: UnescapeContext): string {
  const at = (index: number) => ctx.offsetAt?.(index) ?? ctx.baseOffset + index;
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
      throw errorAtOffset(ctx.source, ctx.file, at(i), "output.raw ends with a trailing '\\'");
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
          at(i),
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
          at(i),
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
      at(i),
      `output.raw has an unknown escape '\\${next}' — supported: \\e \\n \\r \\t \\xNN \\uNNNN \\\\`,
    );
  }

  return out;
}
