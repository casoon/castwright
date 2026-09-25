---
title: Accessibility
description: What the player does for you, and the one thing it cannot do for you.
order: 2
---

An animated terminal is decorative motion containing text, which makes it an
accessibility problem unless it is designed not to be. castwright treats WCAG 2.2 AA as a
requirement rather than an aspiration. Every page of this site is checked against it with
axe-core, in light and dark, before each release, and CI drives the player itself in a
real browser on desktop and mobile viewports.

## The element's children are the content

An undefined custom element renders its children. So this:

```html
<castwright-demo src="/demo.cast" autoplay loop>
  <pre>$ npm install
added 42 packages</pre>
</castwright-demo>
```

shows real, selectable, screen-reader-addressable text *before* the script loads — and
forever, if it never does. After the player upgrades the element it keeps that text in the
DOM, visually hidden, and marks the live terminal `aria-hidden` so the same content is not
announced twice.

The Astro component generates this for you from the compiled cast, so the fallback is
always the demo's actual final frame rather than something that drifted out of date.

> **Caution:** This is the one thing the player cannot do for you. If you hand-write the element, write
> the fallback too — a `<castwright-demo>` with no children is an empty box to anyone who
> cannot see it.

## Reduced motion

Under `prefers-reduced-motion: reduce` the player skips the animation and shows the final
frame immediately. The controls stay, for anyone who set that preference for other reasons
and does want to watch this particular thing play.

## There is always a way to stop it

[WCAG 2.2 SC 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
applies to motion that starts automatically, lasts more than five seconds, and sits
alongside other content. A looping demo never ends, so it qualifies; so does a one-shot
demo that runs longer than five seconds.

Two ways to satisfy it, and the right one depends on the demo:

- **Keep a control.** `controls="visible"` (the default) or `controls="hover"`, which
  overlays the transport and reveals it on hover or keyboard focus. `hover` looks like no
  controls at all while still being a real, focusable pause button — the same bargain a
  skip link makes.
- **Keep the motion short and finite.** A demo under five seconds that does not loop is
  outside the criterion entirely, and `controls="none"` is fine.

`controls="none"` combined with autoplay on something that loops or runs long is the one
configuration that breaks this. The player checks the cast's real duration and says so in
the console rather than letting it pass quietly.

## The terminal is not a keyboard trap

xterm.js creates a textarea to capture input. Since a demo is a presentation and not an
input, the player sets it to `tabindex="-1"`: you can never tab *into* the terminal and
find yourself unable to tab out.

## Naming

The element is a `role="group"` with an accessible name. It defaults to
`Terminal demo: <title>` from the cast, and `label` overrides it. The window chrome's
title is decorative and hidden from assistive technology — two names for the same thing
would only be noise.
