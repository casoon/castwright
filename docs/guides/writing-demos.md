---
title: Writing demos
description: Pacing, prompts, colour — the parts that decide whether a demo reads well.
order: 1
---

The [reference](../../reference/dsl/) lists every key. This is about using them.

## Commands are one step, not three

`run` writes the prompt, types the text and presses Enter:

```yaml
- run: npm install
```

`type` and `key` stay available for what the sugar cannot express — partial input, tab
completion, Ctrl-C, answering an interactive prompt:

```yaml
- type: npm inst
- key: tab
- wait: 200
- key: enter
```

## Pacing is most of the impression

Three knobs, and the defaults are deliberately unhurried:

- `speed` — milliseconds per character while typing. `0` is instant, which is useful for
  the parts of a command nobody needs to watch being typed.
- `delay` on an `output` block — milliseconds between its lines. This is what makes an
  installer or a test runner feel like it is doing work rather than blinking into
  existence.
- `wait` — a plain pause, for letting a result sit before the next thing happens.

A demo that types every character of a 60-character command at 45 ms spends nearly three
seconds on it. Consider `speed: 0` for the boring prefix and a normal speed for the part
that matters.

## Jitter needs a seed

`jitter` varies the per-character delay so typing does not read as mechanical. It requires
a top-level `seed`, and the parser enforces that:

```yaml
seed: 7
steps:
  - type: npm run build
    jitter: 0.3
```

Without a seed, every build would produce a different cast, and a cast that changes on
every build cannot be reviewed in a diff. With one, it is varied *and* reproducible.

## Colour follows the theme, unless you say otherwise

Named colours compile to palette indices, so a demo picks up whatever theme it is played
with:

```yaml
- output: "{green}✓{/} done in {bold}412ms{/}"
```

`#rrggbb` compiles to true colour and ignores the theme. That is occasionally what you
want — a brand colour — and usually not.

## Prompts

Set the prompt once in `terminal`, and change it when the demo changes directory:

```yaml
terminal:
  prompt: "{blue}~{/} {green}${/} "
steps:
  - run: cd my-app
  - prompt: "{blue}~/my-app{/} {green}${/} "
  - run: ls
```

There is no automatic `cwd` tracking. That would mean parsing shell commands, which is a
slope with no bottom; an explicit step is clearer and always right.

## Author narrow if mobile matters

A terminal composed at 80 columns is physically wider than a phone. The player keeps the
authored geometry and scales the whole frame down rather than re-wrapping lines you
composed on purpose — which means the text gets small.

If a demo matters on mobile, write it at `cols: 56` or less. Every demo on this site is.

## Keep the cast in the repository

`castwright build` output is deterministic and textual. Committing it means a change in
the demo shows up as a readable diff, and a reviewer can see that a wording change did not
accidentally alter the timing of everything after it.
