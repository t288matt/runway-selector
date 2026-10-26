// The answer band: the state (a glyph and a word), the mode, the next change and
// the arrival and departure runways. Text nodes only (SEC-2). There is no current-mode selector (issue 104).
import type { AnswerModel } from '../model/answer';
import { StateGlyph } from './Icons';
import { Tip } from './Popover';

export function Answer({ model }: { model: AnswerModel }) {
  const { band } = model;
  return (
    <div className="answer">
      <div className="state-row">
        <span className={`state state-${band.tone}`} role="status" data-testid="state-band" data-state={band.id}>
          <StateGlyph glyph={band.glyph} />
          {band.word}
        </span>
        {model.priorityText === null ? null : (
          <Tip text={model.priorityText} className="info" tabIndex={0} role="group" aria-label="Runway mode priority" data-testid="priority-info">
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
        <div className="alt" role="group" aria-label="Also valid for the next hour" data-testid="alternatives">
          {model.priorityText === null ? (
            <div className="alt-label">Also valid for the next hour</div>
          ) : (
            <Tip tag="div" text={model.priorityText} className="alt-label" data-testid="alt-label">
              Also valid for the next hour
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
