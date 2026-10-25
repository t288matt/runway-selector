// Helpers for the v2 tests: a v2 ViewData built from the engine rigs (so the same
// scenario runs on every pack) and from the real report fixtures.
import { plan, type EngineInput, type PlanResult, type TrafficLevel } from '../../src/engine';
import type { AirportPack } from '../../src/refdata';
import { calculate, EMPTY_FEED, type FeedState, type ViewData } from '../../src/v2/model/dashboard';
import { BASE, specsFor, trafficFor, type Rig, type Wx } from '../engine/planHelpers';
import { inputFor } from '../engine/helpers';
import { decodeMetarFixture, decodeTafFixture, fixture, nowOf } from '../weather/helpers';
import type { PackRef } from '../helpers/packs';

export function viewFromInput(pack: AirportPack, input: EngineInput): ViewData {
  const result: PlanResult = plan(pack, input);
  const demand =
    input.traffic.length === 0
      ? null
      : {
          slots: input.traffic,
          summary: {
            elevationMissing: false,
            connectedDepartures: 0,
            connectedArrivals: 0,
            groundElsewhere: 0,
            prefileDepartures: 0,
            prefileArrivals: 0,
            arrivalsBeyondHorizon: 0,
            movementsPerSlot: input.traffic.map((t) => (t.arrivals === null ? null : t.arrivals)),
            levels: input.traffic.map(() => null),
          },
        };
  return {
    pack,
    calcNowMs: input.nowMs,
    metar: null,
    taf: null,
    weather: { slots: input.weather, banners: [], metarAgeMinutes: null, tafAgeMinutes: null },
    demand,
    liveDemand: demand,
    result,
    currentMode: result.plan.startModeId,
    windowChoice: 'full',
  };
}

/** A ViewData from an engine scenario: no reports in it. */
export function viewOf(pack: AirportPack, rig: Rig, wx: readonly Wx[], levels: readonly (TrafficLevel | null)[] = [], currentMode: string | null = null): ViewData {
  const traffic: EngineInput['traffic'] = levels.length === 0 ? [] : trafficFor(pack, levels);
  const input: EngineInput = { ...inputFor(BASE, specsFor(rig, wx), traffic), currentMode };
  return viewFromInput(pack, input);
}

const METAR_ID = 'metar-yssy-auto-nodata';
const TAF_ID = 'taf-yssy-multiline-fm-tempo';

/** A ViewData from the real METAR and TAF fixtures (the pack's station must be the fixture's), with or without aircraft. */
export function realView(pack: AirportPack, ref: PackRef, feed: FeedState = EMPTY_FEED, currentMode: string | null = null): ViewData {
  return calculate({
    pack,
    nowMs: nowOf(fixture(TAF_ID)),
    metar: decodeMetarFixture(METAR_ID, ref),
    taf: decodeTafFixture(TAF_ID, ref),
    windowChoice: 'full',
    currentMode,
    feed,
  });
}

export const FIXTURE_STATION = fixture(METAR_ID).station;
export const FIXTURE_NOW = nowOf(fixture(TAF_ID));
