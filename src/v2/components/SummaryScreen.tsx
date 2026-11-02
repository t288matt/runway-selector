// The all-airports summary: one small card per airport in each group of app.json,
// each a link to that airport's own screen. The cards show what the full screen
// shows (src/v2/model/summaryCard.ts) and add no rules of their own.
import type { AppDeps } from '../deps';
import type { SummaryEntry } from '../summary';
import { buildRoute } from '../route';
import { useSummary } from '../useSummary';
import { APP_TITLE } from './Header';
import { Notice } from './Notice';
import { Picture } from './Picture';

export interface SummaryGroup {
  readonly name: string;
  readonly airports: readonly string[];
}

/** Every airport once, in group order. */
export function summaryAirports(groups: readonly SummaryGroup[]): string[] {
  return [...new Set(groups.flatMap((g) => g.airports))];
}

function Card({ entry }: { entry: SummaryEntry }) {
  const href = buildRoute(entry.icao, false);
  if (entry.status === 'loading') {
    return (
      <a className="scard scard-wait" href={href} aria-label={`${entry.icao}, loading`}>
        <span className="scard-code">{entry.icao}</span>
        <span className="scard-note">loading</span>
      </a>
    );
  }
  if (entry.status === 'error') {
    return (
      <a className="scard scard-wait" href={href} title={entry.message} aria-label={`${entry.icao}, unavailable`}>
        <span className="scard-code">{entry.icao}</span>
        <span className="scard-note">unavailable</span>
      </a>
    );
  }
  const { card } = entry;
  const parts = [card.icao, `mode ${card.modeLabel}`];
  if (card.arrivals !== null) parts.push(`arrivals ${card.arrivals}`);
  if (card.departures !== null) parts.push(`departures ${card.departures}`);
  parts.push(card.noReport ? 'no report' : (card.windLabel ?? ''));
  return (
    <a
      className={card.noReport ? 'scard scard-noreport' : 'scard'}
      href={href}
      title={card.reason ?? ''}
      aria-label={parts.filter((p) => p !== '').join(', ')}
    >
      <Picture model={card.picture} />
      <span className="scard-body">
        <span className="scard-code">{card.icao}</span>
        <span className="scard-mode">{card.modeLabel}</span>
        {card.arrivals !== null ? <span className="scard-rwy">A {card.arrivals}</span> : null}
        {card.departures !== null ? <span className="scard-rwy">D {card.departures}</span> : null}
        <span className="scard-wind">{card.noReport ? 'no report' : card.windLabel}</span>
      </span>
    </a>
  );
}

/** The summary as markup, from entries already in hand. */
export function SummaryView({ groups, entries }: { groups: readonly SummaryGroup[]; entries: readonly SummaryEntry[] }) {
  const byIcao = new Map(entries.map((e) => [e.icao, e]));
  return (
    <section className="summary" aria-label="All airports">
      {groups.map((g) => (
        <div key={g.name} className="sgroup">
          <h2>{g.name}</h2>
          <ul className="sgrid">
            {g.airports.map((icao) => {
              const entry = byIcao.get(icao) ?? ({ icao, status: 'loading' } as const);
              return (
                <li key={icao}>
                  <Card entry={entry} />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function SummaryScreen({ groups, deps }: { groups: readonly SummaryGroup[]; deps: AppDeps }) {
  const entries = useSummary(summaryAirports(groups), deps);
  return (
    <div className="app">
      <header className="bar">
        <h1>{APP_TITLE}</h1>
      </header>
      <SummaryView groups={groups} entries={entries} />
      <footer className="trust">
        <Notice pack={null} />
      </footer>
    </div>
  );
}
