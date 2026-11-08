import { describe, expect, it } from 'vitest';
import { jsonForScript, reservedHeightPx } from '../inline-json.js';

describe('jsonForScript', () => {
  it('cannot be ended early by </script> or <!--', () => {
    const cast = { output: ['$ cat index.html', '</script><img src=x onerror=alert(1)>', '<!--'] };
    const json = jsonForScript(cast);
    expect(json).not.toContain('<');
    expect(json.toLowerCase()).not.toContain('</script');
    expect(JSON.parse(json)).toEqual(cast);
  });

  it('escapes U+2028 and U+2029 and round-trips them', () => {
    const cast = { text: 'a\u2028b\u2029c' };
    const json = jsonForScript(cast);
    expect(json).not.toMatch(/[\u2028\u2029]/);
    expect(JSON.parse(json)).toEqual(cast);
  });
});

describe('reservedHeightPx', () => {
  const base = { castRows: 10, rows: undefined, chrome: undefined, controls: undefined } as const;

  it('adds rows, screen padding, title bar and transport', () => {
    expect(reservedHeightPx(base)).toBe(10 * 18 + 24 + 30 + 44);
  });

  it('drops the title bar for chrome="none"', () => {
    expect(reservedHeightPx({ ...base, chrome: 'none' })).toBe(10 * 18 + 24 + 44);
  });

  it('reserves no transport row for hover or none controls', () => {
    expect(reservedHeightPx({ ...base, controls: 'hover' })).toBe(10 * 18 + 24 + 30);
    expect(reservedHeightPx({ ...base, controls: 'none' })).toBe(10 * 18 + 24 + 30);
  });

  it('lets the rows prop win over the cast', () => {
    expect(reservedHeightPx({ ...base, rows: 4 })).toBe(4 * 18 + 24 + 30 + 44);
  });

  it('is undefined when the row count is unknown', () => {
    expect(reservedHeightPx({ ...base, castRows: undefined })).toBeUndefined();
  });
});
