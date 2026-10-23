// Wind maths (REQUIREMENTS WC-2, WC-3, WC-11; DESIGN section 7). Pure functions.
// Nothing here knows an airport: headings, limits and thresholds are arguments.
// Nothing is rounded: display rounding is the user interface's job.
import type { WindObservation } from './inputs';

const DEG_TO_RAD = Math.PI / 180;

/** Components of one wind on one runway end, in knots. */
export interface Components {
  /** Positive towards the runway end's direction of travel; may be negative (a tailwind). */
  readonly headwindKt: number;
  /** max(0, -headwind). */
  readonly tailwindKt: number;
  /** abs(speed x sin(direction - heading)). */
  readonly crosswindKt: number;
}

/** The speed the limits use: the stronger of the mean wind and the gust (WC-2). */
export function effectiveSpeedKt(wind: WindObservation): number {
  return wind.gustKt === null ? wind.speedKt : Math.max(wind.speedKt, wind.gustKt);
}

/** Calm: speed at or below the pack's calm threshold (WC-11). */
export function isCalm(speedKt: number, calmWindKt: number): boolean {
  return speedKt <= calmWindKt;
}

/** A wind the maths can use: every number finite, speeds not negative. Anything else is treated as unknown. */
export function isUsableWind(wind: WindObservation | null): wind is WindObservation {
  if (wind === null) return false;
  if (!Number.isFinite(wind.speedKt) || wind.speedKt < 0) return false;
  if (wind.gustKt !== null && (!Number.isFinite(wind.gustKt) || wind.gustKt < 0)) return false;
  if (wind.kind === 'steady') {
    if (!Number.isFinite(wind.directionDegrees)) return false;
    if (wind.variableRangeDegrees !== null) {
      const [from, to] = wind.variableRangeDegrees;
      if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
    }
  }
  return true;
}

/** Components of a single wind direction on one heading. */
export function componentsAt(headingDegrees: number, directionDegrees: number, speedKt: number): Components {
  const angle = (directionDegrees - headingDegrees) * DEG_TO_RAD;
  const headwindKt = speedKt * Math.cos(angle);
  return { headwindKt, tailwindKt: Math.max(0, -headwindKt), crosswindKt: Math.abs(speedKt * Math.sin(angle)) };
}

/** A range that spans 360 degrees (for example 000V360) or whose ends are equal covers every direction. */
export function isFullCircle(from: number, to: number): boolean {
  return (to - from) % 360 === 0;
}

/** Is `direction` inside the clockwise range from `from` to `to` (both ends included)? */
export function inClockwiseRange(direction: number, from: number, to: number): boolean {
  if (isFullCircle(from, to)) return true;
  const span = (((to - from) % 360) + 360) % 360;
  const offset = (((direction - from) % 360) + 360) % 360;
  return offset <= span;
}

/**
 * Worst tailwind and worst crosswind over a clockwise direction range, found
 * separately (WC-11). Both are extremes of smooth functions of the direction,
 * so the worst case is at an end of the range or at a critical angle inside it:
 * the direction straight behind the runway end (largest tailwind) or at right
 * angles to it (largest crosswind).
 */
export function worstInRange(
  headingDegrees: number,
  fromDegrees: number,
  toDegrees: number,
  speedKt: number,
): { readonly tailwindKt: number; readonly crosswindKt: number } {
  const candidates = [fromDegrees, toDegrees];
  const full = isFullCircle(fromDegrees, toDegrees);
  for (const critical of [headingDegrees + 180, headingDegrees + 90, headingDegrees + 270]) {
    if (full || inClockwiseRange(critical, fromDegrees, toDegrees)) candidates.push(critical);
  }
  let tailwindKt = 0;
  let crosswindKt = 0;
  for (const direction of candidates) {
    const c = componentsAt(headingDegrees, direction, speedKt);
    if (c.tailwindKt > tailwindKt) tailwindKt = c.tailwindKt;
    if (c.crosswindKt > crosswindKt) crosswindKt = c.crosswindKt;
  }
  return { tailwindKt, crosswindKt };
}

/** What the engine knows about one wind on one runway end. */
export interface RunwayWind {
  /** The stronger of mean and gust. */
  readonly speedKt: number;
  /** Speed at or below the calm threshold: no tailwind, no crosswind. */
  readonly calm: boolean;
  /** Variable wind above the calm threshold: no usable direction (the full speed is the worst case). */
  readonly variableAboveCalm: boolean;
  /** Mean direction, or null for VRB. */
  readonly directionDegrees: number | null;
  /** Headwind at the mean direction; null when direction is unknown. 0 when calm. */
  readonly headwindKt: number | null;
  /** Worst tailwind (over a direction range when given). For VRB above calm: the full speed. */
  readonly tailwindKt: number;
  /** Worst crosswind (over a direction range when given). For VRB above calm: the full speed. */
  readonly crosswindKt: number;
}

/** Wind on a runway end given by its heading. The wind must satisfy isUsableWind. */
export function runwayWind(wind: WindObservation, headingDegrees: number, calmWindKt: number): RunwayWind {
  const speedKt = effectiveSpeedKt(wind);
  if (isCalm(speedKt, calmWindKt)) {
    return {
      speedKt,
      calm: true,
      variableAboveCalm: false,
      directionDegrees: wind.kind === 'steady' ? wind.directionDegrees : null,
      headwindKt: 0,
      tailwindKt: 0,
      crosswindKt: 0,
    };
  }
  if (wind.kind === 'variable') {
    return { speedKt, calm: false, variableAboveCalm: true, directionDegrees: null, headwindKt: null, tailwindKt: speedKt, crosswindKt: speedKt };
  }
  const mean = componentsAt(headingDegrees, wind.directionDegrees, speedKt);
  if (wind.variableRangeDegrees === null) {
    return {
      speedKt,
      calm: false,
      variableAboveCalm: false,
      directionDegrees: wind.directionDegrees,
      headwindKt: mean.headwindKt,
      tailwindKt: mean.tailwindKt,
      crosswindKt: mean.crosswindKt,
    };
  }
  const [from, to] = wind.variableRangeDegrees;
  const worst = worstInRange(headingDegrees, from, to, speedKt);
  return {
    speedKt,
    calm: false,
    variableAboveCalm: false,
    directionDegrees: wind.directionDegrees,
    headwindKt: mean.headwindKt,
    // The mean direction is included as well, so an inconsistent report cannot lower the worst case.
    tailwindKt: Math.max(worst.tailwindKt, mean.tailwindKt),
    crosswindKt: Math.max(worst.crosswindKt, mean.crosswindKt),
  };
}

/** The single comparison used for every limit (WC-11): component <= limit + tolerance. */
export function withinLimit(componentKt: number, limitKt: number, toleranceKt: number): boolean {
  return componentKt <= limitKt + toleranceKt;
}

/**
 * Near-limit margin (WC-13): the component is above zero (above the tolerance,
 * so float noise on a crosswise wind is not "above zero") and within `marginKt`
 * of its limit. A 0 kt limit never triggers it.
 */
export function nearLimit(componentKt: number, limitKt: number, marginKt: number, toleranceKt: number): boolean {
  if (limitKt <= 0) return false;
  return componentKt > toleranceKt && limitKt - componentKt <= marginKt;
}
