// How a mode's weather minima show on the screen (issue 34): the cause word,
// the timeline mode-row tooltip and the settings drawer's Limits section.
import { describe, expect, it } from 'vitest';
import { drawerModel } from '../../src/ui/model/drawer';
import { CAUSE_WORDS } from '../../src/ui/model/status';
import { modeRows } from '../../src/ui/model/timeline';
import { minimaText } from '../../src/ui/format';
import { packOf, rigFor } from '../engine/planHelpers';
import { TEST_PACK } from '../helpers/packs';
import { viewOf } from './helpers';

const NOW = Date.UTC(2026, 9, 23, 10, 0, 0);
const BANNED = /\b(penalty|penalties|cost|costs|points?|scores?)\b/i;

describe('weather minima on the screen', () => {
  const rig = rigFor(TEST_PACK);
  const pack = packOf(rig, undefined, (f) => {
    const mode = f['modes.json'].modes.find((m: { id: string }) => m.id === rig.a);
    mode.minima = { ceilingFt: 4500, visibilityMetres: 8000, requiresDrySurface: true };
  });
  const text = 'ceiling 4,500 ft or higher; visibility 8 km or more; dry runway';

  it('has a cause word for MIN', () => {
    expect(CAUSE_WORDS['MIN']).toBe('weather minima');
  });

  it('writes the minima in plain words, leaving out what a mode does not require', () => {
    expect(minimaText({ ceilingFt: 4500, visibilityMetres: 8000, requiresDrySurface: true })).toBe(text);
    expect(minimaText({ ceilingFt: null, visibilityMetres: 8500, requiresDrySurface: false })).toBe('visibility 8.5 km or more');
    expect(minimaText({ ceilingFt: 800, visibilityMetres: null, requiresDrySurface: false })).toBe('ceiling 800 ft or higher');
  });

  it('adds the minima to the tooltip of a mode that has them, and only that mode', () => {
    const rows = modeRows(viewOf(pack, rig, ['ok', 'ok']));
    expect(rows.find((r) => r.modeId === rig.a)?.title).toContain(`; minima: ${text}`);
    for (const r of rows.filter((x) => x.modeId !== rig.a)) expect(r.title).not.toContain('minima');
  });

  it('lists the minima in the drawer Limits section beside the crosswind rows, in plain words', () => {
    const limits = drawerModel(pack, NOW).sections.find((s) => s.id === 'limits');
    const rows = limits?.rows.filter((r) => r.label.startsWith('Minima')) ?? [];
    expect(rows).toEqual([{ label: `Minima, Mode ${rig.a}`, value: text, help: null }]);
    expect(`${rows[0]?.label} ${rows[0]?.value}`).not.toMatch(BANNED);
    const labels = limits?.rows.map((r) => r.label) ?? [];
    expect(labels.indexOf(`Minima, Mode ${rig.a}`)).toBeGreaterThan(labels.indexOf(`Crosswind limit, Mode ${rig.a}`));
  });

  it('adds nothing for a pack without minima', () => {
    const plain = packOf(rig);
    const limits = drawerModel(plain, NOW).sections.find((s) => s.id === 'limits');
    expect(limits?.rows.some((r) => r.label.startsWith('Minima'))).toBe(false);
    for (const r of modeRows(viewOf(plain, rig, ['ok']))) expect(r.title).not.toContain('minima');
  });
});
