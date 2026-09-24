// mount(host, cast, options) — the player itself.
//
// The custom element in element.ts is the documented API; this is what it calls
// and what programmatic users can call directly. Lazy initialisation and
// off-screen pausing live in the element, not here: mount() is eager, so it
// stays a plain function you can reason about.

import { buildChrome, formatClock } from './chrome.js';
import { fitToWidth } from './fit.js';
import { injectStyles } from './styles.js';
import { toXtermTheme } from './theme.js';
import { buildTimeline, type ReplayCursor, replay, type Timeline } from './timeline.js';
import type { Cast, PlayerHandle, PlayerOptions, PlayerState, TerminalAdapter } from './types.js';
import { createXtermTerminal } from './xterm-adapter.js';

const DEFAULT_LOOP_DELAY_MS = 2000;

function prefersReducedMotion(win: Window): boolean {
  return win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function mount(host: HTMLElement, cast: Cast, options: PlayerOptions = {}): PlayerHandle {
  const doc = host.ownerDocument;
  const win = doc.defaultView ?? globalThis.window;

  injectStyles(doc);

  const timeline = buildTimeline(cast);
  const durationMs = timeline.durationMs;
  const loopDelayMs = options.loopDelayMs ?? DEFAULT_LOOP_DELAY_MS;
  const reduced = options.reducedMotion ?? prefersReducedMotion(win);

  const title = options.title ?? cast.header.title;
  const controls = options.controls ?? 'visible';

  // WCAG 2.2 SC 2.2.2 applies to motion that starts automatically, lasts longer
  // than five seconds, and sits alongside other content. A loop never ends, and
  // a one-shot demo can still run well past five seconds — so the check is
  // against the cast's real duration, not just the presence of `loop`.
  const WCAG_MOTION_LIMIT_MS = 5000;
  if (
    controls === 'none' &&
    options.autoplay &&
    (options.loop || durationMs > WCAG_MOTION_LIMIT_MS)
  ) {
    const reason = options.loop
      ? 'loops forever'
      : `runs for ${(durationMs / 1000).toFixed(1)}s, past the 5s limit`;
    // Not silently corrected: the author asked for this, and being told once is
    // more useful than having the setting quietly ignored.
    console.warn(
      `castwright: controls="none" with autoplay on a demo that ${reason} leaves motion ` +
        'a visitor cannot stop, which WCAG 2.2 SC 2.2.2 requires them to be able to. ' +
        'Either use controls="hover" — same look, real focus-revealed control — or drop ' +
        'autoplay/loop so the motion is short and finite.',
    );
  }

  const chrome = buildChrome(host, {
    title,
    chrome: options.chrome ?? 'window',
    controls,
  });

  host.setAttribute('role', 'group');
  host.setAttribute(
    'aria-label',
    options.label ?? (title ? `Terminal demo: ${title}` : 'Terminal demo'),
  );

  const createTerminal = options.createTerminal ?? createXtermTerminal;
  const terminal: TerminalAdapter = createTerminal({
    cols: options.cols ?? cast.header.width,
    rows: options.rows ?? cast.header.height,
    ...(cast.header.theme ? { theme: cast.header.theme } : {}),
  });
  terminal.open(chrome.scaler);

  // xterm measures glyphs on open; fit once now and again whenever the page
  // gives the element a different width.
  const fit = () => {
    terminal.fit?.();
    fitToWidth(chrome.screen, chrome.scaler);
    // The pre-hydration height reservation has done its job; the measured
    // height is authoritative from here, and keeping the estimate would leave a
    // gap whenever the terminal is scaled down to fit a narrow screen.
    host.style.setProperty('--castwright-reserved-height', '0');
  };
  fit();

  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => fit());
  resizeObserver?.observe(host);

  let state: PlayerState = 'idle';
  let elapsedMs = 0;
  let cursor: ReplayCursor = { index: 0, resizeIndex: 0 };
  let rafId: number | undefined;
  let loopTimer: ReturnType<typeof setTimeout> | undefined;
  let startedAt = 0;
  let destroyed = false;

  function render(): void {
    if (controls === 'none') return;
    const ratio = durationMs === 0 ? 1 : Math.min(1, elapsedMs / durationMs);
    chrome.progressBar.style.width = `${(ratio * 100).toFixed(2)}%`;
    chrome.time.textContent = `${formatClock(elapsedMs / 1000)} / ${formatClock(durationMs / 1000)}`;
    const playing = state === 'playing';
    chrome.playPause.textContent = playing ? '⏸' : '▶';
    chrome.playPause.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  function cancelFrame(): void {
    if (rafId !== undefined) {
      win.cancelAnimationFrame?.(rafId);
      rafId = undefined;
    }
  }

  function clearLoopTimer(): void {
    if (loopTimer !== undefined) {
      clearTimeout(loopTimer);
      loopTimer = undefined;
    }
  }

  function finish(): void {
    state = 'finished';
    cancelFrame();
    render();
    if (options.loop && !destroyed) {
      loopTimer = setTimeout(() => {
        loopTimer = undefined;
        if (destroyed) return;
        restart();
        play();
      }, loopDelayMs);
    }
  }

  function tick(): void {
    if (destroyed || state !== 'playing') return;
    elapsedMs = Date.now() - startedAt;

    cursor = replay(timeline, cursor, elapsedMs, terminal);

    if (cursor.index >= timeline.output.length && elapsedMs >= durationMs) {
      elapsedMs = durationMs;
      finish();
      return;
    }

    render();
    rafId = win.requestAnimationFrame(tick);
  }

  function play(): void {
    if (destroyed || state === 'playing') return;
    clearLoopTimer();
    if (state === 'finished') restart();
    startedAt = Date.now() - elapsedMs;
    state = 'playing';
    render();
    rafId = win.requestAnimationFrame(tick);
  }

  function pause(): void {
    if (destroyed || state !== 'playing') return;
    cancelFrame();
    state = 'paused';
    render();
  }

  function restart(): void {
    if (destroyed) return;
    cancelFrame();
    clearLoopTimer();
    terminal.reset();
    elapsedMs = 0;
    cursor = { index: 0, resizeIndex: 0 };
    state = 'idle';
    render();
  }

  /** Seek is replay, never a skip: terminal state is cumulative. */
  function seek(seconds: number): void {
    if (destroyed) return;
    const targetMs = Math.max(0, Math.min(durationMs, Math.round(seconds * 1000)));
    const wasPlaying = state === 'playing';
    cancelFrame();
    clearLoopTimer();
    terminal.reset();
    cursor = replay(timeline, { index: 0, resizeIndex: 0 }, targetMs, terminal);
    elapsedMs = targetMs;
    state = wasPlaying ? 'paused' : state === 'finished' ? 'paused' : state;
    render();
    if (wasPlaying) play();
  }

  function showFinalFrame(): void {
    terminal.reset();
    cursor = replay(timeline, { index: 0, resizeIndex: 0 }, durationMs, terminal);
    elapsedMs = durationMs;
    state = 'finished';
    render();
  }

  chrome.playPause.addEventListener('click', () => {
    if (state === 'playing') pause();
    else play();
  });
  chrome.restart.addEventListener('click', () => {
    restart();
    play();
  });

  if (reduced) {
    // No animation: the end state immediately. Controls stay usable for anyone
    // who does want to watch it play — see meta/constraints.md.
    showFinalFrame();
  } else if (options.poster !== undefined) {
    seek(options.poster);
    state = 'idle';
    render();
  } else {
    render();
    if (options.autoplay) play();
  }

  return {
    play,
    pause,
    restart,
    seek,
    get state() {
      return state;
    },
    get durationSeconds() {
      return durationMs / 1000;
    },
    destroy() {
      destroyed = true;
      cancelFrame();
      clearLoopTimer();
      resizeObserver?.disconnect();
      terminal.dispose();
    },
  };
}

export { buildTimeline, type Timeline, toXtermTheme };
