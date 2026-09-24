// <castwright-demo> — the documented way to put a demo on a page.
//
// Light DOM (see meta/decisions.md), attribute-configured, and lazy: xterm.js
// is not instantiated until the element scrolls into view, so a documentation
// page with six demos does not pay for six terminals up front.

import { deserializeCast } from './cast-io.js';
import { mount } from './player.js';
import type { Cast, ChromeMode, ControlsMode, PlayerHandle, PlayerOptions } from './types.js';

const ELEMENT_NAME = 'castwright-demo';

function boolAttr(el: Element, name: string): boolean {
  const value = el.getAttribute(name);
  return value !== null && value !== 'false';
}

interface NumBounds {
  min?: number;
  max?: number;
  integer?: boolean;
}

/**
 * A numeric attribute, or undefined if it is absent or out of range. An
 * unusable value is reported and then ignored: a typo in `cols` should leave
 * the demo at the geometry the cast was authored at, not hand xterm a 0.
 */
function numAttr(el: Element, name: string, bounds: NumBounds = {}): number | undefined {
  const raw = el.getAttribute(name);
  if (raw === null) return undefined;

  const value = Number(raw);
  const reject = (why: string): undefined => {
    console.warn(`castwright: ignoring ${name}="${raw}" — ${why}`);
    return undefined;
  };

  if (raw.trim().length === 0 || !Number.isFinite(value)) return reject('not a number');
  if (bounds.integer && !Number.isInteger(value)) return reject('must be a whole number');
  if (bounds.min !== undefined && value < bounds.min)
    return reject(`must be at least ${bounds.min}`);
  if (bounds.max !== undefined && value > bounds.max)
    return reject(`must be at most ${bounds.max}`);
  return value;
}

/** Matches the parser's own ceiling on `terminal.cols` / `terminal.rows`. */
const MAX_TERMINAL_COLS = 1000;
const MAX_TERMINAL_ROWS = 1000;
/** A loop hold longer than this is a typo, not an intent. */
const MAX_LOOP_DELAY_MS = 3_600_000;

// Server-side rendering evaluates this module in Node, where `HTMLElement` does
// not exist and `class X extends undefined` is a ReferenceError at *definition*
// time — long before anyone could have guarded a call. The stub is never
// instantiated: without `customElements` the element is never registered, so
// the only thing that renders on the server is the light-DOM fallback, which is
// the design. See "Server-side rendering" in README.md.
const ElementBase: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

export class CastwrightDemoElement extends ElementBase {
  /** Set programmatically to skip both the inline script and the fetch. */
  cast?: Cast;

  #handle: PlayerHandle | undefined;
  #observer: IntersectionObserver | undefined;
  #started = false;
  #resumeOnVisible = false;
  /** Bumped on every teardown, so a fetch still in flight knows it is stale. */
  #generation = 0;
  #abort: AbortController | undefined;
  /** The light-DOM children as they were before mount() rearranged them. */
  #fallback: ChildNode[] | undefined;

  connectedCallback(): void {
    if (this.#started) return;

    // Lazy init: wait for first intersection where the API exists. Where it
    // doesn't (older browsers, some test environments), start immediately —
    // eager is a worse default than broken.
    if (typeof IntersectionObserver === 'undefined') {
      void this.#start();
      return;
    }

    this.#observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!this.#started) void this.#start();
            else if (this.#resumeOnVisible) {
              this.#resumeOnVisible = false;
              this.#handle?.play();
            }
          } else if (this.#handle?.state === 'playing') {
            // A page full of demos animating off-screen is a battery complaint.
            this.#resumeOnVisible = true;
            this.#handle.pause();
          }
        }
      },
      { rootMargin: '128px' },
    );
    this.#observer.observe(this);
  }

  disconnectedCallback(): void {
    this.#observer?.disconnect();
    this.#observer = undefined;
    // Order matters: bump first, so an in-flight #start() sees a stale
    // generation even if the abort does not reach it before it resolves.
    this.#generation++;
    this.#abort?.abort();
    this.#abort = undefined;
    this.#handle?.destroy();
    this.#handle = undefined;
    this.#started = false;
    this.#resumeOnVisible = false;
    this.#restoreFallback();
  }

  /**
   * Puts the original children back where mount() found them. Without this a
   * remove/re-insert would nest the whole previous rendering — chrome and all —
   * inside the next fallback, once per cycle.
   */
  #restoreFallback(): void {
    if (!this.#fallback) return;
    this.replaceChildren(...this.#fallback);
    this.#fallback = undefined;
  }

  get player(): PlayerHandle | undefined {
    return this.#handle;
  }

  async #start(): Promise<void> {
    this.#started = true;
    const generation = this.#generation;
    const abort = new AbortController();
    this.#abort = abort;

    let cast: Cast;
    try {
      cast = await this.#resolveCast(abort.signal);
    } catch (error) {
      // Being torn down mid-fetch is not a failure worth reporting.
      if (abort.signal.aborted) return;
      // A demo that cannot load must not take the page down with it. Leave the
      // fallback children exactly as they are — they are the content.
      console.error('castwright: failed to load cast', error);
      return;
    }
    // Removed and re-inserted while the fetch was in flight: the newer #start()
    // owns the element now, and mounting here would give it a second player.
    if (generation !== this.#generation || !this.isConnected) return;

    this.#fallback = [...this.childNodes];
    this.#handle = mount(this, cast, this.#options());
  }

  /**
   * Three tiers, in order of cost — see docs/reference/player.md:
   *   1. a `cast` property set by JS,
   *   2. an inlined <script type="application/json"> (what the Vite plugin and
   *      the Astro component emit at build time — no fetch, no parser),
   *   3. `src`, fetched at runtime, for pages with no bundler.
   */
  async #resolveCast(signal: AbortSignal): Promise<Cast> {
    if (this.cast) return this.cast;

    const inline = this.querySelector('script[type="application/json"][data-castwright-cast]');
    if (inline?.textContent) return deserializeCast(inline.textContent);

    const src = this.getAttribute('src');
    if (src) {
      const response = await fetch(src, { signal });
      if (!response.ok) {
        throw new Error(`castwright: fetching ${src} failed with ${response.status}`);
      }
      return deserializeCast(await response.text());
    }

    throw new Error('castwright: no cast — set a `cast` property, an inline <script>, or src=');
  }

  #options(): PlayerOptions {
    const options: PlayerOptions = {
      autoplay: boolAttr(this, 'autoplay'),
      loop: boolAttr(this, 'loop'),
    };
    const chrome = this.getAttribute('chrome');
    const controls = this.getAttribute('controls');
    if (chrome === 'none' || chrome === 'window') options.chrome = chrome as ChromeMode;
    if (controls === 'none' || controls === 'hover' || controls === 'visible') {
      options.controls = controls as ControlsMode;
    }

    const title = this.getAttribute('title-text') ?? undefined;
    const label = this.getAttribute('label') ?? undefined;
    const cols = numAttr(this, 'cols', { integer: true, min: 1, max: MAX_TERMINAL_COLS });
    const rows = numAttr(this, 'rows', { integer: true, min: 1, max: MAX_TERMINAL_ROWS });
    const poster = this.#poster();
    const loopDelay = numAttr(this, 'loop-delay', { min: 0, max: MAX_LOOP_DELAY_MS });

    if (title !== undefined) options.title = title;
    if (label !== undefined) options.label = label;
    if (cols !== undefined) options.cols = cols;
    if (rows !== undefined) options.rows = rows;
    if (poster !== undefined) options.poster = poster;
    if (loopDelay !== undefined) options.loopDelayMs = loopDelay;
    return options;
  }

  /** `poster="3.5"` — seconds. Marker-based posters wait until markers are used. */
  #poster(): number | undefined {
    return numAttr(this, 'poster', { min: 0 });
  }
}

/**
 * Registers the element. Safe to call more than once: two copies of this
 * package on one page must degrade, not throw.
 */
export function defineCastwrightDemo(name = ELEMENT_NAME): void {
  if (typeof customElements === 'undefined') return;
  if (customElements.get(name)) return;
  customElements.define(name, CastwrightDemoElement);
}
