# @casoon/castwright

The DSL parser, the compiler to [asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/),
the `castwright` CLI and the Vite plugin.

Part of [castwright](https://github.com/casoon/castwright) — see the repository README for the
full picture, and [`@casoon/castwright-player`](https://www.npmjs.com/package/@casoon/castwright-player)
for playing the result in a browser.

## Install

```sh
pnpm add -D @casoon/castwright
```

## CLI

```sh
castwright build demo.terminal.yaml -o dist/demo.cast   # compile to asciicast v2
castwright validate demos/*.terminal.yaml               # check without writing
castwright dev demo.terminal.yaml                       # watch + live preview
```

`castwright dev` additionally needs `vite` and `@casoon/castwright-player` installed — both are
optional peer dependencies, so `build` and `validate` work without them.

## Vite plugin

```js
// vite.config.js
import { castwright } from '@casoon/castwright/vite';

export default { plugins: [castwright()] };
```

A `*.terminal.yaml` import then evaluates to `{ cast, finalFrame }`: the compiled cast for the
player, and the end state as plain text for the no-JavaScript fallback.

## Programmatic use

```ts
import { compile, parse, serializeCast } from '@casoon/castwright';

const cast = compile(parse(source, 'demo.terminal.yaml'));
await writeFile('demo.cast', serializeCast(cast));
```

`serializeCast` writes the spec's own field names (`fg`, `bg`, a colon-joined `palette`), so the
output is readable by `asciinema play`, `agg` and `svg-term-cli`. `toWireHeader`/`fromWireHeader`
expose that conversion if you need it directly.

## Licence

MIT
