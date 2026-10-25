// The slim forecast bar: the path across the window with the change line, the
// wind, the forecast-group risk, the wet runway and the traffic micro-bars. It
// is one picture with a summary in words as its accessible name (phase 2 makes
// it expand). Text nodes only (SEC-2).
import type { CSSProperties } from 'react';
import type { ForecastBarModel } from '../model/forecastBar';

const pct = (slot: number, n: number): string => `${(slot / n) * 100}%`;
const span = (start: number, end: number, n: number): CSSProperties => ({ left: pct(start, n), width: `calc(${((end - start + 1) / n) * 100}% - 2px)` });

export function ForecastBar({ model }: { model: ForecastBarModel }) {
  const n = Math.max(1, model.slotCount);
  const change = model.changePct.map((p) => (
    <span key={p} className="chgline" style={{ left: `${p}%` }} aria-hidden="true" />
  ));
  return (
    <section className="fcx" role="img" aria-label={model.summary} data-testid="forecast-bar">
      <div className="sumhead" aria-hidden="true">
        Forecast
        <span className="sp" />
        <span className="hint">{model.rangeText}</span>
      </div>
      <div className="fc2" aria-hidden="true">
        <div className="row">
          <span className="lab">UTC</span>
          <span className="axis">
            {model.axis.map((a) => (
              <span key={a.label + a.leftPct} style={{ left: `${a.leftPct}%` }}>
                {a.label}
              </span>
            ))}
          </span>
        </div>
        <div className="row">
          <span className="lab">Path</span>
          <span className="pathwrap">
            <span className="track" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
              {model.path.map((s) => (
                <span key={s.startSlot} className={`seg ${s.tone}${s.uncertain ? ' unc' : ''}`} style={{ gridColumn: `${s.startSlot + 1} / ${s.endSlot + 2}` }} title={s.title} data-testid="path-seg">
                  {s.label}
                </span>
              ))}
            </span>
            <span className="nowm" style={{ left: `${model.nowPct}%` }} />
            {change}
          </span>
        </div>
        <div className="row">
          <span className="lab">Wind</span>
          <span className="ev">
            {model.wind.map((w) => (
              <b key={w.startSlot} className="wnd" style={span(w.startSlot, w.endSlot, n)} title={w.title}>
                {w.label}
              </b>
            ))}
          </span>
        </div>
        {model.risk.length === 0 ? null : (
          <div className="row">
            <span className="lab">{model.riskLabel}</span>
            <span className="ev">
              {model.risk.map((r) => (
                <b key={r.startSlot} className="tempo" style={span(r.startSlot, r.endSlot, n)} title={r.title}>
                  {r.label}
                </b>
              ))}
            </span>
          </div>
        )}
        {model.wet.length === 0 ? null : (
          <div className="row">
            <span className="lab">Wet</span>
            <span className="ev">
              {model.wet.map((w) => (
                <b key={w.startSlot} className={w.possible ? 'wet possible' : 'wet'} style={span(w.startSlot, w.endSlot, n)}>
                  {w.label}
                </b>
              ))}
            </span>
          </div>
        )}
        <div className="row">
          <span className="lab">Traffic</span>
          <span className="tl" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
            {model.traffic.map((t, i) => (
              <i key={i} className={t.level === null ? 'x' : t.level === 'light' ? 'l' : t.level === 'medium' ? 'm' : 'h'} />
            ))}
          </span>
        </div>
      </div>
    </section>
  );
}
