// The approach-type chip beside the recommended mode (issue 99). Pure: plain text from one view. The chip and hover
// words come from the pack's approach ladder for the mode; the weather is the same current conditions the ceiling tile reads.
// A mode with no ladder, no report, or a result the weather cannot decide shows nothing: no chip and no "unknown" text.
import { approachTypeFor } from '../../engine';
import { approachCloudBaseOf, visibilityMetresOf } from '../../weather';
import type { ViewData } from './dashboard';
import { currentConditions } from './tiles';

export interface ApproachChip {
  /** The short text on the chip. */
  readonly chip: string;
  /** The longer text for hover or tap. */
  readonly hover: string;
}

export function approachChip(view: ViewData, modeId: string | null): ApproachChip | null {
  if (modeId === null) return null;
  const c = currentConditions(view);
  if (c === null) return null;
  const row = approachTypeFor(view.pack, modeId, approachCloudBaseOf(c), visibilityMetresOf(c));
  return row === null ? null : { chip: row.chipText, hover: row.hoverText };
}
