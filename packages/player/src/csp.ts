// Keeps xterm.js's runtime styling alive under a Content-Security-Policy
// without 'unsafe-inline' for styles (a hash-based policy such as Astro's).
//
// xterm's DOM renderer styles itself two ways a strict `style-src` blocks:
// <style> elements whose text depends on the theme and the measured cell size
// (so no hash can be computed ahead of time), and `setAttribute('style', …)`
// on the spans of 24-bit-colour cells. Both are repaired here without touching
// xterm: every <style> is mirrored into a constructed stylesheet, and a style
// attribute the browser refused is re-applied through the CSSOM. Neither
// route is subject to `style-src`. Where the policy allows inline styles both
// repairs are no-ops in effect — the mirrored rules are identical, and an
// applied style attribute is left alone.

import { createSheet } from './styles.js';

/** Starts repairing styles under `root`; returns the function that stops it. */
export function repairInlineStyles(root: HTMLElement): () => void {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  // No constructed stylesheets — no route around the policy either.
  if (!win || !createSheet(doc, '')) return () => {};

  const mirrors = new Map<HTMLStyleElement, CSSStyleSheet>();

  const mirror = (style: HTMLStyleElement): void => {
    const css = style.textContent ?? '';
    const existing = mirrors.get(style);
    if (existing) {
      existing.replaceSync(css);
      return;
    }
    const sheet = createSheet(doc, css);
    if (!sheet) return;
    mirrors.set(style, sheet);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  };

  const unmirror = (style: HTMLStyleElement): void => {
    const sheet = mirrors.get(style);
    if (!sheet) return;
    mirrors.delete(style);
    doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== sheet);
  };

  // A refused style attribute is still in the DOM but declares nothing; an
  // applied one always declares something. The CSSOM write rewrites the
  // attribute, which this observer sees again — by then it declares something,
  // so there is no loop.
  const reapply = (el: Element): void => {
    const style = (el as HTMLElement).style;
    const attr = el.getAttribute('style');
    if (style && attr && style.length === 0) style.cssText = attr;
  };

  const scan = (node: Node): void => {
    if (!(node instanceof win.Element)) return;
    if (node instanceof win.HTMLStyleElement) mirror(node);
    if (node.hasAttribute('style')) reapply(node);
    for (const style of node.querySelectorAll('style')) mirror(style);
    for (const el of node.querySelectorAll('[style]')) reapply(el);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        reapply(mutation.target as Element);
        continue;
      }
      // A text change inside a <style>, or its text node being replaced.
      const parent =
        mutation.target instanceof win.HTMLStyleElement
          ? mutation.target
          : mutation.target.parentElement;
      if (parent instanceof win.HTMLStyleElement) mirror(parent);
      for (const node of mutation.addedNodes) scan(node);
      for (const node of mutation.removedNodes) {
        if (node instanceof win.HTMLStyleElement) unmirror(node);
      }
    }
  });

  scan(root);
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['style'],
  });

  return () => {
    observer.disconnect();
    for (const style of [...mirrors.keys()]) unmirror(style);
  };
}
