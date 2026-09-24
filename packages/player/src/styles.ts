// The player's CSS, injected once per document.
//
// There is no shadow DOM (see meta/decisions.md — xterm.js misbehaves inside
// one), so every class is `castwright-` prefixed and every knob a site might
// want is a CSS custom property on the host element. The trade-off this buys
// back: an aggressive global reset can reach into the terminal, which the
// documentation calls out.

import { XTERM_CSS } from './generated/xterm-css.js';

const STYLE_MARKER = 'data-castwright-styles';

export const PLAYER_CSS = `
castwright-demo {
  --castwright-radius: 10px;
  --castwright-chrome-bg: #2a2a32;
  --castwright-chrome-fg: #b8b8c4;
  --castwright-shadow: 0 8px 30px rgb(0 0 0 / 0.22);
  --castwright-font: ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono",
    "Fira Code", Menlo, Consolas, monospace;
  --castwright-padding: 12px;
  --castwright-accent: #7aa2f7;

  display: block;
  /* As a grid or flex item the default min-width:auto resolves to min-content,
     which for an 80-column terminal is ~700px — the element would blow its
     container out of the page. Shrinking is always allowed; the terminal inside
     scales to fit instead (see fit.ts). */
  min-width: 0;
  /* --castwright-natural-width is the terminal's unscaled width, set by the
     player (fit.ts): the frame hugs the terminal on a wide page and shrinks
     with a narrow one. Pages align the element themselves, e.g. with
     margin-inline: auto. */
  max-width: min(100%, var(--castwright-natural-width, 100%));
  /* Set by the Astro component from the cast's row count, so the page reserves
     the terminal's space before hydration and does not shift when the real one
     appears. Cleared by the player once it has measured for real. */
  min-height: var(--castwright-reserved-height, 0);
  border-radius: var(--castwright-radius);
  /* Positioning context for controls="hover", which overlays the transport
     rather than reserving a row for it. */
  position: relative;
  overflow: hidden;
  box-shadow: var(--castwright-shadow);
  font-family: var(--castwright-font);
  line-height: normal;
}

.castwright-chrome {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--castwright-chrome-bg);
  color: var(--castwright-chrome-fg);
  font-size: 12px;
  font-family: system-ui, sans-serif;
}

.castwright-dots { display: flex; gap: 6px; flex: none; }
.castwright-dots i { width: 11px; height: 11px; border-radius: 50%; background: #5a5a66; }
.castwright-dots i:nth-child(1) { background: #ff5f57; }
.castwright-dots i:nth-child(2) { background: #febc2e; }
.castwright-dots i:nth-child(3) { background: #28c840; }

.castwright-title {
  flex: 1;
  min-width: 0;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.castwright-screen {
  padding: var(--castwright-padding);
  /* The terminal keeps its authored geometry and is never scaled up, so on a
     wide page it does not fill the window. Without a background of its own the
     remaining area showed whatever was behind the element, and the window read
     as a frame with a hole in it. The cast's own background is the right colour
     for it; --castwright-screen-bg lets a page override that. */
  background: var(--castwright-screen-bg, var(--castwright-cast-bg, var(--castwright-chrome-bg)));
  overflow: hidden;
  /* Without this the terminal's ~700px min-content width propagates up through
     every ancestor, and any grid or flex container above (whose items default to
     min-width:auto) is forced wider than the viewport. overflow:hidden alone
     does not stop intrinsic sizing; containment does. */
  contain: inline-size;
}
.castwright-scaler {
  transform-origin: top left;
  width: max-content;
}

.castwright-transport {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--castwright-chrome-bg);
  color: var(--castwright-chrome-fg);
  font-family: system-ui, sans-serif;
  font-size: 12px;
}

.castwright-btn {
  appearance: none;
  border: 0;
  border-radius: 4px;
  padding: 4px 8px;
  min-width: 32px;
  min-height: 32px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.castwright-btn:hover { background: rgb(255 255 255 / 0.1); }
.castwright-btn:focus-visible {
  outline: 2px solid var(--castwright-accent);
  outline-offset: 2px;
}

.castwright-progress {
  flex: 1;
  min-width: 0;
  height: 4px;
  border-radius: 2px;
  background: rgb(255 255 255 / 0.15);
  overflow: hidden;
}
.castwright-progress-bar {
  height: 100%;
  width: 0%;
  background: var(--castwright-accent);
}

.castwright-time { flex: none; font-variant-numeric: tabular-nums; }

/* The accessibility fallback: present for assistive technology and copy/paste,
   invisible once the live terminal is running. Not display:none — that would
   remove it from the accessibility tree, which is the whole point of it. */
.castwright-fallback {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* The host page's own styling must not make the fallback a scrollable region:
   a site with a global pre{overflow-x:auto} rule would otherwise turn it into one
   has no keyboard access, which axe flags (scrollable-region-focusable) and
   which is a real barrier, not a false positive. The wrapper above already
   clips, so there is nothing for these to spill into. */
.castwright-fallback pre,
.castwright-fallback code {
  overflow: visible;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
}

/* controls="hover" — the transport overlays the terminal and appears on hover
   or keyboard focus.

   Deliberately opacity and not display:none or visibility:hidden: the pause
   control has to stay in the accessibility tree and stay focusable, because a
   demo that autoplays in a loop is motion a visitor must be able to stop
   (WCAG 2.2 SC 2.2.2). Hidden to the eye, present to everything else — the same
   bargain a skip link makes. */
castwright-demo[data-controls="hover"] .castwright-transport {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  opacity: 0;
  transition: opacity 150ms ease;
}
castwright-demo[data-controls="hover"]:hover .castwright-transport,
castwright-demo[data-controls="hover"]:focus-within .castwright-transport {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .castwright-progress-bar,
  castwright-demo[data-controls="hover"] .castwright-transport {
    transition: none;
  }
}
`;

/**
 * Injects xterm.js's stylesheet followed by the player's own, once per
 * document. xterm's CSS is inlined (see scripts/generate-xterm-css.mjs) so a
 * plain HTML page needs exactly one <script> tag and no second file.
 */
export function injectStyles(doc: Document): void {
  if (doc.querySelector(`style[${STYLE_MARKER}]`)) return;
  const style = doc.createElement('style');
  style.setAttribute(STYLE_MARKER, '');
  style.textContent = `${XTERM_CSS}\n${PLAYER_CSS}`;
  doc.head.appendChild(style);
}
