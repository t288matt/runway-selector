// The engine's single input type (DESIGN section 4c). Plain data, deeply
// frozen at run time, with no descriptions inside the engine-facing parts.
import type { Settings, SettingName } from './schema';

export type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** Information only: the engine never gates on it. */
export interface Provenance {
  readonly source: string | null;
}

export interface Airport {
  readonly icao: string;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly elevationFt: number | null;
  /** IANA name. Bands and slots are read in this zone. */
  readonly timeZone: string;
  readonly weatherStation: string;
  readonly trafficAreaNm: number;
  readonly groundMaxSpeedKt: number;
  readonly groundAltitudeMarginFt: number;
  readonly arrivalSpeedFloorKt: number;
  /** Wording from the pack, shown as plain text only (SEC-2). */
  readonly labels: Readonly<Record<string, string>>;
}

/** One runway end. Wind direction and heading share one reference (OD-11). */
export interface RunwayEnd extends Provenance {
  readonly name: string;
  readonly headingDegrees: number;
  readonly threshold: { readonly latitude: number; readonly longitude: number } | null;
}

/** A mode's weather minima. A key the pack leaves out is null (or false), meaning no limit of that kind. */
export interface ModeMinima {
  /** Lowest cloud ceiling, feet above ground, or null for no ceiling minimum. */
  readonly ceilingFt: number | null;
  /** Lowest visibility, metres, or null for no visibility minimum. */
  readonly visibilityMetres: number | null;
  /** The runway must be dry. */
  readonly requiresDrySurface: boolean;
}

/** A mode's conditional operation: a named note shown when the weather meets these conditions. A key the pack leaves out is null (or false). */
export interface ConditionalOperation {
  /** Shown on screen, e.g. in "<name> conditions met". */
  readonly name: string;
  readonly ceilingFt: number | null;
  readonly visibilityMetres: number | null;
  readonly requiresDrySurface: boolean;
}

/** One limit pair of an approach-ladder row. A key the pack leaves out is null: no limit of that kind. above and below are strict; atLeast and atMost include the value. */
export interface ApproachBound {
  readonly above: number | null;
  readonly atLeast: number | null;
  readonly below: number | null;
  readonly atMost: number | null;
}

/** One row of an approach ladder. Rows are checked top-down and the first match wins; the last row has no bounds. */
export interface ApproachRow extends Provenance {
  readonly id: string;
  /** Limits on the approach cloud base in feet, or null for none. */
  readonly cloudBase: ApproachBound | null;
  /** Limits on the visibility in metres, or null for none. */
  readonly visibility: ApproachBound | null;
  /** The short text on the chip. */
  readonly chipText: string;
  /** The longer text on hover or tap. */
  readonly hoverText: string;
}

/** An approach ladder (issue 99): the approach type shown for a mode, from cloud base and visibility. Modes name one by id. */
export interface ApproachLadder extends Provenance {
  readonly id: string;
  readonly rows: readonly ApproachRow[];
}

export interface Mode extends Provenance {
  readonly id: string;
  readonly enabled: boolean;
  /** Names of runway ends; every one exists in `runways`. Non-empty when enabled. */
  readonly arrivals: readonly string[];
  readonly departures: readonly string[];
  /** The mode's own limit, or the pack default when the file gave none. */
  readonly maxCrosswindKt: number;
  /** Total movements per hour, or null for no limit. */
  readonly capacity: number | null;
  /** The mode's weather minima, or null when it has none. */
  readonly minima: ModeMinima | null;
  /** The mode's conditional operation (a note only, never a gate), or null when it has none. */
  readonly conditionalOperation: ConditionalOperation | null;
  /** The id of the approach ladder this mode uses (in the pack's `approachLadders`), or null for none: no approach type is shown. */
  readonly approachLadder: string | null;
}

export interface PlanRow extends Provenance {
  /** Id of a mode in `modes`. */
  readonly mode: string;
  /** false = forbidden in the band (cause PLAN). */
  readonly allowed: boolean;
  readonly penalty: number;
}

/**
 * A time band in the airport's local time. Minutes of the local day, 0 to
 * 1439. The end is exclusive. When endMinute < startMinute the band crosses
 * midnight. A whole-day band is written with allDay true (start equals end) and
 * is then the only band.
 */
export interface PlanBand extends Provenance {
  readonly id: string;
  readonly allDay: boolean;
  readonly startMinute: number;
  readonly endMinute: number;
  /** A mode with no row in a band is allowed and takes settings.preferenceDefaultPenalty. */
  readonly rows: readonly PlanRow[];
}

export interface PackMeta {
  readonly schemaVersion: number;
  readonly airport: Provenance;
  readonly runways: Provenance;
  readonly modes: Provenance;
  readonly operatingPlan: Provenance;
  readonly settings: Provenance;
}

export interface AirportPack {
  readonly airport: Airport;
  /** In file order. Names are unique. */
  readonly runways: readonly RunwayEnd[];
  /** In file order (the final tie-break). Ids are unique. */
  readonly modes: readonly Mode[];
  /** The approach ladders modes may name; empty when the pack has none. */
  readonly approachLadders: readonly ApproachLadder[];
  /** Cover the 24 hours with no gap or overlap. */
  readonly plan: readonly PlanBand[];
  /** Plain values only: every tunable unwrapped, no descriptions. */
  readonly settings: Settings;
  /** The description of each tunable, for the settings drawer. The engine never reads this. */
  readonly descriptions: Readonly<Record<SettingName, string>>;
  readonly meta: PackMeta;
}
