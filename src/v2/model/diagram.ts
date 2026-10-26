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

// ------------------------------------------------------------ the runway picture's look (issue 141)
/** The asphalt strip's width, across the runway. The approved mockup used 18 units on a 371-wide canvas; scaled to this picture's 300-wide viewBox. */
export const RUNWAY_STRIP_WIDTH = 18 * (DIAGRAM.width / 371);
/** How much wider than the strip the in-use accent glow is drawn (3 units each side). */
export const RUNWAY_ACCENT_EXTRA = 6;
/** Half the widest a runway is ever drawn (the accent glow, which only a used runway carries), plus a small margin: the clearance the wind-label placement search keeps from every runway. */
export const RUNWAY_CLEARANCE = RUNWAY_STRIP_WIDTH / 2 + RUNWAY_ACCENT_EXTRA / 2 + 2;

// ------------------------------------------------------------ label placement
/** The wind label is bold 15 px, the runway names 13 px; widths are estimated from the character count (display only). */
export const WIND_LABEL_FONT = 15;
const WIND_CHAR_W = 8.6;
const NAME_CHAR_W = 7.8;
const EDGE = 4;
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

/**
 * Does the segment pass through (or within `pad` of, on each axis) the box? Exact (Liang-Barsky
 * segment-vs-rectangle clipping), not sampled: a sampled version missed a strip whenever the
 * crossing fell in a narrow gap between sample points (found testing issue 146's fix).
 */
function segmentHits(box: Box, x1: number, y1: number, x2: number, y2: number, pad: number): boolean {
  const bx0 = box.x0 - pad;
  const bx1 = box.x1 + pad;
  const by0 = box.y0 - pad;
  const by1 = box.y1 + pad;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let tmin = 0;
  let tmax = 1;
  for (const [p, q] of [
    [-dx, x1 - bx0],
    [dx, bx1 - x1],
    [-dy, y1 - by0],
    [dy, by1 - y1],
  ] as const) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > tmax) return false;
      if (r > tmin) tmin = r;
    } else {
      if (r < tmin) return false;
      if (r < tmax) tmax = r;
    }
  }
  return tmin <= tmax;
}

/**
 * Put the wind label immediately beside the TAIL of the arrow (the end away from the runways), on the side the wind comes
 * from, so it follows the arrow as the direction changes. Tries straight out from the tail first, then swings round it,
 * and takes the first spot that stays inside the picture and covers no runway name, no runway and no arrow.
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
  const clear = (b: Box): boolean => inside(b) && !endBoxes.some((e) => overlaps(b, e, 2)) && !runwayLines.some((l) => segmentHits(b, l.x1, l.y1, l.x2, l.y2, RUNWAY_CLEARANCE)) && !segmentHits(b, arrow.x1, arrow.y1, arrow.x2, arrow.y2, 5);
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
/** How far beyond the threshold a runway end's name is placed, in line with the runway, before the clearance search (below) nudges it. */
const END_LABEL_BASE_OFFSET = 11;

/**
 * Put a runway end's name (with its ARR/DEP roles) just beyond the threshold, in line with the
 * runway, the way it always has been -- but search further out, and swing round that direction
 * (as far as a right angle: a crowded crossing, such as two pairs meeting at a shallow angle,
 * can leave nothing clear closer in or more in line), for a spot whose horizontal text box
 * clears every runway strip. The fixed offset alone cleared the old 10-unit line; it does not
 * reliably clear the wider asphalt strips (issue 141). `anchor` is fixed (it is what keeps
 * parallel runways' names from colliding with each other); only the distance and the angle round
 * the outward direction are searched. Falls back to the least-bad candidate tried, the way
 * `placeWindLabel` does, if nothing is fully clear (never worse than the plain fixed offset).
 */
function placeEndLabel(threshold: { x: number; y: number }, outward: { x: number; y: number }, anchor: DiagramEnd['anchor'], name: string, roles: readonly Role[], runwayLines: readonly { x1: number; y1: number; x2: number; y2: number }[]): { x: number; y: number } {
  const outAngle = Math.atan2(outward.y, outward.x);
  const inside = (b: Box): boolean => b.x0 >= EDGE && b.x1 <= DIAGRAM.width - EDGE && b.y0 >= EDGE && b.y1 <= DIAGRAM.height - EDGE;
  const clear = (b: Box): boolean => inside(b) && !runwayLines.some((l) => segmentHits(b, l.x1, l.y1, l.x2, l.y2, RUNWAY_CLEARANCE));
  let best: { x: number; y: number; score: number } | null = null;
  for (const dist of [END_LABEL_BASE_OFFSET, 14, 17, 20, 24, 28, 34, 40, 48, 56, 65]) {
    for (const turn of [0, 12, -12, 22, -22, 35, -35, 50, -50, 70, -70, 90, -90, 110, -110]) {
      const a = outAngle + turn * RAD;
      const x = threshold.x + Math.cos(a) * dist;
      const y = threshold.y + Math.sin(a) * dist;
      const b = endBox({ name, x, y, anchor, roles });
      if (clear(b)) return { x, y };
      const hits = runwayLines.filter((l) => segmentHits(b, l.x1, l.y1, l.x2, l.y2, RUNWAY_CLEARANCE)).length;
      const bad = (inside(b) ? 0 : 1000) + hits * 100 + dist * 0.01;
      if (best === null || bad < best.score) best = { x, y, score: bad };
    }
  }
  return best ?? { x: threshold.x + outward.x * END_LABEL_BASE_OFFSET, y: threshold.y + outward.y * END_LABEL_BASE_OFFSET };
}

/** Point-to-segment distance: how close a point comes to a runway's line. */
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

const ARROW_MIN_LENGTH_FRACTION = 0.3;
/** The SVG arrowhead marker's tip sits a little beyond the line's own end point (Picture.tsx's
 *  marker: refX 10 of 14, so about 4 units past (x2,y2) in the direction the line points). */
const ARROW_MARKER_OVERSHOOT = 4.5;
/** A little more than RUNWAY_CLEARANCE itself, so the 1-unit radial search step never leaves a
 *  sliver under it (found on YPAD: 12.25 against a clearance of 12.28). */
const ARROW_SAFETY_MARGIN = 2;

/**
 * The wind arrow runs along one fixed direction (the wind's -- never nudged, so the arrow still
 * points exactly where the wind is from), from a tail at `baseR` out from the picture centre to
 * a head 55% of the way in. When the wind blows straight down a runway's own heading -- not a
 * rare case: a headwind is often why that runway is recommended, and for a single-runway
 * airport it is the only case there is -- the fixed radii can land the head, or even the tail,
 * on a runway's own (now much wider) asphalt strip; a "real", coordinate-based layout can even
 * run a runway almost exactly along that same line for most of its length, so no point along
 * that one line clears it for any useful distance. Keep the angle fixed (it must still point
 * exactly where the wind is from) but let the whole arrow slide sideways, perpendicular to that
 * angle, in small steps either way, and at each sideways position walk the line by distance from
 * there to find a clear stretch. Prefers no sideways move and the usual length and position;
 * falls back to the original fixed radii, unmoved, only if nothing anywhere clears (never worse
 * than before).
 */
function placeArrow(cx: number, cy: number, from: number, baseR: number, runwayLines: readonly { x1: number; y1: number; x2: number; y2: number }[]): { x1: number; y1: number; x2: number; y2: number } {
  const perp = { x: Math.cos(from), y: Math.sin(from) };
  const minLength = baseR * ARROW_MIN_LENGTH_FRACTION;
  const findRun = (pcx: number, pcy: number): { lo: number; hi: number } | null => {
    const at = (r: number): { x: number; y: number } => ({ x: pcx + Math.sin(from) * r, y: pcy - Math.cos(from) * r * 0.95 });
    const safe = (r: number): boolean => {
      const p = at(r);
      return p.x >= EDGE && p.x <= DIAGRAM.width - EDGE && p.y >= EDGE && p.y <= DIAGRAM.height - EDGE && runwayLines.every((l) => distToSegment(p.x, p.y, l.x1, l.y1, l.x2, l.y2) >= RUNWAY_CLEARANCE + ARROW_SAFETY_MARGIN);
    };
    const runs: { lo: number; hi: number }[] = [];
    let open: number | null = null;
    for (let r = 0; r <= baseR * 1.3; r += 1) {
      if (safe(r)) {
        if (open === null) open = r;
      } else if (open !== null) {
        runs.push({ lo: open, hi: r - 1 });
        open = null;
      }
    }
    if (open !== null) runs.push({ lo: open, hi: baseR * 1.3 });
    let best: { lo: number; hi: number } | null = null;
    let bestScore = Infinity;
    for (const run of runs) {
      if (run.hi - run.lo < minLength) continue;
      const score = Math.abs(run.hi - baseR) + Math.abs(run.lo - baseR * 0.55);
      if (score < bestScore) {
        bestScore = score;
        best = run;
      }
    }
    return best;
  };
  for (const off of [0, 8, -8, 16, -16, 24, -24, 32, -32, 42, -42, 55, -55, 70, -70]) {
    const pcx = cx + perp.x * off;
    const pcy = cy + perp.y * off;
    const run = findRun(pcx, pcy);
    if (run === null) continue;
    const r1 = run.hi;
    const r2 = Math.max(run.lo + ARROW_MARKER_OVERSHOOT, r1 - Math.max(minLength, baseR * 0.37));
    const at = (r: number): { x: number; y: number } => ({ x: pcx + Math.sin(from) * r, y: pcy - Math.cos(from) * r * 0.95 });
    const p1 = at(r1);
    const p2 = at(r2);
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }
  const at = (r: number): { x: number; y: number } => ({ x: cx + Math.sin(from) * r, y: cy - Math.cos(from) * r * 0.95 });
  const p1 = at(baseR);
  const p2 = at(baseR * 0.55);
  return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
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

const wrap180 = (d: number): number => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * The runway coordinates give TRUE bearings, but the pack headings and the wind are in the weather's reference
 * (magnetic). The offset between the two (the airport's magnetic variation) is read from the pack itself: the
 * circular mean, over the runways, of the bearing from the coordinates minus the pack heading. Zero when there are
 * no coordinates, or when the runways disagree with each other by more than a few degrees.
 */
function coordinateOffset(groups: (readonly RunwayEnd[])[]): number {
  const offsets: number[] = [];
  for (const g of groups) {
    const a = g[0];
    const b = g[1];
    if (a === undefined || b === undefined) continue;
    const ta = a.threshold;
    const tb = b.threshold;
    if (ta === null || tb === null) continue;
    const north = tb.latitude - ta.latitude;
    const east = (tb.longitude - ta.longitude) * Math.cos(((ta.latitude + tb.latitude) / 2) * RAD);
    const bearing = (Math.atan2(east, north) / RAD + 360) % 360;
    offsets.push(wrap180(bearing - a.headingDegrees));
  }
  if (offsets.length === 0) return 0;
  const s = offsets.reduce((t, o) => t + Math.sin(o * RAD), 0);
  const c = offsets.reduce((t, o) => t + Math.cos(o * RAD), 0);
  const mean = Math.atan2(s, c) / RAD;
  return offsets.every((o) => Math.abs(wrap180(o - mean)) <= 3) ? mean : 0;
}

function realPlacement(groups: (readonly RunwayEnd[])[]): Map<RunwayEnd, { x: number; y: number }> | null {
  const all = groups.flat();
  if (all.length === 0 || all.some((r) => r.threshold === null)) return null;
  const lat0 = all.reduce((s, r) => s + (r.threshold?.latitude ?? 0), 0) / all.length;
  const lon0 = all.reduce((s, r) => s + (r.threshold?.longitude ?? 0), 0) / all.length;
  // Turn the layout from true north into the weather's reference, so the runways sit right against the wind arrow.
  const turn = coordinateOffset(groups) * RAD;
  const cosT = Math.cos(turn);
  const sinT = Math.sin(turn);
  const pts = all.map((r) => {
    const x = ((r.threshold?.longitude ?? 0) - lon0) * Math.cos(lat0 * RAD);
    const y = -((r.threshold?.latitude ?? 0) - lat0);
    return { r, x: x * cosT + y * sinT, y: -x * sinT + y * cosT };
  });
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

  interface RawEnd {
    readonly runwayIndex: number;
    readonly end: RunwayEnd;
    readonly threshold: { x: number; y: number };
    readonly outward: { x: number; y: number };
    readonly anchor: DiagramEnd['anchor'];
  }
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const rawEnds: RawEnd[] = [];
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
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const dx = (bx - ax) / len;
    const dy = (by - ay) / len;
    const anchor: DiagramEnd['anchor'] = side < 0 ? 'end' : side > 0 ? 'start' : 'middle';
    const runwayIndex = lines.length;
    lines.push({ x1: ax, y1: ay, x2: bx, y2: by });
    rawEnds.push({ runwayIndex, end: a, threshold: { x: ax, y: ay }, outward: { x: -dx, y: -dy }, anchor });
    if (b !== undefined) rawEnds.push({ runwayIndex, end: b, threshold: { x: bx, y: by }, outward: { x: dx, y: dy }, anchor });
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

  // Labels are placed once every runway's line is known, so a label can be pushed clear of ANY
  // strip -- not just its own -- which matters for a crossing runway close to an active end.
  const endsByRunway = new Map<number, DiagramEnd[]>();
  for (const raw of rawEnds) {
    const roles = input.modeRoles.get(raw.end.name) ?? [];
    const pos =
      roles.length === 0
        ? { x: raw.threshold.x + raw.outward.x * END_LABEL_BASE_OFFSET, y: raw.threshold.y + raw.outward.y * END_LABEL_BASE_OFFSET }
        : placeEndLabel(raw.threshold, raw.outward, raw.anchor, raw.end.name, roles, lines);
    const list = endsByRunway.get(raw.runwayIndex) ?? [];
    list.push({ name: raw.end.name, x: pos.x, y: pos.y, anchor: raw.anchor, roles });
    endsByRunway.set(raw.runwayIndex, list);
  }
  const runways: DiagramRunway[] = lines.map((line, i) => {
    const ends = endsByRunway.get(i) ?? [];
    return { ...line, ends, used: ends.some((e) => e.roles.length > 0) };
  });

  let arrow: WindArrow | null = null;
  let windPart = 'Wind unknown.';
  const w = input.wind;
  if (w !== null && w.kind === 'steady') {
    const from = w.directionDegrees * RAD;
    const r = 92;
    const { x1, y1, x2, y2 } = placeArrow(cx, cy, from, r, runways);
    arrow = {
      x1,
      y1,
      x2,
      y2,
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
    runways.flatMap((r) => r.ends.filter((e) => e.roles.length > 0).map(endBox)), // only the named (used) ends are drawn
    runways,
  );
  const used = [...input.modeRoles.entries()].map(([name, roles]) => `${name} (${roles.join(' and ')})`);
  const modePart = input.modeLabel === null ? 'No mode is recommended.' : `${input.modeLabel} uses ${used.length === 0 ? 'no runway' : used.join(', ')}.`;
  const names = input.runways.map((r) => r.name).join(', ');
  return { runways, arrow, windLabel, caption: `Runway ends: ${names}. ${windPart} ${modePart}` };
}
