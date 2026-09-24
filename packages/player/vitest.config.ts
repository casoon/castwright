import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@casoon/castwright-player',
    // The player is browser code. happy-dom is enough for the element wiring,
    // the chrome markup and the accessibility attributes; xterm.js itself is
    // never instantiated here — mount() takes a terminal factory and the tests
    // pass a fake. Real-browser coverage is Playwright's job (item 07).
    environment: 'happy-dom',
  },
});
