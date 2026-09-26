---
title: VHS tapes
description: Build a VHS .tape with castwright — what is translated, what is not.
order: 5
---

castwright reads [VHS](https://github.com/charmbracelet/vhs) `.tape` files next to
`*.terminal.yaml`: `castwright build`, `validate` and `dev` take them, and the Vite plugin
compiles `import demo from './demo.tape'`. An existing tape becomes a web demo, an SVG or a
GIF without a headless browser.

```bash
castwright build demo.tape --format svg --allow-exec
```

The promise is a documented subset, not VHS compatibility. Everything below is either
translated, ignored on purpose, or rejected with a message that points at the line.

## Commands run for real — with `--allow-exec`

A tape drives a real shell: `Type "ls"` + `Enter` means "run `ls`". With `--allow-exec`
(`allowExec: true` in the Vite plugin) each typed line that ends in `Enter` becomes an
[`exec`](../dsl/#exec) step: it is typed, run with `/bin/sh -c` in a pseudo-terminal, and
its output is recorded with the timing it had. `Env` sets environment variables for the
commands after it.

Without `--allow-exec` the typing is shown and nothing answers; the build warns once that
the output is missing.

Each command runs in its own shell, so state does not carry from one visible command to
the next. Commands typed between `Hide` and `Show` are the exception: they run silently
before every visible command, so a hidden `cd` or `export` still applies. Keep them
cheap — they run once per command.

A line edited with keys other than `Backspace` (arrows, `Tab`) is typed but not run.
`Ctrl+C` on a typed line drops it, as the shell does. Programs that wait for keys — TUIs,
pagers, prompts — cannot be driven: each command gets no input and must finish on its
own within 60 seconds.

`--record` does not apply to a tape: it writes the output into a `.terminal.yaml`, and a
tape has nowhere to keep it.

## Commands

| Command | Becomes |
|---|---|
| `Type "…"`, `Type@<speed> "…"` | typing; a typed line + `Enter` is a command (see above) |
| `Enter`, `Backspace`, `Tab`, `Escape`, `Space`, `Up`, `Down`, `Left`, `Right` | the key; a count repeats it (`Backspace 3`) |
| `Ctrl+C`, `Ctrl+D`, `Ctrl+L` | the key |
| `Sleep <time>` | a pause — `500ms`, `2s`, a bare number is seconds |
| `Hide`, `Show` | nothing is shown in between |
| `Env NAME "value"` | environment for the commands after it |
| `Copy "…"`, `Paste` | `Paste` types what was copied |
| `Wait`, `Require` | ignored — a command is already waited for; a missing program fails its step |
| `Output`, `Screenshot` | ignored with a warning — the format is `--format` |
| `Source` | error — copy the other tape's commands in |

Other keys (`Delete`, `Home`, `End`, `PageUp`, `PageDown`, `Insert`, `ScrollUp`,
`ScrollDown`, other `Ctrl+`/`Alt+`/`Shift+` combinations) are skipped with a warning.
Anything else is an error.

## Settings

| Setting | Becomes |
|---|---|
| `Width`, `Height`, `FontSize`, `Padding`, `LineHeight` | the grid size, approximated from pixels |
| `Columns`, `Rows` | the grid size, exactly |
| `TypingSpeed` | the typing speed |
| `Theme` | the matching [theme](../theming/) by name (`"Catppuccin Mocha"` → `catppuccin-mocha`); others fall back to `default` with a warning, JSON themes too |
| `CursorBlink` | whether the cursor blinks |
| `Shell` | warns when it is not sh-compatible, since commands run with `/bin/sh` |
| `PlaybackSpeed` | ignored with a warning |
| `FontFamily`, `LetterSpacing`, `Framerate`, `Margin`, `MarginFill`, `WindowBar`, `WindowBarSize`, `BorderRadius`, `LoopOffset`, `WaitTimeout`, `WaitPattern` | ignored — they only style VHS's video |

A tape that sets nothing gets VHS's defaults: 1200 × 600 px at font size 22, which is 81
× 18 cells, typing at 50 ms per character, and VHS's `>` prompt.
