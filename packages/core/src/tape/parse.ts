// VHS `.tape` → Script IR (plan item 09). A second front end for the same
// pipeline: nothing after parse() knows a demo started life as a tape.
//
// A tape drives a real shell — `Type "ls"` + `Enter` means "run ls". With
// `exec` set, each typed line that ends in `Enter` becomes an `exec:` step, so
// resolveExecSteps() runs it and records its output, as VHS would. Without it
// the typing is shown and nothing answers.
//
// The promise is a documented subset (docs/reference/tape.md), not VHS
// compatibility: every command is either translated, ignored on purpose, or
// rejected with a message — never skipped silently by accident.

import { CastwrightParseError } from '../parser/errors.js';
import { isThemeName, THEME_NAMES } from '../themes/index.js';
import type { CursorConfig, KeyName, Script, Step, Styled } from '../types.js';

export interface TapeOptions {
  /** Turn typed commands into `exec:` steps. Without it they are only typed. */
  exec?: boolean;
  onWarning?: (message: string, line: number, column: number) => void;
}

// VHS's defaults, so a tape that sets nothing gets the terminal it would get there.
const VHS = {
  width: 1200,
  height: 600,
  fontSize: 22,
  padding: 60,
  lineHeight: 1,
  typingSpeed: 50,
};
// Pixel sizes become a grid: a monospace cell is about 0.6em wide and 1.2
// line-heights tall. Close to what VHS gets, not exact.
const CELL_WIDTH_EM = 0.6;
const CELL_HEIGHT_EM = 1.2;
const MAX_CELLS = 1000;

const EXEC_TIMEOUT_MS = 60_000;
// VHS's prompt: a blue-violet `>`.
const PROMPT: Styled = [{ text: '>', fg: { kind: 'rgb', r: 90, g: 86, b: 224 } }, { text: ' ' }];

const KEYS: Record<string, KeyName> = {
  Enter: 'enter',
  Tab: 'tab',
  Escape: 'escape',
  Backspace: 'backspace',
  Up: 'up',
  Down: 'down',
  Left: 'left',
  Right: 'right',
  'Ctrl+C': 'ctrl+c',
  'Ctrl+D': 'ctrl+d',
  'Ctrl+L': 'ctrl+l',
};
// Keys VHS knows and the IR has no bytes for.
const UNSUPPORTED_KEYS = new Set([
  'Delete',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ScrollUp',
  'ScrollDown',
]);

// Settings that only change how VHS draws its video; castwright's own options
// (--no-chrome, the player's CSS) cover that ground.
const COSMETIC_SETTINGS = new Set([
  'FontFamily',
  'LetterSpacing',
  'Framerate',
  'Margin',
  'MarginFill',
  'WindowBar',
  'WindowBarSize',
  'BorderRadius',
  'LoopOffset',
  'WaitTimeout',
  'WaitPattern',
]);

const QUOTES = ['"', "'", '`'];

interface Token {
  text: string;
  column: number;
  quoted: boolean;
}

class Ctx {
  constructor(
    readonly file: string,
    readonly lines: string[],
  ) {}

  error(line: number, column: number, message: string): never {
    throw new CastwrightParseError(
      message,
      this.file,
      { line, column },
      this.lines[line - 1] ?? '',
    );
  }
}

/**
 * VHS reads a tape as a stream of tokens, not lines: `Type "ls" Enter` is two
 * commands. A `#` token starts a comment; a `Wait` token ends the line, since
 * its regex argument is not a string and may hold quotes.
 */
function tokenize(text: string, line: number, ctx: Ctx): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (QUOTES.includes(ch)) {
      const end = text.indexOf(ch, i + 1);
      if (end < 0) ctx.error(line, i + 1, `unterminated string: missing closing ${ch}`);
      tokens.push({ text: text.slice(i + 1, end), column: i + 1, quoted: true });
      i = end + 1;
      continue;
    }
    if (ch === '#') break;
    let end = i;
    while (
      end < text.length &&
      !/[ \t]/.test(text[end] as string) &&
      !QUOTES.includes(text[end] as string)
    )
      end++;
    const word = text.slice(i, end);
    tokens.push({ text: word, column: i + 1, quoted: false });
    if (/^Wait(?:\+|@|$)/.test(word)) break;
    i = end;
  }
  return tokens;
}

/** `500ms`, `2s`, `1m`; a bare number is seconds, as in VHS. */
function duration(token: Token | undefined, line: number, ctx: Ctx, what: string): number {
  const match = token && /^(\d*\.?\d+)(ms|s|m)?$/.exec(token.text);
  if (!token || !match) {
    ctx.error(line, token?.column ?? 1, `${what} needs a duration, e.g. 500ms or 2s`);
  }
  const value = Number(match[1]);
  const unit = match[2] ?? 's';
  return Math.round(unit === 'ms' ? value : unit === 's' ? value * 1000 : value * 60_000);
}

function positive(token: Token | undefined, line: number, ctx: Ctx, what: string): number {
  const value = Number(token?.text);
  if (!token || token.text === '' || !Number.isFinite(value) || value <= 0) {
    ctx.error(line, token?.column ?? 1, `${what} needs a positive number`);
  }
  return value;
}

/** `Type@100ms` → { name: 'Type', speed: 100 }. */
function splitSpeed(
  token: Token,
  line: number,
  ctx: Ctx,
): { name: string; speed: number | undefined } {
  const at = token.text.indexOf('@');
  if (at < 0) return { name: token.text, speed: undefined };
  const speedToken = { ...token, text: token.text.slice(at + 1), column: token.column + at + 1 };
  return {
    name: token.text.slice(0, at),
    speed: duration(speedToken, line, ctx, `'${token.text.slice(0, at)}@'`),
  };
}

/** VHS theme names are spelled "Catppuccin Mocha"; ours are "catppuccin-mocha". */
function themeName(value: string): string | undefined {
  const name = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  return isThemeName(name) ? name : undefined;
}

export function isTapeFile(file: string): boolean {
  return file.endsWith('.tape');
}

/**
 * Parses a VHS tape into a Script. `file` is the tape's path, used in errors
 * and as the directory `exec:` steps run in.
 */
export function parseTape(source: string, file: string, options: TapeOptions = {}): Script {
  const lines = source.split(/\r?\n/);
  // Annotated so TypeScript narrows after ctx.error(), which never returns.
  const ctx: Ctx = new Ctx(file, lines);
  const warn = options.onWarning ?? (() => {});
  const exec = options.exec ?? false;

  const size: typeof VHS & { columns?: number; rows?: number } = { ...VHS };
  let theme = 'default';
  const cursor: CursorConfig = { style: 'block', blink: true };
  let typingSpeed = VHS.typingSpeed;

  const steps: Step[] = [];
  const env: Record<string, string> = {};
  // Commands typed while hidden: in exec mode they run, silently, before every
  // visible command — each command gets its own shell, and this is how a
  // hidden `cd` still applies.
  const setup: string[] = [];
  let hidden = false;
  let clipboard = '';
  let warnedTypingOnly = false;

  // The line being typed at the prompt: where its steps start in `steps`, what
  // it says, and whether it can still be run as one command.
  let promptPending = true;
  let lineStart = -1;
  let lineText = '';
  let lineSpeed = typingSpeed;
  let lineRunnable = true;
  let lineSource = { line: 1, column: 1 };

  const emit = (...add: Step[]): void => {
    if (!hidden) steps.push(...add);
  };

  const beginLine = (line: number, column: number, speed: number): void => {
    if (lineStart >= 0) return;
    lineStart = steps.length;
    lineText = '';
    lineSpeed = speed;
    lineRunnable = true;
    lineSource = { line, column };
  };

  const type = (text: string, speed: number, line: number, column: number): void => {
    beginLine(line, column, speed);
    lineText += text;
    emit({ kind: 'type', text: [{ text }], speed, jitter: 0, prompt: promptPending, pause: 0 });
    if (!hidden) promptPending = false;
  };

  const enter = (line: number, column: number): void => {
    const started = lineStart >= 0;
    const hasCommand = lineText.trim() !== '';
    if (hidden) {
      if (exec && hasCommand) setup.push(lineText);
    } else if (exec && started && lineRunnable && hasCommand) {
      // The typed line becomes one exec step, which types it again itself.
      const prompt = hasPrompt(steps[lineStart]);
      steps.length = lineStart;
      steps.push({
        kind: 'exec',
        command: lineText,
        timeout: EXEC_TIMEOUT_MS,
        speed: lineSpeed,
        prompt,
        pause: 0,
        source: { ...lineSource, text: lines[lineSource.line - 1] ?? '' },
        ...(Object.keys(env).length > 0 ? { env: { ...env } } : {}),
        ...(setup.length > 0 ? { setup: setup.join('\n') } : {}),
      });
    } else {
      if (exec && hasCommand) {
        warn(
          'this line is edited with keys other than Backspace, so it is typed but not run',
          lineSource.line,
          lineSource.column,
        );
      } else if (!exec && hasCommand && !warnedTypingOnly) {
        warnedTypingOnly = true;
        warn(
          'commands are typed but not run, so their output is missing — pass --allow-exec to run them',
          line,
          column,
        );
      }
      // An empty line still shows its prompt.
      if (!started && promptPending) emit(promptOnly());
      emit({ kind: 'key', key: 'enter', pause: 0 });
    }
    lineStart = -1;
    lineText = '';
    promptPending = true;
  };

  // Ctrl+C on a typed line: the shell drops it, prints ^C and a new prompt.
  const cancelLine = (): void => {
    emit({ kind: 'output', text: [{ text: '^C' }], lineDelay: 0, pause: 0 });
    emit({ kind: 'key', key: 'enter', pause: 0 });
    lineStart = -1;
    lineText = '';
    promptPending = true;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = index + 1;
    const tokens = tokenize(lines[index] as string, line, ctx);
    let at = 0;
    const next = (): Token | undefined => tokens[at++];
    const peek = (): Token | undefined => tokens[at];

    while (at < tokens.length) {
      const head = next() as Token;
      const { name, speed } = splitSpeed(head, line, ctx);

      if (name === 'Type') {
        const parts: string[] = [];
        while (peek()?.quoted) parts.push((next() as Token).text);
        if (parts.length === 0) {
          ctx.error(line, head.column, '\'Type\' needs a quoted string, e.g. Type "ls -la"');
        }
        type(parts.join(''), speed ?? typingSpeed, line, head.column);
        continue;
      }

      if (name === 'Sleep') {
        const ms = duration(next(), line, ctx, "'Sleep'");
        if (ms > 0) emit({ kind: 'wait', ms });
        continue;
      }

      if (isKey(name)) {
        const count = /^\d+$/.test(peek()?.text ?? '') ? Number((next() as Token).text) : 1;
        const gap = speed ?? typingSpeed;
        for (let n = 0; n < count; n++) {
          if (n > 0 && gap > 0) emit({ kind: 'wait', ms: gap });
          if (name === 'Enter') {
            enter(line, head.column);
          } else if (name === 'Space') {
            type(' ', gap, line, head.column);
          } else if (name === 'Backspace') {
            if (lineStart >= 0) lineText = lineText.slice(0, -1);
            emit({ kind: 'key', key: 'backspace', pause: 0 });
          } else {
            const key = KEYS[name];
            if (key === undefined) {
              if (n === 0) warn(`key '${name}' is not supported and is skipped`, line, head.column);
              continue;
            }
            if (key === 'ctrl+c' && lineStart >= 0) {
              cancelLine();
              continue;
            }
            if (lineStart >= 0) lineRunnable = false;
            emit({ kind: 'key', key, pause: 0 });
          }
        }
        continue;
      }

      switch (name) {
        case 'Set':
          applySetting(head, next, peek, line);
          break;
        case 'Hide':
          hidden = true;
          break;
        case 'Show':
          hidden = false;
          break;
        case 'Env': {
          const key = next();
          const value = next();
          if (!key || !value) {
            ctx.error(line, head.column, '\'Env\' needs a name and a value, e.g. Env NAME "value"');
          }
          env[key.text] = value.text;
          break;
        }
        case 'Copy': {
          const text = next();
          if (!text?.quoted) ctx.error(line, head.column, "'Copy' needs a quoted string");
          clipboard = text.text;
          break;
        }
        case 'Paste':
          if (clipboard !== '') type(clipboard, 0, line, head.column);
          break;
        case 'Output':
          next();
          warn(
            "'Output' is ignored — castwright picks the format with --format (cast, svg, gif, mp4)",
            line,
            head.column,
          );
          break;
        case 'Screenshot':
          next();
          warn(
            "'Screenshot' is ignored — castwright has no single-frame export",
            line,
            head.column,
          );
          break;
        // `Require` checks a program is installed; a missing one shows up as a
        // failed exec step.
        case 'Require':
          next();
          break;
        // `Wait` waits for the screen to settle; an exec step already waits
        // for its command to finish. The tokenizer dropped its regex.
        case 'Wait':
        case 'Wait+Screen':
        case 'Wait+Line':
          break;
        case 'Source':
          ctx.error(
            line,
            head.column,
            "'Source' is not supported — copy the other tape's commands into this one",
          );
          break;
        default:
          ctx.error(line, head.column, `unknown tape command '${name}'`);
      }
    }
  }
  if (promptPending && !hidden) steps.push(promptOnly());

  const cellWidth = size.fontSize * CELL_WIDTH_EM;
  const cellHeight = size.fontSize * size.lineHeight * CELL_HEIGHT_EM;
  const cols = clampCells(size.columns ?? (size.width - 2 * size.padding) / cellWidth);
  const rows = clampCells(size.rows ?? (size.height - 2 * size.padding) / cellHeight);

  return {
    version: 1,
    terminal: { cols, rows, theme, prompt: PROMPT, cursor },
    defaults: { speed: typingSpeed, pause: 0 },
    steps,
  };

  function applySetting(
    head: Token,
    next: () => Token | undefined,
    peek: () => Token | undefined,
    line: number,
  ): void {
    const key = next();
    if (!key) ctx.error(line, head.column, "'Set' needs a setting name");
    // A JSON theme runs to the end of the line.
    if (key.text === 'Theme' && peek()?.text.startsWith('{')) {
      warn('custom JSON themes are not supported, so the default is used', line, key.column);
      while (next());
      return;
    }
    const value = next();
    if (!value) ctx.error(line, key.column, `'Set ${key.text}' needs a value`);
    switch (key.text) {
      case 'Columns':
        size.columns = positive(value, line, ctx, "'Set Columns'");
        return;
      case 'Rows':
        size.rows = positive(value, line, ctx, "'Set Rows'");
        return;
      case 'Width':
        size.width = positive(value, line, ctx, "'Set Width'");
        return;
      case 'Height':
        size.height = positive(value, line, ctx, "'Set Height'");
        return;
      case 'FontSize':
        size.fontSize = positive(value, line, ctx, "'Set FontSize'");
        return;
      case 'LineHeight':
        size.lineHeight = positive(value, line, ctx, "'Set LineHeight'");
        return;
      case 'Padding':
        size.padding = Number(value.text) === 0 ? 0 : positive(value, line, ctx, "'Set Padding'");
        return;
      case 'TypingSpeed':
        typingSpeed = duration(value, line, ctx, "'Set TypingSpeed'");
        return;
      case 'CursorBlink':
        if (value.text !== 'true' && value.text !== 'false') {
          ctx.error(line, value.column, "'Set CursorBlink' needs true or false");
        }
        cursor.blink = value.text === 'true';
        return;
      case 'Theme': {
        const name = themeName(value.text);
        if (name) theme = name;
        else
          warn(
            `theme '${value.text}' is not one castwright has, so the default is used — known themes: ${THEME_NAMES.join(', ')}`,
            line,
            value.column,
          );
        return;
      }
      case 'Shell':
        if (exec && !['bash', 'zsh', 'sh'].includes(value.text)) {
          warn(`commands run with /bin/sh, not ${value.text}`, line, value.column);
        }
        return;
      case 'PlaybackSpeed':
        warn(
          "'Set PlaybackSpeed' is ignored — the demo plays at the speed it was written",
          line,
          key.column,
        );
        return;
      default:
        if (!COSMETIC_SETTINGS.has(key.text))
          ctx.error(line, key.column, `unknown setting '${key.text}'`);
    }
  }
}

function hasPrompt(step: Step | undefined): boolean {
  return step?.kind === 'type' && step.prompt;
}

function promptOnly(): Step {
  return { kind: 'type', text: [], speed: 0, jitter: 0, prompt: true, pause: 0 };
}

function isKey(name: string): boolean {
  return (
    name === 'Space' ||
    name in KEYS ||
    UNSUPPORTED_KEYS.has(name) ||
    /^(?:Ctrl|Alt|Shift)\+./.test(name)
  );
}

function clampCells(value: number): number {
  return Math.min(MAX_CELLS, Math.max(1, Math.floor(value)));
}
