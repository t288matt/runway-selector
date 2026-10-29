// The Detail section. Closed it is one row: a chevron, the label and the
// time range, with the forecast in words as its accessible name (no hover popover). It is a native details element, so it opens and
// closes with no script and a keyboard (Enter or Space on the summary). Open, it holds
// the expansion (Evaluation.tsx). (The slim bar that used to sit in the closed row was
// removed, issue 104.) Text nodes only (SEC-2).
//
// `open` and `onToggle` let a deep link (the #/ICAO/detail route, owner, 29-10-2026) start
// it open and keep the URL in step; the native toggle still does the opening and closing,
// `onToggle` only reports it upward.
import type { EvaluationModel } from '../model/evaluation';
import type { ForecastSummary } from '../model/forecastBar';
import { Evaluation } from './Evaluation';

export const EVALUATION_TITLE = 'Detail';

export function ForecastBar({
  model,
  evaluation,
  open,
  onToggle,
}: {
  model: ForecastSummary;
  evaluation: EvaluationModel;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  return (
    <details className="fcx" id="evaluation" data-testid="forecast-bar" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
      <summary aria-label={`${EVALUATION_TITLE}: open or close. ${model.summary}`}>
        <span className="sumhead">
          <span className="chev" aria-hidden="true" />
          {EVALUATION_TITLE}
        </span>
      </summary>
      <Evaluation model={evaluation} />
    </details>
  );
}
