import { defineConfig } from 'vite';

// Dev-only: serves dev/index.html against the player's source, which is how the
// real consumer (a bundler) resolves it. Not part of the published package.
export default defineConfig({
  root: 'dev',
  server: { port: 5199 },
});
