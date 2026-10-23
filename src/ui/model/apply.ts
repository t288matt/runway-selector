// Accepting or refusing a pasted report (WX-1, WX-3). The decode adapter decides;
// a report that cannot be read is refused with a plain message and the caller
// keeps its previous report, because `report` is null.
import type { AirportPack } from '../../refdata';
import { decodeMetar, decodeTaf, type DecodedMetar, type DecodedTaf } from '../../weather';
import type { ApplyOutcome } from '../components/WeatherEntry';

export interface Applied<T> {
  readonly outcome: ApplyOutcome;
  /** The report to use from now on, or null when the text was refused (the previous report stays). */
  readonly report: T | null;
}

export function applyMetarText(text: string, pack: AirportPack, nowMs: number): Applied<DecodedMetar> {
  const r = decodeMetar(text, { pack, nowMs });
  if (r.kind === 'ok') return { report: r.report, outcome: { ok: true, message: null, warnings: r.warnings.map((w) => w.message) } };
  if (r.kind === 'none') {
    return { report: null, outcome: { ok: false, message: 'This METAR says there is no report (NIL), so there is nothing to use. The previous report, if any, stays in use.', warnings: [] } };
  }
  return { report: null, outcome: { ok: false, message: r.message, warnings: [] } };
}

export function applyTafText(text: string, pack: AirportPack, nowMs: number): Applied<DecodedTaf> {
  const r = decodeTaf(text, { pack, nowMs });
  if (r.kind === 'ok') return { report: r.report, outcome: { ok: true, message: null, warnings: r.warnings.map((w) => w.message) } };
  if (r.kind === 'none') {
    const why = r.reason === 'cancelled' ? 'This TAF is cancelled' : 'This TAF says there is no report (NIL)';
    return { report: null, outcome: { ok: false, message: `${why}, so there is nothing to use. The previous report, if any, stays in use.`, warnings: [] } };
  }
  return { report: null, outcome: { ok: false, message: r.message, warnings: [] } };
}
