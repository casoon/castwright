---
'@casoon/castwright': minor
---

`--format svg` output is about a fifth of its previous size for longer demos — a
53-second demo went from 570 KB to 120 KB — and places non-ASCII glyphs exactly.

- Timelines follow terminal lines instead of whole frames: typing changes one line, and
  scrolling moves one strip of lines rather than redrawing every row.
- Each non-ASCII glyph (emoji, CJK, symbols) sits at its own column instead of being
  stretched along with its neighbours, which shifted them by up to half a cell.
- New `--no-chrome` and `--loop-delay <ms>` options for `--format svg`.

Checked frame by frame against the previous encoding in Chromium and WebKit, including
scrolling, `clear` and the alternate screen, and seen animating in a GitHub README.
