// Issue 110: the runway picture must not go back to its small size. At about 830 px
// wide it had shrunk to about 80 px across because the old three-column answer band
// left it whatever was over. These tests read the size rules from the stylesheet and
// fail if the picture is given less room again.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../../src/v2/v2.css'), 'utf8').replaceAll('\r\n', '\n');

/** The declarations of the first rule written exactly `selector {` (at the start of a line, indented or not) in `scope`. */
function rule(selector: string, scope: string = css): string {
  const lines = scope.split('\n');
  const at = lines.findIndex((l) => l.trim() === `${selector} {`);
  if (at < 0) return '';
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((l) => l.trim() === '}');
  return rest.slice(0, end).join('\n');
}
function px(decl: string, prop: string): number {
  const m = decl
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${prop}:`));
  return m === undefined ? 0 : Number.parseInt(m.slice(prop.length + 1), 10) || 0;
}
/** One @media block, by its opening line. */
function block(query: string): string {
  const i = css.indexOf(query);
  if (i < 0) return '';
  let depth = 0;
  for (let k = css.indexOf('{', i); k < css.length; k += 1) {
    if (css[k] === '{') depth += 1;
    if (css[k] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(i, k + 1);
    }
  }
  return '';
}
// The picture is 300 x 260 units; the old rules gave it at most 330 x 290 on a wide screen and 150 x 170 on a phone.
const OLD_WIDE = { w: 330, h: 290 };
// What the old phone box drew: the picture is 300 wide by 260 high, so in a box 150 wide it was 150 x 130.
const OLD_PHONE_DRAWN_W = 150;

describe('the runway picture is large (issue 110)', () => {
  it('on a wide screen it is larger than before', () => {
    const svg = rule('.pic svg');
    expect(px(svg, 'max-width')).toBeGreaterThan(OLD_WIDE.w);
    expect(px(svg, 'max-height')).toBeGreaterThan(OLD_WIDE.h);
  });

  it('in the middle widths (about 830 px) it shares the top row with the answer, at least 350 wide and 300 high', () => {
    const mid = block('@media (max-width: 1099px)');
    expect(mid).not.toBe('');
    expect(px(rule('.pic svg', mid), 'max-height')).toBeGreaterThanOrEqual(300);
    expect(px(rule('.pic svg', mid), 'max-width')).toBeGreaterThanOrEqual(350);
    // two columns, the picture getting the larger share: not the old three-column band that squeezed it
    expect(rule('.hero', mid)).toContain('grid-template-columns: minmax(230px, 1fr) minmax(0, 1.5fr);');
  });

  it('the wide layout no longer fixes two columns around the picture', () => {
    expect(rule('.hero')).not.toContain('340px 1fr 360px');
    expect(rule('.hero')).toContain('minmax(0, 1fr)');
  });

  it('on a phone it has a row of its own and is drawn wider than the old 150 px', () => {
    const phone = block('@media (max-width: 640px)');
    expect(rule('.hero', phone)).toContain('grid-template-columns: minmax(0, 1fr);');
    const maxW = px(rule('.pic svg', phone), 'max-width');
    const maxH = px(rule('.pic svg', phone), 'max-height');
    expect(maxW).toBeGreaterThanOrEqual(240);
    expect(Math.min(maxW, (maxH * 300) / 260)).toBeGreaterThan(OLD_PHONE_DRAWN_W + 15);
    expect(rule('.pic', phone)).toContain('grid-row: 2;');
  });

  it('the rules read above exist (so a rename cannot hide a small picture)', () => {
    expect(rule('.pic svg')).toContain('max-width');
    expect(block('@media (max-width: 640px)')).not.toBe('');
  });
});
