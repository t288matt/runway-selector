// The demand model (DESIGN section 7, owner decisions 23-10-2026; OD-19, OD-22,
// TR-2, TR-3, TR-7). Pure: the clock and the aircraft are passed in, and every
// airport value is read from the pack. Each aircraft is counted at most once.
import type { TrafficLevel, TrafficSlot } from '../engine/inputs';
import type { AirportPack } from '../refdata';
import { SLOT_MINUTES } from './config';
import { classifyLevel } from './level';
import type { Aircraft } from './parseFeed';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
/** Mean Earth radius in nautical miles (a physical constant, not airport data). */
const EARTH_RADIUS_NM = 3440.065;

export type Trend = 'rising' | 'steady' | 'falling';

export interface DemandSummary {
  /**
   * True when the pack gives no airport elevation. The "on the ground at the
   * airport" test then skips its altitude check (distance and groundspeed only).
   */
  readonly elevationMissing: boolean;
  /** Connected departures: aircraft on the ground at the airport with a plan from it. */
  readonly connectedDepartures: number;
  /** Connected arrivals: aircraft bound for the airport and not yet at it (airborne, or on the ground elsewhere). Not movements. */
  readonly connectedArrivals: number;
  /** Of the connected arrivals, how many are on the ground elsewhere (assumed to take off within the departure window). */
  readonly groundElsewhere: number;
  /** Connected arrivals whose estimated arrival falls beyond the known slots (counted nowhere else: demand beyond the horizon is not invented). */
  readonly arrivalsBeyondHorizon: number;
  /** Per slot: arrivals plus departures where arrivals are known (missing departures count as zero), else null. */
  readonly movementsPerSlot: readonly (number | null)[];
  /** Per slot: the traffic level (higher of arrivals and departures), or null when unknown. */
  readonly levels: readonly (TrafficLevel | null)[];
  /**
   * Arrivals in the first half of the known slots compared with the second half
   * (the middle slot of an odd number is left out). Departures are left out
   * because they are known for slot 1 only. null with fewer than two known slots.
   */
  readonly trend: Trend | null;
}

export interface DemandInput {
  readonly pack: AirportPack;
  readonly nowMs: number;
  readonly aircraft: readonly Aircraft[];
  /** Start of each 30-minute slot, in order. The first contains now. */
  readonly slotStartsMs: readonly number[];
}

export interface DemandResult {
  readonly slots: readonly TrafficSlot[];
  readonly summary: DemandSummary;
}

/** Great-circle distance in nautical miles (haversine). */
export function distanceNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

interface GroundElsewhere {
  readonly distance: number;
  readonly order: number;
}

export function buildTrafficSlots(input: DemandInput): DemandResult {
  const { pack, nowMs, aircraft, slotStartsMs } = input;
  const { airport, settings } = pack;
  const slotMs = SLOT_MINUTES * MS_PER_MINUTE;
  const icao = airport.icao.toUpperCase();
  const elevationMissing = airport.elevationFt === null || airport.elevationFt === undefined;
  const horizonEndMs = nowMs + settings.demandHorizonMinutes * MS_PER_MINUTE;

  // A slot's arrivals are known only if the slot lies wholly inside the horizon.
  const known = slotStartsMs.map((start) => start + slotMs <= horizonEndMs);
  const arrivals: number[] = slotStartsMs.map(() => 0);
  let departures = 0;
  let connectedArrivals = 0;
  let arrivalsBeyondHorizon = 0;

  const slotIndexAt = (t: number): number => slotStartsMs.findIndex((start) => t >= start && t < start + slotMs);
  const addArrival = (t: number): void => {
    connectedArrivals += 1;
    const i = slotIndexAt(t);
    if (i >= 0 && known[i]) arrivals[i] = (arrivals[i] ?? 0) + 1;
    else arrivalsBeyondHorizon += 1;
  };

  const elsewhere: GroundElsewhere[] = [];

  aircraft.forEach((a, order) => {
    const distance = distanceNm(airport.latitude, airport.longitude, a.latitude, a.longitude);
    const slow = a.groundspeed < airport.groundMaxSpeedKt;
    const inArea = distance <= airport.trafficAreaNm;
    const altitudeOk = airport.elevationFt === null || airport.elevationFt === undefined || Math.abs(a.altitude - airport.elevationFt) <= airport.groundAltitudeMarginFt;
    const onGroundHere = inArea && slow && altitudeOk;

    if (onGroundHere) {
      // Origin here: a departure. Anything else on the ground here (including a plan that ends here: it has already arrived) is not demand.
      if (a.departure === icao) departures += 1;
      return;
    }
    if (a.arrival !== icao) return; // airborne departures and unrelated traffic are not pending demand
    if (!inArea && slow) {
      elsewhere.push({ distance, order });
      return;
    }
    addArrival(nowMs + (distance / Math.max(a.groundspeed, airport.arrivalSpeedFloorKt)) * MS_PER_HOUR);
  });

  // Ground elsewhere: nearest first, then feed order; the k-th of N (k from 1) leaves at now + window * k / N.
  const n = elsewhere.length;
  const windowMs = settings.assumedDepartureWindowMinutes * MS_PER_MINUTE;
  [...elsewhere]
    .sort((x, y) => x.distance - y.distance || x.order - y.order)
    .forEach((g, index) => {
      const takeOff = nowMs + (windowMs * (index + 1)) / n;
      addArrival(takeOff + (g.distance / settings.assumedGroundSpeedKt) * MS_PER_HOUR);
    });

  const slots: TrafficSlot[] = slotStartsMs.map((startMs, i) => ({
    startMs,
    arrivals: known[i] ? (arrivals[i] ?? 0) : null,
    departures: i === 0 ? departures : null,
  }));

  const knownArrivals = slots.flatMap((s) => (s.arrivals === null ? [] : [s.arrivals]));
  const half = Math.floor(knownArrivals.length / 2);
  const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
  let trend: Trend | null = null;
  if (half >= 1) {
    const first = sum(knownArrivals.slice(0, half));
    const second = sum(knownArrivals.slice(knownArrivals.length - half));
    trend = second > first ? 'rising' : second < first ? 'falling' : 'steady';
  }

  return {
    slots,
    summary: {
      elevationMissing,
      connectedDepartures: departures,
      connectedArrivals,
      groundElsewhere: n,
      arrivalsBeyondHorizon,
      movementsPerSlot: slots.map((s) => (s.arrivals === null ? null : s.arrivals + (s.departures ?? 0))),
      levels: slots.map((s) => classifyLevel(pack, s.arrivals, s.departures)),
      trend,
    },
  };
}
