import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { castwright } from '../index.js';

/** Stands in for Vite's plugin context; records what the plugin asks to watch. */
function context() {
  const watched: string[] = [];
  return { watched, addWatchFile: (id: string) => watched.push(id), warn: () => {} };
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
      const result = await castwright({ root: dir }).transform?.call(ctx, code, id);

      expect(ctx.watched).toEqual([join(dir, 'snippet.ts')]);
      expect(result?.code).toContain('const');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('castwright vite plugin — show: edge cases', () => {
  const code = 'version: 1\nterminal: { cols: 40, rows: 5 }\nsteps:\n  - show: later.ts\n';

  it('watches a missing show: file, so creating it recompiles the demo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'castwright-vite-missing-'));
    try {
      const ctx = context();
      await expect(
        castwright({ root: dir }).transform?.call(ctx, code, join(dir, 'demo.terminal.yaml')),
      ).rejects.toThrow(/file not found/);
      expect(ctx.watched).toEqual([join(dir, 'later.ts')]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a show: file outside the Vite root', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'castwright-vite-root-'));
    try {
      mkdirSync(join(dir, 'app'));
      writeFileSync(join(dir, 'later.ts'), 'x\n');
      const demo = join(dir, 'app', 'demo.terminal.yaml');
      const outside = code.replace('later.ts', '../later.ts');
      await expect(
        castwright({ root: join(dir, 'app') }).transform?.call(context(), outside, demo),
      ).rejects.toThrow(/outside the project root/);
      const result = await castwright({
        root: join(dir, 'app'),
        allowShowOutsideRoot: true,
      }).transform?.call(context(), outside, demo);
      expect(result?.code).toContain('cast');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('castwright vite plugin — warnings', () => {
  it('forwards parse warnings through this.warn', async () => {
    const warnings: string[] = [];
    const ctx = { ...context(), warn: (message: string) => warnings.push(message) };
    const code =
      'version: 1\nterminal: { cols: 5, rows: 24 }\nsteps:\n  - output: "this is way too wide"\n';
    await castwright().transform?.call(ctx, code, '/d/x.terminal.yaml');
    expect(warnings).toEqual([expect.stringContaining('/d/x.terminal.yaml:')]);
  });
});

describe('castwright vite plugin — exec:', () => {
  const code = 'version: 1\nterminal: { cols: 40, rows: 5 }\nsteps:\n  - exec: echo from-exec\n';

  it('refuses to run a command unless allowExec is set', async () => {
    await expect(
      castwright().transform?.call(context(), code, '/d/x.terminal.yaml'),
    ).rejects.toThrow(/allowExec: true/);
  });

  it('runs it with allowExec', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'castwright-vite-exec-'));
    try {
      const result = await castwright({ allowExec: true }).transform?.call(
        context(),
        code,
        join(dir, 'demo.terminal.yaml'),
      );
      expect(result?.code).toContain('from-exec');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
