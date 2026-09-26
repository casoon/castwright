// @ts-check
import { createRequire } from 'node:module';
import { castwright } from '@casoon/castwright/vite';
import casoonPages from '@casoon/pages-theme';
import { defineConfig } from 'astro/config';

// Read rather than repeat: Changesets bumps the packages, and a version written
// out here goes stale the moment it does — which is exactly what happened once.
// Core is the version the site speaks about, and it publishes its own
// package.json through `exports`.
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
      packages: [
        {
          label: 'npm: @casoon/castwright',
          href: 'https://www.npmjs.com/package/@casoon/castwright',
        },
        {
          label: 'npm: @casoon/castwright-player',
          href: 'https://www.npmjs.com/package/@casoon/castwright-player',
        },
        {
          label: 'npm: @casoon/astro-castwright',
          href: 'https://www.npmjs.com/package/@casoon/astro-castwright',
        },
      ],
      demo: 'Live demo',
      mdxComponents: './src/mdx-components.ts',
      docsGroups: {
        'getting-started': 'Getting started',
        guides: 'Guides',
        reference: 'Reference',
      },
    }),
  ],
  vite: {
    // The site dogfoods the plugin: its own demos are *.terminal.yaml files
    // compiled at build time, exactly as a consumer's would be. `allowExec` is
    // for examples/vhs.tape, whose commands run during the build — every other
    // demo is written or already recorded.
    plugins: [castwright({ allowExec: true })],
  },
});
