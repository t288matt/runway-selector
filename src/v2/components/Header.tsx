// The top bar: title, airport selector, UTC clock and the More button.
import { useEffect, useState } from 'react';
import type { Clock } from '../clock';
import { hhmmZ } from '../format';
import { Tip } from './Popover';

export const APP_TITLE = 'Runway Mode Planner';

/** Plain-text form of HowChosenRich, used as the popover's accessible description. */
export const HOW_CHOSEN_TEXT =
  "How the mode is chosen. The app plans the whole forecast window at once. It doesn't decide “now” separately from “later.” The recommendation is just the first step of that whole plan. " +
  "Every mode is checked against the weather and traffic at each point in time. A mode that breaks a crosswind, tailwind or other limit, or exceeds capacity for known traffic, is ruled out completely at that point. It's never offered, no matter how preferred it is. " +
  "Of the modes that remain usable, the plan favours the airport's priority order. But it looks ahead first. It may keep you in a mode that's slightly less ideal right now — tolerating a brief tailwind, say — if that avoids a disruptive runway change a few minutes later. " +
  "Why changes are kept to a minimum. Switching modes has a cost. The cost gets bigger the busier the airport is. So a change only appears when it's worth it over the whole window, not for a trivial, short-lived gain. " +
  'When a change is actually recommended. Change now: the current mode has become unsafe. Change immediately. ' +
  "Early change recommended: the current mode is still fine, but the forecast shows it will fail later. If changing early, while traffic is lighter, beats waiting and being forced to change in busier traffic, the app flags it ahead of time. It shows both times and the traffic level at each, so you're not stuck making a rushed change when it's busy.";

/** Rich (formatted) content for the "How the mode is chosen" popover. */
function HowChosenRich() {
  return (
    <>
      <b className="pr-title">How the mode is chosen</b>
      <p>The app plans the whole forecast window at once. It doesn&rsquo;t decide &ldquo;now&rdquo; separately from &ldquo;later.&rdquo; The recommendation is just the first step of that whole plan.</p>
      <p>Every mode is checked against the weather and traffic at each point in time. A mode that breaks a crosswind, tailwind or other limit, or exceeds capacity for known traffic, is ruled out completely at that point. It&rsquo;s never offered, no matter how preferred it is.</p>
      <p>Of the modes that remain usable, the plan favours the airport&rsquo;s priority order. But it looks ahead first. It may keep you in a mode that&rsquo;s slightly less ideal right now &mdash; tolerating a brief tailwind, say &mdash; if that avoids a disruptive runway change a few minutes later.</p>
      <b className="pr-title">Why changes are kept to a minimum</b>
      <p>Switching modes has a cost. The cost gets bigger the busier the airport is. So a change only appears when it&rsquo;s worth it over the whole window, not for a trivial, short-lived gain.</p>
      <b className="pr-title">When a change is actually recommended</b>
      <ul className="how-chosen-list">
        <li>
          <b>Change now</b> &mdash; the current mode has become unsafe. Change immediately.
        </li>
        <li>
          <b>Early change recommended</b> &mdash; the current mode is still fine, but the forecast shows it will fail later. If changing early, while traffic is lighter, beats waiting and being forced to change in busier traffic, the app flags it ahead of time. It shows both times and the traffic level at each, so you&rsquo;re not stuck making a rushed change when it&rsquo;s busy.
        </li>
      </ul>
    </>
  );
}

/** The UTC clock, with an info popover explaining how the recommended mode and its changes are chosen. */
export function UtcClock({ now }: { now: Clock }) {
  const [ms, setMs] = useState<number>(() => now());
  useEffect(() => {
    const h = setInterval(() => setMs(now()), 1000);
    return () => clearInterval(h);
  }, [now]);
  return (
    <span className="utc-row">
      <span className="utc">UTC {hhmmZ(ms)}</span>
      <Tip text={HOW_CHOSEN_TEXT} rich={<HowChosenRich />} className="info how-chosen-info" tabIndex={0} role="group" aria-label="How the mode is chosen" data-testid="how-chosen-info">
        i
      </Tip>
    </span>
  );
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
