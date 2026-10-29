// The real-world runway mode chip (issue 159). Pure: the last good ATIS reading, the
// pack (its wording and modes) and the time in, a chip or null out. Null (chip hidden)
// when there is no reading, the ATIS text does not parse, or the reading is older than
// ATIS_STALE_MINUTES: an old result is never shown as current. No airport fact is written here.
import { ATIS_STALE_MINUTES } from '../../atis/config';
import { matchMode, rawRunwayText } from '../../atis/matchMode';
import { parseAtisRunways } from '../../atis/parseAtis';
import type { AirportPack } from '../../refdata';
import type { AtisReading } from '../controller';

export interface AtisChip {
  /** What the chip shows: "RW: <mode id>", or "RW: 34L arr, 16R dep" when no mode matches. */
  readonly text: string;
  /** The words for assistive technology. */
  readonly label: string;
  /** True when the runways matched one of the pack's modes. */
  readonly matched: boolean;
}

export function atisChip(reading: AtisReading | null, pack: AirportPack, nowMs: number): AtisChip | null {
  if (reading === null) return null;
  if (nowMs - reading.fetchedAtMs > ATIS_STALE_MINUTES * 60_000) return null;
  const parsed = parseAtisRunways(reading.text, pack.atisWording);
  if (parsed === null) return null;
  const id = matchMode(parsed, pack.modes);
  if (id !== null) return { text: `RW: ${id}`, label: `Real-world runway mode now: ${id}`, matched: true };
  const raw = rawRunwayText(parsed);
  return { text: `RW: ${raw}`, label: `Real-world runway mode now: ${raw}`, matched: false };
}
