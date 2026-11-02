import { describe, expect, test } from 'vitest';
import { buildRoute, buildSummaryRoute, parseRoute } from '../../src/v2/route';

describe('parseRoute', () => {
  test('empty hash has no airport and no detail', () => {
    expect(parseRoute('')).toEqual({ icao: null, detail: false, summary: false });
    expect(parseRoute('#')).toEqual({ icao: null, detail: false, summary: false });
    expect(parseRoute('#/')).toEqual({ icao: null, detail: false, summary: false });
  });

  test('reads an airport code', () => {
    expect(parseRoute('#/YSSY')).toEqual({ icao: 'YSSY', detail: false, summary: false });
  });

  test('is case-insensitive', () => {
    expect(parseRoute('#/yssy')).toEqual({ icao: 'YSSY', detail: false, summary: false });
  });

  test('reads the detail segment', () => {
    expect(parseRoute('#/YSSY/detail')).toEqual({ icao: 'YSSY', detail: true, summary: false });
    expect(parseRoute('#/YSSY/DETAIL')).toEqual({ icao: 'YSSY', detail: true, summary: false });
  });

  test('an unrecognised second segment is ignored, not an error', () => {
    expect(parseRoute('#/YSSY/whatever')).toEqual({ icao: 'YSSY', detail: false, summary: false });
  });

  test('a code of the wrong shape is not an airport', () => {
    expect(parseRoute('#/XX')).toEqual({ icao: null, detail: false, summary: false });
    expect(parseRoute('#/this-has-no-airport-shape')).toEqual({ icao: null, detail: false, summary: false });
  });

  test('parses #/summary as the summary screen', () => {
    expect(parseRoute('#/summary')).toEqual({ icao: null, detail: false, summary: true });
    expect(parseRoute('#/summary/anything')).toEqual({ icao: null, detail: false, summary: true });
  });

  test('parses #/summary case-insensitively', () => {
    expect(parseRoute('#/SUMMARY')).toEqual({ icao: null, detail: false, summary: true });
    expect(parseRoute('#/Summary')).toEqual({ icao: null, detail: false, summary: true });
  });

  test('still parses #/YSSY and #/YSSY/detail unchanged', () => {
    expect(parseRoute('#/YSSY')).toEqual({ icao: 'YSSY', detail: false, summary: false });
    expect(parseRoute('#/YSSY/detail')).toEqual({ icao: 'YSSY', detail: true, summary: false });
  });

  test('extra slashes are tolerated', () => {
    expect(parseRoute('#//YSSY//detail//')).toEqual({ icao: 'YSSY', detail: true, summary: false });
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
    expect(parseRoute(buildRoute('YMML', true))).toEqual({ icao: 'YMML', detail: true, summary: false });
  });
});

describe('buildSummaryRoute', () => {
  test('is #/summary', () => {
    expect(buildSummaryRoute()).toBe('#/summary');
  });
});
