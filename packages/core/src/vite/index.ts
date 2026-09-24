// @casoon/castwright/vite — compile *.terminal.yaml at build time.
//
// This, not the Astro integration, is the piece that makes castwright
// universal: one plain Vite plugin covers Astro, SvelteKit, Nuxt, Remix,
// SolidStart, Qwik, VitePress and plain Vite.
//
// `vite` is a type-only peer dependency — a plugin is a plain object, so
// nothing from vite is imported at runtime and installing castwright in a
// project without Vite costs nothing.

import { readFile } from 'node:fs/promises';
import { compile } from '../compiler/compile.js';
import { finalFrameText } from '../compiler/final-frame.js';
import { CastwrightParseError } from '../parser/errors.js';
import { parse } from '../parser/parse.js';

/** The shape of a Vite plugin, declared locally to avoid importing vite. */
interface VitePluginLike {
  name: string;
  enforce?: 'pre' | 'post';
  transform?: (
    code: string,
    id: string,
  ) => Promise<{ code: string; map: null } | null> | { code: string; map: null } | null;
  handleHotUpdate?: (ctx: { file: string; server: { ws: { send: (p: unknown) => void } } }) => void;
}

export interface CastwrightPluginOptions {
  /** Which files to compile. Default: anything ending in `.terminal.yaml`. */
  include?: (id: string) => boolean;
  /**
   * Also emit the final terminal contents as plain text, for the accessibility
   * fallback. Default true — it costs one headless replay per demo at build
   * time and is what keeps the demo readable before (and without) JavaScript.
   */
  emitFinalFrame?: boolean;
}

// Vite's own query suffixes mean "give me this file as X" — `?raw` in
// particular asks for the source text. Compiling those would hand the caller a
// module where they asked for a string, so they are left alone.
const PASSTHROUGH_QUERIES = ['raw', 'url', 'inline', 'worker'];

const DEFAULT_INCLUDE = (id: string): boolean => {
  const [path, query] = id.split('?');
  if (!path?.endsWith('.terminal.yaml')) return false;
  if (query === undefined) return true;
  const params = new URLSearchParams(query);
  return !PASSTHROUGH_QUERIES.some((name) => params.has(name));
};

/**
 * The module a `*.terminal.yaml` import evaluates to.
 *
 * ```ts
 * import demo from './install.terminal.yaml';
 * demo.cast        // the compiled Cast, ready for the player
 * demo.finalFrame  // the end state as plain text, for the a11y fallback
 * ```
 */
export interface TerminalYamlModule {
  cast: import('../types.js').Cast;
  finalFrame: string;
}

export function castwright(options: CastwrightPluginOptions = {}): VitePluginLike {
  const include = options.include ?? DEFAULT_INCLUDE;
  const emitFinalFrame = options.emitFinalFrame ?? true;

  return {
    name: 'castwright',
    // Run before Vite's own asset handling, which would otherwise treat the
    // YAML file as a static asset and never hand it here.
    enforce: 'pre',

    async transform(code, id) {
      if (!include(id)) return null;

      const file = id.split('?')[0] ?? id;
      // `code` is what Vite read; fall back to reading ourselves if a previous
      // plugin handed us something else (e.g. an asset URL stub).
      const source = code.trimStart().startsWith('export ') ? await readFile(file, 'utf8') : code;

      let cast: import('../types.js').Cast;
      try {
        cast = compile(parse(source, file));
      } catch (error) {
        if (error instanceof CastwrightParseError) {
          // A compile error must be a build error with file/line/column, not a
          // blank box at runtime. Vite prints `message` and uses `loc`.
          const enriched = Object.assign(new Error(error.message), {
            id: file,
            loc: { file, line: error.position.line, column: error.position.column },
          });
          throw enriched;
        }
        throw error;
      }

      const finalFrame = emitFinalFrame ? await finalFrameText(cast) : '';

      return {
        code: `export const cast = ${JSON.stringify(cast)};
export const finalFrame = ${JSON.stringify(finalFrame)};
export default { cast, finalFrame };
`,
        map: null,
      };
    },
  };
}

export default castwright;
