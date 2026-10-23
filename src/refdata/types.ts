// The engine's single input type (DESIGN section 4c). Plain data, deeply
// frozen at run time, with no descriptions inside the engine-facing parts.
import type { Settings, SettingName } from './schema';

export type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

export type PackStatus = 'verified' | 'provisional';

/** Information only (OD-10): the engine never gates on it. */
export interface Provenance {
  readonly status: PackStatus | null;
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
  /** Cover the 24 hours with no gap or overlap. */
  readonly plan: readonly PlanBand[];
  /** Plain values only: every tunable unwrapped, no descriptions. */
  readonly settings: Settings;
  /** The description of each tunable, for the settings drawer. The engine never reads this. */
  readonly descriptions: Readonly<Record<SettingName, string>>;
  readonly meta: PackMeta;
}
