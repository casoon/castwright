import type { TerminalYamlModule } from '@casoon/castwright/vite';
import { ansiToHtml } from '@casoon/pages-theme/ansi';
import type { ShowcaseExample } from '@casoon/pages-theme/showcase';

// The same *.terminal.yaml files the parser's and compiler's test suites run
// against — no separate set kept in step by hand.
const files = import.meta.glob<string>('../../examples/*.terminal.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});

// …and the same files compiled by castwright's own Vite plugin, exactly as a
// consumer's import would be. The plugin, not a hand-rolled compile(), because
// `show:` reads a file relative to the example and only the plugin knows where
// the example lives.
const compiled = import.meta.glob<TerminalYamlModule>('../../examples/*.terminal.yaml', {
  eager: true,
});

/**
 * Dogfooding: the shown output is what castwright's own compiler produced from
 * the shown input, at build time. `ansiToHtml` only turns those bytes into
 * markup for a static page — the demo page shows the same casts in motion.
 */
function renderFinalFrame(file: string): string {
  const cast = compiled[`../../examples/${file}`]?.cast;
  if (!cast) throw new Error(`showcase: examples/${file} was not compiled`);
  const ansi = cast.events
    .filter((event): event is [number, 'o', string] => event[1] === 'o')
    .map((event) => event[2])
    .join('');
  return ansiToHtml(ansi);
}

const entries = [
  {
    slug: 'basic',
    title: 'Install and run',
    file: 'basic.terminal.yaml',
    tags: ['run', 'output', 'colour'],
    description: 'The shape most demos take: a command typed at a prompt, then its output.',
  },
  {
    slug: 'colours',
    title: 'Colour and style',
    file: 'colors.terminal.yaml',
    tags: ['markup', 'sgr', 'true-colour'],
    description:
      'Inline markup compiles to SGR: named colours follow the theme, #rrggbb overrides it.',
  },
  {
    slug: 'interactive',
    title: 'Keys and jitter',
    file: 'interactive.terminal.yaml',
    tags: ['type', 'key', 'jitter', 'prompt'],
    description:
      'Tab completion, a changed prompt, and seeded per-character jitter that still compiles to the same bytes every time.',
  },
  {
    slug: 'show',
    title: 'A file, highlighted',
    file: 'show.terminal.yaml',
    tags: ['show', 'shiki', 'true-colour'],
    description:
      'show: puts a file on screen with syntax highlighting — Shiki at build time, 24-bit colour in the cast, nothing extra in the browser.',
  },
  {
    slug: 'recorded',
    title: 'A recorded command',
    file: 'recorded.terminal.yaml',
    tags: ['exec', 'record', 'raw'],
    description:
      'castwright’s real error output for a typo. This was an exec: step; --record ran it once and wrote what it printed back into the file.',
  },
];

export const examples: ShowcaseExample[] = entries.map(({ file, ...meta }) => {
  const source = files[`../../examples/${file}`] ?? '';
  return {
    ...meta,
    file: `examples/${file}`,
    input: { code: source, lang: 'yaml' },
    output: { html: renderFinalFrame(file), kind: 'terminal' },
  };
});
