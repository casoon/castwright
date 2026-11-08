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

function freshHost() {
  document.body.innerHTML = '';
  host = document.createElement('castwright-demo');
  document.body.appendChild(host);
}

beforeEach(() => {
  vi.useFakeTimers();
  document.head.innerHTML = '';
  freshHost();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('mount — playback speed', () => {
  it('speed 2 plays the cast twice as fast; duration stays in cast time', async () => {
    const handle = mountWith({ autoplay: true, speed: 2 });
    expect(handle.speed).toBe(2);
    expect(handle.durationSeconds).toBe(1);
    await vi.advanceTimersByTimeAsync(120);
    expect(terminal.screen()).toBe('$ ls');
    await vi.advanceTimersByTimeAsync(450);
    expect(handle.state).toBe('finished');
  });

  it('changing speed mid-playback keeps the cast position', async () => {
    const handle = mountWith({ autoplay: true });
    await vi.advanceTimersByTimeAsync(200);
    handle.speed = 0.5;
    await vi.advanceTimersByTimeAsync(100);
    // 200ms + 100ms at half speed = 250ms of cast time
    expect(terminal.screen()).toBe('$ ls');
    handle.speed = 4;
    await vi.advanceTimersByTimeAsync(300);
    expect(handle.state).toBe('finished');
  });

  it('seek stays in cast time at any speed', () => {
    mountWith({ speed: 2 }).seek(0.25);
    expect(terminal.screen()).toBe('$ ls');
  });

  it('does not scale the loop delay', async () => {
    const handle = mountWith({ autoplay: true, loop: true, loopDelayMs: 1000, speed: 4 });
    await vi.advanceTimersByTimeAsync(400);
    expect(handle.state).toBe('finished');
    await vi.advanceTimersByTimeAsync(700);
    expect(handle.state).toBe('finished');
    await vi.advanceTimersByTimeAsync(300);
    expect(handle.state).toBe('playing');
  });

  it('clamps out-of-range speeds', () => {
    const handle = mountWith();
    handle.speed = 100;
    expect(handle.speed).toBe(4);
    handle.speed = 0;
    expect(handle.speed).toBe(0.25);
  });

  it('the speed button is labelled and cycles through the steps', () => {
    const handle = mountWith({ speedControl: true });
    const btn = host.querySelector<HTMLButtonElement>('[data-action="speed"]');
    expect(btn?.tagName).toBe('BUTTON');
    expect(btn?.getAttribute('aria-label')).toBe('Playback speed 1×, change');
    btn?.click();
    expect(handle.speed).toBe(1.5);
    expect(btn?.textContent).toBe('1.5×');
    btn?.click();
    btn?.click();
    expect(handle.speed).toBe(0.5);
  });

  it('has no speed button by default or with controls="none"', () => {
    mountWith();
    expect(host.querySelector('[data-action="speed"]')).toBeNull();
    freshHost();
    mountWith({ speedControl: true, controls: 'none' });
    expect(host.querySelector('[data-action="speed"]')).toBeNull();
  });
});

describe('mount — copy button', () => {
  let writeText: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('copies the fallback text and confirms in a live region', async () => {
    host.innerHTML = '<pre>$ ls\ndone</pre>';
    mountWith({ copy: true });
    const btn = host.querySelector<HTMLButtonElement>('[data-action="copy"]');
    const status = host.querySelector('.castwright-copy-status');
    expect(btn?.getAttribute('aria-label')).toBe('Copy terminal text');
    expect(status?.getAttribute('aria-live')).toBe('polite');
    btn?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(writeText).toHaveBeenCalledWith('$ ls\ndone');
    expect(status?.textContent).toBe('Copied');
    await vi.advanceTimersByTimeAsync(2100);
    expect(status?.textContent).toBe('');
  });

  it('reports a rejected write', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    mountWith({ copy: true });
    host.querySelector<HTMLButtonElement>('[data-action="copy"]')?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(host.querySelector('.castwright-copy-status')?.textContent).toBe('Copy failed');
  });

  it('renders nothing where the Clipboard API is unavailable', () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    mountWith({ copy: true });
    expect(host.querySelector('[data-action="copy"]')).toBeNull();
  });

  it('is off by default and hidden with controls="none"', () => {
    mountWith();
    expect(host.querySelector('[data-action="copy"]')).toBeNull();
    freshHost();
    mountWith({ copy: true, controls: 'none' });
    expect(host.querySelector('[data-action="copy"]')).toBeNull();
  });
});
