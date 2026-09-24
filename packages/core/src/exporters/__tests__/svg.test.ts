import { describe, expect, it } from 'vitest';
import { compile } from '../../compiler/compile.js';
import { parse } from '../../parser/parse.js';
import type { Cast } from '../../types.js';
import { renderSvg } from '../svg.js';

function castOf(yaml: string): Cast {
  return compile(parse(yaml, 'test.terminal.yaml'));
}

const header = (cols = 20, rows = 3): Cast['header'] => ({ version: 2, width: cols, height: rows });

describe('renderSvg', () => {
  it('is deterministic', async () => {
    const cast = castOf(
      'version: 1\nterminal: { cols: 30, rows: 4 }\nsteps:\n  - run: echo hi\n  - output: hi\n',
    );
    expect(await renderSvg(cast)).toBe(await renderSvg(cast));
  });

  it('uses the theme the cast carries', async () => {
    const cast = castOf(
      'version: 1\nterminal: { cols: 30, rows: 4, theme: catppuccin-mocha }\nsteps:\n  - output: "{green}ok{/}"\n',
    );
    const svg = await renderSvg(cast);
    expect(svg).toContain('fill="#1e1e2e"'); // background
    expect(svg).toContain('fill:#a6e3a1'); // palette green
  });

  it('pins every text run to its cell width', async () => {
    const svg = await renderSvg({ header: header(), events: [[0, 'o', '  hello']] });
    // two leading spaces move the start column instead of being drawn
    expect(svg).toContain('<text x="16.8" y="13.5" textLength="42">hello</text>');
  });

  it('places each non-ASCII glyph at its own column, unpinned', async () => {
    // textLength spreads a width difference over every character of a run, so
    // a glyph the font draws wider or narrower than a cell would shift its
    // neighbours. Wide glyphs count two cells, from the terminal buffer.
    const svg = await renderSvg({ header: header(), events: [[0, 'o', '日本 ok ✓ go']] });
    expect(svg).toContain('<text x="0" y="13.5">日</text><text x="16.8" y="13.5">本</text>');
    expect(svg).toContain('<text x="42" y="13.5" textLength="16.8">ok</text>');
    expect(svg).toContain('<text x="67.2" y="13.5">✓</text>');
    expect(svg).toContain('<text x="84" y="13.5" textLength="16.8">go</text>');
  });

  it('defines a repeated row once', async () => {
    const svg = await renderSvg({
      header: header(),
      events: [
        [0, 'o', 'same\r\n'],
        [1, 'o', 'same\r\n'],
      ],
    });
    expect(svg.match(/>same</g)).toHaveLength(1);
  });

  it('gives a changing line its own timeline and honours reduced motion', async () => {
    const svg = await renderSvg(
      {
        header: header(),
        events: [
          [0.5, 'o', 'a'],
          [1, 'o', 'b'],
        ],
      },
      { loopDelay: 1000 },
    );
    expect(svg).toContain('.a{animation-duration:2s;animation-timing-function:steps(1,end)');
    // The line's states: blank, 'a', 'ab' — at 0 %, 25 % and 50 % of 2 s.
    expect(svg).toContain(
      '@keyframes k0{0%{translate:0px}25%{translate:-168px}50%{translate:-336px}',
    );
    // The cursor moves one cell per keystroke.
    expect(svg).toContain('25%{translate:8.4px 0px}50%{translate:16.8px 0px}');
    // Reduced motion: every timeline paused inside the final hold.
    expect(svg).toContain(
      '@media (prefers-reduced-motion:reduce){.a{animation-play-state:paused;animation-delay:-1.5s}}',
    );
  });

  it('does not repeat unchanged lines while typing', async () => {
    const svg = await renderSvg({
      header: header(20, 3),
      events: [
        [0, 'o', 'static line\r\n'],
        [1, 'o', 'x'],
        [2, 'o', 'y'],
        [3, 'o', 'z'],
      ],
    });
    // The first line never changes: one plain reference, no timeline.
    expect(svg.match(/href="#r0"/g)).toHaveLength(1);
    expect(svg).toContain('<use href="#r0" y="0"/>');
  });

  it('scrolls by moving one strip of lines, not by changing every row', async () => {
    const lines = Array.from({ length: 6 }, (_, i) => [i + 1, 'o', `line ${i}\r\n`] as const);
    const svg = await renderSvg({ header: header(20, 3), events: lines.map((e) => [...e]) });
    // One scroll timeline for the strip…
    expect(svg).toMatch(/translate:0 -18px\}.*translate:0 -36px\}.*translate:0 -54px\}/);
    // …and each printed line defined and referenced once, at its buffer index.
    for (let i = 0; i < 6; i++) expect(svg.match(new RegExp(`>line ${i}<`, 'g'))).toHaveLength(1);
  });

  it('switches to and from the alternate screen', async () => {
    const svg = await renderSvg({
      header: header(20, 3),
      events: [
        [0, 'o', 'shell\r\n'],
        [1, 'o', '\x1b[?1049h\x1b[Hfull screen'],
        [2, 'o', '\x1b[?1049l'],
      ],
    });
    expect(svg).toContain('>full screen<');
    expect(svg).toContain('visibility:hidden');
    expect(svg).toContain('visibility:visible');
  });

  it('merges changes closer than minFrameInterval', async () => {
    const svg = await renderSvg(
      {
        header: header(),
        events: [
          [1, 'o', 'a'],
          [1.01, 'o', 'b'],
        ],
      },
      { minFrameInterval: 30 },
    );
    expect(svg).not.toContain('>a</text>');
    expect(svg).toContain('>ab</text>');
  });

  it('is static when nothing changes over time', async () => {
    const svg = await renderSvg({ header: header(), events: [[0, 'o', 'x']] });
    expect(svg).not.toContain('@keyframes');
  });

  it('hides the cursor after DECTCEM reset', async () => {
    const svg = await renderSvg({ header: header(), events: [[0, 'o', 'x\x1b[?25l']] });
    expect(svg).not.toContain('class="cur"');
  });

  it('escapes text, the title, and the attribute the title also lands in', async () => {
    // The quote is the dangerous character: the title is interpolated into
    // aria-label="…", where a raw " closes the attribute and the document stops
    // being well-formed XML — which for an SVG means the browser draws nothing.
    const svg = await renderSvg({
      header: { ...header(), title: 'say "hi" & <tags>' },
      events: [[0, 'o', '<&>"']],
    });

    const escaped = 'say &quot;hi&quot; &amp; &lt;tags&gt;';
    expect(svg).toContain(`aria-label="${escaped}"`);
    expect(svg).toContain(`<title>${escaped}</title>`);
    expect(svg).toContain('&lt;&amp;&gt;&quot;');

    // Read the attribute back the way a parser would — up to the first quote —
    // so an escaping hole shows up as a value that ended too early rather than
    // as a substring that happens to be present somewhere.
    const after = svg.slice(svg.indexOf('aria-label="') + 'aria-label="'.length);
    expect(after.slice(0, after.indexOf('"'))).toBe(escaped);
  });

  it('drops the title bar with chrome: false', async () => {
    const svg = await renderSvg({ header: header(), events: [] }, { chrome: false });
    expect(svg).not.toContain('<circle');
  });
});
