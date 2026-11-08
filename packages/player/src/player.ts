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
import type {
  Cast,
  PlayerHandle,
  PlayerMarker,
  PlayerOptions,
  PlayerState,
  TerminalAdapter,
} from './types.js';
import { createXtermTerminal } from './xterm-adapter.js';

const DEFAULT_LOOP_DELAY_MS = 2000;

const MIN_SPEED = 0.25;
const MAX_SPEED = 4;
const SPEED_STEPS = [0.5, 1, 1.5, 2];
const COPY_CONFIRM_MS = 2000;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(win: Window): boolean {
  return win.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

function clampSpeed(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_SPEED, Math.max(MIN_SPEED, value)) : 1;
}

export function mount(host: HTMLElement, cast: Cast, options: PlayerOptions = {}): PlayerHandle {
  const doc = host.ownerDocument;
  const win = doc.defaultView ?? globalThis.window;

  injectStyles(doc);

  // What mount() overwrites on the host, so destroy() can put it back. Notably
  // --castwright-reserved-height: the Astro component sets it inline, and a
  // re-inserted element must not lose its pre-hydration reservation.
  const savedAttrs = ['role', 'aria-label', 'data-chrome', 'data-controls'].map(
    (name) => [name, host.getAttribute(name)] as const,
  );
  const savedStyles = [
    '--castwright-cast-bg',
    '--castwright-natural-width',
    '--castwright-reserved-height',
  ].map((name) => [name, host.style.getPropertyValue(name)] as const);

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
    speedControl: options.speedControl === true,
    // Without a Clipboard API (insecure context, old browser) the button would
    // do nothing, so it is not offered.
    copy: options.copy === true && typeof win.navigator?.clipboard?.writeText === 'function',
  });

  // So the window body matches the terminal rather than the page behind it —
  // see the note on .castwright-screen in styles.ts.
  if (cast.header.theme) {
    host.style.setProperty('--castwright-cast-bg', cast.header.theme.background);
  }

  host.setAttribute('role', 'group');
  host.setAttribute(
    'aria-label',
    options.label ?? (title ? `Terminal demo: ${title}` : 'Terminal demo'),
  );

  const initialCols = options.cols ?? cast.header.width;
  const initialRows = options.rows ?? cast.header.height;
  const createTerminal = options.createTerminal ?? createXtermTerminal;
  const terminal: TerminalAdapter = createTerminal({
    cols: initialCols,
    rows: initialRows,
    ...(cast.header.theme ? { theme: cast.header.theme } : {}),
  });
  terminal.open(chrome.scaler);

  // xterm measures glyphs on open; fit once now and again whenever the page
  // gives the element a different width.
  const fit = () => {
    terminal.fit?.();
    fitToWidth(host, chrome.screen, chrome.scaler);
    // The pre-hydration height reservation has done its job; the measured
    // height is authoritative from here, and keeping the estimate would leave a
    // gap whenever the terminal is scaled down to fit a narrow screen.
    host.style.setProperty('--castwright-reserved-height', '0');
  };
  fit();

  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => fit());
  resizeObserver?.observe(host);

  // What replay writes into: an asciicast `r` event resizes the terminal, and
  // the scale has to follow or the frame keeps the previous size's geometry.
  // Only a real size change touches the terminal: a no-op resize plus refit on
  // every seek/restart/loop broke the 24-bit colour repair under a strict
  // style-src on Linux (caught by the e2e suite).
  let currentCols = initialCols;
  let currentRows = initialRows;
  const sink = {
    write: (data: string) => terminal.write(data),
    resize: (cols: number, rows: number) => {
      if (cols === currentCols && rows === currentRows) return;
      currentCols = cols;
      currentRows = rows;
      terminal.resize?.(cols, rows);
      fitToWidth(host, chrome.screen, chrome.scaler);
    },
  };

  /** RIS does not change the geometry, so undo any `r` event's resize too. */
  function resetTerminal(): void {
    terminal.reset();
    sink.resize(initialCols, initialRows);
  }

  let state: PlayerState = 'idle';
  let elapsedMs = 0;
  let cursor: ReplayCursor = { index: 0, resizeIndex: 0 };
  let rafId: number | undefined;
  let loopTimer: ReturnType<typeof setTimeout> | undefined;
  let startedAt = 0;
  let destroyed = false;
  let announcedSecond = -1;
  let speed = clampSpeed(options.speed ?? 1);

  chrome.progress.setAttribute('aria-valuemax', String(Math.floor(durationMs / 1000)));

  const markers: readonly PlayerMarker[] = Object.freeze(
    timeline.markers.map((m) => Object.freeze({ label: m.data, time: m.timeMs / 1000 })),
  );
  // Decorative ticks: the slider's value text names the marker for assistive
  // technology, so the ticks themselves stay out of the accessibility tree.
  if (controls !== 'none' && durationMs > 0) {
    for (const marker of markers) {
      const tick = doc.createElement('i');
      tick.className = 'castwright-marker';
      tick.setAttribute('aria-hidden', 'true');
      tick.style.setProperty(
        'inset-inline-start',
        `${(Math.min(1, (marker.time * 1000) / durationMs) * 100).toFixed(2)}%`,
      );
      chrome.progress.appendChild(tick);
    }
  }

  /** The latest marker at or before `seconds`, for the slider's value text. */
  function markerAt(seconds: number): PlayerMarker | undefined {
    let found: PlayerMarker | undefined;
    for (const marker of markers) if (marker.time <= seconds) found = marker;
    return found;
  }

  /** DOM events on the host, so integrations need not poll `.player`. */
  function emit(name: string): void {
    host.dispatchEvent(
      new win.CustomEvent(`castwright:${name}`, {
        bubbles: true,
        detail: { time: elapsedMs / 1000 },
      }),
    );
  }

  function render(): void {
    if (controls === 'none') return;
    const ratio = durationMs === 0 ? 1 : Math.min(1, elapsedMs / durationMs);
    chrome.progressBar.style.width = `${(ratio * 100).toFixed(2)}%`;
    chrome.time.textContent = `${formatClock(elapsedMs / 1000)} / ${formatClock(durationMs / 1000)}`;
    // Whole seconds only: a slider changing 60 times a second would flood
    // assistive technology.
    const second = Math.floor(elapsedMs / 1000);
    if (second !== announcedSecond) {
      announcedSecond = second;
      chrome.progress.setAttribute('aria-valuenow', String(second));
      const marker = markerAt(elapsedMs / 1000);
      chrome.progress.setAttribute(
        'aria-valuetext',
        `${formatClock(elapsedMs / 1000)} of ${formatClock(durationMs / 1000)}` +
          (marker ? `, marker: ${marker.label}` : ''),
      );
    }
    const playing = state === 'playing';
    chrome.playPause.textContent = playing ? '⏸' : '▶';
    chrome.playPause.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    if (chrome.speed) {
      chrome.speed.textContent = `${speed}×`;
      chrome.speed.setAttribute('aria-label', `Playback speed ${speed}×, change`);
    }
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
    emit('ended');
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
    elapsedMs = (performance.now() - startedAt) * speed;

    cursor = replay(timeline, cursor, elapsedMs, sink);

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
    startedAt = performance.now() - elapsedMs / speed;
    state = 'playing';
    render();
    rafId = win.requestAnimationFrame(tick);
    emit('play');
  }

  function pause(): void {
    if (destroyed) return;
    // Finished with a loop pending: pausing cancels the hold timer, so a demo
    // that scrolled away during the hold does not restart off-screen.
    if (state === 'finished') clearLoopTimer();
    if (state !== 'playing') return;
    cancelFrame();
    state = 'paused';
    render();
    emit('pause');
  }

  function restart(): void {
    if (destroyed) return;
    cancelFrame();
    clearLoopTimer();
    resetTerminal();
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
    resetTerminal();
    cursor = replay(timeline, { index: 0, resizeIndex: 0 }, targetMs, sink);
    elapsedMs = targetMs;
    state = wasPlaying ? 'paused' : state === 'finished' ? 'paused' : state;
    render();
    if (wasPlaying) play();
  }

  function showFinalFrame(): void {
    cancelFrame();
    clearLoopTimer();
    resetTerminal();
    cursor = replay(timeline, { index: 0, resizeIndex: 0 }, durationMs, sink);
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

  function setSpeed(value: number): void {
    speed = clampSpeed(value);
    // Re-anchor so the current cast position survives the rate change.
    if (state === 'playing') startedAt = performance.now() - elapsedMs / speed;
    render();
  }

  chrome.speed?.addEventListener('click', () => {
    setSpeed(SPEED_STEPS.find((step) => step > speed) ?? SPEED_STEPS[0] ?? 1);
  });

  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  chrome.copy?.addEventListener('click', () => {
    const status = chrome.copyStatus;
    const announce = (text: string) => {
      if (!status || destroyed) return;
      status.textContent = text;
      if (copyTimer !== undefined) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copyTimer = undefined;
        status.textContent = '';
      }, COPY_CONFIRM_MS);
    };
    win.navigator.clipboard.writeText(chrome.fallback.textContent ?? '').then(
      () => announce('Copied'),
      () => announce('Copy failed'),
    );
  });

  const SEEK_STEP_SECONDS = 5;
  const DRAG_SEEK_INTERVAL_MS = 40;

  function seekToClientX(clientX: number): void {
    const rect = chrome.progress.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seek(ratio * (durationMs / 1000));
  }

  // Drag scrubbing: pointer events cover mouse, touch and pen. The pointer is
  // captured so the drag survives leaving the 4px track, playback pauses while
  // dragging (each seek is a full replay) and the previous play state returns
  // on release. Keyboard seeking above is untouched.
  let drag: { pointerId: number; wasPlaying: boolean; lastSeekAt: number } | undefined;
  let swallowClick = false;
  const progress = chrome.progress;

  progress.addEventListener('pointerdown', (event) => {
    if (destroyed || drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag = {
      pointerId: event.pointerId,
      wasPlaying: state === 'playing',
      lastSeekAt: performance.now(),
    };
    progress.setPointerCapture?.(event.pointerId);
    pause();
    seekToClientX(event.clientX);
  });
  progress.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const now = performance.now();
    if (now - drag.lastSeekAt < DRAG_SEEK_INTERVAL_MS) return;
    drag.lastSeekAt = now;
    seekToClientX(event.clientX);
  });
  function endDrag(event: PointerEvent, commit: boolean): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { wasPlaying } = drag;
    drag = undefined;
    if (progress.hasPointerCapture?.(event.pointerId))
      progress.releasePointerCapture(event.pointerId);
    if (commit) {
      seekToClientX(event.clientX);
      // The click that follows pointerup would seek and resume a second time.
      swallowClick = true;
      setTimeout(() => {
        swallowClick = false;
      }, 0);
    }
    if (wasPlaying) play();
  }
  progress.addEventListener('pointerup', (event) => endDrag(event, true));
  progress.addEventListener('pointercancel', (event) => endDrag(event, false));
  progress.addEventListener('click', (event) => {
    if (swallowClick) return;
    seekToClientX(event.clientX);
  });

  // Shortcuts apply only while focus is inside the demo, so they never capture
  // keys page-wide (WCAG 2.1.4) and, being ordinary keydowns, trap nothing: Tab
  // still leaves. Space is left to the buttons, which already handle it.
  const onKeydown = (event: KeyboardEvent) => {
    if (destroyed || event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as Element | null;
    const onSlider = target === chrome.progress;
    const nowSeconds = elapsedMs / 1000;
    switch (event.key) {
      case ' ':
      case 'k':
        if (event.key === ' ' && !onSlider) return;
        if (state === 'playing') pause();
        else play();
        break;
      case 'ArrowLeft':
        seek(nowSeconds - SEEK_STEP_SECONDS);
        break;
      case 'ArrowRight':
        seek(nowSeconds + SEEK_STEP_SECONDS);
        break;
      case 'Home':
        seek(0);
        break;
      case 'End':
        seek(durationMs / 1000);
        break;
      default:
        return;
    }
    event.preventDefault();
  };
  if (controls !== 'none') host.addEventListener('keydown', onKeydown);

  // rAF stops in a hidden tab but the clock does not, so on return every missed
  // event would land in one frame. Pause while hidden and resume on return; a
  // loop hold is cancelled too, or its timer would restart the demo unseen.
  let resumeOnShow = false;
  const onVisibilityChange = () => {
    if (destroyed) return;
    if (doc.hidden) {
      if (state === 'playing' || (state === 'finished' && loopTimer !== undefined)) {
        resumeOnShow = true;
        pause();
      }
    } else if (resumeOnShow) {
      resumeOnShow = false;
      play();
    }
  };
  doc.addEventListener('visibilitychange', onVisibilityChange);

  // Reduced motion switched on while the demo is running: stop animating and
  // show the end state, as if it had been on at load. An explicit
  // `reducedMotion` option pins the mode, so the query is not consulted.
  const motionQuery =
    options.reducedMotion === undefined ? win.matchMedia?.(REDUCED_MOTION_QUERY) : undefined;
  const onMotionChange = (event: MediaQueryListEvent) => {
    if (!event.matches || destroyed) return;
    resumeOnShow = false;
    showFinalFrame();
  };
  motionQuery?.addEventListener?.('change', onMotionChange);

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
    get markers() {
      return markers;
    },
    seekToMarker(label: string): boolean {
      const marker = markers.find((m) => m.label === label);
      if (!marker) return false;
      seek(marker.time);
      return true;
    },
    get speed() {
      return speed;
    },
    set speed(value: number) {
      setSpeed(value);
    },
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
      if (copyTimer !== undefined) clearTimeout(copyTimer);
      resizeObserver?.disconnect();
      motionQuery?.removeEventListener?.('change', onMotionChange);
      doc.removeEventListener('visibilitychange', onVisibilityChange);
      host.removeEventListener('keydown', onKeydown);
      for (const [name, value] of savedAttrs) {
        if (value === null) host.removeAttribute(name);
        else host.setAttribute(name, value);
      }
      for (const [name, value] of savedStyles) {
        if (value === '') host.style.removeProperty(name);
        else host.style.setProperty(name, value);
      }
      terminal.dispose();
    },
  };
}

export { buildTimeline, type Timeline, toXtermTheme };
