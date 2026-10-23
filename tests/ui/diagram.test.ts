import { describe, expect, it } from 'vitest';
import type { RunwayEnd } from '../../src/refdata';
import { buildDiagram, DIAGRAM, oppositeDesignator, pairEnds, rolesOf } from '../../src/ui/model/diagram';
import { steady } from '../engine/helpers';
import { PACKS, loadPackFrom } from '../helpers/packs';

const end = (name: string, headingDegrees: number, threshold: RunwayEnd['threshold'] = null): RunwayEnd => ({ name, headingDegrees, threshold, status: null, source: null });

describe('runway pairing from names and headings', () => {
  it('finds the opposite designator', () => {
    expect(oppositeDesignator('16L')).toBe('34R');
    expect(oppositeDesignator('34R')).toBe('16L');
    expect(oppositeDesignator('09')).toBe('27');
    expect(oppositeDesignator('9')).toBe('27');
    expect(oppositeDesignator('36')).toBe('18');
    expect(oppositeDesignator('18C')).toBe('36C');
    expect(oppositeDesignator('ALPHA')).toBeNull();
    expect(oppositeDesignator('0')).toBeNull();
  });

  it('pairs ends by designator, then by opposite heading, and leaves a lone end alone', () => {
    const groups = pairEnds([end('16L', 160), end('16R', 160), end('34L', 340), end('34R', 340), end('07', 70), end('25', 250), end('ZZ', 10)]);
    expect(groups.map((g) => g.map((e) => e.name))).toEqual([['16L', '34R'], ['16R', '34L'], ['07', '25'], ['ZZ']]);
    expect(pairEnds([end('N', 0), end('S', 180)]).map((g) => g.map((e) => e.name))).toEqual([['N', 'S']]);
  });
});

describe.each(PACKS.map((p) => [p.name, p] as const))('the diagram is generated from the pack [%s]', (_n, ref) => {
  const pack = loadPackFrom(ref);
  const mode = pack.modes.find((m) => m.enabled) ?? null;
  const d = buildDiagram({ runways: pack.runways, modeRoles: rolesOf(mode), overLimit: new Set(), wind: steady(140, 12, 16), modeLabel: mode === null ? null : `Mode ${mode.id}` });

  it('draws one line per physical runway and labels every end of the pack', () => {
    expect(d.runways.length).toBe(pairEnds(pack.runways).length);
    expect(d.runways.flatMap((r) => r.ends.map((e) => e.name)).sort()).toEqual(pack.runways.map((r) => r.name).sort());
  });

  it('keeps everything inside the picture', () => {
    for (const r of d.runways) {
      for (const [x, y] of [
        [r.x1, r.y1],
        [r.x2, r.y2],
      ] as const) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(DIAGRAM.width);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(DIAGRAM.height);
      }
    }
  });

  it('marks exactly the runways the mode uses, with ARR and DEP', () => {
    const roles = rolesOf(mode);
    for (const r of d.runways) {
      expect(r.used).toBe(r.ends.some((e) => roles.has(e.name)));
      for (const e of r.ends) expect(e.roles).toEqual(roles.get(e.name) ?? []);
    }
    expect(d.runways.some((r) => r.used)).toBe(true);
  });

  it('points the wind arrow from the wind direction towards the middle', () => {
    expect(d.arrow).not.toBeNull();
    const a = d.arrow;
    if (a === null) return;
    // wind from 140: the tail of the arrow is in the south-east and it points north-west
    expect(a.x1).toBeGreaterThan(DIAGRAM.width / 2);
    expect(a.y1).toBeGreaterThan(DIAGRAM.height / 2);
    expect(a.x2).toBeLessThan(a.x1);
    expect(a.y2).toBeLessThan(a.y1);
  });

  it('has a text equivalent naming every runway, the wind and the mode', () => {
    for (const r of pack.runways) expect(d.caption).toContain(r.name);
    expect(d.caption).toContain('Wind from 140 degrees at 12 knots, gusting 16');
    if (mode !== null) expect(d.caption).toContain(`Mode ${mode.id} uses`);
  });
});

describe('edge cases', () => {
  it('draws a single runway, an unpaired end, and no mode or wind', () => {
    const one = buildDiagram({ runways: [end('A', 30), end('B', 210)], modeRoles: rolesOf(null), overLimit: new Set(), wind: null, modeLabel: null });
    expect(one.runways).toHaveLength(1);
    expect(one.arrow).toBeNull();
    expect(one.caption).toContain('Wind unknown');
    expect(one.caption).toContain('No mode is recommended');
    const lone = buildDiagram({ runways: [end('Q', 100)], modeRoles: rolesOf(null), overLimit: new Set(), wind: { kind: 'variable', speedKt: 5, gustKt: null }, modeLabel: null });
    expect(lone.runways[0]?.ends).toHaveLength(1);
    expect(lone.arrow).toBeNull();
    expect(lone.caption).toContain('Wind variable at 5 knots');
  });

  it('handles many runways without leaving the picture', () => {
    const ends: RunwayEnd[] = [];
    for (let i = 0; i < 12; i += 1) ends.push(end(`P${i}`, 90), end(`Q${i}`, 270));
    const d = buildDiagram({ runways: ends, modeRoles: rolesOf(null), overLimit: new Set(), wind: steady(0, 5), modeLabel: null });
    expect(d.runways).toHaveLength(12);
    for (const r of d.runways) {
      expect(r.y1).toBeGreaterThanOrEqual(0);
      expect(r.y1).toBeLessThanOrEqual(DIAGRAM.height);
    }
  });

  it('uses real positions when every end has a threshold', () => {
    const d = buildDiagram({
      runways: [end('A', 90, { latitude: 10, longitude: 20 }), end('B', 270, { latitude: 10, longitude: 20.02 })],
      modeRoles: rolesOf(null),
      overLimit: new Set(['B']),
      wind: null,
      modeLabel: null,
    });
    const r = d.runways[0];
    expect(r?.y1).toBeCloseTo(r?.y2 ?? 0, 5);
    expect(Math.abs((r?.x2 ?? 0) - (r?.x1 ?? 0))).toBeGreaterThan(100);
    expect(r?.ends.find((e) => e.name === 'B')?.over).toBe(true);
  });
});
