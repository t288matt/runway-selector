// Panel B: the optimal mode timeline (UI_DESIGN section 6, DB-3 to DB-7). Rows
// are modes, columns are 30-minute slots. A cell's colour, icon and word come
// from the engine's status through cellView() and from nothing else.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { hhmmZ } from '../format';
import { WINDOW_OPTIONS, type ViewData, type WindowChoice, isWindowChoice, levelWord, levelLetter } from '../model/dashboard';
import { cellDetailModel, type CellDetailModel } from '../model/panels';
import { STATUS_STYLE } from '../model/status';
import { LAYOUT, LEGEND, moveFocus, summaryTiles, visibleRows, type TimelineModel } from '../model/timeline';

interface Anchor {
  readonly row: number;
  readonly col: number;
  readonly left: number;
  readonly top: number;
  readonly bottom: number;
}

function DetailBody({ d }: { d: CellDetailModel }) {
  return (
    <>
      <h3>
        {d.title} <span className={`chip chip-${d.statusWord.toLowerCase()}`}>{d.icon} {d.statusWord}</span>
        {d.code === '' ? null : <span className="detail-code"> {d.code}</span>}
      </h3>
      {d.reason === '' ? null : <div>{d.reason}</div>}
      {d.runways.length === 0 ? null : (
        <table>
          <thead>
            <tr>
              <th>Runway</th>
              <th>Tail (limit)</th>
              <th>Cross (limit)</th>
            </tr>
          </thead>
          <tbody>
            {d.runways.map((r) => (
              <tr key={r.name}>
                <td>{r.name} {r.roles}</td>
                <td><b>{r.tailwind}</b> ({r.tailLimit}){r.overTailwind ? ' ✕' : ''}</td>
                <td><b>{r.crosswind}</b> ({r.crossLimit}){r.overCrosswind ? ' ✕' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div>Wind used: {d.wind}</div>
      {d.overlays.map((o) => (
        <div key={o}>Forecast: {o}</div>
      ))}
      <div>Runway state: {d.runwayAssumption}.</div>
      <div>Traffic: {d.traffic}.</div>
      <div>Operating plan: {d.operatingPlan}.</div>
      {d.survival === '' ? null : <div>Survival: {d.survival}.</div>}
      {d.notes.map((n) => (
        <div key={n}>{n}</div>
      ))}
    </>
  );
}

export interface TimelineProps {
  readonly view: ViewData;
  readonly model: TimelineModel;
  readonly displayNowMs: number;
  readonly onWindowChange: (choice: WindowChoice) => void;
}

export function Timeline({ view, model, displayNowMs, onWindowChange }: TimelineProps) {
  const [showHidden, setShowHidden] = useState(false);
  const { rows, cells, onPath, hiddenCount } = visibleRows(model, showHidden);
  const { slots } = model;
  const tiles = summaryTiles(view);
  const n = slots.length;
  const [pos, setPos] = useState({ row: 0, col: 0 });
  const [hover, setHover] = useState<Anchor | null>(null);
  const [pinned, setPinned] = useState<Anchor | null>(null);
  const [nowVisible, setNowVisible] = useState(true);
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const wantFocus = useRef(false);
  const scroller = useRef<HTMLDivElement | null>(null);

  const width = LAYOUT.label + n * LAYOUT.column;
  const top = LAYOUT.timeStrip + LAYOUT.eventStrip + LAYOUT.trafficStrip;
  const height = top + rows.length * LAYOUT.rowHeight;
  const nowLeft = LAYOUT.label + model.nowSlotFraction * LAYOUT.column;
  const showNow = model.nowSlotFraction >= 0 && model.nowSlotFraction < n;
  const nowCol = showNow ? Math.floor(model.nowSlotFraction) : null;
  const changeCol = model.changeSlots[0] ?? null;

  const anchorOf = (el: HTMLElement, row: number, col: number): Anchor => {
    const r = el.getBoundingClientRect();
    return { row, col, left: r.left, top: r.top, bottom: r.bottom };
  };

  useLayoutEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    const el = cellRefs.current.get(`${pos.row}:${pos.col}`);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pos]);

  const updateNowVisible = useCallback(() => {
    const el = scroller.current;
    if (el === null || !showNow) {
      setNowVisible(true);
      return;
    }
    setNowVisible(nowLeft >= el.scrollLeft + LAYOUT.label && nowLeft <= el.scrollLeft + el.clientWidth);
  }, [nowLeft, showNow]);

  useEffect(() => {
    updateNowVisible();
    window.addEventListener('resize', updateNowVisible);
    return () => window.removeEventListener('resize', updateNowVisible);
  }, [updateNowVisible]);

  useEffect(() => {
    if (pinned === null) return undefined;
    const close = (e: Event): void => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && e.target instanceof Element && (e.target.closest('[role="gridcell"]') !== null || e.target.closest('#cell-detail') !== null)) return;
      setPinned(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [pinned]);

  const shown = pinned ?? hover;
  const detail = shown === null || rows[shown.row] === undefined ? null : cellDetailModel(view, rows[shown.row]?.index ?? 0, shown.col);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, row: number, col: number): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setPinned(anchorOf(e.currentTarget, row, col));
      return;
    }
    if (e.key === 'Escape') {
      setPinned(null);
      return;
    }
    const next = moveFocus(e.key, { row, col }, rows.length, n, nowCol, changeCol);
    if (next === null) return;
    e.preventDefault();
    wantFocus.current = true;
    setPos(next);
  };

  const jumpToNow = (): void => {
    const el = scroller.current;
    if (el !== null) el.scrollLeft = Math.max(0, nowLeft - LAYOUT.label);
  };

  return (
    <section className="panel B" aria-label="Panel B: optimal mode timeline">
      <h2>
        Optimal mode timeline <span className="range">{model.rangeText}</span>
        <span className="sp" />
        {hiddenCount === 0 && !showHidden ? null : (
          <button type="button" className="btn small-btn" aria-pressed={showHidden} onClick={() => {
            setShowHidden(!showHidden);
            setPos({ row: 0, col: 0 });
          }}>
            {showHidden ? 'Hide unsuitable modes' : `Show ${hiddenCount} unsuitable ${hiddenCount === 1 ? 'mode' : 'modes'}`}
          </button>
        )}
        {!nowVisible ? <button type="button" className="btn small-btn" onClick={jumpToNow}>Jump to now</button> : null}
        <label className="small" htmlFor="window-select">Window</label>
        <select id="window-select" value={view.windowChoice} onChange={(e) => (isWindowChoice(e.target.value) ? onWindowChange(e.target.value) : undefined)}>
          {WINDOW_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </h2>

      <div className="bsum">
        {tiles.map((t) => (
          <div key={t.label}>
            <span>{t.label}</span>
            <b>{t.value}</b>
          </div>
        ))}
      </div>

      <div className="scroller" tabIndex={0} aria-label="Timeline, scrolls horizontally" ref={scroller} onScroll={updateNowVisible}>
        <div className="inner" role="grid" aria-label="Optimal mode timeline: modes by 30-minute slot" aria-rowcount={rows.length} aria-colcount={n} style={{ width, height }}>
          <div className="row hdr" role="row" style={{ height: LAYOUT.timeStrip }}>
            <div className="lab" role="rowheader"><small>Time (UTC)</small></div>
            {slots.map((s) => (
              <div key={s.index} role="columnheader" className={`h${s.onTheHour ? ' hr' : ''}`} title={`${hhmmZ(s.startMs)}`}>
                {s.dateLabel === null ? null : <span className="d">{s.dateLabel}</span>}
                {s.time}
              </div>
            ))}
          </div>
          <div className="row hdr" role="row" style={{ height: LAYOUT.eventStrip }}>
            <div className="lab" role="rowheader"><small>Weather events</small></div>
            <div className="evs" style={{ width: n * LAYOUT.column }}>
              <div className="evw" aria-label="Wind">
                {model.windRuns.map((w) => (
                  <div key={w.startSlot} className="wbar" title={w.title} style={{ left: w.startSlot * LAYOUT.column, width: (w.endSlot - w.startSlot + 1) * LAYOUT.column - 2 }}>{w.label}</div>
                ))}
              </div>
              <div className="evm">
                {slots.map((s) => (
                  <div key={s.index} role="columnheader" className="ic" title={s.eventTitle}>{s.events.join(' ')}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="row hdr traf" role="row" style={{ height: LAYOUT.trafficStrip }}>
            <div className="lab" role="rowheader"><small>Traffic</small></div>
            {slots.map((s) => (
              <div key={s.index} role="columnheader" className={`t lv-${s.level ?? 'x'}`} title={`Traffic ${levelWord(s.level)}`}>
                {s.level === 'busy' ? `${levelLetter(s.level)} ${levelWord(s.level)}` : levelLetter(s.level)}
              </div>
            ))}
          </div>

          {rows.map((r, ri) => (
            <div key={r.modeId} role="row" className={`row${r.isRecommended ? ' isrec' : ''}${r.isCurrent ? ' isact' : ''}`}>
              <div className="lab" role="rowheader" title={r.title}>
                <span>
                  {r.modeId}
                  {r.isRecommended ? <span className="rt rec"> REC</span> : null}
                  {r.isCurrent ? <span className="rt act"> CURRENT</span> : null}
                </span>
                <small>{r.runwaysText}</small>
              </div>
              {(cells[ri] ?? []).map((c, ci) => {
                const active = pos.row === ri && pos.col === ci;
                return (
                  <div
                    key={ci}
                    role="gridcell"
                    ref={(el) => {
                      if (el === null) cellRefs.current.delete(`${ri}:${ci}`);
                      else cellRefs.current.set(`${ri}:${ci}`, el);
                    }}
                    className={`cell ${c.className}${c.uncertain ? ' unc' : ''}${onPath[ri]?.[ci] === true ? ' rec' : ''}`}
                    tabIndex={active ? 0 : -1}
                    aria-label={c.label}
                    aria-describedby={shown !== null && shown.row === ri && shown.col === ci ? 'cell-detail' : undefined}
                    onMouseEnter={(e) => setHover(anchorOf(e.currentTarget, ri, ci))}
                    onMouseLeave={() => setHover(null)}
                    onFocus={(e) => {
                      setPos({ row: ri, col: ci });
                      setHover(anchorOf(e.currentTarget, ri, ci));
                    }}
                    onBlur={() => setHover(null)}
                    onClick={(e) => setPinned(anchorOf(e.currentTarget, ri, ci))}
                    onKeyDown={(e) => onKeyDown(e, ri, ci)}
                  >
                    <span aria-hidden="true">{c.icon}</span>
                    {c.code === '' ? null : <small aria-hidden="true">{c.code}</small>}
                    <span className="sr">{c.word}{c.code === '' ? '' : ` ${c.code}`}</span>
                  </div>
                );
              })}
            </div>
          ))}

          {model.wetRuns.map(([a, b]) => (
            <div key={`w${a}`} className="ov wetband" aria-hidden="true" style={{ left: LAYOUT.label + a * LAYOUT.column, width: (b - a + 1) * LAYOUT.column, top: LAYOUT.timeStrip, height: height - LAYOUT.timeStrip }} />
          ))}
          {model.busyRuns.map(([a, b]) => (
            <div key={`b${a}`} className="ov busyband" aria-hidden="true" style={{ left: LAYOUT.label + a * LAYOUT.column, width: (b - a + 1) * LAYOUT.column, top: LAYOUT.timeStrip + LAYOUT.eventStrip, height: height - LAYOUT.timeStrip - LAYOUT.eventStrip }} />
          ))}
          {model.changeSlots.map((c) => (
            <div key={`c${c}`} className="ov chg" aria-hidden="true" style={{ left: LAYOUT.label + c * LAYOUT.column, top: LAYOUT.timeStrip, height: height - LAYOUT.timeStrip }} />
          ))}
          {showNow ? (
            <div className="ov now" aria-hidden="true" style={{ left: nowLeft, top: 0, height }}>
              <span>NOW {hhmmZ(displayNowMs)}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="legend" aria-label="Legend">
        {LEGEND.map((l) => {
          const st = STATUS_STYLE[l.status];
          return (
            <span key={l.status}>
              <b className={`cell ${st.className}`} aria-hidden="true">{st.icon}</b>
              {l.text}
            </span>
          );
        })}
        <span><b className="cell rec" style={{ marginRight: 8, background: 'var(--panel2)', border: '1px solid var(--line)' }} aria-hidden="true" />Recommended path</span>
        <span>Dashed blue line: planned change</span>
        <span>Amber band: HIGH traffic</span>
        <span>Blue band: wet risk</span>
        <span>White corner: depends on an uncertain input</span>
      </div>

      {detail === null || shown === null ? null : (
        <div id="cell-detail" role="tooltip" className="tip" style={{ left: Math.max(8, Math.min(shown.left, (typeof window === 'undefined' ? 1200 : window.innerWidth) - 380)), top: shown.bottom + 8 }}>
          <DetailBody d={detail} />
        </div>
      )}
    </section>
  );
}
