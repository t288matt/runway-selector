// One airport's card on the summary screen: the same answer the full screen
// shows for the same state, in a smaller shape. Pure; it adds no rules. The card shows the
// runways in use (merged, like 16L/R), not the mode id; the mode wording stays in modeLabel
// for the hover text and the accessible name.
import type { ControllerState } from '../controller';
import type { Picture } from './picture';
import { runwayRows, type RunwayRow } from './runwayText';
import { screenModel } from './screen';

export interface SummaryCard {
  readonly icao: string;
  readonly name: string;
  readonly modeLabel: string;
  /** The recommended mode's runways in use, one row or an ARR row and a DEP row; empty when no mode is recommended. */
  readonly runways: readonly RunwayRow[];
  /** Null when there is no report to read a wind from. */
  readonly windLabel: string | null;
  readonly reason: string | null;
  readonly noReport: boolean;
  readonly picture: Picture;
}

export function summaryCard(state: ControllerState): SummaryCard {
  const { answer, picture } = screenModel(state);
  const { pack, result } = state.view;
  const mode = pack.modes.find((m) => m.id === result.plan.recommendedModeId);
  const noReport = answer.band.id === 'NO_DATA';
  return {
    icao: state.view.pack.airport.icao,
    name: state.view.pack.airport.name,
    modeLabel: answer.modeLabel,
    runways: mode === undefined ? [] : runwayRows(mode.arrivals, mode.departures),
    windLabel: noReport ? null : picture.windLabel,
    reason: answer.why,
    noReport,
    picture,
  };
}
