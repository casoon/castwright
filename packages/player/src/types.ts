// Public types for @casoon/castwright-player.
//
// `Cast` and friends are imported as *types only* from @casoon/castwright — a
// cast is self-describing, so the player never needs core at runtime. See
// "player has no runtime dependency on core" in meta/decisions.md; core is a
// devDependency here, and nothing in this package may import a value from it.

import type { Cast, CastTheme } from '@casoon/castwright';

export type { Cast, CastTheme };

/** The minimum of xterm.js the player uses, behind an interface so tests can fake it. */
export interface TerminalAdapter {
  open(container: HTMLElement): void;
  write(data: string): void;
  /** Full reset — used by seek-as-replay, which replays from a clean screen. */
  reset(): void;
  dispose(): void;
  /** Re-measure after a container resize. Optional: a fake in tests has nothing to fit. */
  fit?(): void;
  /**
   * Change the terminal's geometry, for an asciicast `r` event. Optional —
   * nothing castwright compiles contains one, so a fake need not implement it.
   */
  resize?(cols: number, rows: number): void;
}

export interface TerminalInit {
  cols: number;
  rows: number;
  theme?: CastTheme;
  cursorStyle?: 'block' | 'bar' | 'underline';
  cursorBlink?: boolean;
  fontFamily?: string;
}

/** Window chrome: the title bar with the traffic lights. */
export type ChromeMode = 'window' | 'none';

/**
 * Transport controls.
 *
 * - `visible` — always shown (the default).
 * - `hover` — overlaid on the terminal and revealed on hover or keyboard
 *   focus. Visually absent, but still a real, reachable pause control, which
 *   an autoplaying loop needs (WCAG 2.2 SC 2.2.2).
 * - `none` — no controls at all. Fine for a short demo that does not loop;
 *   with `autoplay` *and* `loop` it leaves motion no one can stop, and the
 *   player says so in the console.
 */
export type ControlsMode = 'visible' | 'hover' | 'none';

export interface PlayerOptions {
  autoplay?: boolean;
  chrome?: ChromeMode;
  controls?: ControlsMode;
  loop?: boolean;
  /** Hold on the final frame before looping. A loop without it reads as a glitch. */
  loopDelayMs?: number;
  /** Shown in the window chrome. Decorative — the accessible name comes from `label`. */
  title?: string;
  /** Accessible name for the whole demo. */
  label?: string;
  /** Seconds to render as the initial frame instead of a blank terminal. */
  poster?: number;
  cols?: number;
  rows?: number;
  /** Injectable for tests and for forcing a mode; defaults to the media query. */
  reducedMotion?: boolean;
  /** Injectable for tests; defaults to the real xterm.js terminal. */
  createTerminal?: (init: TerminalInit) => TerminalAdapter;
}

export type PlayerState = 'idle' | 'playing' | 'paused' | 'finished';

export interface PlayerHandle {
  play(): void;
  pause(): void;
  restart(): void;
  /** Seek is replay: the screen is reset and every byte up to `seconds` is re-fed. */
  seek(seconds: number): void;
  readonly state: PlayerState;
  readonly durationSeconds: number;
  destroy(): void;
}
