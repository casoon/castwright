// Cast → GIF / MP4 (plan item 11, spec/06-exporters.md) — a thin adapter.
//
// `agg`, the asciinema project's own renderer, already does cast → GIF well,
// including the theme the cast header carries. So this module only shells out:
// agg for the GIF, then ffmpeg for GIF → MP4. Both are external, detected at
// run time and never bundled; a missing tool is a clear error, never a silent
// empty file.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serializeCast } from '../compiler/serialize.js';
import type { Cast } from '../types.js';

export class ExternalToolError extends Error {}

const INSTALL_HINTS: Record<string, string> = {
  agg: 'install agg (https://github.com/asciinema/agg), e.g. `brew install agg` or `cargo install --git https://github.com/asciinema/agg`',
  ffmpeg: 'install ffmpeg (https://ffmpeg.org), e.g. `brew install ffmpeg`',
};

function run(tool: string, args: string[]): void {
  const result = spawnSync(tool, args, { encoding: 'utf8' });
  if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new ExternalToolError(`'${tool}' was not found on PATH — ${INSTALL_HINTS[tool]}`);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new ExternalToolError(
      `'${tool}' failed (exit ${result.status}):\n${result.stderr.trim()}`,
    );
  }
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'castwright-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeGif(cast: Cast, dir: string): string {
  const castPath = join(dir, 'in.cast');
  const gifPath = join(dir, 'out.gif');
  writeFileSync(castPath, serializeCast(cast), 'utf8');
  // agg caps idle stretches at 5 s by default; an authored `wait:` is
  // intentional, so lift the cap.
  run('agg', ['--idle-time-limit', '3600', castPath, gifPath]);
  return gifPath;
}

export function renderGif(cast: Cast): Uint8Array {
  return withTempDir((dir) => readFileSync(writeGif(cast, dir)));
}

export function renderMp4(cast: Cast): Uint8Array {
  return withTempDir((dir) => {
    const gifPath = writeGif(cast, dir);
    const mp4Path = join(dir, 'out.mp4');
    // h264 + yuv420p plays everywhere; yuv420p needs even dimensions.
    run('ffmpeg', [
      '-loglevel',
      'error',
      '-i',
      gifPath,
      '-movflags',
      'faststart',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-c:v',
      'libx264',
      mp4Path,
    ]);
    return readFileSync(mp4Path);
  });
}
