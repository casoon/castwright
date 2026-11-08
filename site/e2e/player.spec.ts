import { expect, type Page, test } from '@playwright/test';

const FIRST_DEMO_TEXT = 'cat demos/install.terminal.yaml';

/**
 * Demos are lazy on purpose: one below the fold stays un-mounted until it
 * scrolls into view. On a phone viewport that is the first one, so every test
 * that wants a live terminal has to scroll it in rather than assume it is up.
 */
async function firstLiveDemo(page: Page) {
  const demo = page.locator('castwright-demo').first();
  await demo.scrollIntoViewIfNeeded();
  await demo.locator('.castwright-screen').waitFor();
  return demo;
}

test.describe('<castwright-demo> on the demo page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('demo/');
  });

  test('upgrades and renders a real terminal', async ({ page }) => {
    const demo = await firstLiveDemo(page);
    await expect(demo.locator('.xterm')).toBeVisible();
    await expect(demo.locator('.xterm-rows > div').first()).toBeAttached();
  });

  test('the player is served by the site, not a CDN', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.host !== 'localhost:4331') external.push(request.url());
    });
    await page.reload();
    const demo = await firstLiveDemo(page);
    await expect(demo.locator('.xterm')).toBeVisible();
    expect(external).toEqual([]);
  });

  test('plays a cast through to its final frame', async ({ page }) => {
    const demo = await firstLiveDemo(page);
    await demo.evaluate((el: HTMLElement & { player?: { seek(s: number): void } }) => {
      el.player?.seek(9999);
    });
    await expect(demo.locator('.xterm-rows')).toContainText(FIRST_DEMO_TEXT, { timeout: 10_000 });
  });

  test('ships the accessibility fallback as real text and hides the terminal from AT', async ({
    page,
  }) => {
    const demo = await firstLiveDemo(page);
    await expect(demo.locator('.castwright-fallback')).toContainText(FIRST_DEMO_TEXT);
    await expect(demo.locator('.castwright-screen')).toHaveAttribute('aria-hidden', 'true');
    await expect(demo).toHaveAttribute('role', 'group');
    await expect(demo).toHaveAttribute('aria-label', /.+/);
  });

  test('transport controls are real buttons and keyboard reachable', async ({ page }) => {
    const demo = await firstLiveDemo(page);
    const playPause = demo.locator('[data-action="playpause"]');
    await expect(playPause).toHaveRole('button');
    await playPause.focus();
    await expect(playPause).toBeFocused();

    const before = await playPause.getAttribute('aria-label');
    await playPause.press('Enter');
    await expect(playPause).not.toHaveAttribute('aria-label', before ?? '');
  });

  test('the progress bar is a keyboard-operable seek slider', async ({ page }) => {
    const demo = await firstLiveDemo(page);
    const slider = demo.locator('[role="slider"]');
    await expect(slider).toHaveAccessibleName('Seek');
    await slider.focus();
    await slider.press('End');
    await expect(demo.locator('.xterm-rows')).toContainText(FIRST_DEMO_TEXT, { timeout: 10_000 });
  });

  test('dragging the seek bar scrubs, and keeps a paused demo paused', async ({ page }) => {
    const demo = await firstLiveDemo(page);
    await demo.evaluate((el: HTMLElement & { player?: { pause(): void } }) => el.player?.pause());
    const slider = demo.locator('[role="slider"]');
    await expect(slider).toHaveCSS('touch-action', 'pan-y');
    const box = await slider.boundingBox();
    if (!box) throw new Error('seek bar has no box');
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, y, { steps: 5 });
    await page.mouse.move(box.x + box.width + 40, y, { steps: 5 }); // past the end: capture holds
    await page.mouse.up();
    await expect(demo.locator('.xterm-rows')).toContainText(FIRST_DEMO_TEXT, { timeout: 10_000 });
    expect(
      await demo.evaluate((el: HTMLElement & { player?: { state: string } }) => el.player?.state),
    ).not.toBe('playing');
  });

  test('the terminal is not a keyboard trap', async ({ page }) => {
    const demo = await firstLiveDemo(page);
    const textarea = demo.locator('.xterm textarea');
    await expect(textarea).toHaveAttribute('tabindex', '-1');
  });

  test('the bare demo still has a reachable pause control', async ({ page }) => {
    const bare = page.locator('#demo-bare');
    await bare.scrollIntoViewIfNeeded();
    await expect(bare.locator('.xterm')).toBeVisible();

    // controls="hover": visually absent, but present and focusable — which is
    // what keeps an autoplaying loop compliant with WCAG 2.2 SC 2.2.2.
    const playPause = bare.locator('[data-action="playpause"]');
    await expect(playPause).toBeAttached();
    await playPause.focus();
    await expect(playPause).toBeFocused();

    // And no window chrome, which is the point of chrome="none".
    await expect(bare.locator('.castwright-chrome')).toHaveCount(0);
  });

  test('nothing overflows on a narrow viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.reload();
    const demo = await firstLiveDemo(page);
    await expect(demo.locator('.xterm')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('shows the final frame immediately instead of animating', async ({ page }) => {
    await page.goto('demo/');
    const demo = await firstLiveDemo(page);
    await expect(demo.locator('.xterm-rows')).toContainText(FIRST_DEMO_TEXT, { timeout: 10_000 });

    const state = await demo.evaluate(
      (el: HTMLElement & { player?: { state: string } }) => el.player?.state,
    );
    expect(state).toBe('finished');
  });
});

test.describe('prefers-reduced-motion at runtime', () => {
  test('switching it on stops a playing demo and shows the final frame', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('demo/');
    const demo = await firstLiveDemo(page);
    await demo.evaluate((el: HTMLElement & { player?: { restart(): void; play(): void } }) => {
      el.player?.restart();
      el.player?.play();
    });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(() =>
        demo.evaluate((el: HTMLElement & { player?: { state: string } }) => el.player?.state),
      )
      .toBe('finished');
    await expect(demo.locator('.xterm-rows')).toContainText(FIRST_DEMO_TEXT, { timeout: 10_000 });
  });
});

test.describe('the start page', () => {
  test("shows castwright's own SVG export, not a screenshot", async ({ page }) => {
    await page.goto('./');
    // The hero is the SVG `castwright build --format svg` wrote during this build.
    const hero = page.locator('img.hero-scene');
    await expect(hero).toBeVisible();
    expect(await hero.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    const svg = await (await page.request.get((await hero.getAttribute('src')) as string)).text();
    expect(svg).toContain('dist/deploy.svg');
    expect(svg).not.toContain('<script');
  });
});

test.describe('under a strict style-src', () => {
  // A hash-based policy, as Astro's `security.csp` emits, allows no inline
  // <style> and no style attributes. xterm styles itself both ways at run time;
  // the player routes around it (packages/player/src/csp.ts). Only style-src is
  // set, so the site's own inline scripts keep working.
  test.beforeEach(async ({ page }) => {
    await page.route('**/demo/', async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: { ...response.headers(), 'content-security-policy': "style-src 'self'" },
      });
    });
    await page.goto('demo/');
  });

  test('the terminal keeps its layout, palette and 24-bit colours', async ({ page }) => {
    const demo = page.locator('#demo-colours');
    await demo.scrollIntoViewIfNeeded();
    await demo.locator('.xterm-rows').waitFor();
    // Paused first: the demo loops, and a replay starting mid-assertion would
    // put a second, partial copy of the text on screen.
    await demo.evaluate(
      (el: HTMLElement & { player?: { pause(): void; seek(s: number): void } }) => {
        el.player?.pause();
        el.player?.seek(9999);
      },
    );
    const rows = demo.locator('.xterm-rows');
    await expect(rows).toContainText('#f38ba8');

    // xterm.css (the player's constructed sheet): the input textarea is taken
    // out of the flow. Unstyled, it sits in the page as a visible box.
    await expect(demo.locator('.xterm-helper-textarea')).toHaveCSS('position', 'absolute');
    // A palette colour comes from xterm's runtime theme <style>.
    await expect(rows.getByText('red', { exact: true })).toHaveCSS('color', 'rgb(205, 0, 0)');
    // A 24-bit colour comes from a style attribute on the cell.
    await expect(rows.getByText('#f38ba8', { exact: true })).toHaveCSS(
      'color',
      'rgb(243, 139, 168)',
    );
  });
});

test.describe('speed and copy controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('demo/');
  });

  test('the speed button is labelled, keyboard-operable and at least 24px', async ({ page }) => {
    const demo = page.locator('castwright-demo').first();
    await demo.scrollIntoViewIfNeeded();
    await demo.evaluate((el) => el.setAttribute('speed-control', ''));
    const speed = demo.locator('[data-action="speed"]');
    await expect(speed).toHaveAccessibleName('Playback speed 1×, change');
    await speed.focus();
    await speed.press('Enter');
    await expect(speed).toHaveAccessibleName('Playback speed 1.5×, change');
    const box = await speed.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(24);
    expect(box?.height).toBeGreaterThanOrEqual(24);
  });

  test('the copy button copies the text and confirms in a live region', async ({ page }) => {
    const demo = page.locator('castwright-demo').first();
    await demo.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const w = window as unknown as { copied: string };
      w.copied = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            w.copied = text;
          },
        },
      });
    });
    await demo.evaluate((el) => el.setAttribute('copy', ''));
    const copy = demo.locator('[data-action="copy"]');
    await expect(copy).toHaveAccessibleName('Copy terminal text');
    await copy.focus();
    await copy.press('Enter');
    const status = demo.locator('.castwright-copy-status');
    await expect(status).toHaveText('Copied');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied);
    expect(copied).toContain(FIRST_DEMO_TEXT);
  });
});
