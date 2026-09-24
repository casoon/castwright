// Named theme palettes — see docs/reference/theming.md. Defined once
// here and consumed by two things in this package: the parser (validates
// `terminal.theme` against THEME_NAMES) and the compiler (embeds the resolved
// palette into the cast header). The player never imports this module — a
// `Cast` is self-describing (see meta/decisions.md), so the player converts
// `cast.header.theme` to xterm's `ITheme` shape at runtime instead.
//
// Fidelity note: default/default-light are the standard 16 xterm colours;
// catppuccin-mocha, dracula and solarized-dark reproduce those projects'
// published terminal palettes. github-dark/github-light are close, hand-tuned
// approximations of GitHub's Primer dark/light surface colours, not a
// published ANSI-16 spec — refine them if pixel fidelity against GitHub's
// own terminal ever matters.

import type { CastTheme } from '../types.js';

const THEMES = {
  default: {
    foreground: '#e5e5e5',
    background: '#000000',
    cursor: '#e5e5e5',
    palette: [
      '#000000',
      '#cd0000',
      '#00cd00',
      '#cdcd00',
      '#0000ee',
      '#cd00cd',
      '#00cdcd',
      '#e5e5e5',
      '#7f7f7f',
      '#ff0000',
      '#00ff00',
      '#ffff00',
      '#5c5cff',
      '#ff00ff',
      '#00ffff',
      '#ffffff',
    ],
  },
  'default-light': {
    foreground: '#000000',
    background: '#ffffff',
    cursor: '#000000',
    palette: [
      '#000000',
      '#cd0000',
      '#00cd00',
      '#cdcd00',
      '#0000ee',
      '#cd00cd',
      '#00cdcd',
      '#e5e5e5',
      '#7f7f7f',
      '#ff0000',
      '#00ff00',
      '#ffff00',
      '#5c5cff',
      '#ff00ff',
      '#00ffff',
      '#ffffff',
    ],
  },
  'catppuccin-mocha': {
    foreground: '#cdd6f4',
    background: '#1e1e2e',
    cursor: '#f5e0dc',
    palette: [
      '#45475a',
      '#f38ba8',
      '#a6e3a1',
      '#f9e2af',
      '#89b4fa',
      '#f5c2e7',
      '#94e2d5',
      '#bac2de',
      '#585b70',
      '#f38ba8',
      '#a6e3a1',
      '#f9e2af',
      '#89b4fa',
      '#f5c2e7',
      '#94e2d5',
      '#a6adc8',
    ],
  },
  dracula: {
    foreground: '#f8f8f2',
    background: '#282a36',
    cursor: '#f8f8f2',
    palette: [
      '#21222c',
      '#ff5555',
      '#50fa7b',
      '#f1fa8c',
      '#bd93f9',
      '#ff79c6',
      '#8be9fd',
      '#f8f8f2',
      '#6272a4',
      '#ff6e6e',
      '#69ff94',
      '#ffffa5',
      '#d6acff',
      '#ff92df',
      '#a4ffff',
      '#ffffff',
    ],
  },
  'github-dark': {
    foreground: '#c9d1d9',
    background: '#0d1117',
    cursor: '#c9d1d9',
    palette: [
      '#484f58',
      '#ff7b72',
      '#3fb950',
      '#d29922',
      '#58a6ff',
      '#bc8cff',
      '#39c5cf',
      '#b1bac4',
      '#6e7681',
      '#ffa198',
      '#56d364',
      '#e3b341',
      '#79c0ff',
      '#d2a8ff',
      '#56d4dd',
      '#f0f6fc',
    ],
  },
  'github-light': {
    foreground: '#24292f',
    background: '#ffffff',
    cursor: '#24292f',
    palette: [
      '#24292f',
      '#cf222e',
      '#116329',
      '#4d2d00',
      '#0969da',
      '#8250df',
      '#1b7c83',
      '#6e7781',
      '#57606a',
      '#a40e26',
      '#1a7f37',
      '#633c01',
      '#218bff',
      '#a475f9',
      '#3192aa',
      '#8c959f',
    ],
  },
  'solarized-dark': {
    foreground: '#839496',
    background: '#002b36',
    cursor: '#93a1a1',
    palette: [
      '#073642',
      '#dc322f',
      '#859900',
      '#b58900',
      '#268bd2',
      '#d33682',
      '#2aa198',
      '#eee8d5',
      '#002b36',
      '#cb4b16',
      '#586e75',
      '#657b83',
      '#839496',
      '#6c71c4',
      '#93a1a1',
      '#fdf6e3',
    ],
  },
} as const satisfies Record<string, CastTheme>;

export type ThemeName = keyof typeof THEMES;

export const THEME_NAMES: readonly ThemeName[] = Object.keys(THEMES) as ThemeName[];

export function isThemeName(name: string): name is ThemeName {
  return (THEME_NAMES as readonly string[]).includes(name);
}

/** @throws if `name` is not one of THEME_NAMES — callers validate first (the parser does). */
export function resolveTheme(name: string): CastTheme {
  if (!isThemeName(name)) {
    throw new Error(`unknown theme '${name}' — known themes: ${THEME_NAMES.join(', ')}`);
  }
  return THEMES[name];
}
