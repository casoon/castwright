---
'@casoon/castwright-player': minor
---

The player works under a strict Content-Security-Policy with no `'unsafe-inline'` for
styles, such as Astro's hash-based `security.csp`. Its CSS is adopted as a constructed
stylesheet instead of being injected as a `<style>` element, and the styles xterm.js
creates at run time — `<style>` elements for theme and cell size, `style` attributes for
24-bit colours — are mirrored or re-applied through the CSSOM. Previously the terminal
rendered unstyled and colourless under such a policy.
