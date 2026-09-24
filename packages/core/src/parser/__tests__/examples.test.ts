// Every file in examples/ must parse without error. The same corpus is the
// compiler's and the CLI's, so a demo that stops parsing fails in three places.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from '../parse.js';

const examplesDir = fileURLToPath(new URL('../../../../../examples/', import.meta.url));
const files = readdirSync(examplesDir).filter((f) => f.endsWith('.terminal.yaml'));

describe('examples/*.terminal.yaml', () => {
  it('found at least one example file', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`parses ${file}`, () => {
      const source = readFileSync(`${examplesDir}${file}`, 'utf8');
      const script = parse(source, file);
      expect(script.version).toBe(1);
      expect(script.steps.length).toBeGreaterThan(0);
    });
  }
});
