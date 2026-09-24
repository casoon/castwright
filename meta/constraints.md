# Constraints

Hard boundaries the project works within. Verified constraints and open assumptions are
kept apart.

## Runtime and tooling

- **Node.js 22+ (LTS)**, ESM only. No CommonJS build is published.
- **pnpm** is the package manager; the workspace is defined by `pnpm-workspace.yaml`.
- The build must run on a plain CI runner. **No headless browser and no ttyd at build
  time** — this is the main practical difference from VHS and is a constraint, not a
  preference.

## Determinism

Compiling the same input twice must produce a byte-identical `.cast`. This rules out
wall-clock timestamps, unseeded randomness, and locale-dependent number or string
formatting in the compile path. The asciicast header's `timestamp` field is therefore
omitted or fixed, never set from `Date.now()`.

## Browser support

The web player targets **evergreen browsers** (last two versions of Chrome, Firefox,
Safari, Edge). xterm.js requires a modern canvas/WebGL-capable environment; there is no
fallback renderer for legacy browsers.

Where the player cannot run, the accessible text alternative (below) must still be
present in the DOM.

## Accessibility

A terminal demo is decorative motion containing text, which makes it an accessibility
problem by default. The player must therefore:

- expose the **final terminal contents as real text** in the DOM, not only as canvas
  pixels, so it is reachable by screen readers and by copy/paste;
- honour **`prefers-reduced-motion`** by skipping the animation and showing the final
  frame;
- never autoplay-loop without an accessible pause control;
- keep focus behaviour sane — the terminal is a presentation, not an input, and must not
  become a keyboard trap.

*Target:* WCAG 2.2 AA for the player component and the documentation site. This is a
project requirement, not an aspiration — and it is enforced in two places: the player's
own behaviour (reduced motion, the pause control, the fallback text, the textarea's
`tabindex`) has Playwright tests that run in CI, and the project page is checked with
axe-core over every page in light and dark before a release.

## Licensing

MIT. Dependencies must be MIT/ISC/BSD/Apache-2.0 compatible. Copyleft dependencies are
not acceptable in published packages.

## Bundle size

The YAML parser and the compiler must never reach the client. Where a bundler exists,
the Vite plugin compiles at build time and inlines the cast; without one, `src` points at
a `.cast` built ahead of time by the CLI and fetched as small JSON. A playground that
compiles live is the one exception and gets a separate, explicit entry point.

Measured on `examples/vite` (player + xterm.js + one inlined cast): **344 kB raw,
89 kB gzipped**. xterm.js is essentially all of it, which was expected and is accepted.
Nothing of comparable size should be added without a decision recorded in
[decisions.md](decisions.md). Both example projects assert against their real bundles
that the parser and compiler are absent, so this stays true rather than being assumed.

## Open assumptions

These are **not** verified and must be settled before they harden into constraints:

- Whether a self-built SVG exporter is needed at all, or whether `svg-term-cli` — which
  already consumes asciicast — is good enough to delegate to. If it is built, whether it
  can hit acceptable fidelity with system monospace fonts or must embed a webfont.
- Whether xterm.js's DOM renderer (the default, and what the player currently uses) is
  fast enough on low-end mobile. The documentation site renders up to six demos on one
  page, but only the ones scrolled into view are ever instantiated, which is the main
  mitigation. Not measured on real low-end hardware.
