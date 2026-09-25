---
title: DSL reference
description: Every key of the castwright DSL.
order: 1
---

File extension: `*.terminal.yaml`. Keywords are English and lowercase. Unknown keys are
errors, not warnings — a silently ignored typo in a demo file is discovered at review
time, which is too late.

## Document

```yaml
version: 1        # required, must be 1

terminal:         # required
  title: Casoon CLI
  cols: 90
  rows: 24
  theme: catppuccin-mocha
  prompt: "$ "
  cursor: block

defaults:         # optional
  speed: 45       # ms per character
  pause: 300      # ms after each step

seed: 42          # required only when a step uses jitter

steps:            # required
  - run: npm install
```

### terminal

| Key | Default | Notes |
| --- | --- | --- |
| `title` | — | Shown in the window chrome, not inside the terminal. |
| `cols` | `80` | Written to the asciicast header. |
| `rows` | `24` | Written to the asciicast header. |
| `theme` | `default` | One of the seven bundled names; see [Theming](../theming/). |
| `prompt` | `"$ "` | Supports markup, so a coloured prompt is a one-liner. |
| `cursor` | `block` | `block`, `bar` or `underline`; a mapping adds `blink: false`. |

### defaults

| Key | Default | Notes |
| --- | --- | --- |
| `speed` | `45` | Milliseconds per character for `run` and `type`. |
| `pause` | `300` | Milliseconds after each step. |

## Steps

Exactly one primary key per step.

| Key | Value | Meaning |
| --- | --- | --- |
| `run` | string | Write the prompt, type the text, press Enter. Sugar for `type` + `key: enter`. |
| `type` | string | Type text at the cursor. No prompt, no Enter. |
| `key` | see below | Send a single key. |
| `output` | string or `{ raw }` | Emit program output. Not typed. |
| `show` | path | Emit a file's contents, syntax-highlighted. See [below](#show). |
| `exec` | command | Run a real command and record its output. See [below](#exec). |
| `wait` | ms | Pause. |
| `clear` | `true` | Clear the screen. |
| `prompt` | string | Change the prompt from here on. |
| `marker` | string | Named chapter marker, written to the cast as an asciicast `m` event. |

`key` accepts `enter`, `tab`, `escape`, `backspace`, `up`, `down`, `left`, `right`,
`ctrl+c`, `ctrl+d` and `ctrl+l`.

### Modifiers

| Key | Applies to | Meaning |
| --- | --- | --- |
| `speed` | `run`, `type` | Milliseconds per character. `0` is instant. |
| `jitter` | `run`, `type` | 0–1, varies the per-character delay. Requires a top-level `seed`. |
| `delay` | `output`, `show` | Milliseconds between output *lines*. Default 0 — the whole block at once. |
| `pause` | any | Milliseconds after this step. |
| `prompt` | `run`, `type` | `false` suppresses the prompt for that step. |

### Ranges

Every numeric key is range-checked at parse time, with the file, line and column of the
offending value.

| Key | Accepts |
| --- | --- |
| `terminal.cols`, `terminal.rows` | Whole numbers from 1 to 1000. |
| `speed`, `pause`, `delay`, `wait` | Milliseconds from 0 to 3600000 (one hour). |
| `jitter` | 0 to 1. |
| `seed` | A whole number from 0 to 4294967295. |

`.inf` and `.nan` are numbers as far as YAML is concerned and are rejected here.

<Callout type="note">
`prompt` means two things depending on company. Alongside `run` or `type` it is the
boolean modifier above. Alone, it is the primary step that changes the prompt from there
on. The presence of `run`/`type` is what decides.
</Callout>

### show

`show` puts a file on screen with syntax highlighting — the output of a `cat`, without
writing it out by hand in `output:`.

```yaml
steps:
  - run: cat astro.config.ts
  - show: snippets/astro.config.ts   # relative to this .terminal.yaml
    lines: 1-7                       # optional: a line or a range, 1-based
    lang: ts                         # optional: default is the file extension
    theme: github-dark               # optional: any Shiki theme
```

Highlighting happens at build time with [Shiki](https://shiki.style/) and is written into
the cast as 24-bit colour, so nothing extra reaches the browser. The default theme is the
Shiki theme matching `terminal.theme` (`default` uses `dark-plus`, `default-light`
uses `light-plus`).

Shiki is an optional peer dependency: projects that never use `show` do not install it,
and one that does gets a positioned error naming the fix.

```bash
pnpm add -D shiki
```

A missing file, a range past its end or an unknown language is reported with the file,
line and column of the step. The Vite plugin registers the shown file as a dependency of
the demo, so editing it recompiles the demo in dev.

A compiled cast depends on the Shiki version as well as the file: the project's lockfile
is what keeps it byte-identical from one build to the next.

For code outside a terminal, use your site's ordinary code blocks — `show` is for a file
that appears as part of a terminal session.

### exec

`exec` runs a real command and puts what it printed into the demo, with the timing it
actually had. The command is typed at the prompt like `run`, then executed with
`/bin/sh -c` in a pseudo-terminal the size of the demo, so programs see a real terminal
and colour their output.

```yaml
steps:
  - exec: npm test
    cwd: example-app     # relative to this .terminal.yaml
    env: { CI: '1' }
    timeout: 120000      # ms before the command is killed; default 60000
    idle: 1500           # longest pause kept between two pieces of output
```

The command is taken literally — no colour markup, since `{…}` is common in shell
commands. `speed`, `prompt` and `pause` work as they do for `run`.

**Nothing runs unless you allow it:** `castwright build --allow-exec`, `castwright dev
--allow-exec`, or `castwright({ allowExec: true })` in the Vite plugin. Without it a file
containing `exec` fails to build, pointing at the step. A demo file is not a script
anyone should be surprised to find executing.

**Record once, replay forever.** Real output depends on the machine, the time and the
network, so a demo that runs `exec` on every build is not reproducible.
`castwright build --allow-exec --record` runs the commands once and rewrites the file:
each `exec` becomes a `run` with the command and an `output: { raw }` with exactly what it
printed. From then on the demo builds without running anything, byte for byte the same.
Comments in the file are kept.

Output ends up in a published demo, so the build warns when it contains something that
looks like a token or a private key, or your home directory path — check those before
publishing. It also warns when a command exits non-zero (the output is recorded anyway),
and when `exec` runs in CI.

`exec` needs node-pty, an optional peer dependency with a native build:

```bash
pnpm add -D node-pty
```

<Callout type="caution">
node-pty 1.1.0 ships its macOS helper without the executable bit. If `exec` fails with
"posix_spawnp failed", the error names the file; `chmod +x` it once.
</Callout>

## Colour and style

Real ESC bytes cannot be written comfortably in YAML, so `output` and `prompt` take inline
markup. `{/}` closes the most recent tag, `{//}` resets everything, tags nest, and a
literal brace is `{{`.

```yaml
- output: |
    {red}red{/} {green}green{/} {yellow}yellow{/} {blue}blue{/}
    {bright-magenta}bright-magenta{/} {bg-blue} on blue {/}
    {#f38ba8}true colour{/} {bold}bold{/} {dim}dim{/} {underline}underline{/}
    {green}nested {bold}bold green{/} still green{/}
```

Tags: the eight base colours (`black`, `red`, `green`, `yellow`, `blue`, `magenta`,
`cyan`, `white`) and their `bright-` variants, `bg-<colour>` for backgrounds, `#rrggbb`
for true colour, plus `bold`, `dim`, `italic` and `underline`.

Named colours compile to palette indices, so a demo follows the theme it is played with.
`#rrggbb` is absolute and ignores it.

## Raw ANSI

For pasting genuine program output that already contains escape sequences:

```yaml
- output:
    raw: "\e[1;36mmy-cli\e[0m \e[2mv2.1.0\e[0m\r\n"
```

Supports `\e`, `\n`, `\r`, `\t`, `\xNN`, `\uNNNN` and `\\`. Markup is *not* processed in
`raw`.

## Validation

Enforced by `castwright validate` and by every code path that parses a file:

- Exactly one primary key per step. Two is an error, not a precedence question.
- Unknown keys are errors.
- `jitter > 0` without a top-level `seed` is an error.
- Unbalanced or unknown markup tags are errors, with the offending column.
- An unknown `terminal.theme` is an error, listing the known names.
- An `output` line wider than `cols` is a warning, not an error.

Every error carries the file, the line, the column and the offending source line:

```
demo.terminal.yaml:4:13: unknown markup tag '{nope}'

  - output: "{nope}broken{/}"
            ^
```
