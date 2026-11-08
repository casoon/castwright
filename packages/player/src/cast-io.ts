// Reading a cast in the browser.
//
// Two shapes reach the player, and it must accept both:
//   1. An inlined `Cast` object — what the Vite plugin and the Astro component
//      emit into a <script type="application/json"> at build time.
//   2. An asciicast v2 file — newline-delimited JSON, what `castwright build`
//      writes and what `asciinema rec` produces, fetched at runtime when there
//      is no bundler.
//
// The two spell the theme differently: the inlined object carries this
// codebase's `CastTheme` (xterm's field names), a file carries the spec's
// `{fg, bg, palette: "a:b:…"}`. Everything downstream of this module sees the
// first shape only, which is why `toXtermTheme` can stay a plain field mapping.
//
// This duplicates core's `compiler/wire.ts` in reverse. That is deliberate:
// importing core here would create the runtime edge the architecture exists to
// avoid, and 20 lines is a cheaper price than a 40 kB parser in the bundle.

import type { Cast, CastTheme } from './types.js';

/** The theme as an asciicast v2 file spells it. */
interface WireTheme {
  fg?: string;
  bg?: string;
  palette?: string;
}

function isWireTheme(theme: unknown): theme is WireTheme {
  return (
    typeof theme === 'object' &&
    theme !== null &&
    // A palette that is a string is the file format; an array is ours.
    (typeof (theme as WireTheme).palette === 'string' || 'fg' in theme || 'bg' in theme)
  );
}

function fromWireTheme(theme: WireTheme): CastTheme {
  const fg = theme.fg ?? '';
  return {
    foreground: fg,
    background: theme.bg ?? '',
    // asciicast v2 has no cursor colour; the foreground is what a terminal
    // falls back to anyway. See compiler/wire.ts in core.
    cursor: fg,
    palette: (theme.palette ?? '').split(':').filter((color) => color.length > 0),
  };
}

/** Accepts either spelling of the header theme and returns ours. */
function normalizeHeader(header: Cast['header']): Cast['header'] {
  const theme = header.theme as CastTheme | WireTheme | undefined;
  if (theme === undefined || !isWireTheme(theme)) return header;
  return { ...header, theme: fromWireTheme(theme) };
}

export function deserializeCast(text: string): Cast {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error('castwright: empty cast');
  }

  // A single JSON object carrying `header` is the inlined form.
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<Cast>;
      if (parsed.header && Array.isArray(parsed.events)) {
        return { header: normalizeHeader(parsed.header), events: parsed.events };
      }
    } catch {
      // Not a single JSON document — fall through to the ndjson reader below,
      // which is the shape a real .cast file has (its first line is an object).
    }
  }

  const lines = trimmed.split('\n').filter((line) => line.trim().length > 0);
  const [headerLine, ...eventLines] = lines;
  if (headerLine === undefined) {
    throw new Error('castwright: cast has no header line');
  }

  const header = JSON.parse(headerLine) as Cast['header'];
  if (typeof header?.width !== 'number' || typeof header?.height !== 'number') {
    throw new Error('castwright: cast header is missing width/height');
  }

  return {
    header: normalizeHeader(header),
    events: eventLines.map((line) => JSON.parse(line) as Cast['events'][number]),
  };
}
