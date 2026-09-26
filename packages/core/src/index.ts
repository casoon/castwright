// @casoon/castwright — public entry point.

export { compile } from './compiler/compile.js';
export type { FinalFrameOptions } from './compiler/final-frame.js';
export { finalFrameText } from './compiler/final-frame.js';
export { serializeCast } from './compiler/serialize.js';
export type { AsciicastHeader, AsciicastTheme } from './compiler/wire.js';
export {
  fromWireHeader,
  fromWireTheme,
  toWireHeader,
  toWireTheme,
} from './compiler/wire.js';
export { recordIntoSource } from './exec/record.js';
export type { ExecOptions, Recording, ResolvedExec } from './exec/resolve.js';
export { resolveExecSteps } from './exec/resolve.js';
export type { SourcePosition } from './parser/errors.js';
export { CastwrightParseError } from './parser/errors.js';
export type { ParseOptions } from './parser/parse.js';
export { parse } from './parser/parse.js';
export type { ResolvedScript } from './show/resolve.js';
export { resolveShowSteps } from './show/resolve.js';
export type { TapeOptions } from './tape/parse.js';
export { isTapeFile, parseTape } from './tape/parse.js';
export type { ThemeName } from './themes/index.js';
export { isThemeName, resolveTheme, THEME_NAMES } from './themes/index.js';
export type {
  Cast,
  CastEvent,
  CastHeader,
  CastTheme,
  Color,
  CursorConfig,
  CursorStyle,
  ExecStep,
  KeyName,
  Script,
  ShowStep,
  Span,
  Step,
  StepDefaults,
  Styled,
  TerminalConfig,
} from './types.js';
