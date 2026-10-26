// Ceiling and visibility from one weather group, decided in one place for the
// screen and the engine (owner, 24-10-2026, OD-66). Pure.
//
// Both answers use the engine's encoding (see SlotWeather in engine/inputs.ts):
// a number is known, null is "known: none" (ceiling only), undefined is unknown.
import type { DecodedConditions } from './types';

/** CAVOK means visibility of 10 km or more. */
const CAVOK_VISIBILITY_METRES = 10_000;

/**
 * Ceiling in feet: the lowest BKN or OVC base, or the vertical visibility if
 * that is lower or if no cloud base is reported. null when the report says
 * there is no ceiling (CAVOK, or only SKC, NSC, FEW or SCT cloud). undefined
 * when the group says nothing about cloud (no cloud group, no VV, not CAVOK),
 * or has a BKN or OVC group with no base.
 */
export function ceilingOf(c: DecodedConditions): number | null | undefined {
  if (c.cavok) return null;
  const covering = c.clouds.filter((cl) => cl.quantity === 'BKN' || cl.quantity === 'OVC');
  if (covering.some((cl) => cl.baseFt === null) && c.verticalVisibilityFt === null) return undefined;
  const bases = covering.map((cl) => cl.baseFt).filter((b): b is number => b !== null);
  const lowestCloud = bases.length === 0 ? null : Math.min(...bases);
  if (c.verticalVisibilityFt !== null && (lowestCloud === null || c.verticalVisibilityFt < lowestCloud)) return c.verticalVisibilityFt;
  if (lowestCloud !== null) return lowestCloud;
  return c.clouds.length === 0 ? undefined : null;
}

/**
 * The approach cloud base in feet (issue 99): the lowest base of ANY layer, FEW, SCT, BKN or OVC, whatever the cover,
 * with vertical visibility counted as a base. Unlike ceilingOf it does not wait for a broken or overcast layer, so FEW015
 * is 1,500 here and "No ceiling" on the ceiling tile. null when the report says there is no cloud (CAVOK, SKC, NSC, NCD).
 * undefined when the report says nothing about cloud (no cloud group, not CAVOK) or a layer has cover but no base height.
 */
export function approachCloudBaseOf(c: DecodedConditions): number | null | undefined {
  if (c.cavok) return null;
  const layers = c.clouds.filter((cl) => cl.quantity === 'FEW' || cl.quantity === 'SCT' || cl.quantity === 'BKN' || cl.quantity === 'OVC');
  if (layers.some((cl) => cl.baseFt === null)) return undefined;
  const bases = layers.map((cl) => cl.baseFt).filter((b): b is number => b !== null);
  if (c.verticalVisibilityFt !== null) bases.push(c.verticalVisibilityFt);
  if (bases.length > 0) return Math.min(...bases);
  return c.clouds.length === 0 ? undefined : null;
}

/** Visibility in metres: CAVOK is at least 10 km; "more than" 9999 counts as 10 km, like CAVOK, other "more than" values as the stated metres; undefined when not stated. */
export function visibilityMetresOf(c: DecodedConditions): number | undefined {
  if (c.cavok) return CAVOK_VISIBILITY_METRES;
  if (c.visibility === null) return undefined;
  // 9999 means 10 km or more, the same as CAVOK.
  return c.visibility.moreThan && c.visibility.metres >= 9999 ? CAVOK_VISIBILITY_METRES : c.visibility.metres;
}
