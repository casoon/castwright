// Script → Cast. The time model is described in meta/architecture.md
// ("compiler/ — Script → Cast"). This is the only
// place relative timing becomes absolute and semantics become bytes; the
// compiler assumes a validated `Script` (produced by the parser) and throws
// rather than degrading silently on anything it cannot handle.

import { resolveTheme } from '../themes/index.js';
import type { Cast, CastEvent, CastHeader, Script, Step, Styled } from '../types.js';
import { graphemes } from './graphemes.js';
import { CLEAR_SCREEN, keyBytes } from './keys.js';
import { splitStyledLines } from './lines.js';
import { mulberry32, type Rng } from './prng.js';
import { renderStyled, spanToSgr } from './sgr.js';

// A bare `\n` is normalised to `\r\n`; an *already* `\r\n` is left alone, so
// this is safe to apply at every emission site without tracking whether the
// input has already passed through it.
const BARE_LF = /(?<!\r)\n/g;

class Ctx {
  t = 0; // accumulated ms — always an integer; see "Determinism" in meta/architecture.md
  currentPrompt: Styled;
  readonly events: CastEvent[] = [];
  readonly rng: Rng;

  constructor(initialPrompt: Styled, rng: Rng) {
    this.currentPrompt = initialPrompt;
    this.rng = rng;
  }

  private timeSeconds(): number {
    return Number((this.t / 1000).toFixed(3));
  }

  pushOutput(text: string): void {
    if (text.length === 0) return;
    this.events.push([this.timeSeconds(), 'o', text.replace(BARE_LF, '\r\n')]);
  }

  pushMarker(label: string): void {
    this.events.push([this.timeSeconds(), 'm', label]);
  }

  advance(ms: number): void {
    this.t += Math.round(ms);
  }
}

function jitteredDelay(speedMs: number, jitter: number, rng: Rng): number {
  if (jitter === 0) return speedMs;
  const factor = 1 + (rng() * 2 - 1) * jitter;
  return Math.max(0, Math.round(speedMs * factor));
}

function compileType(step: Extract<Step, { kind: 'type' }>, ctx: Ctx): void {
  if (step.prompt) {
    ctx.pushOutput(renderStyled(ctx.currentPrompt));
  }

  for (const span of step.text) {
    const chars = graphemes(span.text);
    if (chars.length === 0) continue;

    const { prefix, suffix } = spanToSgr(span);
    const last = chars.length - 1;

    chars.forEach((char, i) => {
      const bytes = (i === 0 ? prefix : '') + char + (i === last ? suffix : '');
      ctx.pushOutput(bytes);
      ctx.advance(jitteredDelay(step.speed, step.jitter, ctx.rng));
    });
  }
}

function compileKey(step: Extract<Step, { kind: 'key' }>, ctx: Ctx): void {
  ctx.pushOutput(keyBytes(step.key));
}

function compileOutput(step: Extract<Step, { kind: 'output' }>, ctx: Ctx): void {
  if (step.lineDelay === 0) {
    ctx.pushOutput(renderStyled(step.text));
    return;
  }
  for (const line of splitStyledLines(step.text)) {
    ctx.pushOutput(`${renderStyled(line)}\n`);
    ctx.advance(step.lineDelay);
  }
}

function compileClear(ctx: Ctx): void {
  ctx.pushOutput(CLEAR_SCREEN);
}

function compileMarker(step: Extract<Step, { kind: 'marker' }>, ctx: Ctx): void {
  ctx.pushMarker(step.label);
}

function compileStep(step: Step, ctx: Ctx): void {
  switch (step.kind) {
    case 'type':
      compileType(step, ctx);
      return;
    case 'key':
      compileKey(step, ctx);
      return;
    case 'output':
      compileOutput(step, ctx);
      return;
    case 'wait':
      ctx.advance(step.ms);
      return;
    case 'clear':
      compileClear(ctx);
      return;
    case 'prompt':
      ctx.currentPrompt = step.prompt;
      return;
    case 'marker':
      compileMarker(step, ctx);
      return;
    case 'exec':
      throw new Error(
        `step 'exec' (${step.command}) must be resolved before compiling — call resolveExecSteps() first`,
      );
    case 'show':
      throw new Error(
        `step 'show' (${step.file}) must be resolved before compiling — call resolveShowSteps() first`,
      );
  }
}

export function compile(script: Script): Cast {
  const theme = resolveTheme(script.terminal.theme);
  const rng: Rng = script.seed !== undefined ? mulberry32(script.seed) : () => 0.5;
  const ctx = new Ctx(script.terminal.prompt, rng);

  for (const step of script.steps) {
    compileStep(step, ctx);
    // "After every step except wait, t += step.pause." — wait has no `pause`
    // field (it IS the pause), so this only reads step.pause for the other kinds.
    if (step.kind !== 'wait') ctx.advance(step.pause);
  }

  const header: CastHeader = {
    version: 2,
    width: script.terminal.cols,
    height: script.terminal.rows,
    theme,
  };

  return {
    header:
      script.terminal.title === undefined ? header : { ...header, title: script.terminal.title },
    events: ctx.events,
  };
}
