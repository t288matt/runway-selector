// The 30-minute weather slot builder (DESIGN section 6, "Slots" and "Slot
// weather source"; REQUIREMENTS OP-2, WX-4, WX-7, WX-9, WC-9, WC-10, WC-12).
//
// Pure: no clock, no network, no storage. `nowMs` is an input. Every number
// that depends on the airport comes from the pack's settings.
import type { PrecipitationFlags, SlotWeather, WeatherOverlay, WeatherSlot } from '../engine/inputs';
import type { Settings } from '../refdata/schema';
import { ceilingOf, visibilityMetresOf } from './ceiling';
import type { DecodedMetar, DecodedTaf, DecodedVisibility, DecodedWeatherCondition } from './types';

export const SLOT_MINUTES = 30;
const MINUTE_MS = 60_000;
const SLOT_MS = SLOT_MINUTES * MINUTE_MS;
/** Most slots ever built (48 hours), so a wrong window cannot allocate without bound. */
export const MAX_SLOTS = 96;
/**
 * Hours shown when there is no usable TAF and the window is the full TAF window
 * (owner decision, 23-10-2026). It equals the longest window option; it is not
 * an airport fact. Slots after the METAR window are NONE (shown UNKNOWN).
 */
export const NO_TAF_HOURS = 6;
const NO_TAF_SLOTS = (NO_TAF_HOURS * 60) / SLOT_MINUTES;

export interface WeatherBanner {
  readonly code: 'no-weather' | 'no-metar' | 'no-taf' | 'metar-stale' | 'taf-stale' | 'metar-outside-window' | 'taf-ended';
  readonly message: string;
}

export interface BuildWeatherSlotsInput {
  /** Only the settings are read. */
  readonly pack: { readonly settings: Pick<Settings, 'metarValidityMinutes' | 'lowVisibilityMetres' | 'metarStaleMinutes' | 'tafStaleMinutes' | 'precipitationCodes'> };
  readonly nowMs: number;
  readonly metar: DecodedMetar | null;
  readonly taf: DecodedTaf | null;
  /** Minutes from the start of slot 0, or null for the full TAF validity (NO_TAF_HOURS when there is no usable TAF). */
  readonly windowMinutes: number | null;
}

export interface BuildWeatherSlotsResult {
  readonly slots: readonly WeatherSlot[];
  readonly banners: readonly WeatherBanner[];
  /** Age of the METAR's own observation time at nowMs, whole minutes, or null with no METAR. */
  readonly metarAgeMinutes: number | null;
  /** Age of the TAF's own issue time at nowMs, whole minutes, or null with no usable TAF. */
  readonly tafAgeMinutes: number | null;
}

function hasPrecipitation(weather: readonly DecodedWeatherCondition[], codes: ReadonlySet<string>): boolean {
  // Only precipitation at the station counts (owner decision, 23-10-2026): a
  // group qualified VC (in the vicinity, e.g. VCSH, VCTS) never does. The codes
  // that count still come from the pack list.
  return weather.some((c) => c.intensity !== 'VC' && c.codes.some((code) => codes.has(code)));
}

function hasThunderstorm(weather: readonly DecodedWeatherCondition[]): boolean {
  return weather.some((c) => c.intensity !== 'VC' && c.codes.includes('TS'));
}

function isLowVisibility(visibility: DecodedVisibility | null, limitMetres: number): boolean {
  return visibility !== null && !visibility.moreThan && visibility.metres < limitMetres;
}

const NO_FLAGS: PrecipitationFlags = { prevailing: false, probable: null, temporary: false, recent: false };

function noWeather(): SlotWeather {
  return { wind: null, precipitation: { ...NO_FLAGS }, overlays: [] };
}

function metarWeather(metar: DecodedMetar, codes: ReadonlySet<string>, lowVisibilityMetres: number): SlotWeather {
  return {
    wind: metar.wind,
    precipitation: { prevailing: hasPrecipitation(metar.weather, codes), probable: null, temporary: false, recent: hasPrecipitation(metar.recentWeather, codes) },
    overlays: [],
    ceilingFt: ceilingOf(metar),
    visibilityMetres: visibilityMetresOf(metar),
    thunderstorm: hasThunderstorm(metar.weather),
    lowVisibility: isLowVisibility(metar.visibility, lowVisibilityMetres),
  };
}

/**
 * What the TAF says about the slot [startMs, endMs), or null when the TAF does
 * not cover it. A prevailing change (FM, BECMG) applies to the slot that
 * contains its start time, so the prevailing period for a slot is the last one
 * that starts before the slot ends. TEMPO, INTER and PROB groups cover every
 * slot their window overlaps.
 */
function tafWeather(taf: DecodedTaf, startMs: number, endMs: number, codes: ReadonlySet<string>, lowVisibilityMetres: number): SlotWeather | null {
  if (startMs >= taf.validToMs || endMs <= taf.validFromMs) return null;
  let period = taf.periods[0];
  for (const p of taf.periods) if (p.startMs < endMs) period = p;
  if (period === undefined) return null;

  const overlays: WeatherOverlay[] = [];
  let probable: number | null = null;
  let temporary = false;
  for (const o of taf.overlays) {
    if (!(o.startMs < endMs && o.endMs > startMs)) continue;
    const precipitation = hasPrecipitation(o.weather, codes);
    // A group that does not mention cloud (or visibility) keeps the prevailing value, as TAF rules say.
    const ceilingFt = ceilingOf(o);
    const visibilityMetres = visibilityMetresOf(o);
    overlays.push({
      kind: o.kind,
      probabilityPct: o.probabilityPct,
      wind: o.wind,
      precipitation,
      ceilingFt: ceilingFt === undefined ? ceilingOf(period) : ceilingFt,
      visibilityMetres: visibilityMetres === undefined ? visibilityMetresOf(period) : visibilityMetres,
      text: o.text,
    });
    // A PROB30 or PROB40 TEMPO or INTER is shown on the screen but never makes the runway WET POSSIBLE (owner, 25-10-2026).
    if (precipitation && (o.kind === 'TEMPO' || o.kind === 'INTER') && o.probabilityPct === null) temporary = true;
    if (precipitation && o.kind === 'PROB' && o.probabilityPct !== null && (probable === null || o.probabilityPct > probable)) probable = o.probabilityPct;
  }
  return {
    wind: period.wind,
    precipitation: { prevailing: hasPrecipitation(period.weather, codes), probable, temporary, recent: false },
    overlays,
    ceilingFt: ceilingOf(period),
    visibilityMetres: visibilityMetresOf(period),
    thunderstorm: hasThunderstorm(period.weather),
    lowVisibility: isLowVisibility(period.visibility, lowVisibilityMetres),
  };
}

function slotCount(input: BuildWeatherSlotsInput, slot0Start: number, taf: DecodedTaf | null): number {
  let n: number;
  if (input.windowMinutes !== null) {
    n = Number.isFinite(input.windowMinutes) ? Math.ceil(input.windowMinutes / SLOT_MINUTES) : 1;
  } else if (taf !== null) {
    n = Math.ceil((taf.validToMs - slot0Start) / SLOT_MS);
  } else {
    n = NO_TAF_SLOTS;
  }
  return Math.min(MAX_SLOTS, Math.max(1, n));
}

export function buildWeatherSlots(input: BuildWeatherSlotsInput): BuildWeatherSlotsResult {
  const { nowMs, metar } = input;
  const settings = input.pack.settings;
  const codes: ReadonlySet<string> = new Set(settings.precipitationCodes);
  const metarWindowMs = settings.metarValidityMinutes * MINUTE_MS;
  const slot0Start = Math.floor(nowMs / SLOT_MS) * SLOT_MS;

  // A TAF whose validity has ended counts as no TAF.
  const taf = input.taf !== null && nowMs < input.taf.validToMs ? input.taf : null;
  const banners: WeatherBanner[] = [];
  const metarAgeMinutes = metar === null ? null : Math.floor((nowMs - metar.observedAtMs) / MINUTE_MS);
  const tafAgeMinutes = taf === null ? null : Math.floor((nowMs - taf.issuedAtMs) / MINUTE_MS);

  if (metar === null && taf === null && input.taf === null) {
    banners.push({ code: 'no-weather', message: 'No weather entered: there is no METAR and no TAF.' });
  } else {
    if (metar === null) banners.push({ code: 'no-metar', message: 'No METAR entered; the TAF is used alone.' });
    if (taf === null) {
      if (input.taf !== null) {
        banners.push({ code: 'taf-ended', message: 'The TAF validity has ended, so it counts as no TAF.' });
      } else {
        banners.push({ code: 'no-taf', message: 'No TAF entered; only the METAR window can be judged and later slots are unknown.' });
      }
    }
  }
  if (metar !== null && nowMs - metar.observedAtMs > settings.metarStaleMinutes * MINUTE_MS) {
    banners.push({ code: 'metar-stale', message: `The METAR is ${metarAgeMinutes} minutes old, older than the ${settings.metarStaleMinutes} minute limit.` });
  }
  if (taf !== null && nowMs - taf.issuedAtMs > settings.tafStaleMinutes * MINUTE_MS) {
    banners.push({ code: 'taf-stale', message: `The TAF was issued ${tafAgeMinutes} minutes ago, older than the ${settings.tafStaleMinutes} minute limit.` });
  }
  const metarGovernsNothing = metar !== null && slot0Start >= metar.observedAtMs + metarWindowMs;
  if (metarGovernsNothing) {
    banners.push({ code: 'metar-outside-window', message: `The METAR is older than its ${settings.metarValidityMinutes} minute window, so it decides no slot.` });
  }

  const n = slotCount(input, slot0Start, taf);

  const slots: WeatherSlot[] = [];
  for (let i = 0; i < n; i++) {
    const startMs = slot0Start + i * SLOT_MS;
    const endMs = startMs + SLOT_MS;
    const forecast = taf === null ? null : tafWeather(taf, startMs, endMs, codes, settings.lowVisibilityMetres);
    // A slot that starts exactly at observation time + window is not inside the window: the TAF governs it.
    if (metar !== null && startMs < metar.observedAtMs + metarWindowMs) {
      slots.push({ startMs, endMs, governedBy: 'METAR', weather: metarWeather(metar, codes, settings.lowVisibilityMetres), tafView: forecast });
    } else if (forecast !== null) {
      slots.push({ startMs, endMs, governedBy: 'TAF', weather: forecast, tafView: null });
    } else {
      slots.push({ startMs, endMs, governedBy: 'NONE', weather: noWeather(), tafView: null });
    }
  }
  return { slots, banners, metarAgeMinutes, tafAgeMinutes };
}
