// The dashboard layout in its fixed order (UI_DESIGN section 3): header,
// freshness chips, A, B, weather entry, D and F, then the flight-simulation notice (OD-38, OD-41). Pure of effects: the
// state and timers live in useDashboard.
import type { AutoReportState, WeatherKind } from '../controller';
import { dataNotices, freshnessChips, type FeedState, type ViewData, type WindowChoice } from '../model/dashboard';
import { currentModeStatus } from '../model/drawer';
import { panelAModel } from '../model/panels';
import { timelineModel } from '../model/timeline';
import { Freshness, Header, NoticeBar, Notices, StoreNotices } from './Frame';
import { PanelD, PanelF } from './LowerPanels';
import { PanelA } from './PanelA';
import { SettingsDrawer, type SettingsBridge } from './SettingsDrawer';
import { Timeline } from './Timeline';
import { WeatherEntry, type ApplyOutcome } from './WeatherEntry';

export interface DashboardProps {
  readonly view: ViewData;
  readonly feed: FeedState;
  readonly displayNowMs: number;
  readonly busy: boolean;
  readonly drawerOpen: boolean;
  readonly onToggleDrawer: (open: boolean) => void;
  readonly onWindowChange: (choice: WindowChoice) => void;
  readonly onCurrentMode: (id: string | null) => void;
  readonly onApplyMetar: (text: string) => ApplyOutcome;
  readonly onApplyTaf: (text: string) => ApplyOutcome;
  readonly autoWeather: Readonly<Record<WeatherKind, AutoReportState>>;
  readonly onResumeAutomatic: (kind: WeatherKind) => void;
  readonly settings: SettingsBridge;
}

export function liveTag(feed: FeedState, auto: Readonly<Record<WeatherKind, AutoReportState>>): string {
  const weather = auto.metar.paused || auto.taf.paused ? 'weather partly pasted by hand' : 'weather automatic';
  if (feed.error !== null) return `Traffic failed; ${weather}`;
  if (feed.fetchedAtMs === null) return `Waiting for traffic; ${weather}`;
  return `Live traffic; ${weather}`;
}

export function Dashboard(p: DashboardProps) {
  const { view } = p;
  const chips = freshnessChips(view, p.feed, p.displayNowMs);
  const notices = dataNotices(view, p.feed, p.displayNowMs);
  const model = panelAModel(view);
  const timeline = timelineModel(view, p.displayNowMs);
  return (
    <div className="wrap">
      <Header liveTag={liveTag(p.feed, p.autoWeather)} busy={p.busy} onSettings={() => p.onToggleDrawer(true)} airport={{ icao: p.settings.pendingAirport ?? view.pack.airport.icao, airports: p.settings.airports, error: p.settings.airportError, onSwitch: p.settings.onSwitchAirport, loading: p.settings.pendingAirport != null }} />
      <Freshness chips={chips} />
      <StoreNotices notices={p.settings.notices} onDismiss={p.settings.onDismissNotice} />
      <Notices notices={notices} />
      <PanelA view={view} model={model} onCurrentMode={p.onCurrentMode} status={currentModeStatus(p.settings.currentModeRecord, p.displayNowMs, view.pack)} onConfirmCurrent={p.settings.onConfirmCurrent} />
      <Timeline view={view} model={timeline} displayNowMs={p.displayNowMs} onWindowChange={p.onWindowChange} />
      <WeatherEntry pack={view.pack} metar={view.metar} taf={view.taf} onApplyMetar={p.onApplyMetar} onApplyTaf={p.onApplyTaf} auto={p.autoWeather} onResumeAutomatic={p.onResumeAutomatic} />
      <div className="grid3">
        <PanelD view={view} />
        <PanelF view={view} />
      </div>
      <NoticeBar pack={view.pack} />
      {p.drawerOpen ? (
        <SettingsDrawer view={view} displayNowMs={p.displayNowMs} bridge={p.settings} onClose={() => p.onToggleDrawer(false)} />
      ) : null}
    </div>
  );
}
