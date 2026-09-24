import castwright from '@casoon/castwright-astro';
import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [castwright()],
});
