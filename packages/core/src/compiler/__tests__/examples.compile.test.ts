// Snapshot tests over every examples/*.terminal.yaml, compiled end to end and
// serialized to asciicast v2 — this is what actually enforces the
// determinism rule from meta/decisions.md.
//
// These .cast files are committed (packages/core/src/compiler/__tests__/__snapshots__/).
// A snapshot diff is a real, readable change to a real build artifact — read
// it before accepting it with `vitest -u`. Updating a snapshot without
// reading the diff defeats the entire point of this test file.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from '../../parser/parse.js';
import { resolveShowSteps } from '../../show/resolve.js';
import { compile } from '../compile.js';
import { serializeCast } from '../serialize.js';

const examplesDir = fileURLToPath(new URL('../../../../../examples/', import.meta.url));
const files = readdirSync(examplesDir).filter((f) => f.endsWith('.terminal.yaml'));

describe('examples/*.terminal.yaml compile deterministically', () => {
  it('found at least one example file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`compiles ${file} to a stable .cast`, async () => {
      const path = `${examplesDir}${file}`;
      const source = readFileSync(path, 'utf8');
      // `show:` steps resolve against the script's own directory.
      const build = async () =>
        serializeCast(compile((await resolveShowSteps(parse(source, file), path)).script));
      const output = await build();

      // Running the compiler twice on the same input must produce byte-identical output.
      const secondRun = await build();
      expect(secondRun).toBe(output);

      const snapshotName = file.replace(/\.terminal\.yaml$/, '.cast');
      await expect(output).toMatchFileSnapshot(`./__snapshots__/${snapshotName}`);
    });
  }
});
