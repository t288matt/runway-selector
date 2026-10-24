// Header strip, the fixed notice, freshness chips and data notices (UI_DESIGN
// section 4). Every string is a text node (SEC-2).
import { useState, type FormEvent } from 'react';
import { AIRPORT_ID, type AirportPack } from '../../refdata';
import type { Chip, Notice } from '../model/dashboard';

/**
 * SEC-1: the flight-simulation notice is a constant of the application. A pack
 * cannot reword, replace or hide it; it can only add one further line.
 */
export const FLIGHT_SIM_NOTICE = 'Flight simulation only. Never for real-world navigation, flight planning or operations.';

/** The pack label key that carries the optional further line. */
export const EXTRA_NOTICE_LABEL = 'extraNotice';

export function extraNoticeOf(pack: AirportPack | null): string | null {
  const line = pack?.airport.labels[EXTRA_NOTICE_LABEL];
  return line === undefined || line === '' ? null : line;
}

export function appTitle(pack: AirportPack | null): string {
  return pack === null ? 'Runway Mode Planner' : `${pack.airport.name} (${pack.airport.icao}) Runway Mode Planner`;
}

export function NoticeBar({ pack }: { pack: AirportPack | null }) {
  const extra = extraNoticeOf(pack);
  return (
    <div className="notice" role="note">
      <strong>{FLIGHT_SIM_NOTICE}</strong>
      {extra === null ? null : <span className="notice-extra"> {extra}</span>}
    </div>
  );
}

export interface AirportEntryProps {
  readonly icao: string;
  /** Airport ids with a reviewed data pack (app.json), offered as suggestions only; any code can be typed. */
  readonly airports: readonly string[];
  /** Why the last switch was refused, or null. */
  readonly error: string | null;
  readonly onSwitch: (icao: string) => void;
}

/** What is wrong with a typed airport code, or null when it is well formed (OD-37). */
export function icaoProblem(typed: string): string | null {
  return AIRPORT_ID.test(typed) ? null : 'An airport code is 3 to 8 capital letters or digits.';
}

/**
 * The always-visible airport box (OD-37). Typing a code only switches between airports that already have a
 * reviewed data pack; the check against the list, and the message when there is none, is the caller's.
 */
export function AirportEntry({ icao, airports, error, onSwitch }: AirportEntryProps) {
  const [typed, setTyped] = useState(icao);
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const code = typed.trim().toUpperCase();
    setTyped(code);
    const bad = icaoProblem(code);
    setProblem(bad);
    if (bad === null) onSwitch(code);
  };
  const shown = problem ?? error;
  return (
    <form className="airport-entry" onSubmit={submit}>
      <label htmlFor="airport-icao">Airport</label>
      <input
        id="airport-icao"
        type="text"
        value={typed}
        maxLength={8}
        spellCheck={false}
        autoComplete="off"
        list="airport-packs"
        aria-describedby={shown === null ? undefined : 'airport-icao-note'}
        aria-invalid={shown !== null}
        onChange={(e) => {
          setTyped(e.target.value.toUpperCase());
          setProblem(null);
        }}
      />
      <datalist id="airport-packs">
        {airports.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
      <button type="submit" className="btn">Switch</button>
      {shown === null ? null : <span className="strip strip-bad airport-note" id="airport-icao-note" role="alert">{shown}</span>}
    </form>
  );
}

export function Header({ pack, liveTag, onRefresh, onSettings, busy, airport }: { pack: AirportPack | null; liveTag: string; onRefresh: () => void; onSettings: () => void; busy: boolean; airport?: AirportEntryProps }) {
  return (
    <header className="top">
      <h1>{appTitle(pack)}</h1>
      <span className="tag">{liveTag}</span>
      <span className="sp" />
      {airport === undefined ? null : <AirportEntry key={airport.icao} {...airport} />}
      {busy ? <span className="tag" role="status">Recalculating</span> : null}
      <span className="utc">Times UTC</span>
      <button type="button" className="btn" onClick={onRefresh}>Refresh</button>
      <button type="button" className="btn" onClick={onSettings}>Settings</button>
    </header>
  );
}

export function Freshness({ chips }: { chips: readonly Chip[] }) {
  return (
    <ul className="fresh" aria-label="Data freshness">
      {chips.map((c) => (
        <li key={c.id} className={`fresh-${c.tone}`}>
          <i className="dot" aria-hidden="true" />
          {c.label} <b>{c.detail}</b>
          {c.flag === null ? null : <span className={`flag flag-${c.tone}`}>{c.flag}</span>}
        </li>
      ))}
    </ul>
  );
}

export function Notices({ notices }: { notices: readonly Notice[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="notices" role="status">
      {notices.map((n) => (
        <p key={n.id} className={`strip strip-${n.tone}`}>{n.text}</p>
      ))}
    </div>
  );
}

/** Messages about stored values that were cleared or discarded (SEC-3). Plain text; each can be dismissed. */
export function StoreNotices({ notices, onDismiss }: { notices: readonly string[]; onDismiss: (index: number) => void }) {
  if (notices.length === 0) return null;
  return (
    <div className="notices" role="status">
      {notices.map((n, i) => (
        <p key={`${i}-${n}`} className="strip strip-warn">
          {n}.{' '}
          <button type="button" className="btn small-btn" onClick={() => onDismiss(i)}>Dismiss</button>
        </p>
      ))}
    </div>
  );
}
