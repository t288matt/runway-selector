// A v2 controller on a fake clock, fake timers and a fake network: no React, no
// real time. The weather services and the VATSIM feed are answered from `wx` and
// `feed`; by default the weather services are down.
import type { AirportPack } from '../../src/refdata';
import { createMemoryStore, type Store } from '../../src/store';
import { createController, type Controller, type Timers } from '../../src/v2/controller';

export interface WeatherRig {
  metar: string | null;
  datamask: string | null;
  readonly urls: string[];
}

export interface Rig {
  readonly wx: WeatherRig;
  readonly ctrl: Controller;
  readonly clock: { now: number };
  readonly calls: { n: number };
  readonly feed: { parked: number; fail: boolean };
  readonly store: Store;
  readonly timerCount: () => number;
  advance: (ms: number) => Promise<void>;
}

export function feedBody(pack: AirportPack, parked: number): string {
  const pilots = Array.from({ length: parked }, (_v, i) => ({
    cid: 1000 + i,
    callsign: `TST${i}`,
    latitude: pack.airport.latitude,
    longitude: pack.airport.longitude,
    altitude: pack.airport.elevationFt ?? 0,
    groundspeed: 0,
    flight_plan: { departure: pack.airport.icao, arrival: 'ZZZB' },
  }));
  return JSON.stringify({ general: { update_timestamp: '2026-10-23T14:00:00Z' }, pilots });
}

export const datamaskBody = (pack: AirportPack, raw: string): string => JSON.stringify({ icao: pack.airport.weatherStation, raw });

export function rig(pack: AirportPack, start: number, store: Store = createMemoryStore()): Rig {
  const clock = { now: start };
  const calls = { n: 0 };
  const feed = { parked: 1, fail: false };
  const wx: WeatherRig = { metar: null, datamask: null, urls: [] };
  const timers: { id: number; every: number; due: number; fn: () => void }[] = [];
  let nextId = 1;
  const fake: Timers = {
    setInterval: (fn, ms) => {
      const id = nextId++;
      timers.push({ id, every: ms, due: clock.now + ms, fn });
      return id;
    },
    clearInterval: (h) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
  };
  const answer = (which: 'metar' | 'datamask', url: string): Response => {
    wx.urls.push(url);
    const body = wx[which];
    return body === null ? new Response('down', { status: 503 }) : new Response(body);
  };
  const ctrl = createController({
    pack,
    now: () => clock.now,
    timers: fake,
    store,
    fetch: async (url) => {
      if (url.startsWith('https://metar.vatsim.net/')) return answer('metar', url);
      if (url.startsWith('https://datamask.org/')) return answer('datamask', url);
      if (url.startsWith('https://metars.eu/')) return new Response('down', { status: 503 });
      calls.n += 1;
      if (feed.fail) throw new Error('network down');
      return new Response(feedBody(pack, feed.parked));
    },
  });
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i += 1) {
      await ctrl.settled();
      await Promise.resolve();
    }
  };
  const advance = async (ms: number): Promise<void> => {
    const target = clock.now + ms;
    for (;;) {
      const due = timers.filter((t) => t.due <= target).sort((a, b) => a.due - b.due)[0];
      if (due === undefined) break;
      clock.now = Math.max(clock.now, due.due);
      due.due += due.every;
      due.fn();
      await settle();
    }
    clock.now = target;
    await settle();
  };
  return { ctrl, clock, calls, feed, wx, store, advance, timerCount: () => timers.length };
}
