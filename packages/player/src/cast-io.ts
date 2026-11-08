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

type CastEvent = Cast['events'][number];

function isEvent(value: unknown): value is CastEvent {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'string' &&
    typeof value[2] === 'string'
  );
}

/** The ndjson header as either asciicast version spells it. */
interface WireHeader {
  version?: unknown;
  width?: unknown;
  height?: unknown;
  term?: { cols?: unknown; rows?: unknown; theme?: WireTheme };
  title?: string;
  theme?: CastTheme | WireTheme;
  idle_time_limit?: number;
}

/**
 * Header of a v2 or v3 file as our v2-shaped one. v3 keeps its size and theme
 * under `term`; everything downstream only knows the v2 spelling.
 */
function headerFromWire(wire: WireHeader): Cast['header'] {
  if (wire.version === 1) {
    throw new Error('castwright: asciicast v1 is not supported — re-record with asciinema 2+');
  }
  if (wire.version !== 2 && wire.version !== 3) {
    throw new Error(`castwright: unsupported asciicast version ${String(wire.version)}`);
  }

  const v3 = wire.version === 3;
  const width = v3 ? wire.term?.cols : wire.width;
  const height = v3 ? wire.term?.rows : wire.height;
  if (typeof width !== 'number' || typeof height !== 'number') {
    throw new Error('castwright: cast header is missing width/height');
  }

  const theme = v3 ? wire.term?.theme : wire.theme;
  const header: Cast['header'] & { idle_time_limit?: number } = { version: 2, width, height };
  if (wire.title !== undefined) header.title = wire.title;
  if (theme !== undefined) header.theme = theme as CastTheme;
  if (typeof wire.idle_time_limit === 'number') header.idle_time_limit = wire.idle_time_limit;
  return normalizeHeader(header);
}

export function deserializeCast(text: string): Cast {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error('castwright: empty cast');
  }

  // A single JSON object carrying `header` is the inlined form.
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<Cast> & { version?: unknown };
      if (parsed.header && Array.isArray(parsed.events)) {
        return { header: normalizeHeader(parsed.header), events: parsed.events };
      }
      // A v1 file is one JSON document, not ndjson — name it rather than fail
      // later on a header line that is half an object.
      if (parsed.version === 1) headerFromWire({ version: 1 });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('castwright:')) throw error;
      // Not a single JSON document — fall through to the ndjson reader below,
      // which is the shape a real .cast file has (its first line is an object).
    }
  }

  const lines = trimmed.split('\n').filter((line) => line.trim().length > 0);
  const [headerLine, ...eventLines] = lines;
  if (headerLine === undefined) {
    throw new Error('castwright: cast has no header line');
  }

  let wire: WireHeader;
  try {
    wire = JSON.parse(headerLine) as WireHeader;
  } catch {
    throw new Error('castwright: cast header line is not valid JSON');
  }
  const header = headerFromWire(wire);

  // v3 times are intervals since the previous event; v2 and the inlined form
  // are absolute. Accumulate once here so the timeline only sees absolute time.
  const relative = wire.version === 3;
  const events: CastEvent[] = [];
  let clock = 0;
  let skipped = 0;
  for (const line of eventLines) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      // A recording cut short (Ctrl-C, full disk) ends in half a line.
      skipped++;
      continue;
    }
    if (!isEvent(value)) {
      skipped++;
      continue;
    }
    if (relative) {
      clock += value[0];
      events.push([clock, value[1], value[2]] as CastEvent);
    } else {
      events.push(value);
    }
  }
  if (skipped > 0) {
    console.warn(`castwright: skipped ${skipped} malformed event line(s) in cast`);
  }

  return { header, events };
}
