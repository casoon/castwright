# @casoon/castwright-player

## 0.3.0

No changes in this release.

## 0.2.1

No changes in this release.

## 0.2.0

### Minor Changes

- 1b77b2f: The player works under a strict Content-Security-Policy with no `'unsafe-inline'` for
  styles, such as Astro's hash-based `security.csp`. Its CSS is adopted as a constructed
  stylesheet instead of being injected as a `<style>` element, and the styles xterm.js
  creates at run time — `<style>` elements for theme and cell size, `style` attributes for
  24-bit colours — are mirrored or re-applied through the CSSOM. Previously the terminal
  rendered unstyled and colourless under such a policy.

### Patch Changes

- e5f6193: The window frame hugs the terminal instead of stretching across a wide page. It used to
  fill the container with the terminal centred inside, which left a wide empty band on
  either side; it now caps its width at the terminal's own and still shrinks (and scales
  the terminal) in a narrow container.
- 1b77b2f: Page styles now override the player's defaults as the theming docs describe. The
  defaults sat on a plain `castwright-demo` selector in a stylesheet that sorts after the
  page's own, so `castwright-demo { --castwright-radius: 4px }` lost at equal specificity;
  they are now wrapped in `:where()`, which gives them none.
- ac839f6: Seeking or restarting during playback no longer leaves stale output on screen. xterm.js
  parses written data asynchronously, so resetting it immediately let output still queued
  from before the reset land on the fresh screen, and a demo could show two runs' worth of
  text. The reset now goes through the same queue.

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
