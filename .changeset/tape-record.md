---
'@casoon/castwright': minor
---

`castwright build demo.tape --allow-exec --record` writes the recorded tape to a new
`demo.terminal.yaml` next to it: each command as `run:` with exactly what it printed,
hidden setup left out. The YAML then builds without running anything. An existing file
is never overwritten.

`--record` no longer writes an empty `output:` step for a command that printed nothing.
