// The runway picture: the geometry from the pack's runway headings and the wind
// used for the current slot, with the active runway ends and the wind arrow (the
// wind label sits beside the arrow's tail). There are no cross marks (issue 107). Pure. No runway is named here; every name comes from the pack.
import type { WindObservation } from '../../engine';
import { dir3 } from '../format';
import type { ViewData } from './dashboard';
import { buildDiagram, rolesOf, type Diagram } from './diagram';

/** The wind the picture is drawn with: the wind of the current slot (the same wind v1's diagram uses). */
export function currentWind(view: ViewData): WindObservation | null {
  return view.weather.slots[0]?.weather.wind ?? null;
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
  const wind = currentWind(view);
  const speed = wind === null ? '' : `${Math.round(wind.speedKt)}${wind.gustKt === null ? '' : `G${Math.round(wind.gustKt)}`} kt`;
  const windLabel = wind === null ? 'Wind unknown' : wind.kind === 'steady' ? `${dir3(wind.directionDegrees)}\u00B0 ${speed}` : `VRB ${speed}`;
  const diagram = buildDiagram({ runways: pack.runways, modeRoles: rolesOf(mode), wind, windLabel, modeLabel: mode === null ? null : `Mode ${mode.id}` });
  return { diagram, windLabel, title: diagram.caption };
}
