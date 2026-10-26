// The four tiles: traffic with its trend, ceiling and visibility, runway state
// with its bar, and the METAR line. Each is reachable by keyboard; the longer
// words open on hover and on focus. Text nodes only (SEC-2).
import type { CeilingTile, MetarTile, RunwayTile, TrafficTile } from '../model/tiles';
import { CloudIcon, DropIcon, TrafficBars, TrendArrow } from './Icons';
import { Tip } from './Popover';

export function TrafficTileView({ tile }: { tile: TrafficTile }) {
  return (
    <Tip tag="div" text={tile.popover} className="fact" tabIndex={0} role="group" aria-label={tile.aria} data-testid="tile-traffic">
      <span className="k">
        {tile.state === 'none' ? (
          <svg className="ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="#ff8a80" strokeWidth="3" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <TrafficBars lit={tile.bars} />
        )}
        <span data-testid="traffic-word">{tile.word}</span>
        {tile.trend.direction === 'none' ? null : <TrendArrow direction={tile.trend.direction} />}
        {tile.elevationMissing ? (
          <svg className="ico" viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="#ffc94d" strokeWidth="2.2" strokeLinejoin="round">
            <path d="M8 2l7 12H1z" />
          </svg>
        ) : null}
      </span>
      <small>{tile.sub}</small>
    </Tip>
  );
}

export function CeilingTileView({ tile }: { tile: CeilingTile }) {
  return (
    <Tip tag="div" text={tile.aria} className="fact" tabIndex={0} role="group" aria-label={tile.aria} data-testid="tile-ceiling">
      <span className="k">
        <CloudIcon />
        <span data-testid="ceiling-value">{tile.value}</span>
      </span>
      <small>Ceiling &middot; {tile.visibility}</small>
    </Tip>
  );
}

export function RunwayTileView({ tile }: { tile: RunwayTile }) {
  const hasPossible = tile.segments.includes('possible');
  return (
    <Tip tag="div" text={tile.aria} className="fact wide" tabIndex={0} role="group" aria-label={tile.aria} data-testid="tile-runway">
      <span className="k">
        <DropIcon possible={tile.word === 'WET POSSIBLE'} />
        <span data-testid="runway-headline">{tile.headline}</span>
      </span>
      <span className="k-detail">
        Runway <span data-testid="runway-word">{tile.word}</span>, {tile.detail}
      </span>
      {tile.segments.length === 0 ? null : (
        <span className="dryline" aria-hidden="true">
          {tile.segments.map((s, i) => (
            <i key={i} className={`w-${s}`} />
          ))}
        </span>
      )}
      <small>Runway condition{hasPossible ? ' (hatched is possible)' : ''}</small>
    </Tip>
  );
}

export function MetarTileView({ tile }: { tile: MetarTile }) {
  return (
    <Tip tag="div" text={tile.text === null ? 'METAR unknown' : `METAR ${tile.text}`} className="fact wide" tabIndex={0} role="group" aria-label={tile.text === null ? 'METAR unknown' : `METAR ${tile.text}`} data-testid="tile-metar">
      <span className="mono">{tile.text ?? 'Unknown'}</span>
      <small>METAR</small>
    </Tip>
  );
}
