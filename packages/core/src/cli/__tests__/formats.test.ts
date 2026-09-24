import { describe, expect, it } from 'vitest';
import { FORMAT_NAMES, getFormat } from '../formats.js';

describe('formats', () => {
  it('registers cast, svg, gif and mp4', () => {
    expect(FORMAT_NAMES).toEqual(['cast', 'svg', 'gif', 'mp4']);
    expect(getFormat('svg')?.extension).toBe('svg');
  });

  it('returns undefined for an unknown format', () => {
    expect(getFormat('png')).toBeUndefined();
  });
});
