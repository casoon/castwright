---
title: CLI
description: castwright build, validate and dev.
order: 2
---

Errors go to stderr, results to stdout, so the commands compose.

## build

```
castwright build <file> [-o <dir>] [--format <name>]
```

Compiles a `*.terminal.yaml` to `<dir>/<name>.cast` and prints the path. `-o` defaults to
`dist`; `--format` currently accepts `cast`.

```
$ castwright build demo.terminal.yaml
dist/demo.cast
```

The output is asciicast v2 — newline-delimited JSON — and it is deterministic: the same
input compiles to the same bytes on every machine.

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
svg-term --in dist/demo.cast --out demo.svg --window
agg dist/demo.cast demo.gif
```

The header carries the spec's own field names — `fg`, `bg` and a colon-joined `palette`
of 8 or 16 colours — so any v2 reader understands it. asciicast v2 has no field for the
cursor colour, so a theme's cursor tint is not written to the file; a player falls back to
the foreground colour, which is the terminal default anyway.

It works the other way too: `<castwright-demo src="recording.cast">` plays a real
`asciinema rec` recording, with no castwright involved in making it. Resize (`r`) events
are applied as they happen and input (`i`) events are skipped, since keystrokes are not
screen output.
