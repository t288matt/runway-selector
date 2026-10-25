// The demand model (DESIGN section 7, owner decisions 23-10-2026; OD-19, OD-22,
// TR-2, TR-3, TR-7). Pure: the clock and the aircraft are passed in, and every
// airport value is read from the pack. Each aircraft is counted at most once.
import type { TrafficLevel, TrafficSlot } from '../engine/inputs';
import type { AirportPack } from '../refdata';
import { SLOT_MINUTES } from './config';
import { classifyLevel } from './level';
import type { Aircraft, Prefile } from './parseFeed';

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
/** Mean Earth radius in nautical miles (a physical constant, not airport data). */
const EARTH_RADIUS_NM = 3440.065;

export interface DemandSummary {
  /**
   * True when the pack gives no airport elevation. The "on the ground at the
   * airport" test then skips its altitude check (distance and groundspeed only),
   * so a slow aircraft overhead is counted as a departure. The dashboard MUST
   * show this as a visible warning next to the departure count.
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
  /** Prefiles counted as departures in the next slot (the one after the slot containing now). */
  readonly prefileDepartures: number;
  /** Prefiles counted as arrivals in the next slot. */
  readonly prefileArrivals: number;
  /** Per slot: arrivals plus departures where arrivals are known (missing departures count as zero), else null. */
  readonly movementsPerSlot: readonly (number | null)[];
  /** Per slot: the traffic level (higher of arrivals and departures), or null when unknown. */
  readonly levels: readonly (TrafficLevel | null)[];
}

export interface DemandInput {
  readonly pack: AirportPack;
  readonly nowMs: number;
  readonly aircraft: readonly Aircraft[];
  /** Filed plans not yet connected. They count only in the next slot (owner, 25-10-2026). */
  readonly prefiles?: readonly Prefile[];
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

const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * The instant a UTC time of day (minutes after 00:00, may exceed a day for a plan that ends after midnight) falls
 * nearest to now: the same day, the day before or the day after, whichever is closest.
 */
export function nearestUtc(nowMs: number, minuteOfDay: number): number {
  const dayStart = Math.floor(nowMs / MS_PER_DAY) * MS_PER_DAY;
  const at = dayStart + minuteOfDay * MS_PER_MINUTE;
  return [at - MS_PER_DAY, at, at + MS_PER_DAY].reduce((best, t) => (Math.abs(t - nowMs) < Math.abs(best - nowMs) ? t : best));
}

export function buildTrafficSlots(input: DemandInput): DemandResult {
  const { pack, nowMs, aircraft, slotStartsMs } = input;
  const prefiles = input.prefiles ?? [];
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

  // Prefiles: counted in the next slot only, never the current one (owner, 25-10-2026). The time is the filed departure
  // (from here) or the filed departure plus time en route (to here), nearest to now. They are not connected, so they
  // are not in connectedArrivals or connectedDepartures.
  const nextStart = slotStartsMs[1];
  let prefileDepartures = 0;
  let prefileArrivals = 0;
  if (nextStart !== undefined && known[1]) {
    const inNext = (t: number): boolean => t >= nextStart && t < nextStart + slotMs;
    for (const p of prefiles) {
      if (p.departure === icao && inNext(nearestUtc(nowMs, p.departureMinuteOfDay))) prefileDepartures += 1;
      // A plan from here to here is one movement, counted as the departure only.
      if (p.arrival === icao && p.departure !== icao && inNext(nearestUtc(nowMs, p.departureMinuteOfDay + p.enrouteMinutes))) prefileArrivals += 1;
    }
    arrivals[1] = (arrivals[1] ?? 0) + prefileArrivals;
  }

  const slots: TrafficSlot[] = slotStartsMs.map((startMs, i) => ({
    startMs,
    arrivals: known[i] ? (arrivals[i] ?? 0) : null,
    // The next slot's departures are known only when the feed carries prefiles; with none, they stay unknown (not zero).
    departures: i === 0 ? departures : i === 1 && known[1] && prefiles.length > 0 ? prefileDepartures : null,
  }));

  return {
    slots,
    summary: {
      elevationMissing,
      connectedDepartures: departures,
      connectedArrivals,
      groundElsewhere: n,
      prefileDepartures,
      prefileArrivals,
      arrivalsBeyondHorizon,
      movementsPerSlot: slots.map((s) => (s.arrivals === null ? null : s.arrivals + (s.departures ?? 0))),
      levels: slots.map((s) => classifyLevel(pack, s.arrivals, s.departures)),
    },
  };
}
