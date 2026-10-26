// Everything the closed answer screen shows, calculated once from the
// controller's state. Pure: no clock (the display time is in the state), no
// network, no React.
import type { ControllerState } from '../controller';
import { answerModel, type AnswerModel } from './answer';
import { chipModels, type ChipModel } from './chips';
import { evaluationModel, type EvaluationModel } from './evaluation';
import { forecastSummary, type ForecastSummary } from './forecastBar';
import { pictureModel, type Picture } from './picture';
import { ceilingTile, metarTile, runwayTile, trafficTile, type CeilingTile, type MetarTile, type RunwayTile, type TrafficTile } from './tiles';

export interface ScreenModel {
  readonly answer: AnswerModel;
  readonly picture: Picture;
  readonly traffic: TrafficTile;
  readonly ceiling: CeilingTile;
  readonly runway: RunwayTile;
  readonly metar: MetarTile;
  /** The range and the words that name the Detail toggle. */
  readonly forecast: ForecastSummary;
  /** The expanded Detail section. */
  readonly evaluation: EvaluationModel;
  readonly chips: readonly ChipModel[];
  readonly notices: readonly string[];
}

export function screenModel(state: ControllerState): ScreenModel {
  const { view, feed, displayNowMs } = state;
  return {
    answer: answerModel(view),
    picture: pictureModel(view),
    traffic: trafficTile(view, feed),
    ceiling: ceilingTile(view),
    runway: runwayTile(view),
    metar: metarTile(view),
    forecast: forecastSummary(view),
    evaluation: evaluationModel(view, displayNowMs),
    chips: chipModels(view, feed, displayNowMs, state.autoWeather),
    notices: state.notices,
  };
}
