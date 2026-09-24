// Cast → one self-contained animated SVG (plan item 08, spec/06-exporters.md).
//
// Built rather than delegated to svg-term-cli: that tool ignores the cast's
// theme, drops italic and dim, positions text without `textLength` (so columns
// shear with the viewer's font) and has been unmaintained since 2022.
//
// Frame model: the cast is replayed into @xterm/headless and the screen is
// snapshotted whenever time moves on. Every distinct row is defined once in
// <defs>; a frame is a list of <use> references plus a cursor. All frames sit
// side by side in one strip, and a single CSS keyframe animation slides the
// strip past a clipping viewport. No script, no external references — it
// renders inside an <img>, which is what a GitHub README gives it.

import headless from '@xterm/headless';
import { parseResize } from '../compiler/final-frame.js';
import { resolveTheme } from '../themes/index.js';
import type { Cast, CastTheme } from '../types.js';

const { Terminal } = headless;

type HeadlessTerminal = InstanceType<typeof Terminal>;
type BufferLine = NonNullable<ReturnType<HeadlessTerminal['buffer']['active']['getLine']>>;
type BufferCell = ReturnType<HeadlessTerminal['buffer']['active']['getNullCell']>;

export interface SvgOptions {
  /** Window title bar with traffic lights. Default true. */
  chrome?: boolean;
  /** How long the last frame holds before the animation loops, in ms. Default 2000. */
  loopDelay?: number;
  /**
   * Changes closer together than this are merged into one frame, in ms.
   * Default 30 — below the default typing speed (45 ms), so typing keeps one
   * frame per character.
   */
  minFrameInterval?: number;
}

// Geometry in SVG user units. The cell width is pinned via `textLength`, so the
// actual font only changes glyph shapes, never column positions.
const FONT_SIZE = 14;
const CELL_W = 8.4;
const LINE_H = 18;
const BASELINE = 13.5;
const PAD = 12;
const CHROME_H = 32;
const FONT_FAMILY = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

interface Frame {
  /** Seconds from the start. */
  time: number;
  /** Row definition id per screen row; undefined for an empty row. */
  rows: (number | undefined)[];
  /** The buffer line at the top of the screen — how far the normal buffer has scrolled. */
  baseY: number;
  /** Full-screen programs switch to the alternate buffer, which never scrolls. */
  alternate: boolean;
  cursor?: { x: number; y: number };
}

// Enough scrollback that a buffer line keeps its index for the whole demo: the
// renderer follows each line by that index, so a scroll moves one strip of
// lines instead of changing every row on screen.
const SCROLLBACK = 50_000;

/** Everything a frame snapshot needs to turn buffer cells into markup. */
class RowRenderer {
  readonly #theme: CastTheme;
  readonly #defs = new Map<string, number>();
  readonly #classes = new Map<string, string>();

  constructor(theme: CastTheme) {
    this.#theme = theme;
  }

  /** Returns the row's definition id, or undefined if the row is blank. */
  row(line: BufferLine, cols: number, cell: BufferCell): number | undefined {
    let markup = '';
    let run: { col: number; width: number; text: string; style: CellStyle } | undefined;

    const flush = (): void => {
      if (run) markup += this.#run(run.col, run.width, run.text, run.style);
      run = undefined;
    };

    // Only printable ASCII is grouped into runs. A run's `textLength` fixes its
    // total width but spreads any difference evenly over its characters, which
    // is exact for a monospace font's ASCII and wrong for anything the font
    // draws wider or narrower than a cell — an emoji, a CJK glyph, a symbol
    // from a fallback font. Those get a <text> of their own at their column,
    // and overhang it as they would in xterm.
    const isAscii = (text: string): boolean => /^[\x20-\x7e]$/.test(text);

    for (let x = 0; x < cols; x++) {
      line.getCell(x, cell);
      const width = cell.getWidth();
      if (width === 0) continue; // second half of a wide glyph
      const style = this.#style(cell);
      const text = cell.getChars() || ' ';
      if (run && run.style.key === style.key && isAscii(text) && isAscii(run.text.slice(-1))) {
        run.width += width;
        run.text += text;
      } else {
        flush();
        run = { col: x, width, text, style };
      }
    }
    flush();

    if (markup === '') return undefined;
    let id = this.#defs.get(markup);
    if (id === undefined) {
      id = this.#defs.size;
      this.#defs.set(markup, id);
    }
    return id;
  }

  defs(): string {
    let out = '';
    for (const [markup, id] of this.#defs) out += `<g id="r${id}">${markup}</g>`;
    return out;
  }

  css(): string {
    let out = '';
    for (const [rule, name] of this.#classes) out += `.${name}{${rule}}`;
    return out;
  }

  #run(col: number, width: number, text: string, style: CellStyle): string {
    let out = '';
    if (style.bg) {
      out += `<rect x="${num(col * CELL_W)}" width="${num(width * CELL_W)}" height="${LINE_H}" fill="${style.bg}"/>`;
    }
    if (style.invisible) return out;

    const className = this.#className(style);
    const cls = className ? ` class="${className}"` : '';

    // A single non-ASCII cell: placed at its column, drawn at its own width.
    if (!/^[\x20-\x7e]+$/.test(text)) {
      out += `<text x="${num(col * CELL_W)}" y="${BASELINE}"${cls}>${escapeXml(text)}</text>`;
      return out;
    }

    // Trim spaces at both ends so blank stretches cost nothing; the leading
    // ones move the start column instead. ASCII only, so one character is one
    // column here.
    const trimmedStart = text.length - text.trimStart().length;
    const body = text.trim();
    if (body === '') return out;
    const bodyWidth = width - trimmedStart - (text.length - text.trimEnd().length);
    out += `<text x="${num((col + trimmedStart) * CELL_W)}" y="${BASELINE}" textLength="${num(bodyWidth * CELL_W)}"${cls}>${escapeXml(body)}</text>`;
    return out;
  }

  #className(style: CellStyle): string | undefined {
    const rule = style.textRule;
    if (rule === '') return undefined;
    let name = this.#classes.get(rule);
    if (name === undefined) {
      name = `c${this.#classes.size}`;
      this.#classes.set(rule, name);
    }
    return name;
  }

  #style(cell: BufferCell): CellStyle {
    let fg = this.#color(cell.isFgRGB(), cell.isFgPalette(), cell.getFgColor());
    let bg = this.#color(cell.isBgRGB(), cell.isBgPalette(), cell.getBgColor());
    if (cell.isInverse()) {
      [fg, bg] = [bg ?? this.#theme.background, fg ?? this.#theme.foreground];
    }
    const decorations = [
      cell.isUnderline() && 'underline',
      cell.isStrikethrough() && 'line-through',
    ]
      .filter(Boolean)
      .join(' ');
    const rule =
      (fg ? `fill:${fg};` : '') +
      (cell.isBold() ? 'font-weight:bold;' : '') +
      (cell.isItalic() ? 'font-style:italic;' : '') +
      (cell.isDim() ? 'opacity:.5;' : '') +
      (decorations ? `text-decoration:${decorations};` : '');
    const invisible = cell.isInvisible() !== 0;
    return { key: `${rule}|${bg ?? ''}|${invisible}`, textRule: rule, bg, invisible };
  }

  #color(isRgb: boolean, isPalette: boolean, value: number): string | undefined {
    if (isRgb) return `#${value.toString(16).padStart(6, '0')}`;
    if (isPalette) return paletteColor(value, this.#theme.palette);
    return undefined;
  }
}

interface CellStyle {
  key: string;
  textRule: string;
  bg: string | undefined;
  invisible: boolean;
}

/** The xterm 256-colour palette, with the first 16 taken from the theme. */
function paletteColor(index: number, palette: string[]): string {
  if (index < 16) return palette[index] ?? palette[index % 8] ?? '#ffffff';
  if (index < 232) {
    const i = index - 16;
    const level = (n: number): number => (n === 0 ? 0 : 55 + n * 40);
    return rgbHex(level(Math.floor(i / 36)), level(Math.floor(i / 6) % 6), level(i % 6));
  }
  const gray = 8 + (index - 232) * 10;
  return rgbHex(gray, gray, gray);
}

function rgbHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Mixes two #rrggbb colours; `t` = 0 is `a`, 1 is `b`. */
function mix(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number): number =>
    Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const [r, g, bl] = [0, 1, 2].map((i) => Math.round(channel(a, i) * (1 - t) + channel(b, i) * t));
  return rgbHex(r ?? 0, g ?? 0, bl ?? 0);
}

/**
 * XML-escapes `text` for either a text node or a double-quoted attribute value.
 *
 * `"` is in the list because the title reaches `aria-label="…"`: without it a
 * title containing a quote closed the attribute early and the whole document
 * stopped being well-formed XML, which for an SVG means the browser renders
 * nothing at all. Escaping it in text nodes too is harmless — `&quot;` is a
 * plain quote there.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Compact number formatting: at most two decimals, no trailing zeros. */
function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Cursor visibility after `data`, given the state before it (DECTCEM). */
function cursorVisibleAfter(data: string, before: boolean): boolean {
  const hide = data.lastIndexOf('\x1b[?25l');
  const show = data.lastIndexOf('\x1b[?25h');
  if (hide === -1 && show === -1) return before;
  return show > hide;
}

async function collectFrames(
  cast: Cast,
  renderer: RowRenderer,
  minFrameInterval: number,
): Promise<{ frames: Frame[]; cols: number; rows: number }> {
  let cols = cast.header.width;
  let rows = cast.header.height;
  let maxCols = cols;
  let maxRows = rows;
  const terminal = new Terminal({ cols, rows, allowProposedApi: true, scrollback: SCROLLBACK });
  const cell = terminal.buffer.active.getNullCell();
  const write = (data: string): Promise<void> =>
    new Promise<void>((resolve) => terminal.write(data, resolve));

  let cursorVisible = true;
  const frames: Frame[] = [];

  const snapshot = (time: number): void => {
    const buffer = terminal.buffer.active;
    const frame: Frame = {
      time,
      rows: [],
      baseY: buffer.baseY,
      alternate: buffer.type === 'alternate',
    };
    for (let y = 0; y < rows; y++) {
      const line = buffer.getLine(buffer.baseY + y);
      frame.rows.push(line ? renderer.row(line, cols, cell) : undefined);
    }
    if (cursorVisible && buffer.cursorX < cols)
      frame.cursor = { x: buffer.cursorX, y: buffer.cursorY };

    const previous = frames[frames.length - 1];
    if (previous && sameFrame(previous, frame)) return;
    frames.push(frame);
  };

  snapshot(0);

  let groupStart: number | undefined;
  let pending = '';
  const flushGroup = async (): Promise<void> => {
    if (groupStart === undefined) return;
    if (pending.length > 0) await write(pending);
    pending = '';
    snapshot(groupStart);
    groupStart = undefined;
  };

  for (const [time, type, data] of cast.events) {
    if (type !== 'o' && type !== 'r') continue;
    if (groupStart !== undefined && (time - groupStart) * 1000 >= minFrameInterval) {
      await flushGroup();
    }
    groupStart ??= time;
    if (type === 'o') {
      pending += data;
      cursorVisible = cursorVisibleAfter(data, cursorVisible);
      continue;
    }
    const size = parseResize(data);
    if (!size) continue;
    if (pending.length > 0) await write(pending);
    pending = '';
    terminal.resize(size.cols, size.rows);
    cols = size.cols;
    rows = size.rows;
    maxCols = Math.max(maxCols, cols);
    maxRows = Math.max(maxRows, rows);
  }
  await flushGroup();

  terminal.dispose();
  // The first snapshot is time 0 even when the cast's first event is too;
  // two frames at the same instant keep only the later one.
  const deduped = frames.filter((frame, i) => frames[i + 1]?.time !== frame.time);
  return { frames: deduped, cols: maxCols, rows: maxRows };
}

function sameFrame(a: Frame, b: Frame): boolean {
  if (a.rows.length !== b.rows.length) return false;
  if (a.cursor?.x !== b.cursor?.x || a.cursor?.y !== b.cursor?.y) return false;
  return a.rows.every((id, i) => id === b.rows[i]);
}

/** Renders `cast` as an animated SVG document. */
export async function renderSvg(cast: Cast, options: SvgOptions = {}): Promise<string> {
  const chrome = options.chrome ?? true;
  const loopDelay = options.loopDelay ?? 2000;
  const minFrameInterval = options.minFrameInterval ?? 30;
  const theme = cast.header.theme ?? resolveTheme('default');

  const renderer = new RowRenderer(theme);
  const { frames, cols, rows } = await collectFrames(cast, renderer, minFrameInterval);

  const termW = cols * CELL_W;
  const termH = rows * LINE_H;
  const top = chrome ? CHROME_H : PAD;
  const width = termW + PAD * 2;
  const height = top + termH + PAD;
  const title = cast.header.title;

  const last = frames[frames.length - 1];
  const total = (last?.time ?? 0) + loopDelay / 1000;
  const animated = frames.length > 1 && total > 0;

  // Timelines follow buffer lines, not screen rows, the way a terminal does:
  // each line of the normal buffer sits at a fixed place on one tall strip,
  // gets a timeline only if its content changes, and scrolling is a single
  // timeline that moves the whole strip. Typing a command changes one line;
  // printing one scrolls the strip once. A frame-by-frame encoding would
  // repeat every row on screen for each of those. The alternate buffer
  // (full-screen programs) never scrolls, so its rows are fixed to the screen.
  // All timelines share one duration, so they stay on the same clock.
  const pct = (time: number): string => String(Math.round((time / total) * 100_000) / 1000);
  let animation = '';
  let timelines = 0;

  type State<T> = { time: number; value: T };
  /** Appends a state unless it repeats the previous one; timelines start at 0. */
  const push = <T>(states: State<T>[], time: number, value: T, initial: T): void => {
    if (states.length === 0) {
      // A value already there at 0 is the starting state, not a change from `initial`.
      states.push({ time: 0, value: time === 0 ? value : initial });
      if (time === 0) return;
    }
    if (states[states.length - 1]?.value !== value) states.push({ time, value });
  };
  /** Keyframes for `states`; returns the class that runs them. */
  const timeline = <T>(states: State<T>[], declare: (value: T, i: number) => string): string => {
    const name = `k${timelines++}`;
    const steps = states.map((state, i) => `${pct(state.time)}%{${declare(state.value, i)}}`);
    const final = states.length - 1;
    animation += `.${name}{animation-name:${name}}@keyframes ${name}{${steps.join('')}100%{${declare(states[final]?.value as T, final)}}}`;
    return `a ${name}`;
  };
  /** One line at `y`: a plain <use> if it never changes, otherwise a strip of its states. */
  const lineAt = (y: number, states: State<number | undefined>[]): string => {
    if (states.length === 1) {
      const id = states[0]?.value;
      return id === undefined ? '' : `<use href="#r${id}" y="${y}"/>`;
    }
    let strip = '';
    states.forEach((state, i) => {
      if (state.value !== undefined)
        strip += `<use href="#r${state.value}" x="${num(i * termW)}"/>`;
    });
    const cls = timeline(states, (_, i) => `translate:${num(-i * termW)}px`);
    return `<svg y="${y}" width="${num(termW)}" height="${LINE_H}"><g class="${cls}">${strip}</g></svg>`;
  };

  let screen = '';
  if (!animated) {
    last?.rows.forEach((id, y) => {
      if (id !== undefined) screen += `<use href="#r${id}" y="${y * LINE_H}"/>`;
    });
  } else {
    const normalLines = new Map<number, State<number | undefined>[]>();
    const altRows = new Map<number, State<number | undefined>[]>();
    const scroll: State<number>[] = [];
    const mode: State<boolean>[] = [];
    for (const frame of frames) {
      push(mode, frame.time, frame.alternate, false);
      if (frame.alternate) {
        frame.rows.forEach((id, y) => {
          const states = altRows.get(y) ?? [];
          altRows.set(y, states);
          push(states, frame.time, id, undefined);
        });
        continue;
      }
      push(scroll, frame.time, frame.baseY, frames[0]?.baseY ?? 0);
      frame.rows.forEach((id, y) => {
        const index = frame.baseY + y;
        const states = normalLines.get(index) ?? [];
        normalLines.set(index, states);
        push(states, frame.time, id, undefined);
      });
    }

    let normal = '';
    for (const [index, states] of [...normalLines].sort((a, b) => a[0] - b[0])) {
      normal += lineAt(index * LINE_H, states);
    }
    normal =
      scroll.length === 1
        ? (scroll[0]?.value ?? 0) === 0
          ? normal
          : `<g transform="translate(0 ${-(scroll[0]?.value ?? 0) * LINE_H})">${normal}</g>`
        : `<g class="${timeline(scroll, (baseY) => `translate:0 ${-baseY * LINE_H}px`)}">${normal}</g>`;

    if (mode.length === 1) {
      screen = normal;
    } else {
      let alt = '';
      for (const [y, states] of altRows) alt += lineAt(y * LINE_H, states);
      const visible = (show: boolean) => (show ? 'visibility:visible' : 'visibility:hidden');
      screen =
        `<g class="${timeline(mode, (isAlt) => visible(!isAlt))}">${normal}</g>` +
        `<g class="${timeline(mode, (isAlt) => visible(isAlt))}">${alt}</g>`;
    }
  }

  // The cursor is one element that moves, with a timeline of its own.
  const cursorAt = (frame: Frame | undefined): string =>
    frame?.cursor ? `${num(frame.cursor.x * CELL_W)},${frame.cursor.y * LINE_H}` : 'hidden';
  const cursor: State<string>[] = [];
  if (animated) {
    for (const frame of frames) push(cursor, frame.time, cursorAt(frame), cursorAt(frames[0]));
  } else {
    cursor.push({ time: 0, value: cursorAt(last) });
  }
  const cursorRect = `width="${CELL_W}" height="${LINE_H}"`;
  if (cursor.length === 1) {
    const at = cursor[0]?.value ?? 'hidden';
    if (at !== 'hidden') {
      const [x, y] = at.split(',');
      screen += `<rect class="cur" x="${x}" y="${y}" ${cursorRect}/>`;
    }
  } else {
    // `translate` rather than `transform: translate()`: this timeline has a
    // step per keystroke, and it is the largest part of a long demo.
    const hides = cursor.some((state) => state.value === 'hidden');
    const cls = timeline(cursor, (at) => {
      if (at === 'hidden') return 'visibility:hidden';
      const move = `translate:${at.replace(',', 'px ')}px`;
      return hides ? `visibility:visible;${move}` : move;
    });
    screen += `<rect class="cur ${cls}" ${cursorRect}/>`;
  }

  if (animation !== '') {
    // Reduced motion shows the finished screen: every timeline paused at the
    // same instant inside the final hold.
    const hold = (last?.time ?? 0) + (total - (last?.time ?? 0)) / 2;
    animation =
      `.a{animation-duration:${num(total)}s;animation-timing-function:steps(1,end);animation-iteration-count:infinite}` +
      animation +
      `@media (prefers-reduced-motion:reduce){.a{animation-play-state:paused;animation-delay:-${num(hold)}s}}`;
  }

  const css =
    `text{font-family:${FONT_FAMILY};font-size:${FONT_SIZE}px;fill:${theme.foreground};white-space:pre}` +
    `.cur{fill:${theme.cursor};opacity:.6}` +
    renderer.css() +
    animation;

  let frameMarkup = '';
  if (chrome) {
    const bar = mix(theme.background, theme.foreground, 0.08);
    frameMarkup =
      `<rect width="${num(width)}" height="${num(height)}" rx="8" fill="${theme.background}"/>` +
      `<path d="M0 8a8 8 0 0 1 8-8h${num(width - 16)}a8 8 0 0 1 8 8v${CHROME_H - 8}H0z" fill="${bar}"/>` +
      '<circle cx="18" cy="16" r="6" fill="#ff5f57"/><circle cx="38" cy="16" r="6" fill="#febc2e"/><circle cx="58" cy="16" r="6" fill="#28c840"/>' +
      (title
        ? `<text x="${num(width / 2)}" y="20.5" text-anchor="middle" style="font-size:12px;fill:${theme.foreground};opacity:.6">${escapeXml(title)}</text>`
        : '');
  } else {
    frameMarkup = `<rect width="${num(width)}" height="${num(height)}" rx="6" fill="${theme.background}"/>`;
  }

  const label = escapeXml(title ?? 'Terminal demo');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(width)} ${num(height)}" width="${num(width)}" height="${num(height)}" role="img" aria-label="${label}" xml:space="preserve">` +
    `<title>${label}</title>` +
    `<style>${css}</style>` +
    `<defs>${renderer.defs()}</defs>` +
    frameMarkup +
    `<svg x="${PAD}" y="${top}" width="${num(termW)}" height="${termH}">${screen}</svg>` +
    '</svg>\n'
  );
}
