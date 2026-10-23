// Traffic level of a slot (DESIGN section 6D, REQUIREMENTS OP-6, TR-7). The
// bands are pack data: movements per 30 minutes, inclusive, busy is open ended.
// Arrivals and departures are classified separately and the higher level wins.
// An unknown count (null) does not lower the level; if both are unknown the
// level is unknown. Engine-local on purpose; the traffic module has its own
// classifier on another branch and the two are deduplicated later.
import type { AirportPack } from '../refdata/types';
import type { TrafficLevel, TrafficSlot } from './inputs';

const RANK: Readonly<Record<TrafficLevel, number>> = { light: 0, medium: 1, busy: 2 };

/** Level of one count of movements in a 30-minute slot. Fractions fall to the band whose upper end they do not exceed. */
export function levelOfCount(pack: AirportPack, count: number): TrafficLevel {
  const bands = pack.settings.trafficBands;
  const lightTop = bands.light[1] ?? 0;
  const mediumTop = bands.medium[1] ?? 0;
  if (count <= lightTop) return 'light';
  if (count <= mediumTop) return 'medium';
  return 'busy';
}

/** The slot's level, or null when neither count is known. */
export function classifyTraffic(pack: AirportPack, arrivals: number | null, departures: number | null): TrafficLevel | null {
  const levels: TrafficLevel[] = [];
  if (arrivals !== null) levels.push(levelOfCount(pack, arrivals));
  if (departures !== null) levels.push(levelOfCount(pack, departures));
  let best: TrafficLevel | null = null;
  for (const level of levels) {
    if (best === null || RANK[level] > RANK[best]) best = level;
  }
  return best;
}

/** Levels for each weather slot, matching traffic by slot start. Missing traffic is unknown (null). */
export function trafficLevelsFor(pack: AirportPack, slotStarts: readonly number[], traffic: readonly TrafficSlot[]): (TrafficLevel | null)[] {
  const byStart = new Map<number, TrafficSlot>();
  for (const t of traffic) {
    if (!byStart.has(t.startMs)) byStart.set(t.startMs, t);
  }
  return slotStarts.map((start) => {
    const t = byStart.get(start);
    return t === undefined ? null : classifyTraffic(pack, t.arrivals, t.departures);
  });
}
