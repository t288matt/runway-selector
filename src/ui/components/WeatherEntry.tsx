// Weather entry (UI_DESIGN section 5, WX-1, WX-3, OD-28, OD-30): two text boxes
// that start empty on every visit, each with an Apply button. The decision to
// accept a report is made by the caller (the decode adapter); a refused report
// leaves the previous one in use and shows a plain message here.
import { useState } from 'react';
import type { AirportPack } from '../../refdata';
import type { DecodedMetar, DecodedTaf } from '../../weather';
import { ageText, utcAndLocal } from '../format';
import { freshness } from '../model/dashboard';

export interface ApplyOutcome {
  readonly ok: boolean;
  /** Why the report was refused, or null. */
  readonly message: string | null;
  /** Things the decoder noticed in a report that was still usable. */
  readonly warnings: readonly string[];
}

export interface WeatherEntryProps {
  readonly pack: AirportPack;
  readonly metar: DecodedMetar | null;
  readonly taf: DecodedTaf | null;
  readonly displayNowMs: number;
  readonly onApplyMetar: (text: string) => ApplyOutcome;
  readonly onApplyTaf: (text: string) => ApplyOutcome;
}

interface BoxProps {
  readonly id: string;
  readonly label: string;
  readonly rows: number;
  readonly note: string;
  readonly inUse: string | null;
  readonly onApply: (text: string) => ApplyOutcome;
}

/** The refusal message and the decoder's warnings, as plain text (SEC-2). */
export function ApplyNote({ outcome }: { outcome: ApplyOutcome }) {
  return (
    <>
      {outcome.message === null ? null : <div className="refused" role="alert">{outcome.message}</div>}
      {outcome.warnings.length === 0 ? null : (
        <ul className="warnings">
          {outcome.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function Box({ id, label, rows, note, inUse, onApply }: BoxProps) {
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);
  return (
    <div className="wxbox">
      <label htmlFor={id}>{label}</label>
      <div>
        <textarea id={id} rows={rows} spellCheck={false} autoComplete="off" placeholder={`Paste the latest ${label} here`} value={text} onChange={(e) => setText(e.target.value)} aria-describedby={`${id}-note`} />
        <div className="age" id={`${id}-note`}>{note}</div>
        {inUse === null ? null : <div className="mono" data-testid={`${id}-in-use`}>{inUse}</div>}
        {outcome === null ? null : <ApplyNote outcome={outcome} />}
      </div>
      <button type="button" className="btn" onClick={() => setOutcome(onApply(text))}>Apply</button>
    </div>
  );
}

export function WeatherEntry({ pack, metar, taf, displayNowMs, onApplyMetar, onApplyTaf }: WeatherEntryProps) {
  const tz = pack.airport.timeZone;
  const nothing = metar === null && taf === null;
  let metarNote = `Station ${pack.airport.weatherStation}. No METAR entered.`;
  if (metar !== null) {
    const f = freshness(displayNowMs, metar.observedAtMs, pack.settings.metarStaleMinutes);
    metarNote = `Observed ${utcAndLocal(metar.observedAtMs, tz)}, ${ageText(f.ageMinutes)} old${f.stale ? ' (stale)' : ''}. Taken from the time group in the report.`;
  }
  let tafNote = `Station ${pack.airport.weatherStation}. No TAF entered.`;
  if (taf !== null) {
    const f = freshness(displayNowMs, taf.issuedAtMs, pack.settings.tafStaleMinutes);
    tafNote = `Issued ${utcAndLocal(taf.issuedAtMs, tz)}${f.stale ? ' (stale)' : ''}, valid ${utcAndLocal(taf.validFromMs, tz)} to ${utcAndLocal(taf.validToMs, tz)}.`;
  }
  return (
    <section className="wxtop" aria-label="Raw METAR and TAF">
      <div className="small">
        Paste the latest METAR and TAF, then press Apply. Reports are not stored.
        {nothing ? <b className="nowx"> No weather entered.</b> : null}
      </div>
      <Box id="wx-metar" label="METAR" rows={2} note={metarNote} inUse={metar === null ? null : metar.raw} onApply={onApplyMetar} />
      <Box id="wx-taf" label="TAF" rows={3} note={tafNote} inUse={taf === null ? null : taf.raw} onApply={onApplyTaf} />
    </section>
  );
}
