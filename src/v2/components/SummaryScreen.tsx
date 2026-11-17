// The all-airports summary: one small card per airport in each group of app.json,
// each a link to that airport's own screen. The cards show what the full screen
// shows (src/v2/model/summaryCard.ts) and add no rules of their own. A card shows the
// runways in use, not the mode id; the mode wording is in the hover title and the accessible name.
import type { AppGroup } from '../../refdata';
import type { AppDeps } from '../deps';
import type { SummaryEntry } from '../summary';
import { buildRoute, buildSummary2Route, buildSummaryRoute } from '../route';
import { useSummary } from '../useSummary';
import { APP_TITLE } from './Header';
import { Notice } from './Notice';
import { Picture } from './Picture';

/** Every airport once, in group order. */
export function summaryAirports(groups: readonly AppGroup[]): string[] {
  return [...new Set(groups.flatMap((g) => g.airports))];
}

export type SummarySize = 'compact' | 'large';

function Card({ entry, large }: { entry: SummaryEntry; large: boolean }) {
  const href = buildRoute(entry.icao, false);
  // The large boxes add one class; everything else is the same card.
  const extra = large ? ' scard-large' : '';
  if (entry.status === 'loading') {
    return (
      <a className={`scard scard-wait${extra}`} href={href} aria-label={`${entry.icao}, loading`}>
        <span className="scard-code">{entry.icao}</span>
        <span className="scard-note">loading</span>
      </a>
    );
  }
  if (entry.status === 'error') {
    return (
      <a className={`scard scard-wait${extra}`} href={href} title={entry.message} aria-label={`${entry.icao}, unavailable`}>
        <span className="scard-code">{entry.icao}</span>
        <span className="scard-note">unavailable</span>
      </a>
    );
  }
  const { card } = entry;
  // The accessible name keeps the mode wording and the runways: "arrivals ..., departures ...".
  const parts = [card.icao, `mode ${card.modeLabel}`];
  for (const row of card.runways) {
    if (row.role !== 'DEP') parts.push(`arrivals ${row.text}`);
    if (row.role !== 'ARR') parts.push(`departures ${row.text}`);
  }
  parts.push(card.noReport ? 'no report' : (card.windLabel ?? ''));
  return (
    <a
      className={`${card.noReport ? 'scard scard-noreport' : 'scard'}${extra}`}
      href={href}
      title={card.reason === null ? card.modeLabel : `${card.modeLabel}. ${card.reason}`}
      aria-label={parts.filter((p) => p !== '').join(', ')}
    >
      {large ? (
        <span className="scard-head">
          <span className="scard-code">{card.icao}</span>
          <span className="scard-name">{card.name}</span>
        </span>
      ) : null}
      <Picture model={card.picture} />
      <span className="scard-body">
        {large ? null : <span className="scard-code">{card.icao}</span>}
        {card.runways.length === 0 ? <span className="scard-nomode">{card.modeLabel}</span> : null}
        {card.runways.map((row) => (
          <span key={row.role} className="scard-rwy">
            <span className="scard-rwy-text">{row.text}</span>
            <span className="scard-rwy-role">{row.role}</span>
          </span>
        ))}
        <span className="scard-wind">{card.noReport ? 'no report' : card.windLabel}</span>
      </span>
    </a>
  );
}

/** The summary as markup, from entries already in hand. */
export function SummaryView({ groups, entries, size = 'compact' }: { groups: readonly AppGroup[]; entries: readonly SummaryEntry[]; size?: SummarySize }) {
  const byIcao = new Map(entries.map((e) => [e.icao, e]));
  const large = size === 'large';
  return (
    <section className={large ? 'summary summary-large' : 'summary'} aria-label="All airports">
      {groups.map((g, gi) => (
        <div key={`${gi}:${g.name}`} className="sgroup">
          <h2>{g.name}</h2>
          <ul className={large ? 'sgrid sgrid-large' : 'sgrid'}>
            {g.airports.map((icao) => {
              const entry = byIcao.get(icao) ?? ({ icao, status: 'loading' } as const);
              return (
                <li key={icao}>
                  <Card entry={entry} large={large} />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** The small switch in the top bar: the current size is marked and is not a link; the other is a plain link to its hash. */
export function SummarySwitch({ size }: { size: SummarySize }) {
  return (
    <nav className="summary-switch" aria-label="Summary size">
      {size === 'compact' ? <span aria-current="page">Compact</span> : <a href={buildSummaryRoute()}>Compact</a>}
      {size === 'large' ? <span aria-current="page">Large</span> : <a href={buildSummary2Route()}>Large</a>}
    </nav>
  );
}

export function SummaryScreen({ groups, deps, size = 'compact' }: { groups: readonly AppGroup[]; deps: AppDeps; size?: SummarySize }) {
  const entries = useSummary(summaryAirports(groups), deps);
  return (
    <div className="app">
      <header className="bar">
        <h1>{APP_TITLE}</h1>
        <span className="sp" />
        <SummarySwitch size={size} />
      </header>
      <SummaryView groups={groups} entries={entries} size={size} />
      <footer className="trust">
        <Notice pack={null} />
      </footer>
    </div>
  );
}
