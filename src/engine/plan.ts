// Operating-plan band lookup (DESIGN section 5, REQUIREMENTS AG-5). The band
// is found from the LOCAL wall time of the slot start in the pack's time zone.
// Band start is inclusive, end exclusive; a band can cross midnight; an allDay
// band covers every minute. Zones with half-hour offsets work because the wall
// time is read from the zone, not computed from a fixed offset.
import { bandContains, MINUTES_PER_DAY } from '../refdata/planTime';
import type { AirportPack, PlanBand } from '../refdata/types';

/** Minute of the local day (0 to 1439) of a UTC instant in the given IANA zone. */
export function makeLocalMinuteReader(timeZone: string): (utcMs: number) => number {
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
  return (utcMs: number): number => {
    let hour = 0;
    let minute = 0;
    for (const part of formatter.formatToParts(utcMs)) {
      if (part.type === 'hour') hour = Number(part.value);
      else if (part.type === 'minute') minute = Number(part.value);
    }
    return ((hour % 24) * 60 + minute) % MINUTES_PER_DAY;
  };
}

// A slot belongs to a band by the local wall time of its START (DESIGN section 5a). In zones with
// 45-minute offsets a 30-minute slot can straddle two bands; it is judged by its start, by design.
/** Returns a function from a slot start (UTC ms) to the band that applies, or null if none covers it. */
export function makeBandFinder(pack: AirportPack): (startMs: number) => PlanBand | null {
  const localMinute = makeLocalMinuteReader(pack.airport.timeZone);
  return (startMs: number): PlanBand | null => {
    const minute = localMinute(startMs);
    for (const band of pack.plan) {
      if (band.allDay || bandContains(band.startMinute, band.endMinute, minute)) return band;
    }
    return null;
  };
}
