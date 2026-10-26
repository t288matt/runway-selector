// The runway picture, drawn from the pack's runway headings and the wind used.
// Active ends are blue, the others grey; the wind is an arrow with its label
// ("direction kt") immediately beside the arrow's tail. SVG text nodes only (SEC-2).
import { useId } from 'react';
import { DIAGRAM } from '../model/diagram';
import type { Picture as PictureModel } from '../model/picture';

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
        {d.runways.map((r) => (
          <line key={r.ends.map((e) => e.name).join('-')} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={r.used ? '#3b82f6' : '#3a4b70'} strokeWidth="10" strokeLinecap="round" data-used={r.used ? 'true' : 'false'} />
        ))}
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
