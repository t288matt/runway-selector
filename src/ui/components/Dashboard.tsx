// The dashboard layout in its fixed order (UI_DESIGN section 3): header, notice,
// freshness chips, weather entry, A, B, then C, D and F. Pure of effects: the
// state and timers live in useDashboard.
import { dataNotices, freshnessChips, type FeedState, type ViewData, type WindowChoice } from '../model/dashboard';
import { panelAModel } from '../model/panels';
import { timelineModel } from '../model/timeline';
import { Freshness, Header, NoticeBar, Notices } from './Frame';
import { PanelC, PanelD, PanelF } from './LowerPanels';
import { PanelA } from './PanelA';
import { SettingsDrawer } from './SettingsDrawer';
import { Timeline } from './Timeline';
import { WeatherEntry, type ApplyOutcome } from './WeatherEntry';

export interface DashboardProps {
  readonly view: ViewData;
  readonly feed: FeedState;
  readonly displayNowMs: number;
  readonly busy: boolean;
  readonly drawerOpen: boolean;
  readonly onRefresh: () => void;
  readonly onToggleDrawer: (open: boolean) => void;
  readonly onWindowChange: (choice: WindowChoice) => void;
  readonly onCurrentMode: (id: string | null) => void;
  readonly onApplyMetar: (text: string) => ApplyOutcome;
  readonly onApplyTaf: (text: string) => ApplyOutcome;
}

export function liveTag(feed: FeedState): string {
  if (feed.error !== null) return 'Traffic failed; weather pasted by hand';
  if (feed.fetchedAtMs === null) return 'Waiting for traffic; weather pasted by hand';
  return 'Live traffic; weather pasted by hand';
}

export function reasonLine(view: ViewData): string {
  const { explanation } = view.result;
  return [explanation.headline, view.result.plan.recommendedModeId === null ? '' : (explanation.lines[1] ?? '')].filter((x) => x !== '').join(' ');
}

export function Dashboard(p: DashboardProps) {
  const { view } = p;
  const chips = freshnessChips(view, p.feed, p.displayNowMs);
  const notices = dataNotices(view, p.feed, p.displayNowMs);
  const model = panelAModel(view);
  const timeline = timelineModel(view, p.displayNowMs);
  return (
    <div className="wrap">
      <Header pack={view.pack} liveTag={liveTag(p.feed)} busy={p.busy} onRefresh={p.onRefresh} onSettings={() => p.onToggleDrawer(true)} />
      <NoticeBar pack={view.pack} />
      <Freshness chips={chips} />
      <WeatherEntry pack={view.pack} metar={view.metar} taf={view.taf} displayNowMs={p.displayNowMs} onApplyMetar={p.onApplyMetar} onApplyTaf={p.onApplyTaf} />
      <Notices notices={notices} />
      <PanelA view={view} model={model} onCurrentMode={p.onCurrentMode} />
      <Timeline view={view} model={timeline} displayNowMs={p.displayNowMs} onWindowChange={p.onWindowChange} reason={reasonLine(view)} />
      <div className="grid3">
        <PanelC view={view} />
        <PanelD view={view} />
        <PanelF view={view} />
      </div>
      {p.drawerOpen ? <SettingsDrawer pack={view.pack} onClose={() => p.onToggleDrawer(false)} /> : null}
    </div>
  );
}
