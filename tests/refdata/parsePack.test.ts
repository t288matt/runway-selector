// Pack loader: good packs load, bad packs are refused with a message that
// names the file and the field. Each check has its own test, so reverting
// the check makes that test fail.
import { describe, expect, it } from 'vitest';
import { BOUNDS, PackValidationError, SETTING_NAMES, parsePack, type PackIssue } from '../../src/refdata';
import { SETTING_VALUE_SCHEMAS } from '../../src/refdata/schema';
import {
  PACKS,
  TEST1_PACK,
  TEST_PACK,
  YSSY_PACK,
  describeForEachPack,
  loadPackFrom,
  readJson,
  readRaw,
  toRaw,
  type JsonFiles,
  type RawFiles,
} from '../helpers/packs';

/** Refuse-check: parsing `raw` throws, and some issue is in `file` with a path starting `path` and a message containing `text`. */
function expectRefused(raw: RawFiles | Record<string, string>, file: string, path: string, text = ''): PackIssue[] {
  let caught: unknown;
  try {
    parsePack(raw);
  } catch (e) {
    caught = e;
  }
  expect(caught, 'the pack should have been refused').toBeInstanceOf(PackValidationError);
  const error = caught as PackValidationError;
  const hit = error.issues.find((i) => i.file === file && i.path.startsWith(path) && i.message.toLowerCase().includes(text.toLowerCase()));
  expect(hit, `no issue for ${file} ${path} "${text}" in: ${error.message}`).toBeDefined();
  expect(error.message).toContain(file);
  return [...error.issues];
}

/** Mutate a deep copy of the fictional pack's JSON and return its raw text. */
function bad(mutate: (f: JsonFiles) => void): RawFiles {
  const files = readJson(TEST_PACK);
  mutate(files);
  return toRaw(files);
}

describe('good packs', () => {
  it('loads the YSSY pack and its values equal what the files hold', () => {
    const pack = loadPackFrom(YSSY_PACK);
    const files = readJson(YSSY_PACK);
    expect(pack.airport.icao).toBe(files['airport.json'].icao);
    expect(pack.airport.timeZone).toBe('Australia/Sydney');
    expect(pack.runways.map((r) => r.name)).toEqual(files['runways.json'].runways.map((r: { name: string }) => r.name));
    expect(pack.modes.map((m) => m.id)).toEqual(files['modes.json'].modes.map((m: { id: string }) => m.id));
    expect(pack.settings.tailwindDryKt).toBe(5);
    expect(pack.settings.tailwindWetKt).toBe(0);
    expect(pack.settings.trafficBands).toEqual({ light: [0, 5], medium: [6, 11], busy: [12, null] });
    expect(pack.settings.forecastWindowMinutes).toBeNull();
    expect(pack.settings.precipitationCodes).toEqual(files['settings.json'].precipitationCodes.value);
    expect(pack.modes.find((m) => m.id === '4')?.enabled).toBe(false);
    expect(pack.modes.find((m) => m.id === '4')?.arrivals).toEqual([]);
    expect(pack.modes.every((m) => m.maxCrosswindKt === 20)).toBe(true);
    expect(pack.meta.operatingPlan.status).toBe('provisional');
  });

  it('turns the YSSY plan bands into minutes of the local day', () => {
    const pack = loadPackFrom(YSSY_PACK);
    expect(pack.plan.map((b) => [b.id, b.startMinute, b.endMinute])).toEqual([
      ['day', 360, 1380],
      ['night', 1380, 360],
    ]);
    expect(pack.plan[1]?.rows[0]).toMatchObject({ mode: '1', allowed: true, penalty: 0 });
  });

  it('every tunable of every pack is unwrapped and its description kept apart', () => {
    for (const ref of PACKS) {
      const pack = loadPackFrom(ref);
      const raw = readJson(ref)['settings.json'];
      for (const name of SETTING_NAMES) {
        expect(pack.settings[name], `${ref.name} ${name}`).toEqual(raw[name].value);
        expect(pack.descriptions[name].length, `${ref.name} ${name}`).toBeGreaterThan(0);
        expect(pack.descriptions[name]).toBe(raw[name].description);
      }
      expect(Object.keys(pack.descriptions).sort()).toEqual([...SETTING_NAMES].sort());
      expect(Object.keys(pack.settings).sort()).toEqual([...SETTING_NAMES].sort());
    }
  });

  it('keeps no description and no _ note anywhere in the engine-facing pack', () => {
    const files = readJson(YSSY_PACK);
    files['settings.json']._note = 'editor note';
    files['modes.json'].modes[0]._why = { nested: 'x' };
    const { descriptions: _separate, ...engineFacing } = parsePack(toRaw(files));
    const found: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (node === null || typeof node !== 'object') return;
      for (const [k, val] of Object.entries(node)) {
        if (k === 'description' || k.startsWith('_')) found.push(`${path}.${k}`);
        walk(val, `${path}.${k}`);
      }
    };
    walk(engineFacing, 'pack');
    expect(found).toEqual([]);
  });

  it('is deeply frozen: changing anything throws', () => {
    // eslint-disable-next-line typescript/no-explicit-any
    const pack = loadPackFrom(YSSY_PACK) as any;
    expect(() => {
      pack.settings.tailwindDryKt = 99;
    }).toThrow(TypeError);
    expect(() => {
      pack.modes.push({});
    }).toThrow(TypeError);
    expect(() => {
      pack.modes[0].arrivals.push('x');
    }).toThrow(TypeError);
    expect(() => {
      pack.settings.trafficBands.light[0] = 9;
    }).toThrow(TypeError);
    expect(() => {
      pack.descriptions.tailwindDryKt = 'changed';
    }).toThrow(TypeError);
    expect(() => {
      pack.airport.labels.extra = 'x';
    }).toThrow(TypeError);
  });

  it('does not share data between loads: a second parse gives an equal, separate pack', () => {
    const a = loadPackFrom(TEST_PACK);
    const b = loadPackFrom(TEST_PACK);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.modes).not.toBe(b.modes);
  });
});

describeForEachPack('every pack', (pack) => {
  it('has unique names and only references that resolve', () => {
    const names = pack.runways.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    const ids = pack.modes.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of pack.modes) {
      for (const n of [...m.arrivals, ...m.departures]) expect(names).toContain(n);
      if (m.enabled) {
        expect(m.arrivals.length).toBeGreaterThan(0);
        expect(m.departures.length).toBeGreaterThan(0);
      }
    }
    for (const b of pack.plan) for (const r of b.rows) expect(ids).toContain(r.mode);
  });

  it('names its own zone, station and code', () => {
    expect(pack.airport.icao.length).toBeGreaterThanOrEqual(3);
    expect(pack.airport.timeZone.length).toBeGreaterThan(0);
    expect(pack.airport.weatherStation.length).toBeGreaterThan(0);
  });
});

describe('the fictional packs differ from YSSY in shape', () => {
  const fictional = loadPackFrom(TEST_PACK);
  const single = loadPackFrom(TEST1_PACK);
  const yssy = loadPackFrom(YSSY_PACK);

  it('numeric runway names, other ids, other limits, half-hour zone, midnight band', () => {
    expect(fictional.runways.map((r) => r.name)).toEqual(['9', '27', '18', '36']);
    expect(fictional.modes.map((m) => m.id)).toEqual(['TST_EAST', 'TST_WEST', 'TST_SPLIT', 'TST_OFF']);
    expect(fictional.settings.tailwindDryKt).toBe(8);
    expect(fictional.settings.tailwindDryKt).not.toBe(yssy.settings.tailwindDryKt);
    expect(fictional.modes.find((m) => m.id === 'TST_EAST')?.maxCrosswindKt).toBe(15);
    expect(fictional.modes.find((m) => m.id === 'TST_SPLIT')?.maxCrosswindKt).toBe(12);
    expect(fictional.modes.some((m) => !m.enabled)).toBe(true);
    expect(fictional.airport.timeZone).toBe('America/St_Johns');
    const late = fictional.plan.find((b) => b.id === 'late');
    expect(late).toMatchObject({ startMinute: 22 * 60 + 30, endMinute: 6 * 60 + 30 });
    expect(fictional.runways.find((r) => r.name === '18')?.threshold).toEqual({ latitude: 47.51, longitude: -52.7 });
  });

  it('a mode with no crosswind limit of its own takes the pack default; capacity is a number or null', () => {
    expect(fictional.modes.find((m) => m.id === 'TST_WEST')?.maxCrosswindKt).toBe(fictional.settings.defaultCrosswindKt);
    expect(fictional.modes.find((m) => m.id === 'TST_EAST')?.capacity).toBe(20);
    expect(fictional.modes.find((m) => m.id === 'TST_WEST')?.capacity).toBeNull();
  });

  it('the single-runway pack has one runway (two ends) and a single whole-day band', () => {
    expect(single.runways).toHaveLength(2);
    expect(single.modes).toHaveLength(2);
    expect(single.plan).toHaveLength(1);
    expect(single.plan[0]).toMatchObject({ startMinute: 0, endMinute: 0 });
  });
});

describe('note fields', () => {
  it('_ keys are removed before the unknown-key check, so editors can leave notes', () => {
    const raw = readRaw(TEST_PACK);
    const settings = JSON.parse(raw['settings.json']);
    settings._editor = 'free note';
    settings.tailwindDryKt._why = 'because';
    raw['settings.json'] = JSON.stringify(settings);
    expect(parsePack(raw).settings.tailwindDryKt).toBe(8);
  });

  it('a key that merely looks like a note is still unknown', () => {
    expectRefused(
      bad((f) => {
        f['modes.json'].modes[0].note = 'x';
      }),
      'modes.json',
      'modes[0].note',
    );
  });
});

describe('refused packs name the file and the field', () => {
  it('a tunable with no description (RD-7)', () => {
    expectRefused(
      bad((f) => {
        delete f['settings.json'].tailwindDryKt.description;
      }),
      'settings.json',
      'tailwindDryKt.description',
    );
  });

  it('a tunable with an empty or blank description (RD-7)', () => {
    expectRefused(
      bad((f) => {
        f['settings.json'].calmWindKt.description = '   ';
      }),
      'settings.json',
      'calmWindKt.description',
    );
  });

  it('a tunable that is not wrapped in { value, description }', () => {
    expectRefused(
      bad((f) => {
        f['settings.json'].tailwindWetKt = 3;
      }),
      'settings.json',
      'tailwindWetKt',
    );
  });

  it('a missing tunable', () => {
    expectRefused(
      bad((f) => {
        delete f['settings.json'].noModePenalty;
      }),
      'settings.json',
      'noModePenalty',
    );
  });

  it('an unknown key in a mode', () => {
    expectRefused(
      bad((f) => {
        f['modes.json'].modes[1].colour = 'red';
      }),
      'modes.json',
      'modes[1].colour',
    );
  });

  it('an unknown tunable, an unknown top-level key and an unknown key inside a tunable', () => {
    expectRefused(
      bad((f) => {
        f['settings.json'].invented = { value: 1, description: 'x' };
      }),
      'settings.json',
      'invented',
    );
    expectRefused(
      bad((f) => {
        f['airport.json'].surprise = true;
      }),
      'airport.json',
      'surprise',
    );
    expectRefused(
      bad((f) => {
        f['settings.json'].calmWindKt.extra = 1;
      }),
      'settings.json',
      'calmWindKt.extra',
    );
  });

  it('a mode that names a runway end that does not exist', () => {
    expectRefused(
      bad((f) => {
        f['modes.json'].modes[0].arrivals = ['99'];
      }),
      'modes.json',
      'modes[0].arrivals[0]',
      'not in runways.json',
    );
    expectRefused(
      bad((f) => {
        f['modes.json'].modes[2].departures = ['9', 'zz'];
      }),
      'modes.json',
      'modes[2].departures[1]',
    );
  });

  it('a band row that names a mode that does not exist', () => {
    expectRefused(
      bad((f) => {
        f['operating_plan.json'].bands[0].rows[0].mode = 'NOPE';
      }),
      'operating_plan.json',
      'bands[0].rows[0].mode',
      'not in modes.json',
    );
  });

  it('a gap between bands', () => {
    expectRefused(
      bad((f) => {
        f['operating_plan.json'].bands[1].start = '23:00';
      }),
      'operating_plan.json',
      'bands',
      'gap from 22:30 to 23:00',
    );
  });

  it('an overlap between bands', () => {
    expectRefused(
      bad((f) => {
        f['operating_plan.json'].bands[0].end = '23:30';
      }),
      'operating_plan.json',
      'bands',
      'overlap from 22:30 to 23:30',
    );
  });

  it('a gap across the midnight wrap', () => {
    expectRefused(
      bad((f) => {
        f['operating_plan.json'].bands[1].end = '05:00';
      }),
      'operating_plan.json',
      'bands',
      'gap from 05:00 to 06:30',
    );
  });

  it('a whole-day band alongside another band overlaps', () => {
    expectRefused(
      bad((f) => {
        f['operating_plan.json'].bands.push({ id: 'all', start: '00:00', end: '00:00', rows: [] });
      }),
      'operating_plan.json',
      'bands',
      'overlap',
    );
  });

  it('duplicate mode ids', () => {
    expectRefused(
      bad((f) => {
        f['modes.json'].modes[1].id = 'TST_EAST';
      }),
      'modes.json',
      'modes[1].id',
      'Duplicate',
    );
  });

  it('duplicate runway names (also when only the case differs)', () => {
    expectRefused(
      bad((f) => {
        f['runways.json'].runways[1].name = '9';
      }),
      'runways.json',
      'runways[1].name',
      'Duplicate',
    );
    expectRefused(
      bad((f) => {
        f['runways.json'].runways[0].name = 'ab';
        f['runways.json'].runways[1].name = 'AB';
        for (const m of f['modes.json'].modes) {
          m.arrivals = [];
          m.departures = [];
          m.enabled = false;
        }
        for (const b of f['operating_plan.json'].bands) b.rows = [];
      }),
      'runways.json',
      'runways[1].name',
      'Duplicate',
    );
  });

  it('duplicate band ids and a mode listed twice in one band', () => {
    expectRefused(
      bad((f) => {
        f['operating_plan.json'].bands[1].id = 'early';
      }),
      'operating_plan.json',
      'bands[1].id',
      'Duplicate',
    );
    expectRefused(
      bad((f) => {
        f['operating_plan.json'].bands[0].rows[1].mode = 'TST_EAST';
      }),
      'operating_plan.json',
      'bands[0].rows[1].mode',
      'two rows',
    );
  });

  it('an enabled mode with an empty runway list', () => {
    expectRefused(
      bad((f) => {
        f['modes.json'].modes[3].enabled = true;
      }),
      'modes.json',
      'modes[3].arrivals',
      'disabled',
    );
    expectRefused(
      bad((f) => {
        f['modes.json'].modes[0].departures = [];
      }),
      'modes.json',
      'modes[0].departures',
    );
  });

  it('traffic bands that are not light < medium < busy and contiguous', () => {
    expectRefused(
      bad((f) => {
        f['settings.json'].trafficBands.value.medium = [5, 8];
      }),
      'settings.json',
      'trafficBands.value.medium[0]',
    );
    expectRefused(
      bad((f) => {
        f['settings.json'].trafficBands.value.busy = [12, null];
      }),
      'settings.json',
      'trafficBands.value.busy[0]',
    );
    expectRefused(
      bad((f) => {
        f['settings.json'].trafficBands.value.light = [1, 3];
      }),
      'settings.json',
      'trafficBands.value.light[0]',
    );
    expectRefused(
      bad((f) => {
        f['settings.json'].trafficBands.value.busy = [9, 20];
      }),
      'settings.json',
      'trafficBands.value.busy[1]',
    );
  });

  it('an unsupported schemaVersion, in every file', () => {
    for (const file of ['airport.json', 'runways.json', 'modes.json', 'operating_plan.json', 'settings.json'] as const) {
      expectRefused(
        bad((f) => {
          f[file].schemaVersion = 2;
        }),
        file,
        'schemaVersion',
        'supports: 1',
      );
    }
    expectRefused(
      bad((f) => {
        delete f['modes.json'].schemaVersion;
      }),
      'modes.json',
      'schemaVersion',
    );
  });

  it('invalid JSON', () => {
    const raw = readRaw(TEST_PACK);
    raw['runways.json'] = '{ "schemaVersion": 1, ';
    expectRefused(raw, 'runways.json', '', 'Not valid JSON');
  });

  it('a missing file and an unexpected file', () => {
    const raw: Record<string, string> = { ...readRaw(TEST_PACK) };
    delete raw['modes.json'];
    expectRefused(raw, 'modes.json', '', 'missing');
    expectRefused({ ...readRaw(TEST_PACK), 'extra.json': '{}' }, 'extra.json', '', 'Not a pack file');
  });

  it('reports every problem at once, not just the first', () => {
    const issues = expectRefused(
      bad((f) => {
        f['settings.json'].tailwindDryKt.value = 500;
        f['modes.json'].modes[0].arrivals = ['99'];
        f['runways.json'].runways[0].headingDegrees = 'north';
      }),
      'settings.json',
      'tailwindDryKt.value',
    );
    expect(issues.map((i) => i.file)).toContain('runways.json');
  });
});

describe('forbidden keys (SEC-3)', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    it(`rejects "${key}" at the top level, nested, and inside an array`, () => {
      const top = readRaw(TEST_PACK);
      top['airport.json'] = top['airport.json'].replace('{', `{ "${key}": {},`);
      expectRefused(top, 'airport.json', key, 'not allowed');

      const nested = readRaw(TEST_PACK);
      nested['settings.json'] = nested['settings.json'].replace('"tailwindDryKt": {', `"tailwindDryKt": { "${key}": 1,`);
      expectRefused(nested, 'settings.json', `tailwindDryKt.${key}`, 'not allowed');

      const inArray = readRaw(TEST_PACK);
      inArray['modes.json'] = inArray['modes.json'].replace('"id": "TST_EAST"', `"${key}": 1, "id": "TST_EAST"`);
      expectRefused(inArray, 'modes.json', `modes[0].${key}`, 'not allowed');
    });
  }

  it('rejects a key hidden by a JSON escape', () => {
    const raw = readRaw(TEST_PACK);
    raw['airport.json'] = raw['airport.json'].replace('{', '{ "\\u005f_proto__": 1,');
    expectRefused(raw, 'airport.json', '__proto__', 'not allowed');
  });

  it('rejects the key even inside a _ note, which would otherwise be stripped', () => {
    const raw = readRaw(TEST_PACK);
    raw['airport.json'] = raw['airport.json'].replace('{', '{ "_note": { "__proto__": 1 },');
    expectRefused(raw, 'airport.json', '_note.__proto__', 'not allowed');
  });

  it('a pack that carried the key leaves Object.prototype untouched', () => {
    const raw = readRaw(TEST_PACK);
    raw['airport.json'] = raw['airport.json'].replace('{', '{ "__proto__": { "polluted": true },');
    expect(() => parsePack(raw)).toThrow(PackValidationError);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('size and depth caps (SEC-3)', () => {
  it('refuses a pack file over 256 KB before parsing it', () => {
    expect(BOUNDS.cap.packFileBytes).toBe(256 * 1024);
    const raw = readRaw(TEST_PACK);
    raw['modes.json'] = JSON.stringify({ schemaVersion: 1, pad: 'x'.repeat(BOUNDS.cap.packFileBytes), modes: [] });
    expectRefused(raw, 'modes.json', '', 'larger than the 262144 byte limit');
  });

  it('counts bytes, not characters', () => {
    const raw = readRaw(TEST_PACK);
    // 100,000 characters of 3 bytes each is over the cap although the character count is under it
    raw['modes.json'] = '"' + '€'.repeat(100000) + '"';
    expectRefused(raw, 'modes.json', '', 'larger');
  });

  it('accepts a file just under the cap', () => {
    const files = readJson(TEST_PACK);
    files['modes.json']._pad = 'x'.repeat(BOUNDS.cap.packFileBytes - 20000);
    expect(() => parsePack(toRaw(files))).not.toThrow();
  });

  it('refuses nesting deeper than the cap, in raw text, even where the schema would never look', () => {
    const depth = BOUNDS.cap.maxJsonDepth + 2;
    const raw = readRaw(TEST_PACK);
    raw['settings.json'] = raw['settings.json'].replace('{', `{ "_deep": ${'['.repeat(depth)}${']'.repeat(depth)},`);
    expectRefused(raw, 'settings.json', '', 'Nesting is deeper than 10');
  });

  it('is not fooled by brackets inside strings, and survives 100,000 levels without crashing', () => {
    const raw = readRaw(TEST_PACK);
    raw['airport.json'] = raw['airport.json'].replace('"Testfield"', `"${'[{'.repeat(40)}"`);
    expect(() => parsePack(raw)).not.toThrow();
    const huge = readRaw(TEST_PACK);
    huge['modes.json'] = '['.repeat(100000);
    expectRefused(huge, 'modes.json', '', 'Nesting');
  });
});

describe('ranges and caps on every value (SEC-3)', () => {
  it('rejects tailwind 500 and a negative tailwind', () => {
    expectRefused(
      bad((f) => {
        f['settings.json'].tailwindDryKt.value = 500;
      }),
      'settings.json',
      'tailwindDryKt.value',
    );
    expectRefused(
      bad((f) => {
        f['settings.json'].tailwindWetKt.value = -1;
      }),
      'settings.json',
      'tailwindWetKt.value',
    );
  });

  it('puts a range on EVERY numeric tunable: far above and far below are both refused', () => {
    const numeric = SETTING_NAMES.filter((n) => !['precipitationCodes', 'trafficBands'].includes(n));
    expect(numeric.length).toBeGreaterThan(20);
    for (const name of numeric) {
      for (const far of [1e12, -1e12]) {
        const raw = bad((f) => {
          f['settings.json'][name].value = far;
        });
        expectRefused(raw, 'settings.json', `${name}.value`);
      }
    }
    expect(Object.keys(SETTING_VALUE_SCHEMAS)).toHaveLength(SETTING_NAMES.length);
  });

  it('refuses a value that is not a number', () => {
    expectRefused(
      bad((f) => {
        f['settings.json'].calmWindKt.value = '3';
      }),
      'settings.json',
      'calmWindKt.value',
    );
    expectRefused(
      bad((f) => {
        f['settings.json'].calmWindKt.value = null;
      }),
      'settings.json',
      'calmWindKt.value',
    );
  });

  it('ranges on airport, runway, mode and plan numbers', () => {
    expectRefused(bad((f) => { f['airport.json'].latitude = 91; }), 'airport.json', 'latitude');
    expectRefused(bad((f) => { f['airport.json'].longitude = -181; }), 'airport.json', 'longitude');
    expectRefused(bad((f) => { f['airport.json'].trafficAreaNm = 0; }), 'airport.json', 'trafficAreaNm');
    expectRefused(bad((f) => { f['runways.json'].runways[0].headingDegrees = 361; }), 'runways.json', 'runways[0].headingDegrees');
    expectRefused(bad((f) => { f['modes.json'].modes[0].maxCrosswindKt = 41; }), 'modes.json', 'modes[0].maxCrosswindKt');
    expectRefused(bad((f) => { f['modes.json'].modes[0].capacity = 0; }), 'modes.json', 'modes[0].capacity');
    expectRefused(bad((f) => { f['modes.json'].modes[0].capacity = 1.5; }), 'modes.json', 'modes[0].capacity');
    expectRefused(bad((f) => { f['operating_plan.json'].bands[0].rows[0].penalty = -1; }), 'operating_plan.json', 'bands[0].rows[0].penalty');
  });

  it('accepts the bounds themselves (inclusive)', () => {
    const files = readJson(TEST_PACK);
    files['settings.json'].tailwindDryKt.value = BOUNDS.range.tailwindKt.max;
    files['settings.json'].tailwindWetKt.value = BOUNDS.range.tailwindKt.min;
    files['runways.json'].runways[0].headingDegrees = 360;
    expect(parsePack(toRaw(files)).settings.tailwindDryKt).toBe(15);
  });

  it('string and array length caps', () => {
    expectRefused(bad((f) => { f['airport.json'].name = 'x'.repeat(BOUNDS.cap.nameChars + 1); }), 'airport.json', 'name');
    expectRefused(bad((f) => { f['airport.json'].name = ''; }), 'airport.json', 'name');
    expectRefused(
      bad((f) => { f['settings.json'].calmWindKt.description = 'x'.repeat(BOUNDS.cap.descriptionChars + 1); }),
      'settings.json',
      'calmWindKt.description',
    );
    expectRefused(
      bad((f) => { f['modes.json'].modes[0].source = 'x'.repeat(BOUNDS.cap.sourceChars + 1); }),
      'modes.json',
      'modes[0].source',
    );
    expectRefused(
      bad((f) => {
        f['settings.json'].precipitationCodes.value = Array.from({ length: BOUNDS.cap.maxPrecipitationCodes + 1 }, () => 'RA');
      }),
      'settings.json',
      'precipitationCodes.value',
    );
    expectRefused(
      bad((f) => {
        f['modes.json'].modes = Array.from({ length: BOUNDS.cap.maxModes + 1 }, (_, i) => ({ id: `M${i}`, enabled: false, arrivals: [], departures: [] }));
        for (const b of f['operating_plan.json'].bands) b.rows = [];
      }),
      'modes.json',
      'modes',
    );
    expectRefused(
      bad((f) => {
        f['airport.json'].labels = Object.fromEntries(Array.from({ length: BOUNDS.cap.maxLabels + 1 }, (_, i) => [`k${i}`, 'v']));
      }),
      'airport.json',
      'labels',
    );
  });

  it('shape rules: times, zone, ids, names, status, code', () => {
    expectRefused(bad((f) => { f['operating_plan.json'].bands[0].start = '24:00'; }), 'operating_plan.json', 'bands[0].start');
    expectRefused(bad((f) => { f['operating_plan.json'].bands[0].start = '6:30'; }), 'operating_plan.json', 'bands[0].start');
    expectRefused(bad((f) => { f['airport.json'].timeZone = 'Mars/Olympus'; }), 'airport.json', 'timeZone');
    expectRefused(bad((f) => { f['airport.json'].timeZone = '+05:30'; }), 'airport.json', 'timeZone');
    expectRefused(bad((f) => { f['modes.json'].modes[0].id = 'has space'; }), 'modes.json', 'modes[0].id');
    expectRefused(bad((f) => { f['runways.json'].runways[0].name = '<b>'; }), 'runways.json', 'runways[0].name');
    expectRefused(bad((f) => { f['modes.json'].modes[0].status = 'official'; }), 'modes.json', 'modes[0].status');
    expectRefused(bad((f) => { f['airport.json'].icao = 'te'; }), 'airport.json', 'icao');
  });
});
