---
'@casoon/castwright': patch
---

A closing `wait:` now holds the final screen: the compiled cast ends with an empty output event at the end of the wait, so the player, the SVG, GIF and MP4 exports all keep the last screen up for that long before the loop hold starts.
