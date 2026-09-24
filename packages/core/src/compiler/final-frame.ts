// The terminal's *final* contents as plain text — the accessibility fallback
// described in meta/constraints.md and docs/reference/player.md.
//
// This lives in `core`, not `player`, on purpose: it runs at build time (the
// Vite plugin and the Astro component emit its result as the custom element's
// light-DOM children) so the browser never pays for a second VT implementation
// just to produce text it could have been handed. It is also what the SVG
// exporter (item 08) will need for cell positions.

import headless from '@xterm/headless';
import type { Cast } from '../types.js';

const { Terminal } = headless;

export interface FinalFrameOptions {
  /** Keep trailing blank lines instead of trimming them. Default false. */
  keepTrailingBlankLines?: boolean;
  /**
   * Also return everything that scrolled off the top. Default false — the
   * fallback stands in for the *screen*, and a demo that prints a thousand
   * lines would otherwise hand a screen reader all thousand.
   */
  includeScrollback?: boolean;
}

/** `"120x40"` → `{ cols: 120, rows: 40 }`; undefined for anything else. */
export function parseResize(data: string): { cols: number; rows: number } | undefined {
  const match = /^(\d+)x(\d+)$/.exec(data.trim());
  if (!match) return undefined;
  const cols = Number(match[1]);
  const rows = Number(match[2]);
  if (cols < 1 || rows < 1) return undefined;
  return { cols, rows };
}

/**
 * Replays `cast` into a headless terminal and returns the resulting screen as
 * plain text, one line per row, with trailing blank lines removed. Only the
 * visible rows are returned unless `includeScrollback` is set. Styling is
 * deliberately dropped — this is the text alternative, and a screen reader has
 * no use for SGR codes.
 *
 * `r` (resize) events are applied in order, so a cast recorded elsewhere ends
 * up with the geometry it actually ended on; `i` (input) events are skipped,
 * since keystrokes are not screen output.
 */
export async function finalFrameText(cast: Cast, options: FinalFrameOptions = {}): Promise<string> {
  let rows = cast.header.height;
  const terminal = new Terminal({
    cols: cast.header.width,
    rows,
    allowProposedApi: true,
  });

  const write = (data: string): Promise<void> =>
    new Promise<void>((resolve) => terminal.write(data, resolve));

  // Output is batched between resizes rather than written event by event: one
  // write of the whole stream is what the previous implementation did and is
  // markedly faster, and a resize is the only thing that has to interrupt it.
  let pending = '';
  for (const event of cast.events) {
    if (event[1] === 'o') {
      pending += event[2];
      continue;
    }
    if (event[1] !== 'r') continue;
    const size = parseResize(event[2]);
    if (!size) continue;
    if (pending.length > 0) {
      await write(pending);
      pending = '';
    }
    terminal.resize(size.cols, size.rows);
    rows = size.rows;
  }
  if (pending.length > 0) await write(pending);

  const buffer = terminal.buffer.active;
  // `baseY` is the first row of the viewport; everything before it has
  // scrolled off. With scrollback included this is just the whole buffer.
  const start = options.includeScrollback ? 0 : buffer.baseY;
  const end = options.includeScrollback ? buffer.length : Math.min(buffer.length, start + rows);

  const lines: string[] = [];
  for (let i = start; i < end; i++) {
    lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
  }
  if (!options.keepTrailingBlankLines) {
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  }

  terminal.dispose();
  return lines.join('\n');
}
