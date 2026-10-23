import { describe, expect, it } from 'vitest';
import { componentsAt, effectiveSpeedKt, inClockwiseRange, isUsableWind, nearLimit, runwayWind, withinLimit, worstInRange } from '../../src/engine/wind';
import { steady, vrb } from './helpers';

const rad = (deg: number): number => (deg * Math.PI) / 180;

describe('wind components', () => {
  it('a wind from the runway heading is a pure headwind', () => {
    const c = componentsAt(155, 155, 20);
    expect(c.headwindKt).toBeCloseTo(20, 9);
    expect(c.tailwindKt).toBe(0);
    expect(c.crosswindKt).toBeCloseTo(0, 9);
  });

  it('a wind from behind is a pure tailwind', () => {
    const c = componentsAt(155, 335, 12);
    expect(c.tailwindKt).toBeCloseTo(12, 9);
    expect(c.headwindKt).toBeCloseTo(-12, 9);
  });

  it('uses the standard formulas with no rounding', () => {
    const c = componentsAt(100, 130, 17.3);
    expect(c.headwindKt).toBe(17.3 * Math.cos(rad(30)));
    expect(c.crosswindKt).toBe(Math.abs(17.3 * Math.sin(rad(30))));
  });

  it('speed is the stronger of mean and gust', () => {
    expect(effectiveSpeedKt(steady(0, 10, 25))).toBe(25);
    expect(effectiveSpeedKt(steady(0, 10, 4))).toBe(10);
    expect(effectiveSpeedKt(steady(0, 10))).toBe(10);
    expect(effectiveSpeedKt(vrb(6, 12))).toBe(12);
  });

  it('crosswind is the same on either side', () => {
    expect(componentsAt(90, 150, 10).crosswindKt).toBeCloseTo(componentsAt(90, 30, 10).crosswindKt, 9);
  });
});

describe('direction range', () => {
  it('tests the worst tailwind at the critical angle when the range contains it', () => {
    const w = worstInRange(100, 250, 310, 10);
    expect(w.tailwindKt).toBeCloseTo(10, 9);
  });

  it('tests an end of the range when the critical angle is outside it', () => {
    const w = worstInRange(100, 300, 330, 10);
    expect(w.tailwindKt).toBeCloseTo(10 * Math.cos(rad(20)), 9);
    expect(w.crosswindKt).toBeCloseTo(10 * Math.sin(rad(50)), 9);
  });

  it('finds the worst crosswind separately from the worst tailwind', () => {
    const w = worstInRange(100, 150, 230, 10);
    expect(w.crosswindKt).toBeCloseTo(10, 9);
    expect(w.tailwindKt).toBeCloseTo(10 * Math.cos(rad(50)), 9);
  });

  it('works across north', () => {
    expect(inClockwiseRange(5, 350, 20)).toBe(true);
    expect(inClockwiseRange(180, 350, 20)).toBe(false);
    expect(inClockwiseRange(350, 350, 20)).toBe(true);
    expect(inClockwiseRange(20, 350, 20)).toBe(true);
  });
});

describe('calm, variable and usability', () => {
  it('speed at or below the calm threshold gives no tailwind and no crosswind', () => {
    const w = runwayWind(steady(335, 3), 155, 3);
    expect(w.calm).toBe(true);
    expect(w.tailwindKt).toBe(0);
    expect(w.crosswindKt).toBe(0);
    expect(runwayWind(vrb(3), 155, 3).variableAboveCalm).toBe(false);
  });

  it('just above the calm threshold the real components apply', () => {
    const w = runwayWind(steady(335, 3.01), 155, 3);
    expect(w.calm).toBe(false);
    expect(w.tailwindKt).toBeCloseTo(3.01, 9);
  });

  it('variable wind above calm has no direction and uses the full speed as the worst case', () => {
    const w = runwayWind(vrb(5, 9), 155, 3);
    expect(w.variableAboveCalm).toBe(true);
    expect(w.headwindKt).toBeNull();
    expect(w.tailwindKt).toBe(9);
    expect(w.crosswindKt).toBe(9);
  });

  it('refuses numbers the maths cannot use', () => {
    expect(isUsableWind(steady(Number.NaN, 5))).toBe(false);
    expect(isUsableWind(steady(90, Number.POSITIVE_INFINITY))).toBe(false);
    expect(isUsableWind(steady(90, 5, Number.NaN))).toBe(false);
    expect(isUsableWind(steady(90, -1))).toBe(false);
    expect(isUsableWind(steady(90, 5, null, [Number.NaN, 100]))).toBe(false);
    expect(isUsableWind(null)).toBe(false);
    expect(isUsableWind(steady(90, 5))).toBe(true);
  });
});

describe('limit comparison', () => {
  it('passes at the limit plus the tolerance and fails above it', () => {
    expect(withinLimit(5.05, 5, 0.05)).toBe(true);
    expect(withinLimit(5.0500001, 5, 0.05)).toBe(false);
  });

  it('float noise on a zero limit passes', () => {
    expect(withinLimit(1e-15, 0, 0.05)).toBe(true);
    expect(withinLimit(1e-15, 0, 0)).toBe(false);
  });

  it('the near-limit margin never applies to a zero limit and ignores noise', () => {
    expect(nearLimit(0.04, 0, 3, 0.05)).toBe(false);
    expect(nearLimit(1e-15, 2, 3, 0.05)).toBe(false);
    expect(nearLimit(0.06, 2, 3, 0.05)).toBe(true);
    expect(nearLimit(2, 5, 3, 0.05)).toBe(true);
    expect(nearLimit(1.9, 5, 3, 0.05)).toBe(false);
  });
});
