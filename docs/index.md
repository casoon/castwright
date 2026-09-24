---
title: Documentation
description: Write a YAML file describing a terminal session; castwright compiles it to asciicast v2 and plays it as a real terminal.
---

castwright turns a small YAML file into a terminal demo you can put on a page. Three
pieces, each doing one job:

- a **DSL** you author by hand — no recording session to get right on the seventh take;
- a **compiler** that turns it into [asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/),
  deterministically, so the output is a text file you can commit and read in a diff;
- a **player** built on [xterm.js](https://xtermjs.org/), so what renders is an actual
  terminal emulator rather than coloured spans pretending to be one.

It is explicitly *not* a terminal recorder and *not* a terminal emulator. ANSI and VT
handling is xterm.js's job; the interchange format already exists. castwright's own
substance is the authoring language, the compiler, the player and the exporters.

## Where to start

- [Installation](./getting-started/installation/) — the three packages and which you need.
- [Quickstart](./getting-started/quickstart/) — a demo on a page in about five minutes.
- [Writing demos](./guides/writing-demos/) — how the DSL fits together.
- [DSL reference](./reference/dsl/) — every key, with examples.

## How it compares

| Tool | Authoring | Terminal | Web output |
| --- | --- | --- | --- |
| [asciinema](https://asciinema.org/) | Record a real session | Real VT | Mature player |
| [VHS](https://github.com/charmbracelet/vhs) | Declarative `.tape` | Real VT, via headless Chrome | GIF only |
| **castwright** | Declarative YAML, compiled | Real VT (xterm.js) | Framework-agnostic player |

The combination castwright is after: authored rather than recorded, deterministic (same
input, same bytes), browser-free at build time, and web-native at output.
