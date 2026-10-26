// Issue 141: v2's runway picture is drawn as asphalt (option B), not a plain blue or grey
// line. Each runway gets one strip with edge lines, one dashed centreline, eight threshold
// stripes (four at each end) and two painted numbers; a used runway also gets a blue accent
// glow, and an unused runway keeps its stripes and numbers, in muted grey (owner, 26-10-2026).
// The stripes and numbers are hidden on a phone by the stylesheet's .rwy-detail rule.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Picture } from '../../src/v2/components/Picture';
import { RUNWAY_STRIP_WIDTH } from '../../src/v2/model/diagram';
import { pictureModel } from '../../src/v2/model/picture';
import { inputFor, steady } from '../engine/helpers';
import { BASE, packOf, rigFor } from '../engine/planHelpers';
import { PACKS } from '../helpers/packs';
import { viewFromInput } from './helpers';

const css = readFileSync(resolve(import.meta.dirname, '../../src/v2/v2.css'), 'utf8').replaceAll('\r\n', '\n');

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

describe.each(PACKS.map((p) => [p.name, p] as const))('the end labels still clear the wider asphalt strips (issue 141) [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);

  /** Sampled, as the production placement search does: does the label box come within `pad` of the segment? */
  function segmentNear(box: { x0: number; y0: number; x1: number; y1: number }, x1: number, y1: number, x2: number, y2: number, pad: number): boolean {
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (x > box.x0 - pad && x < box.x1 + pad && y > box.y0 - pad && y < box.y1 + pad) return true;
    }
    return false;
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
});
