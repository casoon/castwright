// Output format registry: `--format` dispatch is structured so later renderers
// are registrations rather than if-branches. SVG and GIF/MP4 add entries here;
// `build.ts` never grows an `if (format === ...)` chain.

import { serializeCast } from '../compiler/serialize.js';
import type { Cast } from '../types.js';

export interface OutputFormat {
  /** File extension without the dot, e.g. 'cast'. */
  extension: string;
  render: (cast: Cast) => string;
}

const FORMATS: Record<string, OutputFormat> = {
  cast: { extension: 'cast', render: serializeCast },
};

export const FORMAT_NAMES: readonly string[] = Object.keys(FORMATS);

export function getFormat(name: string): OutputFormat | undefined {
  return FORMATS[name];
}
