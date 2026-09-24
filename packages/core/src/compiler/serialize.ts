// Cast → asciicast v2 newline-delimited JSON. See
// https://docs.asciinema.org/manual/asciicast/v2/.
// The header is line 1; every event is one compact JSON array per line after
// it. This is the only function that turns a `Cast` into the text file a
// player or `asciinema play` actually reads.
//
// The header goes through `toWireHeader` rather than straight into
// JSON.stringify: a `CastHeader` is this codebase's model, and the file has to
// carry the spec's field names — see compiler/wire.ts.

import type { Cast } from '../types.js';
import { toWireHeader } from './wire.js';

export function serializeCast(cast: Cast): string {
  const lines = [
    JSON.stringify(toWireHeader(cast.header)),
    ...cast.events.map((event) => JSON.stringify(event)),
  ];
  return `${lines.join('\n')}\n`;
}
