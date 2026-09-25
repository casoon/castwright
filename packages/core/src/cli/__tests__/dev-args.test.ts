import { describe, expect, it } from 'vitest';
import { parseDevArgs } from '../dev-args.js';
import { CliUsageError } from '../errors.js';

describe('parseDevArgs — --allow-exec', () => {
  it('passes --allow-exec through', () => {
    expect(parseDevArgs(['d.terminal.yaml', '--allow-exec'])).toEqual({
      file: 'd.terminal.yaml',
      port: 4321,
      allowExec: true,
    });
  });
});

describe('parseDevArgs', () => {
  it('defaults the port', () => {
    expect(parseDevArgs(['demo.terminal.yaml'])).toEqual({
      file: 'demo.terminal.yaml',
      port: 4321,
    });
  });

  it('accepts --port and -p', () => {
    expect(parseDevArgs(['demo.terminal.yaml', '--port', '3000']).port).toBe(3000);
    expect(parseDevArgs(['-p', '3000', 'demo.terminal.yaml']).port).toBe(3000);
  });

  it('rejects a missing file', () => {
    expect(() => parseDevArgs([])).toThrow(CliUsageError);
  });

  it('rejects a port that is not a usable port number', () => {
    expect(() => parseDevArgs(['d.yaml', '--port', 'abc'])).toThrow(/must be a port number/);
    expect(() => parseDevArgs(['d.yaml', '--port', '0'])).toThrow(/must be a port number/);
    expect(() => parseDevArgs(['d.yaml', '--port', '70000'])).toThrow(/must be a port number/);
    expect(() => parseDevArgs(['d.yaml', '--port', '1.5'])).toThrow(/must be a port number/);
  });

  it('rejects an unknown option and extra positionals', () => {
    expect(() => parseDevArgs(['d.yaml', '--bogus'])).toThrow(/unknown option/);
    expect(() => parseDevArgs(['a.yaml', 'b.yaml'])).toThrow(/extra argument/);
  });
});
