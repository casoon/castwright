---
'@casoon/castwright': minor
'@casoon/castwright-player': minor
'@casoon/astro-castwright': minor
---

Fixes from a project review, with two breaking changes. A `show:` file must now live
inside the project root unless `--allow-show-outside-root` (or the Vite plugin option
`allowShowOutsideRoot`) is set, and `pause` on a `wait` step is an error. Also: `terminal.cursor`
takes effect, `castwright --version` and per-command `--help`, `validate` checks `show:` steps,
asciicast v3 and `idle_time_limit` in the player, a seek slider with drag scrubbing, markers,
keyboard shortcuts, playback speed and an optional copy button, and a fix for inline cast JSON
that could break out of its `<script>` tag. The root CHANGELOG has the full list.
