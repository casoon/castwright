// Output format registry: `--format` dispatch is structured so later renderers
// are registrations rather than if-branches; `build.ts` never grows an
// `if (format === ...)` chain.

import { serializeCast } from '../compiler/serialize.js';
import { renderGif, renderMp4 } from '../exporters/raster.js';
import { renderSvg } from '../exporters/svg.js';
import type { Cast } from '../types.js';

export interface OutputFormat {
  /** File extension without the dot, e.g. 'cast'. */
  extension: string;
  render: (cast: Cast) => string | Uint8Array | Promise<string | Uint8Array>;
}

const FORMATS: Record<string, OutputFormat> = {
  cast: { extension: 'cast', render: serializeCast },
  svg: { extension: 'svg', render: (cast) => renderSvg(cast) },
  gif: { extension: 'gif', render: renderGif },
  mp4: { extension: 'mp4', render: renderMp4 },
};

export const FORMAT_NAMES: readonly string[] = Object.keys(FORMATS);

export function getFormat(name: string): OutputFormat | undefined {
  return FORMATS[name];
}
