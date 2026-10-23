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

export function Header({ pack, liveTag, onRefresh, onSettings, busy }: { pack: AirportPack | null; liveTag: string; onRefresh: () => void; onSettings: () => void; busy: boolean }) {
  return (
    <header className="top">
      <h1>{appTitle(pack)}</h1>
      <span className="tag">{liveTag}</span>
      <span className="sp" />
      {busy ? <span className="tag" role="status">Recalculating</span> : null}
      <span className="tag">Times UTC, local time beside</span>
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
