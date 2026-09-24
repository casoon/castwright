import { describe, expect, it } from 'vitest';
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

  it('keeps the host defaults overridable by any page rule', () => {
    expect(PLAYER_CSS).toMatch(/:where\(castwright-demo\)\s*{[^}]*--castwright-radius/);
    expect(PLAYER_CSS).not.toMatch(/^castwright-demo\s*{/m);
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
  it('adopts xterm and player CSS as one constructed sheet, once', () => {
    document.adoptedStyleSheets = [];
    injectStyles(document);
    injectStyles(document);

    expect(document.adoptedStyleSheets).toHaveLength(1);
    const css = [...(document.adoptedStyleSheets[0]?.cssRules ?? [])]
      .map((rule) => rule.cssText)
      .join('\n');
    expect(css).toContain('.xterm');
    expect(css).toContain('.castwright-chrome');
    // No <style> element: that is what a strict style-src would block.
    expect(document.querySelector('style[data-castwright-styles]')).toBeNull();
  });
});
