import { describe, expect, it } from 'vitest';
import { outputBaseName } from '../util.js';

describe('outputBaseName', () => {
  it('strips .terminal.yaml', () => {
    expect(outputBaseName('demo.terminal.yaml')).toBe('demo');
  });

  it('strips a directory prefix along with .terminal.yaml', () => {
    expect(outputBaseName('examples/basic.terminal.yaml')).toBe('basic');
  });

  it('falls back to stripping a single extension for other filenames', () => {
    expect(outputBaseName('demo.yaml')).toBe('demo');
    expect(outputBaseName('demo.cast')).toBe('demo');
  });

  it('leaves an extensionless filename alone', () => {
    expect(outputBaseName('demo')).toBe('demo');
  });
});
