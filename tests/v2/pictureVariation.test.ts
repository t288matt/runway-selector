// Issue 112: runway coordinates give TRUE bearings, but the pack headings and the wind are in the weather's
// (magnetic) reference. The picture turns a coordinate-based layout by the offset it reads from the pack itself,
// so the runways sit right against the wind arrow. Nothing changes without coordinates or when the pack's own
// headings and coordinates disagree with each other.
import { describe, expect, it } from 'vitest';
import type { RunwayEnd } from '../../src/refdata';
import { buildDiagram, rolesOf, type Diagram } from '../../src/v2/model/diagram';

const end = (name: string, headingDegrees: number, threshold: RunwayEnd['threshold'] = null): RunwayEnd => ({ name, headingDegrees, threshold, status: null, source: null });
const at = (latitude: number, longitude: number) => ({ latitude, longitude });

// Two crossing runways at about 34 degrees south: true bearings 168 and 74, pack (magnetic) headings 155 and 62.
const R16R = at(-33.9294, 151.172);
const R34L = at(-33.9643, 151.181);
const R07 = at(-33.9437, 151.164);
const R25 = at(-33.9375, 151.19);

function diagramOf(ends: RunwayEnd[]): Diagram {
  return buildDiagram({ runways: ends, modeRoles: rolesOf(null), wind: null, modeLabel: null, windLabel: 'Wind unknown' });
}
/** The bearing a drawn runway has in the picture (north up), first end to second end. */
const drawnBearing = (r: { x1: number; y1: number; x2: number; y2: number }): number => ((Math.atan2(r.x2 - r.x1, -(r.y2 - r.y1)) * 180) / Math.PI + 360) % 360;
const apart = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

describe('the coordinate layout is turned into the weather reference (issue 112)', () => {
  const ends = [end('16R', 155, R16R), end('34L', 335, R34L), end('07', 62, R07), end('25', 242, R25)];

  it('draws each runway at its pack heading (within a degree) when the coordinates are true bearings', () => {
    const runways = diagramOf(ends).runways;
    expect(runways).toHaveLength(2);
    const byName = (n: string) => runways.find((r) => r.ends.some((e) => e.name === n));
    expect(apart(drawnBearing(byName('16R')!), 155)).toBeLessThan(1);
    expect(apart(drawnBearing(byName('07')!), 62)).toBeLessThan(1);
  });

  it('leaves the layout as the coordinates draw it when the pack headings already agree (no offset)', () => {
    const agreeing = [end('16R', 168, R16R), end('34L', 348, R34L), end('07', 74, R07), end('25', 254, R25)];
    const runways = diagramOf(agreeing).runways;
    const r = runways.find((x) => x.ends.some((e) => e.name === '16R'))!;
    expect(apart(drawnBearing(r), 168)).toBeLessThan(1);
  });

  it('does not turn the layout when the runways disagree with each other by more than a few degrees', () => {
    // 07/25 given a heading 34 degrees from its coordinates, 16R/34L 13 degrees: no single offset fits both
    const mixed = [end('16R', 155, R16R), end('34L', 335, R34L), end('07', 40, R07), end('25', 220, R25)];
    const r = diagramOf(mixed).runways.find((x) => x.ends.some((e) => e.name === '16R'))!;
    expect(apart(drawnBearing(r), 168)).toBeLessThan(1); // left as the true bearing the coordinates give
  });

  it('draws by the pack headings, unchanged, when there are no coordinates', () => {
    const none = [end('16R', 155), end('34L', 335)];
    const r = diagramOf(none).runways[0]!;
    expect(apart(drawnBearing(r), 155)).toBeLessThan(0.5);
  });
});
