import { expect, type Page, test } from '@playwright/test';

const FIRST_DEMO_TEXT = 'pnpm add -D @casoon/castwright';

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

test.describe('the start page', () => {
  test("shows the compiler's real output, not a screenshot", async ({ page }) => {
    await page.goto('./');
    // The hero terminal is build-time-rendered ANSI, so it is text in the DOM.
    await expect(page.locator('main')).toContainText('npx casoon create my-app');
  });
});
