import { resolveTheme } from '@casoon/castwright';
import type { TerminalYamlModule } from '@casoon/castwright/vite';

// Every demo the site plays, by name: the files in examples/ (the same corpus
// the tests compile) and the site's own in src/demos/. Compiled by castwright's
// Vite plugin during the build, as a consumer's import would be — a `.tape`
// included, whose commands run during the build (`allowExec` in the config).
const compiled = import.meta.glob<TerminalYamlModule>(
  ['../../examples/*.terminal.yaml', '../../examples/*.tape', './demos/**/*.terminal.yaml'],
  { eager: true },
);
const sources = import.meta.glob<string>(
  ['../../examples/*.terminal.yaml', '../../examples/*.tape', './demos/**/*.terminal.yaml'],
  { query: '?raw', import: 'default', eager: true },
);

export interface SiteDemo {
  cast: TerminalYamlModule['cast'];
  finalFrame: string;
  /** The file as written, for "show the source". */
  source: string;
  /** Repository path, e.g. `examples/vhs.tape`. */
  path: string;
  lang: 'yaml' | 'shellscript';
}

const byName = new Map<string, SiteDemo>();
for (const [key, module] of Object.entries(compiled)) {
  const file = key.split('/').pop() as string;
  const name = file.replace(/\.terminal\.yaml$|\.tape$/, '');
  if (byName.has(name)) throw new Error(`site demos: two files are named '${name}'`);
  byName.set(name, {
    cast: module.cast,
    finalFrame: module.finalFrame,
    source: sources[key] as string,
    path: key.startsWith('../../') ? key.slice(6) : `site/src/${key.slice(2)}`,
    lang: file.endsWith('.tape') ? 'shellscript' : 'yaml',
  });
}

/**
 * @param theme  Play it in another theme. A cast's colours are palette indices,
 *   so swapping the header's palette is exactly what `terminal.theme` does.
 */
export function siteDemo(name: string, theme?: string): SiteDemo {
  const demo = byName.get(name);
  if (!demo)
    throw new Error(
      `site demos: no demo named '${name}' — known: ${[...byName.keys()].join(', ')}`,
    );
  if (!theme) return demo;
  const cast = { ...demo.cast, header: { ...demo.cast.header, theme: resolveTheme(theme) } };
  return { ...demo, cast };
}
