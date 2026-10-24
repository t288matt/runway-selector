// Helpers for the dashboard tests: a ViewData built from the engine rigs (so the
// same scenario runs on every pack) and a static render of the whole screen.
import { renderToStaticMarkup } from 'react-dom/server';
import { plan, type EngineInput, type PlanResult } from '../../src/engine';
import type { AirportPack } from '../../src/refdata';
import { Dashboard } from '../../src/ui/components/Dashboard';
import { NO_AUTO_WEATHER } from '../../src/ui/controller';
import type { SettingsBridge } from '../../src/ui/components/SettingsDrawer';
import { EMPTY_FEED, type FeedState, type ViewData } from '../../src/ui/model/dashboard';
import { BASE, specsFor, trafficFor, type Rig, type Wx } from '../engine/planHelpers';
import { inputFor } from '../engine/helpers';
import type { TrafficLevel } from '../../src/engine';

/** A ViewData from an engine scenario: no reports in it, so the screen reads "No weather entered". */
export function viewOf(pack: AirportPack, rig: Rig, wx: readonly Wx[], levels: readonly (TrafficLevel | null)[] = [], currentMode: string | null = null): ViewData {
  const traffic: EngineInput['traffic'] = levels.length === 0 ? [] : trafficFor(pack, levels);
  const input: EngineInput = { ...inputFor(BASE, specsFor(rig, wx), traffic), currentMode };
  return viewFromInput(pack, input);
}

export function viewFromInput(pack: AirportPack, input: EngineInput): ViewData {
  const result: PlanResult = plan(pack, input);
  const demand =
    input.traffic.length === 0
      ? null
      : {
          slots: input.traffic,
          summary: {
            elevationMissing: false,
            connectedDepartures: 0,
            connectedArrivals: 0,
            groundElsewhere: 0,
            arrivalsBeyondHorizon: 0,
            movementsPerSlot: input.traffic.map((t) => (t.arrivals === null ? null : t.arrivals)),
            levels: input.traffic.map(() => null),
          },
        };
  return {
    pack,
    calcNowMs: input.nowMs,
    metar: null,
    taf: null,
    weather: { slots: input.weather, banners: [], metarAgeMinutes: null, tafAgeMinutes: null },
    demand,
    liveDemand: demand,
    result,
    currentMode: result.plan.startModeId,
    windowChoice: 'full',
  };
}

const NOOP_OUTCOME = { ok: true, message: null, warnings: [] };

/** A drawer bridge with nothing stored and no-op actions; override what a test needs. */
export function testBridge(overrides: Partial<SettingsBridge> = {}): SettingsBridge {
  return {
    currentModeRecord: null,
    audit: [],
    reload: { status: 'idle', message: null },
    airports: [],
    airportError: null,
    notices: [],
    onConfirmCurrent: () => undefined,
    onReload: () => undefined,
    onSwitchAirport: () => undefined,
    onClearAudit: () => undefined,
    onExportAudit: () => ({ filename: 'x.json', text: '{}' }),
    onDismissNotice: () => undefined,
    ...overrides,
  };
}

export function renderDashboard(view: ViewData, feed: FeedState = EMPTY_FEED, drawerOpen = false, bridge: SettingsBridge = testBridge(), displayNowMs: number = view.calcNowMs + 12 * 60_000): string {
  return renderToStaticMarkup(
    <Dashboard
      view={view}
      feed={feed}
      displayNowMs={displayNowMs}
      busy={false}
      drawerOpen={drawerOpen}
      onToggleDrawer={() => undefined}
      onWindowChange={() => undefined}
      onCurrentMode={() => undefined}
      onApplyMetar={() => NOOP_OUTCOME}
      onApplyTaf={() => NOOP_OUTCOME}
      autoWeather={NO_AUTO_WEATHER}
      onResumeAutomatic={() => undefined}
      settings={bridge}
    />,
  );
}

/** The visible text of some markup: tags removed, the few entities React writes decoded. */
export function textOf(markup: string): string {
  return markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** The class attribute of every timeline cell, in document order (row by row). */
export function gridCellClasses(markup: string): string[] {
  return [...markup.matchAll(/<div role="gridcell"[^>]*? class="([^"]*)"/g)].map((m) => m[1] ?? '');
}

export const noopFeed: FeedState = EMPTY_FEED;
