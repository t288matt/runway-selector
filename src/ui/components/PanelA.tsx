// Panel A: current recommendation (UI_DESIGN section 5, DB-2). All wording about
// the recommendation comes from the engine's explanation or from the pack.
import { currentModeOptions, type PanelAModel } from '../model/panels';
import type { ViewData } from '../model/dashboard';
import type { CurrentModeStatus as Status } from '../model/drawer';
import { CurrentModeStatus } from './CurrentModeStatus';

export function PanelA({ view, model, onCurrentMode, status, onConfirmCurrent }: { view: ViewData; model: PanelAModel; onCurrentMode: (id: string | null) => void; status: Status; onConfirmCurrent: () => void }) {
  const options = currentModeOptions(view);
  const select = (
    <div className="cur">
      <label htmlFor="current-mode">Current mode (you choose)</label>
      <select id="current-mode" value={view.currentMode ?? ''} onChange={(e) => onCurrentMode(e.target.value === '' ? null : e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <CurrentModeStatus status={status} onConfirm={onConfirmCurrent} />
    </div>
  );

  return (
    <section className="panel A" aria-label="Panel A: current recommendation">
      <div>
        <h2>Recommended</h2>
        {model.kind === 'recommended' ? (
          <>
            <div className="modebig" aria-label={`Recommended mode ${model.modeId ?? ''}`}>
              {model.modeId}
            </div>
            <div className="rwy">Arr <b>{model.arrivalsText}</b>, Dep <b>{model.departuresText}</b></div>
          </>
        ) : (
          <div className="modebig">-</div>
        )}
        {select}
      </div>

      {model.kind === 'recommended' ? (
        <>
          <dl className="kv">
            <dt>Next change</dt>
            <dd className="big">{model.nextChange}</dd>
            <dt>Weather</dt>
            <dd>
              {model.weather === null ? 'Unknown' : (
                <>
                  <span className={`chip chip-${model.weather.word.toLowerCase()}`}>{model.weather.icon} {model.weather.word}</span> {model.weather.text}
                </>
              )}
            </dd>
            <dt>Traffic</dt>
            <dd>{model.traffic}</dd>
            <dt>Runway state</dt>
            <dd>{model.runwayState}</dd>
            <dt>Ceiling</dt>
            <dd>{model.ceiling}</dd>
          </dl>
          <dl className="kv">
            <dt>Operating plan preference</dt>
            <dd>{model.rank}</dd>
            <dt>Uncertainty</dt>
            <dd>{model.uncertainty}</dd>
          </dl>
        </>
      ) : model.kind === 'no-suitable' && model.noSuitable !== null ? (
        <div className="nomode" role="alert">
          <b>{model.noSuitable.title}</b>
          <ul>
            {model.noSuitable.perMode.map((m) => (
              <li key={m.modeId}>
                {m.text} {m.restoreText}
              </li>
            ))}
          </ul>
          {model.whyLines.map((l, i) => (
            <p key={`${i}-${l}`} className="gapline">{l}</p>
          ))}
        </div>
      ) : (
        <div className="nomode nodata" role="status">
          <b>{model.headline}</b>
          <ul>
            {model.missing.map((m, i) => (
              <li key={`${i}-${m}`}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {model.banners.map((b) => (
        <div key={b.title} className={`banner banner-${b.tone}`} role={b.tone === 'note' ? 'status' : 'alert'}>
          <b>{b.tone === 'amber' ? '⚠ ' : b.tone === 'red' ? '✕ ' : ''}{b.title}</b>
          <span>{b.text}</span>
        </div>
      ))}

      {/* The first line is the Weather row above; it is not said twice. Collapsed by default (OD-56). */}
      {model.kind === 'recommended' && model.whyLines.length > 1 ? (
        <details className="why">
          <summary>More about the recommendation</summary>
          {model.whyLines.slice(1).map((l, i) => (
            <p key={`${i}-${l}`} className={i === 0 ? 'why-first' : 'why-more'}>{l}</p>
          ))}
        </details>
      ) : null}
    </section>
  );
}
