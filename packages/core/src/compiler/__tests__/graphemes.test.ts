import { describe, expect, it } from 'vitest';
import { graphemes } from '../graphemes.js';

describe('graphemes', () => {
  it('splits ASCII into single characters', () => {
    expect(graphemes('abc')).toEqual(['a', 'b', 'c']);
  });

  it('treats an emoji as one grapheme cluster', () => {
    expect(graphemes('a👍b')).toEqual(['a', '👍', 'b']);
  });

  it('treats a combining character sequence as one grapheme cluster', () => {
    // 'e' + combining acute accent (U+0301) — one visual character, two code points
    const combining = 'é';
    expect(graphemes(combining)).toEqual([combining]);
  });

  it('returns an empty array for empty input', () => {
    expect(graphemes('')).toEqual([]);
  });
});
