import { defineConfig, devices } from '@playwright/test';

// Runs against the built site: what ships is what gets tested, and the
// accessibility fallback and the inlined casts only exist in the build output.
//
// Page-level accessibility is check-site.cjs's job (axe over every page, light
// and dark). These specs cover what a crawler cannot: the player's behaviour in
// a real browser.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4331/castwright/', trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    // --ignore-lock keeps the preview in the foreground. Without it Astro 7
    // daemonises and the command returns immediately, which Playwright reads as
    // "the server exited early"; it also lets this run while another preview is
    // up for manual browsing.
    command: 'pnpm exec astro preview --ignore-lock --port 4331',
    url: 'http://localhost:4331/castwright/',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
