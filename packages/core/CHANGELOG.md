# @casoon/castwright

## 0.2.1

### Patch Changes

- 97d8b1f: `--record` no longer folds long lines when it rewrites the file. A recorded line stays
  exactly as the program printed it, and the rest of the file keeps its layout.
- @casoon/castwright-player@0.2.1

## 0.2.0

### Minor Changes

- 881c875: New `exec:` step: runs a real command in a pseudo-terminal the size of the demo and
  records its output with the timing it had. Options: `cwd`, `env`, `timeout`, `idle`,
  plus `speed`, `prompt` and `pause` as for `run:`.
  
  Nothing runs unless allowed: `castwright build --allow-exec`, `castwright dev
  --allow-exec`, or `castwright({ allowExec: true })` in the Vite plugin.
  `castwright build --allow-exec --record` runs the commands once and rewrites the file
  with `run:` + `output: { raw }`, after which the demo replays the same bytes on every
  build. The build warns on token-like output, the home directory path, a non-zero exit,
  and `exec:` in CI.
  
  node-pty is an optional peer dependency, imported only when a script uses `exec:`; a
  plain install pulls no native build.
- 5971ee8: New `show:` step: a file's contents on screen, syntax-highlighted at build time with
  Shiki and written into the cast as 24-bit colour — nothing extra reaches the browser.
  Options: `lines` (a line or a range), `lang` (default: the extension), `theme` (default:
  the Shiki theme matching the terminal theme), plus `delay` and `pause`.
  
  Shiki is an optional peer dependency, loaded only when a script uses `show:`.
  `resolveShowSteps()` runs between `parse()` and `compile()`, which stays synchronous and
  free of I/O; the CLI and the Vite plugin call it, and the plugin registers the shown file
  so editing it recompiles the demo. Errors — a missing file, a range past its end, an
  unknown language — point at the step's line and column.
- e5f6193: `castwright build --format svg|gif|mp4`. `svg` is a self-contained animated SVG — real
  text, no script, the cast's theme, reduced-motion aware — rendered by castwright itself on
  `@xterm/headless`. `gif` shells out to agg and `mp4` additionally to ffmpeg; a missing
  tool is reported with an install hint.
- ac839f6: `--format svg` output is about a fifth of its previous size for longer demos — a
  53-second demo went from 570 KB to 120 KB — and places non-ASCII glyphs exactly.
  
  - Timelines follow terminal lines instead of whole frames: typing changes one line, and
    scrolling moves one strip of lines rather than redrawing every row.
  - Each non-ASCII glyph (emoji, CJK, symbols) sits at its own column instead of being
    stretched along with its neighbours, which shifted them by up to half a cell.
  - New `--no-chrome` and `--loop-delay <ms>` options for `--format svg`.
  
  Checked frame by frame against the previous encoding in Chromium and WebKit, including
  scrolling, `clear` and the alternate screen, and seen animating in a GitHub README.

### Patch Changes

- 200608e: `--format svg`: escape `"` when writing XML. The cast's title is interpolated into the
  root element's `aria-label`, so a title containing a double quote closed the attribute
  early and the document stopped being well-formed XML — which for an SVG means a browser
  renders nothing at all, with no error at build time.
- Updated dependencies [e5f6193]
- Updated dependencies [1b77b2f]
- Updated dependencies [ac839f6]
- Updated dependencies [1b77b2f]
  - @casoon/castwright-player@0.2.0

## 0.1.0

### Minor Changes

- 2a19c55: Write and read real asciicast v2, validate every numeric DSL value, and stop shipping tests
  
  **The cast files were not asciicast v2.** The header carried xterm's field names
  (`foreground`, `background`, `cursor`, a palette array) where the spec has `fg`, `bg`
  and a colon-joined `palette`, so a `.cast` loaded in castwright and nowhere else —
  while the documentation promised `asciinema play` and `agg` compatibility. Reading a
  real recording failed the same way: the palette string was indexed as an array, giving
  xterm `black: '#'`, `red: '1'`. The in-memory model and the file format are now
  separate, with one conversion module on each side of the boundary.
  
  asciicast v2 has no field for the cursor colour, so it is no longer written to a
  `.cast`; readers fall back to the foreground, which is the terminal default. Casts
  inlined by the Vite plugin or the Astro component still carry it.
  
  The output is now checked against the reference implementations rather than against our
  own reading of the spec: `pnpm test:compat` runs every example through `asciinema` and
  `agg`, asserts the theme survives into asciinema's own model and that agg renders with
  it, and fails if the old header spelling can still be read.
  
  **The player is importable during server-side rendering.** It never was: xterm.js
  resolves to its CJS build under Node, so `import { Terminal }` threw at parse time, and
  `class extends HTMLElement` is a ReferenceError before any guard could run. SvelteKit,
  Nuxt, Remix, SolidStart and Qwik can now import the package from a module that also runs
  on the server — it registers nothing, and what renders is the light-DOM fallback.
  
  **Resize and input events are handled.** `r` events are applied at the point in the
  stream where they happened, in the player and in the final-frame renderer; `i` events
  are skipped rather than replayed. Previously both were treated as chapter markers.
  
  **Numeric DSL values are range-checked.** `cols: 0.5`, `rows: -2`, `pause: -700` and
  `.inf` all parsed before; a negative pause compiled to a cast whose timestamps ran
  backwards. `terminal.cols`/`rows` are now whole numbers from 1 to 1000, every duration
  is 0 to one hour, `seed` is a uint32, and the player applies the same bounds to its
  attributes instead of handing xterm a 0.
  
  **`finalFrameText` returns the visible screen**, not the whole scrollback, so a demo
  that prints a thousand lines no longer hands a screen reader all thousand. Pass
  `includeScrollback: true` for the old behaviour.
  
  **`<castwright-demo>` survives being removed and re-inserted.** A fetch still in flight
  is aborted, a stale response can no longer mount a second player, and the original
  children are restored instead of being nested one level deeper on every cycle.
  
  **The published tarballs are clean.** Compiled tests are no longer built into `dist`,
  and every package now ships a README and a LICENCE. A new pack smoke test installs all
  three tarballs into a throwaway project and checks the bin, the exports and the written
  header for real.
  
  `castwright dev` declares `@casoon/castwright-player` as the optional peer dependency it
  always needed, and says so when it is missing instead of failing inside Vite's module
  graph.

### Patch Changes

- Updated dependencies [2a19c55]
  - @casoon/castwright-player@0.1.0
