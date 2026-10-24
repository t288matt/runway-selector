// Per-mode weather minima, rule MIN (issue 34). The rule is proved on the
// fictional TEST pack with minima added in memory, so no real airport is
// involved. Each test fails if the rule it names is removed.
import { describe, expect, it } from 'vitest';
import { evaluate, type Cell, type SlotSource, type SlotWeather, type WeatherOverlay } from '../../src/engine';
import { TEST_PACK } from '../helpers/packs';
import { NO_PRECIP, baseFor, makeSlots, packWith, quietTraffic } from './helpers';

const MODE = 'TST_EAST';
const OTHER = 'TST_WEST';
const FULL = { ceilingFt: 4500, visibilityMetres: 8000, requiresDrySurface: true };
const withMinima = (minima: Record<string, unknown>) =>
  packWith(TEST_PACK, (f) => {
    for (const m of f['modes.json'].modes) m.minima = minima;
  });
const pack = withMinima(FULL);

interface Slot {
  readonly weather?: Partial<SlotWeather>;
  readonly gov?: SlotSource;
  readonly precip?: Partial<typeof NO_PRECIP>;
  readonly tafView?: Partial<SlotWeather>;
}

/** Evaluate one mode over the given slots (calm wind unless a slot says otherwise) and return its cells. */
function cells(p: typeof pack, mode: string, slots: readonly Slot[]): Cell[] {
  const baseMs = baseFor(p, mode, slots.length);
  const weather = makeSlots(
    baseMs,
    slots.map((s) => ({ gov: s.gov ?? 'METAR', precip: s.precip, tafView: s.tafView === undefined ? null : {} })),
  ).map((w, i) => ({
    ...w,
    weather: { ...w.weather, ...slots[i]?.weather },
    tafView: w.tafView === null ? null : { ...w.tafView, ...slots[i]?.tafView },
  }));
  const result = evaluate(p, { nowMs: baseMs, weather, traffic: quietTraffic(baseMs, slots.length), currentMode: null });
  return [...(result.cells[p.modes.findIndex((m) => m.id === mode)] ?? [])];
}
const first = (w: Partial<SlotWeather>, p = pack, extra: Omit<Slot, 'weather'> = {}): Cell => cells(p, MODE, [{ weather: w, ...extra }])[0]!;
const good = { ceilingFt: 6000, visibilityMetres: 9999 };
const minReasons = (c: Cell) => c.reasons.filter((r) => r.code === 'MIN');

describe('rule MIN: ceiling', () => {
  it('exactly the minimum passes', () => {
    const c = first({ ...good, ceilingFt: 4500 });
    expect(c.status).toBe('SUITABLE');
    expect(minReasons(c)).toHaveLength(0);
  });
  it('one foot below fails with cause MIN and a plain sentence', () => {
    const c = first({ ...good, ceilingFt: 4499 });
    expect(c.status).toBe('UNSUITABLE');
    expect(c.cause).toBe('MIN');
    expect(minReasons(c)[0]).toMatchObject({ severity: 'FAIL', limit: 4500, figures: { ceilingFt: 4499, minimumFt: 4500 } });
    expect(minReasons(c)[0]?.text).toBe("Ceiling 4,499 ft is below this mode's minimum of 4,500 ft");
  });
  it('a report with no ceiling passes', () => {
    expect(first({ ...good, ceilingFt: null }).status).toBe('SUITABLE');
  });
  it('an unknown ceiling is MARGINAL and uncertain', () => {
    const c = first({ visibilityMetres: 9999 });
    expect(c.status).toBe('MARGINAL');
    expect(c.uncertain).toBe(true);
    expect(c.cause).toBe('MIN');
    expect(minReasons(c)[0]?.text).toContain('Ceiling is not known');
  });
});

describe('rule MIN: visibility', () => {
  it('exactly the minimum passes', () => {
    expect(first({ ...good, visibilityMetres: 8000 }).status).toBe('SUITABLE');
  });
  it('one metre below fails, shown in kilometres', () => {
    const c = first({ ...good, visibilityMetres: 7999 });
    expect(c.status).toBe('UNSUITABLE');
    expect(c.cause).toBe('MIN');
    expect(minReasons(c)[0]?.figures).toMatchObject({ visibilityMetres: 7999, minimumMetres: 8000 });
    expect(first({ ...good, visibilityMetres: 6000 }).reasons.find((r) => r.code === 'MIN')?.text).toBe("Visibility 6.0 km is below this mode's minimum of 8.0 km");
  });
  it('an unknown visibility is MARGINAL and uncertain', () => {
    const c = first({ ceilingFt: 6000 });
    expect(c.status).toBe('MARGINAL');
    expect(c.uncertain).toBe(true);
    expect(minReasons(c)[0]?.text).toContain('Visibility is not known');
  });
});

describe('rule MIN: dry surface', () => {
  it('a wet runway fails', () => {
    const c = first(good, pack, { precip: { prevailing: true } });
    expect(c.runwayState).toBe('WET');
    expect(c.status).toBe('UNSUITABLE');
    expect(c.cause).toBe('MIN');
    expect(minReasons(c)[0]?.text).toBe('Runway is wet, and this mode needs a dry runway');
  });
  it('the drying hold after rain counts as wet', () => {
    const [, second] = cells(pack, MODE, [{ weather: good, precip: { prevailing: true } }, { weather: good, gov: 'TAF' }]);
    expect(second?.runwayState).toBe('WET');
    expect(second?.cause).toBe('MIN');
  });
  it('a runway that may be wet is MARGINAL and uncertain', () => {
    const [, second] = cells(pack, MODE, [{ weather: good }, { weather: good, gov: 'TAF', precip: { temporary: true } }]);
    expect(second?.runwayState).toBe('WET_POSSIBLE');
    expect(second?.status).toBe('MARGINAL');
    expect(second?.uncertain).toBe(true);
    expect(second?.cause).toBe('MIN');
  });
  it('a mode that does not require a dry surface ignores rain', () => {
    const p = withMinima({ ceilingFt: 4500 });
    expect(first({ ceilingFt: 6000 }, p, { precip: { prevailing: true } }).status).toBe('SUITABLE');
  });
});

describe('rule MIN: scope', () => {
  it('a key the mode leaves out is not checked', () => {
    const p = withMinima({ ceilingFt: 4500 });
    const c = first({ ceilingFt: 6000 }, p);
    expect(c.status).toBe('SUITABLE');
    expect(minReasons(c)).toHaveLength(0);
  });
  it('a mode without minima behaves as before, whatever the weather', () => {
    const p = packWith(TEST_PACK, (f) => {
      f['modes.json'].modes[0].minima = FULL;
    });
    const c = cells(p, OTHER, [{ weather: { ceilingFt: 100, visibilityMetres: 50 }, precip: { prevailing: true } }])[0]!;
    expect(c.status).toBe('SUITABLE');
    expect(c.reasons.some((r) => r.code === 'MIN')).toBe(false);
  });
  it('a slot with no report is judged by nothing', () => {
    const c = first({}, pack, { gov: 'NONE' });
    expect(c.reasons.some((r) => r.code === 'MIN')).toBe(false);
  });
  it('is evaluated after XW and before CAP', () => {
    const p = packWith(TEST_PACK, (f) => {
      f['modes.json'].modes[0].minima = FULL;
      f['modes.json'].modes[0].capacity = 1;
    });
    const baseMs = baseFor(p, MODE, 1);
    const crosswind = { kind: 'steady' as const, directionDegrees: 180, speedKt: 40, gustKt: null, variableRangeDegrees: null };
    const weather = makeSlots(baseMs, [{ gov: 'METAR', wind: crosswind }]).map((w) => ({ ...w, weather: { ...w.weather, ceilingFt: 100, visibilityMetres: 9999 } }));
    const traffic = [{ startMs: baseMs, arrivals: 50, departures: 50 }];
    const c = evaluate(p, { nowMs: baseMs, weather, traffic, currentMode: null }).cells[0]![0]!;
    const codes = c.reasons.map((r) => r.code);
    expect(codes).toContain('XW');
    expect(codes.indexOf('XW')).toBeLessThan(codes.indexOf('MIN'));
    expect(codes.indexOf('MIN')).toBeLessThan(codes.indexOf('CAP'));
  });
});

const overlay = (o: Partial<WeatherOverlay>): WeatherOverlay => ({
  kind: 'TEMPO',
  probabilityPct: null,
  wind: { kind: 'steady', directionDegrees: 0, speedKt: 0, gustKt: null, variableRangeDegrees: null },
  precipitation: false,
  text: 'TEMPO group',
  ...o,
});

describe('rule MIN: TEMPO, INTER and PROB groups', () => {
  it.each(['TEMPO', 'INTER', 'PROB'] as const)('a %s group below the ceiling minimum makes the cell MARGINAL', (kind) => {
    const c = first({ ...good, overlays: [overlay({ kind, probabilityPct: kind === 'PROB' ? 30 : null, ceilingFt: 1200, visibilityMetres: 9999 })] }, pack, { gov: 'TAF' });
    expect(c.status).toBe('MARGINAL');
    expect(c.uncertain).toBe(true);
    const r = c.reasons.find((x) => x.code === 'OVERLAY');
    expect(r?.severity).toBe('MARGINAL');
    expect(r?.text).toContain("Ceiling 1,200 ft is below this mode's minimum of 4,500 ft");
  });
  it('a group below the visibility minimum makes the cell MARGINAL', () => {
    const c = first({ ...good, overlays: [overlay({ ceilingFt: 6000, visibilityMetres: 3000 })] }, pack, { gov: 'TAF' });
    expect(c.status).toBe('MARGINAL');
    expect(c.reasons.find((x) => x.code === 'OVERLAY')?.text).toContain('Visibility 3.0 km');
  });
  it('a group with rain breaks the dry requirement', () => {
    const c = first({ ...good, overlays: [overlay({ ceilingFt: 6000, visibilityMetres: 9999, precipitation: true })] }, pack, { gov: 'TAF' });
    expect(c.status).toBe('MARGINAL');
    expect(c.reasons.find((x) => x.code === 'OVERLAY')?.text).toContain('needs a dry runway');
  });
  it('a group that keeps the minima changes nothing', () => {
    const c = first({ ...good, overlays: [overlay({ ceilingFt: 6000, visibilityMetres: 9999 })] }, pack, { gov: 'TAF' });
    expect(c.status).toBe('SUITABLE');
  });
  it('when the prevailing weather already fails, the group adds no second reason for it', () => {
    const c = first({ ceilingFt: 1000, visibilityMetres: 9999, overlays: [overlay({ ceilingFt: 1000, visibilityMetres: 9999 })] }, pack, { gov: 'TAF' });
    expect(c.status).toBe('UNSUITABLE');
    expect(c.reasons.filter((r) => r.code === 'OVERLAY')).toHaveLength(0);
  });
});

describe('rule MIN: a METAR governs alone', () => {
  it('the TAF view of the same slot is not consulted', () => {
    const c = first(good, pack, { gov: 'METAR', tafView: { ceilingFt: 500, visibilityMetres: 800 } });
    expect(c.status).toBe('SUITABLE');
    expect(c.reasons.some((r) => r.code === 'MIN' || r.code === 'TAF')).toBe(false);
  });
});
