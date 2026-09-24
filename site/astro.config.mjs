// @ts-check
import { createRequire } from 'node:module';
import { castwright } from '@casoon/castwright/vite';
import casoonPages from '@casoon/pages-theme';
import { defineConfig } from 'astro/config';

// Read rather than repeat: Changesets bumps the packages, and a version written
// out here would quietly go stale the moment it did — as it had, sitting at
// 0.1.0 while the packages were already 0.2.0. Core is the version the site
// speaks about, and it publishes its own package.json through `exports`.
const { version } = createRequire(import.meta.url)('@casoon/castwright/package.json');

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
      version,
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
