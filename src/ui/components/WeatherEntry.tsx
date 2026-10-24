// Weather entry (UI_DESIGN section 5, WX-1, WX-3, OD-28, OD-30, OD-37): two text
// boxes, each with an Apply button. The page fetches both reports by itself and
// fills a box with the fetched text; pasting over it and pressing Apply is the
// override. The decision to accept a report is made by the caller (the decode
// adapter); a refused report leaves the previous one in use and shows a plain
// message here.
import { useState } from 'react';
import type { AirportPack } from '../../refdata';
import type { DecodedMetar, DecodedTaf } from '../../weather';
import { WEATHER_CREDIT } from '../../weather/config';
import type { AutoReportState, WeatherKind } from '../controller';
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
  readonly auto: Readonly<Record<WeatherKind, AutoReportState>>;
  readonly onResumeAutomatic: (kind: WeatherKind) => void;
}

interface BoxProps {
  readonly id: string;
  readonly label: string;
  readonly rows: number;
  readonly note: string;
  readonly inUse: string | null;
  readonly auto: AutoReportState;
  /** The paste box and Apply button are an option, hidden until asked for (OD-37). */
  readonly showPaste: boolean;
  readonly onApply: (text: string) => ApplyOutcome;
  readonly onResume: () => void;
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

/** Where the report in use came from, and how the last automatic fetch went. */
function SourceNote({ id, label, auto, onResume }: { id: string; label: string; auto: AutoReportState; onResume: () => void }) {
  return (
    <>
      {auto.source === 'automatic' ? <div className="age" data-testid={`${id}-source`}>Fetched automatically.</div> : null}
      {auto.paused ? (
        <div className="age" data-testid={`${id}-source`}>
          Pasted by you; automatic {label} updates are paused.{' '}
          <button type="button" className="btn small-btn" onClick={onResume}>Resume automatic</button>
        </div>
      ) : null}
      {auto.error === null ? null : <div className="refused" role="alert" data-testid={`${id}-fetch-error`}>{auto.error} The previous {label}, if any, stays in use.</div>}
      {auto.warnings.length === 0 ? null : (
        <ul className="warnings">
          {auto.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </>
  );
}

function Box({ id, label, rows, note, inUse, auto, showPaste, onApply, onResume }: BoxProps) {
  const [text, setText] = useState('');
  const [outcome, setOutcome] = useState<ApplyOutcome | null>(null);
  return (
    <div className="wxbox">
      <label htmlFor={showPaste ? id : undefined}>{label}</label>
      <div>
        {showPaste ? <textarea id={id} rows={rows} spellCheck={false} autoComplete="off" placeholder={`Paste your own ${label} here`} value={text} onChange={(e) => setText(e.target.value)} aria-describedby={`${id}-note`} /> : null}
        <div className="age" id={`${id}-note`}>{note}</div>
        {inUse === null ? null : <div className="mono" data-testid={`${id}-in-use`}>{inUse}</div>}
        <SourceNote id={id} label={label} auto={auto} onResume={onResume} />
        {outcome === null ? null : <ApplyNote outcome={outcome} />}
      </div>
      {showPaste ? <button type="button" className="btn" onClick={() => setOutcome(onApply(text))}>Apply</button> : <span />}
    </div>
  );
}

export function WeatherEntry({ pack, metar, taf, displayNowMs, onApplyMetar, onApplyTaf, auto, onResumeAutomatic }: WeatherEntryProps) {
  const tz = pack.airport.timeZone;
  const nothing = metar === null && taf === null;
  const [showPaste, setShowPaste] = useState(false);
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
        The METAR and TAF for {pack.airport.weatherStation} are fetched automatically every {pack.settings.weatherPollMinutes} minutes. Reports are not stored.
        {nothing ? <b className="nowx"> No weather entered.</b> : null}{' '}
        {showPaste ? 'Pasting a report replaces the fetched one and pauses automatic updates for it until you press Resume automatic. ' : null}
        <button type="button" className="btn small-btn" aria-expanded={showPaste} onClick={() => setShowPaste(!showPaste)}>{showPaste ? 'Hide paste boxes' : 'Use my own weather'}</button>
      </div>
      <Box id="wx-metar" label="METAR" rows={2} note={metarNote} inUse={metar === null ? null : metar.raw} auto={auto.metar} showPaste={showPaste} onApply={onApplyMetar} onResume={() => onResumeAutomatic('metar')} />
      <Box id="wx-taf" label="TAF" rows={3} note={tafNote} inUse={taf === null ? null : taf.raw} auto={auto.taf} showPaste={showPaste} onApply={onApplyTaf} onResume={() => onResumeAutomatic('taf')} />
      <div className="small credit">{WEATHER_CREDIT}</div>
    </section>
  );
}
