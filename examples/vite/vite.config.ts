import { castwright } from '@casoon/castwright/vite';
import { defineConfig } from 'vite';

// The whole point of this example: the plugin is a plain Vite plugin. No
// Astro, no framework — the same three lines work in SvelteKit, Nuxt, Remix,
// SolidStart, Qwik or VitePress.
export default defineConfig({
  plugins: [castwright()],
});
