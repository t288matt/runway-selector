// The weather-minima gate end to end (report text -> slots -> engine, issue 34), on the real YMML pack with
// minima added to one of its modes IN MEMORY: no pack carries minima today (the LAHSO note of issue 58 is not a gate).
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluate, type Cell } from '../../src/engine';
import { buildWeatherSlots, decodeMetar } from '../../src/weather';
import { loadPackFrom, type PackRef } from '../helpers/packs';
import { packWith } from './helpers';

const YMML: PackRef = { name: 'YMML', dir: join(resolve(import.meta.dirname, '..', '..'), 'refdata', 'airports', 'YMML') };
const MODE = '34A27AD';
const MINIMA = { ceilingFt: 4500, visibilityMetres: 8000, requiresDrySurface: true };
const pack = packWith(YMML, (f) => {
  f['modes.json'].modes.find((m: { id: string }) => m.id === MODE).minima = MINIMA;
});
const nowMs = Date.UTC(2026, 0, 15, 2, 10);

function cellFor(body: string, mode = MODE): Cell {
  const r = decodeMetar(`METAR ${pack.airport.weatherStation} 150150Z ${body}`, { pack, nowMs });
  if (r.kind !== 'ok') throw new Error('metar not decoded');
  const { slots } = buildWeatherSlots({ pack, nowMs, metar: r.report, taf: null, windowMinutes: 30 });
  const result = evaluate(pack, { nowMs, weather: slots, traffic: [], currentMode: null });
  return result.cells[pack.modes.findIndex((m) => m.id === mode)]![0]!;
}

describe('the real YMML pack carries no minima', () => {
  const real = loadPackFrom(YMML);
  it('no mode is gated, and 34A27AD is an ordinary mode at priority 4', () => {
    expect(real.modes.filter((m) => m.minima !== null)).toEqual([]);
    expect(real.modes.map((m) => m.id).slice(0, 4)).toEqual(['27AD34D', '16A27D', '09A16D', '34A27AD']);
    const rows = real.plan[0]!.rows;
    expect(rows.find((r) => r.mode === '34A27AD')!.penalty).toBe(12);
  });
});

describe('a mode with minima (added in memory)', () => {
  it('carries its minima', () => {
    expect(pack.modes.find((m) => m.id === MODE)?.minima).toEqual(MINIMA);
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
