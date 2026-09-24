---
title: Installation
description: Three packages, and which of them you actually need.
order: 1
---

<Callout type="note">
castwright is pre-release. The packages are complete and tested but not published to npm
yet, so the commands below will not resolve until the first release.
</Callout>

## The three packages

| Package | What it is | When you need it |
| --- | --- | --- |
| `@casoon/castwright` | Parser, compiler, the `castwright` CLI, and the Vite plugin | Always |
| `@casoon/castwright-player` | `<castwright-demo>`, the web component | Whenever a demo appears in a browser |
| `@casoon/astro-castwright` | Astro integration and `<TerminalDemo />` | Astro projects only |

`shiki` is an optional extra: add it only if your demos use the
[`show`](../../reference/dsl/#show) step.

## Astro

```bash
pnpm add -D @casoon/castwright @casoon/astro-castwright @casoon/castwright-player
```

```js
// astro.config.mjs
import castwright from '@casoon/astro-castwright';
import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [castwright()],
});
```

## Any other Vite framework

SvelteKit, Nuxt, Remix, SolidStart, Qwik, VitePress, plain Vite — the plugin is the whole
integration, and the Astro package is unnecessary:

```bash
pnpm add -D @casoon/castwright @casoon/castwright-player
```

```js
// vite.config.ts
import { castwright } from '@casoon/castwright/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [castwright()],
});
```

For TypeScript, add the types for `*.terminal.yaml` imports:

```json
{ "compilerOptions": { "types": ["@casoon/castwright/vite/client"] } }
```

## No bundler at all

Build the cast ahead of time with the CLI and load the player as one module script. It
registers the custom element on import and carries xterm.js's stylesheet with it, so
there is no second file to remember:

```bash
castwright build demo.terminal.yaml -o public
```

```html
<script type="module" src="/castwright-player.js"></script>

<castwright-demo src="/demo.cast" autoplay loop>
  <pre>$ npm install
added 42 packages</pre>
</castwright-demo>
```

<Callout type="caution">
The `<pre>` is not decoration. It is what a screen reader and a visitor without
JavaScript get — see [Accessibility](../../guides/accessibility/).
</Callout>
