---
'@casoon/castwright-player': patch
---

Page styles now override the player's defaults as the theming docs describe. The
defaults sat on a plain `castwright-demo` selector in a stylesheet that sorts after the
page's own, so `castwright-demo { --castwright-radius: 4px }` lost at equal specificity;
they are now wrapped in `:where()`, which gives them none.
