// Script IR and Cast IR — see the pipeline diagram in meta/architecture.md.
//
// Script is the parsed DSL: semantic, relative timing, no ANSI, no absolute
// timestamps. Cast is asciicast v2: absolute timestamps, raw bytes, no semantics
// left. The compiler (plan item 03) is the only thing that crosses from one to
// the other; nothing else in this codebase should import both "sides" of a
// step — a renderer takes a Cast, never a Script.

// ---------------------------------------------------------------------------
// Styling — shared by the terminal prompt, `type`/`run` text and `output`.
// ---------------------------------------------------------------------------

export type Color =
  | { kind: 'ansi'; index: number }
  | { kind: 'rgb'; r: number; g: number; b: number };

export interface Span {
  text: string;
  fg?: Color;
  bg?: Color;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/** Parsed inline markup (`{green}✓{/}`) — a span list, never a raw string. */
export type Styled = Span[];

// ---------------------------------------------------------------------------
// Terminal configuration
// ---------------------------------------------------------------------------

export type CursorStyle = 'block' | 'bar' | 'underline';

export interface CursorConfig {
  style: CursorStyle;
  blink: boolean;
}

export interface TerminalConfig {
  title?: string;
  cols: number;
  rows: number;
  theme: string;
  /** Supports markup, so a coloured prompt costs nothing extra. */
  prompt: Styled;
  cursor: CursorConfig;
}

export interface StepDefaults {
  /** ms per character for `run` / `type`. */
  speed: number;
  /** ms inserted after a step unless the step overrides it. */
  pause: number;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export type KeyName =
  | 'enter'
  | 'tab'
  | 'escape'
  | 'backspace'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'ctrl+c'
  | 'ctrl+d'
  | 'ctrl+l';

export type Step =
  | { kind: 'type'; text: Styled; speed: number; jitter: number; prompt: boolean; pause: number }
  | { kind: 'key'; key: KeyName; pause: number }
  | { kind: 'output'; text: Styled; lineDelay: number; pause: number }
  | { kind: 'wait'; ms: number }
  | { kind: 'clear'; pause: number }
  | { kind: 'prompt'; prompt: Styled; pause: number }
  | { kind: 'marker'; label: string; pause: number }
  | ShowStep;

/**
 * `show:` — a file's contents, syntax-highlighted. It cannot be compiled as
 * is: `resolveShowSteps()` reads the file and turns the step into an
 * `output` step before `compile()` runs, which keeps the compiler free of I/O.
 * `source` is where the step was written, so an error found only then (a
 * missing file, an unknown language) still points at the YAML.
 */
export interface ShowStep {
  kind: 'show';
  /** As written — relative to the `.terminal.yaml` it appears in. */
  file: string;
  lang?: string;
  /** 1-based, inclusive. */
  lines?: { from: number; to: number };
  /** A Shiki theme name; default: the one matching the terminal theme. */
  theme?: string;
  lineDelay: number;
  pause: number;
  source: { line: number; column: number; text: string };
}

// ---------------------------------------------------------------------------
// Script — the parser's output
// ---------------------------------------------------------------------------

export interface Script {
  version: 1;
  terminal: TerminalConfig;
  defaults: StepDefaults;
  /** Required whenever any `type`/`run` step uses `jitter > 0` — see meta/decisions.md. */
  seed?: number;
  steps: Step[];
}

// ---------------------------------------------------------------------------
// Cast — asciicast v2 (plan item 03 populates this; declared here because
// renderers depend on it and it must not be redeclared elsewhere).
// ---------------------------------------------------------------------------

/**
 * A terminal palette as this codebase models it — xterm's shape, not the file
 * format's. asciicast v2 spells the same thing `{fg, bg, palette: "a:b:…"}` and
 * has no cursor field at all; `compiler/wire.ts` is the only place that crosses
 * between the two, and `serializeCast` is the only thing that writes the
 * on-disk spelling. Keeping the two apart is deliberate — see meta/decisions.md.
 */
export interface CastTheme {
  foreground: string;
  background: string;
  cursor: string;
  palette: string[]; // 8 or 16 entries, #rrggbb
}

export interface CastHeader {
  version: 2;
  width: number;
  height: number;
  title?: string;
  theme?: CastTheme;
  // Deliberately no `timestamp` — see the determinism rule in meta/decisions.md.
}

/**
 * Every event code asciicast v2 defines. The compiler only ever emits `o` and
 * `m`, but a `Cast` can also come from a file someone else recorded, so
 * consumers (the player, the final-frame renderer) must handle all four.
 */
export type CastEvent =
  | [time: number, type: 'o', data: string] // output
  | [time: number, type: 'i', data: string] // input — not replayed, it is not screen output
  | [time: number, type: 'm', data: string] // marker, data is the label
  | [time: number, type: 'r', data: string]; // resize, data is "{COLS}x{ROWS}"

export interface Cast {
  header: CastHeader;
  events: CastEvent[];
}
