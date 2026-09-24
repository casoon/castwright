// Typing granularity is per grapheme cluster, not per UTF-16 code unit — see
// one grapheme cluster at a time, never one code unit. `Intl.Segmenter` is
// available in Node 22+ and every target browser, so no dependency.

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function graphemes(text: string): string[] {
  if (text.length === 0) return [];
  return [...segmenter.segment(text)].map((s) => s.segment);
}
