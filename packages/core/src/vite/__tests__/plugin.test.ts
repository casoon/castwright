import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { castwright } from '../index.js';

/** Stands in for Vite's plugin context; records what the plugin asks to watch. */
function context() {
  const watched: string[] = [];
  return { watched, addWatchFile: (id: string) => watched.push(id) };
}

/** The plugin's transform returns null for anything it does not handle. */
async function transforms(id: string, code = 'version: 1\nterminal: {}\nsteps: []\n') {
  const plugin = castwright();
  const result = await plugin.transform?.call(context(), code, id);
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

describe('castwright vite plugin — show:', () => {
  it('watches the shown file, so editing it recompiles the demo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'castwright-vite-'));
    try {
      writeFileSync(join(dir, 'snippet.ts'), 'const x = 1;\n');
      const id = join(dir, 'demo.terminal.yaml');
      const code = 'version: 1\nterminal: { cols: 40, rows: 5 }\nsteps:\n  - show: snippet.ts\n';
      const ctx = context();
      const result = await castwright().transform?.call(ctx, code, id);

      expect(ctx.watched).toEqual([join(dir, 'snippet.ts')]);
      expect(result?.code).toContain('const');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
