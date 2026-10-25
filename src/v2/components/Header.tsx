// The top bar: title, airport selector, UTC clock and the More button.
import { useEffect, useState } from 'react';
import type { Clock } from '../clock';
import { hhmmZ } from '../format';

export const APP_TITLE = 'Runway Mode Planner';

/** The UTC clock. It ticks on its own so the rest of the screen is not redrawn every second. */
export function UtcClock({ now }: { now: Clock }) {
  const [ms, setMs] = useState<number>(() => now());
  useEffect(() => {
    const h = setInterval(() => setMs(now()), 1000);
    return () => clearInterval(h);
  }, [now]);
  return <span className="utc">UTC {hhmmZ(ms)}</span>;
}

export interface HeaderProps {
  readonly icao: string;
  /** The airports in app.json. */
  readonly airports: readonly string[];
  /** The airport chosen in the selector whose pack is still being fetched, or null. */
  readonly pending: string | null;
  readonly airportError: string | null;
  readonly onSwitch: (icao: string) => void;
  readonly now: Clock;
  readonly moreOpen: boolean;
  readonly onMore: () => void;
  readonly moreRef: React.RefObject<HTMLButtonElement | null>;
}

export function Header({ icao, airports, pending, airportError, onSwitch, now, moreOpen, onMore, moreRef }: HeaderProps) {
  const shown = pending ?? icao;
  return (
    <header className="bar">
      <h1>{APP_TITLE}</h1>
      <select aria-label="Airport" value={shown} disabled={pending !== null} onChange={(e) => onSwitch(e.target.value)}>
        {(airports.includes(shown) ? airports : [shown, ...airports]).map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      {pending !== null ? (
        <span className="stamp" role="status">
          Loading {pending}
        </span>
      ) : null}
      {airportError !== null ? (
        <span className="stamp" role="alert">
          {airportError}
        </span>
      ) : null}
      <span className="sp" />
      <UtcClock now={now} />
      <button ref={moreRef} type="button" className="btn" aria-haspopup="dialog" aria-expanded={moreOpen} onClick={onMore}>
        <span className="burger" aria-hidden="true" />
        More
      </button>
    </header>
  );
}
