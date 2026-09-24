import { defineConfig } from 'vite';

/**
 * A single self-contained ESM file: the player plus xterm.js plus the inlined
 * stylesheet, with no bare imports left to resolve.
 *
 * This is what makes the "plain HTML, no bundler" path real. Pointing people at
 * a CDN works, but it makes every page that embeds a demo depend on a third
 * party — and a site that forbids external requests (as the CASOON pages theme
 * does) cannot use one at all.
 */
export default defineConfig({
  build: {
    outDir: 'dist/standalone',
    emptyOutDir: true,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'castwright-player.js',
    },
    rollupOptions: {
      // Nothing external: xterm is bundled in, which is the entire point.
      external: [],
      output: { inlineDynamicImports: true },
    },
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: true,
  },
});
