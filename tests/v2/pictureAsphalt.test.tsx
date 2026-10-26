// Issue 141: v2's runway picture is drawn as asphalt (option B), not a plain blue or grey
// line. Each runway gets one strip with edge lines, one dashed centreline, eight threshold
// stripes (four at each end) and two painted numbers; a used runway also gets a blue accent
// glow, and an unused runway keeps its stripes and numbers, in muted grey (owner, 26-10-2026).
// The stripes and numbers are hidden on a phone by the stylesheet's .rwy-detail rule.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Picture } from '../../src/v2/components/Picture';
import { endBox, RUNWAY_CLEARANCE, RUNWAY_STRIP_WIDTH } from '../../src/v2/model/diagram';
import { pictureModel } from '../../src/v2/model/picture';
import { inputFor, steady } from '../engine/helpers';
import { BASE, packOf, rigFor } from '../engine/planHelpers';
import { PACKS, type PackRef } from '../helpers/packs';
import { viewFromInput } from './helpers';

const css = readFileSync(resolve(import.meta.dirname, '../../src/v2/v2.css'), 'utf8').replaceAll('\r\n', '\n');

// The shared PACKS fixture (tests/helpers/packs.ts) is only YSSY plus two synthetic test packs,
// which is enough for most v2 tests but NOT enough here: a label or arrow placement bug can
// depend on a particular pack's own geometry (a "real", coordinate-based layout, a close-parallel
// pair, a crossing pair at a particular angle), so these clearance checks run over every real
// airport pack (the same set `npm run check-literals` reports).
const REAL_AIRPORTS = ['YSSY', 'YPAD', 'YPPH', 'YBBN', 'YSWS', 'YPDN', 'YSCB', 'NFFN', 'YBCS', 'YBTL', 'YMML'];
const refdataRoot = resolve(import.meta.dirname, '../../refdata/airports');
const REAL_PACKS: readonly PackRef[] = REAL_AIRPORTS.map((name) => ({ name, dir: join(refdataRoot, name) }));

/** One runway's group: the outer `<g ... data-used="...">` plus everything up to and including
 *  its matching closing tag (there is exactly one nested `<g>`, the detail group, inside it). */
function runwayBlocks(html: string): { used: boolean; block: string }[] {
  const re = /<g transform="translate\([^)]*\) rotate\([^)]*\)" data-used="(true|false)">([\s\S]*?<g class="rwy-detail"[^>]*>[\s\S]*?<\/g>)<\/g>/g;
  const out: { used: boolean; block: string }[] = [];
  for (const m of html.matchAll(re)) out.push({ used: m[1] === 'true', block: m[0] });
  return out;
}

const count = (block: string, needle: string): number => block.split(needle).length - 1;

describe.each(PACKS.map((p) => [p.name, p] as const))('the runway picture is drawn as asphalt, not a plain line (issue 141) [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);
  const model = pictureModel(viewFromInput(pack, inputFor(BASE, [{ wind: steady(10, 12) }])));
  const html = renderToStaticMarkup(<Picture model={model} />);
  const blocks = runwayBlocks(html);

  // Names this reversion test directly: if Picture.tsx goes back to one <line> per runway,
  // there is no `<g ... data-used>` wrapping a strip, so this is empty and every assertion below fails.
  it('fails if the runway reverts to a plain blue or grey line', () => {
    expect(blocks.length).toBe(model.diagram.runways.length);
  });

  it('draws one asphalt strip, one dashed centreline and eight threshold stripes per runway', () => {
    for (const { block } of blocks) {
      expect(count(block, '<rect class="rwy-strip"')).toBe(1);
      expect(count(block, '<line class="rwy-centreline"')).toBe(1);
      expect(count(block, '<rect class="rwy-stripe"')).toBe(8);
    }
  });

  it('paints two numbers per runway (one per end), equal to the end names', () => {
    model.diagram.runways.forEach((r, i) => {
      const { block } = blocks[i]!;
      expect(count(block, '<text class="rwy-number"')).toBe(r.ends.length);
      for (const e of r.ends) expect(block).toContain(`>${e.name}</text>`);
    });
  });

  it('keeps data-used true or false, unchanged, one group per runway', () => {
    model.diagram.runways.forEach((r, i) => {
      expect(blocks[i]!.used).toBe(r.used);
    });
  });

  it('draws the in-use accent glow only on a used runway', () => {
    for (const { used, block } of blocks) {
      expect(count(block, '<rect class="rwy-accent"')).toBe(used ? 1 : 0);
      if (used) {
        expect(block).toContain('fill="#3b82f6"');
        expect(block).toContain('opacity="0.35"');
      }
    }
  });

  it('draws an unused runway, its stripes and its numbers in muted grey; a used one in the bright markings colour', () => {
    for (const { used, block } of blocks) {
      const stripFill = used ? '#2b3447' : '#222a3c';
      const edgeStroke = used ? '#cfd8ea' : '#56627f';
      const markingColour = used ? '#e6ecf7' : '#56627f';
      const numberFill = used ? '#e6ecf7' : '#7f8cab';
      expect(block).toContain(`fill="${stripFill}"`);
      expect(block).toContain(`stroke="${edgeStroke}"`);
      expect(block).toContain(`stroke="${markingColour}"`); // the centreline
      expect(count(block, `fill="${markingColour}"`)).toBeGreaterThanOrEqual(8); // the eight threshold stripes
      expect(count(block, `fill="${numberFill}"`)).toBeGreaterThanOrEqual(1);
    }
  });

  it('marks the stripes and numbers aria-hidden, under the rwy-detail class', () => {
    for (const { block } of blocks) {
      expect(block).toContain('<g class="rwy-detail" aria-hidden="true">');
    }
  });
});

describe('the detail class is the one the phone stylesheet hides (issue 141)', () => {
  it('.rwy-detail is display: none inside the max-width: 640px block', () => {
    const i = css.indexOf('@media (max-width: 640px)');
    expect(i).toBeGreaterThan(-1);
    let depth = 0;
    let end = i;
    for (let k = css.indexOf('{', i); k < css.length; k += 1) {
      if (css[k] === '{') depth += 1;
      if (css[k] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = k;
          break;
        }
      }
    }
    const phoneBlock = css.slice(i, end + 1);
    const ruleAt = phoneBlock.indexOf('.rwy-detail');
    expect(ruleAt).toBeGreaterThan(-1);
    const ruleEnd = phoneBlock.indexOf('}', ruleAt);
    expect(phoneBlock.slice(ruleAt, ruleEnd)).toContain('display: none');
  });
});

describe.each(REAL_PACKS.map((p) => [p.name, p] as const))('the end labels still clear the wider asphalt strips (issue 141) [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);

  /**
   * Exact (Liang-Barsky), as production's `segmentHits` now is, not sampled: a sampled version on
   * either side could miss or invent a crossing that falls between sample points.
   */
  function segmentNear(box: { x0: number; y0: number; x1: number; y1: number }, x1: number, y1: number, x2: number, y2: number, pad: number): boolean {
    const bx0 = box.x0 - pad;
    const bx1 = box.x1 + pad;
    const by0 = box.y0 - pad;
    const by1 = box.y1 + pad;
    const dx = x2 - x1;
    const dy = y2 - y1;
    let tmin = 0;
    let tmax = 1;
    for (const [p, q] of [
      [-dx, x1 - bx0],
      [dx, bx1 - x1],
      [-dy, y1 - by0],
      [dy, by1 - y1],
    ] as const) {
      if (p === 0) {
        if (q < 0) return false;
        continue;
      }
      const r = q / p;
      if (p < 0) {
        if (r > tmax) return false;
        if (r > tmin) tmin = r;
      } else {
        if (r < tmin) return false;
        if (r < tmax) tmax = r;
      }
    }
    return tmin <= tmax;
  }

  it('the wind label overlaps no runway strip, at every wind direction', () => {
    for (let d = 0; d < 360; d += 10) {
      const p = pictureModel(viewFromInput(pack, inputFor(BASE, [{ wind: steady(d, 12) }])));
      const l = p.diagram.windLabel;
      const w = l.text.length * 8.6;
      const h = 15 + 3;
      const box = { x0: l.x - w / 2, y0: l.y - h / 2, x1: l.x + w / 2, y1: l.y + h / 2 };
      for (const r of p.diagram.runways) {
        expect(segmentNear(box, r.x1, r.y1, r.x2, r.y2, RUNWAY_STRIP_WIDTH / 2), `dir ${d} runway ${r.ends.map((e) => e.name).join('-')}`).toBe(false);
      }
    }
  });

  // Names this directly: the end-label box is placed by a fixed 11-unit offset along the
  // runway's own axis with no clearance check, so a wide asphalt strip (or a crossing runway)
  // can sit under the horizontal ARR/DEP text; fails if that placement returns.
  it('the active-end ARR/DEP labels overlap no runway strip, at every wind direction', () => {
    for (let d = 0; d < 360; d += 10) {
      const p = pictureModel(viewFromInput(pack, inputFor(BASE, [{ wind: steady(d, 12) }])));
      const labelled = p.diagram.runways.flatMap((r) => r.ends).filter((e) => e.roles.length > 0);
      for (const e of labelled) {
        const box = endBox(e);
        for (const r of p.diagram.runways) {
          expect(segmentNear(box, r.x1, r.y1, r.x2, r.y2, RUNWAY_CLEARANCE), `dir ${d} label ${e.name} over runway ${r.ends.map((x) => x.name).join('-')}`).toBe(false);
        }
      }
    }
  });

  /** Point-to-segment distance: how close does a sampled arrow point come to a runway's line? */
  function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
  }

  // Names this directly: the arrow's inner (head) end is a fixed 55% of its radius from the
  // picture centre, with no clearance check, so when the wind blows straight down a runway's
  // own heading (a common case: it is why that runway is recommended) the arrowhead lands on
  // the wider asphalt strip instead of stopping short of it; fails if that placement returns.
  // The sampled segment runs a little past (x2,y2) to cover the SVG arrowhead marker's own tip
  // (Picture.tsx's marker: refX 10 of 14, so the visible point sits about 4 units beyond the
  // line's end), matching what is actually drawn, not just the line underneath it.
  it('the wind arrow does not cross any runway strip, at every wind direction', () => {
    const MARKER_OVERSHOOT = 4.5;
    for (let d = 0; d < 360; d += 10) {
      const p = pictureModel(viewFromInput(pack, inputFor(BASE, [{ wind: steady(d, 12) }])));
      const a = p.diagram.arrow;
      if (a === null) continue;
      const len = Math.hypot(a.x2 - a.x1, a.y2 - a.y1) || 1;
      const tipX = a.x2 + ((a.x2 - a.x1) / len) * MARKER_OVERSHOOT;
      const tipY = a.y2 + ((a.y2 - a.y1) / len) * MARKER_OVERSHOOT;
      for (let i = 0; i <= 30; i += 1) {
        const t = i / 30;
        const x = a.x1 + (tipX - a.x1) * t;
        const y = a.y1 + (tipY - a.y1) * t;
        for (const r of p.diagram.runways) {
          expect(distToSegment(x, y, r.x1, r.y1, r.x2, r.y2), `dir ${d} arrow point ${t.toFixed(2)} over runway ${r.ends.map((e) => e.name).join('-')}`).toBeGreaterThanOrEqual(RUNWAY_CLEARANCE);
        }
      }
    }
  });
});
