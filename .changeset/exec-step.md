---
'@casoon/castwright': minor
---

New `exec:` step: runs a real command in a pseudo-terminal the size of the demo and
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
