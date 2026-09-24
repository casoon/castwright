---
title: Theming
description: Bundled themes, the frame's CSS custom properties, and fonts.
order: 4
---

A theme travels inside the cast, so a `.cast` file looks right wherever it is played —
including outside castwright, in `asciinema play`.

## Bundled themes

Set one with `terminal.theme`. Anything else is a validation error.

| Name | Notes |
| --- | --- |
| `default` | The standard 16 xterm colours on black. |
| `default-light` | The same palette on white. |
| `catppuccin-mocha` | Catppuccin's published Mocha palette. |
| `dracula` | The official Dracula palette. |
| `github-dark` | Approximates GitHub's dark surface colours. |
| `github-light` | Approximates GitHub's light surface colours. |
| `solarized-dark` | Ethan Schoonover's Solarized, dark. |

The compiler resolves the name to a palette and embeds it in the cast header; the player
reads it from there. That is why the player needs no theme table of its own.

In the file the header carries the theme the way asciicast v2 spells it — `fg`, `bg` and a
colon-joined `palette` — so `asciinema play` and `agg` apply it too. The format defines no
cursor colour, so a theme's cursor tint (`catppuccin-mocha` and `solarized-dark` are the
two bundled themes that set one) is not written to a `.cast`; a player uses the foreground
colour, which is the terminal default. Demos compiled through the Vite plugin or the Astro
component keep it, because there the cast is inlined rather than written out.

## The frame

Everything outside the terminal is CSS custom properties on the element. There is no
shadow DOM, so you style it from your own stylesheet:

```css
castwright-demo {
  --castwright-radius: 10px;
  --castwright-chrome-bg: #2a2a32;
  --castwright-chrome-fg: #b8b8c4;
  --castwright-shadow: 0 8px 30px rgb(0 0 0 / 0.22);
  --castwright-padding: 12px;
  --castwright-accent: #7aa2f7;
  /* The window body behind the terminal. Defaults to the cast's own background,
     so the window looks solid even when the terminal does not fill it. */
  --castwright-screen-bg: #1e1e2e;
  --castwright-font: ui-monospace, "JetBrains Mono", Menlo, monospace;
}
```

The window is as wide as the terminal it holds and never wider than its container; on a
narrow container the terminal scales down instead. It sits at the start of the line like
any block — centre it with `castwright-demo { margin-inline: auto }`.

<Callout type="caution">
The trade-off that buys: an aggressive global CSS reset can reach into the terminal. If
yours sets something like `* { line-height: inherit }`, scope it away from `.xterm`.
</Callout>

## Fonts

castwright does not bundle a font — that is a multi-hundred-kilobyte decision a site owner
should make. The default stack ends in `ui-monospace, monospace`, which is fine for most
demos.

If your demos use box-drawing characters, powerline glyphs or Nerd Font icons, load a font
that has them and point `--castwright-font` at it. Without one they render as replacement
boxes: the demo is not broken, but it looks it.
