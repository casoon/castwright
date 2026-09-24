// Fitting an authored terminal into whatever width the page gives it.
//
// A demo composed at 80 columns is wider than a phone. The two alternatives
// both lose something real: overflowing cuts off the transport controls, and
// re-flowing to fewer columns re-wraps lines the author composed deliberately.
// Scaling keeps the authored geometry and the whole frame visible; on a narrow
// screen the text ends up small, which is inherent — a demo meant to be read on
// a phone should be authored with fewer columns, and the docs say so.

/** Never scales up: the authored size is the design intent, not a minimum. */
export function computeScale(availableWidth: number, naturalWidth: number): number {
  if (!Number.isFinite(availableWidth) || !Number.isFinite(naturalWidth)) return 1;
  if (availableWidth <= 0 || naturalWidth <= 0) return 1;
  return Math.min(1, availableWidth / naturalWidth);
}

/**
 * Measures the unscaled terminal, then scales it to the available width and
 * sets the container's height to match, so the layout reserves the right space.
 * Also publishes the natural width on the host, so the window frame hugs the
 * terminal instead of stretching across a wide page.
 */
export function fitToWidth(host: HTMLElement, screen: HTMLElement, scaler: HTMLElement): void {
  scaler.style.transform = '';
  const naturalWidth = scaler.offsetWidth;
  const naturalHeight = scaler.offsetHeight;

  // No layout yet (display:none, before first paint, or a DOM implementation
  // that does not compute boxes at all, as in unit tests). Nothing to fit.
  if (naturalWidth === 0 || naturalHeight === 0) return;

  const style = screen.ownerDocument.defaultView?.getComputedStyle(screen);
  const padding =
    (Number.parseFloat(style?.paddingLeft ?? '0') || 0) +
    (Number.parseFloat(style?.paddingRight ?? '0') || 0);
  const available = screen.clientWidth - padding;

  const scale = computeScale(available, naturalWidth);
  scaler.style.transform = scale === 1 ? '' : `scale(${scale})`;
  screen.style.height = `${Math.ceil(naturalHeight * scale)}px`;

  // The host caps its max-width at this (see styles.ts), so on a wide page the
  // frame ends where the terminal does. A cap rather than a width: the host
  // still shrinks with a narrow container, which is what triggers the scaling
  // above, and the value does not depend on the host's current size, so the
  // ResizeObserver cannot feed back into it.
  host.style.setProperty('--castwright-natural-width', `${naturalWidth + padding}px`);
}
