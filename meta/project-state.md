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

**V1 is functionally complete and unpublished.** The whole path works end to end: a
`*.terminal.yaml` compiles to asciicast, and `<castwright-demo>` plays it as a real
terminal in a browser. Nothing is on npm yet.

| Path | Contents |
|---|---|
| `meta/` | This documentation — maintainer-facing, not rendered into the site. Committed. |
| `packages/core` | `@casoon/castwright`. Parser, compiler, themes, the `castwright` CLI (`build`, `validate`, `dev`) and the Vite plugin. |
| `packages/player` | `@casoon/castwright-player`. `<castwright-demo>`, built on xterm.js. Declares core as a type-only `devDependency` — there is no runtime edge. |
| `packages/astro` | `@casoon/castwright-astro`. Integration plus `TerminalDemo.astro`. |
| `docs/` | The public documentation, rendered by the site at `/docs/`. |
| `site/` | The project page, built from the shared CASOON Pages theme: start page, docs, showcase, live demo, changelog. See `site/README.md`. |
| `examples/` | `*.terminal.yaml` files as the parser's and compiler's test corpus, plus `examples/astro` and `examples/vite` — two consumer projects built in CI that assert the parser never reaches the browser. |
| `scripts/` | Repository-level checks that cannot run inside the workspace: asciicast compatibility and the tarball smoke test. |

See [architecture.md](architecture.md) for how the pieces fit together.

### What is deliberately not done

- **Publishing.** Nothing is on npm beyond the `castwright` name reservation. The
  release workflow and the pack smoke test are in place; the remaining step is a
  `NPM_TOKEN` secret and merging the first "Version Packages" PR.
- **Deployment.** The docs site builds but is not deployed anywhere; the host is still
  an open choice.
- **SVG and GIF export.** `svg-term-cli` and `agg` already consume asciicast, so those
  items start by evaluating delegation rather than writing a renderer.
- **`exec:` mode** (running real commands through a PTY) and **VHS `.tape` input**.

## Stack

All of this is in place (see [decisions.md](decisions.md) for the reasoning):

- **Language / runtime:** TypeScript, Node.js 22+ (LTS), ESM only
- **Repository layout:** pnpm workspaces monorepo, no Turborepo/Nx for now
- **Terminal engine:** `@xterm/xterm` in the browser, `@xterm/headless` for exporters
- **Interchange format:** asciicast v2
- **npm scope:** `@casoon/castwright*` — reserved; nothing published yet
- **License:** MIT
- **Tooling:** Biome (lint + format), Vitest (`test.projects` across packages),
  TypeScript project references, Changesets with fixed versioning across the three
  packages, GitHub Actions CI (typecheck → lint → test → build → packaging, plus
  separate jobs for asciicast compatibility and for Playwright + axe against the built
  docs site) and a Changesets release workflow publishing with npm provenance. The workspace root also carries
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
pnpm add -D @casoon/castwright @casoon/castwright-astro @casoon/castwright-player
```

```astro
---
import TerminalDemo from '@casoon/castwright-astro/TerminalDemo.astro';
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
