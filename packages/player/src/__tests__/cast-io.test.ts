import { describe, expect, it } from 'vitest';
import { deserializeCast } from '../cast-io.js';

describe('deserializeCast', () => {
  it('reads an inlined Cast object — what the Vite plugin emits', () => {
    const cast = deserializeCast(
      '{"header":{"version":2,"width":80,"height":24},"events":[[0,"o","x"]]}',
    );
    expect(cast.header.width).toBe(80);
    expect(cast.events).toEqual([[0, 'o', 'x']]);
  });

  it('reads an asciicast v2 ndjson file — what `castwright build` writes', () => {
    const text = ['{"version":2,"width":90,"height":20}', '[0,"o","a"]', '[0.5,"o","b"]'].join(
      '\n',
    );
    const cast = deserializeCast(text);
    expect(cast.header.height).toBe(20);
    expect(cast.events).toHaveLength(2);
    expect(cast.events[1]).toEqual([0.5, 'o', 'b']);
  });

  it('tolerates a trailing newline and blank lines', () => {
    const cast = deserializeCast('{"version":2,"width":80,"height":24}\n[0,"o","a"]\n\n');
    expect(cast.events).toHaveLength(1);
  });

  it('rejects empty input', () => {
    expect(() => deserializeCast('   ')).toThrow(/empty cast/);
  });

  it('rejects a header without dimensions', () => {
    expect(() => deserializeCast('{"version":2}\n[0,"o","a"]')).toThrow(/width\/height/);
  });
});

// A file produced by `asciinema rec` or by castwright's own CLI spells the
// theme the way the spec does. Reading one used to leave xterm with
// `black: '#'`, `red: '1'` — the palette string indexed character by character.
describe('deserializeCast — a real asciicast v2 file', () => {
  // The theme from the spec's own example, verbatim.
  const header =
    '{"version":2,"width":80,"height":24,"timestamp":1504467315,"title":"demo",' +
    '"env":{"SHELL":"/bin/zsh","TERM":"xterm-256color"},' +
    '"theme":{"fg":"#d0d0d0","bg":"#212121","palette":"#151515:#ac4142:#7e8e50:#e5b567:' +
    '#6c99bb:#9f4e85:#7dd6cf:#d0d0d0:#505050:#ac4142:#7e8e50:#e5b567:#6c99bb:#9f4e85:' +
    '#7dd6cf:#f5f5f5"}}';
  const file = [header, '[0.2,"o","hi"]', '[0.5,"i","x"]', '[1,"r","100x50"]'].join('\n');

  it('reads the spec palette as 16 colours, not 16 characters', () => {
    const theme = deserializeCast(file).header.theme;
    expect(theme?.palette).toHaveLength(16);
    expect(theme?.palette[0]).toBe('#151515');
    expect(theme?.palette[15]).toBe('#f5f5f5');
  });

  it('maps fg/bg onto the fields the player uses', () => {
    const theme = deserializeCast(file).header.theme;
    expect(theme?.foreground).toBe('#d0d0d0');
    expect(theme?.background).toBe('#212121');
    // v2 carries no cursor colour; the foreground is the terminal's own default.
    expect(theme?.cursor).toBe('#d0d0d0');
  });

  it('keeps input and resize events for the timeline to classify', () => {
    expect(deserializeCast(file).events).toHaveLength(3);
  });

  it('leaves an inlined Cast — which already uses our field names — alone', () => {
    const inlined = JSON.stringify({
      header: {
        version: 2,
        width: 80,
        height: 24,
        theme: {
          foreground: '#ffffff',
          background: '#000000',
          cursor: '#ff0000',
          palette: ['#111111', '#222222'],
        },
      },
      events: [[0, 'o', 'x']],
    });
    const theme = deserializeCast(inlined).header.theme;
    expect(theme?.palette).toEqual(['#111111', '#222222']);
    expect(theme?.cursor).toBe('#ff0000');
  });
});
