# castwright-site

The project page at <https://casoon.github.io/castwright/>, built from the shared
[CASOON Pages theme](https://github.com/casoon/gh-pages-template).

## Layout

| Path | |
|---|---|
| `src/pages/index.astro` | Start page. The hero terminal is the compiler's real output, rendered at build time from `examples/basic.terminal.yaml`. |
| `src/pages/demo.astro` | The live demo: the player itself, running in the page. |
| `src/showcase.ts` | Showcase entries — DSL input next to what castwright's own compiler produced from it. |
| `src/demos/` | The `*.terminal.yaml` files the demo page plays. |
| `../docs/` | The documentation, rendered by the theme at `/docs/`. |
| `vendor/pages-theme/` | The theme, vendored. Never edit it here — change it in `gh-pages-template` and re-sync. |

## Commands

```bash
pnpm --filter castwright-site dev      # local development
pnpm --filter castwright-site build    # build (needs the packages built first)
pnpm --filter castwright-site test:e2e # Playwright: the player in a real browser
```

### Before a release: the pages check

Verifies axe (WCAG 2.2 AA) in light and dark on every page, that no link is dead or
outside the base path, that nothing is requested from another origin, and that no page
carries more scripts than the theme allows.

It is not part of CI, because its script lives in the shared pages skill rather than in
this repository:

```bash
pnpm --filter castwright-site exec astro preview --ignore-lock --port 4321 &
pnpm --filter castwright-site run check
```

Expected output: `all clean`.

## Updating the theme

```bash
~/GitHub/gh-pages-template/scripts/sync-theme.sh ~/GitHub/castwright
pnpm install
```

Then rebuild, run the pages check, and commit `vendor/`. `vendor/pages-theme/SOURCE`
records which commit of the template is vendored.

## Deviations from the template

- **`site` is a workspace package.** castwright is a monorepo, and the site consumes
  `@casoon/castwright` and `@casoon/castwright-player` from it, so one install at the
  repository root covers everything and there is no separate `site/pnpm-lock.yaml`.
- **The demo loads a bundled player.** `scripts/copy-player.mjs` copies the player's
  self-contained build into `public/` before every build, because the theme's origin rule
  forbids a CDN and an inline script inside the demo stage cannot be bundled by Astro.
