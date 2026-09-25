---
'@casoon/castwright': patch
---

`--record` no longer folds long lines when it rewrites the file. A recorded line stays
exactly as the program printed it, and the rest of the file keeps its layout.
