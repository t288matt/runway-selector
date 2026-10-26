// Issue 112: runway coordinates give TRUE bearings, but the pack headings and the wind are in the weather's
// (magnetic) reference. The picture turns a coordinate-based layout by the offset it reads from the pack itself,
// so the runways sit right against the wind arrow. Nothing changes without coordinates or when the pack's own
// headings and coordinates disagree with each other.
import { describe, expect, it } from 'vitest';
import type { RunwayEnd } from '../../src/refdata';
import { buildDiagram, DIAGRAM, rolesOf, type Diagram } from '../../src/v2/model/diagram';

const end = (name: string, headingDegrees: number, threshold: RunwayEnd['threshold'] = null): RunwayEnd => ({ name, headingDegrees, threshold, source: null });
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
  // Edge cases (issue 120). A runway pair built from a true bearing and a pack heading, so any offset can be set.
  const pair = (nameA: string, nameB: string, trueBearing: number, packHeading: number, lat: number, lon: number): RunwayEnd[] => {
    const len = 0.02;
    const rad = Math.PI / 180;
    const a = at(lat, lon);
    const b = at(lat + Math.cos(trueBearing * rad) * len, lon + (Math.sin(trueBearing * rad) * len) / Math.cos(lat * rad));
    return [end(nameA, packHeading, a), end(nameB, (packHeading + 180) % 360, b)];
  };
  const first = (e: RunwayEnd[]) => diagramOf(e).runways[0]!;

  it('turns correctly across 0/360: true 003, pack 357 (a +6 degree offset)', () => {
    const r = first(pair('36', '18', 3, 357, -33.9, 151.2));
    expect(apart(drawnBearing(r), 357)).toBeLessThan(1);
  });

  it('turns correctly for a negative offset: true 100, pack 107', () => {
    const r = first(pair('11', '29', 100, 107, -33.9, 151.2));
    expect(apart(drawnBearing(r), 107)).toBeLessThan(1);
  });

  it('turns a single runway pair', () => {
    const r = first(pair('16', '34', 168, 155, -33.9, 151.2));
    expect(apart(drawnBearing(r), 155)).toBeLessThan(1);
  });

  it('turns when two runways differ by just under 3 degrees from the mean and leaves the layout alone just over', () => {
    // offsets 13 and 13 + 2 = 15 (mean 14, each 1 off): turned to the mean
    const near = [...pair('16', '34', 168, 155, -33.9, 151.2), ...pair('07', '25', 74, 59, -33.92, 151.22)];
    const turned = diagramOf(near).runways.find((x) => x.ends.some((e) => e.name === '16'))!;
    expect(apart(drawnBearing(turned), 154)).toBeLessThan(1);
    // offsets 13 and 20 (mean 16.5, each 3.5 off): not turned
    const far = [...pair('16', '34', 168, 155, -33.9, 151.2), ...pair('07', '25', 74, 54, -33.92, 151.22)];
    const left = diagramOf(far).runways.find((x) => x.ends.some((e) => e.name === '16'))!;
    expect(apart(drawnBearing(left), 168)).toBeLessThan(1);
  });

  it('keeps every runway inside the picture after the turn', () => {
    for (const offset of [-25, -6, 0, 6, 25]) {
      const e = [...pair('16', '34', 168, 168 - offset, -33.9, 151.2), ...pair('07', '25', 74, 74 - offset, -33.92, 151.22)];
      for (const r of diagramOf(e).runways) {
        for (const v of [r.x1, r.x2]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(DIAGRAM.width);
        }
        for (const v of [r.y1, r.y2]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(DIAGRAM.height);
        }
      }
    }
  });
});
