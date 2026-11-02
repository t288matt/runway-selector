// The summary card: the same answer as the full screen for the same state, with no rules of its own.
import { describe, expect, it } from 'vitest';
import { NO_AUTO_WEATHER, type ControllerState } from '../../src/v2/controller';
import { EMPTY_FEED, type ViewData } from '../../src/v2/model/dashboard';
import { screenModel } from '../../src/v2/model/screen';
import { summaryCard } from '../../src/v2/model/summaryCard';
import { TEST_PACK, YSSY_PACK } from '../helpers/packs';
import { packOf, rigFor, same, type Wx } from '../engine/planHelpers';
import { packWith } from '../weather/helpers';
import { FIXTURE_STATION, realView, viewOf } from './helpers';

function stateOf(view: ViewData): ControllerState {
  return { view, feed: EMPTY_FEED, displayNowMs: view.calcNowMs, audit: [], notices: [], reload: { status: 'idle', message: null }, autoWeather: NO_AUTO_WEATHER };
}

describe.each([YSSY_PACK, TEST_PACK].map((p) => [p.name, p] as const))('summary card [%s]', (_n, ref) => {
  const rig = rigFor(ref);
  const pack = packOf(rig);

  it("card mode, arrivals and departures equal the full screen's answer for the same state", () => {
    const real = packWith(ref, { weatherStation: FIXTURE_STATION });
    const state = stateOf(realView(real, ref));
    const answer = screenModel(state).answer;
    const card = summaryCard(state);
    expect(card.modeId).toBe(answer.modeId);
    expect(card.modeLabel).toBe(answer.modeLabel);
    expect(card.arrivals).toBe(answer.arrivals);
    expect(card.departures).toBe(answer.departures);
    expect(card.reason).toBe(answer.why);
    expect(card.name).toBe(real.airport.name);
    expect(card.icao).toBe(real.airport.icao);
    expect(card.picture).toEqual(screenModel(state).picture);
  });

  it('noReport card has null windLabel and a reason', () => {
    const state = stateOf(viewOf(pack, rig, same<Wx>(3, 'none')));
    const card = summaryCard(state);
    expect(card.noReport).toBe(true);
    expect(card.windLabel).toBeNull();
    expect(card.reason).toContain('No mode is recommended because the weather for the current period is not known');
  });

  it("a NO_SUITABLE state still shows 'No recommended mode', noReport false", () => {
    const state = stateOf(viewOf(pack, rig, ['badBoth', 'badBoth'], same(2, 'medium')));
    const card = summaryCard(state);
    expect(screenModel(state).answer.band.id).toBe('NO_SUITABLE');
    expect(card.modeLabel).toBe('No recommended mode');
    expect(card.noReport).toBe(false);
    expect(card.windLabel).toBe(screenModel(state).picture.windLabel);
  });
});
