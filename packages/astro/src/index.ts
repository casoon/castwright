// @casoon/castwright-astro — the Astro-specific ergonomics on top of the
// framework-agnostic pieces.
//
// This package is deliberately thin: the Vite plugin in @casoon/castwright
// does the compiling and <castwright-demo> from @casoon/castwright-player does
// the playing. Both work in Astro without this package; it exists so you do
// not have to wire them yourself.

import { type CastwrightPluginOptions, castwright } from '@casoon/castwright/vite';

/** The subset of Astro's integration API this uses, declared locally. */
interface AstroIntegrationLike {
  name: string;
  hooks: {
    'astro:config:setup': (options: {
      updateConfig: (config: { vite: { plugins: unknown[] } }) => void;
    }) => void;
  };
}

export type { CastwrightPluginOptions };

/**
 * Registers the castwright Vite plugin so `*.terminal.yaml` imports compile at
 * build time.
 *
 * ```js
 * // astro.config.mjs
 * import castwright from '@casoon/castwright-astro';
 * export default defineConfig({ integrations: [castwright()] });
 * ```
 */
export default function castwrightIntegration(
  options: CastwrightPluginOptions = {},
): AstroIntegrationLike {
  return {
    name: '@casoon/castwright-astro',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({ vite: { plugins: [castwright(options)] } });
      },
    },
  };
}
