// The Detail section. Closed it is one row: a chevron, the label and the
// time range, with the forecast in words as its accessible name (no hover popover). It is a native details element, so it opens and
// closes with no script and a keyboard (Enter or Space on the summary). Open, it holds
// the expansion (Evaluation.tsx). (The slim bar that used to sit in the closed row was
// removed, issue 104.) Text nodes only (SEC-2).
import type { EvaluationModel } from '../model/evaluation';
import type { ForecastSummary } from '../model/forecastBar';
import { Evaluation } from './Evaluation';

export const EVALUATION_TITLE = 'Detail';

export function ForecastBar({ model, evaluation }: { model: ForecastSummary; evaluation: EvaluationModel }) {
  return (
    <details className="fcx" id="evaluation" data-testid="forecast-bar">
      <summary aria-label={`${EVALUATION_TITLE}: open or close. ${model.summary}`}>
        <span className="sumhead">
          <span className="chev" aria-hidden="true" />
          {EVALUATION_TITLE}
          <span className="sp" />
          <span className="hint">{model.rangeText}</span>
        </span>
      </summary>
      <Evaluation model={evaluation} />
    </details>
  );
}
