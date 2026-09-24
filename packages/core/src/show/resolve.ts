// `show:` steps → `output` steps (plan item 13).
//
// Runs between parse() and compile(): it reads each shown file, highlights it
// with Shiki and replaces the step with an ordinary `output` step carrying
// 24-bit colour spans. Doing this here rather than in the compiler keeps
// compile() synchronous and free of I/O, and keeps Shiki out of every path
// that does not use `show:` — it is an optional peer dependency, imported only
// when a script actually contains one.
//
// Determinism: the same file, Shiki version and theme give the same spans, so
// a project's lockfile is what pins the output. A Shiki update can change
// token boundaries and therefore the compiled cast.

import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { CastwrightParseError } from '../parser/errors.js';
import type { ThemeName } from '../themes/index.js';
import type { Color, Script, ShowStep, Span, Step, Styled } from '../types.js';

/** Terminal theme → the Shiki theme that matches it. */
const SHIKI_THEMES: Record<ThemeName, string> = {
  default: 'dark-plus',
  'default-light': 'light-plus',
  'catppuccin-mocha': 'catppuccin-mocha',
  dracula: 'dracula',
  'github-dark': 'github-dark',
  'github-light': 'github-light',
  'solarized-dark': 'solarized-dark',
};

// Shiki's FontStyle bit flags.
const ITALIC = 1;
const BOLD = 2;
const UNDERLINE = 4;

type Shiki = typeof import('shiki');
type BundledLanguage = import('shiki').BundledLanguage;
type BundledTheme = import('shiki').BundledTheme;

export interface ResolvedScript {
  script: Script;
  /** Absolute paths of every file a `show:` step read — for a bundler's watch list. */
  files: string[];
}

function stepError(step: ShowStep, file: string, message: string): CastwrightParseError {
  return new CastwrightParseError(
    message,
    file,
    { line: step.source.line, column: step.source.column },
    step.source.text,
  );
}

async function loadShiki(step: ShowStep, file: string): Promise<Shiki> {
  try {
    return await import('shiki');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
      throw stepError(
        step,
        file,
        "step 'show' highlights with shiki, which is not installed — add it: pnpm add -D shiki",
      );
    }
    throw error;
  }
}

function toColor(hex: string | undefined): Color | undefined {
  const match = hex ? /^#([0-9a-f]{6})/i.exec(hex) : null;
  if (!match?.[1]) return undefined;
  const value = Number.parseInt(match[1], 16);
  return { kind: 'rgb', r: (value >> 16) & 0xff, g: (value >> 8) & 0xff, b: value & 0xff };
}

async function highlight(
  step: ShowStep,
  scriptFile: string,
  shiki: Shiki,
  terminalTheme: ThemeName,
): Promise<{ path: string; text: Styled }> {
  const path = resolve(dirname(scriptFile), step.file);

  let code: string;
  try {
    code = await readFile(path, 'utf8');
  } catch (error) {
    const reason = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'not found' : 'unreadable';
    throw stepError(step, scriptFile, `step 'show': file ${reason}: ${path}`);
  }

  let lines = code.replace(/\r\n?/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop(); // the file's final newline
  if (step.lines) {
    const { from, to } = step.lines;
    if (to > lines.length) {
      throw stepError(
        step,
        scriptFile,
        `step 'lines' ${from}-${to} is past the end of ${step.file} (${lines.length} lines)`,
      );
    }
    lines = lines.slice(from - 1, to);
  }

  const lang = step.lang ?? extname(path).slice(1);
  const theme = step.theme ?? SHIKI_THEMES[terminalTheme];
  if (lang === '') {
    throw stepError(
      step,
      scriptFile,
      `step 'show': cannot tell the language of ${step.file} — set 'lang'`,
    );
  }

  let tokens: Awaited<ReturnType<Shiki['codeToTokens']>>['tokens'];
  try {
    // Unknown names are Shiki's to reject; its message names them.
    ({ tokens } = await shiki.codeToTokens(lines.join('\n'), {
      lang: lang as BundledLanguage,
      theme: theme as BundledTheme,
    }));
  } catch (error) {
    throw stepError(step, scriptFile, `step 'show': ${(error as Error).message}`);
  }

  const text: Styled = [];
  tokens.forEach((line, i) => {
    if (i > 0) text.push({ text: '\n' });
    for (const token of line) {
      const span: Span = { text: token.content };
      const fg = toColor(token.color);
      if (fg) span.fg = fg;
      const style = token.fontStyle ?? 0;
      if (style & BOLD) span.bold = true;
      if (style & ITALIC) span.italic = true;
      if (style & UNDERLINE) span.underline = true;
      text.push(span);
    }
  });
  // End on a fresh line, as an `output: |` block does.
  text.push({ text: '\n' });

  return { path, text };
}

/**
 * Replaces every `show:` step in `script` with the highlighted file as an
 * `output` step. `file` is the script's own path; shown files resolve against
 * its directory. Scripts without `show:` come back unchanged, and Shiki is not
 * loaded for them.
 */
export async function resolveShowSteps(script: Script, file: string): Promise<ResolvedScript> {
  const first = script.steps.find((step): step is ShowStep => step.kind === 'show');
  if (!first) return { script, files: [] };

  const shiki = await loadShiki(first, file);
  const files: string[] = [];
  const steps: Step[] = [];
  for (const step of script.steps) {
    if (step.kind !== 'show') {
      steps.push(step);
      continue;
    }
    const { path, text } = await highlight(step, file, shiki, script.terminal.theme as ThemeName);
    files.push(path);
    steps.push({ kind: 'output', text, lineDelay: step.lineDelay, pause: step.pause });
  }
  return { script: { ...script, steps }, files };
}
