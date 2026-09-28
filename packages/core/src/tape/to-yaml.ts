// A tape's Script → `.terminal.yaml` source, for `castwright build demo.tape
// --allow-exec --record`. The result still holds the tape's commands as
// `exec:` steps; recordIntoSource() then replaces them with what they printed,
// so the YAML replays without running anything — and is from then on an
// ordinary demo file to edit.

import { Document } from 'yaml';
import type { Script, Step, Styled } from '../types.js';

// `{` opens markup in `run`, `type`, `output` and `prompt`; `{{` is a literal brace.
const literal = (text: string): string => text.replace(/\{/g, '{{');

const hex = (n: number): string => n.toString(16).padStart(2, '0');

/** The tape parser's styling: plain text, or an rgb foreground. */
function markup(styled: Styled): string {
  return styled
    .map((span) =>
      span.fg?.kind === 'rgb'
        ? `{#${hex(span.fg.r)}${hex(span.fg.g)}${hex(span.fg.b)}}${literal(span.text)}{/}`
        : literal(span.text),
    )
    .join('');
}

const plain = (styled: Styled): string => styled.map((span) => span.text).join('');

function stepItems(script: Script): unknown[] {
  const { speed } = script.defaults;
  const withSpeed = (item: Record<string, unknown>, stepSpeed: number) =>
    stepSpeed === speed ? item : { ...item, speed: stepSpeed };

  const items: unknown[] = [];
  const steps = script.steps;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] as Step;
    const next = steps[i + 1];
    switch (step.kind) {
      case 'type':
        // Typed at the prompt, then Enter: that is `run:`.
        if (step.prompt && next?.kind === 'key' && next.key === 'enter' && step.text.length > 0) {
          items.push(withSpeed({ run: literal(plain(step.text)) }, step.speed));
          i++;
        } else {
          items.push(
            withSpeed(
              { type: literal(plain(step.text)), ...(step.prompt ? { prompt: true } : {}) },
              step.speed,
            ),
          );
        }
        break;
      case 'key':
        items.push({ key: step.key });
        break;
      case 'wait':
        items.push({ wait: step.ms });
        break;
      case 'output':
        items.push({ output: literal(plain(step.text)) });
        break;
      case 'exec':
        items.push(
          withSpeed(
            {
              exec: step.command,
              ...(step.env ? { env: step.env } : {}),
              ...(step.prompt ? {} : { prompt: false }),
            },
            step.speed,
          ),
        );
        break;
      default:
        throw new Error(`tapeToSource: a tape does not produce '${step.kind}' steps`);
    }
  }
  return items;
}

/** `script` must come from parseTape() with `exec` set, before resolveExecSteps(). */
export function tapeToSource(script: Script, tapeFile: string): string {
  const { terminal } = script;
  const doc = new Document({
    version: 1,
    terminal: {
      cols: terminal.cols,
      rows: terminal.rows,
      theme: terminal.theme,
      prompt: markup(terminal.prompt),
      ...(terminal.cursor.blink ? {} : { cursor: { style: terminal.cursor.style, blink: false } }),
    },
    defaults: script.defaults,
    steps: stepItems(script),
  });
  doc.commentBefore = ` Recorded from ${tapeFile} with castwright build --allow-exec --record.\n Its commands ran once; what they printed is below. Edit freely — the tape is no\n longer involved.`;
  return doc.toString({ lineWidth: 0 });
}
