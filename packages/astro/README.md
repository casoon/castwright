# @casoon/castwright-astro

The Astro integration for [castwright](https://github.com/casoon/castwright): automatic Vite
plugin registration and a `<TerminalDemo />` component.

Deliberately thin. The Vite plugin in [`@casoon/castwright`](https://www.npmjs.com/package/@casoon/castwright)
does the compiling and `<castwright-demo>` from
[`@casoon/castwright-player`](https://www.npmjs.com/package/@casoon/castwright-player) does the
playing; both work in Astro without this package. It exists so you do not have to wire them
yourself.

## Install

```sh
pnpm add @casoon/castwright-astro
```

```js
// astro.config.mjs
import castwright from '@casoon/castwright-astro';

export default defineConfig({ integrations: [castwright()] });
```

## Use

```astro
---
import TerminalDemo from '@casoon/castwright-astro/TerminalDemo.astro';
import demo from '../demos/install.terminal.yaml';
---

<TerminalDemo demo={demo} autoplay loop />
```

The component inlines the compiled cast as JSON (no fetch, no parser in the bundle), emits the
final terminal text as the light-DOM accessibility fallback, and reserves the terminal's height
so hydration does not shift the page.

Pass `src="/demo.cast"` instead of `demo` to fetch a pre-built cast at runtime.

`demo` and `src` aside, the props mirror the element's attributes: `autoplay`, `loop`,
`loopDelay`, `poster`, `cols`, `rows`, `label`, `title`, `chrome`, `controls`, `class`.

## Licence

MIT
