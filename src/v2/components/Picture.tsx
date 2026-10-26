// The runway picture, drawn from the pack's runway headings and the wind used.
// Each runway is drawn as asphalt: a grey strip with edge lines, a dashed centreline,
// threshold stripes and the painted runway numbers (issue 141, option B). A used runway
// carries a blue accent glow under the strip; an unused runway keeps its stripes and
// numbers, in muted grey, so the picture keeps meaning without colour alone. The stripes
// and numbers are hidden on a phone by the stylesheet (.rwy-detail, v2.css).
// Active ends are labelled ARR or DEP, the wind is an arrow with its label ("direction kt")
// immediately beside the arrow's tail. SVG text nodes only (SEC-2).
import { useId } from 'react';
import { DIAGRAM, RUNWAY_ACCENT_EXTRA, RUNWAY_STRIP_WIDTH } from '../model/diagram';
import type { Picture as PictureModel } from '../model/picture';

/** Threshold stripes (the "piano keys"): four short bars at each end, clear of the centreline. */
const STRIPE_LENGTH = 7;
const STRIPE_HEIGHT = 1.4;
const STRIPE_INSET = 3;
const STRIPE_Y_OFFSETS = [-5.5, -3.2, 1.8, 4.1];
/** The painted numbers sit this far in from the runway end, along its length. */
const NUMBER_INSET = 17;
const NUMBER_FONT_SIZE = 7;

export function Picture({ model }: { model: PictureModel }) {
  const titleId = useId();
  const markerId = useId();
  const d = model.diagram;
  const font = 'system-ui,Segoe UI,Arial';
  return (
    <figure className="pic">
      <svg viewBox={`0 0 ${DIAGRAM.width} ${DIAGRAM.height}`} role="img" aria-labelledby={titleId} data-testid="picture">
        <title id={titleId}>{model.title}</title>
        <rect width={DIAGRAM.width} height={DIAGRAM.height} rx="8" fill="#0b1426" stroke="#223356" />
        {d.runways.map((r) => {
          const length = Math.hypot(r.x2 - r.x1, r.y2 - r.y1);
          const half = length / 2;
          const cx = (r.x1 + r.x2) / 2;
          const cy = (r.y1 + r.y2) / 2;
          const angleDeg = (Math.atan2(r.y2 - r.y1, r.x2 - r.x1) * 180) / Math.PI;
          const stripFill = r.used ? '#2b3447' : '#222a3c';
          const stripStroke = r.used ? '#cfd8ea' : '#56627f';
          const centreStroke = r.used ? '#e6ecf7' : '#56627f';
          const markingFill = r.used ? '#e6ecf7' : '#56627f';
          const numberFill = r.used ? '#e6ecf7' : '#7f8cab';
          return (
            <g
              key={r.ends.map((e) => e.name).join('-')}
              transform={`translate(${cx} ${cy}) rotate(${angleDeg})`}
              data-used={r.used ? 'true' : 'false'}
            >
              {r.used ? (
                <rect
                  className="rwy-accent"
                  x={-half}
                  y={-(RUNWAY_STRIP_WIDTH / 2 + RUNWAY_ACCENT_EXTRA / 2)}
                  width={length}
                  height={RUNWAY_STRIP_WIDTH + RUNWAY_ACCENT_EXTRA}
                  fill="#3b82f6"
                  opacity="0.35"
                />
              ) : null}
              <rect className="rwy-strip" x={-half} y={-RUNWAY_STRIP_WIDTH / 2} width={length} height={RUNWAY_STRIP_WIDTH} fill={stripFill} stroke={stripStroke} strokeWidth="1" />
              <line className="rwy-centreline" x1={-half + 0.17 * length} y1={0} x2={half - 0.17 * length} y2={0} stroke={centreStroke} strokeWidth="1.2" strokeDasharray="7 5" />
              <g className="rwy-detail" aria-hidden="true">
                {[-1, 1].map((endSign) => {
                  const x0 = endSign < 0 ? -half + STRIPE_INSET : half - STRIPE_INSET - STRIPE_LENGTH;
                  return STRIPE_Y_OFFSETS.map((y) => (
                    <rect key={`stripe-${endSign}-${y}`} className="rwy-stripe" x={x0} y={y - STRIPE_HEIGHT / 2} width={STRIPE_LENGTH} height={STRIPE_HEIGHT} fill={markingFill} />
                  ));
                })}
                {r.ends.map((e, i) => {
                  const endSign = i === 0 ? -1 : 1;
                  const x = endSign * (half - NUMBER_INSET);
                  const rotation = i === 0 ? 90 : -90;
                  return (
                    <text
                      key={e.name}
                      className="rwy-number"
                      x={0}
                      y={0}
                      transform={`translate(${x} 0) rotate(${rotation})`}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontFamily={font}
                      fontSize={NUMBER_FONT_SIZE}
                      fontWeight={700}
                      fill={numberFill}
                    >
                      {e.name}
                    </text>
                  );
                })}
              </g>
            </g>
          );
        })}
        <g fontFamily={font} fontSize="13" fill="#e6ecf7">
          {d.runways.flatMap((r) =>
            r.ends.filter((e) => e.roles.length > 0).map((e) => (
              <text key={e.name} x={e.x} y={e.y} textAnchor={e.anchor} dominantBaseline="middle" fontWeight={e.roles.length > 0 ? 700 : 400} fill={e.roles.length > 0 ? '#e6ecf7' : '#9db0cf'}>
                {e.name}
                {e.roles.length > 0 ? ` ${e.roles.join('/')}` : ''}
              </text>
            )),
          )}
        </g>
        {d.arrow === null ? null : (
          <g fill="#ffb454" stroke="#ffb454">
            <defs>
              <marker id={markerId} markerUnits="userSpaceOnUse" markerWidth="14" markerHeight="14" refX="10" refY="7" orient="auto">
                <path d="M0,0 L14,7 L0,14 z" stroke="none" />
              </marker>
            </defs>
            <line x1={d.arrow.x1} y1={d.arrow.y1} x2={d.arrow.x2} y2={d.arrow.y2} strokeWidth="5" strokeLinecap="round" markerEnd={`url(#${markerId})`} />
          </g>
        )}
        <text x={d.windLabel.x} y={d.windLabel.y} textAnchor={d.windLabel.anchor} dominantBaseline="middle" fontFamily={font} fontSize="15" fontWeight="800" fill={d.arrow === null ? '#9db0cf' : '#ffb454'} data-testid="wind-label" data-place={d.windLabel.place}>
          {d.windLabel.text}
        </text>
      </svg>
    </figure>
  );
}
