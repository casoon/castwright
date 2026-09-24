import { compile, parse } from '@casoon/castwright';
import { ansiToHtml } from '@casoon/pages-theme/ansi';
import type { ShowcaseExample } from '@casoon/pages-theme/showcase';

// The same *.terminal.yaml files the parser's and compiler's test suites run
// against — no separate set kept in step by hand.
const files = import.meta.glob<string>('../../examples/*.terminal.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/**
 * Dogfooding: the shown output is what castwright's own compiler produced from
 * the shown input, at build time. `ansiToHtml` only turns those bytes into
 * markup for a static page — the demo page shows the same casts in motion.
 */
function renderFinalFrame(source: string, file: string): string {
  const cast = compile(parse(source, file));
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
];

export const examples: ShowcaseExample[] = entries.map(({ file, ...meta }) => {
  const source = files[`../../examples/${file}`] ?? '';
  return {
    ...meta,
    file: `examples/${file}`,
    input: { code: source, lang: 'yaml' },
    output: { html: renderFinalFrame(source, file), kind: 'terminal' },
  };
});
