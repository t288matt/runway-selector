// The real YMML pack with the minima it carries for its land-and-hold-short
// mode, end to end: report text -> slots -> engine (issue 34).
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate, type Cell } from '../../src/engine';
import { buildWeatherSlots, decodeMetar } from '../../src/weather';
import { loadPackFrom } from '../helpers/packs';

const pack = loadPackFrom({ name: 'YMML', dir: join(resolve(import.meta.dirname, '..', '..'), 'refdata', 'airports', 'YMML') });
const MODE = '34A27AD';
const nowMs = Date.UTC(2026, 0, 15, 2, 10);

function cellFor(body: string, mode = MODE): Cell {
  const r = decodeMetar(`METAR ${pack.airport.weatherStation} 150150Z ${body}`, { pack, nowMs });
  if (r.kind !== 'ok') throw new Error('metar not decoded');
  const { slots } = buildWeatherSlots({ pack, nowMs, metar: r.report, taf: null, windowMinutes: 30 });
  const result = evaluate(pack, { nowMs, weather: slots, traffic: [], currentMode: null });
  return result.cells[pack.modes.findIndex((m) => m.id === mode)]![0]!;
}

describe('YMML land-and-hold-short mode minima', () => {
  it('carries its minima from the pack', () => {
    expect(pack.modes.find((m) => m.id === MODE)?.minima).toEqual({ ceilingFt: 4500, visibilityMetres: 8000, requiresDrySurface: true });
    expect(pack.modes.filter((m) => m.minima !== null).map((m) => m.id)).toEqual([MODE]);
  });
  it('a ceiling of 3,000 ft makes it UNSUITABLE with cause MIN', () => {
    const c = cellFor('34008KT 9999 BKN030 Q1015');
    expect(c.status).toBe('UNSUITABLE');
    expect(c.cause).toBe('MIN');
  });
  it('a ceiling of 4,500 ft, visibility 9999 and a dry runway make it SUITABLE', () => {
    expect(cellFor('34008KT 9999 BKN045 Q1015').status).toBe('SUITABLE');
  });
  it('rain makes it UNSUITABLE', () => {
    const c = cellFor('34008KT 9999 -RA BKN045 Q1015');
    expect(c.status).toBe('UNSUITABLE');
    expect(c.cause).toBe('MIN');
  });
  it('low visibility makes it UNSUITABLE', () => {
    expect(cellFor('34008KT 7000 BKN045 Q1015').cause).toBe('MIN');
  });
  it('CAVOK passes', () => {
    expect(cellFor('34008KT CAVOK Q1015').status).toBe('SUITABLE');
  });
  it('a report that says nothing about cloud is MARGINAL and uncertain', () => {
    const c = cellFor('34008KT 9999 Q1015');
    expect(c.status).toBe('MARGINAL');
    expect(c.uncertain).toBe(true);
  });
  it('a vertical visibility below the cloud is the ceiling', () => {
    expect(cellFor('34008KT 9999 SCT100 VV003 Q1015').cause).toBe('MIN');
  });
  it('FEW and SCT cloud are not a ceiling', () => {
    expect(cellFor('34008KT 9999 FEW010 SCT020 Q1015').status).toBe('SUITABLE');
  });
  it('another mode is not gated', () => {
    expect(cellFor('34008KT 9999 -RA BKN030 Q1015', '34AD').reasons.some((r) => r.code === 'MIN')).toBe(false);
  });
});

describe('YMML non-LAHSO twin of the land-and-hold-short mode', () => {
  const TWIN = '34A27AD-NOLAHSO';
  it('sits after 27AD and before 16AD in the pack', () => {
    expect(pack.modes.map((m) => m.id)).toEqual(['27AD34D', '16A27D', '09A16D', '34A27AD', '09AD', '27AD', TWIN, '16AD', '34AD']);
  });
  it('has the same runways and no minima', () => {
    const m = pack.modes.find((x) => x.id === TWIN)!;
    expect(m.minima).toBeNull();
    expect(m.arrivals).toEqual(['34', '27']);
    expect(m.departures).toEqual(['27']);
  });
  it('a low ceiling rules out the LAHSO mode but not the twin', () => {
    const good = cellFor('34008KT 9999 BKN045 Q1015', TWIN);
    const low = cellFor('34008KT 9999 BKN020 Q1015', TWIN);
    expect(cellFor('34008KT 9999 BKN020 Q1015')).toMatchObject({ status: 'UNSUITABLE', cause: 'MIN' });
    expect(good.status).toBe('SUITABLE');
    expect(low.status).toBe(good.status);
    expect(low.reasons.some((r) => r.code === 'MIN')).toBe(false);
  });
  it('rain rules out the LAHSO mode but not the twin', () => {
    expect(cellFor('34008KT 9999 -RA BKN045 Q1015')).toMatchObject({ status: 'UNSUITABLE', cause: 'MIN' });
    const wet = cellFor('34008KT 9999 -RA BKN045 Q1015', TWIN);
    expect(wet.status).toBe(cellFor('34008KT 9999 BKN045 Q1015', TWIN).status);
    expect(wet.reasons.some((r) => r.code === 'MIN')).toBe(false);
  });
});
