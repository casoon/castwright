// Helpers for <TerminalDemo />, kept out of the .astro file so they can be
// unit-tested and shared with other Astro components that inline a cast.

/**
 * Serialises `value` for a `<script type="application/json">` body.
 *
 * `JSON.stringify` leaves `<` alone, so a string containing `</script>` or
 * `<!--` would end the data block early and the rest would be parsed as HTML.
 * `<` becomes `<`, which JSON.parse reads back as the same character.
 * U+2028/2029 are escaped as well: valid in JSON, line terminators in
 * JavaScript.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// Pixel heights of the player's chrome (packages/player/src/styles.ts),
// measured in a browser rather than guessed. The terminal's row height is
// xterm's default (15px font, line-height 1), 18px with the default monospace stack.
const ROW_PX = 18;
/** .castwright-screen: 12px padding above and below. */
const SCREEN_PADDING_PX = 24;
/** .castwright-chrome: 8px padding above and below plus the title line. */
const TITLE_BAR_PX = 30;
/** .castwright-transport: 6px padding above and below plus a 32px button. */
const TRANSPORT_PX = 44;

export interface ReservedHeightOptions {
  /** The cast's own row count, when the cast is known at build time. */
  castRows: number | undefined;
  /** The `rows` prop, which wins over the cast's. */
  rows: number | undefined;
  chrome: 'window' | 'none' | undefined;
  controls: 'visible' | 'hover' | 'none' | undefined;
}

/**
 * The height the player will have at its authored size, in px, or `undefined`
 * when the row count is unknown (a `src` cast without a `rows` prop).
 *
 * On a container narrower than the terminal the player scales it down, which
 * depends on the viewport and cannot be known here; the reservation is then
 * too tall until the player measures for real.
 */
export function reservedHeightPx(options: ReservedHeightOptions): number | undefined {
  const rows = options.rows ?? options.castRows;
  if (!rows) return undefined;
  let height = rows * ROW_PX + SCREEN_PADDING_PX;
  if (options.chrome !== 'none') height += TITLE_BAR_PX;
  // controls="hover" overlays the terminal instead of taking a row.
  if (options.controls !== 'hover' && options.controls !== 'none') height += TRANSPORT_PX;
  return height;
}
