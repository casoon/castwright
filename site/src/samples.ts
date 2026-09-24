// Code samples shown on the start page.
//
// They live here rather than inline in index.astro because one of them contains
// Astro frontmatter fences, and a literal `---` at the start of a line inside an
// .astro file confuses tooling that splits the file on them.

export const DEMO_YAML = `version: 1

terminal:
  cols: 72
  rows: 12
  theme: catppuccin-mocha

steps:
  - run: pnpm add -D @casoon/castwright
  - output: |
      {green}✓{/} added 3 packages
  - wait: 500
  - run: castwright build demo.terminal.yaml
  - output: |
      {dim}dist/demo.cast{/}`;

export const ASTRO_USAGE = [
  '---',
  "import TerminalDemo from '@casoon/astro-castwright/TerminalDemo.astro';",
  "import demo from '../demos/install.terminal.yaml';",
  '---',
  '',
  '<TerminalDemo demo={demo} autoplay loop />',
].join('\n');
