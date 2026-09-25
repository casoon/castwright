// `--record`: writes what `exec:` steps produced back into the YAML (plan
// item 10). Each `exec:` step becomes a `run:` step and an `output:` step
// carrying the recorded bytes, so the demo no longer runs anything and replays
// the same output on every build — record once, replay deterministically.
//
// Works on the YAML document, not on text, so comments and the rest of the
// file survive; only the `exec:` items in `steps` are replaced.

import { isMap, isScalar, isSeq, parseDocument, type YAMLMap } from 'yaml';
import type { Recording } from './resolve.js';

// A recorded block plays line by line at roughly the pace it was recorded,
// capped so a slow command does not become a slow demo.
const MAX_LINE_DELAY_MS = 200;

function isExecItem(item: unknown): item is YAMLMap {
  return isMap(item) && item.items.some((pair) => isScalar(pair.key) && pair.key.value === 'exec');
}

function scalarAt(map: YAMLMap, key: string): unknown {
  const pair = map.items.find((p) => isScalar(p.key) && p.key.value === key);
  return pair ? (isScalar(pair.value) ? pair.value.value : pair.value) : undefined;
}

/**
 * Returns `source` with its `exec:` steps replaced by `run:` + `output:`.
 * `recordings` must be what `resolveExecSteps()` returned for this source, in
 * step order.
 */
export function recordIntoSource(source: string, recordings: Recording[]): string {
  const doc = parseDocument(source);
  const steps = doc.get('steps', true);
  if (!isSeq(steps)) return source;

  let next = 0;
  const items: unknown[] = [];
  for (const item of steps.items) {
    if (!isExecItem(item)) {
      items.push(item);
      continue;
    }
    const recording = recordings[next++];
    if (!recording) throw new Error('recordIntoSource: fewer recordings than exec steps');

    const speed = scalarAt(item, 'speed');
    const run = {
      // `run:` reads markup and `exec:` does not: `{{` is a literal brace.
      run: recording.step.command.replace(/\{/g, '{{'),
      ...(speed === undefined ? {} : { speed }),
      ...(recording.step.prompt ? {} : { prompt: false }),
    };

    // The PTY's CRLF becomes LF — the compiler writes CRLF itself, and LF keeps
    // the recorded block readable. A lone CR (a progress bar redrawing its line)
    // is kept.
    const raw = recording.chunks
      .map((chunk) => chunk.data)
      .join('')
      .replace(/\r\n/g, '\n')
      // `raw` resolves backslash escapes, so a backslash the program printed
      // has to be written as one.
      .replace(/\\/g, '\\\\');
    const lines = raw.split('\n').length - 1;
    const pause = scalarAt(item, 'pause');
    const output = {
      output: { raw },
      ...(lines > 1
        ? { delay: Math.min(MAX_LINE_DELAY_MS, Math.round(recording.durationMs / lines)) }
        : {}),
      ...(pause === undefined ? {} : { pause }),
    };

    const runNode = doc.createNode(run);
    // Keep a comment written above the exec step with the step that replaces it.
    if (item.commentBefore) runNode.commentBefore = item.commentBefore;
    items.push(runNode, doc.createNode(output));
  }
  if (next !== recordings.length)
    throw new Error('recordIntoSource: more recordings than exec steps');

  steps.items = items as typeof steps.items;
  // No line folding: recorded lines stay as the program printed them, and the
  // rest of the file keeps the layout its author gave it.
  return doc.toString({ lineWidth: 0 });
}
