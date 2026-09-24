// @casoon/castwright-player — <castwright-demo>, a real-VT terminal player.
//
// Importing this module registers the custom element, which is what makes
//   <script type="module" src="https://esm.sh/@casoon/castwright-player">
// enough on its own in a plain HTML page.

export { deserializeCast } from './cast-io.js';
export { CastwrightDemoElement, defineCastwrightDemo } from './element.js';
export { mount } from './player.js';
export type { XtermTheme } from './theme.js';
export { toXtermTheme } from './theme.js';
export type { Timeline, TimelineEvent } from './timeline.js';
export { advance, buildTimeline, findMarker, outputUpTo } from './timeline.js';
export type {
  Cast,
  CastTheme,
  PlayerHandle,
  PlayerOptions,
  PlayerState,
  TerminalAdapter,
  TerminalInit,
} from './types.js';
export { createXtermTerminal } from './xterm-adapter.js';

import { defineCastwrightDemo } from './element.js';

defineCastwrightDemo();
