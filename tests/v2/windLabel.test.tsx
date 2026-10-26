// Issue 105 and 107: the wind label sits beside the wind arrow's tail, follows the arrow, stays
// inside the picture and covers no runway name, runway, arrow or the north note, at every wind
// direction; and the picture draws no cross marks at all.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Picture } from '../../src/v2/components/Picture';
import { DIAGRAM, endBox, WIND_LABEL_FONT, type Box } from '../../src/v2/model/diagram';
import { pictureModel } from '../../src/v2/model/picture';
import { inputFor, steady, vrb } from '../engine/helpers';
import { BASE, packOf, rigFor } from '../engine/planHelpers';
import { PACKS } from '../helpers/packs';
import { viewFromInput, viewOf } from './helpers';

const DIRECTIONS = Array.from({ length: 36 }, (_v, i) => i * 10);

function labelBox(p: ReturnType<typeof pictureModel>): Box {
  const w = p.diagram.windLabel.text.length * 8.6;
  const h = WIND_LABEL_FONT + 3;
  const { x, y } = p.diagram.windLabel;
  return { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
}
const hit = (a: Box, b: Box): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const distToPoint = (b: Box, x: number, y: number): number => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));

describe.each(PACKS.map((p) => [p.name, p] as const))('the wind label is placed by the arrow [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);
  const at = (dir: number, kt = 12, gust: number | null = null) => pictureModel(viewFromInput(pack, inputFor(BASE, [{ wind: steady(dir, kt, gust) }])));

  it('is immediately beside the tail of the arrow, at every direction (all four quadrants)', () => {
    for (const d of DIRECTIONS) {
      const p = at(d);
      const a = p.diagram.arrow;
      expect(a, `dir ${d}`).not.toBeNull();
      expect(p.diagram.windLabel.place).toBe('arrow');
      // the label's nearest edge is within a short distance of the tail end of the arrow
      expect(distToPoint(labelBox(p), a?.x1 ?? 0, a?.y1 ?? 0), `dir ${d}`).toBeLessThanOrEqual(30);
    }
  });

  it('follows the arrow: the label moves with the wind direction and stays on the side the wind comes from', () => {
    const east = at(90).diagram.windLabel;
    const west = at(270).diagram.windLabel;
    const north = at(0).diagram.windLabel;
    const south = at(180).diagram.windLabel;
    expect(east.x - west.x).toBeGreaterThan(100);
    expect(south.y - north.y).toBeGreaterThan(60);
    for (const d of DIRECTIONS) {
      const l = at(d).diagram.windLabel;
      const out = (l.x - DIAGRAM.width / 2) * Math.sin((d * Math.PI) / 180) - (l.y - DIAGRAM.height / 2) * Math.cos((d * Math.PI) / 180);
      expect(out, `dir ${d}`).toBeGreaterThan(0);
    }
  });

  it('stays inside the picture and covers no runway name, runway, arrow or the north note, at every direction, with and without gusts', () => {
    for (const d of DIRECTIONS) {
      for (const p of [at(d), at(d, 23, 34)]) {
        const b = labelBox(p);
        expect(b.x0, `dir ${d}`).toBeGreaterThanOrEqual(0);
        expect(b.y0).toBeGreaterThanOrEqual(0);
        expect(b.x1).toBeLessThanOrEqual(DIAGRAM.width);
        expect(b.y1).toBeLessThanOrEqual(DIAGRAM.height);
        for (const e of p.diagram.runways.flatMap((r) => r.ends)) expect(hit(b, endBox(e)), `dir ${d} over ${e.name}`).toBe(false);
        const a = p.diagram.arrow;
        for (let i = 0; i <= 20; i += 1) {
          const t = i / 20;
          const x = (a?.x1 ?? 0) + ((a?.x2 ?? 0) - (a?.x1 ?? 0)) * t;
          const y = (a?.y1 ?? 0) + ((a?.y2 ?? 0) - (a?.y1 ?? 0)) * t;
          expect(distToPoint(b, x, y) > 0 || i === 0, `dir ${d} arrow t=${t}`).toBe(true);
        }
        expect(hit(b, { x0: DIAGRAM.width - 44, y0: 6, x1: DIAGRAM.width - 10, y1: 22 }), `dir ${d} north note`).toBe(false);
      }
    }
  });

  it('keeps the text and the values unchanged', () => {
    expect(at(130, 9).windLabel).toBe('130° 9 kt');
    expect(at(130, 9).diagram.windLabel.text).toBe('130° 9 kt');
    expect(at(190, 23, 34).diagram.windLabel.text).toBe('190° 23G34 kt');
  });

  it('with no arrow (variable or unknown wind) the label stays in the corner', () => {
    const v = pictureModel(viewFromInput(pack, inputFor(BASE, [{ wind: vrb(5) }])));
    expect(v.diagram.arrow).toBeNull();
    expect(v.diagram.windLabel).toMatchObject({ place: 'corner', x: 8, y: 18, text: 'VRB 5 kt' });
  });

  it('is drawn at the placed position', () => {
    const p = at(130, 9);
    const html = renderToStaticMarkup(<Picture model={p} />);
    expect(html).toContain(`x="${p.diagram.windLabel.x}" y="${p.diagram.windLabel.y}" text-anchor="middle"`);
    expect(html).toContain('data-place="arrow"');
    expect(html).not.toContain('x="8" y="18"');
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('the picture has no cross marks (issue 107) [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);

  it('draws no cross glyph, even with a strong tailwind on an end, and names no tailwind ends in its title', () => {
    for (const d of DIRECTIONS) {
      const p = pictureModel(viewFromInput(pack, inputFor(BASE, [{ wind: steady(d, 25) }])));
      const html = renderToStaticMarkup(<Picture model={p} />);
      expect(html, `dir ${d}`).not.toMatch(/✕|✖|×|&#x2715;|&#10005;/);
      expect(p.title).not.toMatch(/tailwind/i);
      for (const e of p.diagram.runways.flatMap((r) => r.ends)) expect('over' in e).toBe(false);
    }
  });

  it('keeps the runways, their names and the blue active ends, and the wind arrow', () => {
    const p = pictureModel(viewOf(pack, rig, ['ok', 'ok']));
    const html = renderToStaticMarkup(<Picture model={p} />);
    for (const r of pack.runways) expect(html).toContain(r.name);
    expect(html).toContain('data-used="true"');
    expect(html).toContain('marker-end');
  });
});
