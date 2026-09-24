---
title: Quickstart
description: A demo on a page, in about five minutes.
order: 2
---

This assumes Astro; [Installation](../installation/) covers the other setups.

## 1. Write a demo

```yaml
# src/demos/hello.terminal.yaml
version: 1

terminal:
  cols: 56
  rows: 7

defaults:
  speed: 60

steps:
  - run: echo "typed at 60ms per character"
  - output: "typed at 60ms per character\n"
  - wait: 800
  - type: "instant, "
    speed: 0
  - type: "then slow"
    speed: 120
  - key: enter
  - wait: 1200
```

## 2. Put it on a page

```astro
---
import TerminalDemo from '@casoon/castwright-astro/TerminalDemo.astro';
import hello from '../demos/hello.terminal.yaml';
---

<TerminalDemo demo={hello} autoplay loop />
```

That is the whole integration. The demo is compiled during `astro build`; the YAML parser
and the compiler never reach the browser.

<Callout type="note">
`demo` takes an **import**, not a path string. A path would have to be resolved relative
to the calling page, which the component cannot do — and an import is type-checked, so
the build fails when the file moves instead of the page silently going blank.
</Callout>

## 3. Iterate

The tightest loop is the CLI's dev server: it watches one file and reloads on save.

```bash
pnpm exec castwright dev src/demos/hello.terminal.yaml
```

## What to read next

- [Writing demos](../../guides/writing-demos/) — pacing, prompts, colour.
- [DSL reference](../../reference/dsl/) — every key.
- [Accessibility](../../guides/accessibility/) — what the player does for you, and the one
  thing it cannot do for you.
