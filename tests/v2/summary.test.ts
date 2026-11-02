// The summary state across airports: ten real packs served from disk by a fake
// network, a fake clock and fake timers. No React, no real time.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FetchLike } from '../../src/refdata';
import { createMemoryStore } from '../../src/store';
import { VATSIM_FEED_URL } from '../../src/traffic/config';
import { createSummary, type SummaryEntry } from '../../src/v2/summary';
import { summaryCard } from '../../src/v2/model/summaryCard';
import type { Timers } from '../../src/v2/controller';
import { loadPackFrom } from '../helpers/packs';
import { fixture, nowOf } from '../weather/helpers';
import { rig } from './rig';

const root = resolve(import.meta.dirname, '..', '..');
const AIRPORTS = ['YSSY', 'YMML', 'YBBN', 'YPPH', 'YPAD', 'YSWS', 'YSCB', 'YBCS', 'YBTL', 'YPDN'] as const;
const METAR = fixture('metar-yssy-auto-nodata');
const START = nowOf(METAR);
const packRef = (icao: string): { name: string; dir: string } => ({ name: icao, dir: join(root, 'refdata', 'airports', icao) });

interface Net {
  readonly fetch: FetchLike;
  readonly feedCalls: { n: number };
  /** File paths (under the project root) answered with a 404. */
  readonly missing: Set<string>;
  /** Station -> raw METAR; stations not listed have their weather services down. */
  readonly metars: Map<string, string>;
}

function feedBody(): string {
  const pilots = AIRPORTS.map((icao, i) => {
    const { airport } = loadPackFrom(packRef(icao));
    return { cid: 1000 + i, callsign: `TST${i}`, latitude: airport.latitude, longitude: airport.longitude, altitude: airport.elevationFt ?? 0, groundspeed: 0, flight_plan: { departure: icao, arrival: 'ZZZB' } };
  });
  return JSON.stringify({ general: { update_timestamp: '2026-10-23T14:00:00Z' }, pilots });
}

function net(): Net {
  const feedCalls = { n: 0 };
  const missing = new Set<string>();
  const metars = new Map<string, string>([['YSSY', METAR.raw]]);
  const body = feedBody();
  const fetch: FetchLike = async (url) => {
    if (url.startsWith('https://metar.vatsim.net/')) {
      const raw = metars.get(url.split('?')[0]?.split('/').pop() ?? '');
      return raw === undefined ? new Response('down', { status: 503 }) : new Response(raw);
    }
    if (url.startsWith('https://datamask.org/') || url.startsWith('https://metars.eu/')) return new Response('down', { status: 503 });
    if (url === VATSIM_FEED_URL) {
      feedCalls.n += 1;
      return new Response(body);
    }
    const path = url.split('?')[0]?.replace(/^\.\//, '') ?? '';
    if (missing.has(path)) return new Response('not found', { status: 404 });
    try {
      return new Response(readFileSync(join(root, path), 'utf8'));
    } catch {
      return new Response('not found', { status: 404 });
    }
  };
  return { fetch, feedCalls, missing, metars };
}

function fakeTimers(): { timers: Timers; count: () => number } {
  const live = new Set<number>();
  let next = 1;
  return {
    timers: {
      setInterval: () => {
        const id = next++;
        live.add(id);
        return id;
      },
      clearInterval: (h) => void live.delete(h as number),
    },
    count: () => live.size,
  };
}

async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 400 && !done(); i += 1) await new Promise((r) => setTimeout(r, 0));
}
const settledAll = (s: ReturnType<typeof createSummary>): boolean => s.getState().every((e) => e.status !== 'loading');
const ready = (e: SummaryEntry | undefined): Extract<SummaryEntry, { status: 'ready' }> => {
  if (e?.status !== 'ready') throw new Error(`not ready: ${JSON.stringify(e)}`);
  return e;
};

function make(n: Net = net(), airports: readonly string[] = AIRPORTS) {
  const t = fakeTimers();
  const summary = createSummary({ airports, fetch: n.fetch, now: () => START, store: createMemoryStore(), timers: t.timers });
  return { summary, ...t, n };
}

describe('createSummary', () => {
  it('entries are in the given order and start as loading', () => {
    const { summary } = make();
    expect(summary.getState()).toEqual(AIRPORTS.map((icao) => ({ icao, status: 'loading' })));
  });

  it('a failed pack gives an error entry and the others are ready', async () => {
    const n = net();
    n.missing.add('refdata/airports/YMML/modes.json');
    const { summary } = make(n);
    summary.start();
    await until(() => settledAll(summary));
    const state = summary.getState();
    expect(state.map((e) => e.icao)).toEqual([...AIRPORTS]);
    const bad = state[1];
    expect(bad?.status).toBe('error');
    expect(bad?.status === 'error' && bad.message).toContain('modes.json');
    expect(state.filter((e) => e.status === 'ready')).toHaveLength(9);
    summary.stop();
  });

  it('a failed weather fetch gives a noReport card, others unaffected', async () => {
    const { summary } = make();
    summary.start();
    await until(() => settledAll(summary));
    await until(() => !ready(summary.getState()[0]).card.noReport);
    expect(ready(summary.getState()[0]).card.noReport).toBe(false);
    expect(ready(summary.getState()[1]).card.noReport).toBe(true);
    summary.stop();
  });

  it('one VATSIM URL fetch for ten airports in one poll', async () => {
    const n = net();
    const { summary } = make(n);
    summary.start();
    await until(() => settledAll(summary));
    await until(() => n.feedCalls.n > 0);
    await new Promise((r) => setTimeout(r, 20));
    expect(n.feedCalls.n).toBe(1);
    summary.stop();
  });

  it('stop clears every timer (none left registered)', async () => {
    const { summary, count } = make();
    summary.start();
    await until(() => settledAll(summary));
    expect(count()).toBe(30);
    summary.stop();
    expect(count()).toBe(0);
  });

  it('results arriving after stop are ignored and register no timers', async () => {
    const { summary, count } = make();
    summary.start();
    summary.stop();
    await new Promise((r) => setTimeout(r, 50));
    expect(count()).toBe(0);
    expect(summary.getState().every((e) => e.status === 'loading')).toBe(true);
  });

  it('notifies subscribers when entries change, and not after unsubscribing', async () => {
    const { summary } = make();
    let calls = 0;
    const off = summary.subscribe(() => (calls += 1));
    summary.start();
    await until(() => settledAll(summary));
    expect(calls).toBeGreaterThan(0);
    off();
    const seen = calls;
    summary.stop();
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toBe(seen);
  });

  it('a ready card equals what a single createController gives for that airport on the same fakes', async () => {
    const n = net();
    const { summary } = make(n);
    summary.start();
    await until(() => settledAll(summary));
    await until(() => !ready(summary.getState()[0]).card.noReport);
    await new Promise((r) => setTimeout(r, 20));
    const single = rig(loadPackFrom(packRef('YSSY')), START);
    single.wx.metar = METAR.raw;
    single.ctrl.start();
    await single.advance(0);
    expect(ready(summary.getState()[0]).card).toEqual(summaryCard(single.ctrl.getState()));
    single.ctrl.stop();
    summary.stop();
  });
});
