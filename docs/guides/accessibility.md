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
always the demo's actual final frame rather than something that drifted out of date. With
`src=` instead of an import there is no cast to take it from: pass the text as the
component's slot content (the build warns when it is missing).

> **Caution:** This is the one thing the player cannot do for you. If you hand-write the element, write
> the fallback too — a `<castwright-demo>` with no children is an empty box to anyone who
> cannot see it.

## Reduced motion

Under `prefers-reduced-motion: reduce` the player skips the animation and shows the final
frame immediately. The controls stay, for anyone who set that preference for other reasons
and does want to watch this particular thing play. The preference is also followed at
run time: switching it on while a demo is playing (or looping) stops the demo and shows the
final frame.

The animated SVG export does the same with CSS alone: under `prefers-reduced-motion:
reduce` every timeline is paused on the finished screen. It works inside an `<img>`, where
the browser passes its own setting into the image. Playwright's `reducedMotion: 'reduce'`
does not reach that far — it emulates the media feature for the page, not for images in
it — so a test of an SVG in an `<img>` sees it animate. In Chromium, test with the
browser-wide preference instead: `chromium.launch({ args: ['--force-prefers-reduced-motion'] })`.

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

## Seek bar and shortcuts

The progress bar is a `role="slider"` named "Seek", focusable with Tab, with
`aria-valuetext` such as "0:03 of 0:12" (with ", marker: <label>" appended once a marker
has been passed; the marker ticks themselves are `aria-hidden`). Its value attributes change once per second, not
per frame, so assistive technology is not flooded. The hit area is 24 px tall
(SC 2.5.8). While focus is inside the demo: Left/Right seek 5 s, Home/End jump to start/end,
`k` toggles play/pause, and Space does the same on the slider (buttons keep their native
Space). The shortcuts exist only while focus is inside the demo — never page-wide, in
line with SC 2.1.4 — and Tab always leaves.

## The terminal is not a keyboard trap

xterm.js creates a textarea to capture input. Since a demo is a presentation and not an
input, the player sets it to `tabindex="-1"`: you can never tab *into* the terminal and
find yourself unable to tab out.

## Naming

The element is a `role="group"` with an accessible name. It defaults to
`Terminal demo: <title>` from the cast, and `label` overrides it. The window chrome's
title is decorative and hidden from assistive technology — two names for the same thing
would only be noise.
