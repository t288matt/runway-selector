// Shared helpers for the traffic tests. Positions are built relative to the
// pack's own airport coordinates, so nothing here is tied to one airport.
import type { AirportPack } from '../../src/refdata';
import type { Aircraft } from '../../src/traffic/parseFeed';

const EARTH_RADIUS_NM = 3440.065;
export const MIN = 60_000;
export const SLOT_MS = 30 * MIN;

/** Slot 0 starts here; now is 10 minutes into it. */
export const T0 = Date.UTC(2026, 9, 23, 10, 0, 0);
export const NOW = T0 + 10 * MIN;
/** Ten clock-aligned slots, five hours. With a 240 minute horizon, slots 0 to 7 are known. */
export const SLOT_STARTS: readonly number[] = Array.from({ length: 10 }, (_, i) => T0 + i * SLOT_MS);

/** A point `nm` nautical miles due north of the pack's airport (exact along a meridian). */
export function north(pack: AirportPack, nm: number): { latitude: number; longitude: number } {
  return { latitude: pack.airport.latitude + (nm / EARTH_RADIUS_NM) * (180 / Math.PI), longitude: pack.airport.longitude };
}

export function plan(pack: AirportPack, from: 'here' | 'elsewhere', to: 'here' | 'elsewhere'): { departure: string; arrival: string } {
  return { departure: from === 'here' ? pack.airport.icao : 'ZZZA', arrival: to === 'here' ? pack.airport.icao : 'ZZZB' };
}

export function aircraft(pack: AirportPack, o: { nm: number; altitude?: number; groundspeed: number; from: 'here' | 'elsewhere'; to: 'here' | 'elsewhere' }): Aircraft {
  return { ...north(pack, o.nm), altitude: o.altitude ?? 30000, groundspeed: o.groundspeed, ...plan(pack, o.from, o.to) };
}

/** On the ground at the airport, with a plan from it. */
export function parked(pack: AirportPack, o: Partial<{ nm: number; altitude: number; groundspeed: number; to: 'here' | 'elsewhere' }> = {}): Aircraft {
  return aircraft(pack, {
    nm: o.nm ?? 0.5,
    altitude: o.altitude ?? pack.airport.elevationFt ?? 0,
    groundspeed: o.groundspeed ?? 0,
    from: 'here',
    to: o.to ?? 'elsewhere',
  });
}

/** Airborne, bound for the airport, `nm` away, arriving after nm / groundspeed hours. */
export function inbound(pack: AirportPack, nm: number, groundspeed = 300): Aircraft {
  return aircraft(pack, { nm, groundspeed, from: 'elsewhere', to: 'here' });
}

/** On the ground elsewhere (stationary), bound for the airport. */
export function waiting(pack: AirportPack, nm: number): Aircraft {
  return aircraft(pack, { nm, altitude: 10, groundspeed: 0, from: 'elsewhere', to: 'here' });
}

/** Index of the slot holding time t, or -1. */
export function slotOf(t: number): number {
  return SLOT_STARTS.findIndex((s) => t >= s && t < s + SLOT_MS);
}

export function counts(slots: readonly { arrivals: number | null }[]): (number | null)[] {
  return slots.map((s) => s.arrivals);
}
