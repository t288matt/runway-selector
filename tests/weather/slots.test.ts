// The slot builder. Expected values come from the report text and from the
// pack's own settings (read through parsePack), never from the builder.
// Scenarios that use a pack value run once for each of the YSSY, TEST and TEST1
// packs.
import { describe, expect, it } from 'vitest';
import { buildWeatherSlots, SLOT_MINUTES } from '../../src/weather';
import type { DecodedMetar, DecodedTaf, TafOverlayGroup } from '../../src/weather';
import type { AirportPack } from '../../src/refdata';
import { describeForEachPack, type PackRef } from '../helpers/packs';
import { HOUR, MIN, decodeMetarFixture, decodeTafFixture, packWith, utc } from './helpers';

const SLOT = SLOT_MINUTES * MIN;

/** Decoded reports for a scenario, decoded with a pack whose station matches the fixture. */
function reports(ref: PackRef, nowIso: string, ids: { metar?: string; taf?: string }) {
  const nowMs = utc(nowIso);
  return {
    nowMs,
    metar: ids.metar === undefined ? null : decodeMetarFixture(ids.metar, ref, nowMs),
    taf: ids.taf === undefined ? null : decodeTafFixture(ids.taf, ref, nowMs),
  };
}

function build(pack: AirportPack, nowMs: number, metar: DecodedMetar | null, taf: DecodedTaf | null, windowMinutes: number | null) {
  return buildWeatherSlots({ pack, nowMs, metar, taf, windowMinutes });
}

describeForEachPack('slot builder', (pack, ref) => {
  const s = pack.settings;
  const validityMs = s.metarValidityMinutes * MIN;
  const codes = s.precipitationCodes as readonly string[];

  describe('slot layout (OP-2)', () => {
    it.each(['2026-10-23T14:10:00Z', '2026-10-23T14:00:00.000Z', '2026-10-23T14:29:59.999Z', '2026-10-23T14:30:00Z', '2026-10-23T23:59:59.999Z'])(
      'slot 0 contains now and every slot is a clock-aligned half hour (now %s)',
      (nowIso) => {
        const { nowMs, taf } = reports(ref, '2026-10-23T14:10:00Z', { taf: 'taf-yssy-multiline-fm-tempo' });
        const now = utc(nowIso);
        const r = build(pack, now, null, taf, 240);
        void nowMs;
        const slots = r.slots;
        expect(slots).toHaveLength(8);
        expect(slots[0]!.startMs).toBeLessThanOrEqual(now);
        expect(now).toBeLessThan(slots[0]!.endMs);
        slots.forEach((sl, i) => {
          expect(sl.startMs % SLOT).toBe(0);
          expect(sl.endMs - sl.startMs).toBe(SLOT);
          if (i > 0) expect(sl.startMs).toBe(slots[i - 1]!.endMs);
        });
      },
    );

    it('has no extra slots at forecast change times (FM at 13:15 does not make a 13:15 slot)', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T12:10:00Z', { taf: 'taf-khlg-fm-mid-slot' });
      const r = build(pack, nowMs, null, taf, 240);
      expect(r.slots.map((x) => new Date(x.startMs).toISOString().slice(11, 16))).toEqual(['12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30']);
    });
  });

  describe('forecast window (OP-2)', () => {
    it.each([
      [120, 4],
      [240, 8],
      [360, 12],
      [30, 1],
      [100, 4],
    ])('a window of %i minutes gives %i slots from the start of slot 0', (minutes, count) => {
      const { nowMs, metar, taf } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-yssy-auto-nodata', taf: 'taf-yssy-multiline-fm-tempo' });
      const r = build(pack, nowMs, metar, taf, minutes);
      expect(r.slots).toHaveLength(count);
      expect(r.slots[0]!.startMs).toBe(utc('2026-10-23T14:00:00Z'));
    });

    it('the full window (null) runs to the end of the TAF validity', () => {
      const { nowMs, metar, taf } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-yssy-auto-nodata', taf: 'taf-yssy-multiline-fm-tempo' });
      const r = build(pack, nowMs, metar, taf, null);
      // 14:00 on the 23rd to 18:00 on the 24th is 28 hours: 56 slots, the last starting at 17:30.
      expect(r.slots).toHaveLength(56);
      expect(r.slots.at(-1)!.startMs).toBe(utc('2026-10-24T17:30:00Z'));
      expect(r.slots.at(-1)!.endMs).toBe(utc('2026-10-24T18:00:00Z'));
    });

    it('the full window with no TAF is the METAR window only', () => {
      const { nowMs, metar } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-yssy-auto-nodata' });
      const r = build(pack, nowMs, metar, null, null);
      const windowEnd = utc('2026-10-23T14:00:00Z') + validityMs; // observation time + window
      const expected = Math.max(1, Math.ceil((windowEnd - utc('2026-10-23T14:00:00Z')) / SLOT));
      expect(r.slots).toHaveLength(expected);
      expect(r.slots.every((x) => x.governedBy === 'METAR')).toBe(true);
    });

    it('a window can be longer than the TAF; slots past its end are NONE', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T14:10:00Z', { taf: 'taf-essl-prob40-showers' }); // valid to 17:00
      const r = build(pack, nowMs, null, taf, 360);
      expect(r.slots).toHaveLength(12);
      expect(r.slots.map((x) => x.governedBy)).toEqual(['TAF', 'TAF', 'TAF', 'TAF', 'TAF', 'TAF', 'NONE', 'NONE', 'NONE', 'NONE', 'NONE', 'NONE']);
    });
  });

  describe('which report governs a slot (WX-7, WX-9)', () => {
    it('METAR window then TAF: the slot starting exactly at observation + window is TAF-governed', () => {
      const { nowMs, metar, taf } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-yssy-auto-nodata', taf: 'taf-yssy-multiline-fm-tempo' });
      const r = build(pack, nowMs, metar, taf, 240);
      const boundary = metar!.observedAtMs + validityMs;
      for (const sl of r.slots) {
        const expected = sl.startMs < boundary ? 'METAR' : 'TAF';
        expect(sl.governedBy, new Date(sl.startMs).toISOString()).toBe(expected);
      }
      // With observation at 14:00 and a 60-minute window (all three packs) the boundary slot is 15:00.
      expect(boundary % SLOT).toBe(0);
      const at = (ms: number) => r.slots.find((x) => x.startMs === ms)!;
      expect(at(boundary - SLOT).governedBy).toBe('METAR');
      expect(at(boundary).governedBy).toBe('TAF');
    });

    it.each([0, 30, 45, 60, 90, 120])('the boundary rule holds for a METAR window of %i minutes', (minutes) => {
      const p = packWith(ref, { settings: { metarValidityMinutes: minutes } });
      const { nowMs, metar, taf } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-yssy-auto-nodata', taf: 'taf-yssy-multiline-fm-tempo' });
      const r = build(p, nowMs, metar, taf, 240);
      const obs = metar!.observedAtMs;
      for (const sl of r.slots) {
        // Strictly less: a slot that starts at obs + window belongs to the TAF.
        expect(sl.governedBy).toBe(sl.startMs - obs < minutes * MIN ? 'METAR' : 'TAF');
      }
    });

    it('a METAR-governed slot carries the METAR wind and the TAF view of the same slot', () => {
      const { nowMs, metar, taf } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-yssy-auto-nodata', taf: 'taf-yssy-multiline-fm-tempo' });
      const r = build(pack, nowMs, metar, taf, 240);
      const first = r.slots[0]!;
      expect(first.governedBy).toBe('METAR');
      expect(first.weather.wind).toEqual({ kind: 'steady', directionDegrees: 20, speedKt: 10, gustKt: null, variableRangeDegrees: null });
      expect(first.tafView).not.toBeNull();
      expect(first.tafView!.wind).toMatchObject({ directionDegrees: 40, speedKt: 10 }); // TAF base 04010KT
      expect(first.tafView!.overlays.map((o) => o.kind)).toEqual(['TEMPO']);
      expect(first.weather.overlays).toEqual([]);
    });

    it('tafView is null on a TAF-governed slot, and null when the TAF does not cover a METAR-governed slot', () => {
      const { nowMs, metar, taf } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-yssy-auto-nodata', taf: 'taf-yssy-multiline-fm-tempo' });
      const r = build(pack, nowMs, metar, taf, 240);
      for (const sl of r.slots) {
        if (sl.governedBy === 'TAF') expect(sl.tafView).toBeNull();
        if (sl.governedBy === 'METAR') expect(sl.tafView).not.toBeNull();
      }
      // A TAF that has not started yet cannot give a view of a METAR slot (SYNTHETIC shift of a real decoded TAF).
      const later: DecodedTaf = { ...taf!, validFromMs: utc('2026-10-23T16:00:00Z'), periods: taf!.periods.map((p, i) => (i === 0 ? { ...p, startMs: utc('2026-10-23T16:00:00Z') } : p)) };
      const r2 = build(pack, nowMs, metar, later, 240);
      expect(r2.slots[0]!.governedBy).toBe('METAR');
      expect(r2.slots[0]!.tafView).toBeNull();
    });

    it('TAF only: the TAF governs from slot 0, with no METAR flags', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T14:10:00Z', { taf: 'taf-yssy-multiline-fm-tempo' });
      const r = build(pack, nowMs, null, taf, 240);
      expect(r.slots.every((x) => x.governedBy === 'TAF' && x.tafView === null)).toBe(true);
      expect(r.slots[0]!.weather.wind).toMatchObject({ directionDegrees: 40, speedKt: 10 });
      expect(r.slots.every((x) => x.weather.precipitation.recent === false)).toBe(true);
      expect(r.banners.map((b) => b.code)).toEqual(['no-metar']);
    });

    it('METAR only: the METAR window is judged and later slots are NONE with no wind and no flags', () => {
      const { nowMs, metar } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-yssy-auto-nodata' });
      const r = build(pack, nowMs, metar, null, 240);
      const boundary = metar!.observedAtMs + validityMs;
      for (const sl of r.slots) {
        if (sl.startMs < boundary) {
          expect(sl.governedBy).toBe('METAR');
          expect(sl.tafView).toBeNull();
        } else {
          expect(sl.governedBy).toBe('NONE');
          expect(sl.weather).toEqual({ wind: null, precipitation: { prevailing: false, probable: null, temporary: false, recent: false }, overlays: [] });
          expect(sl.tafView).toBeNull();
        }
      }
      expect(r.slots.some((x) => x.governedBy === 'NONE')).toBe(true);
      expect(r.banners.map((b) => b.code)).toEqual(['no-taf']);
    });

    it('neither report: every slot is NONE and one banner says no weather was entered', () => {
      const nowMs = utc('2026-10-23T14:10:00Z');
      const r = build(pack, nowMs, null, null, 240);
      expect(r.slots).toHaveLength(8);
      expect(r.slots.every((x) => x.governedBy === 'NONE' && x.weather.wind === null)).toBe(true);
      expect(r.banners.map((b) => b.code)).toEqual(['no-weather']);
      expect(build(pack, nowMs, null, null, null).slots).toHaveLength(1);
    });

    it('slot 0 is always present, even when the METAR window has already passed and there is no TAF', () => {
      const { nowMs, metar } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-yssy-auto-nodata' });
      const r = build(pack, utc('2026-10-23T18:10:00Z'), metar, null, null);
      void nowMs;
      expect(r.slots).toHaveLength(1);
      expect(r.slots[0]!.governedBy).toBe('NONE');
    });
  });

  describe('stale and expired reports', () => {
    it('a stale METAR is accepted and flagged but governs nothing once the window has passed; the TAF governs from slot 0', () => {
      const now = '2026-10-23T15:30:00Z';
      const { nowMs, metar, taf } = reports(ref, now, { metar: 'metar-yssy-auto-nodata', taf: 'taf-yssy-multiline-fm-tempo' });
      const r = build(pack, nowMs, metar, taf, 120);
      expect(r.metarAgeMinutes).toBe(90);
      const codes = r.banners.map((b) => b.code);
      expect(codes).toContain('metar-stale');
      expect(codes).toContain('metar-outside-window');
      expect(r.slots.every((x) => x.governedBy === 'TAF')).toBe(true);
      expect(r.slots[0]!.weather.precipitation.recent).toBe(false);
    });

    it('stale is judged by metarStaleMinutes, the window by metarValidityMinutes: a METAR can be stale and still inside its window', () => {
      const p = packWith(ref, { settings: { metarStaleMinutes: 30, metarValidityMinutes: 90 } });
      const { nowMs, metar, taf } = reports(ref, '2026-10-23T14:40:00Z', { metar: 'metar-yssy-auto-nodata', taf: 'taf-yssy-multiline-fm-tempo' });
      const r = build(p, nowMs, metar, taf, 120);
      expect(r.banners.map((b) => b.code)).toContain('metar-stale'); // 40 minutes old, limit 30
      expect(r.banners.map((b) => b.code)).not.toContain('metar-outside-window');
      // Now is 14:40, so slot 0 is 14:30. Slots 14:30 and 15:00 start before 14:00 + 90 minutes; 15:30 starts exactly at it.
      expect(r.slots.map((x) => x.governedBy)).toEqual(['METAR', 'METAR', 'TAF', 'TAF']);
    });

    it('a METAR exactly at the stale limit is not stale; one minute older is', () => {
      const p = packWith(ref, { settings: { metarStaleMinutes: 60 } });
      const at = reports(ref, '2026-10-23T15:00:00Z', { metar: 'metar-yssy-auto-nodata' });
      expect(build(p, at.nowMs, at.metar, null, 60).banners.map((b) => b.code)).not.toContain('metar-stale');
      const after = reports(ref, '2026-10-23T15:01:00Z', { metar: 'metar-yssy-auto-nodata' });
      expect(build(p, after.nowMs, after.metar, null, 60).banners.map((b) => b.code)).toContain('metar-stale');
    });

    it('a stale TAF is flagged by tafStaleMinutes', () => {
      const p = packWith(ref, { settings: { tafStaleMinutes: 100 } });
      const { nowMs, taf } = reports(ref, '2026-10-23T14:10:00Z', { taf: 'taf-yssy-multiline-fm-tempo' });
      const r = build(p, nowMs, null, taf, 120);
      expect(r.tafAgeMinutes).toBe(182); // issued 11:08
      expect(r.banners.map((b) => b.code)).toContain('taf-stale');
      const fresh = build(packWith(ref, { settings: { tafStaleMinutes: 200 } }), nowMs, null, taf, 120);
      expect(fresh.banners.map((b) => b.code)).not.toContain('taf-stale');
    });

    it('a TAF whose validity has ended counts as no TAF, from the instant it ends', () => {
      const taf = decodeTafFixture('taf-yssy-multiline-fm-tempo', ref, utc('2026-10-23T14:10:00Z'));
      const justBefore = build(pack, taf.validToMs - 1, null, taf, 60);
      expect(justBefore.slots[0]!.governedBy).toBe('TAF');
      const ended = build(pack, taf.validToMs, null, taf, 60);
      expect(ended.slots.every((x) => x.governedBy === 'NONE')).toBe(true);
      expect(ended.banners.map((b) => b.code)).toEqual(['no-metar', 'taf-ended']);
    });

    it('report age comes from the report time group, not from when it was entered', () => {
      const { nowMs, metar, taf } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-yssy-auto-nodata', taf: 'taf-yssy-multiline-fm-tempo' });
      const r = build(pack, nowMs, metar, taf, 60);
      expect(r.metarAgeMinutes).toBe(10);
      expect(r.tafAgeMinutes).toBe(182);
    });
  });

  describe('forecast flags per slot (WC-9, WC-10)', () => {
    it('the pack list decides what counts as precipitation: METAR drizzle and RETS/RERA', () => {
      const { nowMs, metar } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-skbu-vrb-re' });
      const p = build(pack, nowMs, metar, null, 60).slots[0]!.weather.precipitation;
      expect(p.prevailing).toBe(codes.includes('DZ'));
      expect(p.recent).toBe(codes.includes('TS') || codes.includes('RA'));
      expect(p.probable).toBeNull();
      expect(p.temporary).toBe(false);
    });

    it('recent weather alone (RESHRA, no present weather) sets recent and not prevailing', () => {
      const { nowMs, metar } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-hkel-showers-re' });
      const p = build(pack, nowMs, metar, null, 30).slots[0]!.weather.precipitation;
      expect(p.prevailing).toBe(false);
      expect(p.recent).toBe(codes.includes('SH') || codes.includes('RA'));
    });

    it('a METAR with no precipitation gives all-false flags', () => {
      const { nowMs, metar } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-yssy-auto-nodata' });
      expect(build(pack, nowMs, metar, null, 30).slots[0]!.weather.precipitation).toEqual({ prevailing: false, probable: null, temporary: false, recent: false });
    });

    it('an FM group with rain is prevailing from the slot that contains its start, not before', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T14:10:00Z', { taf: 'taf-ymml-multiline-amd-inter' });
      const r = build(pack, nowMs, null, taf, null);
      const at = (iso: string) => r.slots.find((x) => x.startMs === utc(iso))!;
      // FM231600 18008KT 9999 -SHRA: SH and RA.
      expect(at('2026-10-23T15:30:00Z').weather.precipitation.prevailing).toBe(false);
      expect(at('2026-10-23T16:00:00Z').weather.precipitation.prevailing).toBe(codes.includes('SH') || codes.includes('RA'));
    });

    it('a BECMG that brings rain is prevailing from its START slot (19:00), not from its end (21:00)', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T18:10:00Z', { taf: 'taf-encn-becmg-rain' });
      const r = build(pack, nowMs, null, taf, 240);
      const at = (iso: string) => r.slots.find((x) => x.startMs === utc(iso))!;
      expect(at('2026-10-23T18:30:00Z').weather.precipitation.prevailing).toBe(false);
      expect(at('2026-10-23T19:00:00Z').weather.precipitation.prevailing).toBe(codes.includes('RA'));
      expect(at('2026-10-23T20:00:00Z').weather.precipitation.prevailing).toBe(codes.includes('RA'));
    });

    it('PROB40 TEMPO with rain is temporary, never probable, never prevailing; listed as a TEMPO overlay with its probability', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T12:10:00Z', { taf: 'taf-limc-prob40-tempo' }); // 2312/2316 RA
      const r = build(pack, nowMs, null, taf, 360);
      const inside = r.slots.find((x) => x.startMs === utc('2026-10-23T13:00:00Z'))!;
      expect(inside.weather.precipitation).toEqual({ prevailing: false, probable: null, temporary: codes.includes('RA'), recent: false });
      expect(inside.weather.overlays).toMatchObject([{ kind: 'TEMPO', probabilityPct: 40, precipitation: codes.includes('RA') }]);
      expect(inside.weather.overlays[0]!.text).toBe('PROB40 TEMPO 2312/2316 RA');
      const lastCovered = r.slots.find((x) => x.startMs === utc('2026-10-23T15:30:00Z'))!;
      expect(lastCovered.weather.overlays).toHaveLength(1);
      const after = r.slots.find((x) => x.startMs === utc('2026-10-23T16:00:00Z'))!;
      expect(after.weather.overlays).toEqual([]);
      expect(after.weather.precipitation.temporary).toBe(false);
    });

    it('a plain PROB40 group with showers is probable (40) and not temporary', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T12:10:00Z', { taf: 'taf-essl-prob40-showers' }); // PROB40 2312/2315 SHRA
      const r = build(pack, nowMs, null, taf, 240);
      const inside = r.slots[0]!.weather.precipitation;
      expect(inside.probable).toBe(codes.includes('SH') || codes.includes('RA') ? 40 : null);
      expect(inside.temporary).toBe(false);
      expect(inside.prevailing).toBe(false);
      expect(r.slots[0]!.weather.overlays).toMatchObject([{ kind: 'PROB', probabilityPct: 40 }]);
      expect(r.slots[6]!.weather.precipitation.probable).toBeNull(); // 15:00 slot: the group has ended
    });

    it('a plain PROB group without precipitation is an overlay but sets no flag', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T12:10:00Z', { taf: 'taf-essv-prob40-plain' }); // PROB40 BKN014
      const r = build(pack, nowMs, null, taf, 60);
      expect(r.slots[0]!.weather.precipitation).toEqual({ prevailing: false, probable: null, temporary: false, recent: false });
      expect(r.slots[0]!.weather.overlays).toMatchObject([{ kind: 'PROB', probabilityPct: 40, precipitation: false }]);
    });

    it('INTER with showers is temporary for every slot it covers', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T12:10:00Z', { taf: 'taf-ypcc-inter' }); // INTER 2312/2412 SHRA
      const r = build(pack, nowMs, null, taf, 360);
      for (const sl of r.slots) {
        expect(sl.weather.precipitation.temporary).toBe(codes.includes('SH') || codes.includes('RA'));
        expect(sl.weather.overlays).toMatchObject([{ kind: 'INTER', probabilityPct: null }]);
      }
    });

    it('PROB40 INTER and PROB30 TEMPO are temporary, not probable', () => {
      const a = reports(ref, '2026-10-23T12:10:00Z', { taf: 'taf-nvss-prob40-inter' });
      const ra = build(pack, a.nowMs, null, a.taf, 60).slots[0]!.weather.precipitation;
      expect(ra.probable).toBeNull();
      expect(ra.temporary).toBe(codes.includes('SH') || codes.includes('RA'));
      const b = reports(ref, '2026-10-23T12:10:00Z', { taf: 'taf-edhi-prob30-tempo' });
      const rb = build(pack, b.nowMs, null, b.taf, 60).slots[0]!.weather.precipitation;
      expect(rb.probable).toBeNull();
      expect(rb.temporary).toBe(codes.includes('RA'));
    });

    it('the highest probability wins when two PROB groups with precipitation cover one slot (SYNTHETIC overlays)', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T12:10:00Z', { taf: 'taf-essl-prob40-showers' });
      const base = taf!.overlays[0]!;
      const make = (pct: 30 | 40): TafOverlayGroup => ({ ...base, probabilityPct: pct, text: `PROB${pct}` });
      const two: DecodedTaf = { ...taf!, overlays: [make(30), make(40)] };
      const r = build(pack, nowMs, null, two, 60);
      expect(r.slots[0]!.weather.precipitation.probable).toBe(codes.includes('SH') || codes.includes('RA') ? 40 : null);
      const swapped: DecodedTaf = { ...taf!, overlays: [make(40), make(30)] };
      expect(build(pack, nowMs, null, swapped, 60).slots[0]!.weather.precipitation.probable).toBe(r.slots[0]!.weather.precipitation.probable);
    });
  });

  describe('a forecast group applies to the slot containing its start (OP-2)', () => {
    it('FM231315 applies to the 13:00 slot, whole', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T12:10:00Z', { taf: 'taf-khlg-fm-mid-slot' });
      const r = build(pack, nowMs, null, taf, 240);
      const at = (iso: string) => r.slots.find((x) => x.startMs === utc(iso))!;
      expect(at('2026-10-23T12:30:00Z').weather.wind).toMatchObject({ kind: 'steady', speedKt: 0 }); // base 00000KT
      expect(at('2026-10-23T13:00:00Z').weather.wind).toEqual({ kind: 'variable', speedKt: 3, gustKt: null }); // FM VRB03KT
      expect(at('2026-10-23T14:30:00Z').weather.wind).toEqual({ kind: 'variable', speedKt: 3, gustKt: null });
      expect(at('2026-10-23T15:00:00Z').weather.wind).toMatchObject({ directionDegrees: 70, speedKt: 4 }); // FM231500 07004KT
    });

    it('a change on a slot boundary (FM231500) applies from that slot, not the one before', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T14:10:00Z', { taf: 'taf-khlg-fm-mid-slot' });
      const r = build(pack, nowMs, null, taf, 120);
      expect(r.slots[0]!.startMs).toBe(utc('2026-10-23T14:00:00Z'));
      expect(r.slots[1]!.weather.wind).toEqual({ kind: 'variable', speedKt: 3, gustKt: null }); // 14:30: still the FM at 13:15
      expect(r.slots[2]!.weather.wind).toMatchObject({ directionDegrees: 70, speedKt: 4 }); // 15:00
    });

    it('BECMG 2312/2315 29022G38KT applies from 12:00 (its start), with the gust', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T12:10:00Z', { taf: 'taf-egkk-becmg-tempo-prob' });
      const r = build(pack, nowMs, null, taf, 120);
      expect(r.slots[0]!.startMs).toBe(utc('2026-10-23T12:00:00Z'));
      expect(r.slots[0]!.weather.wind).toEqual({ kind: 'steady', directionDegrees: 290, speedKt: 22, gustKt: 38, variableRangeDegrees: null });
      // The base group 29012KT is never the prevailing wind of this TAF.
    });

    it('slots before the TAF validity starts are NONE, and the first slot of the validity holds the base group', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T11:20:00Z', { taf: 'taf-yssy-multiline-fm-tempo' }); // valid from 12:00
      const r = build(pack, nowMs, null, taf, 120);
      // Now is 11:20: slots 11:00 and 11:30 are before the validity; 12:00 holds the base group.
      expect(r.slots.map((x) => x.governedBy)).toEqual(['NONE', 'NONE', 'TAF', 'TAF']);
      expect(r.slots[2]!.startMs).toBe(utc('2026-10-23T12:00:00Z'));
    });
  });

  describe('wind mapping', () => {
    it('keeps gust, VRB, direction range and calm exactly', () => {
      const wind = (id: string, nowIso: string) => {
        const { nowMs, metar } = reports(ref, nowIso, { metar: id });
        return build(pack, nowMs, metar, null, 30).slots[0]!.weather.wind;
      };
      expect(wind('metar-egll-cloud-unknown-type', '2026-10-23T14:00:00Z')).toMatchObject({ kind: 'steady', directionDegrees: 290, speedKt: 23, gustKt: 34 });
      expect(wind('metar-skbu-vrb-re', '2026-10-23T14:10:00Z')).toEqual({ kind: 'variable', speedKt: 2, gustKt: null });
      expect(wind('metar-uibb-mps-range', '2026-10-23T14:10:00Z')).toMatchObject({ directionDegrees: 280, variableRangeDegrees: [250, 310] });
      expect(wind('metar-waqq-calm', '2026-10-23T14:10:00Z')).toEqual({ kind: 'steady', directionDegrees: 0, speedKt: 0, gustKt: null, variableRangeDegrees: null });
    });

    it('a TEMPO with its own wind exposes it in the overlay; a TEMPO without wind gives null', () => {
      const { nowMs, taf } = reports(ref, '2026-10-23T12:10:00Z', { taf: 'taf-ybbn-amd-prob30-tempo' });
      const r = build(pack, nowMs, null, taf, 60);
      const tempo = r.slots[0]!.weather.overlays.find((o) => o.kind === 'TEMPO')!;
      expect(tempo.wind).toMatchObject({ directionDegrees: 10, speedKt: 15, gustKt: 25 }); // TEMPO 01015G25KT
      const y = reports(ref, '2026-10-23T12:10:00Z', { taf: 'taf-yssy-multiline-fm-tempo' });
      expect(build(pack, y.nowMs, null, y.taf, 60).slots[0]!.weather.overlays[0]!.wind).toBeNull();
    });
  });

  describe('purity', () => {
    it('same input, same output, and the inputs are not changed', () => {
      const { nowMs, metar, taf } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-yssy-auto-nodata', taf: 'taf-yssy-multiline-fm-tempo' });
      const before = JSON.stringify({ metar, taf, settings: pack.settings });
      const a = build(pack, nowMs, metar, taf, null);
      const b = build(pack, nowMs, metar, taf, null);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(JSON.stringify({ metar, taf, settings: pack.settings })).toBe(before);
    });

    it('slots do not share mutable objects', () => {
      const { nowMs, metar } = reports(ref, '2026-10-23T14:10:00Z', { metar: 'metar-yssy-auto-nodata' });
      const r = build(pack, nowMs, metar, null, 60);
      expect(r.slots[0]!.weather).not.toBe(r.slots[1]!.weather);
    });
  });
});

describe('a few fixed-clock sanity values independent of the pack', () => {
  it('SLOT_MINUTES is 30', () => {
    expect(SLOT_MINUTES).toBe(30);
    expect(HOUR / SLOT).toBe(2);
  });
});
