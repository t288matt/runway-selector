// Turning the decoding library's objects into OUR types, with unit conversion.
// This file and its siblings are the only code allowed to import the library
// (lint and scripts/check-banned-imports.mjs enforce it).
import type { ICloud, IAbstractWeatherContainer, IWeatherCondition, IWind, Visibility } from 'metar-taf-parser';
import type { DecodedCloud, DecodedConditions, DecodedVisibility, DecodedWeatherCondition, WindObservation } from '../types';

/** Exact definitions: 1 kt = 1852 m per hour; 1 SM = 1609.344 m; 1 inHg = 33.8639 hPa (the usual aviation factor). */
export const KT_PER_MPS = 3600 / 1852;
export const KT_PER_KMH = 1 / 1.852;
export const M_PER_SM = 1609.344;
export const HPA_PER_INHG = 33.8639;

export type Converted<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

function speedToKt(speed: number, unit: string): number | null {
  if (!Number.isFinite(speed) || speed < 0) return null;
  if (unit === 'KT') return speed;
  if (unit === 'MPS') return speed * KT_PER_MPS;
  if (unit === 'KM/H') return speed * KT_PER_KMH;
  return null;
}

/** Wind in knots. Calm (00000KT) is a steady wind of speed 0. A wind we cannot make sense of is an error, never a guess. */
export function convertWind(w: IWind | undefined, where: string): Converted<WindObservation | null> {
  if (w === undefined) return { ok: true, value: null };
  const speedKt = speedToKt(w.speed, w.unit);
  if (speedKt === null) return { ok: false, message: `${where}: wind speed ${String(w.speed)} ${String(w.unit)} is not valid.` };
  const gustKt = w.gust === undefined ? null : speedToKt(w.gust, w.unit);
  if (w.gust !== undefined && gustKt === null) return { ok: false, message: `${where}: wind gust ${String(w.gust)} ${String(w.unit)} is not valid.` };
  if (w.direction === 'VRB' || w.degrees === undefined) {
    if (w.direction !== 'VRB') return { ok: false, message: `${where}: wind direction is missing.` };
    return { ok: true, value: { kind: 'variable', speedKt, gustKt } };
  }
  if (!Number.isFinite(w.degrees) || w.degrees < 0 || w.degrees > 360) {
    return { ok: false, message: `${where}: wind direction ${String(w.degrees)} degrees is not valid (0 to 360).` };
  }
  let variableRangeDegrees: readonly [number, number] | null = null;
  if (w.minVariation !== undefined && w.maxVariation !== undefined) {
    const lo = w.minVariation;
    const hi = w.maxVariation;
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || lo > 360 || hi < 0 || hi > 360) {
      return { ok: false, message: `${where}: wind direction range ${String(lo)}V${String(hi)} is not valid (0 to 360).` };
    }
    variableRangeDegrees = [lo, hi];
  }
  return { ok: true, value: { kind: 'steady', directionDegrees: w.degrees, speedKt, gustKt, variableRangeDegrees } };
}

export function convertVisibility(v: Visibility | undefined): DecodedVisibility | null {
  if (v === undefined || !Number.isFinite(v.value) || v.value < 0) return null;
  const metres = v.unit === 'SM' ? Math.round(v.value * M_PER_SM) : v.value;
  return { metres, moreThan: v.indicator === 'P', lessThan: v.indicator === 'M' };
}

export function convertWeather(list: readonly IWeatherCondition[]): DecodedWeatherCondition[] {
  return list.map((c) => {
    const phenomena = [...c.phenomenons] as string[];
    const descriptor = c.descriptive === undefined ? null : (c.descriptive as string);
    return {
      intensity: c.intensity === undefined ? null : (c.intensity as '-' | '+' | 'VC'),
      descriptor,
      phenomena,
      codes: descriptor === null ? phenomena : [descriptor, ...phenomena],
    };
  });
}

export function convertClouds(list: readonly ICloud[]): DecodedCloud[] {
  return list.map((c) => ({
    quantity: c.quantity as DecodedCloud['quantity'],
    baseFt: c.height === undefined ? null : c.height,
    type: c.type === undefined ? null : (c.type as string),
  }));
}

/** NSW means "no significant weather": it is a statement, not a condition. */
export function isNoSignificantWeather(c: DecodedWeatherCondition): boolean {
  return c.phenomena.length === 1 && c.phenomena[0] === 'NSW';
}

/** The conditions of one group as the library returned them, units converted. `weatherGroupGiven` is true when the group said anything about weather, even NSW. */
export function convertConditions(g: IAbstractWeatherContainer, where: string): Converted<{ conditions: DecodedConditions; weatherGroupGiven: boolean }> {
  const wind = convertWind(g.wind, where);
  if (!wind.ok) return wind;
  const all = convertWeather(g.weatherConditions);
  return {
    ok: true,
    value: {
      weatherGroupGiven: all.length > 0,
      conditions: {
        wind: wind.value,
        visibility: convertVisibility(g.visibility),
        cavok: g.cavok === true,
        clouds: convertClouds(g.clouds),
        verticalVisibilityFt: g.verticalVisibility === undefined ? null : g.verticalVisibility,
        weather: all.filter((c) => !isNoSignificantWeather(c)),
      },
    },
  };
}

export function qnhToHpa(a: { value: number; unit: string } | undefined): number | null {
  if (a === undefined || !Number.isFinite(a.value)) return null;
  if (a.unit === 'hPa') return a.value;
  if (a.unit === 'inHg') return Math.round(a.value * HPA_PER_INHG * 10) / 10;
  return null;
}
