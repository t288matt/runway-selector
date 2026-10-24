// Geometry of the runway diagram, Panel F (UI_DESIGN section 5, AG-6). Generated
// from the pack's runway ends only: any number of runways, including one. No
// airport is laid out by hand. North is up; a runway end's heading is the
// direction of landing, so its label sits at the threshold (the start of the roll).
import type { Mode, RunwayEnd } from '../../refdata';
import type { WindObservation } from '../../engine';

export const DIAGRAM = { width: 300, height: 200 } as const;

export type Role = 'ARR' | 'DEP';

export interface DiagramEnd {
  readonly name: string;
  /** Label position. */
  readonly x: number;
  readonly y: number;
  /** Text anchor, so neighbouring labels of parallel runways do not overlap. */
  readonly anchor: 'start' | 'middle' | 'end';
  readonly roles: readonly Role[];
  /** The end is over a limit (cross icon beside the label). */
  readonly over: boolean;
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

export interface Diagram {
  readonly runways: readonly DiagramRunway[];
  readonly arrow: WindArrow | null;
  /** Text equivalent, for the accessible name and the caption. */
  readonly caption: string;
}

const RAD = Math.PI / 180;
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
  readonly overLimit: ReadonlySet<string>;
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
      over: input.overLimit.has(end.name),
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
  const used = [...input.modeRoles.entries()].map(([name, roles]) => `${name} (${roles.join(' and ')})`);
  const modePart = input.modeLabel === null ? 'No mode is recommended.' : `${input.modeLabel} uses ${used.length === 0 ? 'no runway' : used.join(', ')}.`;
  const names = input.runways.map((r) => r.name).join(', ');
  return { runways, arrow, caption: `Runway ends: ${names}. ${windPart} ${modePart}` };
}
