import { describe, expect, it } from 'vitest';
import { castwright } from '../index.js';

/** The plugin's transform returns null for anything it does not handle. */
async function transforms(id: string, code = 'version: 1\nterminal: {}\nsteps: []\n') {
  const plugin = castwright();
  const result = await plugin.transform?.(code, id);
  return result !== null && result !== undefined;
}

describe('castwright vite plugin — which ids it claims', () => {
  it('handles a plain *.terminal.yaml import', async () => {
    expect(await transforms('/demos/x.terminal.yaml')).toBe(true);
  });

  it('ignores other files', async () => {
    expect(await transforms('/demos/x.yaml')).toBe(false);
    expect(await transforms('/src/main.ts')).toBe(false);
  });

  it('leaves ?raw alone — the caller asked for the source text, not a module', async () => {
    expect(await transforms('/demos/x.terminal.yaml?raw')).toBe(false);
  });

  it('leaves ?url, ?inline and ?worker alone too', async () => {
    expect(await transforms('/demos/x.terminal.yaml?url')).toBe(false);
    expect(await transforms('/demos/x.terminal.yaml?inline')).toBe(false);
    expect(await transforms('/demos/x.terminal.yaml?worker')).toBe(false);
  });

  it('still handles an import carrying an unrelated query', async () => {
    expect(await transforms('/demos/x.terminal.yaml?t=1699999')).toBe(true);
  });
});
