---
'@casoon/castwright': minor
---

VHS `.tape` files as input: `castwright build demo.tape`, `castwright validate`,
`castwright dev` and the Vite plugin accept them next to `*.terminal.yaml`. With
`--allow-exec` (or `allowExec: true`) each typed command runs as an `exec:` step and its
output is recorded; commands typed between `Hide` and `Show` run silently before each
visible one. Without it the typing is shown and the build says the output is missing.
A documented subset of VHS: unsupported keys and settings are reported, `Output` points
at `--format`, `Source` is an error.
