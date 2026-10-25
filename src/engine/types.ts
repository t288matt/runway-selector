// Output types of the engine (DESIGN section 6). Plain data only.
import type { SlotSource } from './inputs';

export type RunwayState = 'DRY' | 'WET' | 'WET_POSSIBLE';
export type Status = 'SUITABLE' | 'MARGINAL' | 'UNSUITABLE' | 'UNKNOWN';

/** Why a runway state was chosen, for the explanation. */
export type RunwayStateCause =
  | 'NONE' // no precipitation reported
  | 'METAR_NOW' // slot 1: the latest METAR reports precipitation
  | 'METAR_RECENT' // slot 1: the latest METAR reports recent precipitation (RE)
  | 'FORECAST' // prevailing precipitation in a later slot
  | 'PROBABLE' // PROB group at or above the wet threshold
  | 'POSSIBLE_PROBABLE' // PROB group below the wet threshold
  | 'POSSIBLE_TEMPORARY' // TEMPO or INTER precipitation, not a PROB30 or PROB40 TEMPO or INTER
  | 'DRYING'; // within the drying time after a wet slot

/**
 * The rule that produced a reason. MODE, PLAN, TW, XW, MIN and CAP are the hard
 * rules in evaluation order; the rest are marginal or informational.
 */
export type ReasonCode = 'MODE' | 'PLAN' | 'TW' | 'XW' | 'MIN' | 'CAP' | 'VRB' | 'OVERLAY' | 'TAF' | 'NO_WIND' | 'NO_DEMAND';

/**
 * FAIL: makes the cell UNSUITABLE. MARGINAL: makes it MARGINAL.
 * UNKNOWN: data missing. INFO: recorded, no effect on status.
 */
export type ReasonSeverity = 'FAIL' | 'MARGINAL' | 'UNKNOWN' | 'INFO';

export type FigureValue = number | string | boolean | null;

export interface Reason {
  readonly code: ReasonCode;
  readonly severity: ReasonSeverity;
  /** The runway end the reason is about, where it is about one. */
  readonly runway?: string;
  /** The numbers behind the reason, unrounded. */
  readonly figures: Readonly<Record<string, FigureValue>>;
  /** The limit that applies, or null where there is none. */
  readonly limit: number | null;
  /** Plain text for the hover detail. Numbers are shown to one decimal place. */
  readonly text: string;
}

/** Wind on one runway end used by a mode (arrival, departure, or both). */
export interface RunwayFigures {
  readonly runway: string;
  readonly headingDegrees: number;
  readonly roles: readonly ('ARRIVAL' | 'DEPARTURE')[];
  /** Mean direction the wind blows from, or null for VRB. */
  readonly directionDegrees: number | null;
  /** The stronger of mean and gust. */
  readonly speedKt: number;
  readonly calm: boolean;
  /** Variable wind above calm: tailwind and crosswind below are the full speed (worst case). */
  readonly variableAboveCalm: boolean;
  /** At the mean direction; null for VRB. */
  readonly headwindKt: number | null;
  readonly tailwindKt: number;
  readonly crosswindKt: number;
  readonly tailwindLimitDryKt: number;
  readonly tailwindLimitWetKt: number;
  readonly crosswindLimitKt: number;
}

export interface Cell {
  readonly modeId: string;
  readonly slotIndex: number;
  readonly status: Status;
  /** The code of the reason that decided the status (the first failing rule for UNSUITABLE), or null for SUITABLE. */
  readonly cause: ReasonCode | null;
  /** Every reason found, in evaluation order. */
  readonly reasons: readonly Reason[];
  /** MARGINAL because of uncertainty, or weather or demand unknown. */
  readonly uncertain: boolean;
  readonly runwayState: RunwayState;
  readonly bandId: string | null;
  /** Wind figures per runway end the mode uses; empty for a disabled mode or unknown wind. */
  readonly runways: readonly RunwayFigures[];
  readonly demand: {
    readonly arrivals: number | null;
    readonly departures: number | null;
    /** Capacity per hour, or null. */
    readonly capacityPerHour: number | null;
    /** Capacity scaled to the slot length, or null. */
    readonly capacityInSlot: number | null;
    /** Known arrivals plus known departures (null counted as 0), or null when both are unknown. */
    readonly knownDemand: number | null;
  };
}

export interface SlotInfo {
  readonly startMs: number;
  readonly endMs: number;
  readonly governedBy: SlotSource;
  readonly runwayState: RunwayState;
  readonly runwayStateCause: RunwayStateCause;
  /** Weather unknown, or the runway state is only possible. */
  readonly uncertain: boolean;
  /** Id of the operating-plan band that applies, or null if no band covers the slot. */
  readonly bandId: string | null;
}

export interface Survival {
  readonly modeId: string;
  /** Slots from slot 0 before the first UNSUITABLE slot. */
  readonly viableSlots: number;
  /** Their total length in milliseconds. */
  readonly viableMs: number;
  /** The start of the first UNSUITABLE slot, or the end of the last slot when none fails; null with no slots. */
  readonly viableUntilMs: number | null;
  /** false when no slot in the window is UNSUITABLE. */
  readonly endsInFailure: boolean;
  readonly firstMarginalSlot: number | null;
  readonly firstUnsuitableSlot: number | null;
  /** Primary cause of the first UNSUITABLE slot. */
  readonly firstUnsuitableCause: ReasonCode | null;
  readonly firstUnsuitableReason: Reason | null;
  /** Number of viable slots that are UNKNOWN. */
  readonly unknownSlots: number;
  /** Number of viable slots marked uncertain (includes UNKNOWN ones). */
  readonly uncertainSlots: number;
}

export interface EngineResult {
  readonly slots: readonly SlotInfo[];
  /** cells[modeIndex][slotIndex], modeIndex in the pack's mode order. */
  readonly cells: readonly (readonly Cell[])[];
  /** survival[modeIndex]. */
  readonly survival: readonly Survival[];
}
