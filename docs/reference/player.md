---
title: Player
description: The <castwright-demo> element, its attributes, and theming the frame.
order: 3
---

`<castwright-demo>` is a custom element, so it works in plain HTML, in MDX, in a
server-rendered template, and in every JavaScript framework. Importing
`@casoon/castwright-player` registers it.

## Attributes

| Attribute | Values | Meaning |
| --- | --- | --- |
| `src` | URL | A pre-built `.cast`, fetched at runtime. |
| `autoplay` | boolean | Start when the demo first scrolls into view. |
| `loop` | boolean | Replay after a hold on the final frame. |
| `loop-delay` | ms | Length of that hold. Default 2000. |
| `poster` | seconds, or `marker:<label>` | Render this moment as the initial frame. `marker:<label>` uses the time of the first marker event with that label. |
| `cols`, `rows` | number | Override the cast's geometry. |
| `label` | string | Accessible name. Defaults to `Terminal demo: <title>`. |
| `title-text` | string | Shown in the window chrome. Decorative. |
| `chrome` | `window`, `none` | `none` drops the title bar. |
| `controls` | `visible`, `hover`, `none` | See below. |

Changing any of these attributes, or setting `cast`, on a mounted element rebuilds the
player with the new values (the demo restarts). Before the first mount they are simply
read when the element scrolls into view.

`title-text` rather than `title`, because a native `title` attribute would produce a
browser tooltip and be announced by assistive technology — two names for one thing.

## Where the cast comes from

Three sources, checked in this order:

1. a `cast` property set from JavaScript;
2. an inlined `<script type="application/json" data-castwright-cast>` child — what the
   Vite plugin and the Astro component emit at build time, so there is no fetch and no
   parser in the bundle;
3. the `src` attribute, fetched at runtime.

The YAML parser is never shipped to a browser.

## Controls

- `visible` — the transport is always shown. The default.
- `hover` — the transport is overlaid on the terminal and revealed on hover or keyboard
  focus. Visually absent, but still a real focusable pause control, which an autoplaying
  loop needs. See [Accessibility](../../guides/accessibility/).
- `none` — no transport at all. Appropriate for a short demo that does not loop; the
  player warns when it is combined with autoplay on something that loops or runs past five
  seconds.

## Seeking, keyboard and events

The progress bar is a seek slider: click it, or focus it and
use the keyboard. Markers (`m` events in the cast) show as decorative ticks on the bar,
and the slider's value text names the latest marker passed ("0:03 of 0:12, marker: build").
While focus
is inside the demo, Left/Right seek 5 seconds, Home/End jump to the start/end, `k` toggles
play/pause, and Space toggles on the slider. See [Accessibility](../../guides/accessibility/).

The element dispatches bubbling `CustomEvent`s, so integrations need not poll `.player`:

| Event | When | `detail` |
| --- | --- | --- |
| `castwright:ready` | The player has mounted; `.player` is set. | `{ durationSeconds }` |
| `castwright:play` | Playback starts or resumes (also on each loop). | `{ time }` |
| `castwright:pause` | Playback is paused — by the user, off-screen, or a hidden tab. | `{ time }` |
| `castwright:ended` | The final frame was reached. | `{ time }` |
| `castwright:error` | The cast could not be loaded. | `{ error }` |

`play`, `pause` and `ended` are also dispatched by `mount()` on its host. A hidden browser
tab pauses playback and resumes it on return, so missed time is not dumped into one frame.

Not yet available: playback speed, a copy button.

## Recordings from `asciinema rec`

`src=` accepts asciicast v2 and v3 (v3 is converted to v2 when read) and honours
`idle_time_limit`: a longer gap plays as the limit. A truncated or malformed event line is
skipped with a console warning instead of rejecting the file. v1 and unknown versions fail
with a clear error.

## Programmatic control

`mount(element, cast, options)` is exported, and the element exposes its handle as
`.player`:

```js
const demo = document.querySelector('castwright-demo');
demo.player.pause();
demo.player.seek(3.5);
demo.player.state; // 'idle' | 'playing' | 'paused' | 'finished'
```

`.player` is `undefined` until the element has mounted — which, being lazy, may be well
after it is in the DOM, and never at all if the cast fails to load.

### mount()

```js
import { mount } from '@casoon/castwright-player';

const handle = mount(hostElement, cast, {
  autoplay: false,
  loop: false,
  loopDelayMs: 2000,
  chrome: 'window',
  controls: 'visible',
  title: undefined,
  label: undefined,
  poster: undefined,
  cols: undefined,
  rows: undefined,
  reducedMotion: undefined, // defaults to the media query
  createTerminal: undefined, // defaults to xterm.js; injectable for tests
});
```

`mount` is eager — it builds the chrome and opens a terminal immediately. It also takes
over the host's children: they are moved into a hidden fallback element, which is what
keeps them available to assistive technology. Call it on an element you own.

### The handle

| Member | Meaning |
| --- | --- |
| `play()` | Resume, or restart from a finished state. |
| `pause()` | Stop the clock; the screen stays as it is. |
| `restart()` | Reset the terminal and return to `idle`. Does not start playing. |
| `seek(seconds)` | Replay up to that moment. Clamped to the duration. |
| `markers` | Read-only list of `{ label, time }` (seconds) from the cast's `m` events; empty if there are none. |
| `seekToMarker(label)` | Seek to the first marker with that label. Returns `false` if there is none. |
| `state` | `'idle' \| 'playing' \| 'paused' \| 'finished'` |
| `durationSeconds` | The last output event's time, including a closing `wait:`. |
| `destroy()` | Cancel timers, disconnect observers, dispose the terminal. |

`durationSeconds` is the time of the last output event. A demo that ends in `wait: 2000`
compiles to an empty output event at the end of that wait, so the final screen holds for
those two seconds and then for the loop hold. A pause after any other last step is not
part of the cast; the loop hold covers it.

Seeking is a replay rather than a skip: terminal state is cumulative, so jumping to a
moment means re-feeding every byte up to it with the timing suppressed. Starting to write
from the middle would show a broken screen.

Every method is a no-op after `destroy()`, which also restores the host's `role`,
`aria-label`, `data-*` and `--castwright-*` values to what they were before `mount()`.

If the terminal was resized by an asciicast `r` event, seeking, restarting and looping
restore the authored size first.

## Failures, and what is not retried

A demo that cannot load must not take the page down with it. When the cast cannot be
resolved — a 404, a malformed file, no source at all — the element logs to
`console.error`, leaves its fallback children exactly as they are, and stops. The page
shows the terminal text it was always going to show without JavaScript.

There is **no automatic retry**. A failed fetch is not repeated, and no backoff runs in
the background; a demo is decoration, and a page full of them retrying a broken URL is a
worse problem than a demo that did not animate. To retry, set the `cast` property or the
`src` attribute again on a freshly re-inserted element.

Removing the element from the DOM aborts a fetch that is still in flight, destroys the
player, and puts the original children back. Re-inserting it starts over cleanly: one
mount per insertion, with no accumulated wrappers from the previous one.

## Server-side rendering

Importing `@casoon/castwright-player` from a module that also runs on the server is safe.
Under Node the package registers no custom element and touches no DOM: `customElements`
does not exist, so `defineCastwrightDemo()` returns without doing anything, and what the
server renders is the element's children — the terminal's final text. The browser
upgrades the element on hydration.

There is therefore nothing to mark client-only in SvelteKit, Nuxt, Remix, SolidStart or
Qwik, and no `ssr.noExternal` entry to add.

`deserializeCast`, `buildTimeline` and `toXtermTheme` are pure and work on the server.
`mount()` needs a real DOM — call it from `onMount`, `useEffect`, or a `<script>`.

## Content-Security-Policy

The player needs no `'unsafe-inline'` for styles, so it works under a hash- or
nonce-based policy such as the one Astro's `security.csp` emits. Its own CSS and
xterm.js's go in as a constructed stylesheet (`document.adoptedStyleSheets`), which
`style-src` does not govern.

xterm.js itself styles the terminal at run time in two ways a strict `style-src` blocks:
`<style>` elements whose contents depend on the theme and the measured cell size, and
`style` attributes on cells with 24-bit colour. The player repairs both as they appear —
each `<style>` is mirrored into a constructed stylesheet, and a refused `style` attribute
is re-applied through the CSSOM. Browsers still report the blocked originals as CSP
violations in the console; the terminal renders correctly regardless. Where the policy
allows inline styles, both repairs change nothing.

The script itself is an ordinary module script, so `script-src 'self'` covers it when it
is served from the site. Verified in Chromium, Safari and Firefox.

> **Firefox and 24-bit colour.** Firefox will not let a refused `style` attribute be
> re-applied through the CSSOM with the same value, so under a strict `style-src` cells in
> 24-bit colour (`{#a6e3a1}`, `show:` highlighting) fall back to the default foreground.
> Layout, the theme and the 16-colour palette are unaffected. Allowing inline style
> *attributes* — not `<style>` elements — restores them:
>
> ```
> style-src 'self' …; style-src-attr 'unsafe-inline'
> ```
>
> Style attributes cannot load resources or match elements, so this is a much narrower
> allowance than `'unsafe-inline'` on `style-src`.

If the page cannot load a script at all, the animated SVG export
(`castwright build --format svg`) needs neither: embedded as an `<img>`, it is subject
only to `img-src`.

## Lazy by default

xterm.js is not instantiated until the element first scrolls into view, and playback
pauses when it scrolls out. A documentation page with six demos does not pay for six
terminals up front, and does not animate them all off-screen.
