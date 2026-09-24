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

  it('measures wide glyphs in cells, not string length', async () => {
    const svg = await renderSvg({ header: header(), events: [[0, 'o', '日本']] });
    expect(svg).toContain('textLength="33.6">日本</text>');
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

  it('animates one keyframe per frame and honours reduced motion', async () => {
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
    expect(svg).toContain('animation:play 2s steps(1,end) infinite');
    expect(svg).toContain('25%{transform:translateX(-168px)}');
    expect(svg).toContain('50%{transform:translateX(-336px)}');
    expect(svg).toContain('prefers-reduced-motion:reduce');
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
