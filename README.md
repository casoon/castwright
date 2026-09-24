# castwright

**Declarative terminal demos for the web.**

[![CI](https://github.com/casoon/castwright/actions/workflows/ci.yml/badge.svg)](https://github.com/casoon/castwright/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-informational)](package.json)

[**Live demo**](https://casoon.github.io/castwright/demo/) · [Documentation](https://casoon.github.io/castwright/)

Write a small YAML file describing a terminal session. castwright compiles it to
[asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/) and plays it as a real
terminal — real ANSI, real cursor movement, selectable text — via
[xterm.js](https://xtermjs.org/), with no headless browser anywhere in your build.

```yaml
# demo.terminal.yaml
version: 1

terminal:
  cols: 72
  rows: 12
  theme: catppuccin-mocha

steps:
  - run: pnpm add -D @casoon/castwright
  - output: |
      {green}✓{/} added 3 packages
  - wait: 500
  - run: castwright build demo.terminal.yaml
  - output: |
      {dim}dist/demo.cast{/}
```

```astro
---
import TerminalDemo from '@casoon/astro-castwright/TerminalDemo.astro';
import demo from '../demos/demo.terminal.yaml';
---
<TerminalDemo demo={demo} autoplay loop />
```

## Why

| Tool | Authoring | Terminal | Web output |
|---|---|---|---|
| [asciinema](https://asciinema.org/) | Record a real session | Real VT | Mature player |
| [VHS](https://github.com/charmbracelet/vhs) | Declarative `.tape` | Real VT, via headless Chrome | GIF only |
| **castwright** | Declarative YAML, compiled | Real VT (xterm.js) | Framework-agnostic player, animated SVG, GIF/MP4 |

Authored rather than recorded, deterministic (same input, same bytes — a compiled cast is
a text file you can commit and read in a diff), browser-free at build time, and web-native
at output.

It is explicitly *not* a terminal recorder and *not* a terminal emulator. ANSI/VT handling
is xterm.js's job and the interchange format already exists; castwright's own substance is
the authoring language, the compiler, the player and the exporters.

## Packages

| Package | |
|---|---|
| [`@casoon/castwright`](packages/core) | Parser, compiler, the `castwright` CLI, and the Vite plugin |
| [`@casoon/castwright-player`](packages/player) | `<castwright-demo>` — the web component |
| [`@casoon/astro-castwright`](packages/astro) | Astro integration and `<TerminalDemo />` |

## Install

```bash
pnpm add -D @casoon/castwright @casoon/astro-castwright @casoon/castwright-player
```

Outside Astro, drop the middle one — the Vite plugin covers SvelteKit, Nuxt, Remix,
SolidStart, Qwik, VitePress and plain Vite:

```js
// vite.config.ts
import { castwright } from '@casoon/castwright/vite';
export default defineConfig({ plugins: [castwright()] });
```

### Server-side rendering

`@casoon/castwright-player` is safe to import from a module that also runs on the server.
Under Node it registers nothing and touches no DOM, so SvelteKit, Nuxt, Remix, SolidStart
and Qwik render the element's children — the terminal's final text — and the browser
upgrades it on hydration. That is the same fallback an undefined custom element renders
anyway, so there is nothing to mark client-only and no `ssr.noExternal` entry to add.

The pure parts (`deserializeCast`, `buildTimeline`, `toXtermTheme`) work on the server
too. `mount()` needs a real DOM and belongs in `onMount`, `useEffect` or a `<script>`.

With no bundler at all, one script tag is the whole setup:

```html
<script type="module" src="https://esm.sh/@casoon/castwright-player"></script>

<castwright-demo src="/demo.cast" autoplay loop>
  <pre>$ pnpm add -D @casoon/castwright
✓ added 3 packages</pre>
</castwright-demo>
```

## CLI

```bash
castwright build demo.terminal.yaml     # → dist/demo.cast
castwright build demo.terminal.yaml --format svg   # animated SVG for a README, no JS
castwright build demo.terminal.yaml --format gif   # via agg; mp4 via agg + ffmpeg
castwright validate demos/*.terminal.yaml
castwright dev demo.terminal.yaml       # watch and reload while authoring
```

The output is a standard asciicast, so the rest of that ecosystem works on it —
`asciinema play`, `svg-term`, `agg`. It works the other way too: the player will happily
play a real `asciinema rec` recording.

## Accessibility

The element's children are the content: an undefined custom element renders them, so the
terminal's final text is real, selectable, screen-reader-addressable text before the
script loads and forever if it never does. The Astro component generates it at build time.
`prefers-reduced-motion` shows the final frame immediately, there is always a real pause
button, and the terminal is never a keyboard trap. Every page of the site is checked
against WCAG 2.2 AA with axe-core, in light and dark, before each release; CI runs the
player itself in a real browser on desktop and mobile viewports.

## Documentation

<https://casoon.github.io/castwright/> — guides, the DSL reference, a showcase built from
the same fixtures the tests use, and a [live demo](https://casoon.github.io/castwright/demo/)
of the player running in the page.

The source of those pages is [`docs/`](docs/); the site that renders them is
[`site/`](site/README.md).

## Status

Pre-release, and not yet published to npm. The parser, compiler, CLI, player, Vite plugin,
Astro integration and the SVG, GIF and MP4 exporters all work.

[`meta/`](meta/project-state.md) holds the maintainer-facing documentation: current state,
architecture, decisions and constraints.

## Development

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Two checks run outside Vitest, because neither can be done from inside the workspace:

```bash
pnpm test:pack     # installs the three tarballs into a throwaway project
pnpm test:compat   # runs the compiler's output through asciinema and agg themselves
```

`test:compat` needs `asciinema` and `agg` on `PATH` (`brew install agg asciinema`); it
skips with a note when they are absent, and CI installs pinned versions.

```bash
pnpm --filter castwright-site dev        # the project page
pnpm --filter castwright-site test:e2e   # Playwright: the player in a real browser
```

`site/README.md` covers the pages check that runs before a release.

## Contributing

Issues and pull requests are welcome. The DSL is versioned: removing or repurposing a
key is a breaking change, and every new key is documented in
[`docs/reference/dsl.md`](docs/reference/dsl.md) and given an example in
[`examples/`](examples/) before it is implemented.
[`meta/conventions.md`](meta/conventions.md) has the rest of the house rules, and
[`meta/decisions.md`](meta/decisions.md) explains why the project is shaped the way it
is — worth a look before proposing anything structural.

## License

MIT © CASOON
