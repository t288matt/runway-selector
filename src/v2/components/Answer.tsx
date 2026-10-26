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
      <span className="pr-sub">1 is the most preferred.</span>
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
      ) : model.approach === null ? (
        <div className={`mode ${model.modeSize === 'normal' ? '' : model.modeSize}`.trim()} aria-label={model.modeLabel} data-testid="mode">
          {model.modeId}
        </div>
      ) : (
        <div className="mode-row">
          <div className={`mode ${model.modeSize === 'normal' ? '' : model.modeSize}`.trim()} aria-label={model.modeLabel} data-testid="mode">
            {model.modeId}
          </div>
          <Tip text={model.approach.hover} className="appr" tabIndex={0} role="group" aria-label={`Approach type ${model.approach.chip}`} data-testid="approach-chip">
            {model.approach.chip}
          </Tip>
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
      {model.conditional === null ? null : (
        <p className="banner banner-ok cond" role="status" data-testid="conditional-note">
          <b>&#10003; {model.conditional.title}</b> {model.conditional.text}
        </p>
      )}
    </div>
  );
}
