// The one test that touches real xterm.js. Everything else passes mount() a
// fake terminal, which means nothing here would notice if the import of
// xterm.js itself stopped producing a usable `Terminal`.
//
// It nearly did: xterm.js ships a CJS `main` and an ESM `module` with no
// `exports` map, so `import { Terminal } from '@xterm/xterm'` resolves
// differently for a bundler than for Node — and the form that worked in the
// browser made the whole package unimportable during SSR. This test covers the
// bundler half of that interop (vitest resolves the ESM build, exactly as Vite
// does for a real site); the Node half is covered by scripts/pack-smoke-test.mjs.

import { describe, expect, it } from 'vitest';
import { createXtermTerminal } from '../xterm-adapter.js';

describe('createXtermTerminal', () => {
  it('constructs a real xterm.js terminal behind the adapter interface', () => {
    const terminal = createXtermTerminal({ cols: 40, rows: 6 });
    expect(typeof terminal.write).toBe('function');
    expect(typeof terminal.reset).toBe('function');
    expect(typeof terminal.resize).toBe('function');
    expect(typeof terminal.dispose).toBe('function');
    terminal.dispose();
  });

  it('accepts a cast theme without a DOM to render into', () => {
    const terminal = createXtermTerminal({
      cols: 40,
      rows: 6,
      theme: {
        foreground: '#ffffff',
        background: '#000000',
        cursor: '#ffffff',
        palette: ['#000000', '#ff0000'],
      },
      cursorStyle: 'bar',
      cursorBlink: false,
    });
    expect(() => terminal.write('hello')).not.toThrow();
    terminal.dispose();
  });
});
