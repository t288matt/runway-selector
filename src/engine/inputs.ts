// The engine's non-pack inputs (DESIGN sections 4 and 6A). The weather module
// produces WeatherSlot[], the traffic module produces TrafficSlot[], and the
// engine consumes both. Plain data only: no functions, no clock, no airport
// facts. Times are UTC milliseconds since the epoch.

/** Wind as reported. Units are knots and degrees (the adapter converts). */
export type WindObservation =
  | {
      readonly kind: 'steady';
      /** Direction the wind blows from, degrees 0-360. */
      readonly directionDegrees: number;
      readonly speedKt: number;
      /** Gust speed, or null when no gust is reported. */
      readonly gustKt: number | null;
      /**
       * Variable direction range such as 160V220 (from, to, clockwise), or null.
       * The engine tests the worst direction in the range (WC-11).
       */
      readonly variableRangeDegrees: readonly [number, number] | null;
    }
  | {
      /** VRB: no usable direction. */
      readonly kind: 'variable';
      readonly speedKt: number;
      readonly gustKt: number | null;
    };

/** What a report says about precipitation, already reduced to flags (WC-9). */
export interface PrecipitationFlags {
  /** Prevailing precipitation (METAR now, TAF base group, FM, or BECMG from its start). */
  readonly prevailing: boolean;
  /** Highest probability (percent) of a PROB group that is NOT on a TEMPO/INTER and has precipitation, else null. */
  readonly probable: number | null;
  /** Any TEMPO or INTER group (with or without PROB) covering the slot has precipitation. */
  readonly temporary: boolean;
  /** METAR recent-weather (RE) group reports precipitation. Only meaningful on a METAR-governed slot. */
  readonly recent: boolean;
}

/** A TEMPO, INTER or PROB overlay covering a slot. It never replaces the prevailing state. */
export interface WeatherOverlay {
  readonly kind: 'TEMPO' | 'INTER' | 'PROB';
  /** 30 or 40 for PROB groups (including PROB on TEMPO); null otherwise. */
  readonly probabilityPct: number | null;
  /** Wind inside the overlay, or null if the group gives none. */
  readonly wind: WindObservation | null;
  readonly precipitation: boolean;
  /**
   * Cloud ceiling in feet, for a mode's weather minima. A number is the ceiling,
   * null means the report says there is none, undefined means it says nothing
   * about cloud (unknown). The same encoding is used on a WeatherOverlay.
   */
  readonly ceilingFt?: number | null;
  /** Visibility in metres, or undefined when the report gives none (unknown). */
  readonly visibilityMetres?: number;
  /** Original group text, plain text, for the hover detail. */
  readonly text: string;
}

/** A present-weather group at the station (never VC) whose codes count as precipitation. Shown on the v2 runway tile; the engine ignores it. */
export interface SlotCondition {
  readonly intensity: '-' | '+' | null;
  readonly descriptor: string | null;
  readonly phenomena: readonly string[];
}

/** The weather the engine uses for one 30-minute slot. */
export interface SlotWeather {
  /** null when the source gives no wind for the slot. */
  readonly wind: WindObservation | null;
  readonly precipitation: PrecipitationFlags;
  /** The precipitation groups behind `precipitation.prevailing`, for display only. */
  readonly present?: readonly SlotCondition[];
  readonly overlays: readonly WeatherOverlay[];
  /**
   * Cloud ceiling in feet, for a mode's weather minima. A number is the ceiling,
   * null means the report says there is none, undefined means it says nothing
   * about cloud (unknown). The same encoding is used on a WeatherOverlay.
   */
  readonly ceilingFt?: number | null;
  /** Visibility in metres, or undefined when the report gives none (unknown). */
  readonly visibilityMetres?: number;
  /** Thunderstorm at the station (TS, not VC). Shown as an event only; no mode depends on it. */
  readonly thunderstorm?: boolean;
  /** Visibility below the pack's lowVisibilityMetres. Shown as an event only. */
  readonly lowVisibility?: boolean;
}

export type SlotSource = 'METAR' | 'TAF' | 'NONE';

/**
 * One clock-aligned 30-minute slot (OP-2). The slot builder fills `tafView`
 * for slots a METAR governs, so the engine can mark the cell MARGINAL when the
 * TAF would make a mode worse (WX-7). Where the TAF does not govern or has no
 * view, tafView is null.
 */
export interface WeatherSlot {
  readonly startMs: number;
  /** Always startMs + 30 minutes. */
  readonly endMs: number;
  /** Which report decides this slot: the METAR window, the TAF, or neither (UNKNOWN). */
  readonly governedBy: SlotSource;
  /** What decides the slot. When governedBy is NONE, wind is null and flags are false. */
  readonly weather: SlotWeather;
  /** The TAF's own view of the same slot, present only when governedBy is METAR. */
  readonly tafView: SlotWeather | null;
}

/** Demand for one slot. Counts are null where unknown (TR-6, TR-7); never invented. */
export interface TrafficSlot {
  readonly startMs: number;
  /** Estimated arrivals in the slot, or null beyond the demand horizon. */
  readonly arrivals: number | null;
  /** Departures: known for slot 1 only, otherwise null. */
  readonly departures: number | null;
}

export type TrafficLevel = 'light' | 'medium' | 'busy';

/** Everything the engine takes besides the pack (DESIGN section 4). */
export interface EngineInput {
  /** The instant of the calculation. The engine never reads a clock. */
  readonly nowMs: number;
  /** Slots from the one containing now, in order, no gaps. */
  readonly weather: readonly WeatherSlot[];
  /** Same length and order as `weather`, or shorter (missing slots count as unknown). */
  readonly traffic: readonly TrafficSlot[];
  /** The operator's current mode id, or null if not set (OD-21). */
  readonly currentMode: string | null;
}
