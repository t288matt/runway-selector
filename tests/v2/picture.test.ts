// The runway picture and the slim forecast bar: their view models.
import { describe, expect, it } from 'vitest';
import { runwayComponentRows } from '../../src/ui/model/panels';
import { forecastBarModel, windRuns } from '../../src/v2/model/forecastBar';
import { currentWind, pictureModel, tailwindEnds } from '../../src/v2/model/picture';
import { steady, vrb } from '../engine/helpers';
import { PACKS } from '../helpers/packs';
import { packOf, rigFor, same, type Wx } from '../engine/planHelpers';
import { viewFromInput, viewOf } from './helpers';
import { BASE } from '../engine/planHelpers';
import { inputFor } from '../engine/helpers';

describe.each(PACKS.map((p) => [p.name, p] as const))('v2 runway picture [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);

  it('marks the tailwind ends: the same ends v1 finds over the tailwind limit', () => {
    for (const wx of [rig.badForA, rig.badForB, rig.badForBoth]) {
      const view = viewFromInput(pack, inputFor(BASE, [{ wind: wx }]));
      const v1 = runwayComponentRows(view);
      const expected = v1.filter((r) => r.over === 'TW').map((r) => r.name);
      expect([...tailwindEnds(view)].sort()).toEqual(expected.sort());
    }
  });

  it('draws every runway end of the pack, with the active ends carrying their roles and the cross on tailwind ends', () => {
    const view = viewFromInput(pack, inputFor(BASE, [{ wind: steady(10, 12) }]));
    const p = pictureModel(view);
    const names = p.diagram.runways.flatMap((r) => r.ends.map((e) => e.name)).sort();
    expect(names).toEqual(pack.runways.map((r) => r.name).sort());
    const mode = pack.modes.find((m) => m.id === view.result.plan.recommendedModeId);
    const withRoles = p.diagram.runways.flatMap((r) => r.ends).filter((e) => e.roles.length > 0).map((e) => e.name);
    for (const n of withRoles) expect([...(mode?.arrivals ?? []), ...(mode?.departures ?? [])]).toContain(n);
    for (const e of p.diagram.runways.flatMap((r) => r.ends)) expect(e.over).toBe(tailwindEnds(view).has(e.name));
    expect(p.title).toContain('Runway ends:');
  });

  it('labels the wind "direction kt", with gusts, and says so when it is variable or unknown', () => {
    const at = (w: Parameters<typeof inputFor>[1][number]) => pictureModel(viewFromInput(pack, inputFor(BASE, [w])));
    expect(at({ wind: steady(30, 7) }).windLabel).toBe('030\u00B0 7 kt');
    expect(at({ wind: steady(190, 23, 34) }).windLabel).toBe('190\u00B0 23G34 kt');
    expect(at({ wind: vrb(5) }).windLabel).toBe('VRB 5 kt');
    expect(at({ gov: 'NONE', wind: null }).windLabel).toBe('Wind unknown');
    expect(at({ wind: steady(30, 7) }).diagram.arrow).not.toBeNull();
    expect(at({ wind: vrb(5) }).diagram.arrow).toBeNull();
  });

  it('uses the wind of the current slot', () => {
    const view = viewFromInput(pack, inputFor(BASE, [{ wind: steady(90, 11) }, { wind: steady(180, 3) }]));
    expect(currentWind(view)).toEqual(steady(90, 11));
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('v2 slim forecast bar [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);

  it('runs the recommended path across the window, with the change line at the change slot', () => {
    const view = viewOf(pack, rig, ['ok', 'ok', 'badA', 'badA', 'badA'], same(5, 'light'));
    const bar = forecastBarModel(view, view.calcNowMs);
    expect(bar.slotCount).toBe(5);
    expect(bar.path.length).toBeGreaterThanOrEqual(2);
    expect(bar.path[0]?.startSlot).toBe(0);
    expect(bar.path[bar.path.length - 1]?.endSlot).toBe(4);
    const change = view.result.changeovers.find((c) => c.change.slotIndex > 0);
    expect(bar.changePct).toEqual([((change?.change.slotIndex ?? 0) / 5) * 100]);
    for (const s of bar.path) expect(s.label).toMatch(/ [\u2713\u25B2\u2715?]$/);
  });

  it('has no change line when no change is planned, and puts NOW at the left for the first moment of the slot', () => {
    const view = viewOf(pack, rig, same<Wx>(4, 'ok'), same(4, 'light'));
    const bar = forecastBarModel(view, view.weather.slots[0]?.startMs ?? 0);
    expect(bar.changePct).toEqual([]);
    expect(bar.nowPct).toBe(0);
    expect(bar.axis[0]).toEqual({ label: 'NOW', leftPct: 0 });
  });

  it('puts the NOW marker part-way along the first slot as time passes', () => {
    const view = viewOf(pack, rig, same<Wx>(4, 'ok'));
    const first = view.weather.slots[0]?.startMs ?? 0;
    const bar = forecastBarModel(view, first + 15 * 60_000);
    expect(bar.nowPct).toBeCloseTo(12.5, 5);
  });

  it('has an accessible summary naming the window, the path, the wind, the runway and the traffic', () => {
    const view = viewOf(pack, rig, ['ok', 'ok', 'badA', 'badA'], ['light', 'light', 'medium', null]);
    const bar = forecastBarModel(view, view.calcNowMs);
    expect(bar.summary).toMatch(/^Forecast \d\d:\d\dZ to \d\d:\d\dZ\. Path: /);
    expect(bar.summary).toContain('Wind ');
    expect(bar.summary).toMatch(/Runway (dry throughout|wet|possibly wet)/);
    expect(bar.summary).toContain('Traffic LOW, then MEDIUM from');
    expect(bar.summary).toContain('then unknown from');
  });

  it('draws a traffic micro-bar per slot and leaves unknown slots unknown', () => {
    const view = viewOf(pack, rig, same<Wx>(3, 'ok'), ['light', null, 'busy']);
    expect(forecastBarModel(view, view.calcNowMs).traffic.map((t) => t.level)).toEqual(['light', null, 'busy']);
  });
});

describe('wind runs', () => {
  it('start a new bar only when the wind changes enough to matter, measured from where the bar started', () => {
    const runs = windRuns([steady(30, 7), steady(35, 8), steady(38, 9), steady(140, 8), null, steady(140, 8)]);
    expect(runs.map((r) => [r.startSlot, r.endSlot, r.label])).toEqual([
      [0, 2, '030/07'],
      [3, 3, '140/08'],
      [5, 5, '140/08'],
    ]);
    expect(runs[1]?.title).toBe('Wind 030/07 to 140/08, turn of 110 degrees');
  });
});
