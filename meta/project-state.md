# Project State

## What this is

`castwright` is a declarative terminal-demo system for the web. Authors write a
small YAML file describing a terminal session; a compiler turns it into a timed
[asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/) stream; renderers turn
that stream into a live web terminal, an SVG, or (later) a video.

The tagline: **declarative terminal demos for the web.** The name is "cast" as in
asciicast plus *-wright* as in playwright — a maker of casts.

It is explicitly *not* a terminal recorder and *not* a terminal emulator. ANSI/VT
handling is delegated to xterm.js, and the interchange format is asciicast. The
project's own substance is the authoring DSL, the compiler, the player chrome, and
the exporters.

## Current state of this repository

**Released: 0.3.0 on npm** (all three packages, fixed versioning). The whole path works
end to end: a `*.terminal.yaml` — or a VHS `.tape` — compiles to asciicast, and
`<castwright-demo>` plays it as a real terminal in a browser, or the CLI exports it as
SVG, GIF or MP4. On top of V1: the `show:` and `exec:` steps and `.tape` input. The docs
are live at https://casoon.github.io/castwright/.

| Path | Contents |
|---|---|
| `meta/` | This documentation — maintainer-facing, not rendered into the site. Committed. |
| `packages/core` | `@casoon/castwright`. Parser, compiler, themes, the `castwright` CLI (`build`, `validate`, `dev`) and the Vite plugin. |
| `packages/player` | `@casoon/castwright-player`. `<castwright-demo>`, built on xterm.js. Declares core as a type-only `devDependency` — there is no runtime edge. |
| `packages/astro` | `@casoon/astro-castwright`. Integration plus `TerminalDemo.astro`. |
| `docs/` | The public documentation, rendered by the site at `/docs/`. |
| `site/` | The project page, built from the shared CASOON Pages theme: start page, docs, showcase, live demo, changelog. See `site/README.md`. |
| `examples/` | `*.terminal.yaml` files as the parser's and compiler's test corpus, plus `examples/astro` and `examples/vite` — two consumer projects built in CI that assert the parser never reaches the browser. |
| `scripts/` | Repository-level checks that cannot run inside the workspace: asciicast compatibility and the tarball smoke test. |

See [architecture.md](architecture.md) for how the pieces fit together.

## Stack

All of this is in place (see [decisions.md](decisions.md) for the reasoning):

- **Language / runtime:** TypeScript, Node.js 22+ (LTS), ESM only
- **Repository layout:** pnpm workspaces monorepo, no Turborepo/Nx for now
- **Terminal engine:** `@xterm/xterm` in the browser, `@xterm/headless` for exporters
- **Interchange format:** asciicast v2
- **npm scope:** `@casoon/castwright*` — published since 0.2.0; the unscoped `castwright`
  placeholder is deprecated in favour of `@casoon/castwright`
- **License:** MIT
- **Tooling:** Biome (lint + format), Vitest (`test.projects` across packages),
  TypeScript project references, Changesets with fixed versioning across the three
  packages, GitHub Actions CI (typecheck → lint → test → build → packaging, plus
  separate jobs for asciicast compatibility and for Playwright + axe against the built
  docs site), a Changesets workflow that opens the version PR, and a Pages workflow that
  deploys the project page on every push to `main`. Publishing is deliberately manual. The workspace root also carries
  `devDependencies` on `@casoon/castwright` and `@casoon/castwright-player` — the only
  exception to "root has no functional code" — solely so `pnpm exec castwright ...`
  and `castwright dev` work from the repo root; this is what the plan's own acceptance
  checks invoke.

  Two checks run outside Vitest, because neither can be done from inside the
  workspace: `scripts/asciicast-compat-test.mjs` runs the compiler's output through
  `asciinema` and `agg` themselves (pinned versions, installed in CI; locally it skips
  with a note unless they are on PATH), and `scripts/pack-smoke-test.mjs` installs the
  tarballs into a throwaway project. Run them with `pnpm test:compat` and
  `pnpm test:pack`.

  Tests live in `src/**/__tests__` and are typechecked through each package's
  `tsconfig.typecheck.json`, but excluded from `tsconfig.json` so `tsc -b` never
  compiles them into `dist` — and therefore never into a tarball.

## The V1 surface

```bash
pnpm add -D @casoon/castwright @casoon/astro-castwright @casoon/castwright-player
```

```astro
---
import TerminalDemo from '@casoon/astro-castwright/TerminalDemo.astro';
import demo from '../demos/install.terminal.yaml';
---
<TerminalDemo demo={demo} autoplay loop />
```

```bash
castwright build demo.terminal.yaml   # → dist/demo.cast
castwright validate demos/*.terminal.yaml
castwright dev demo.terminal.yaml
```

`demo` takes an *import*, not a path string: a path would have to be resolved relative to
the calling page, which the component cannot do, and an import is type-checked and fails
the build when the file moves. `src` is for the no-bundler tier — a pre-built `.cast`
fetched at runtime.

## Related documents

- [architecture.md](architecture.md) — the pipeline that actually exists today
- [decisions.md](decisions.md) — what is decided and why it currently holds
- [conventions.md](conventions.md) — rules the implementation must follow
- [constraints.md](constraints.md) — hard boundaries the project works within
- [`docs/`](../docs/) — the public documentation: DSL reference, CLI, player, theming
