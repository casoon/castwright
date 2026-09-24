// @ts-check
import { castwright } from '@casoon/castwright/vite';
import casoonPages from '@casoon/pages-theme';
import { defineConfig } from 'astro/config';

// Project page: https://casoon.github.io/castwright/ — `base` is the GitHub Pages path.
export default defineConfig({
  site: 'https://casoon.github.io/castwright',
  base: '/castwright/',
  integrations: [
    casoonPages({
      name: 'castwright',
      description:
        'Declarative terminal demos for the web. A YAML file compiles to asciicast v2 and plays as a real terminal.',
      repo: 'casoon/castwright',
      version: '0.1.0',
      license: 'MIT',
      // Nothing is published yet, so there is nothing to link to that would not
      // 404. The start page says so rather than the header implying otherwise.
      packages: [],
      demo: 'Live demo',
      docsGroups: {
        'getting-started': 'Getting started',
        guides: 'Guides',
        reference: 'Reference',
      },
    }),
  ],
  vite: {
    // The site dogfoods the plugin: its own demos are *.terminal.yaml files
    // compiled at build time, exactly as a consumer's would be.
    plugins: [castwright()],
  },
});
