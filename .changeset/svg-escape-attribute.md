---
'@casoon/castwright': patch
---

`--format svg`: escape `"` when writing XML. The cast's title is interpolated into the
root element's `aria-label`, so a title containing a double quote closed the attribute
early and the document stopped being well-formed XML — which for an SVG means a browser
renders nothing at all, with no error at build time.
