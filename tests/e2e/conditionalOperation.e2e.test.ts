// The conditional-operation note end to end on the real Darwin and Melbourne packs (issue 58): pasted report text ->
// slots -> engine -> Panel A. A note only; the mode stays recommended whether or not it shows.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PackRef } from '../helpers/packs';
import { panelAModel } from '../../src/ui/model/panels';
import type { ViewData } from '../../src/ui/model/dashboard';
import { cell, chosen, kt, run, type Run } from './pipeline';

const ref = (icao: string): PackRef => ({ name: icao, dir: join(import.meta.dirname, '..', '..', 'refdata', 'airports', icao) });
const NOW = '2026-10-23T03:10:00Z';

function banners(r: Run): { title: string; text: string }[] {
  const view: ViewData = { pack: r.pack, calcNowMs: r.nowMs, metar: r.metar, taf: r.taf, weather: r.built, demand: null, liveDemand: null, result: r.out, currentMode: null, windowChoice: 'full' };
  return panelAModel(view).banners.filter((b) => b.tone === 'ok');
}

describe('the real packs carry the note on one mode each', () => {
  it('Darwin on 29AD36A (3,000 ft) and Melbourne on 34A27AD (4,500 ft), both 8 km and dry', () => {
    const op = (icao: string, id: string) => run({ ref: ref(icao), nowIso: NOW, windowMinutes: 60 }).pack.modes.find((m) => m.id === id)?.conditionalOperation;
    expect(op('YPDN', '29AD36A')).toEqual({ name: 'LAHSO', ceilingFt: 3000, visibilityMetres: 8000, requiresDrySurface: true });
    expect(op('YMML', '34A27AD')).toEqual({ name: 'LAHSO', ceilingFt: 4500, visibilityMetres: 8000, requiresDrySurface: true });
    const others = ['YBBN', 'YPAD', 'YPPH', 'YSSY', 'YSWS'].flatMap((i) => run({ ref: ref(i), nowIso: NOW, windowMinutes: 60 }).pack.modes.map((m) => m.conditionalOperation));
    expect(others.every((o) => o === null)).toBe(true);
  });
});

describe('Darwin, 29AD36A recommended', () => {
  const go = (cloudAndVis: string, tafBody = '9999 SCT020') =>
    run({
      ref: ref('YPDN'),
      nowIso: NOW,
      windowMinutes: 240,
      metar: `METAR YPDN 230300Z ${kt(290, 10)} ${cloudAndVis} 31/24 Q1010`,
      taf: `TAF YPDN 230200Z 2303/2403 ${kt(290, 10)} ${tafBody}`,
    });

  it('shows the note with good weather, until the end of the window', () => {
    const r = go('9999 FEW020');
    expect(cell(r, '29AD36A', 0).status).toBe('SUITABLE');
    expect(r.out.plan.recommendedModeId).toBe('29AD36A');
    expect(banners(r)).toEqual([{ tone: 'ok', title: 'LAHSO conditions met', text: expect.stringMatching(/^until \d\d:\d\dZ$/) }]);
  });

  it('shows the note in CAVOK', () => {
    expect(banners(go('CAVOK', 'CAVOK')).map((b) => b.title)).toEqual(['LAHSO conditions met']);
  });

  it('shows the note at exactly 3,000 ft and 8 km', () => {
    expect(banners(go('8000 BKN030', '8000 BKN030')).map((b) => b.title)).toEqual(['LAHSO conditions met']);
  });

  it('shows nothing at 2,500 ft, though 29AD36A stays recommended', () => {
    const r = go('9999 BKN025', '9999 BKN025');
    expect(r.out.plan.recommendedModeId).toBe('29AD36A');
    expect(cell(r, '29AD36A', 0).status).toBe('SUITABLE');
    expect(banners(r)).toEqual([]);
  });

  it('shows nothing at 7,000 m visibility', () => {
    expect(banners(go('7000 FEW020', '7000 FEW020'))).toEqual([]);
  });

  it('shows nothing in rain', () => {
    const r = go('9999 -RA FEW020', '9999 -RA SCT020');
    expect(r.out.plan.recommendedModeId).toBe('29AD36A');
    expect(banners(r)).toEqual([]);
  });

  it('shows nothing when no cloud is reported', () => {
    expect(banners(go('9999', '9999'))).toEqual([]);
  });

  it('shows nothing when another mode is recommended', () => {
    const r = run({ ref: ref('YPDN'), nowIso: NOW, windowMinutes: 240, metar: `METAR YPDN 230300Z ${kt(110, 10)} CAVOK 31/24 Q1010`, taf: `TAF YPDN 230200Z 2303/2403 ${kt(110, 10)} CAVOK` });
    expect(r.out.plan.recommendedModeId).not.toBe('29AD36A');
    expect(banners(r)).toEqual([]);
  });

  it('does not change what is recommended or planned', () => {
    const good = go('9999 FEW020');
    const low = go('9999 BKN025', '9999 BKN025');
    expect(chosen(good)).toEqual(chosen(low));
    expect(good.out.plan.changes).toEqual(low.out.plan.changes);
  });
});

describe('Melbourne, 34A27AD recommended (the other modes forbidden by the plan, in memory)', () => {
  const only34A27AD = (files: any) => { // eslint-disable-line typescript/no-explicit-any
    for (const band of files['operating_plan.json'].bands) for (const row of band.rows) if (row.mode !== '34A27AD') row.allowed = false;
  };
  const go = (cloudAndVis: string) =>
    run({
      ref: ref('YMML'),
      edit: only34A27AD,
      nowIso: NOW,
      windowMinutes: 240,
      metar: `METAR YMML 230300Z ${kt(340, 10)} ${cloudAndVis} 18/10 Q1015`,
      taf: `TAF YMML 230200Z 2303/2403 ${kt(340, 10)} ${cloudAndVis}`,
    });

  it('shows the note at 4,500 ft and 8 km', () => {
    const r = go('8000 BKN045');
    expect(r.out.plan.recommendedModeId).toBe('34A27AD');
    expect(cell(r, '34A27AD', 0).status).toBe('SUITABLE');
    expect(banners(r)).toEqual([{ tone: 'ok', title: 'LAHSO conditions met', text: expect.stringMatching(/^until \d\d:\d\dZ$/) }]);
  });

  it('shows nothing at 4,400 ft, which would have passed at Darwin', () => {
    const r = go('9999 BKN044');
    expect(r.out.plan.recommendedModeId).toBe('34A27AD');
    expect(banners(r)).toEqual([]);
  });

  it('shows nothing in rain', () => {
    expect(banners(go('9999 -RA BKN045'))).toEqual([]);
  });
});
