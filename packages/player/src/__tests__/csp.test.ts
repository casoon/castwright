import { afterEach, describe, expect, it } from 'vitest';
import { repairInlineStyles } from '../csp.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('repairInlineStyles', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.adoptedStyleSheets = [];
  });

  function rules(): string[] {
    return document.adoptedStyleSheets.flatMap((sheet) =>
      [...sheet.cssRules].map((rule) => rule.cssText),
    );
  }

  it('mirrors a <style> added under the root into a constructed sheet', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const stop = repairInlineStyles(root);

    const style = document.createElement('style');
    style.textContent = '.a { color: red; }';
    root.appendChild(style);
    await flush();

    expect(rules().join()).toContain('.a');
    stop();
  });

  it('follows text changes, as xterm makes on a theme change or resize', async () => {
    const root = document.createElement('div');
    const style = document.createElement('style');
    style.textContent = '.a { color: red; }';
    root.appendChild(style);
    document.body.appendChild(root);
    const stop = repairInlineStyles(root);

    style.textContent = '.b { color: blue; }';
    await flush();

    expect(rules().join()).toContain('.b');
    expect(rules().join()).not.toContain('.a');
    stop();
  });

  it('drops the mirror when the <style> goes, and everything on stop', async () => {
    const root = document.createElement('div');
    const style = document.createElement('style');
    style.textContent = '.a { color: red; }';
    root.appendChild(style);
    document.body.appendChild(root);
    const stop = repairInlineStyles(root);
    expect(document.adoptedStyleSheets).toHaveLength(1);

    style.remove();
    await flush();
    expect(document.adoptedStyleSheets).toHaveLength(0);

    root.appendChild(style);
    await flush();
    expect(document.adoptedStyleSheets).toHaveLength(1);
    stop();
    expect(document.adoptedStyleSheets).toHaveLength(0);
  });

  it('leaves a style attribute alone when the browser applied it', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const stop = repairInlineStyles(root);

    const span = document.createElement('span');
    span.setAttribute('style', 'color: rgb(1, 2, 3);');
    root.appendChild(span);
    await flush();

    expect(span.getAttribute('style')).toBe('color: rgb(1, 2, 3);');
    stop();
  });
});
