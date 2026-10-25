// The small drawings: state glyphs, the trend arrow, the weather icons and the
// chip shapes. All are decorative (aria-hidden); the words beside them, or the
// accessible name of the thing they sit in, carry the meaning. SVG only, no
// emoji (colour is never the only signal).
import type { Glyph } from '../model/answer';
import type { ChipShape } from '../model/chips';
import type { TrendDirection } from '../model/tiles';

export function StateGlyph({ glyph }: { glyph: Glyph }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {glyph === 'tick' ? <path d="M2.5 8.5l3.5 3.5 7.5-8" /> : null}
      {glyph === 'triangle' ? <path d="M8 2l7 12H1z" /> : null}
      {glyph === 'cross' ? <path d="M3 3l10 10M13 3L3 13" /> : null}
      {glyph === 'question' ? <path d="M5.5 5.5a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.1 1-1.1 1.8M8 12.6v.1" /> : null}
    </svg>
  );
}

const TREND_PATH: Readonly<Record<Exclude<TrendDirection, 'none'>, string>> = {
  steady: 'M4 12H20M14 6l6 6-6 6',
  increasing: 'M5 19L19 5M10 5h9v9',
  decreasing: 'M5 5L19 19M10 19h9v-9',
};

/** Sideways grey is steady, 45 degrees climbing amber is increasing, 45 degrees descending blue is decreasing. */
export function TrendArrow({ direction }: { direction: Exclude<TrendDirection, 'none'> }) {
  const cls = direction === 'steady' ? 't-flat' : direction === 'increasing' ? 't-up' : 't-down';
  return (
    <svg className={`trend ${cls}`} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-trend={direction}>
      <path d={TREND_PATH[direction]} />
    </svg>
  );
}

export function TrafficBars({ lit }: { lit: 0 | 1 | 2 | 3 }) {
  return (
    <span className="bars" aria-hidden="true">
      {[6, 12, 18].map((h, i) => (
        <i key={h} className={i < lit ? 'on' : undefined} style={{ height: h }} />
      ))}
    </span>
  );
}

export function CloudIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 18h12a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.4 3.4 0 0 0 6 18z" fill="none" stroke="#9db0cf" strokeWidth="2" />
    </svg>
  );
}

export function DropIcon({ possible }: { possible: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3C8 9 6 12 6 15a6 6 0 0 0 12 0c0-3-2-6-6-12z" fill={possible ? 'none' : '#5bb8e8'} stroke="#5bb8e8" strokeWidth="2" strokeDasharray={possible ? '3 2' : undefined} />
    </svg>
  );
}

/** The chip shape: a round dot is fresh, a triangle stale, a cross failed, a ring not entered, a loop the plan. */
export function ChipShapeIcon({ shape }: { shape: ChipShape }) {
  return (
    <svg className={`sh sh-${shape}`} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {shape === 'dot' ? <circle cx="6" cy="6" r="4" fill="currentColor" stroke="none" /> : null}
      {shape === 'ring' ? <circle cx="6" cy="6" r="3.6" /> : null}
      {shape === 'triangle' ? <path d="M6 1.5l5 9H1z" fill="currentColor" /> : null}
      {shape === 'cross' ? <path d="M2 2l8 8M10 2L2 10" /> : null}
      {shape === 'refresh' ? <path d="M10 4.5A4.3 4.3 0 0 0 2.2 5M2 2v3h3M2 7.5A4.3 4.3 0 0 0 9.8 7M10 10V7H7" /> : null}
    </svg>
  );
}
