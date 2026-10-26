// The answer band: the state (a glyph and a word), the mode, the next change and
// the arrival and departure runways. Text nodes only (SEC-2). There is no current-mode selector (issue 104).
import type { AnswerModel } from '../model/answer';
import { StateGlyph } from './Icons';
import { Tip } from './Popover';

/** The ranking as coloured rows: blue for the recommended mode, green for suitable, grey for unsuitable. */
function PriorityRich({ model }: { model: AnswerModel }) {
  return (
    <>
      <b className="pr-title">Runway mode priority</b>
      <span className="pr-sub">1 is the most preferred. Suitable means for the next hour.</span>
      <span className="pr-grid">
        {model.priorityRows.map((r) => (
          <span key={r.modeId} className={`pr-row pr-${r.state}`}>
            <span className="pr-n">{r.rank}</span>
            <span>{r.modeId}</span>
            <span className="pr-s">{r.state}</span>
          </span>
        ))}
      </span>
    </>
  );
}

export function Answer({ model }: { model: AnswerModel }) {
  const { band } = model;
  const rich = model.priorityText === null ? undefined : <PriorityRich model={model} />;
  return (
    <div className="answer">
      <div className="state-row">
        <span className={`state state-${band.tone}`} role="status" data-testid="state-band" data-state={band.id}>
          <StateGlyph glyph={band.glyph} />
          {band.word}
        </span>
        {model.priorityText === null ? null : (
          <Tip text={model.priorityText} rich={rich} className="info" tabIndex={0} role="group" aria-label="Runway mode priority" data-testid="priority-info">
            i
          </Tip>
        )}
      </div>
      {model.modeId === null ? (
        <div className="mode none" aria-label={model.modeLabel}>
          &ndash;
        </div>
      ) : (
        <div className={`mode ${model.modeSize === 'normal' ? '' : model.modeSize}`.trim()} aria-label={model.modeLabel} data-testid="mode">
          {model.modeId}
        </div>
      )}
      {model.next === '' ? null : (
        <div className="next" data-testid="next">
          {model.next}
        </div>
      )}
      {model.why === null ? null : (
        <Tip tag="div" text={model.why} className="why1" data-testid="why">
          {model.why}
        </Tip>
      )}
      {model.arrivals === null || model.departures === null ? null : (
        <div className="rw">
          Arr <b>{model.arrivals}</b> &middot; Dep <b>{model.departures}</b>
        </div>
      )}
      {model.alternatives.length === 0 ? null : (
        <div className="alt" role="group" aria-label="Also suitable for the next hour" data-testid="alternatives">
          {model.priorityText === null ? (
            <div className="alt-label">Also suitable for the next hour</div>
          ) : (
            <Tip tag="div" text={model.priorityText} rich={rich} className="alt-label" data-testid="alt-label">
              Also suitable for the next hour
            </Tip>
          )}
          <div className="alt-chips">
            {model.alternatives.map((a) => (
              <span className="alt-chip" key={a.modeId} data-testid="alt-chip">
                <i className="alt-dot" aria-hidden="true" />
                {a.modeId}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
