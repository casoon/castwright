import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '../player.js';
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

    const styles = document.head.querySelectorAll('style[data-castwright-styles]');
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toContain('.xterm');
    expect(styles[0]?.textContent).toContain('.castwright-chrome');
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
