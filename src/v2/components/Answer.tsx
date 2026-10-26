// The answer band: the state (a glyph and a word), the mode, the next change and
// the arrival and departure runways. Text nodes only (SEC-2). There is no current-mode selector (issue 104).
import type { AnswerModel } from '../model/answer';
import { StateGlyph } from './Icons';
import { Tip } from './Popover';

/** The small "P2" tag: the mode's rank in the operating plan. */
function PriorityTag({ rank }: { rank: number | null }) {
  if (rank === null) return null;
  return (
    <Tip text="Runway mode priority" className="prio" tabIndex={0} role="group" aria-label={`Runway mode priority ${rank}`} data-testid="priority">
      P{rank}
    </Tip>
  );
}

export function Answer({ model }: { model: AnswerModel }) {
  const { band } = model;
  return (
    <div className="answer">
      <span className={`state state-${band.tone}`} role="status" data-testid="state-band" data-state={band.id}>
        <StateGlyph glyph={band.glyph} />
        {band.word}
      </span>
      {model.modeId === null ? (
        <div className="mode none" aria-label={model.modeLabel}>
          &ndash;
        </div>
      ) : (
        <div className={`mode ${model.modeSize === 'normal' ? '' : model.modeSize}`.trim()} aria-label={model.modeLabel} data-testid="mode">
          {model.modeId}
          <PriorityTag rank={model.rank} />
        </div>
      )}
      {model.next === '' ? null : (
        <div className="next" data-testid="next">
          {model.next}
        </div>
      )}
      {model.why === null ? null : (
        <div className="why1" title={model.why} data-testid="why">
          {model.why}
        </div>
      )}
      {model.arrivals === null || model.departures === null ? null : (
        <div className="rw">
          Arr <b>{model.arrivals}</b> &middot; Dep <b>{model.departures}</b>
        </div>
      )}
      {model.alternatives.length === 0 ? null : (
        <div className="alt" role="group" aria-label="Also valid for the next hour" data-testid="alternatives">
          <div className="alt-label">Also valid for the next hour</div>
          <div className="alt-chips">
            {model.alternatives.map((a) => (
              <span className="alt-chip" key={a.modeId} data-testid="alt-chip">
                <i className="alt-dot" aria-hidden="true" />
                {a.modeId}
                <PriorityTag rank={a.rank} />
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
