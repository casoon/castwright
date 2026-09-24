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
export type { SourcePosition } from './parser/errors.js';
export { CastwrightParseError } from './parser/errors.js';
export type { ParseOptions } from './parser/parse.js';
export { parse } from './parser/parse.js';
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
  KeyName,
  Script,
  Span,
  Step,
  StepDefaults,
  Styled,
  TerminalConfig,
} from './types.js';
