// Geometry of the runway picture (UI_DESIGN section 5, AG-6). v2's own copy of
// v1's diagram model (v2 imports nothing from src/ui); the picture is a little
// taller than v1's. Generated
// from the pack's runway ends only: any number of runways, including one. No
// airport is laid out by hand. North is up; a runway end's heading is the
// direction of landing, so its label sits at the threshold (the start of the roll).
import type { Mode, RunwayEnd } from '../../refdata';
import type { WindObservation } from '../../engine';

export const DIAGRAM = { width: 300, height: 260 } as const;

export type Role = 'ARR' | 'DEP';

export interface DiagramEnd {
  readonly name: string;
  /** Label position. */
  readonly x: number;
  readonly y: number;
  /** Text anchor, so neighbouring labels of parallel runways do not overlap. */
  readonly anchor: 'start' | 'middle' | 'end';
  readonly roles: readonly Role[];
}

export interface DiagramRunway {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly ends: readonly DiagramEnd[];
  readonly used: boolean;
}

export interface WindArrow {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  /** The wind speed, such as "12 kt", drawn beside the tail of the arrow. */
  readonly label: string;
  readonly labelX: number;
  readonly labelY: number;
  /** Which side of labelX the text runs, so it stays clear of the arrow. */
  readonly labelAnchor: 'start' | 'end';
}

/** Where the wind label is drawn, as an SVG text position (the text is vertically centred on y). */
export interface WindLabelPlacement {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly anchor: 'start' | 'middle' | 'end';
  /** 'arrow': immediately beside the tail of the wind arrow. 'corner': no arrow to place it by (variable or unknown wind), top left. */
  readonly place: 'arrow' | 'corner';
}

export interface Diagram {
  readonly runways: readonly DiagramRunway[];
  readonly arrow: WindArrow | null;
  readonly windLabel: WindLabelPlacement;
  /** Text equivalent, for the accessible name and the caption. */
  readonly caption: string;
}

const RAD = Math.PI / 180;

// ------------------------------------------------------------ label placement
/** The wind label is bold 15 px, the runway names 13 px; widths are estimated from the character count (display only). */
export const WIND_LABEL_FONT = 15;
const WIND_CHAR_W = 8.6;
const NAME_CHAR_W = 7.8;
const EDGE = 4;
/** The fixed "N up" note, top right, which the label must not cover either. */
const NORTH_BOX: Box = { x0: DIAGRAM.width - 10 - 34, y0: 6, x1: DIAGRAM.width - 10, y1: 22 };
const GAP_TO_TAIL = 6;

export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

const overlaps = (a: Box, b: Box, pad = 0): boolean => a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad;

/** The box a runway name (with its roles) occupies. */
export function endBox(e: Pick<DiagramEnd, 'name' | 'x' | 'y' | 'anchor' | 'roles'>): Box {
  const w = (e.name.length + (e.roles.length === 0 ? 0 : 1 + e.roles.join('/').length)) * NAME_CHAR_W;
  const x0 = e.anchor === 'start' ? e.x : e.anchor === 'end' ? e.x - w : e.x - w / 2;
  return { x0, y0: e.y - 8, x1: x0 + w, y1: e.y + 8 };
}

/** Does the segment pass through (or within `pad` of) the box? Sampled, which is exact enough for a drawing. */
function segmentHits(box: Box, x1: number, y1: number, x2: number, y2: number, pad: number): boolean {
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (x > box.x0 - pad && x < box.x1 + pad && y > box.y0 - pad && y < box.y1 + pad) return true;
  }
  return false;
}

/**
 * Put the wind label immediately beside the TAIL of the arrow (the end away from the runways), on the side the wind comes
 * from, so it follows the arrow as the direction changes. Tries straight out from the tail first, then swings round it,
 * and takes the first spot that stays inside the picture and covers no runway name, no runway, no arrow and not the north note.
 * With no arrow (variable or unknown wind) the label stays in the top left corner.
 */
export function placeWindLabel(text: string, arrow: Pick<WindArrow, 'x1' | 'y1' | 'x2' | 'y2'> | null, endBoxes: readonly Box[], runwayLines: readonly { x1: number; y1: number; x2: number; y2: number }[]): WindLabelPlacement {
  if (arrow === null) return { text, x: 8, y: 18, anchor: 'start', place: 'corner' };
  const w = text.length * WIND_CHAR_W;
  const h = WIND_LABEL_FONT + 3;
  const ox = arrow.x1 - arrow.x2;
  const oy = arrow.y1 - arrow.y2;
  const len = Math.hypot(ox, oy) || 1;
  const outAngle = Math.atan2(oy / len, ox / len);
  const inside = (b: Box): boolean => b.x0 >= EDGE && b.x1 <= DIAGRAM.width - EDGE && b.y0 >= EDGE && b.y1 <= DIAGRAM.height - EDGE;
  const boxAt = (cx: number, cy: number): Box => ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 });
  const clear = (b: Box): boolean => inside(b) && !overlaps(b, NORTH_BOX) && !endBoxes.some((e) => overlaps(b, e, 2)) && !runwayLines.some((l) => segmentHits(b, l.x1, l.y1, l.x2, l.y2, 7)) && !segmentHits(b, arrow.x1, arrow.y1, arrow.x2, arrow.y2, 5);
  let best: { cx: number; cy: number; score: number } | null = null;
  for (const spread of [1, 1.15, 1.3, 1.5, 1.8, 2.4]) {
    for (const turn of [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90, 110, -110, 135, -135, 160, -160, 180]) {
      const a = outAngle + turn * RAD;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      // far enough out that the box just clears the tail, whichever way round it sits
      const r = (GAP_TO_TAIL + (w / 2) * Math.abs(dx) + (h / 2) * Math.abs(dy)) * spread;
      const cx = arrow.x1 + dx * r;
      const cy = arrow.y1 + dy * r;
      const b = boxAt(cx, cy);
      if (clear(b)) return { text, x: cx, y: cy, anchor: 'middle', place: 'arrow' };
      // kept only as a fallback: the least bad spot (inside the picture) if nothing is fully clear
      const bad = (inside(b) ? 0 : 1000) + endBoxes.filter((e) => overlaps(b, e, 2)).length * 100 + turn * turn * 0.001 + spread;
      if (best === null || bad < best.score) best = { cx, cy, score: bad };
    }
  }
  const f = best ?? { cx: arrow.x1, cy: arrow.y1, score: 0 };
  const cx = Math.max(EDGE + w / 2, Math.min(DIAGRAM.width - EDGE - w / 2, f.cx));
  const cy = Math.max(EDGE + h / 2, Math.min(DIAGRAM.height - EDGE - h / 2, f.cy));
  return { text, x: cx, y: cy, anchor: 'middle', place: 'arrow' };
}
const LENGTH = 130;
const GAP = 22;

/** "16L" -> "34R", "09" -> "27", "36" -> "18"; null when the name is not a runway designator. */
export function oppositeDesignator(name: string): string | null {
  const m = /^(\d{1,2})([LRC]?)$/.exec(name);
  if (m === null) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 36) return null;
  const opposite = ((n + 17) % 36) + 1;
  const side = m[2] === 'L' ? 'R' : m[2] === 'R' ? 'L' : (m[2] ?? '');
  const digits = (m[1] ?? '').length === 2 ? String(opposite).padStart(2, '0') : String(opposite);
  return `${digits}${side}`;
}

const normal = (deg: number): number => ((deg % 360) + 360) % 360;
const angleBetween = (a: number, b: number): number => {
  const d = Math.abs(normal(a) - normal(b));
  return d > 180 ? 360 - d : d;
};

/** Group the ends into physical runways: designator opposites first, then headings 180 apart. */
export function pairEnds(runways: readonly RunwayEnd[]): (readonly RunwayEnd[])[] {
  const taken = new Set<number>();
  const out: RunwayEnd[][] = [];
  runways.forEach((a, i) => {
    if (taken.has(i)) return;
    taken.add(i);
    const wanted = oppositeDesignator(a.name);
    let j = wanted === null ? -1 : runways.findIndex((b, k) => !taken.has(k) && b.name === wanted);
    if (j < 0) {
      let best = -1;
      let bestDiff = 6;
      runways.forEach((b, k) => {
        if (taken.has(k)) return;
        const diff = Math.abs(angleBetween(a.headingDegrees, b.headingDegrees) - 180);
        if (diff < bestDiff) {
          best = k;
          bestDiff = diff;
        }
      });
      j = best;
    }
    const b = j < 0 ? undefined : runways[j];
    if (b !== undefined) taken.add(j);
    out.push(b === undefined ? [a] : [a, b]);
  });
  return out;
}

export interface DiagramInput {
  readonly runways: readonly RunwayEnd[];
  /** Roles of each runway end in the mode being shown. */
  readonly modeRoles: ReadonlyMap<string, readonly Role[]>;
  /** The text drawn beside the arrow, such as "130\u00B0 9 kt". */
  readonly windLabel: string;
  readonly wind: WindObservation | null;
  readonly modeLabel: string | null;
}

/** Roles per runway end for one mode. */
export function rolesOf(mode: Pick<Mode, 'arrivals' | 'departures'> | null): Map<string, Role[]> {
  const out = new Map<string, Role[]>();
  if (mode === null) return out;
  for (const n of mode.arrivals) out.set(n, [...(out.get(n) ?? []), 'ARR']);
  for (const n of mode.departures) out.set(n, [...(out.get(n) ?? []), 'DEP']);
  return out;
}

function realPlacement(groups: (readonly RunwayEnd[])[]): Map<RunwayEnd, { x: number; y: number }> | null {
  const all = groups.flat();
  if (all.length === 0 || all.some((r) => r.threshold === null)) return null;
  const lat0 = all.reduce((s, r) => s + (r.threshold?.latitude ?? 0), 0) / all.length;
  const lon0 = all.reduce((s, r) => s + (r.threshold?.longitude ?? 0), 0) / all.length;
  const pts = all.map((r) => ({ r, x: ((r.threshold?.longitude ?? 0) - lon0) * Math.cos(lat0 * RAD), y: -((r.threshold?.latitude ?? 0) - lat0) }));
  const extent = Math.max(1e-9, ...pts.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y))));
  const scale = 75 / extent;
  const out = new Map<RunwayEnd, { x: number; y: number }>();
  for (const p of pts) out.set(p.r, { x: DIAGRAM.width / 2 + p.x * scale, y: DIAGRAM.height / 2 + p.y * scale });
  return out;
}

export function buildDiagram(input: DiagramInput): Diagram {
  const groups = pairEnds(input.runways);
  const real = realPlacement(groups.filter((g) => g.length === 2));
  const cx = DIAGRAM.width / 2;
  const cy = DIAGRAM.height / 2;

  // Schematic: runways whose axes are within 15 degrees are parallel and are spread sideways.
  const axisOf = (g: readonly RunwayEnd[]): number => normal(g[0]?.headingDegrees ?? 0) % 180;
  const clusters: (readonly RunwayEnd[])[][] = [];
  for (const g of groups) {
    const home = clusters.find((c) => {
      const first = c[0];
      if (first === undefined) return false;
      const diff = Math.abs(axisOf(first) - axisOf(g));
      return Math.min(diff, 180 - diff) < 15;
    });
    if (home === undefined) clusters.push([g]);
    else home.push(g);
  }

  const runways: DiagramRunway[] = [];
  const draw = (g: readonly RunwayEnd[], centreX: number, centreY: number, side: number): void => {
    const a = g[0];
    if (a === undefined) return;
    const h = a.headingDegrees * RAD;
    const ux = Math.sin(h);
    const uy = -Math.cos(h);
    // The a-end threshold is behind the centre, the other end ahead.
    let ax = centreX - (ux * LENGTH) / 2;
    let ay = centreY - (uy * LENGTH) / 2;
    let bx = centreX + (ux * LENGTH) / 2;
    let by = centreY + (uy * LENGTH) / 2;
    const b = g[1];
    if (real !== null && b !== undefined) {
      const pa = real.get(a);
      const pb = real.get(b);
      if (pa !== undefined && pb !== undefined) {
        ax = pa.x;
        ay = pa.y;
        bx = pb.x;
        by = pb.y;
      }
    }
    const label = (end: RunwayEnd, x: number, y: number, outward: { x: number; y: number }): DiagramEnd => ({
      name: end.name,
      x: x + outward.x * 11,
      y: y + outward.y * 11,
      anchor: side < 0 ? 'end' : side > 0 ? 'start' : 'middle',
      roles: input.modeRoles.get(end.name) ?? [],
    });
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const dx = (bx - ax) / len;
    const dy = (by - ay) / len;
    const ends: DiagramEnd[] = [label(a, ax, ay, { x: -dx, y: -dy })];
    if (b !== undefined) ends.push(label(b, bx, by, { x: dx, y: dy }));
    runways.push({ x1: ax, y1: ay, x2: bx, y2: by, ends, used: ends.some((e) => e.roles.length > 0) });
  };

  for (const cluster of clusters) {
    const n = cluster.length;
    const gap = Math.min(GAP, 110 / Math.max(1, n));
    cluster.forEach((g, k) => {
      const first = g[0];
      const h = (first?.headingDegrees ?? 0) * RAD;
      const offset = (k - (n - 1) / 2) * gap;
      // Sideways is at right angles to the heading.
      draw(g, cx + Math.cos(h) * offset, cy + Math.sin(h) * offset, Math.sign(offset) * Math.sign(Math.cos(h) || 1));
    });
  }

  let arrow: WindArrow | null = null;
  let windPart = 'Wind unknown.';
  const w = input.wind;
  if (w !== null && w.kind === 'steady') {
    const from = w.directionDegrees * RAD;
    const r = 92;
    arrow = {
      x1: cx + Math.sin(from) * r,
      y1: cy - Math.cos(from) * r * 0.95,
      x2: cx + Math.sin(from) * r * 0.55,
      y2: cy - Math.cos(from) * r * 0.55 * 0.95,
      label: `${Math.round(w.speedKt)}${w.gustKt === null ? '' : `G${Math.round(w.gustKt)}`} kt`,
      labelX: cx + Math.sin(from) * r + (Math.sin(from) < 0 ? -8 : 8),
      labelY: cy - Math.cos(from) * r * 0.95 + 4,
      labelAnchor: Math.sin(from) < 0 ? 'end' : 'start',
    };
    windPart = `Wind from ${String(Math.round(w.directionDegrees)).padStart(3, '0')} degrees at ${Math.round(w.speedKt)} knots${w.gustKt === null ? '' : `, gusting ${Math.round(w.gustKt)}`}.`;
  } else if (w !== null) {
    windPart = `Wind variable at ${Math.round(w.speedKt)} knots.`;
  }
  const windLabel = placeWindLabel(
    input.windLabel,
    arrow,
    runways.flatMap((r) => r.ends.map(endBox)),
    runways,
  );
  const used = [...input.modeRoles.entries()].map(([name, roles]) => `${name} (${roles.join(' and ')})`);
  const modePart = input.modeLabel === null ? 'No mode is recommended.' : `${input.modeLabel} uses ${used.length === 0 ? 'no runway' : used.join(', ')}.`;
  const names = input.runways.map((r) => r.name).join(', ');
  return { runways, arrow, windLabel, caption: `Runway ends: ${names}. ${windPart} ${modePart}` };
}
