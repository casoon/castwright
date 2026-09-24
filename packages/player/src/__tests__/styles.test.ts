import { describe, expect, it } from 'vitest';
import { XTERM_CSS } from '../generated/xterm-css.js';
import { injectStyles, PLAYER_CSS } from '../styles.js';

describe('PLAYER_CSS', () => {
  // The stylesheet is a template literal, and a stray backtick inside one of
  // its comments truncates it silently — which has happened twice. tsc catches
  // the case where the truncation breaks the syntax, but not the case where it
  // leaves valid TypeScript behind. These do.
  it('has balanced braces', () => {
    const open = (PLAYER_CSS.match(/{/g) ?? []).length;
    const close = (PLAYER_CSS.match(/}/g) ?? []).length;
    expect(open).toBe(close);
  });

  it('contains every selector the player relies on', () => {
    for (const selector of [
      'castwright-demo',
      '.castwright-chrome',
      '.castwright-screen',
      '.castwright-scaler',
      '.castwright-transport',
      '.castwright-btn',
      '.castwright-progress',
      '.castwright-fallback',
    ]) {
      expect(PLAYER_CSS).toContain(selector);
    }
  });

  it("keeps the fallback out of the accessibility tree's way but in it", () => {
    // Not display:none — that would remove it from the accessibility tree,
    // which is the entire point of the fallback.
    expect(PLAYER_CSS).not.toMatch(/\.castwright-fallback\s*{[^}]*display:\s*none/);
    expect(PLAYER_CSS).toMatch(/\.castwright-fallback\s*{[^}]*clip-path/);
  });

  it('stops a host page from making the fallback a scrollable region', () => {
    expect(PLAYER_CSS).toMatch(/\.castwright-fallback pre[\s,][^}]*overflow:\s*visible/s);
  });
});

describe('injectStyles', () => {
  it('injects xterm and player CSS together, once', () => {
    document.head.innerHTML = '';
    injectStyles(document);
    injectStyles(document);

    const styles = document.head.querySelectorAll('style[data-castwright-styles]');
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toContain(XTERM_CSS.slice(0, 40));
    expect(styles[0]?.textContent).toContain('.castwright-chrome');
  });
});
