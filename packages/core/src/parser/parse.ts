// YAML (`*.terminal.yaml`) → Script. docs/reference/dsl.md documents the DSL
// and types.ts declares the target IR. This is the only place that reads YAML;
// everything downstream (compiler, renderers) works on `Script`/`Cast` only.

import type { Node, Pair, Scalar, YAMLMap, YAMLSeq } from 'yaml';
import { isMap, isScalar, isSeq, LineCounter, parseDocument } from 'yaml';
import { isThemeName, THEME_NAMES } from '../themes/index.js';
import type {
  CursorConfig,
  CursorStyle,
  KeyName,
  Script,
  Step,
  StepDefaults,
  Styled,
  TerminalConfig,
} from '../types.js';
import { errorAtOffset } from './errors.js';
import { parseMarkup } from './markup.js';
import { unescapeRaw } from './unescape.js';

// Baked-in defaults, taken verbatim from the worked example in
// docs/reference/dsl.md so the documented example and the implementation
// cannot silently diverge.
const DEFAULT_SPEED_MS = 45;
const DEFAULT_PAUSE_MS = 300;

const KEY_NAMES: readonly KeyName[] = [
  'enter',
  'tab',
  'escape',
  'backspace',
  'up',
  'down',
  'left',
  'right',
  'ctrl+c',
  'ctrl+d',
  'ctrl+l',
];

const CURSOR_STYLES: readonly CursorStyle[] = ['block', 'bar', 'underline'];

// Step primary keys other than `prompt`, which is ambiguous with the `prompt`
// modifier on `run`/`type` — see the disambiguation note in parseStep().
const PRIMARY_STEP_KEYS = ['run', 'type', 'key', 'output', 'wait', 'clear', 'marker'] as const;
type PrimaryStepKey = (typeof PRIMARY_STEP_KEYS)[number];

export interface ParseOptions {
  /** Called for non-fatal issues, e.g. an `output` line longer than `cols`. */
  onWarning?: (message: string, line: number, column: number) => void;
}

class Ctx {
  constructor(
    readonly source: string,
    readonly file: string,
    readonly lineCounter: LineCounter,
    readonly onWarning: (message: string, line: number, column: number) => void,
  ) {}

  errAt(offset: number, message: string): never {
    throw errorAtOffset(this.source, this.file, offset, message);
  }

  errAtNode(node: Node | Pair, message: string): never {
    const offset = nodeOffset(node);
    this.errAt(offset, message);
  }

  warnAt(offset: number, message: string): void {
    const pos = this.lineCounter.linePos(offset);
    this.onWarning(message, pos.line, pos.col);
  }
}

function nodeOffset(node: Node | Pair): number {
  if ('range' in node && node.range) return node.range[0];
  if ('key' in node) return nodeOffset(node.key as Node);
  return 0;
}

function keyText(pair: Pair, ctx: Ctx): string {
  const key = pair.key;
  if (!isScalar(key) || typeof key.value !== 'string') {
    ctx.errAtNode(pair, 'mapping keys must be plain strings');
  }
  return key.value as string;
}

function expectMap(
  node: Node | null | undefined,
  ctx: Ctx,
  what: string,
  at: Node | Pair,
): YAMLMap {
  if (node == null || !isMap(node)) {
    ctx.errAtNode(at, `${what} must be a mapping`);
  }
  return node;
}

function expectSeq(
  node: Node | null | undefined,
  ctx: Ctx,
  what: string,
  at: Node | Pair,
): YAMLSeq {
  if (node == null || !isSeq(node)) {
    ctx.errAtNode(at, `${what} must be a sequence`);
  }
  return node;
}

function expectScalar(
  node: Node | null | undefined,
  ctx: Ctx,
  what: string,
  at: Node | Pair,
): Scalar {
  if (node == null || !isScalar(node)) {
    ctx.errAtNode(at, `${what} must be a scalar value`);
  }
  return node;
}

function expectString(
  node: Node | null | undefined,
  ctx: Ctx,
  what: string,
  at: Node | Pair,
): string {
  const scalar = expectScalar(node, ctx, what, at);
  if (typeof scalar.value !== 'string') {
    ctx.errAtNode(scalar, `${what} must be a string`);
  }
  return scalar.value;
}

/**
 * Constraints a numeric field has beyond "is a number". Every numeric key in
 * the DSL declares one: `typeof x === 'number'` alone let `cols: 0.5`,
 * `rows: -2` and `pause: -700` through the parser, and a negative pause
 * compiles to a cast whose timestamps run backwards.
 */
interface NumberBounds {
  min?: number;
  max?: number;
  integer?: boolean;
}

/** Durations, in ms, that are almost certainly a typo rather than an intent. */
const MAX_DURATION_MS = 3_600_000; // one hour
/** Geometry beyond this is a mistake, and every row costs a headless replay. */
const MAX_TERMINAL_COLS = 1000;
const MAX_TERMINAL_ROWS = 1000;

/** Every `speed`/`pause`/`delay`/`wait` in the DSL: milliseconds, never negative. */
const DURATION: NumberBounds = { min: 0, max: MAX_DURATION_MS };

function expectNumber(
  node: Node | null | undefined,
  ctx: Ctx,
  what: string,
  at: Node | Pair,
  bounds: NumberBounds = {},
): number {
  const scalar = expectScalar(node, ctx, what, at);
  const value = scalar.value;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    ctx.errAtNode(scalar, `${what} must be a number`);
  }
  if (!Number.isFinite(value)) {
    ctx.errAtNode(scalar, `${what} must be a finite number, got ${value}`);
  }
  if (bounds.integer && !Number.isInteger(value)) {
    ctx.errAtNode(scalar, `${what} must be a whole number, got ${value}`);
  }
  if (bounds.min !== undefined && value < bounds.min) {
    ctx.errAtNode(scalar, `${what} must be at least ${bounds.min}, got ${value}`);
  }
  if (bounds.max !== undefined && value > bounds.max) {
    ctx.errAtNode(scalar, `${what} must be at most ${bounds.max}, got ${value}`);
  }
  return value;
}

function expectBoolean(
  node: Node | null | undefined,
  ctx: Ctx,
  what: string,
  at: Node | Pair,
): boolean {
  const scalar = expectScalar(node, ctx, what, at);
  if (typeof scalar.value !== 'boolean') {
    ctx.errAtNode(scalar, `${what} must be true or false`);
  }
  return scalar.value;
}

function rejectUnknownKeys(map: YAMLMap, known: readonly string[], ctx: Ctx, what: string): void {
  for (const pair of map.items) {
    const key = keyText(pair, ctx);
    if (!known.includes(key)) {
      ctx.errAtNode(pair, `unknown key '${key}' in ${what} — known keys: ${known.join(', ')}`);
    }
  }
}

function findPair(map: YAMLMap, key: string, ctx: Ctx): Pair | undefined {
  return map.items.find((pair) => keyText(pair, ctx) === key);
}

/** Parses markup in a scalar's decoded string value, positioned at the scalar's own offset. */
function parseStyledScalar(scalar: Scalar, ctx: Ctx): Styled {
  if (typeof scalar.value !== 'string') {
    ctx.errAtNode(scalar, 'expected a string');
  }
  return parseMarkup(scalar.value, {
    source: ctx.source,
    file: ctx.file,
    baseOffset: nodeOffset(scalar),
  });
}

// ---------------------------------------------------------------------------
// terminal:
// ---------------------------------------------------------------------------

function parseCursor(pair: Pair | undefined, ctx: Ctx): CursorConfig {
  if (!pair || pair.value == null) {
    return { style: 'block', blink: true };
  }
  const value = pair.value as Node;

  if (isScalar(value) && typeof value.value === 'string') {
    if (!CURSOR_STYLES.includes(value.value as CursorStyle)) {
      ctx.errAtNode(
        value,
        `terminal.cursor must be one of ${CURSOR_STYLES.join(', ')}, or a mapping`,
      );
    }
    return { style: value.value as CursorStyle, blink: true };
  }

  const map = expectMap(value, ctx, 'terminal.cursor', pair);
  rejectUnknownKeys(map, ['style', 'blink'], ctx, 'terminal.cursor');

  const stylePair = findPair(map, 'style', ctx);
  let style: CursorStyle = 'block';
  if (stylePair?.value) {
    const s = expectString(stylePair.value as Node, ctx, 'terminal.cursor.style', stylePair);
    if (!CURSOR_STYLES.includes(s as CursorStyle)) {
      ctx.errAtNode(stylePair, `terminal.cursor.style must be one of ${CURSOR_STYLES.join(', ')}`);
    }
    style = s as CursorStyle;
  }

  const blinkPair = findPair(map, 'blink', ctx);
  const blink = blinkPair?.value
    ? expectBoolean(blinkPair.value as Node, ctx, 'terminal.cursor.blink', blinkPair)
    : true;

  return { style, blink };
}

function parseTerminal(maybePair: Pair | undefined, ctx: Ctx, rootAt: YAMLMap): TerminalConfig {
  const pair = maybePair ?? ctx.errAtNode(rootAt, "missing required top-level key 'terminal'");
  const map = expectMap(pair.value as Node | null, ctx, 'terminal', pair);
  rejectUnknownKeys(map, ['title', 'cols', 'rows', 'theme', 'prompt', 'cursor'], ctx, 'terminal');

  const titlePair = findPair(map, 'title', ctx);
  const title = titlePair?.value
    ? expectString(titlePair.value as Node, ctx, 'terminal.title', titlePair)
    : undefined;

  const colsPair = findPair(map, 'cols', ctx);
  const cols = colsPair?.value
    ? expectNumber(colsPair.value as Node, ctx, 'terminal.cols', colsPair, {
        integer: true,
        min: 1,
        max: MAX_TERMINAL_COLS,
      })
    : 80;

  const rowsPair = findPair(map, 'rows', ctx);
  const rows = rowsPair?.value
    ? expectNumber(rowsPair.value as Node, ctx, 'terminal.rows', rowsPair, {
        integer: true,
        min: 1,
        max: MAX_TERMINAL_ROWS,
      })
    : 24;

  const themePair = findPair(map, 'theme', ctx);
  const theme = themePair?.value
    ? expectString(themePair.value as Node, ctx, 'terminal.theme', themePair)
    : 'default';
  if (!isThemeName(theme)) {
    ctx.errAtNode(
      themePair ?? pair,
      `unknown theme '${theme}' — known themes: ${THEME_NAMES.join(', ')}`,
    );
  }

  const promptPair = findPair(map, 'prompt', ctx);
  const prompt = promptPair?.value
    ? parseStyledScalar(
        expectScalar(promptPair.value as Node, ctx, 'terminal.prompt', promptPair),
        ctx,
      )
    : parseMarkup('$ ', { source: ctx.source, file: ctx.file, baseOffset: nodeOffset(pair) });

  const cursor = parseCursor(findPair(map, 'cursor', ctx), ctx);

  const terminal: TerminalConfig = { cols, rows, theme, prompt, cursor };
  return title === undefined ? terminal : { ...terminal, title };
}

// ---------------------------------------------------------------------------
// defaults: / seed:
// ---------------------------------------------------------------------------

function parseDefaults(pair: Pair | undefined, ctx: Ctx): StepDefaults {
  if (!pair || pair.value == null) {
    return { speed: DEFAULT_SPEED_MS, pause: DEFAULT_PAUSE_MS };
  }
  const map = expectMap(pair.value as Node, ctx, 'defaults', pair);
  rejectUnknownKeys(map, ['speed', 'pause'], ctx, 'defaults');

  const speedPair = findPair(map, 'speed', ctx);
  const speed = speedPair?.value
    ? expectNumber(speedPair.value as Node, ctx, 'defaults.speed', speedPair, DURATION)
    : DEFAULT_SPEED_MS;

  const pausePair = findPair(map, 'pause', ctx);
  const pause = pausePair?.value
    ? expectNumber(pausePair.value as Node, ctx, 'defaults.pause', pausePair, DURATION)
    : DEFAULT_PAUSE_MS;

  return { speed, pause };
}

function parseSeed(pair: Pair | undefined, ctx: Ctx): number | undefined {
  if (!pair || pair.value == null) return undefined;
  // mulberry32 takes a uint32; anything else would be silently coerced, and a
  // seed that does not survive the round trip is not a reproducible one.
  return expectNumber(pair.value as Node, ctx, 'seed', pair, {
    integer: true,
    min: 0,
    max: 0xffff_ffff,
  });
}

// ---------------------------------------------------------------------------
// steps:
// ---------------------------------------------------------------------------

function parseKeyName(pair: Pair, ctx: Ctx): KeyName {
  const value = expectString(pair.value as Node, ctx, "step 'key'", pair);
  if (!KEY_NAMES.includes(value as KeyName)) {
    ctx.errAtNode(pair, `unknown key name '${value}' — known keys: ${KEY_NAMES.join(', ')}`);
  }
  return value as KeyName;
}

function parseOutputText(pair: Pair, ctx: Ctx): Styled {
  const value = pair.value as Node;

  if (isScalar(value)) {
    return parseStyledScalar(value, ctx);
  }

  if (isMap(value)) {
    rejectUnknownKeys(value, ['raw'], ctx, 'output');
    const rawPair =
      findPair(value, 'raw', ctx) ?? ctx.errAtNode(value, "output mapping must have a 'raw' key");
    const rawScalar = expectScalar(rawPair.value as Node, ctx, 'output.raw', rawPair);
    if (typeof rawScalar.value !== 'string') {
      ctx.errAtNode(rawScalar, 'output.raw must be a string');
    }
    const text = unescapeRaw(rawScalar.value, {
      source: ctx.source,
      file: ctx.file,
      baseOffset: nodeOffset(rawScalar),
    });
    return [{ text }];
  }

  ctx.errAtNode(pair, "output must be a string or a mapping with a 'raw' key");
}

function checkOutputLineLength(text: Styled, cols: number, pair: Pair, ctx: Ctx): void {
  const joined = text.map((span) => span.text).join('');
  for (const line of joined.split('\n')) {
    if (line.length > cols) {
      ctx.warnAt(
        nodeOffset(pair),
        `output line is ${line.length} characters, wider than terminal.cols (${cols})`,
      );
      return;
    }
  }
}

function parseStep(node: Node, ctx: Ctx, defaults: StepDefaults, cols: number): Step[] {
  const map = expectMap(node, ctx, 'each step', node);

  const present = new Map<PrimaryStepKey, Pair>();
  let promptPair: Pair | undefined;
  for (const pair of map.items) {
    const key = keyText(pair, ctx);
    if ((PRIMARY_STEP_KEYS as readonly string[]).includes(key)) {
      present.set(key as PrimaryStepKey, pair);
    } else if (key === 'prompt') {
      promptPair = pair;
    }
  }

  if (present.size > 1) {
    const names = [...present.keys()].join(', ');
    ctx.errAtNode(map, `step has more than one primary key (${names}) — exactly one is required`);
  }

  const primaryEntry = [...present.entries()][0];

  // 'prompt' is the primary "change prompt" step only when run/type are absent.
  // Alongside run/type it is the boolean "suppress prompt for this step" modifier
  // — see the note under "Modifiers" in docs/reference/dsl.md.
  if (!primaryEntry) {
    if (promptPair) {
      return [parsePromptStep(promptPair, map, ctx, defaults)];
    }
    return ctx.errAtNode(
      map,
      `step has no primary key — expected one of: ${[...PRIMARY_STEP_KEYS, 'prompt'].join(', ')}`,
    );
  }

  const [primary, pair] = primaryEntry;

  switch (primary) {
    case 'run':
      return parseRunStep(pair, map, ctx, defaults, promptPair);
    case 'type':
      return [parseTypeStep(pair, map, ctx, defaults, promptPair)];
    case 'key':
      return [parseKeyStep(pair, map, ctx, defaults)];
    case 'output':
      return [parseOutputStep(pair, map, ctx, defaults, cols)];
    case 'wait':
      return [parseWaitStep(pair, map, ctx)];
    case 'clear':
      return [parseClearStep(pair, map, ctx, defaults)];
    case 'marker':
      return [parseMarkerStep(pair, map, ctx, defaults)];
  }

  // Exhaustiveness guard: PRIMARY_STEP_KEYS covers every case above.
  throw new Error(`unreachable: unhandled primary step key '${primary satisfies never}'`);
}

function stepPause(map: YAMLMap, ctx: Ctx, defaults: StepDefaults): number {
  const pausePair = findPair(map, 'pause', ctx);
  return pausePair?.value
    ? expectNumber(pausePair.value as Node, ctx, "step 'pause'", pausePair, DURATION)
    : defaults.pause;
}

function parseRunStep(
  pair: Pair,
  map: YAMLMap,
  ctx: Ctx,
  defaults: StepDefaults,
  promptPair: Pair | undefined,
): Step[] {
  rejectUnknownKeys(map, ['run', 'speed', 'jitter', 'pause', 'prompt'], ctx, "step 'run'");
  const text = parseStyledScalar(expectScalar(pair.value as Node, ctx, "step 'run'", pair), ctx);
  const speed = readSpeed(map, ctx, defaults);
  const jitter = readJitter(map, ctx);
  const promptFlag = promptPair
    ? expectBoolean(promptPair.value as Node, ctx, "step 'run' prompt", promptPair)
    : true;
  const pause = stepPause(map, ctx, defaults);

  return [
    { kind: 'type', text, speed, jitter, prompt: promptFlag, pause: 0 },
    { kind: 'key', key: 'enter', pause },
  ];
}

function parseTypeStep(
  pair: Pair,
  map: YAMLMap,
  ctx: Ctx,
  defaults: StepDefaults,
  promptPair: Pair | undefined,
): Step {
  rejectUnknownKeys(map, ['type', 'speed', 'jitter', 'pause', 'prompt'], ctx, "step 'type'");
  const text = parseStyledScalar(expectScalar(pair.value as Node, ctx, "step 'type'", pair), ctx);
  const speed = readSpeed(map, ctx, defaults);
  const jitter = readJitter(map, ctx);
  const promptFlag = promptPair
    ? expectBoolean(promptPair.value as Node, ctx, "step 'type' prompt", promptPair)
    : false;
  const pause = stepPause(map, ctx, defaults);
  return { kind: 'type', text, speed, jitter, prompt: promptFlag, pause };
}

function readSpeed(map: YAMLMap, ctx: Ctx, defaults: StepDefaults): number {
  const speedPair = findPair(map, 'speed', ctx);
  return speedPair?.value
    ? expectNumber(speedPair.value as Node, ctx, "step 'speed'", speedPair, DURATION)
    : defaults.speed;
}

function readJitter(map: YAMLMap, ctx: Ctx): number {
  const jitterPair = findPair(map, 'jitter', ctx);
  if (!jitterPair?.value) return 0;
  return expectNumber(jitterPair.value as Node, ctx, "step 'jitter'", jitterPair, {
    min: 0,
    max: 1,
  });
}

function parseKeyStep(pair: Pair, map: YAMLMap, ctx: Ctx, defaults: StepDefaults): Step {
  rejectUnknownKeys(map, ['key', 'pause'], ctx, "step 'key'");
  const key = parseKeyName(pair, ctx);
  const pause = stepPause(map, ctx, defaults);
  return { kind: 'key', key, pause };
}

function parseOutputStep(
  pair: Pair,
  map: YAMLMap,
  ctx: Ctx,
  defaults: StepDefaults,
  cols: number,
): Step {
  rejectUnknownKeys(map, ['output', 'delay', 'pause'], ctx, "step 'output'");
  const text = parseOutputText(pair, ctx);
  checkOutputLineLength(text, cols, pair, ctx);

  const delayPair = findPair(map, 'delay', ctx);
  const lineDelay = delayPair?.value
    ? expectNumber(delayPair.value as Node, ctx, "step 'delay'", delayPair, DURATION)
    : 0;
  const pause = stepPause(map, ctx, defaults);

  return { kind: 'output', text, lineDelay, pause };
}

function parseWaitStep(pair: Pair, map: YAMLMap, ctx: Ctx): Step {
  rejectUnknownKeys(map, ['wait', 'pause'], ctx, "step 'wait'");
  const ms = expectNumber(pair.value as Node, ctx, "step 'wait'", pair, DURATION);
  return { kind: 'wait', ms };
}

function parseClearStep(pair: Pair, map: YAMLMap, ctx: Ctx, defaults: StepDefaults): Step {
  rejectUnknownKeys(map, ['clear', 'pause'], ctx, "step 'clear'");
  const value = expectBoolean(pair.value as Node, ctx, "step 'clear'", pair);
  if (!value) {
    ctx.errAtNode(pair, "step 'clear' must be `true` (or omitted entirely)");
  }
  const pause = stepPause(map, ctx, defaults);
  return { kind: 'clear', pause };
}

function parsePromptStep(pair: Pair, map: YAMLMap, ctx: Ctx, defaults: StepDefaults): Step {
  rejectUnknownKeys(map, ['prompt', 'pause'], ctx, "step 'prompt'");
  const prompt = parseStyledScalar(
    expectScalar(pair.value as Node, ctx, "step 'prompt'", pair),
    ctx,
  );
  const pause = stepPause(map, ctx, defaults);
  return { kind: 'prompt', prompt, pause };
}

function parseMarkerStep(pair: Pair, map: YAMLMap, ctx: Ctx, defaults: StepDefaults): Step {
  rejectUnknownKeys(map, ['marker', 'pause'], ctx, "step 'marker'");
  const label = expectString(pair.value as Node, ctx, "step 'marker'", pair);
  const pause = stepPause(map, ctx, defaults);
  return { kind: 'marker', label, pause };
}

function parseSteps(
  maybePair: Pair | undefined,
  ctx: Ctx,
  defaults: StepDefaults,
  cols: number,
  hasSeed: boolean,
  rootAt: YAMLMap,
): Step[] {
  const pair = maybePair ?? ctx.errAtNode(rootAt, "missing required top-level key 'steps'");
  const seq = expectSeq(pair.value as Node, ctx, 'steps', pair);

  const steps: Step[] = [];
  for (const item of seq.items) {
    steps.push(...parseStep(item as Node, ctx, defaults, cols));
  }

  if (!hasSeed) {
    for (const step of steps) {
      if (step.kind === 'type' && step.jitter > 0) {
        ctx.errAtNode(
          seq,
          "a 'type'/'run' step uses jitter > 0, which requires a top-level 'seed' — see meta/decisions.md",
        );
      }
    }
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parse(source: string, file: string, options: ParseOptions = {}): Script {
  const lineCounter = new LineCounter();
  const onWarning = options.onWarning ?? (() => {});
  const doc = parseDocument(source, { lineCounter, prettyErrors: false });

  if (doc.errors.length > 0) {
    const first = doc.errors[0] as import('yaml').YAMLParseError;
    const offset = first.pos?.[0] ?? 0;
    throw errorAtOffset(source, file, offset, `YAML syntax error: ${first.message}`);
  }

  const ctx = new Ctx(source, file, lineCounter, onWarning);
  const root = expectMap(doc.contents as Node | null, ctx, 'the document', {
    range: [0, 0, 0],
  } as unknown as Node);

  rejectUnknownKeys(
    root,
    ['version', 'terminal', 'defaults', 'seed', 'steps'],
    ctx,
    'the document',
  );

  const versionPair =
    findPair(root, 'version', ctx) ??
    ctx.errAtNode(root, "missing required top-level key 'version'");
  const version = expectNumber(versionPair.value as Node, ctx, 'version', versionPair, {
    integer: true,
  });
  if (version !== 1) {
    ctx.errAtNode(
      versionPair,
      `unsupported 'version': ${version} — this parser only supports version 1`,
    );
  }

  const terminal = parseTerminal(findPair(root, 'terminal', ctx), ctx, root);
  const defaults = parseDefaults(findPair(root, 'defaults', ctx), ctx);
  const seed = parseSeed(findPair(root, 'seed', ctx), ctx);
  const steps = parseSteps(
    findPair(root, 'steps', ctx),
    ctx,
    defaults,
    terminal.cols,
    seed !== undefined,
    root,
  );

  const script: Script = { version: 1, terminal, defaults, steps };
  return seed === undefined ? script : { ...script, seed };
}
