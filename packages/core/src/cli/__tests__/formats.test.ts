import { describe, expect, it } from 'vitest';
import { FORMAT_NAMES, getFormat } from '../formats.js';

describe('formats', () => {
  it('registers cast', () => {
    expect(FORMAT_NAMES).toContain('cast');
    expect(getFormat('cast')?.extension).toBe('cast');
  });

  it('returns undefined for an unknown format', () => {
    expect(getFormat('svg')).toBeUndefined();
  });
});
