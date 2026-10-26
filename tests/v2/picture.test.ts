// The runway picture and the forecast in words: their view models.
import { describe, expect, it } from 'vitest';
import { forecastSummary, windRuns } from '../../src/v2/model/forecastBar';
import { currentWind, pictureModel } from '../../src/v2/model/picture';
import { steady, vrb } from '../engine/helpers';
import { PACKS } from '../helpers/packs';
import { packOf, rigFor } from '../engine/planHelpers';
import { viewFromInput, viewOf } from './helpers';
import { BASE } from '../engine/planHelpers';
import { inputFor } from '../engine/helpers';

describe.each(PACKS.map((p) => [p.name, p] as const))('v2 runway picture [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);

  it('draws every runway end of the pack, with the active ends carrying their roles', () => {
    const view = viewFromInput(pack, inputFor(BASE, [{ wind: steady(10, 12) }]));
    const p = pictureModel(view);
    const names = p.diagram.runways.flatMap((r) => r.ends.map((e) => e.name)).sort();
    expect(names).toEqual(pack.runways.map((r) => r.name).sort());
    const mode = pack.modes.find((m) => m.id === view.result.plan.recommendedModeId);
    const withRoles = p.diagram.runways.flatMap((r) => r.ends).filter((e) => e.roles.length > 0).map((e) => e.name);
    for (const n of withRoles) expect([...(mode?.arrivals ?? []), ...(mode?.departures ?? [])]).toContain(n);
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

describe.each(PACKS.map((p) => [p.name, p] as const))('v2 forecast in words (the Detail toggle) [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);

  it('has an accessible summary naming the window, the path, the wind, the runway and the traffic', () => {
    const view = viewOf(pack, rig, ['ok', 'ok', 'badA', 'badA'], ['light', 'light', 'medium', null]);
    const { summary, rangeText } = forecastSummary(view);
    expect(summary).toMatch(/^Forecast \d{4}Z to \d{4}Z\. Path: /);
    expect(summary).toContain('Wind ');
    expect(summary).toMatch(/Runway (dry throughout|wet|possibly wet)/);
    expect(summary).toContain('Traffic LOW, then MEDIUM from');
    expect(summary).toContain('then unknown from');
    expect(rangeText).toMatch(/^\d{4}Z to \d{4}Z$/);
    expect(summary).toContain(`Forecast ${rangeText}.`);
  });

  it('says there is no forecast window when there are no slots', () => {
    const view = viewOf(pack, rig, []);
    expect(forecastSummary(view).summary).toBe('No forecast window.');
    expect(forecastSummary(view).rangeText).toBe('');
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
