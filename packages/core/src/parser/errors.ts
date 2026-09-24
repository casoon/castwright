// Positioned parse/validation errors — see meta/conventions.md ("Errors and CLI
// output"): every error carries the source file, line and column, and quotes the
// offending source line. A DSL that cannot point at the mistake is not finished.

export interface SourcePosition {
  line: number; // 1-indexed
  column: number; // 1-indexed
}

export class CastwrightParseError extends Error {
  readonly file: string;
  readonly position: SourcePosition;
  readonly sourceLine: string;

  constructor(message: string, file: string, position: SourcePosition, sourceLine: string) {
    super(formatMessage(message, file, position, sourceLine));
    this.name = 'CastwrightParseError';
    this.file = file;
    this.position = position;
    this.sourceLine = sourceLine;
  }
}

function formatMessage(
  message: string,
  file: string,
  position: SourcePosition,
  sourceLine: string,
): string {
  const caretPad = ' '.repeat(Math.max(0, position.column - 1));
  return [
    `${file}:${position.line}:${position.column}: ${message}`,
    '',
    `  ${sourceLine}`,
    `  ${caretPad}^`,
  ].join('\n');
}

/** Resolves a 0-indexed character offset in `source` to a 1-indexed line/column. */
export function positionAt(source: string, offset: number): SourcePosition {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: offset - lastNewline };
}

export function lineAt(source: string, line: number): string {
  const lines = source.split('\n');
  return lines[line - 1] ?? '';
}

export function errorAtOffset(
  source: string,
  file: string,
  offset: number,
  message: string,
): CastwrightParseError {
  const position = positionAt(source, offset);
  return new CastwrightParseError(message, file, position, lineAt(source, position.line));
}
