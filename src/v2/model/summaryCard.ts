// One airport's card on the summary screen: the same answer the full screen
// shows for the same state, in a smaller shape. Pure; it adds no rules.
import type { ControllerState } from '../controller';
import type { Picture } from './picture';
import { screenModel } from './screen';

export interface SummaryCard {
  readonly icao: string;
  readonly name: string;
  /** The mode id on its own (the large element of the card), or null when no mode is recommended. */
  readonly modeId: string | null;
  readonly modeLabel: string;
  readonly arrivals: string | null;
  readonly departures: string | null;
  /** Null when there is no report to read a wind from. */
  readonly windLabel: string | null;
  readonly reason: string | null;
  readonly noReport: boolean;
  readonly picture: Picture;
}

export function summaryCard(state: ControllerState): SummaryCard {
  const { answer, picture } = screenModel(state);
  const noReport = answer.band.id === 'NO_DATA';
  return {
    icao: state.view.pack.airport.icao,
    name: state.view.pack.airport.name,
    modeId: answer.modeId,
    modeLabel: answer.modeLabel,
    arrivals: answer.arrivals,
    departures: answer.departures,
    windLabel: noReport ? null : picture.windLabel,
    reason: answer.why,
    noReport,
    picture,
  };
}
