// The DOM around the terminal: window chrome, transport controls, and the
// wrapper that keeps the element's original light-DOM children as the
// accessibility fallback. No shadow DOM — see meta/decisions.md.

import type { ChromeMode, ControlsMode } from './types.js';

export interface ChromeOptions {
  title: string | undefined;
  chrome: ChromeMode;
  controls: ControlsMode;
}

export interface Chrome {
  root: HTMLElement;
  /** The padded box that clips and sizes the terminal. */
  screen: HTMLElement;
  /** The transform target inside `screen` — the terminal opens into this. */
  scaler: HTMLElement;
  playPause: HTMLButtonElement;
  restart: HTMLButtonElement;
  progressBar: HTMLElement;
  time: HTMLElement;
  fallback: HTMLElement;
}

function button(doc: Document, action: string, label: string, glyph: string): HTMLButtonElement {
  const el = doc.createElement('button');
  el.type = 'button';
  el.className = 'castwright-btn';
  el.setAttribute('data-action', action);
  el.setAttribute('aria-label', label);
  el.textContent = glyph;
  return el;
}

/**
 * Rebuilds `host`'s contents: existing children move into a visually hidden
 * fallback, and the chrome is appended around a fresh screen container.
 */
export function buildChrome(host: HTMLElement, options: ChromeOptions): Chrome {
  const doc = host.ownerDocument;
  // Styling hooks, so both the attribute path and mount() options land in the
  // same place for CSS to react to.
  host.setAttribute('data-chrome', options.chrome);
  host.setAttribute('data-controls', options.controls);

  const fallback = doc.createElement('div');
  fallback.className = 'castwright-fallback';
  while (host.firstChild) fallback.appendChild(host.firstChild);

  const bar = doc.createElement('div');
  bar.className = 'castwright-chrome';

  const dots = doc.createElement('span');
  dots.className = 'castwright-dots';
  dots.setAttribute('aria-hidden', 'true');
  dots.append(doc.createElement('i'), doc.createElement('i'), doc.createElement('i'));

  const titleEl = doc.createElement('span');
  titleEl.className = 'castwright-title';
  titleEl.setAttribute('aria-hidden', 'true'); // decorative; the name comes from `label`
  titleEl.textContent = options.title ?? '';

  bar.append(dots, titleEl);

  // The live terminal is presentational: the fallback carries the real text, so
  // exposing both would make a screen reader read the same content twice.
  const screen = doc.createElement('div');
  screen.className = 'castwright-screen';
  screen.setAttribute('aria-hidden', 'true');

  // A demo authored at 80 columns is physically wider than a phone. Rather than
  // overflow (which cuts off the controls) or reflow (which would re-wrap lines
  // the author composed), the terminal keeps its authored geometry and the
  // whole thing is scaled down to fit — see fitToWidth() in player.ts.
  const scaler = doc.createElement('div');
  scaler.className = 'castwright-scaler';
  screen.appendChild(scaler);

  const transport = doc.createElement('div');
  transport.className = 'castwright-transport';

  const playPause = button(doc, 'playpause', 'Play', '▶');
  const restart = button(doc, 'restart', 'Restart', '↻');

  const progress = doc.createElement('div');
  progress.className = 'castwright-progress';
  // Visual only. A progress bar updated 60×/s would spam assistive technology
  // with no benefit — the fallback text is the accessible content.
  progress.setAttribute('aria-hidden', 'true');
  const progressBar = doc.createElement('div');
  progressBar.className = 'castwright-progress-bar';
  progress.appendChild(progressBar);

  const time = doc.createElement('span');
  time.className = 'castwright-time';
  time.setAttribute('aria-hidden', 'true');

  transport.append(playPause, restart, progress, time);

  if (options.chrome === 'window') host.append(bar);
  host.append(screen);
  if (options.controls !== 'none') host.append(transport);
  host.append(fallback);

  return { root: host, screen, scaler, playPause, restart, progressBar, time, fallback };
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
