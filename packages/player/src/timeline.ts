// Pure playback arithmetic — no DOM, no timers, no xterm. Everything about
// "which bytes belong to which moment" lives here so it can be tested without
// a browser; the scheduler in player.ts only decides *when* to ask.

import type { Cast } from './types.js';

export interface TimelineEvent {
  /** Milliseconds from the start. Integers in practice — the compiler rounds. */
  timeMs: number;
  data: string;
}

export interface ResizeEvent {
  timeMs: number;
  cols: number;
  rows: number;
}

export interface Timeline {
  output: TimelineEvent[];
  markers: TimelineEvent[];
  /** asciicast `r` events, in order. Empty for anything castwright compiled. */
  resizes: ResizeEvent[];
  /**
   * The last output event's time. Note this is *not* the authored script's total
   * length: a demo ending in `wait: 2000` has no event during that wait, so the
   * trailing pause is not represented in the cast at all. The player's own
   * loop hold covers the tail — see docs/reference/player.md.
   */
  durationMs: number;
}

/** `"120x40"` → `{ cols: 120, rows: 40 }`; undefined for anything else. */
function parseResize(data: string): { cols: number; rows: number } | undefined {
  const match = /^(\d+)x(\d+)$/.exec(data.trim());
  if (!match) return undefined;
  const cols = Number(match[1]);
  const rows = Number(match[2]);
  if (cols < 1 || rows < 1) return undefined;
  return { cols, rows };
}

/**
 * Splits a cast into the three streams playback cares about.
 *
 * Every asciicast v2 event code is handled explicitly. `i` (input) is dropped:
 * it records what a human typed, not what the terminal printed, and replaying
 * it would double every keystroke in a recording made with `asciinema rec`.
 * Unknown codes are dropped too, rather than being mistaken for markers.
 */
export function buildTimeline(cast: Cast): Timeline {
  const output: TimelineEvent[] = [];
  const markers: TimelineEvent[] = [];
  const resizes: ResizeEvent[] = [];

  for (const event of cast.events) {
    const timeMs = Math.round(event[0] * 1000);
    switch (event[1]) {
      case 'o':
        output.push({ timeMs, data: event[2] });
        break;
      case 'm':
        markers.push({ timeMs, data: event[2] });
        break;
      case 'r': {
        const size = parseResize(event[2]);
        if (size) resizes.push({ timeMs, cols: size.cols, rows: size.rows });
        break;
      }
      default:
        break;
    }
  }

  return { output, markers, resizes, durationMs: output[output.length - 1]?.timeMs ?? 0 };
}

export interface Advance {
  data: string;
  nextIndex: number;
}

/**
 * Every output byte from `fromIndex` onward whose event time is at or before
 * `toMs`. Index-based rather than time-based so repeated calls cannot re-emit
 * or skip an event on a floating-point boundary.
 */
export function advance(timeline: Timeline, fromIndex: number, toMs: number): Advance {
  let index = fromIndex;
  let data = '';
  while (index < timeline.output.length) {
    const event = timeline.output[index];
    if (event === undefined || event.timeMs > toMs) break;
    data += event.data;
    index++;
  }
  return { data, nextIndex: index };
}

/** Where a replay left off — feed both back in on the next call. */
export interface ReplayCursor {
  index: number;
  resizeIndex: number;
}

export interface ReplaySink {
  write(data: string): void;
  resize?(cols: number, rows: number): void;
}

/**
 * Feeds everything between `from` and `toMs` into `sink`, with resizes applied
 * at the point in the byte stream where they happened. Ordering is the whole
 * reason this exists: resizing after the bytes that were printed at the old
 * width would reflow them wrongly.
 */
export function replay(
  timeline: Timeline,
  from: ReplayCursor,
  toMs: number,
  sink: ReplaySink,
): ReplayCursor {
  let { index, resizeIndex } = from;

  while (resizeIndex < timeline.resizes.length) {
    const resize = timeline.resizes[resizeIndex];
    if (resize === undefined || resize.timeMs > toMs) break;
    const step = advance(timeline, index, resize.timeMs);
    if (step.data.length > 0) sink.write(step.data);
    index = step.nextIndex;
    sink.resize?.(resize.cols, resize.rows);
    resizeIndex++;
  }

  const step = advance(timeline, index, toMs);
  if (step.data.length > 0) sink.write(step.data);
  return { index: step.nextIndex, resizeIndex };
}

/** Every byte up to `toMs` — used for seek-as-replay, posters and reduced motion. */
export function outputUpTo(timeline: Timeline, toMs: number): string {
  return advance(timeline, 0, toMs).data;
}

/** The marker whose label matches, if any — for `poster="marker:<label>"`. */
export function findMarker(timeline: Timeline, label: string): TimelineEvent | undefined {
  return timeline.markers.find((marker) => marker.data === label);
}
