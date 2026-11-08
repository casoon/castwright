import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../player.js';
import { PLAYER_CSS } from '../styles.js';
import type { Cast } from '../types.js';
import { createFakeTerminal, type FakeTerminal } from './fake-terminal.js';

const cast: Cast = {
  header: { version: 2, width: 80, height: 24, title: 'Demo' },
  events: [
    [0, 'o', '$ '],
    [0.1, 'o', 'l'],
    [0.2, 'o', 's'],
    [0.3, 'o', '\r\n'],
    [1, 'o', 'done\r\n'],
  ],
};

let host: HTMLElement;
let terminal: FakeTerminal;

function mountWith(options = {}) {
  return mount(host, cast, {
    reducedMotion: false,
    createTerminal: (init) => {
      terminal = createFakeTerminal(init);
      return terminal;
    },
    ...options,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  host = document.createElement('castwright-demo');
  document.body.appendChild(host);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mount — structure', () => {
  it('builds chrome, screen and transport, and keeps existing children as the fallback', () => {
    host.innerHTML = '<pre>$ ls\ndone</pre>';
    mountWith();

    expect(host.querySelector('.castwright-chrome')).not.toBeNull();
    expect(host.querySelector('.castwright-screen')).not.toBeNull();
    expect(host.querySelector('.castwright-transport')).not.toBeNull();

    const fallback = host.querySelector('.castwright-fallback');
    expect(fallback?.textContent).toBe('$ ls\ndone');
    expect(fallback?.querySelector('pre')).not.toBeNull();
  });

  it('injects xterm and player CSS once per document', () => {
    mountWith();
    const second = document.createElement('castwright-demo');
    document.body.appendChild(second);
    mount(second, cast, { reducedMotion: false, createTerminal: createFakeTerminal });

    const ours = document.adoptedStyleSheets.filter((sheet) =>
      [...sheet.cssRules].some((rule) => rule.cssText.includes('.castwright-chrome')),
    );
    expect(ours).toHaveLength(1);
  });

  it('passes the cast dimensions and theme to the terminal', () => {
    mount(
      host,
      { ...cast, header: { ...cast.header, width: 90, height: 20 } },
      {
        reducedMotion: false,
        createTerminal: (init) => {
          terminal = createFakeTerminal(init);
          return terminal;
        },
      },
    );
    expect(terminal.init.cols).toBe(90);
    expect(terminal.init.rows).toBe(20);
  });
});

describe('mount — accessibility', () => {
  it('names the whole demo as a group, defaulting to the cast title', () => {
    mountWith();
    expect(host.getAttribute('role')).toBe('group');
    expect(host.getAttribute('aria-label')).toBe('Terminal demo: Demo');
  });

  it('prefers an explicit label over the derived one', () => {
    mountWith({ label: 'Installing the CLI' });
    expect(host.getAttribute('aria-label')).toBe('Installing the CLI');
  });

  it('hides the live terminal from assistive technology — the fallback is the content', () => {
    host.innerHTML = '<pre>result</pre>';
    mountWith();
    expect(host.querySelector('.castwright-screen')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.castwright-fallback')?.hasAttribute('aria-hidden')).toBe(false);
  });

  it('gives the transport real buttons with labels that track state', () => {
    const handle = mountWith();
    const playPause = host.querySelector<HTMLButtonElement>('[data-action="playpause"]');
    expect(playPause?.tagName).toBe('BUTTON');
    expect(playPause?.type).toBe('button');
    expect(playPause?.getAttribute('aria-label')).toBe('Play');

    handle.play();
    expect(playPause?.getAttribute('aria-label')).toBe('Pause');

    handle.pause();
    expect(playPause?.getAttribute('aria-label')).toBe('Play');
  });

  it('renders the final frame immediately under prefers-reduced-motion, without autoplay', () => {
    const handle = mount(host, cast, {
      reducedMotion: true,
      autoplay: true,
      createTerminal: (init) => {
        terminal = createFakeTerminal(init);
        return terminal;
      },
    });
    expect(handle.state).toBe('finished');
    expect(terminal.screen()).toBe('$ ls\r\ndone\r\n');
  });
});

describe('mount — playback', () => {
  it('starts idle and writes nothing until played', () => {
    const handle = mountWith();
    expect(handle.state).toBe('idle');
    expect(terminal.writes).toEqual([]);
  });

  it('autoplay starts playing', () => {
    const handle = mountWith({ autoplay: true });
    expect(handle.state).toBe('playing');
  });

  it('writes events as their time arrives, and finishes at the end', async () => {
    const handle = mountWith({ autoplay: true });

    await vi.advanceTimersByTimeAsync(120);
    expect(terminal.screen()).toBe('$ l');
    expect(handle.state).toBe('playing');

    await vi.advanceTimersByTimeAsync(1000);
    expect(terminal.screen()).toBe('$ ls\r\ndone\r\n');
    expect(handle.state).toBe('finished');
  });

  it('pause stops the clock; play resumes from where it stopped', async () => {
    const handle = mountWith({ autoplay: true });
    await vi.advanceTimersByTimeAsync(120);
    handle.pause();

    const written = terminal.screen();
    await vi.advanceTimersByTimeAsync(500);
    expect(terminal.screen()).toBe(written);
    expect(handle.state).toBe('paused');

    handle.play();
    await vi.advanceTimersByTimeAsync(1000);
    expect(handle.state).toBe('finished');
  });

  it('restart resets the terminal and the clock', async () => {
    const handle = mountWith({ autoplay: true });
    await vi.advanceTimersByTimeAsync(500);
    handle.restart();

    expect(terminal.resets).toBeGreaterThan(0);
    expect(terminal.screen()).toBe('');
    expect(handle.state).toBe('idle');
  });

  it('exposes the duration in seconds', () => {
    expect(mountWith().durationSeconds).toBe(1);
  });
});

describe('mount — seek is replay, not skip', () => {
  it('resets and re-feeds every byte up to the target', () => {
    const handle = mountWith();
    handle.seek(0.3);

    expect(terminal.resets).toBeGreaterThan(0);
    // Everything up to 0.3s, in order — not just the event at 0.3s.
    expect(terminal.screen()).toBe('$ ls\r\n');
  });

  it('does not re-emit already-played events after seeking forward', async () => {
    const handle = mountWith({ autoplay: true });
    await vi.advanceTimersByTimeAsync(1200);
    handle.seek(0.2);
    expect(terminal.screen()).toBe('$ ls');
  });

  it('clamps a seek past the end to the duration', () => {
    const handle = mountWith();
    handle.seek(99);
    expect(terminal.screen()).toBe('$ ls\r\ndone\r\n');
  });

  it('clamps a negative seek to zero', () => {
    const handle = mountWith();
    handle.seek(-5);
    expect(terminal.screen()).toBe('$ ');
  });
});

describe('mount — poster', () => {
  it('shows the frame at the given second as the initial state, without playing', () => {
    const handle = mountWith({ poster: 0.2 });
    expect(handle.state).toBe('idle');
    expect(terminal.screen()).toBe('$ ls');
  });
});

describe('mount — loop', () => {
  it('holds on the final frame, then restarts and plays again', async () => {
    const handle = mountWith({ autoplay: true, loop: true, loopDelayMs: 500 });

    await vi.advanceTimersByTimeAsync(1100);
    expect(handle.state).toBe('finished');

    const resetsAtEnd = terminal.resets;
    await vi.advanceTimersByTimeAsync(200);
    expect(terminal.resets).toBe(resetsAtEnd); // still holding

    await vi.advanceTimersByTimeAsync(400);
    expect(terminal.resets).toBeGreaterThan(resetsAtEnd);
    expect(handle.state).toBe('playing');
  });

  it('pausing during the loop hold cancels the restart', async () => {
    const handle = mountWith({ autoplay: true, loop: true, loopDelayMs: 500 });
    await vi.advanceTimersByTimeAsync(1100);
    expect(handle.state).toBe('finished');

    handle.pause();
    await vi.advanceTimersByTimeAsync(5000);
    expect(handle.state).toBe('finished');
  });

  it('does not loop when loop is off', async () => {
    const handle = mountWith({ autoplay: true });
    await vi.advanceTimersByTimeAsync(3000);
    expect(handle.state).toBe('finished');
  });
});

describe('mount — transport clicks', () => {
  it('play/pause button toggles playback', () => {
    const handle = mountWith();
    const button = host.querySelector<HTMLButtonElement>('[data-action="playpause"]');

    button?.click();
    expect(handle.state).toBe('playing');
    button?.click();
    expect(handle.state).toBe('paused');
  });

  it('restart button clears the screen and plays from the beginning again', async () => {
    const handle = mountWith({ autoplay: true });
    await vi.advanceTimersByTimeAsync(500);
    expect(terminal.screen()).toBe('$ ls\r\n');

    host.querySelector<HTMLButtonElement>('[data-action="restart"]')?.click();
    expect(handle.state).toBe('playing');
    expect(terminal.screen()).toBe(''); // reset happened; the first frame has not ticked yet

    await vi.advanceTimersByTimeAsync(120);
    expect(terminal.screen()).toBe('$ l');
  });
});

describe('mount — destroy', () => {
  it('disposes the terminal and stops a running loop', async () => {
    const handle = mountWith({ autoplay: true, loop: true, loopDelayMs: 10 });
    await vi.advanceTimersByTimeAsync(1100);
    handle.destroy();

    const resets = terminal.resets;
    await vi.advanceTimersByTimeAsync(1000);
    expect(terminal.disposed).toBe(true);
    expect(terminal.resets).toBe(resets);
  });
});

describe('mount — chrome and controls modes', () => {
  it('renders the window chrome and a visible transport by default', () => {
    mountWith();
    expect(host.querySelector('.castwright-chrome')).not.toBeNull();
    expect(host.querySelector('.castwright-transport')).not.toBeNull();
    expect(host.getAttribute('data-chrome')).toBe('window');
    expect(host.getAttribute('data-controls')).toBe('visible');
  });

  it('chrome: none drops the title bar but keeps the terminal and transport', () => {
    mountWith({ chrome: 'none' });
    expect(host.querySelector('.castwright-chrome')).toBeNull();
    expect(host.querySelector('.castwright-screen')).not.toBeNull();
    expect(host.querySelector('.castwright-transport')).not.toBeNull();
  });

  it('controls: hover keeps the pause control in the DOM and focusable', () => {
    mountWith({ controls: 'hover' });
    const button = host.querySelector<HTMLButtonElement>('[data-action="playpause"]');

    // Present, real, and reachable — it is only *visually* hidden, by opacity,
    // which is what keeps an autoplaying loop compliant with WCAG 2.2 SC 2.2.2.
    expect(button).not.toBeNull();
    expect(button?.tagName).toBe('BUTTON');
    expect(host.getAttribute('data-controls')).toBe('hover');
    expect(host.querySelector('.castwright-transport')?.hasAttribute('hidden')).toBe(false);
  });

  it('controls: hover still drives playback from the button', () => {
    const handle = mountWith({ controls: 'hover' });
    host.querySelector<HTMLButtonElement>('[data-action="playpause"]')?.click();
    expect(handle.state).toBe('playing');
  });

  it('controls: none removes the transport entirely and still plays', async () => {
    const handle = mountWith({ controls: 'none', autoplay: true });
    expect(host.querySelector('.castwright-transport')).toBeNull();

    await vi.advanceTimersByTimeAsync(1200);
    expect(handle.state).toBe('finished');
    expect(terminal.screen()).toBe('$ ls\r\ndone\r\n');
  });

  it('warns when controls: none autoplays a loop — motion that never stops', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mountWith({ controls: 'none', autoplay: true, loop: true });
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/2\.2\.2/);
    warn.mockRestore();
  });

  it('stays quiet for controls: none on a short one-shot demo — SC 2.2.2 does not apply', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The fixture cast is 1s long: under the five-second threshold, no loop.
    mountWith({ controls: 'none', autoplay: true });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns for controls: none on a one-shot demo longer than five seconds', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const long: Cast = {
      header: cast.header,
      events: [
        [0, 'o', 'a'],
        [9, 'o', 'b'],
      ],
    };
    mount(host, long, {
      reducedMotion: false,
      controls: 'none',
      autoplay: true,
      createTerminal: createFakeTerminal,
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/9\.0s/);
    warn.mockRestore();
  });

  it('stays quiet without autoplay, however long the demo is — nothing starts on its own', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const long: Cast = {
      header: cast.header,
      events: [
        [0, 'o', 'a'],
        [30, 'o', 'b'],
      ],
    };
    mount(host, long, {
      reducedMotion: false,
      controls: 'none',
      loop: true,
      createTerminal: createFakeTerminal,
    });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not warn for controls: hover with autoplay and loop — that combination is fine', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mountWith({ controls: 'hover', autoplay: true, loop: true });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('mount — the window body', () => {
  it("takes the cast's own background, so a terminal narrower than the window is not a hole", () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    mount(
      host,
      {
        header: {
          version: 2,
          width: 40,
          height: 6,
          theme: {
            foreground: '#cdd6f4',
            background: '#1e1e2e',
            cursor: '#f5e0dc',
            palette: [],
          },
        },
        events: [[0, 'o', 'hi']],
      },
      { createTerminal: (init) => createFakeTerminal(init) },
    );
    expect(host.style.getPropertyValue('--castwright-cast-bg')).toBe('#1e1e2e');
  });

  it('sets nothing for a cast without a theme, so the chrome colour is used', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    mount(
      host,
      { header: { version: 2, width: 40, height: 6 }, events: [[0, 'o', 'hi']] },
      { createTerminal: (init) => createFakeTerminal(init) },
    );
    expect(host.style.getPropertyValue('--castwright-cast-bg')).toBe('');
  });
});

describe('mount — terminal size after r events', () => {
  const resizeCast: Cast = {
    header: { version: 2, width: 80, height: 24 },
    events: [
      [0, 'o', 'a'],
      [0.1, 'r', '120x40'],
      [0.2, 'o', 'b'],
    ],
  };

  it('restores the authored size when seek/restart replays from the start', () => {
    const handle = mount(host, resizeCast, {
      reducedMotion: false,
      createTerminal: (init) => {
        terminal = createFakeTerminal(init);
        return terminal;
      },
    });
    handle.seek(0.2);
    expect(terminal.resizes.at(-1)).toEqual([120, 40]);

    handle.seek(0.05);
    expect(terminal.resizes.at(-1)).toEqual([80, 24]);

    handle.seek(0.2);
    handle.restart();
    expect(terminal.resizes.at(-1)).toEqual([80, 24]);
  });

  it('restores the size to cols/rows overrides, not the header', () => {
    const handle = mount(host, resizeCast, {
      reducedMotion: false,
      cols: 100,
      rows: 30,
      createTerminal: (init) => {
        terminal = createFakeTerminal(init);
        return terminal;
      },
    });
    handle.seek(0.2);
    handle.seek(0);
    expect(terminal.resizes.at(-1)).toEqual([100, 30]);
  });
});

describe('mount — prefers-reduced-motion changing at runtime', () => {
  function stubMotionQuery() {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const query = {
      matches: false,
      addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) =>
        listeners.delete(fn),
    };
    vi.stubGlobal('matchMedia', () => query);
    window.matchMedia = (() => query) as unknown as typeof window.matchMedia;
    return {
      listeners,
      change(matches: boolean) {
        query.matches = matches;
        for (const fn of [...listeners]) fn({ matches } as MediaQueryListEvent);
      },
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it('stops a looping demo and shows the final frame', async () => {
    const motion = stubMotionQuery();
    const handle = mountWith({
      autoplay: true,
      loop: true,
      loopDelayMs: 100,
      reducedMotion: undefined,
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(handle.state).toBe('playing');

    motion.change(true);
    expect(handle.state).toBe('finished');
    expect(terminal.screen()).toBe('$ ls\r\ndone\r\n');

    await vi.advanceTimersByTimeAsync(5000);
    expect(handle.state).toBe('finished');
  });

  it('cancels a pending loop restart', async () => {
    const motion = stubMotionQuery();
    const handle = mountWith({
      autoplay: true,
      loop: true,
      loopDelayMs: 500,
      reducedMotion: undefined,
    });
    await vi.advanceTimersByTimeAsync(1100);
    motion.change(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(handle.state).toBe('finished');
  });

  it('removes its listener on destroy', () => {
    const motion = stubMotionQuery();
    const handle = mountWith({ reducedMotion: undefined });
    expect(motion.listeners.size).toBe(1);
    handle.destroy();
    expect(motion.listeners.size).toBe(0);
  });
});

describe('mount — hidden tabs', () => {
  function setHidden(hidden: boolean) {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  afterEach(() => {
    Reflect.deleteProperty(document, 'hidden');
  });

  it('pauses while the tab is hidden and resumes without dumping the missed time', async () => {
    const handle = mountWith({ autoplay: true });
    await vi.advanceTimersByTimeAsync(200);
    setHidden(true);
    expect(handle.state).toBe('paused');

    await vi.advanceTimersByTimeAsync(60_000);
    setHidden(false);
    expect(handle.state).toBe('playing');
    expect(terminal.screen()).not.toContain('done');
  });

  it('does not restart a loop while hidden', async () => {
    const handle = mountWith({ autoplay: true, loop: true, loopDelayMs: 500 });
    await vi.advanceTimersByTimeAsync(1100);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(handle.state).toBe('finished');
    setHidden(false);
    expect(handle.state).toBe('playing');
  });

  it('stops listening on destroy', async () => {
    const handle = mountWith({ autoplay: true });
    handle.destroy();
    setHidden(true);
    setHidden(false);
    expect(handle.state).toBe('playing');
  });
});

describe('mount — destroy cleans the host', () => {
  it('restores the attributes and custom properties mount() set', () => {
    host.setAttribute('aria-label', 'mine');
    host.style.setProperty('--castwright-reserved-height', '300px');
    const handle = mountWith();
    expect(host.getAttribute('role')).toBe('group');
    expect(host.style.getPropertyValue('--castwright-reserved-height')).toBe('0');

    handle.destroy();
    expect(host.hasAttribute('role')).toBe(false);
    expect(host.hasAttribute('data-chrome')).toBe(false);
    expect(host.hasAttribute('data-controls')).toBe(false);
    expect(host.getAttribute('aria-label')).toBe('mine');
    expect(host.style.getPropertyValue('--castwright-reserved-height')).toBe('300px');
    expect(host.style.getPropertyValue('--castwright-cast-bg')).toBe('');
  });
});

describe('mount — seek bar, keyboard and events', () => {
  function slider(): HTMLElement {
    return host.querySelector('[role="slider"]') as HTMLElement;
  }
  function key(target: Element, k: string) {
    const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }

  it('exposes the progress bar as a named, focusable slider with value text', async () => {
    mountWith({ autoplay: true });
    await vi.advanceTimersByTimeAsync(500);
    const el = slider();
    expect(el.getAttribute('aria-label')).toBe('Seek');
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.hasAttribute('aria-hidden')).toBe(false);
    expect(el.getAttribute('aria-valuemax')).toBe('1');
    expect(el.getAttribute('aria-valuetext')).toMatch(/of 0:01$/);
  });

  it('seeks to the clicked position', () => {
    const handle = mountWith();
    slider().getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
    slider().dispatchEvent(new MouseEvent('click', { clientX: 50, bubbles: true }));
    expect(terminal.screen()).toBe('$ ls\r\n');
    expect(handle.state).toBe('idle');
  });

  it('seeks with arrow keys, Home and End, and prevents page scroll', () => {
    mountWith();
    key(slider(), 'End');
    expect(terminal.screen()).toBe('$ ls\r\ndone\r\n');
    expect(key(slider(), 'ArrowLeft').defaultPrevented).toBe(true);
    expect(terminal.screen()).toBe('$ ');
    key(slider(), 'ArrowRight');
    expect(terminal.screen()).toBe('$ ls\r\ndone\r\n');
    key(slider(), 'Home');
    expect(terminal.screen()).toBe('$ ');
  });

  it('toggles playback with k anywhere in the demo, and with Space on the slider only', () => {
    const handle = mountWith();
    const button = host.querySelector('[data-action="restart"]') as HTMLElement;
    key(button, 'k');
    expect(handle.state).toBe('playing');
    key(button, ' ');
    expect(handle.state).toBe('playing');
    key(slider(), ' ');
    expect(handle.state).toBe('paused');
  });

  it('ignores shortcuts with modifier keys and leaves Tab alone', () => {
    const handle = mountWith();
    const mod = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
    slider().dispatchEvent(mod);
    expect(handle.state).toBe('idle');
    expect(key(slider(), 'Tab').defaultPrevented).toBe(false);
  });

  it('dispatches play, pause and ended as bubbling CustomEvents on the host', async () => {
    const seen: string[] = [];
    for (const name of ['play', 'pause', 'ended']) {
      document.body.addEventListener(`castwright:${name}`, () => seen.push(name));
    }
    const handle = mountWith();
    handle.play();
    handle.pause();
    handle.play();
    await vi.advanceTimersByTimeAsync(1500);
    expect(seen).toEqual(['play', 'pause', 'play', 'ended']);
  });
});

describe('mount — markers', () => {
  const marked: Cast = {
    header: { version: 2, width: 80, height: 24 },
    events: [
      [0, 'o', 'a'],
      [1, 'm', 'build'],
      [1, 'o', 'b'],
      [3, 'm', 'deploy'],
      [4, 'o', 'c'],
    ],
  };

  function mountMarked(c: Cast) {
    return mount(host, c, {
      reducedMotion: false,
      createTerminal: (init) => {
        terminal = createFakeTerminal(init);
        return terminal;
      },
    });
  }

  it('exposes markers and draws one decorative tick per marker', () => {
    const handle = mountMarked(marked);
    expect(handle.markers).toEqual([
      { label: 'build', time: 1 },
      { label: 'deploy', time: 3 },
    ]);
    const ticks = host.querySelectorAll('.castwright-marker');
    expect(ticks).toHaveLength(2);
    expect((ticks[0] as HTMLElement).getAttribute('aria-hidden')).toBe('true');
    expect((ticks[1] as HTMLElement).style.getPropertyValue('inset-inline-start')).toBe('75.00%');
  });

  it('seeks to a marker by label, and reports an unknown label', () => {
    const handle = mountMarked(marked);
    expect(handle.seekToMarker('deploy')).toBe(true);
    expect(terminal.screen()).toBe('ab');
    expect(handle.seekToMarker('nope')).toBe(false);
    expect(terminal.screen()).toBe('ab');
  });

  it('names the latest marker in the slider value text', () => {
    const handle = mountMarked(marked);
    const slider = host.querySelector('[role="slider"]') as HTMLElement;
    expect(slider.getAttribute('aria-valuetext')).not.toMatch(/marker/);
    handle.seekToMarker('build');
    expect(slider.getAttribute('aria-valuetext')).toBe('0:01 of 0:04, marker: build');
  });

  it('handles a cast without markers', () => {
    const handle = mountMarked(cast);
    expect(handle.markers).toEqual([]);
    expect(host.querySelectorAll('.castwright-marker')).toHaveLength(0);
    expect(handle.seekToMarker('x')).toBe(false);
  });
});

describe('mount — drag scrubbing', () => {
  function slider(): HTMLElement {
    const el = host.querySelector('[role="slider"]') as HTMLElement;
    el.getBoundingClientRect = () => ({ left: 0, width: 100 }) as DOMRect;
    return el;
  }
  function pointer(type: string, clientX: number, init: Record<string, unknown> = {}) {
    const event = new MouseEvent(type, { clientX, bubbles: true, button: 0, ...init });
    Object.assign(event, { pointerId: 1, pointerType: 'touch' });
    return event;
  }

  it('pauses while dragging, seeks continuously and resumes on release', async () => {
    const handle = mountWith({ autoplay: true });
    const el = slider();
    el.dispatchEvent(pointer('pointerdown', 10));
    expect(handle.state).toBe('paused');
    await vi.advanceTimersByTimeAsync(100);
    el.dispatchEvent(pointer('pointermove', 50));
    expect(terminal.screen()).toBe('$ ls\r\n');
    expect(handle.state).toBe('paused');
    el.dispatchEvent(pointer('pointerup', 100));
    expect(terminal.screen()).toBe('$ ls\r\ndone\r\n');
    expect(handle.state).toBe('playing');
  });

  it('keeps a paused player paused after a drag', () => {
    const handle = mountWith();
    const el = slider();
    el.dispatchEvent(pointer('pointerdown', 0));
    el.dispatchEvent(pointer('pointerup', 50));
    expect(handle.state).toBe('idle');
    expect(terminal.screen()).toBe('$ ls\r\n');
  });

  it('throttles move events', async () => {
    mountWith();
    const el = slider();
    el.dispatchEvent(pointer('pointerdown', 0));
    const resets = terminal.resets;
    el.dispatchEvent(pointer('pointermove', 20));
    el.dispatchEvent(pointer('pointermove', 30));
    expect(terminal.resets).toBe(resets);
    await vi.advanceTimersByTimeAsync(50);
    el.dispatchEvent(pointer('pointermove', 100));
    expect(terminal.resets).toBe(resets + 1);
  });

  it('ignores a secondary mouse button and a cancelled drag does not seek', () => {
    const handle = mountWith();
    const el = slider();
    const right = pointer('pointerdown', 50, { button: 2 });
    Object.assign(right, { pointerType: 'mouse' });
    el.dispatchEvent(right);
    expect(terminal.screen()).toBe('');
    el.dispatchEvent(pointer('pointerdown', 0));
    el.dispatchEvent(pointer('pointercancel', 100));
    expect(terminal.screen()).toBe('$ ');
    expect(handle.state).toBe('idle');
  });

  it('declares touch-action so horizontal drags do not scroll the page', () => {
    expect(PLAYER_CSS).toMatch(/\.castwright-progress\s*{[^}]*touch-action:\s*pan-y/);
  });
});
