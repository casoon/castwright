// A TerminalAdapter that records instead of rendering. This is the whole reason
// mount() takes a factory: the player's behaviour — what it writes, when, and
// after which resets — is assertable without a browser or a real xterm.

import type { TerminalAdapter, TerminalInit } from '../types.js';

export interface FakeTerminal extends TerminalAdapter {
  readonly init: TerminalInit;
  readonly writes: string[];
  readonly resets: number;
  /** Every `resize()` call, in order. */
  readonly resizes: Array<[number, number]>;
  readonly disposed: boolean;
  /** Everything written since the last reset — i.e. what is on screen. */
  screen(): string;
}

export function createFakeTerminal(init: TerminalInit): FakeTerminal {
  const writes: string[] = [];
  const resizes: Array<[number, number]> = [];
  let resets = 0;
  let disposed = false;
  let sinceReset: string[] = [];

  return {
    init,
    writes,
    resizes,
    get resets() {
      return resets;
    },
    get disposed() {
      return disposed;
    },
    screen: () => sinceReset.join(''),
    open() {},
    write(data) {
      writes.push(data);
      sinceReset.push(data);
    },
    reset() {
      resets++;
      sinceReset = [];
    },
    resize(cols, rows) {
      resizes.push([cols, rows]);
    },
    dispose() {
      disposed = true;
    },
  };
}
