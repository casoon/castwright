// Output format registry: `--format` dispatch is structured so later renderers
// are registrations rather than if-branches; `build.ts` never grows an
// `if (format === ...)` chain.

import { serializeCast } from '../compiler/serialize.js';
import { renderGif, renderMp4 } from '../exporters/raster.js';
import { renderSvg, type SvgOptions } from '../exporters/svg.js';
import type { Cast } from '../types.js';

export interface OutputFormat {
  /** File extension without the dot, e.g. 'cast'. */
  extension: string;
  /** `svg` reads the SVG options; the other formats have none and ignore them. */
  render: (cast: Cast, svg: SvgOptions) => string | Uint8Array | Promise<string | Uint8Array>;
}

const FORMATS: Record<string, OutputFormat> = {
  cast: { extension: 'cast', render: (cast) => serializeCast(cast) },
  svg: { extension: 'svg', render: renderSvg },
  gif: { extension: 'gif', render: (cast) => renderGif(cast) },
  mp4: { extension: 'mp4', render: (cast) => renderMp4(cast) },
};

export const FORMAT_NAMES: readonly string[] = Object.keys(FORMATS);

export function getFormat(name: string): OutputFormat | undefined {
  return FORMATS[name];
}
