// Traffic level from the pack's bands (TR-4). Bands are movements per 30
// minutes, inclusive; a null upper end is open. The pack validator guarantees
// light, medium and busy are contiguous from 0.
import type { TrafficLevel } from '../engine/inputs';
import type { AirportPack } from '../refdata';

const RANK: Record<TrafficLevel, number> = { light: 0, medium: 1, busy: 2 };

function levelOf(pack: AirportPack, count: number): TrafficLevel | null {
  if (!Number.isInteger(count) || count < 0) return null;
  const { light, medium, busy } = pack.settings.trafficBands;
  const inside = (band: readonly (number | null)[]): boolean => {
    const [low, high] = band;
    return low !== undefined && low !== null && count >= low && (high === null || high === undefined || count <= high);
  };
  if (inside(busy)) return 'busy';
  if (inside(medium)) return 'medium';
  if (inside(light)) return 'light';
  return null;
}

/**
 * Classifies arrivals and departures separately and returns the higher level.
 * A null count is unknown and does not take part; null when neither is known.
 */
export function classifyLevel(pack: AirportPack, arrivals: number | null, departures: number | null): TrafficLevel | null {
  const levels = [arrivals, departures]
    .map((n) => (n === null ? null : levelOf(pack, n)))
    .filter((l): l is TrafficLevel => l !== null);
  if (levels.length === 0) return null;
  return levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a));
}
