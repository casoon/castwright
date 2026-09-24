import castwright from '@casoon/astro-castwright';
import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [castwright()],
});
