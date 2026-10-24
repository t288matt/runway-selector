// The conditional-operation check (issue 58), pure. Each test fails if the rule it names is removed.
import { describe, expect, it } from 'vitest';
import { conditionalOperationCheck, type SlotSource, type SlotWeather, type WeatherOverlay } from '../../src/engine';
import type { ConditionalOperation } from '../../src/refdata';
import { DAY_START_MS, makeSlots } from './helpers';

const OP: ConditionalOperation = { name: 'NOTE', ceilingFt: 3000, visibilityMetres: 8000, requiresDrySurface: true };
const GOOD: Partial<SlotWeather> = { ceilingFt: 3000, visibilityMetres: 8000 };
const rain: WeatherOverlay = { kind: 'TEMPO', probabilityPct: null, wind: null, precipitation: true, text: 'TEMPO RA' };

function check(weather: Partial<SlotWeather>, state: 'DRY' | 'WET' | 'WET_POSSIBLE' = 'DRY', gov: SlotSource = 'METAR', op: ConditionalOperation = OP, tafView: Partial<SlotWeather> | null = null) {
  const [slot] = makeSlots(DAY_START_MS, [{ gov, tafView: tafView === null ? null : {} }]);
  const s = { ...slot!, weather: { ...slot!.weather, ...weather }, tafView: slot!.tafView === null ? null : { ...slot!.tafView, ...tafView } };
  return conditionalOperationCheck(op, s, state);
}

describe('conditional operation: ceiling', () => {
  it('exactly the ceiling is met, one foot below is not', () => {
    expect(check(GOOD)).toBe('MET');
    expect(check({ ...GOOD, ceilingFt: 2999 })).toBe('NOT_MET');
  });
  it('a report with no ceiling is met', () => {
    expect(check({ ...GOOD, ceilingFt: null })).toBe('MET');
  });
  it('an unknown ceiling is not met (UNKNOWN)', () => {
    expect(check({ visibilityMetres: 8000 })).toBe('UNKNOWN');
  });
});

describe('conditional operation: visibility', () => {
  it('exactly the visibility is met, one metre below is not', () => {
    expect(check({ ...GOOD, visibilityMetres: 8000 })).toBe('MET');
    expect(check({ ...GOOD, visibilityMetres: 7999 })).toBe('NOT_MET');
  });
  it('an unknown visibility is UNKNOWN', () => {
    expect(check({ ceilingFt: 3000 })).toBe('UNKNOWN');
  });
  it('a known failure wins over an unknown reading', () => {
    expect(check({ ceilingFt: 2000 })).toBe('NOT_MET');
  });
});

describe('conditional operation: dry surface', () => {
  it('a wet runway and a runway that may be wet are not met', () => {
    expect(check(GOOD, 'WET')).toBe('NOT_MET');
    expect(check(GOOD, 'WET_POSSIBLE')).toBe('NOT_MET');
  });
  it('a wet runway does not matter when the pack does not ask for a dry one', () => {
    expect(check(GOOD, 'WET', 'METAR', { ...OP, requiresDrySurface: false })).toBe('MET');
  });
});

describe('conditional operation: only the stated conditions count', () => {
  it('a condition the pack leaves out is not looked at', () => {
    const op = { name: 'NOTE', ceilingFt: null, visibilityMetres: 8000, requiresDrySurface: false };
    expect(check({ visibilityMetres: 8000 }, 'DRY', 'METAR', op)).toBe('MET');
    expect(check({ ceilingFt: 100, visibilityMetres: 8000 }, 'DRY', 'METAR', op)).toBe('MET');
  });
});

describe('conditional operation: TEMPO, INTER and PROB groups', () => {
  it('a group with rain breaks the dry-surface condition', () => {
    expect(check({ ...GOOD, overlays: [rain] })).toBe('NOT_MET');
    expect(check({ ...GOOD, overlays: [{ ...rain, kind: 'PROB', probabilityPct: 30 }] })).toBe('NOT_MET');
    expect(check({ ...GOOD, overlays: [{ ...rain, kind: 'INTER' }] })).toBe('NOT_MET');
  });
  it('a group with rain is harmless when no dry runway is asked for', () => {
    expect(check({ ...GOOD, overlays: [rain] }, 'DRY', 'METAR', { ...OP, requiresDrySurface: false })).toBe('MET');
  });
  it('a group below the ceiling or the visibility breaks it', () => {
    const dry = { ...rain, precipitation: false };
    expect(check({ ...GOOD, overlays: [{ ...dry, ceilingFt: 2999 }] })).toBe('NOT_MET');
    expect(check({ ...GOOD, overlays: [{ ...dry, visibilityMetres: 7999 }] })).toBe('NOT_MET');
  });
  it('a dry group at the limits, or one that says nothing, does not break it', () => {
    const dry = { ...rain, precipitation: false };
    expect(check({ ...GOOD, overlays: [{ ...dry, ceilingFt: 3000, visibilityMetres: 8000 }] })).toBe('MET');
    expect(check({ ...GOOD, overlays: [dry] })).toBe('MET');
  });
});

describe('conditional operation: which report is used', () => {
  it('a METAR-governed slot uses the METAR alone and ignores the TAF view', () => {
    expect(check(GOOD, 'DRY', 'METAR', OP, { ceilingFt: 500, visibilityMetres: 100, overlays: [rain] })).toBe('MET');
    expect(check({ ...GOOD, ceilingFt: 2999 }, 'DRY', 'METAR', OP, { ceilingFt: 9000, visibilityMetres: 9999 })).toBe('NOT_MET');
  });
  it('a TAF-governed slot uses its own weather', () => {
    expect(check(GOOD, 'DRY', 'TAF')).toBe('MET');
  });
  it('a slot with no report is UNKNOWN', () => {
    expect(check(GOOD, 'DRY', 'NONE')).toBe('UNKNOWN');
  });
});
