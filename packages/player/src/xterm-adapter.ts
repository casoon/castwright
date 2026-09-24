// The real xterm.js terminal behind the TerminalAdapter interface.
//
// Everything xterm-specific is confined to this file, which is what lets the
// rest of the player be tested without a browser: mount() takes a factory, and
// tests pass a fake that records writes.

import * as addonFit from '@xterm/addon-fit';
import * as xterm from '@xterm/xterm';
import { toXtermTheme } from './theme.js';
import type { TerminalAdapter, TerminalInit } from './types.js';

// xterm.js ships a CJS `main` and an ESM `module` with no `exports` map, so
// what a namespace import yields depends on who resolved it: a bundler reads
// the ESM build and puts `Terminal` on the namespace, while Node reads the CJS
// build and puts the whole UMD object on `default`. Reading through `default`
// first covers both — and, more to the point, a namespace import of a CJS
// module always *loads*, where `import { Terminal } from …` throws at parse
// time under Node. That is what makes this package importable during SSR at
// all; see the note in README.md.
function interop<T>(module: T): T {
  return (module as { default?: T }).default ?? module;
}

const { Terminal } = interop(xterm);
const { FitAddon } = interop(addonFit);

export function createXtermTerminal(init: TerminalInit): TerminalAdapter {
  const terminal = new Terminal({
    cols: init.cols,
    rows: init.rows,
    // The terminal is a presentation, never an input — see meta/constraints.md.
    disableStdin: true,
    scrollback: 0,
    cursorBlink: init.cursorBlink ?? true,
    cursorStyle: init.cursorStyle ?? 'block',
    ...(init.fontFamily ? { fontFamily: init.fontFamily } : {}),
    ...(init.theme ? { theme: toXtermTheme(init.theme) } : {}),
  });

  const fit = new FitAddon();
  terminal.loadAddon(fit);

  return {
    open(container) {
      terminal.open(container);
      // xterm inserts a helper textarea to capture input. Since input is not the
      // point here, take it out of the tab order so the demo can never become a
      // keyboard trap (meta/constraints.md).
      const textarea = container.querySelector('textarea');
      textarea?.setAttribute('tabindex', '-1');
      textarea?.setAttribute('aria-hidden', 'true');
    },
    write(data) {
      terminal.write(data);
    },
    reset() {
      terminal.reset();
    },
    resize(cols, rows) {
      terminal.resize(cols, rows);
    },
    dispose() {
      terminal.dispose();
    },
    fit() {
      try {
        fit.fit();
      } catch {
        // FitAddon throws if the container has no layout yet (display:none, or
        // measured before first paint). Nothing to do — the next resize fits.
      }
    },
  };
}
