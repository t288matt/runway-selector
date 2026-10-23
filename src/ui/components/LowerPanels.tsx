// Panels C (weather components), D (VATSIM traffic) and F (runway diagram)
// (UI_DESIGN section 5, DB-8, OD-32). Text nodes only.
import { levelTone, levelWord, type ViewData } from '../model/dashboard';
import { buildDiagram, DIAGRAM, rolesOf } from '../model/diagram';
import { currentWind, panelDModel, runwayComponentRows, windSentence } from '../model/panels';
import { kt1 } from '../format';

export function PanelC({ view }: { view: ViewData }) {
  const rows = runwayComponentRows(view);
  const s = view.pack.settings;
  const state = view.result.evaluation.slots[0]?.runwayState ?? 'DRY';
  return (
    <section className="panel" aria-label="Panel C: weather">
      <h2><i>C</i>Weather</h2>
      <div className="small">{windSentence(currentWind(view))}</div>
      <table className="t2">
        <caption className="sr">Wind components on every runway end, in knots, against the limits</caption>
        <thead>
          <tr>
            <th>Runway end</th>
            <th>Head</th>
            <th>Tail</th>
            <th>Cross</th>
            <th>Limits</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.headwind}</td>
              <td>{r.tailwind}</td>
              <td>{r.crosswind}</td>
              <td>
                {r.over === null ? (
                  <span className={`chip ${r.known ? 'chip-suitable' : 'chip-unknown'}`}>{r.known ? '✓' : '?'}</span>
                ) : (
                  <span className="chip chip-unsuitable">{'✕'} {r.over}</span>
                )}{' '}
                <span className="small">T {kt1(r.tailLimit)}, X {kt1(r.crossLimit)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="small">
        Components in knots, one decimal, using the stronger of mean wind and gust. Limits: tailwind {kt1(s.tailwindDryKt)} dry, {kt1(s.tailwindWetKt)} wet (the {state === 'DRY' ? 'dry' : state === 'WET' ? 'wet' : 'tighter'} limit applies now); crosswind is the tightest limit of the modes using the end (default {kt1(s.defaultCrosswindKt)}). Simulation settings. The pasted reports are shown at the top of the screen.
      </div>
    </section>
  );
}

export function PanelD({ view }: { view: ViewData }) {
  const m = panelDModel(view);
  return (
    <section className="panel" aria-label="Panel D: VATSIM traffic">
      <h2><i>D</i>VATSIM traffic</h2>
      {m.state === 'none' ? (
        <p className="strip strip-warn">No traffic data.</p>
      ) : (
        <>
          <table className="t2">
            <thead>
              <tr>
                <th>Per 30 min</th>
                {m.columns.map((c) => (
                  <th key={c.label}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Arrivals</td>
                {m.columns.map((c) => (
                  <td key={c.label}>{c.arrivals}</td>
                ))}
              </tr>
              <tr>
                <td>Departures</td>
                {m.columns.map((c) => (
                  <td key={c.label}>{c.departures === 'not est.' ? <span className="small">not est.</span> : c.departures}</td>
                ))}
              </tr>
              <tr>
                <td>Movements per hour</td>
                {m.columns.map((c) => (
                  <td key={c.label}>{c.movements}</td>
                ))}
              </tr>
              <tr>
                <td>Class</td>
                {m.columns.map((c) => (
                  <td key={c.label}><span className={`chip chip-${levelTone(c.level)}`}>{levelWord(c.level)}</span></td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="small">
            Connected now: {m.connectedArrivals} bound here, {m.groundElsewhere} of them on the ground elsewhere, and {m.connectedDepartures} on the ground here. Connected aircraft are not movements.
          </p>
          {m.unknownFrom === null ? null : <p className="small">Demand unknown from {m.unknownFrom}: nothing is estimated beyond the demand horizon.</p>}
          {m.elevationMissing ? <p className="strip strip-warn">The pack gives no airport elevation, so aircraft are judged on the ground by distance and speed only. The departure count may include slow aircraft overhead.</p> : null}
        </>
      )}
      <p className="small">Arrivals: airborne by distance and speed; aircraft on the ground elsewhere with a flight plan here are assumed to take off over the next 30 minutes. Departures: every aircraft on the ground here counts in the next slot only. Bands are provisional placeholders.</p>
    </section>
  );
}

export function PanelF({ view }: { view: ViewData }) {
  const { pack, result } = view;
  const rec = result.plan.recommendedModeId;
  const mode = rec === null ? null : (pack.modes.find((x) => x.id === rec) ?? null);
  const over = new Set(runwayComponentRows(view).filter((r) => r.over !== null).map((r) => r.name));
  const d = buildDiagram({ runways: pack.runways, modeRoles: rolesOf(mode), overLimit: over, wind: currentWind(view), modeLabel: mode === null ? null : `Mode ${mode.id}` });
  return (
    <section className="panel" aria-label="Panel F: runway diagram">
      <h2><i>F</i>Runway diagram</h2>
      <svg viewBox={`0 0 ${DIAGRAM.width} ${DIAGRAM.height}`} width="100%" role="img" aria-label={d.caption}>
        <rect width={DIAGRAM.width} height={DIAGRAM.height} rx="6" className="dg-bg" />
        {d.runways.map((r) => (
          <line key={r.ends.map((e) => e.name).join('-')} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} className={r.used ? 'dg-rwy dg-used' : 'dg-rwy'} />
        ))}
        {d.runways.flatMap((r) =>
          r.ends.map((e) => (
            <text key={e.name} x={e.x} y={e.y} textAnchor={e.anchor} dominantBaseline="middle" className={e.roles.length > 0 ? 'dg-label dg-label-used' : 'dg-label'}>
              {e.name}
              {e.roles.length > 0 ? ` ${e.roles.join('/')}` : ''}
              {e.over ? ' ✕' : ''}
            </text>
          )),
        )}
        {d.arrow === null ? null : (
          <g className="dg-wind">
            <defs>
              <marker id="wind-head" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" />
              </marker>
            </defs>
            <line x1={d.arrow.x1} y1={d.arrow.y1} x2={d.arrow.x2} y2={d.arrow.y2} markerEnd="url(#wind-head)" />
          </g>
        )}
        <text x="290" y="14" textAnchor="end" className="dg-north">N up</text>
      </svg>
      <p className="small" data-testid="diagram-caption">{d.caption}</p>
      <p className="small">Blue runways are used by the recommended mode; ARR is arrivals and DEP is departures.</p>
    </section>
  );
}
