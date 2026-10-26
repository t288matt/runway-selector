// The answer band: the state (a glyph and a word), the mode, the next change and
// the arrival and departure runways. Text nodes only (SEC-2). There is no current-mode selector (issue 104).
import type { AnswerModel } from '../model/answer';
import { StateGlyph } from './Icons';

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
    </div>
  );
}
