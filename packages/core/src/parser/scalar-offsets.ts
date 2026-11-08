// Maps an index in a YAML scalar's decoded string back to an offset in the
// source file, so errors inside quoted and block scalars point at the real
// character. Best effort: where the source cannot be aligned (folded plain or
// quoted line breaks) it degrades to a straight offset from the scalar start.

import type { Scalar } from 'yaml';

const ESCAPE_LENGTH: Record<string, number> = { x: 4, u: 6, U: 10 };

export function scalarOffsetMap(
  scalar: Scalar,
  source: string,
  decoded: string,
): (index: number) => number {
  const start = scalar.range?.[0] ?? 0;
  const map: number[] = [];

  if (scalar.type === 'QUOTE_DOUBLE' || scalar.type === 'QUOTE_SINGLE') {
    const double = scalar.type === 'QUOTE_DOUBLE';
    let pos = start + 1;
    let k = 0;
    while (k < decoded.length) {
      const ch = source[pos];
      if (ch === undefined || ch === '\n') break;
      let len = 1;
      if (double && ch === '\\') {
        len = ESCAPE_LENGTH[source[pos + 1] as string] ?? 2;
      } else if (!double && ch === "'" && source[pos + 1] === "'") {
        len = 2;
      }
      const units = (decoded.codePointAt(k) as number) > 0xffff ? 2 : 1;
      for (let u = 0; u < units; u++) map[k + u] = pos;
      k += units;
      pos += len;
    }
    return (index) => map[index] ?? start + 1 + index;
  }

  if (scalar.type === 'BLOCK_LITERAL' || scalar.type === 'BLOCK_FOLDED') {
    const header = source.indexOf('\n', start);
    if (header === -1) return (index) => start + index;
    let pos = header + 1;
    const firstLine = /^( *)\S/m.exec(source.slice(pos));
    const indent = firstLine?.[1]?.length ?? 0;
    const skipIndent = () => {
      for (let n = 0; n < indent && source[pos] === ' '; n++) pos++;
    };
    skipIndent();
    for (let k = 0; k < decoded.length; k++) {
      if (source[pos] === '\n' && decoded[k] === ' ') {
        // folded line break
        pos++;
        skipIndent();
      }
      map[k] = pos;
      if (decoded[k] === '\n') {
        pos++;
        skipIndent();
      } else {
        pos++;
      }
    }
    return (index) => map[index] ?? pos;
  }

  return (index) => start + index;
}
