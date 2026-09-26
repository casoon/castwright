// Inline markup parser — `{green}✓{/}`, `{bold}…{//}`, `{{` for a literal brace.
// See "Colour and style" in docs/reference/dsl.mdx. Produces a `Styled` span
// list; downstream code (the compiler) never re-parses `{tag}` syntax.

import type { Color, Span, Styled } from '../types.js';
import { errorAtOffset } from './errors.js';

const BASE_COLOR_NAMES = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
] as const;

const ATTRIBUTE_NAMES = ['bold', 'dim', 'italic', 'underline'] as const;
type AttributeName = (typeof ATTRIBUTE_NAMES)[number];

type MarkupOp =
  | { kind: 'fg'; color: Color; openedAt: number }
  | { kind: 'bg'; color: Color; openedAt: number }
  | { kind: 'attr'; name: AttributeName; openedAt: number };

export interface MarkupContext {
  /** The full original source file, for error line/column resolution. */
  source: string;
  file: string;
  /** Character offset of `text`'s first character within `source`. */
  baseOffset: number;
}

function resolveColorName(name: string): Color | null {
  const bright = name.startsWith('bright-');
  const base = bright ? name.slice('bright-'.length) : name;
  const index = BASE_COLOR_NAMES.indexOf(base as (typeof BASE_COLOR_NAMES)[number]);
  if (index === -1) return null;
  return { kind: 'ansi', index: bright ? index + 8 : index };
}

function isAttributeName(tag: string): tag is AttributeName {
  return (ATTRIBUTE_NAMES as readonly string[]).includes(tag);
}

function resolveTag(tag: string, openedAt: number): MarkupOp | null {
  if (isAttributeName(tag)) {
    return { kind: 'attr', name: tag, openedAt };
  }
  if (/^#[0-9a-fA-F]{6}$/.test(tag)) {
    const r = Number.parseInt(tag.slice(1, 3), 16);
    const g = Number.parseInt(tag.slice(3, 5), 16);
    const b = Number.parseInt(tag.slice(5, 7), 16);
    return { kind: 'fg', color: { kind: 'rgb', r, g, b }, openedAt };
  }
  if (tag.startsWith('bg-')) {
    const color = resolveColorName(tag.slice(3));
    return color ? { kind: 'bg', color, openedAt } : null;
  }
  const color = resolveColorName(tag);
  return color ? { kind: 'fg', color, openedAt } : null;
}

function currentStyle(stack: MarkupOp[]): Omit<Span, 'text'> {
  const style: Omit<Span, 'text'> = {};
  for (const op of stack) {
    if (op.kind === 'fg') style.fg = op.color;
    else if (op.kind === 'bg') style.bg = op.color;
    else style[op.name] = true;
  }
  return style;
}

/**
 * Parses `{tag}…{/}` inline markup into a `Styled` span list.
 *
 * @throws {CastwrightParseError} on an unknown tag, an unterminated `{…`, an
 *   unmatched `{/}`, or a tag left open at the end of the text.
 */
export function parseMarkup(text: string, ctx: MarkupContext): Styled {
  const spans: Span[] = [];
  const stack: MarkupOp[] = [];
  let buffer = '';
  let i = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    spans.push({ text: buffer, ...currentStyle(stack) });
    buffer = '';
  };

  while (i < text.length) {
    const ch = text[i];
    if (ch !== '{') {
      buffer += ch;
      i++;
      continue;
    }
    if (text[i + 1] === '{') {
      buffer += '{';
      i += 2;
      continue;
    }
    const close = text.indexOf('}', i + 1);
    if (close === -1) {
      throw errorAtOffset(
        ctx.source,
        ctx.file,
        ctx.baseOffset + i,
        "unterminated markup tag: missing closing '}'",
      );
    }
    const content = text.slice(i + 1, close);

    if (content === '/') {
      flush();
      if (stack.length === 0) {
        throw errorAtOffset(
          ctx.source,
          ctx.file,
          ctx.baseOffset + i,
          "unmatched '{/}': no open tag to close",
        );
      }
      stack.pop();
      i = close + 1;
      continue;
    }
    if (content === '//') {
      flush();
      stack.length = 0;
      i = close + 1;
      continue;
    }

    const op = resolveTag(content, i);
    if (!op) {
      throw errorAtOffset(
        ctx.source,
        ctx.file,
        ctx.baseOffset + i,
        `unknown markup tag '{${content}}'`,
      );
    }
    flush();
    stack.push(op);
    i = close + 1;
  }

  flush();

  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1] as MarkupOp;
    throw errorAtOffset(
      ctx.source,
      ctx.file,
      ctx.baseOffset + unclosed.openedAt,
      `unclosed markup tag: '{...}' opened here is never closed with '{/}' or '{//}'`,
    );
  }

  return spans;
}
