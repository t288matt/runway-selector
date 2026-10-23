// The 30-minute weather slot builder (DESIGN section 6, "Slots" and "Slot
// weather source"; REQUIREMENTS OP-2, WX-4, WX-7, WX-9, WC-9, WC-10, WC-12).
//
// Pure: no clock, no network, no storage. `nowMs` is an input. Every number
// that depends on the airport comes from the pack's settings.
import type { PrecipitationFlags, SlotWeather, WeatherOverlay, WeatherSlot } from '../engine/inputs';
import type { Settings } from '../refdata/schema';
import type { DecodedMetar, DecodedTaf, DecodedWeatherCondition } from './types';

export const SLOT_MINUTES = 30;
const MINUTE_MS = 60_000;
const SLOT_MS = SLOT_MINUTES * MINUTE_MS;
/** Most slots ever built (48 hours), so a wrong window cannot allocate without bound. */
export const MAX_SLOTS = 96;

export interface WeatherBanner {
  readonly code: 'no-weather' | 'no-metar' | 'no-taf' | 'metar-stale' | 'taf-stale' | 'metar-outside-window' | 'taf-ended';
  readonly message: string;
}

export interface BuildWeatherSlotsInput {
  /** Only the settings are read. */
  readonly pack: { readonly settings: Pick<Settings, 'metarValidityMinutes' | 'metarStaleMinutes' | 'tafStaleMinutes' | 'precipitationCodes'> };
  readonly nowMs: number;
  readonly metar: DecodedMetar | null;
  readonly taf: DecodedTaf | null;
  /** Minutes from the start of slot 0, or null for the full TAF validity (METAR window only when there is no TAF). */
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
  return weather.some((c) => c.codes.some((code) => codes.has(code)));
}

const NO_FLAGS: PrecipitationFlags = { prevailing: false, probable: null, temporary: false, recent: false };

function noWeather(): SlotWeather {
  return { wind: null, precipitation: { ...NO_FLAGS }, overlays: [] };
}

function metarWeather(metar: DecodedMetar, codes: ReadonlySet<string>): SlotWeather {
  return {
    wind: metar.wind,
    precipitation: { prevailing: hasPrecipitation(metar.weather, codes), probable: null, temporary: false, recent: hasPrecipitation(metar.recentWeather, codes) },
    overlays: [],
  };
}

/**
 * What the TAF says about the slot [startMs, endMs), or null when the TAF does
 * not cover it. A prevailing change (FM, BECMG) applies to the slot that
 * contains its start time, so the prevailing period for a slot is the last one
 * that starts before the slot ends. TEMPO, INTER and PROB groups cover every
 * slot their window overlaps.
 */
function tafWeather(taf: DecodedTaf, startMs: number, endMs: number, codes: ReadonlySet<string>): SlotWeather | null {
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
    overlays.push({ kind: o.kind, probabilityPct: o.probabilityPct, wind: o.wind, precipitation, text: o.text });
    if (precipitation && (o.kind === 'TEMPO' || o.kind === 'INTER')) temporary = true;
    if (precipitation && o.kind === 'PROB' && o.probabilityPct !== null && (probable === null || o.probabilityPct > probable)) probable = o.probabilityPct;
  }
  return {
    wind: period.wind,
    precipitation: { prevailing: hasPrecipitation(period.weather, codes), probable, temporary, recent: false },
    overlays,
  };
}

function slotCount(input: BuildWeatherSlotsInput, slot0Start: number, taf: DecodedTaf | null, metarWindowEndMs: number | null): number {
  let n: number;
  if (input.windowMinutes !== null) {
    n = Number.isFinite(input.windowMinutes) ? Math.ceil(input.windowMinutes / SLOT_MINUTES) : 1;
  } else if (taf !== null) {
    n = Math.ceil((taf.validToMs - slot0Start) / SLOT_MS);
  } else if (metarWindowEndMs !== null) {
    n = Math.ceil((metarWindowEndMs - slot0Start) / SLOT_MS);
  } else {
    n = 1;
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

  const metarWindowEndMs = metar === null ? null : metar.observedAtMs + metarWindowMs;
  const n = slotCount(input, slot0Start, taf, metarWindowEndMs);

  const slots: WeatherSlot[] = [];
  for (let i = 0; i < n; i++) {
    const startMs = slot0Start + i * SLOT_MS;
    const endMs = startMs + SLOT_MS;
    const forecast = taf === null ? null : tafWeather(taf, startMs, endMs, codes);
    // A slot that starts exactly at observation time + window is not inside the window: the TAF governs it.
    if (metar !== null && startMs < metar.observedAtMs + metarWindowMs) {
      slots.push({ startMs, endMs, governedBy: 'METAR', weather: metarWeather(metar, codes), tafView: forecast });
    } else if (forecast !== null) {
      slots.push({ startMs, endMs, governedBy: 'TAF', weather: forecast, tafView: null });
    } else {
      slots.push({ startMs, endMs, governedBy: 'NONE', weather: noWeather(), tafView: null });
    }
  }
  return { slots, banners, metarAgeMinutes, tafAgeMinutes };
}
