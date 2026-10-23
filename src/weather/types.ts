// Our own decoded METAR and TAF types (DESIGN section 4, "Weather source"). The
// decode adapter in ./decode returns these and nothing else: no type from the
// decoding library leaks out. Units are knots, metres and hPa; cloud heights are
// feet above ground (the aviation convention). Times are UTC milliseconds since
// the epoch. Plain data only.
import type { WindObservation } from '../engine/inputs';

export type { WindObservation };

/** A present-weather group such as -SHRA, split into its parts. */
export interface DecodedWeatherCondition {
  /** '-' light, '+' heavy, 'VC' in the vicinity, or null for moderate. */
  readonly intensity: '-' | '+' | 'VC' | null;
  /** Descriptor code such as SH, TS or FZ, or null. */
  readonly descriptor: string | null;
  /** Phenomenon codes such as RA, DZ, FG, NSW. */
  readonly phenomena: readonly string[];
  /** descriptor (if any) followed by the phenomena: the codes tested against the pack's precipitation list. */
  readonly codes: readonly string[];
}

export interface DecodedVisibility {
  /** Metres. Statute miles are converted (1 SM = 1609.344 m, rounded to a whole metre). */
  readonly metres: number;
  /** The report said "more than" (P prefix, or 9999 meaning 10 km or more). */
  readonly moreThan: boolean;
  /** The report said "less than" (M prefix). */
  readonly lessThan: boolean;
}

export interface DecodedCloud {
  readonly quantity: 'SKC' | 'FEW' | 'SCT' | 'BKN' | 'OVC' | 'NSC';
  /** Feet above ground, or null when the group gives none (SKC, NSC). */
  readonly baseFt: number | null;
  /** CB, TCU and so on, or null. */
  readonly type: string | null;
}

/** Why the adapter is telling the caller something about a report that was still usable. */
export interface DecodeWarning {
  readonly code:
    | 'group-not-understood'
    | 'decoder-dropped-group'
    | 'cloud-group-dropped'
    | 'wind-not-reported'
    | 'metar-trend-ignored'
    | 'group-outside-validity'
    | 'time-in-future'
    | 'more-warnings';
  readonly message: string;
}

/** The fields every weather group (a METAR body, a TAF base group, FM, BECMG, TEMPO...) may carry. */
export interface DecodedConditions {
  /** null when the group gives no wind. */
  readonly wind: WindObservation | null;
  readonly visibility: DecodedVisibility | null;
  readonly cavok: boolean;
  readonly clouds: readonly DecodedCloud[];
  /** Vertical visibility in feet (VV group), or null. */
  readonly verticalVisibilityFt: number | null;
  readonly weather: readonly DecodedWeatherCondition[];
}

export interface DecodedMetar extends DecodedConditions {
  /** SPECI counts as a METAR; the original type is kept for display. */
  readonly reportType: 'METAR' | 'SPECI';
  readonly station: string;
  /** Observation time from the report's own time group, resolved against the clock. */
  readonly observedAtMs: number;
  readonly auto: boolean;
  readonly corrected: boolean;
  /** Recent weather (RE group), e.g. RERA. The library does not decode it; we do. */
  readonly recentWeather: readonly DecodedWeatherCondition[];
  readonly temperatureC: number | null;
  readonly dewPointC: number | null;
  /** hPa. inHg settings are converted (rounded to 0.1 hPa). */
  readonly qnhHpa: number | null;
  /** The cleaned-up report text. */
  readonly raw: string;
}

/** The prevailing weather from `startMs` until the next period starts. FM and BECMG start a new period. */
export interface TafPeriod extends DecodedConditions {
  readonly kind: 'BASE' | 'FM' | 'BECMG';
  readonly startMs: number;
  /** Original group text. */
  readonly text: string;
}

/** TEMPO, INTER or PROB: valid for its own window and never prevailing. */
export interface TafOverlayGroup extends DecodedConditions {
  /** PROB30 TEMPO is kind TEMPO with probabilityPct 30; a PROB group on its own is kind PROB. */
  readonly kind: 'TEMPO' | 'INTER' | 'PROB';
  readonly probabilityPct: 30 | 40 | null;
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

export interface DecodedTaf {
  readonly station: string;
  readonly issuedAtMs: number;
  readonly validFromMs: number;
  readonly validToMs: number;
  readonly amended: boolean;
  readonly corrected: boolean;
  /** Prevailing periods in time order; the first starts at validFromMs. */
  readonly periods: readonly TafPeriod[];
  readonly overlays: readonly TafOverlayGroup[];
  readonly raw: string;
}

export interface DecodeContext {
  /** Only `airport.weatherStation` is read. */
  readonly pack: { readonly airport: { readonly weatherStation: string } };
  readonly nowMs: number;
}

/**
 * A report we could read, a report that says there is nothing (NIL or a cancelled
 * TAF), or one we could not read. On `error` the caller keeps the previous report
 * (WX-1) and shows `message`.
 */
export type DecodeResult<T> =
  | { readonly kind: 'ok'; readonly report: T; readonly warnings: readonly DecodeWarning[] }
  | { readonly kind: 'none'; readonly reason: 'nil' | 'cancelled'; readonly station: string; readonly warnings: readonly DecodeWarning[] }
  | { readonly kind: 'error'; readonly message: string };
