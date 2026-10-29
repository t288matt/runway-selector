// The closed state of the answer screen below the header: store notices, the
// answer band with the picture and the tiles, the forecast section (slim bar, or
// the expansion when open), and the trust strip with the fixed flight-simulation notice. A fragment: its parts are
// the rows of the page grid.
import type { AirportPack } from '../../refdata';
import type { ScreenModel } from '../model/screen';
import { Answer } from './Answer';
import { Chips } from './Chips';
import { ForecastBar } from './ForecastBar';
import { Notice } from './Notice';
import { Picture } from './Picture';
import { CeilingTileView, MetarTileView, RunwayTileView, TrafficTileView } from './Tiles';

export interface DashboardProps {
  readonly model: ScreenModel;
  readonly pack: AirportPack;
  readonly onDismissNotice: (index: number) => void;
  /** Whether the Detail section is open, and how to report a user toggle; driven by the #/ICAO/detail route (owner, 29-10-2026). */
  readonly detailOpen: boolean;
  readonly onToggleDetail: (open: boolean) => void;
}

export function Dashboard({ model, pack, onDismissNotice, detailOpen, onToggleDetail }: DashboardProps) {
  const tone = model.answer.band.tone;
  return (
    <>
      {model.notices.map((text, i) => (
        <div key={text} className="toast" role="status">
          <span>{text}</span>
          <button type="button" className="btn small" onClick={() => onDismissNotice(i)}>
            Dismiss
          </button>
        </div>
      ))}
      <main className={`hero tone-${tone}`} aria-label="Runway mode recommendation">
        <Answer model={model.answer} atis={model.atis} />
        <Picture model={model.picture} />
        <div className="facts">
          <TrafficTileView tile={model.traffic} />
          <CeilingTileView tile={model.ceiling} />
          <RunwayTileView tile={model.runway} />
          <MetarTileView tile={model.metar} />
        </div>
      </main>
      <ForecastBar model={model.forecast} evaluation={model.evaluation} open={detailOpen} onToggle={onToggleDetail} />
      <footer className="trust" aria-label="Data freshness">
        <Chips chips={model.chips} />
        <Notice pack={pack} />
      </footer>
    </>
  );
}
