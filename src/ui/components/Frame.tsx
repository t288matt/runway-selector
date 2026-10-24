// Header strip, the fixed notice, freshness chips and data notices (UI_DESIGN
// section 4). Every string is a text node (SEC-2).
import type { AirportPack } from '../../refdata';
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

/** The airport is named by the Airport box beside the title (OD-40), so the title does not repeat it. */
export function appTitle(): string {
  return 'Runway Mode Planner';
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
  /** Airport ids with a reviewed data pack (app.json): the pull-down's only options (owner, 24-10-2026, amending OD-37). */
  readonly airports: readonly string[];
  /** Why the last switch was refused, or null. */
  readonly error: string | null;
  readonly onSwitch: (icao: string) => void;
}

/**
 * The always-visible airport pull-down (amends OD-37): choosing an option switches straight away, no separate
 * Switch button. Only airports with a reviewed data pack are offered, so there is nothing to type or validate.
 */
export function AirportEntry({ icao, airports, error, onSwitch }: AirportEntryProps) {
  return (
    <div className="airport-entry">
      <label htmlFor="airport-icao">Airport</label>
      <select
        id="airport-icao"
        value={icao}
        aria-describedby={error === null ? undefined : 'airport-icao-note'}
        aria-invalid={error !== null}
        onChange={(e) => onSwitch(e.target.value)}
      >
        {airports.map((id) => (
          <option key={id} value={id}>{id}</option>
        ))}
      </select>
      {error === null ? null : <span className="strip strip-bad airport-note" id="airport-icao-note" role="alert">{error}</span>}
    </div>
  );
}

export function Header({ liveTag, onRefresh, onSettings, busy, airport }: { liveTag: string; onRefresh: () => void; onSettings: () => void; busy: boolean; airport?: AirportEntryProps }) {
  return (
    <header className="top">
      <h1>{appTitle()}</h1>
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
