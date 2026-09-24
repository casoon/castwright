import { describe, expect, it } from 'vitest';
import { computeScale, fitToWidth } from '../fit.js';

describe('computeScale', () => {
  it('scales down to fit', () => {
    expect(computeScale(360, 720)).toBe(0.5);
  });

  it('never scales up — the authored size is the design intent', () => {
    expect(computeScale(1400, 720)).toBe(1);
  });

  it('is 1 when the sizes match', () => {
    expect(computeScale(720, 720)).toBe(1);
  });

  it('falls back to 1 for unmeasurable sizes rather than collapsing the terminal', () => {
    expect(computeScale(0, 720)).toBe(1);
    expect(computeScale(360, 0)).toBe(1);
    expect(computeScale(Number.NaN, 720)).toBe(1);
    expect(computeScale(-100, 720)).toBe(1);
  });
});

describe('fitToWidth', () => {
  it('does nothing when the element has no layout yet', () => {
    const screen = document.createElement('div');
    const scaler = document.createElement('div');
    screen.appendChild(scaler);
    document.body.appendChild(screen);

    // happy-dom reports 0 for offsetWidth — the same situation as display:none
    // or a measurement before first paint.
    expect(() => fitToWidth(screen, scaler)).not.toThrow();
    expect(scaler.style.transform).toBe('');
    expect(screen.style.height).toBe('');
  });
});
