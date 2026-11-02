import { describe, expect, test } from 'vitest';
import { afterSwitch, buildRoute, buildSummary2Route, buildSummaryRoute, hashToShow, parseRoute } from '../../src/v2/route';

describe('parseRoute', () => {
  test('empty hash has no airport and no detail', () => {
    expect(parseRoute('')).toEqual({ icao: null, detail: false, summary: false, large: false });
    expect(parseRoute('#')).toEqual({ icao: null, detail: false, summary: false, large: false });
    expect(parseRoute('#/')).toEqual({ icao: null, detail: false, summary: false, large: false });
  });

  test('reads an airport code', () => {
    expect(parseRoute('#/YSSY')).toEqual({ icao: 'YSSY', detail: false, summary: false, large: false });
  });

  test('is case-insensitive', () => {
    expect(parseRoute('#/yssy')).toEqual({ icao: 'YSSY', detail: false, summary: false, large: false });
  });

  test('reads the detail segment', () => {
    expect(parseRoute('#/YSSY/detail')).toEqual({ icao: 'YSSY', detail: true, summary: false, large: false });
    expect(parseRoute('#/YSSY/DETAIL')).toEqual({ icao: 'YSSY', detail: true, summary: false, large: false });
  });

  test('an unrecognised second segment is ignored, not an error', () => {
    expect(parseRoute('#/YSSY/whatever')).toEqual({ icao: 'YSSY', detail: false, summary: false, large: false });
  });

  test('a code of the wrong shape is not an airport', () => {
    expect(parseRoute('#/XX')).toEqual({ icao: null, detail: false, summary: false, large: false });
    expect(parseRoute('#/this-has-no-airport-shape')).toEqual({ icao: null, detail: false, summary: false, large: false });
  });

  test('parses #/summary as the summary screen', () => {
    expect(parseRoute('#/summary')).toEqual({ icao: null, detail: false, summary: true, large: false });
    expect(parseRoute('#/summary/anything')).toEqual({ icao: null, detail: false, summary: true, large: false });
  });

  test('parses #/summary case-insensitively', () => {
    expect(parseRoute('#/SUMMARY')).toEqual({ icao: null, detail: false, summary: true, large: false });
    expect(parseRoute('#/Summary')).toEqual({ icao: null, detail: false, summary: true, large: false });
  });

  test('parses #/summary2 as the summary with the large size, case-insensitively, with a trailing segment', () => {
    const large = { icao: null, detail: false, summary: true, large: true };
    expect(parseRoute('#/summary2')).toEqual(large);
    expect(parseRoute('#/SUMMARY2')).toEqual(large);
    expect(parseRoute('#/Summary2/anything')).toEqual(large);
    expect(parseRoute('#/summary')).toEqual({ icao: null, detail: false, summary: true, large: false });
  });

  test('still parses #/YSSY and #/YSSY/detail unchanged', () => {
    expect(parseRoute('#/YSSY')).toEqual({ icao: 'YSSY', detail: false, summary: false, large: false });
    expect(parseRoute('#/YSSY/detail')).toEqual({ icao: 'YSSY', detail: true, summary: false, large: false });
  });

  test('extra slashes are tolerated', () => {
    expect(parseRoute('#//YSSY//detail//')).toEqual({ icao: 'YSSY', detail: true, summary: false, large: false });
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
    expect(parseRoute(buildRoute('YMML', true))).toEqual({ icao: 'YMML', detail: true, summary: false, large: false });
  });
});

describe('buildSummaryRoute', () => {
  test('is #/summary', () => {
    expect(buildSummaryRoute()).toBe('#/summary');
  });
});

describe('buildSummary2Route', () => {
  test('is #/summary2 and parses back to the large summary', () => {
    expect(buildSummary2Route()).toBe('#/summary2');
    expect(parseRoute(buildSummary2Route()).large).toBe(true);
  });
});

describe('hashToShow', () => {
  test('is null when the hash already names the view, ignoring case', () => {
    expect(hashToShow('#/YSSY', 'YSSY', false)).toBeNull();
    expect(hashToShow('#/yssy', 'YSSY', false)).toBeNull();
    expect(hashToShow('#/yssy/DETAIL', 'YSSY', true)).toBeNull();
  });
  test('gives the route of the airport shown when the hash differs', () => {
    expect(hashToShow('#/summary', 'YSSY', false)).toBe('#/YSSY');
    expect(hashToShow('#/summary2', 'YSSY', false)).toBe('#/YSSY');
    expect(hashToShow('#/YSCB', 'YSSY', true)).toBe('#/YSSY/detail');
  });
});

describe('afterSwitch', () => {
  const shown = { icao: 'YSSY', detail: false };
  test('success: leave the summary and leave the hash', () => {
    expect(afterSwitch('#/YSCB', true, shown)).toEqual({ leaveSummary: true, replaceHash: null });
  });
  test('failure: leave the summary and put the hash back to the airport shown', () => {
    expect(afterSwitch('#/YSCB', false, shown)).toEqual({ leaveSummary: true, replaceHash: '#/YSSY' });
    expect(afterSwitch('#/YSCB/detail', false, { icao: 'YSSY', detail: true })).toEqual({ leaveSummary: true, replaceHash: '#/YSSY/detail' });
  });
  test('race: the user went back to the summary meanwhile, so it stays and the hash is untouched', () => {
    expect(afterSwitch('#/summary', true, shown)).toEqual({ leaveSummary: false, replaceHash: null });
    expect(afterSwitch('#/summary', false, shown)).toEqual({ leaveSummary: false, replaceHash: null });
    expect(afterSwitch('#/SUMMARY', true, shown)).toEqual({ leaveSummary: false, replaceHash: null });
    expect(afterSwitch('#/summary2', true, shown)).toEqual({ leaveSummary: false, replaceHash: null });
    expect(afterSwitch('#/SUMMARY2', false, shown)).toEqual({ leaveSummary: false, replaceHash: null });
  });
  test('a hash that differs only in case needs no correction after a failure', () => {
    expect(afterSwitch('#/yssy', false, shown)).toEqual({ leaveSummary: true, replaceHash: null });
  });
});
