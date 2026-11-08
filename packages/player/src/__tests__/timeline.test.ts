import { describe, expect, it } from 'vitest';
import { advance, buildTimeline, findMarker, outputUpTo, replay } from '../timeline.js';
import type { Cast } from '../types.js';

const cast: Cast = {
  header: { version: 2, width: 80, height: 24 },
  events: [
    [0, 'o', 'a'],
    [0.1, 'o', 'b'],
    [0.25, 'm', 'chapter'],
    [0.3, 'o', 'c'],
    [1, 'o', 'd'],
  ],
};

describe('buildTimeline', () => {
  it('splits output and marker events and converts seconds to integer ms', () => {
    const tl = buildTimeline(cast);
    expect(tl.output.map((e) => e.timeMs)).toEqual([0, 100, 300, 1000]);
    expect(tl.markers).toEqual([{ timeMs: 250, data: 'chapter' }]);
  });

  it('duration is the last output event, not the last event of any kind', () => {
    expect(buildTimeline(cast).durationMs).toBe(1000);
  });

  it('duration is 0 for a cast with no output', () => {
    expect(buildTimeline({ header: cast.header, events: [] }).durationMs).toBe(0);
  });
});

describe('advance', () => {
  it('includes an event at exactly t=0 on the first call', () => {
    const tl = buildTimeline(cast);
    expect(advance(tl, 0, 0)).toEqual({ data: 'a', nextIndex: 1 });
  });

  it('is inclusive of the upper bound', () => {
    const tl = buildTimeline(cast);
    expect(advance(tl, 0, 100).data).toBe('ab');
  });

  it('resumes from an index without re-emitting', () => {
    const tl = buildTimeline(cast);
    const first = advance(tl, 0, 100);
    const second = advance(tl, first.nextIndex, 300);
    expect(second).toEqual({ data: 'c', nextIndex: 3 });
  });

  it('returns nothing when no event is due yet', () => {
    const tl = buildTimeline(cast);
    expect(advance(tl, 1, 50)).toEqual({ data: '', nextIndex: 1 });
  });

  it('stops at the end without overrunning', () => {
    const tl = buildTimeline(cast);
    expect(advance(tl, 0, 99999)).toEqual({ data: 'abcd', nextIndex: 4 });
  });
});

describe('outputUpTo', () => {
  it('concatenates every byte up to the given moment — seek is replay', () => {
    const tl = buildTimeline(cast);
    expect(outputUpTo(tl, 300)).toBe('abc');
    expect(outputUpTo(tl, 1000)).toBe('abcd');
  });
});

describe('findMarker', () => {
  it('finds a marker by label', () => {
    const tl = buildTimeline(cast);
    expect(findMarker(tl, 'chapter')?.timeMs).toBe(250);
    expect(findMarker(tl, 'nope')).toBeUndefined();
  });
});

// A cast recorded with `asciinema rec` carries event codes castwright's own
// compiler never emits. Everything that is not `o` used to land in `markers`,
// which made a resize look like a chapter and replayed nothing at the new size.
describe('buildTimeline — event codes castwright does not emit', () => {
  const recorded: Cast = {
    header: { version: 2, width: 80, height: 24 },
    events: [
      [0, 'o', 'a'],
      [0.5, 'i', 'ls\r'],
      [1, 'r', '100x50'],
      [1.5, 'm', 'chapter'],
      [2, 'o', 'b'],
      [2.5, 'r', 'nonsense'],
    ],
  };

  it('keeps resize events out of the marker list and parses their geometry', () => {
    const tl = buildTimeline(recorded);
    expect(tl.markers).toEqual([{ timeMs: 1500, data: 'chapter' }]);
    expect(tl.resizes).toEqual([{ timeMs: 1000, cols: 100, rows: 50 }]);
  });

  it('drops input events rather than replaying them as output', () => {
    expect(buildTimeline(recorded).output.map((e) => e.data)).toEqual(['a', 'b']);
  });

  it('drops a malformed resize payload instead of guessing', () => {
    expect(buildTimeline(recorded).resizes).toHaveLength(1);
  });
});

describe('replay', () => {
  const resized: Cast = {
    header: { version: 2, width: 80, height: 24 },
    events: [
      [0, 'o', 'before'],
      [1, 'r', '100x50'],
      [2, 'o', 'after'],
    ],
  };

  function sink() {
    const calls: string[] = [];
    return {
      calls,
      write: (data: string) => calls.push(`write:${data}`),
      resize: (cols: number, rows: number) => calls.push(`resize:${cols}x${rows}`),
    };
  }

  it('applies a resize between the bytes printed before and after it', () => {
    const tl = buildTimeline(resized);
    const s = sink();
    replay(tl, { index: 0, resizeIndex: 0 }, 2000, s);
    expect(s.calls).toEqual(['write:before', 'resize:100x50', 'write:after']);
  });

  it('does not re-apply a resize already passed on the previous call', () => {
    const tl = buildTimeline(resized);
    const s = sink();
    const cursor = replay(tl, { index: 0, resizeIndex: 0 }, 1500, s);
    replay(tl, cursor, 2000, s);
    expect(s.calls.filter((c) => c.startsWith('resize'))).toHaveLength(1);
    expect(s.calls).toEqual(['write:before', 'resize:100x50', 'write:after']);
  });

  it('works against a sink that cannot resize', () => {
    const tl = buildTimeline(resized);
    const calls: string[] = [];
    replay(tl, { index: 0, resizeIndex: 0 }, 2000, { write: (d) => calls.push(d) });
    expect(calls).toEqual(['before', 'after']);
  });
});
