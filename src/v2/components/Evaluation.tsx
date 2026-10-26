// What the "Evaluation and TAF" section holds when it is open, and nothing else:
// v1's timeline block (the UTC time row with the NOW marker; the weather events
// row with the wind bars and the TEMPO, INTER and PROB bars; the event words; the
// traffic row; one row per mode with its REC tag and runways; the cells; the
// dashed change line and the busy band), v1's legend, and the raw METAR and TAF.
// Colour never stands alone: every cell has a glyph or a cause word, and the
// full detail is text in the shared popover. Text nodes only (SEC-2).
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { LEGEND_GLYPH, moveFocus, type EvaluationModel, type LegendItem, type RawReport } from '../model/evaluation';
import { Tip } from './Popover';

const frac = (slot: number, n: number): number => (n === 0 ? 0 : slot / n);
/** A position along the slot columns, as a share of the room right of the row labels. */
const along = (f: number): string => `calc(var(--labw) + (100% - var(--labw)) * ${f})`;
const alongWidth = (f: number): string => `calc((100% - var(--labw)) * ${f})`;
const barStyle = (start: number, end: number, n: number): CSSProperties => ({ left: `${frac(start, n) * 100}%`, width: `calc(${frac(end - start + 1, n) * 100}% - 2px)` });

function LegendSwatch({ item }: { item: LegendItem }) {
  switch (item.key) {
    case 'suitable':
    case 'unsuitable':
    case 'unknown':
      return (
        <b className={`cell ${item.key === 'suitable' ? 'cs-suitable' : item.key === 'unsuitable' ? 'cs-unsuitable' : 'cs-unknown'}`} aria-hidden="true">
          {LEGEND_GLYPH[item.key]}
        </b>
      );
    case 'green-word':
      return (
        <b className="cell cs-suitable wide" aria-hidden="true">
          <small>TEMPO</small>
        </b>
      );
    case 'path':
      return <b className="cell rec swatch" aria-hidden="true" />;
    default:
      return null;
  }
}

export function Legend({ items }: { items: readonly LegendItem[] }) {
  return (
    <div className="legend" aria-label="Legend" data-testid="legend">
      {items.map((l) => (
        <span key={l.key}>
          <LegendSwatch item={l} />
          {l.text}
        </span>
      ))}
    </div>
  );
}

export function RawReports({ metar, taf }: { metar: RawReport; taf: RawReport }) {
  return (
    <section className="raw" aria-label="Raw METAR and TAF" data-testid="raw-reports">
      {[metar, taf].map((r) => (
        <div key={r.label} className="wxbox">
          <span className="lbl">{r.label}</span>
          <div className={`mono rawtext${r.text === null ? ' none' : ''}`} data-testid={`raw-${r.label.toLowerCase()}`}>
            {r.text ?? r.empty}
          </div>
        </div>
      ))}
    </section>
  );
}

export function Evaluation({ model }: { model: EvaluationModel }) {
  const n = model.slotCount;
  const rows = model.rows;
  const [pos, setPos] = useState({ row: 0, col: 0 });
  const cellRefs = useRef(new Map<string, HTMLElement>());
  const wantFocus = useRef(false);
  const changeCol = model.changeSlots[0] ?? null;
  // If the number of rows or columns shrinks under the focus position (a new calculation), keep it inside the grid.
  const at = { row: Math.min(pos.row, Math.max(0, rows.length - 1)), col: Math.min(pos.col, Math.max(0, n - 1)) };

  useLayoutEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    const el = cellRefs.current.get(`${pos.row}:${pos.col}`);
    el?.focus();
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pos]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>, row: number, col: number): void => {
    const next = moveFocus(e.key, { row, col }, rows.length, n, model.nowCol, changeCol);
    if (next === null) return;
    e.preventDefault();
    wantFocus.current = true;
    setPos(next);
  };

  const vars = { '--n': n, '--cols': `var(--labw) repeat(${n}, minmax(var(--cell), 1fr))` } as CSSProperties;
  return (
    <div className="exp" data-testid="evaluation">
      <div className="tlx">
        <div className="inner" role="grid" aria-label="Modes by 30-minute slot" aria-rowcount={rows.length} aria-colcount={n} style={vars}>
          <div className="row" role="row">
            <div className="lab hd" role="rowheader">
              Time (UTC)
            </div>
            <div className="tg">
              {model.slots.map((s) => (
                <div key={s.index} role="columnheader" className={`h${s.onTheHour ? ' hr' : ''}`} data-testid="slot-time">
                  {s.dateLabel === null ? null : <span className="d">{s.dateLabel}</span>}
                  {s.time}
                </div>
              ))}
            </div>
          </div>

          <div className="below">
            <div className="row" role="row">
              <div className="lab hd" role="rowheader">
                Weather events
              </div>
              <div className="evs">
                <div className="evw" role="group" aria-label="Wind">
                  {model.windRuns.map((w) => (
                    <div key={w.startSlot} className="wbar" title={w.title} style={barStyle(w.startSlot, w.endSlot, n)} data-testid="wind-bar">
                      {w.label}
                    </div>
                  ))}
                </div>
                {Array.from({ length: model.overlayLanes }, (_, lane) => (
                  <div key={lane} className="evw" role="group" aria-label="TEMPO, INTER and PROB groups">
                    {model.overlayBars
                      .filter((b) => b.lane === lane)
                      .map((b) => (
                        <div key={`${b.label}@${b.startSlot}`} className={`obar${b.probability ? ' prob' : ''}`} title={b.label} style={barStyle(b.startSlot, b.endSlot, n)} data-testid="group-bar">
                          {b.displayLabel}
                        </div>
                      ))}
                  </div>
                ))}
                {model.hasEventText ? (
                  <div className="tg">
                    {model.slots.map((s) => (
                      <div key={s.index} className="ic" title={s.eventTitle}>
                        {s.events.join(' ')}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="lower">
              <div className="row traf" role="row">
                <div className="lab hd" role="rowheader">
                  Traffic
                </div>
                <div className="tg">
                  {model.slots.map((s) => (
                    <div key={s.index} className={`t lv-${s.level === null ? 'x' : s.level}`} title={s.levelTitle} data-testid="traffic-cell">
                      {s.levelShort}
                    </div>
                  ))}
                </div>
              </div>

              {rows.map((r, ri) => (
                <div key={r.modeId} role="row" className={`row${r.isRecommended ? ' isrec' : ''}${r.isCurrent ? ' isact' : ''}`} data-testid="mode-row">
                  <div className="lab" role="rowheader" title={r.title}>
                    <span>
                      {r.modeId}
                      {r.isRecommended ? <span className="rt rec"> REC</span> : null}
                      {r.isCurrent ? <span className="rt act"> CURRENT</span> : null}
                    </span>
                    <small>{r.runwaysText}</small>
                  </div>
                  {r.cells.map((c, ci) => {
                    const active = at.row === ri && at.col === ci;
                    return (
                      <Tip
                        key={ci}
                        tag="div"
                        role="gridcell"
                        text={c.detail}
                        className={`cell ${c.className}${c.uncertain ? ' unc' : ''}${c.onPath ? ' rec' : ''}`}
                        tabIndex={active ? 0 : -1}
                        aria-label={c.label}
                        data-testid="eval-cell"
                        data-status={c.status}
                        elRef={(el) => {
                          if (el === null) cellRefs.current.delete(`${ri}:${ci}`);
                          else cellRefs.current.set(`${ri}:${ci}`, el);
                        }}
                        onFocus={() => setPos({ row: ri, col: ci })}
                        onKeyDown={(e) => onKeyDown(e, ri, ci)}
                      >
                        <span aria-hidden="true">{c.icon}</span>
                        {c.code === '' ? null : (
                          <small aria-hidden="true" data-testid="cell-code">
                            {c.code}
                          </small>
                        )}
                      </Tip>
                    );
                  })}
                </div>
              ))}

              {model.busyRuns.map(([a, b]) => (
                <div key={`b${a}`} className="ov busyband" aria-hidden="true" data-testid="busy-band" style={{ left: along(frac(a, n)), width: alongWidth(frac(b - a + 1, n)) }} />
              ))}
            </div>

            {model.changeSlots.map((c) => (
              <div key={`c${c}`} className="ov chg" aria-hidden="true" data-testid="change-line" style={{ left: along(frac(c, n)) }} />
            ))}
          </div>

          {model.showNow ? (
            <div className="ov now" aria-hidden="true" data-testid="now-marker" style={{ left: along(frac(model.nowSlotFraction, n)) }}>
              <span>{model.nowText}</span>
            </div>
          ) : null}
        </div>
      </div>
      <Legend items={model.legend} />
      <RawReports metar={model.metar} taf={model.taf} />
    </div>
  );
}
