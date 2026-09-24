---
'@casoon/castwright-player': patch
---

Seeking or restarting during playback no longer leaves stale output on screen. xterm.js
parses written data asynchronously, so resetting it immediately let output still queued
from before the reset land on the fresh screen, and a demo could show two runs' worth of
text. The reset now goes through the same queue.
