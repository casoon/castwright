import castwright from '@casoon/astro-castwright';
import { defineConfig } from 'astro/config';

// Compiles every *.terminal.yaml at build time.
export default defineConfig({
  integrations: [castwright()],
});
