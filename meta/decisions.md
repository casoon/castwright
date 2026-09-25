# Decisions

Currently valid decisions. When one is superseded, this file describes the new state —
history lives in Git.

## Do not invent a terminal standard

The project defines its own authoring DSL and nothing else. ANSI/VT semantics come from
xterm.js; the recording/interchange format is asciicast v2.

*Reason:* cursor movement, `\r`, line erase, scroll regions, SGR state and double-width
cells are a deep, well-solved problem. Reimplementing them is where comparable projects
quietly fail.

*Consequence:* the project ships no ANSI parser of its own. Anything that requires
interpreting escape sequences goes through a terminal engine, including in the exporters.

## asciicast v2 is the canonical timeline

The compiler produces asciicast v2. Every renderer — web player, SVG, video — consumes
asciicast, not the parsed DSL.

*Reason:* it gives one shared input for all renderers, makes the build artifact a
diffable text file, and means existing `asciinema rec` recordings play in the same
player for free.

*Consequence:* a renderer never imports the parser. The DSL is an authoring convenience
that stops existing after the compile step.

## The wire format is not the in-memory model

`CastTheme` uses xterm's field names (`foreground`, `background`, `cursor`, a palette
array) because that is what the player hands to xterm. asciicast v2 uses `fg`, `bg` and
a colon-joined palette string, and defines no cursor colour at all.
`compiler/wire.ts` is the only place the two meet; `serializeCast` is the only thing
that writes the file spelling, and the player's `cast-io.ts` is the only thing that reads
it.

*Reason:* for a while there was no distinction, so casts were written with xterm's field
names and loaded in castwright and nowhere else — while the documentation promised
`asciinema play` and `agg` compatibility. Reading a real recording went wrong the same
way: a palette string indexed as an array gave xterm `black: '#'`, `red: '1'`.

*Consequence:* the cursor colour does not survive a round trip through a `.cast` file;
the foreground is used instead, which is xterm's own default. Adding a non-standard key
to keep it would give back the compatibility the split exists to guarantee. The inlined
form the Vite plugin emits is our own JSON, not a cast file, so it does keep it.

## Two IR levels, not one

`Script` (parsed DSL, relative timing, semantic steps) and `Cast` (absolute timestamps,
raw bytes) are separate representations. The compiler is the only thing that crosses
from one to the other.

*Reason:* the concept's single "timeline" conflated authoring semantics with wire
output, which would have coupled the DSL to xterm.js.

*Consequence:* new DSL features are added to `Script` and lowered in the compiler;
renderers stay untouched.

## xterm.js for both web and exporters

`@xterm/xterm` renders in the browser; `@xterm/headless` computes terminal state for
SVG and frame export.

*Reason:* one engine means one set of semantics. If the SVG output and the web output
came from different VT implementations, they would drift on exactly the edge cases
(wide glyphs, reflow, erase) that a demo tool is judged on.

*Consequence:* the player builds its own transport controls and chrome on top of
xterm.js rather than embedding `asciinema-player`. That is more work in the player
package and is accepted.

## Simulation before execution

Demos render authored `output:`. Running real commands (`exec:`) is opt-in per build
and meant to be recorded back into authored output.

*Reason:* documentation demos must be deterministic and reproducible in CI. Real
execution brings machine-dependent output, timing, and secrets into a build artifact.

*Consequence:* `exec:` runs only with `--allow-exec` / `allowExec: true`, never by
default, and `--record` turns a run into `run:` + `output: { raw }` so the published demo
replays fixed bytes. The build warns on token-like output, the home directory path, a
non-zero exit, and `exec:` in CI.

## Optional peer dependencies instead of feature packages

Features that need a heavy or native dependency — Shiki for `show:`, node-pty for
`exec:` — live in `@casoon/castwright` and import it dynamically, only when a script
uses the feature. The dependency is an optional peer; without it the build stops with a
positioned error naming the package to install.

*Reason:* a package costs a release, a changelog and a support surface (see "Three
published packages"), and a dynamic import already keeps the CLI installable without a
native build — the pack smoke test checks that a plain install pulls no node-pty.

## Deterministic output by default

The same input file compiles to a byte-identical `.cast` on every machine. Typing
jitter is off unless requested, and when requested it is seeded.

*Reason:* generated casts are meant to be committable and reviewable in a diff.

*Consequence:* no `Date.now()`, no unseeded randomness, and no locale- or
environment-dependent formatting anywhere in the compile path.

## The custom element is the delivery surface, the Vite plugin is the reach

`<castwright-demo>` is the documented default way to put a demo on a page, rendered into
light DOM. The build-time compile ships as a plain Vite plugin at
`@casoon/castwright/vite`; the Astro integration is ergonomics on top of it.

*Reason:* the compile step is bundler-specific, not framework-specific. One Vite plugin
covers Astro, SvelteKit, Nuxt, Remix, SolidStart, Qwik and VitePress; the custom element
covers everything else, including plain HTML, MDX and server-rendered templates. A
per-framework package would add convenience and no capability.

*Consequence:* no shadow DOM. xterm.js measures character size with a probe element and
checks DOM attachment, both of which have known failure modes inside a shadow root.
Styles are scoped by a `castwright-` class prefix instead.

*Consequence:* the element's light-DOM children are the accessibility fallback — an
undefined custom element renders its children, so the terminal's final text is present as
real text before the script loads and if it never loads.

*Consequence:* `src` is resolved at build time where a bundler exists, and otherwise
points at a pre-built `.cast`. The YAML parser is never shipped to a browser outside an
explicitly separate playground entry point.

## Three published packages

`@casoon/castwright` (parser, compiler, themes, and the `castwright` bin),
`@casoon/castwright-player` (xterm.js, browser only), `@casoon/astro-castwright`
(Vite plugin and component).

*Reason:* the cut follows the runtime boundary — pure/Node, browser, framework — and
nothing else. A separate CLI package was considered and rejected: it is a few hundred
lines over an arg parser, and a package costs a release, a changelog and a support
surface. Names were additionally reserved for `-svg`, `-video` and `-tape`; reserving is
free, shipping is not, and those may never exist. The Astro package is `astro-castwright`, not
`castwright-astro`, to match CASOON's other Astro integrations (`@casoon/astro-*`).

*Consequence:* `player` has **no runtime dependency** on `core`. A cast is
self-describing — the header carries size, title and palette — so the player needs only
the `Cast` type, which is erased at build time. Themes are therefore resolved by the
compiler, never shipped to the client.

## The project is called `castwright`

"Cast" as in asciicast, plus *-wright* as in playwright or shipwright: a maker of casts.
The CLI binary is `castwright`.

*Reason:* the working name `terminal-demo` is taken on npm by an actively maintained
project with a large functional overlap.
Sharing a name with a competitor costs discoverability and invites confusion in issues,
and renaming before the first publish is free. `castwright` is available on npm both
scoped and unscoped, and its only GitHub namesakes are an audiobook generator and an ML
data tool — nothing in this domain.

*Consequence:* the bin-name collision is gone. `npx castwright` is unambiguous, so the
documentation can use the short form everywhere.

*Consequence:* the custom element is `<castwright-demo>`, not a generic `<terminal-demo>`
that could collide in a page using both projects.

*Consequence:* the file extension stays `*.terminal.yaml` and the Astro component stays
`<TerminalDemo />`. Both name what the thing *is*, not which tool reads it — the same
reason `*.test.ts` is not named after the test runner.

## npm scope `@casoon/castwright*`

Packages publish under the `@casoon` scope.

*Reason:* an established scope with a clear origin, and no new npm organization to
maintain.

*Consequence:* package directories inside the monorepo stay short (`core`, `player`,
`astro`); the published name is set in each `package.json`.

*Consequence:* the unscoped `castwright` is reserved on npm (`castwright@0.0.1`, a
placeholder with no code, published 2026-09-23) so that the situation which forced this
rename cannot repeat. Whether it later becomes a real alias for `@casoon/castwright` is
a separate question. The reservation only buys time — npm can transfer clearly unused
names, so it holds only until something working ships.

## MIT license

*Reason:* matches the surrounding ecosystem (VHS is MIT), maximizes adoption, and is
compatible with the Apache-2.0 dependencies in the asciinema ecosystem.

*Consequence:* dependencies must be MIT/ISC/BSD/Apache-2.0 compatible. Copyleft
dependencies are not acceptable in published packages.

## Documentation language

Everything in the repository is English: `meta/`, the README, the website, the DSL
keywords and the CLI's own output.

*Reason:* the project is intended to be publishable and to accept outside contributors.

*Consequence:* no mixed-language files. Early German working notes stayed out of the
repository rather than being carried along as dead weight.

## SVG export built, GIF/MP4 delegated to agg

`--format svg` is castwright's own renderer on `@xterm/headless`;
`--format gif` shells out to `agg`, `--format mp4` additionally to `ffmpeg`.

*Reason:* `svg-term-cli` was evaluated first, as planned, and failed on concrete points:
it ignores the theme in the cast header (renders its own fixed palette), drops italic and
dim, positions text without `textLength` so columns shear with the viewer's font, and has
been unmaintained since 2022 with deprecated dependencies (including an `xmldom` with a
known CVE). `agg` passed: it reads the header theme and renders bold, italic, dim and
underline correctly, so rasterising ourselves would only duplicate it. Both tools stay
external and are never bundled.
