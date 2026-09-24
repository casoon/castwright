---
'@casoon/castwright': minor
---

`castwright build --format svg|gif|mp4`. `svg` is a self-contained animated SVG — real
text, no script, the cast's theme, reduced-motion aware — rendered by castwright itself on
`@xterm/headless`. `gif` shells out to agg and `mp4` additionally to ffmpeg; a missing
tool is reported with an install hint.
