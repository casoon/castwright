// The element's own responsibilities: resolving the cast from one of the three
// tiers, deciding *when* to mount, and translating attributes into options.
// What happens after mount() is player.test.ts's job — so mount() is stubbed
// here, which also keeps real xterm.js (and its need for a real browser) out of
// this test file entirely.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerHandle } from '../types.js';

const handles: Array<{ state: string }> = [];

vi.mock('../player.js', () => ({
  mount: vi.fn((host: HTMLElement) => {
    // Mirrors what buildChrome() does to the light DOM: the element's own
    // children become the hidden fallback, and the chrome is appended around a
    // fresh screen. Tests about re-insertion depend on this being faithful.
    const fallback = host.ownerDocument.createElement('div');
    fallback.className = 'castwright-fallback';
    while (host.firstChild) fallback.appendChild(host.firstChild);
    host.appendChild(fallback);

    const screen = host.ownerDocument.createElement('div');
    screen.className = 'castwright-screen';
    host.appendChild(screen);
    const handle = {
      state: 'idle',
      durationSeconds: 0.5,
      play() {
        handle.state = 'playing';
      },
      pause() {
        handle.state = 'paused';
      },
      restart() {},
      seek() {},
      destroy() {},
    };
    handles.push(handle);
    return handle as unknown as PlayerHandle;
  }),
}));

const { mount } = await import('../player.js');
const { CastwrightDemoElement, defineCastwrightDemo } = await import('../element.js');

const cast = {
  header: { version: 2 as const, width: 80, height: 24 },
  events: [[0, 'o', 'hello'] as [number, 'o', string]],
};
const castJson = JSON.stringify(cast);
const castNdjson = '{"version":2,"width":80,"height":24}\n[0,"o","hello"]';

function installFakeIntersectionObserver() {
  const observed: Array<{ trigger: (isIntersecting: boolean) => void }> = [];
  class FakeIO {
    #callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
      this.#callback = callback;
    }
    observe(target: Element) {
      observed.push({
        trigger: (isIntersecting) =>
          this.#callback(
            [{ isIntersecting, target } as unknown as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          ),
      });
    }
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeIO);
  return observed;
}

function element(): HTMLElement & { cast?: unknown; player?: PlayerHandle } {
  return document.createElement('castwright-demo') as HTMLElement & {
    cast?: unknown;
    player?: PlayerHandle;
  };
}

beforeEach(() => {
  defineCastwrightDemo();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  handles.length = 0;
  vi.mocked(mount).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('defineCastwrightDemo', () => {
  it('registers the element', () => {
    expect(customElements.get('castwright-demo')).toBe(CastwrightDemoElement);
  });

  it('is safe to call twice — two copies on a page must degrade, not throw', () => {
    expect(() => {
      defineCastwrightDemo();
      defineCastwrightDemo();
    }).not.toThrow();
  });
});

describe('<castwright-demo> — lazy init', () => {
  it('does not mount until the element intersects', async () => {
    const observed = installFakeIntersectionObserver();
    const el = element();
    el.innerHTML = `<script type="application/json" data-castwright-cast>${castJson}</script>`;
    document.body.appendChild(el);

    expect(mount).not.toHaveBeenCalled();

    observed[0]?.trigger(true);
    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  });

  it('pauses when scrolled out of view and resumes when it comes back', async () => {
    const observed = installFakeIntersectionObserver();
    const el = element();
    el.setAttribute('autoplay', '');
    el.innerHTML = `<script type="application/json" data-castwright-cast>${castJson}</script>`;
    document.body.appendChild(el);

    observed[0]?.trigger(true);
    await vi.waitFor(() => expect(handles).toHaveLength(1));
    el.player?.play();

    observed[0]?.trigger(false);
    expect(el.player?.state).toBe('paused');

    observed[0]?.trigger(true);
    expect(el.player?.state).toBe('playing');
  });

  it('mounts immediately where IntersectionObserver does not exist', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const el = element();
    el.innerHTML = `<script type="application/json" data-castwright-cast>${castJson}</script>`;
    document.body.appendChild(el);

    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  });
});

describe('<castwright-demo> — the three src tiers', () => {
  it('tier 1: a `cast` property set programmatically', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const el = element();
    el.cast = cast;
    document.body.appendChild(el);

    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
    expect(vi.mocked(mount).mock.calls[0]?.[1]).toBe(cast);
  });

  it('tier 2: an inlined <script> — no fetch at all', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const el = element();
    el.innerHTML = `<script type="application/json" data-castwright-cast>${castJson}</script>`;
    document.body.appendChild(el);

    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(vi.mocked(mount).mock.calls[0]?.[1].events).toEqual(cast.events);
  });

  it('tier 3: src, fetched at runtime, accepting a real .cast ndjson file', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, text: async () => castNdjson })),
    );

    const el = element();
    el.setAttribute('src', '/demo.cast');
    document.body.appendChild(el);

    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith('/demo.cast', { signal: expect.any(AbortSignal) });
    expect(vi.mocked(mount).mock.calls[0]?.[1].header.width).toBe(80);
  });
});

describe('<castwright-demo> — failure handling', () => {
  it('leaves the fallback content alone when the cast cannot load', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, text: async () => '' })),
    );
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const el = element();
    el.setAttribute('src', '/missing.cast');
    el.innerHTML = '<pre>the real content</pre>';
    document.body.appendChild(el);

    await vi.waitFor(() => expect(errors).toHaveBeenCalled());
    expect(mount).not.toHaveBeenCalled();
    expect(el.textContent).toContain('the real content');
  });

  it('reports a missing cast source rather than rendering an empty box', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    const el = element();
    document.body.appendChild(el);

    await vi.waitFor(() => expect(errors).toHaveBeenCalled());
    expect(String(errors.mock.calls[0]?.[1])).toMatch(/no cast/);
  });
});

describe('<castwright-demo> — attributes become options', () => {
  it('translates autoplay, loop, label, poster, cols/rows and loop-delay', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const el = element();
    el.cast = cast;
    el.setAttribute('autoplay', '');
    el.setAttribute('loop', '');
    el.setAttribute('label', 'Custom name');
    el.setAttribute('poster', '0.2');
    el.setAttribute('cols', '100');
    el.setAttribute('rows', '30');
    el.setAttribute('loop-delay', '1500');
    document.body.appendChild(el);

    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
    expect(vi.mocked(mount).mock.calls[0]?.[2]).toMatchObject({
      autoplay: true,
      loop: true,
      label: 'Custom name',
      poster: 0.2,
      cols: 100,
      rows: 30,
      loopDelayMs: 1500,
    });
  });

  it('treats a missing boolean attribute as false and omits absent options', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const el = element();
    el.cast = cast;
    document.body.appendChild(el);

    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
    const options = vi.mocked(mount).mock.calls[0]?.[2] ?? {};
    expect(options.autoplay).toBe(false);
    expect(options.loop).toBe(false);
    expect('poster' in options).toBe(false);
    expect('label' in options).toBe(false);
  });

  it('ignores a non-numeric poster rather than mounting a broken player', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const el = element();
    el.cast = cast;
    el.setAttribute('poster', 'halfway');
    document.body.appendChild(el);

    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
    expect('poster' in (vi.mocked(mount).mock.calls[0]?.[2] ?? {})).toBe(false);
  });

  it('destroys the player on disconnect', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const el = element();
    el.cast = cast;
    document.body.appendChild(el);
    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());

    el.remove();
    expect(el.player).toBeUndefined();
  });
});

// Removing and re-inserting an element is ordinary: a router swaps a page, a
// framework moves a node, a details element opens. Both halves of the teardown
// used to be incomplete — the fetch kept running, and the previous rendering
// was left in place for the next mount to wrap again.
describe('<castwright-demo> — removed and re-inserted', () => {
  it('mounts once per insertion and does not nest the previous rendering', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const el = element();
    el.innerHTML = `<pre>the real content</pre><script type="application/json" data-castwright-cast>${castJson}</script>`;
    document.body.appendChild(el);
    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());

    el.remove();
    document.body.appendChild(el);
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(2));

    // One fallback, not one per cycle — and the inline cast is still reachable,
    // which is what lets the second mount find it at all.
    expect(el.querySelectorAll('.castwright-fallback')).toHaveLength(1);
    expect(el.querySelectorAll('.castwright-screen')).toHaveLength(1);
    expect(el.textContent).toContain('the real content');
  });

  it('restores the original children on disconnect', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const el = element();
    el.innerHTML = `<pre>the real content</pre><script type="application/json" data-castwright-cast>${castJson}</script>`;
    const original = [...el.childNodes];
    document.body.appendChild(el);
    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());

    el.remove();
    expect([...el.childNodes]).toEqual(original);
  });

  it('abandons a fetch that is still in flight, and does not mount twice', async () => {
    vi.stubGlobal('IntersectionObserver', undefined);

    const release: Array<(text: string) => void> = [];
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
        if (init?.signal) signals.push(init.signal);
        const text = await new Promise<string>((resolve) => {
          release.push(resolve);
        });
        return { ok: true, status: 200, text: async () => text };
      }),
    );

    const el = element();
    el.setAttribute('src', '/demo.cast');
    document.body.appendChild(el);
    await vi.waitFor(() => expect(signals).toHaveLength(1));

    // Taken out and put back while the first fetch is still pending.
    el.remove();
    document.body.appendChild(el);
    await vi.waitFor(() => expect(signals).toHaveLength(2));

    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    // The abandoned fetch resolving late must not mount anything: the newer
    // #start() owns the element now.
    release[0]?.(castNdjson);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mount).not.toHaveBeenCalled();

    release[1]?.(castNdjson);
    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
  });
});
