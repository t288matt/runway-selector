// parseFeed: validation, and the privacy guarantee (SEC-3, SEC-6, S-09).
// The fixture is synthetic and made up. Its SHAPE (top-level keys, the pilot
// fields and the flight-plan fields) was checked against the live feed on
// 23-10-2026; no real pilot data is stored anywhere in the repository.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEED_MAX_BYTES, FEED_MAX_DEPTH, FEED_MAX_PILOTS } from '../../src/traffic/config';
import { parseFeed, type Aircraft } from '../../src/traffic/parseFeed';

const fixture = readFileSync(join(import.meta.dirname, '..', 'fixtures', 'traffic', 'synthetic-feed.json'), 'utf8');
const ALLOWED_KEYS = ['altitude', 'arrival', 'departure', 'groundspeed', 'latitude', 'longitude'];
const PREFILE_KEYS = ['arrival', 'departure', 'departureMinuteOfDay', 'enrouteMinutes'];

function ok(text: string) {
  const r = parseFeed(text);
  if (!r.ok) throw new Error(r.message);
  return r.feed;
}

const pilot = (over: Record<string, unknown> = {}, plan: Record<string, unknown> | null = { departure: 'ZZZA', arrival: 'ZZZB' }) => ({
  latitude: 1,
  longitude: 2,
  altitude: 3,
  groundspeed: 4,
  flight_plan: plan,
  ...over,
});
const feedOf = (pilots: unknown[]) => JSON.stringify({ general: { update_timestamp: '2026-10-23T10:00:00Z' }, pilots });

describe('parseFeed keeps only the allowed fields (SEC-6)', () => {
  const feed = ok(fixture);

  it('parses the synthetic feed: the plan-less and malformed pilots are dropped, the others kept', () => {
    expect(feed.aircraft).toHaveLength(3);
    expect(feed.skippedPilots).toBe(1);
    expect(feed.aircraft[0]).toEqual({ latitude: -10.5, longitude: 20.25, altitude: 35000, groundspeed: 450, departure: 'ZZZA', arrival: 'ZZZB' });
    expect(feed.aircraft[2]?.departure).toBe('');
  });

  it('every aircraft has exactly the six allowed keys and the result has no others', () => {
    expect(Object.keys(feed).sort()).toEqual(['aircraft', 'feedTimestampMs', 'prefiles', 'skippedPilots']);
    for (const a of feed.aircraft) expect(Object.keys(a).sort()).toEqual(ALLOWED_KEYS);
  });

  it('walks the whole output: no key anywhere outside the allowed set', () => {
    const allowed = new Set([...ALLOWED_KEYS, ...PREFILE_KEYS, 'aircraft', 'feedTimestampMs', 'prefiles', 'skippedPilots']);
    const walk = (node: unknown): void => {
      if (node === null || typeof node !== 'object') return;
      for (const [k, v] of Object.entries(node)) {
        if (!Array.isArray(node)) expect(allowed.has(k), `unexpected key ${k}`).toBe(true);
        walk(v);
      }
    };
    walk(feed);
  });

  it('canary: no name, member number, callsign, server, remark, route or unknown-field value survives anywhere in the output', () => {
    const text = JSON.stringify(parseFeed(fixture));
    for (const canary of ['CANARY', 'Madeup', '999000', 'CANARYCALL', 'PBN/A1', 'DCT', 'ZZ99', '1200', 'ZZZA_TWR', '118.100']) {
      expect(text, canary).not.toContain(canary);
    }
  });

  it('the Aircraft type has no personal field (compile-time check)', () => {
    const a: Aircraft = feed.aircraft[0]!;
    // @ts-expect-error callsign is not a field
    void a.callsign;
    // @ts-expect-error name is not a field
    void a.name;
    // @ts-expect-error cid is not a field
    void a.cid;
    expect(a).toBeDefined();
  });

  it('uppercases and trims origin and destination', () => {
    expect(feed.aircraft[0]?.departure).toBe('ZZZA');
    expect(feed.aircraft[0]?.arrival).toBe('ZZZB');
  });

  it('keeps the feed update time for the freshness chip', () => {
    expect(feed.feedTimestampMs).toBe(Date.UTC(2026, 9, 23, 10, 0, 0, 123));
  });

  it('a missing or unreadable update time gives null, not a refusal', () => {
    expect(ok(JSON.stringify({ pilots: [] })).feedTimestampMs).toBeNull();
    expect(ok(JSON.stringify({ general: { update_timestamp: 'yesterday' }, pilots: [] })).feedTimestampMs).toBeNull();
    expect(ok(JSON.stringify({ general: 5, pilots: [] })).feedTimestampMs).toBeNull();
  });

  it('ignores unknown fields everywhere', () => {
    const f = ok(feedOf([pilot({ extra: { deep: 1 } }, { departure: 'ZZZA', arrival: 'ZZZB', surprise: 1 })]));
    expect(f.aircraft).toHaveLength(1);
    expect(Object.keys(f.aircraft[0]!).sort()).toEqual(ALLOWED_KEYS);
  });
});

describe('aircraft without a flight plan', () => {
  it('are ignored and not counted as malformed', () => {
    const f = ok(feedOf([pilot({}, null), pilot({ flight_plan: undefined })]));
    expect(f.aircraft).toHaveLength(0);
    expect(f.skippedPilots).toBe(0);
  });
});

describe('malformed pilots are skipped, the rest kept', () => {
  const bad: [string, unknown][] = [
    ['not an object', 7],
    ['null entry', null],
    ['latitude as text', pilot({ latitude: '1' })],
    ['latitude out of range', pilot({ latitude: 90.5 })],
    ['longitude out of range', pilot({ longitude: -181 })],
    ['altitude missing', pilot({ altitude: undefined })],
    ['negative groundspeed', pilot({ groundspeed: -1 })],
    ['absurd groundspeed', pilot({ groundspeed: 1e9 })],
    ['flight plan not an object', pilot({ flight_plan: 'x' })],
    ['departure not text', pilot({}, { departure: 5, arrival: 'ZZZB' })],
    ['arrival too long', pilot({}, { departure: 'ZZZA', arrival: 'ABCDEFGHI' })],
    ['arrival with odd characters', pilot({}, { departure: 'ZZZA', arrival: 'ZZ<Z' })],
  ];
  for (const [title, entry] of bad) {
    it(title, () => {
      const f = ok(feedOf([entry, pilot()]));
      expect(f.aircraft).toHaveLength(1);
      expect(f.skippedPilots).toBe(1);
    });
  }
});

describe('a malformed feed is refused whole, with a message', () => {
  const refused = (text: string) => {
    const r = parseFeed(text);
    expect(r.ok).toBe(false);
    return r.ok ? '' : r.message;
  };

  it('not JSON', () => expect(refused('not json')).toMatch(/not valid JSON/));
  it('not an object', () => expect(refused('[]')).toMatch(/no pilots list/));
  it('no pilots', () => expect(refused('{"general":{}}')).toMatch(/no pilots list/));
  it('pilots not a list', () => expect(refused('{"pilots":{}}')).toMatch(/no pilots list/));

  it('over the size cap, before parsing', () => {
    const big = `{"pilots":[],"x":"${'a'.repeat(FEED_MAX_BYTES)}"}`;
    expect(refused(big)).toMatch(/larger than/);
  });

  it('deeper than the depth limit', () => {
    const deep = '['.repeat(FEED_MAX_DEPTH + 1) + ']'.repeat(FEED_MAX_DEPTH + 1);
    expect(refused(`{"pilots":[],"x":${deep}}`)).toMatch(/Nesting is deeper/);
  });

  it('exactly at the depth limit is accepted', () => {
    // The object counts one level, so the array may add FEED_MAX_DEPTH - 1.
    const edge = '['.repeat(FEED_MAX_DEPTH - 1) + ']'.repeat(FEED_MAX_DEPTH - 1);
    expect(parseFeed(`{"pilots":[],"x":${edge}}`).ok).toBe(true);
  });

  it('too many pilots', () => {
    expect(refused(`{"pilots":[${Array(FEED_MAX_PILOTS + 1).fill('{}').join(',')}]}`)).toMatch(/more than/);
  });

  for (const key of ['__proto__', 'constructor', 'prototype']) {
    it(`the key ${key} at the top level`, () => expect(refused(`{"pilots":[],"${key}":{}}`)).toContain(key));
    it(`the key ${key} inside a pilot`, () => expect(refused(`{"pilots":[{"flight_plan":{"${key}":1}}]}`)).toContain(key));
  }

  it('the refusal message carries no feed content', () => {
    expect(refused(fixture.replace('"general"', '"__proto__"'))).not.toContain('CANARY');
  });
});

describe('the result is plain data', () => {
  it('has Object prototypes only, so polluted keys cannot be inherited', () => {
    const f = ok(fixture);
    expect(Object.getPrototypeOf(f.aircraft[0])).toBe(Object.prototype);
  });
});

describe('prefiles: filed plans that have not connected', () => {
  const prefile = (plan: Record<string, unknown> | null) => ({ cid: 1, name: 'PERSON', callsign: 'CALL1', flight_plan: plan });
  const withPrefiles = (...list: unknown[]) => JSON.stringify({ general: { update_timestamp: '2026-10-23T10:00:00Z' }, pilots: [], prefiles: list });
  const plan = { departure: 'ZZZA', arrival: 'ZZZB', deptime: '0930', enroute_time: '0130', route: 'DCT', remarks: 'x' };

  it('keeps the filed ends and the times as minutes, and nothing else', () => {
    const f = ok(withPrefiles(prefile(plan)));
    expect(f.prefiles).toEqual([{ departure: 'ZZZA', arrival: 'ZZZB', departureMinuteOfDay: 570, enrouteMinutes: 90 }]);
    for (const p of f.prefiles) expect(Object.keys(p).sort()).toEqual(PREFILE_KEYS);
    expect(f.aircraft).toEqual([]);
  });

  it('ignores a prefile with no plan; keeps one with a missing or malformed time, with that time null, and does not count it as a bad pilot', () => {
    const f = ok(withPrefiles(prefile(null), prefile({ ...plan, deptime: '' }), prefile({ ...plan, deptime: '2499' }), prefile({ ...plan, enroute_time: '0160' }), prefile({ ...plan, deptime: 930 })));
    expect(f.prefiles.map((p) => [p.departureMinuteOfDay, p.enrouteMinutes])).toEqual([
      [null, 90],
      [null, 90],
      [570, null],
      [null, 90],
    ]);
    expect(f.skippedPilots).toBe(0);
  });

  it('no prefiles key gives an empty list', () => {
    expect(ok(feedOf([])).prefiles).toEqual([]);
  });

  it('keeps the first prefiles up to the limit and drops the rest, without refusing the feed', () => {
    const many = Array.from({ length: FEED_MAX_PILOTS + 5 }, () => prefile(plan));
    const r = parseFeed(withPrefiles(...many));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.feed.prefiles).toHaveLength(FEED_MAX_PILOTS);
  });

  it('ignores a prefile whose time en route is longer than a day', () => {
    expect(ok(withPrefiles(prefile({ ...plan, enroute_time: '2401' }))).prefiles.map((p) => p.enrouteMinutes)).toEqual([null]);
    expect(ok(withPrefiles(prefile({ ...plan, enroute_time: '0030' }))).prefiles).toHaveLength(1);
  });

  it('keeps no personal value from a prefile', () => {
    const text = JSON.stringify(parseFeed(withPrefiles(prefile(plan))));
    for (const canary of ['PERSON', 'CALL1', 'DCT']) expect(text, canary).not.toContain(canary);
  });
});

