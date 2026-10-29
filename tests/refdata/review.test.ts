// Review round 1: strict objects everywhere, duplicate keys, whole-day bands,
// _ keys where data is expected, -0, airport id shape, poll bound.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadPack, parseAppConfig, parsePack, type FetchLike } from '../../src/refdata';
import { TEST1_PACK, TEST_PACK, YSSY_PACK, readJson, readRaw, toRaw, type JsonFiles, type RawFiles } from '../helpers/packs';

function refusedMessage(raw: RawFiles | Record<string, string>): string {
  try {
    parsePack(raw);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('the pack should have been refused');
}
const bad = (mutate: (f: JsonFiles) => void): RawFiles => {
  const f = readJson(TEST_PACK);
  mutate(f);
  return toRaw(f);
};

describe('unknown keys are refused in every file and at nested levels', () => {
  const cases: [string, string, (f: JsonFiles) => void][] = [
    ['airport.json', 'zzz', (f) => { f['airport.json'].zzz = 1; }],
    ['runways.json', 'zzz', (f) => { f['runways.json'].zzz = 1; }],
    ['runways.json', 'runways[0].zzz', (f) => { f['runways.json'].runways[0].zzz = 1; }],
    ['runways.json', 'runways[2].threshold.zzz', (f) => { f['runways.json'].runways[2].threshold.zzz = 1; }],
    ['modes.json', 'zzz', (f) => { f['modes.json'].zzz = 1; }],
    ['modes.json', 'modes[0].zzz', (f) => { f['modes.json'].modes[0].zzz = 1; }],
    ['operating_plan.json', 'zzz', (f) => { f['operating_plan.json'].zzz = 1; }],
    ['operating_plan.json', 'bands[0].zzz', (f) => { f['operating_plan.json'].bands[0].zzz = 1; }],
    ['operating_plan.json', 'bands[0].rows[0].zzz', (f) => { f['operating_plan.json'].bands[0].rows[0].zzz = 1; }],
    ['settings.json', 'zzz', (f) => { f['settings.json'].zzz = { value: 1, description: 'x' }; }],
    ['settings.json', 'trafficBands.value.zzz', (f) => { f['settings.json'].trafficBands.value.zzz = [1, 2]; }],
  ];
  for (const [file, path, mutate] of cases) {
    it(`${file} ${path}`, () => {
      expect(refusedMessage(bad(mutate))).toContain(`${file}: ${path}`);
    });
  }
  it('app.json', () => {
    expect(() => parseAppConfig(JSON.stringify({ schemaVersion: 1, airports: ['YSSY'], default: 'YSSY', zzz: 1 }))).toThrow(/app\.json: zzz/);
  });
});

describe('duplicate JSON keys', () => {
  it('a repeated "enabled" in a mode is refused, naming file and key', () => {
    const raw = readRaw(TEST_PACK);
    raw['modes.json'] = raw['modes.json'].replace('"enabled": true,', '"enabled": true, "enabled": false,');
    const message = refusedMessage(raw);
    expect(message).toContain('modes.json: enabled');
    expect(message).toContain('twice');
  });
  it('a repeated "name" in a runway is refused', () => {
    const raw = readRaw(TEST_PACK);
    raw['runways.json'] = raw['runways.json'].replace('"name": "9",', '"name": "9", "name": "27",');
    expect(refusedMessage(raw)).toContain('runways.json: name');
  });
  it('the same key in different objects is fine, and so is key-like text inside a string', () => {
    const raw = readRaw(TEST_PACK);
    raw['airport.json'] = raw['airport.json'].replace('"Testfield"', '"\\"name\\": \\"name\\""');
    expect(() => parsePack(raw)).not.toThrow();
  });
  it('a duplicate in app.json is refused', () => {
    expect(() => parseAppConfig('{"schemaVersion":1,"schemaVersion":1,"airports":["YSSY"],"default":"YSSY"}')).toThrow(/app\.json: schemaVersion/);
  });
});

describe('whole-day bands need allDay', () => {
  it('start equal to end without allDay is refused naming file and field', () => {
    const f = readJson(TEST1_PACK);
    delete f['operating_plan.json'].bands[0].allDay;
    expect(refusedMessage(toRaw(f))).toContain('operating_plan.json: bands[0].end');
  });
  it('allDay with different start and end is refused', () => {
    const f = readJson(TEST1_PACK);
    f['operating_plan.json'].bands[0].end = '12:00';
    expect(refusedMessage(toRaw(f))).toContain('operating_plan.json: bands[0].allDay');
  });
  it('allDay true loads and covers the day; false is the default', () => {
    expect(parsePack(toRaw(readJson(TEST1_PACK))).plan[0]?.allDay).toBe(true);
    expect(parsePack(toRaw(readJson(TEST_PACK))).plan[0]?.allDay).toBe(false);
  });
});

describe('_ keys where data is expected', () => {
  it('a label key starting with _ is refused, not dropped', () => {
    const message = refusedMessage(bad((f) => { f['airport.json'].labels._hidden = 'x'; }));
    expect(message).toContain('airport.json: labels._hidden');
  });
  it('an id starting with _ is refused', () => {
    expect(refusedMessage(bad((f) => { f['modes.json'].modes[0].id = '_EAST'; }))).toContain('modes.json: modes[0].id');
    expect(refusedMessage(bad((f) => { f['operating_plan.json'].bands[0].id = '_x'; }))).toContain('operating_plan.json: bands[0].id');
  });
  it('a real field written with a _ prefix is reported as missing', () => {
    const message = refusedMessage(
      bad((f) => {
        const m = f['modes.json'].modes[0];
        m._enabled = m.enabled;
        delete m.enabled;
      }),
    );
    expect(message).toContain('modes.json: modes[0].enabled');
  });
  it('genuine note keys on records are still dropped', () => {
    const f = readJson(TEST_PACK);
    f['modes.json'].modes[0]._note = 'free text';
    f['airport.json'].labels.extraNotice = 'kept';
    const pack = parsePack(toRaw(f));
    expect(Object.keys(pack.modes[0] ?? {})).not.toContain('_note');
    expect(pack.airport.labels.extraNotice).toBe('kept');
  });
});

describe('negative zero', () => {
  it('-0 is read as 0', () => {
    const f = readJson(TEST_PACK);
    f['settings.json'].tailwindWetKt.value = 987654;
    const raw = toRaw(f);
    raw['settings.json'] = raw['settings.json'].replace('987654', '-0');
    expect(Object.is(parsePack(raw).settings.tailwindWetKt, 0)).toBe(true);
  });
});

describe('airport id shape', () => {
  const app = JSON.stringify({ schemaVersion: 1, airports: ['YSSY'], default: 'YSSY' });
  it('a lowercase airport in app.json is refused at validation', () => {
    expect(() => parseAppConfig(JSON.stringify({ schemaVersion: 1, airports: ['yssy'], default: 'yssy' }))).toThrow(/app\.json: airports\[0\]/);
    expect(() => parseAppConfig(JSON.stringify({ schemaVersion: 1, airports: ['YSSY'], default: 'yssy' }))).toThrow(/app\.json: default/);
  });
  it('an airportId passed to loadPack is shape-checked before any request', async () => {
    const urls: string[] = [];
    const fetchFn: FetchLike = (u) => {
      urls.push(u);
      return Promise.resolve(new Response(app));
    };
    for (const id of ['yssy', '../x', 'AB', 'ABCDEFGHI']) {
      expect((await loadPack(fetchFn, { cacheBust: 'v1', airportId: id })).ok).toBe(false);
    }
    expect(urls).toHaveLength(0);
  });
});

describe('vatsimPollSeconds has no enforced minimum beyond 1', () => {
  it('1 loads, 0 is refused', () => {
    const f = readJson(YSSY_PACK);
    f['settings.json'].vatsimPollSeconds.value = 1;
    expect(parsePack(toRaw(f)).settings.vatsimPollSeconds).toBe(1);
    f['settings.json'].vatsimPollSeconds.value = 0;
    expect(refusedMessage(toRaw(f))).toContain('settings.json: vatsimPollSeconds.value');
  });
});

describe('atisPollMinutes has an enforced floor of 30 minutes (issue 159, owner, 29-10-2026)', () => {
  it('every shipped pack and fixture carries it, at 30', () => {
    for (const ref of [YSSY_PACK, TEST_PACK, TEST1_PACK]) expect(parsePack(toRaw(readJson(ref))).settings.atisPollMinutes).toBe(30);
    const dir = join(import.meta.dirname, '..', '..', 'refdata', 'airports');
    for (const icao of readdirSync(dir)) {
      const settings = JSON.parse(readFileSync(join(dir, icao, 'settings.json'), 'utf8')) as { atisPollMinutes?: { value: number } };
      expect(settings.atisPollMinutes?.value, icao).toBe(30);
    }
  });
  it('30 and more load; 29, 1, 0, a negative and a fraction are refused', () => {
    const f = readJson(YSSY_PACK);
    f['settings.json'].atisPollMinutes.value = 30;
    expect(parsePack(toRaw(f)).settings.atisPollMinutes).toBe(30);
    f['settings.json'].atisPollMinutes.value = 120;
    expect(parsePack(toRaw(f)).settings.atisPollMinutes).toBe(120);
    for (const bad of [29, 1, 0, -30, 30.5]) {
      f['settings.json'].atisPollMinutes.value = bad;
      expect(refusedMessage(toRaw(f))).toContain('settings.json: atisPollMinutes.value');
    }
  });
  it('a pack without it is refused, like any other setting, and it has a description', () => {
    const f = readJson(YSSY_PACK);
    expect(parsePack(toRaw(f)).descriptions.atisPollMinutes.length).toBeGreaterThan(10);
    delete f['settings.json'].atisPollMinutes;
    expect(refusedMessage(toRaw(f))).toContain('atisPollMinutes');
  });
});
