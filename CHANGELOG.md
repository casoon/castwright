# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-09-26

### Added

- VHS `.tape` files as input: `castwright build`, `validate` and `dev` and the Vite plugin
  take them next to `*.terminal.yaml`. With `--allow-exec` each typed command runs as an
  `exec:` step and its output is recorded; commands typed between `Hide` and `Show` run
  silently before each visible one. A documented subset, listed in the VHS tapes
  reference.

## [0.2.1] - 2026-09-25

### Fixed

- `--record` no longer folds long lines when it rewrites the file: a recorded line stays
  exactly as the program printed it, and the rest of the file keeps its layout.

## [0.2.0] - 2026-09-25

The first release on npm: `@casoon/castwright`, `@casoon/castwright-player` and
`@casoon/astro-castwright`.

### Added

- DSL parser and `Script` IR: `*.terminal.yaml` with `run`, `type`, `key`, `output`,
  `wait`, `clear`, `prompt` and `marker`, inline colour markup, raw ANSI, and validation
  errors carrying file, line, column and the offending source line.
- Compiler from `Script` to asciicast v2, deterministic by construction: no wall clock, no
  unseeded randomness, grapheme-cluster typing, and snapshot tests over the whole example
  corpus to keep it that way.
- Seven bundled themes, embedded in the cast header so a `.cast` looks right wherever it
  is played.
- `castwright` CLI: `build`, `validate` and `dev`.
- `<castwright-demo>`, a framework-agnostic web player on xterm.js — lazy, pausing when
  scrolled out of view, with seek implemented as replay rather than a skip.
- Accessibility: the element's light-DOM children are the terminal's final text, generated
  at build time; the live terminal is hidden from assistive technology; reduced motion
  shows the final frame immediately; the terminal is never a keyboard trap.
- `chrome="none"` and `controls="hover"` for a bare looping demo that still has a real,
  focus-revealed pause control.
- Vite plugin at `@casoon/castwright/vite`, covering every bundler-based framework, and a
  thin Astro integration with `<TerminalDemo />` on top of it.
- A self-contained player bundle, so the no-bundler path needs no CDN.
- `castwright build --format svg`: one self-contained animated SVG — real text, the cast's
  theme, no script, reduced-motion aware — that plays inside a plain `<img>`, as a GitHub
  README embeds it. Each terminal line animates only when it changes, so a minute of demo
  is around 120 kB. `--no-chrome` and `--loop-delay` shape it.
- `--format gif` and `--format mp4`, through `agg` and `ffmpeg`, with an install hint when
  either is missing.
- `show:` puts a file on screen, syntax-highlighted at build time with Shiki (an optional
  peer dependency) — with `lines`, `lang` and `theme`.
- `exec:` runs a real command in a pseudo-terminal and records its output with real timing,
  only with `--allow-exec` / `allowExec: true`. `--record` writes the output back into the
  file as `run:` + `output: { raw }`, so the demo replays the same bytes on every build.
  node-pty is an optional peer dependency.
- The player works under a strict `style-src` (no `'unsafe-inline'`), such as Astro's
  hash-based CSP. In Firefox, 24-bit colours additionally need
  `style-src-attr 'unsafe-inline'`.

### Fixed

- Seeking or restarting during playback could leave two runs' worth of output on screen.
- Page styles now override the player's defaults (`castwright-demo { --castwright-… }`),
  as the theming guide describes.
- The window frame is as wide as the terminal instead of stretching across a wide page.
