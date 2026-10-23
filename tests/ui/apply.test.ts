import { describe, expect, it } from 'vitest';
import { applyMetarText, applyTafText } from '../../src/ui/model/apply';
import { defaultWindowFor } from '../../src/ui/model/dashboard';
import { PACKS, TEST_PACK, YSSY_PACK } from '../helpers/packs';
import { fixture, nowOf, packWith } from '../weather/helpers';

const METAR = fixture('metar-yssy-auto-nodata');
const TAF = fixture('taf-yssy-multiline-fm-tempo');

describe.each(PACKS.map((p) => [p.name, p] as const))('pasting reports [%s]', (_n, ref) => {
  const pack = packWith(ref, { weatherStation: METAR.station });
  const now = nowOf(METAR);

  it('accepts a good METAR and TAF and returns the decoded reports', () => {
    const m = applyMetarText(METAR.raw, pack, now);
    expect(m.outcome.ok).toBe(true);
    expect(m.report?.station).toBe(METAR.station);
    const t = applyTafText(TAF.raw, pack, now);
    expect(t.outcome.ok).toBe(true);
    expect(t.report?.station).toBe(TAF.station);
  });

  it('refuses a report it cannot read, with a plain message and no report (so the previous one stays)', () => {
    for (const bad of ['', 'hello', 'METAR', '<img src=x onerror=alert(1)>', 'METAR YSSY 99X', 'x'.repeat(5000)]) {
      const m = applyMetarText(bad, pack, now);
      expect(m.report).toBeNull();
      expect(m.outcome.ok).toBe(false);
      expect(m.outcome.message?.length ?? 0).toBeGreaterThan(0);
      const t = applyTafText(bad, pack, now);
      expect(t.report).toBeNull();
      expect(t.outcome.ok).toBe(false);
    }
  });

  it('refuses a METAR for another station', () => {
    const other = packWith(ref, { weatherStation: 'ZZZZ' });
    const m = applyMetarText(METAR.raw, other, now);
    expect(m.report).toBeNull();
    expect(m.outcome.message).toContain('station');
  });

  it('refuses a NIL report without using it', () => {
    const m = applyMetarText('METAR YSSY 231400Z NIL', pack, now);
    expect(m.report).toBeNull();
    expect(m.outcome.message).toContain('NIL');
  });
});

describe('the first window comes from the pack when it is an on-screen option (OD-31)', () => {
  it('is the full TAF when the pack gives none, and the pack value when it is 240 or 360', () => {
    expect(defaultWindowFor(packWith(YSSY_PACK))).toBe('full');
    expect(defaultWindowFor(packWith(TEST_PACK, { settings: { forecastWindowMinutes: 240 } }))).toBe('4h');
    expect(defaultWindowFor(packWith(TEST_PACK, { settings: { forecastWindowMinutes: 360 } }))).toBe('6h');
    expect(defaultWindowFor(packWith(TEST_PACK, { settings: { forecastWindowMinutes: 300 } }))).toBe('full');
  });
});
