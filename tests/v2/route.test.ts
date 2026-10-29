import { describe, expect, test } from 'vitest';
import { buildRoute, parseRoute } from '../../src/v2/route';

describe('parseRoute', () => {
  test('empty hash has no airport and no detail', () => {
    expect(parseRoute('')).toEqual({ icao: null, detail: false });
    expect(parseRoute('#')).toEqual({ icao: null, detail: false });
    expect(parseRoute('#/')).toEqual({ icao: null, detail: false });
  });

  test('reads an airport code', () => {
    expect(parseRoute('#/YSSY')).toEqual({ icao: 'YSSY', detail: false });
  });

  test('is case-insensitive', () => {
    expect(parseRoute('#/yssy')).toEqual({ icao: 'YSSY', detail: false });
  });

  test('reads the detail segment', () => {
    expect(parseRoute('#/YSSY/detail')).toEqual({ icao: 'YSSY', detail: true });
    expect(parseRoute('#/YSSY/DETAIL')).toEqual({ icao: 'YSSY', detail: true });
  });

  test('an unrecognised second segment is ignored, not an error', () => {
    expect(parseRoute('#/YSSY/whatever')).toEqual({ icao: 'YSSY', detail: false });
  });

  test('a code of the wrong shape is not an airport', () => {
    expect(parseRoute('#/XX')).toEqual({ icao: null, detail: false });
    expect(parseRoute('#/this-has-no-airport-shape')).toEqual({ icao: null, detail: false });
  });

  test('extra slashes are tolerated', () => {
    expect(parseRoute('#//YSSY//detail//')).toEqual({ icao: 'YSSY', detail: true });
  });
});

describe('buildRoute', () => {
  test('without detail', () => {
    expect(buildRoute('YSSY', false)).toBe('#/YSSY');
  });

  test('with detail', () => {
    expect(buildRoute('YSSY', true)).toBe('#/YSSY/detail');
  });

  test('round-trips through parseRoute', () => {
    expect(parseRoute(buildRoute('YMML', true))).toEqual({ icao: 'YMML', detail: true });
  });
});
