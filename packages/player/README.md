# @casoon/castwright-player

`<castwright-demo>` — a real-VT web terminal player built on [xterm.js](https://xtermjs.org/).

Part of [castwright](https://github.com/casoon/castwright) — see the repository README for the
full picture. This package has no runtime dependency on
[`@casoon/castwright`](https://www.npmjs.com/package/@casoon/castwright): a cast is
self-describing, so the player never needs the compiler in the browser.

## Install

```sh
pnpm add @casoon/castwright-player
```

## Use

```html
<castwright-demo src="/demo.cast" autoplay loop>
  <pre>$ pnpm add -D @casoon/castwright</pre>
</castwright-demo>
<script type="module">
  import { defineCastwrightDemo } from '@casoon/castwright-player';
  defineCastwrightDemo();
</script>
```

The element uses the light DOM and keeps its original children as the accessibility fallback, so
the demo is readable before — and without — JavaScript. xterm.js is only instantiated once the
element scrolls into view.

It reads a cast from, in order of cost: a `cast` property set from JavaScript, an inlined
`<script type="application/json" data-castwright-cast>` (what the Vite plugin emits at build
time), or the `src` attribute, fetched at runtime.

### Attributes

| Attribute | Meaning |
|---|---|
| `src` | URL of an asciicast v2 file |
| `autoplay`, `loop` | Start on view; repeat |
| `loop-delay` | Milliseconds held on the final frame before looping (default 2000) |
| `chrome` | `window` (default) or `none` |
| `controls` | `visible` (default), `hover` or `none` |
| `poster` | Seconds to render as the initial frame |
| `cols`, `rows` | Override the cast's geometry |
| `title-text`, `label` | Window title; accessible name |

## Programmatic API

```ts
import { mount } from '@casoon/castwright-player';

const handle = mount(hostElement, cast, { autoplay: true });
handle.play();
handle.seek(3.5);
handle.destroy();
```

## Licence

MIT
