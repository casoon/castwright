# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
