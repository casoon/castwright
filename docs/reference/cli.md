---
title: CLI
description: castwright build, validate and dev.
order: 2
---

Errors go to stderr, results to stdout, so the commands compose.

## build

```
castwright build <file> [-o <dir>] [--format cast|svg|gif|mp4] [--no-chrome] [--loop-delay <ms>]
```

Compiles a `*.terminal.yaml` to `<dir>/<name>.<format>` and prints the path. `-o` defaults
to `dist`, `--format` to `cast`.

```
$ castwright build demo.terminal.yaml
dist/demo.cast
```

The output is asciicast v2 — newline-delimited JSON — and it is deterministic: the same
input compiles to the same bytes on every machine.

### Formats

| Format | Output | Needs |
|---|---|---|
| `cast` | asciicast v2, for the player and the asciinema tools | — |
| `svg` | One self-contained animated SVG: real text, no script, loops | — |
| `gif` | Animated GIF, rendered by [agg](https://github.com/asciinema/agg) | `agg` on `PATH` |
| `mp4` | h264 video, agg's GIF re-encoded by ffmpeg | `agg` and `ffmpeg` on `PATH` |

`svg` is the one for a README or a page that should not load a player. The animation is
pure CSS with no script and no external references, so it plays inside a plain `<img>` —
which is how GitHub embeds images in a README. The
theme, bold, italic, dim and underline come across; the column grid is pinned with
`textLength`, so a different monospace font on the viewer's machine changes glyph shapes
but never alignment. `prefers-reduced-motion` shows the finished screen.

```markdown
![castwright demo](docs/demo.svg)
```

Two options apply to `svg` only:

| Option | Effect |
|---|---|
| `--no-chrome` | Drops the window title bar with the traffic lights. |
| `--loop-delay <ms>` | How long the finished screen holds before the loop restarts. Default 2000. |

Size grows with the length of the demo, at roughly 2 KB per second of typing and output
before compression — about 50 KB for 20 seconds, 120 KB for a minute. Each line of the
terminal is animated on its own, so a keystroke or a scroll adds a few bytes rather than
a copy of the screen. For a README, keep demos short; the GIF of the same demo is usually
larger.

`gif` and `mp4` are for places that take nothing else — social posts, slides. castwright
does not rasterise anything itself; agg does, using the theme in the cast header, and a
missing tool is reported with an install hint and a non-zero exit.

## validate

```
castwright validate <file>...
```

Checks every file given, not just up to the first failure, and exits non-zero if any has
an error. Silent when everything is fine, which makes it usable as a pre-commit hook.

```
$ castwright validate demos/*.terminal.yaml
demos/broken.terminal.yaml:4:5: step 'clear' must be `true` (or omitted entirely)

    - clear: false
      ^
```

Warnings are printed but do not fail the command.

Glob patterns are not expanded by the command itself: a pre-commit hook passes an explicit
file list, and a shell has already expanded `*.terminal.yaml` before the process starts.

## dev

```
castwright dev <file> [--port <n>]
```

Serves one demo and reloads it on save. Edit the YAML, watch the terminal in the browser
change.

`dev` needs Vite **and** `@casoon/castwright-player`: it serves a real page with a real
player on it. Both are optional dependencies — a project that only runs `castwright build`
in CI should not have to install either — so if one is missing, the command says so and
names the fix.

```bash
pnpm add -D vite @casoon/castwright-player
```

## asciicast interop

The output is a standard asciicast, so the rest of that ecosystem works on it:

```bash
castwright build demo.terminal.yaml
asciinema play dist/demo.cast
```

The header carries the spec's own field names — `fg`, `bg` and a colon-joined `palette`
of 8 or 16 colours — so any v2 reader understands it. asciicast v2 has no field for the
cursor colour, so a theme's cursor tint is not written to the file; a player falls back to
the foreground colour, which is the terminal default anyway.

It works the other way too: `<castwright-demo src="recording.cast">` plays a real
`asciinema rec` recording, with no castwright involved in making it. Resize (`r`) events
are applied as they happen and input (`i`) events are skipped, since keystrokes are not
screen output.
