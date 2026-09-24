import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/*'],
    // No package has tests yet in the bootstrap state (plan item 01). Each later
    // item (02 parser, 03 compiler, 05 player) adds real specs, at which point
    // this stops masking anything for that package.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
