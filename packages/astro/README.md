# @casoon/astro-castwright

The Astro integration for [castwright](https://github.com/casoon/castwright): automatic Vite
plugin registration and a `<TerminalDemo />` component.

Deliberately thin. The Vite plugin in [`@casoon/castwright`](https://www.npmjs.com/package/@casoon/castwright)
does the compiling and `<castwright-demo>` from
[`@casoon/castwright-player`](https://www.npmjs.com/package/@casoon/castwright-player) does the
playing; both work in Astro without this package. It exists so you do not have to wire them
yourself.

## Install

```sh
pnpm add @casoon/astro-castwright
```

```js
// astro.config.mjs
import castwright from '@casoon/astro-castwright';

export default defineConfig({ integrations: [castwright()] });
```

## Use

```astro
---
import TerminalDemo from '@casoon/astro-castwright/TerminalDemo.astro';
import demo from '../demos/install.terminal.yaml';
---

<TerminalDemo demo={demo} autoplay loop />
```

The component inlines the compiled cast as JSON (no fetch, no parser in the bundle), emits the
final terminal text as the light-DOM accessibility fallback, and reserves the terminal's height
so hydration does not shift the page.

The reserved height is the row count (the cast's, or the `rows` prop) plus the screen padding,
the title bar (unless `chrome="none"`) and the transport row (unless `controls` is `hover` or
`none`), using chrome heights measured from the player. Row height depends on the visitor's
monospace font, and a terminal wider than its container is scaled down by the player, so the
reservation is exact only at the authored size; it is `min-height` only and is dropped as soon
as the player has measured for real.

Pass `src="/demo.cast"` instead of `demo` to fetch a pre-built cast at runtime. There is no
compiled cast to take the accessibility fallback from, so give it as slot content:

```astro
<TerminalDemo src="/demo.cast" rows={20}>
  <pre>$ npm install castwright
added 42 packages</pre>
</TerminalDemo>
```

Without a slot the build warns, and assistive technology gets an empty box until the player
loads. Without `demo`, the height is only reserved when `rows` is set.

`demo` and `src` aside, the props mirror the element's attributes: `autoplay`, `loop`,
`loopDelay`, `poster`, `cols`, `rows`, `label`, `title`, `chrome`, `controls`, `class`.

## Licence

MIT
