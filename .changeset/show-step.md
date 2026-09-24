---
'@casoon/castwright': minor
---

New `show:` step: a file's contents on screen, syntax-highlighted at build time with
Shiki and written into the cast as 24-bit colour — nothing extra reaches the browser.
Options: `lines` (a line or a range), `lang` (default: the extension), `theme` (default:
the Shiki theme matching the terminal theme), plus `delay` and `pause`.

Shiki is an optional peer dependency, loaded only when a script uses `show:`.
`resolveShowSteps()` runs between `parse()` and `compile()`, which stays synchronous and
free of I/O; the CLI and the Vite plugin call it, and the plugin registers the shown file
so editing it recompiles the demo. Errors — a missing file, a range past its end, an
unknown language — point at the step's line and column.
