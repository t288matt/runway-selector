// The runway picture: the geometry from the pack's runway headings and the wind
// used for the current slot, with the active runway ends, the tailwind ends and
// the wind arrow. Pure. No runway is named here; every name comes from the pack.
import { runwayWind, withinLimit, type WindObservation } from '../../engine';
import { dir3 } from '../format';
import type { ViewData } from './dashboard';
import { buildDiagram, rolesOf, type Diagram } from './diagram';

/** The wind the picture is drawn with: the wind of the current slot (the same wind v1's diagram uses). */
export function currentWind(view: ViewData): WindObservation | null {
  return view.weather.slots[0]?.weather.wind ?? null;
}

/**
 * The runway ends that would have a tailwind over the limit now (the dry or wet
 * tailwind limit from the pack's settings, by the current runway state, with
 * the pack's tolerance). These carry the cross on the picture.
 */
export function tailwindEnds(view: ViewData): ReadonlySet<string> {
  const { pack } = view;
  const s = pack.settings;
  const state = view.result.evaluation.slots[0]?.runwayState ?? 'DRY';
  const tailLimit = state === 'DRY' ? s.tailwindDryKt : state === 'WET' ? s.tailwindWetKt : Math.min(s.tailwindDryKt, s.tailwindWetKt);
  const wind = currentWind(view);
  const out = new Set<string>();
  if (wind === null || !Number.isFinite(wind.speedKt) || wind.speedKt < 0) return out;
  for (const r of pack.runways) {
    const w = runwayWind(wind, r.headingDegrees, s.calmWindKt);
    if (!withinLimit(w.tailwindKt, tailLimit, s.limitToleranceKt)) out.add(r.name);
  }
  return out;
}

export interface Picture {
  readonly diagram: Diagram;
  /** The text beside the arrow: "030° 7 kt", "VRB 7 kt" or "Wind unknown". */
  readonly windLabel: string;
  /** The accessible name of the picture. */
  readonly title: string;
}

export function pictureModel(view: ViewData): Picture {
  const { pack, result } = view;
  const rec = result.plan.recommendedModeId;
  const mode = rec === null ? null : (pack.modes.find((m) => m.id === rec) ?? null);
  const over = tailwindEnds(view);
  const wind = currentWind(view);
  const diagram = buildDiagram({ runways: pack.runways, modeRoles: rolesOf(mode), overLimit: over, wind, modeLabel: mode === null ? null : `Mode ${mode.id}` });
  const speed = wind === null ? '' : `${Math.round(wind.speedKt)}${wind.gustKt === null ? '' : `G${Math.round(wind.gustKt)}`} kt`;
  const windLabel = wind === null ? 'Wind unknown' : wind.kind === 'steady' ? `${dir3(wind.directionDegrees)}° ${speed}` : `VRB ${speed}`;
  const tail = over.size === 0 ? '' : ` Ends ${[...over].join(', ')} would have a tailwind.`;
  return { diagram, windLabel, title: `${diagram.caption}${tail}` };
}
