// Shared builders for the engine tests. Scenarios are written relative to each
// pack's own limits and headings, so one test body runs on every pack.
import { describe } from 'vitest';
import { parsePack, type AirportPack } from '../../src/refdata';
import { evaluate, type Cell, type EngineInput, type EngineResult, type PrecipitationFlags, type SlotSource, type WeatherOverlay, type WeatherSlot, type WindObservation } from '../../src/engine';
import { runwaysOfMode } from '../../src/engine/eligibility';
import { PACKS, readJson, toRaw, type JsonFiles, type PackRef } from '../helpers/packs';

export const SLOT_MS = 30 * 60_000;
/** A January date: no daylight-saving change near it in any pack zone used here. */
export const DAY_START_MS = Date.UTC(2026, 0, 15, 0, 0, 0);

export const NO_PRECIP: PrecipitationFlags = { prevailing: false, probable: null, temporary: false, recent: false };

export function steady(directionDegrees: number, speedKt: number, gustKt: number | null = null, range: readonly [number, number] | null = null): WindObservation {
  return { kind: 'steady', directionDegrees, speedKt, gustKt, variableRangeDegrees: range };
}
export function vrb(speedKt: number, gustKt: number | null = null): WindObservation {
  return { kind: 'variable', speedKt, gustKt };
}

export interface Spec {
  /** undefined means calm steady wind; null means no wind. */
  wind?: WindObservation | null;
  gov?: SlotSource;
  precip?: Partial<PrecipitationFlags>;
  overlays?: WeatherOverlay[];
  tafView?: { wind?: WindObservation | null; precip?: Partial<PrecipitationFlags>; overlays?: WeatherOverlay[] } | null;
}

export function calm(): WindObservation {
  return steady(0, 0);
}

export function makeSlots(baseMs: number, specs: readonly Spec[]): WeatherSlot[] {
  return specs.map((spec, i) => {
    const startMs = baseMs + i * SLOT_MS;
    const wind = spec.wind === undefined ? calm() : spec.wind;
    const gov = spec.gov ?? 'TAF';
    return {
      startMs,
      endMs: startMs + SLOT_MS,
      governedBy: gov,
      weather: { wind, precipitation: { ...NO_PRECIP, ...spec.precip }, overlays: spec.overlays ?? [] },
      tafView:
        spec.tafView === undefined || spec.tafView === null
          ? null
          : {
              wind: spec.tafView.wind === undefined ? calm() : spec.tafView.wind,
              precipitation: { ...NO_PRECIP, ...spec.tafView.precip },
              overlays: spec.tafView.overlays ?? [],
            },
    };
  });
}

export function inputFor(baseMs: number, specs: readonly Spec[], traffic: EngineInput['traffic'] = []): EngineInput {
  return { nowMs: baseMs, weather: makeSlots(baseMs, specs), traffic, currentMode: null };
}

const baseCache = new WeakMap<AirportPack, Map<string, number>>();

/** A start time (UTC ms) from which `n` slots are all outside any plan restriction for this mode. */
export function baseFor(pack: AirportPack, modeId: string, n: number): number {
  let byKey = baseCache.get(pack);
  if (byKey === undefined) {
    byKey = new Map();
    baseCache.set(pack, byKey);
  }
  const key = `${modeId}/${n}`;
  const known = byKey.get(key);
  if (known !== undefined) return known;
  const modeIndex = pack.modes.findIndex((m) => m.id === modeId);
  for (let step = 0; step < 96; step += 1) {
    const start = DAY_START_MS + step * SLOT_MS;
    const result = evaluate(pack, inputFor(start, Array.from({ length: n }, () => ({}))));
    const cells = result.cells[modeIndex] ?? [];
    if (cells.every((c) => !c.reasons.some((r) => r.code === 'PLAN'))) {
      byKey.set(key, start);
      return start;
    }
  }
  throw new Error(`No plan-free start found for mode ${modeId}`);
}

export interface Run {
  readonly result: EngineResult;
  readonly baseMs: number;
  cell(slot: number): Cell;
}

/** Evaluate `specs` for one mode (from a start where the plan allows it) and give its cells. */
export function runMode(pack: AirportPack, modeId: string, specs: readonly Spec[], traffic?: EngineInput['traffic']): Run {
  const baseMs = baseFor(pack, modeId, specs.length);
  return runAt(pack, modeId, baseMs, specs, traffic);
}

/** Known zero demand for every slot: capacity checks run and nothing is unknown. */
export function quietTraffic(baseMs: number, count: number): EngineInput['traffic'] {
  return Array.from({ length: count }, (_, i) => ({ startMs: baseMs + i * SLOT_MS, arrivals: 0, departures: 0 }));
}

export function runAt(pack: AirportPack, modeId: string, baseMs: number, specs: readonly Spec[], traffic?: EngineInput['traffic']): Run {
  const result = evaluate(pack, inputFor(baseMs, specs, traffic ?? quietTraffic(baseMs, specs.length)));
  const modeIndex = pack.modes.findIndex((m) => m.id === modeId);
  return {
    result,
    baseMs,
    cell(slot: number): Cell {
      const c = result.cells[modeIndex]?.[slot];
      if (c === undefined) throw new Error('no such cell');
      return c;
    },
  };
}

/** Enabled modes whose runway ends all lie on one axis (headings equal modulo 180). */
export function uniformModes(pack: AirportPack) {
  return pack.modes
    .filter((m) => m.enabled)
    .map((m) => ({ mode: m, used: runwaysOfMode(pack, m) }))
    .filter(({ used }) => used.length > 0 && used.every((u) => (((u.headingDegrees - (used[0]?.headingDegrees ?? 0)) % 180) + 180) % 180 === 0));
}

export function describeEachPack(title: string, body: (pack: AirportPack, ref: PackRef) => void): void {
  describe.each(PACKS.map((ref) => [ref.name, ref] as const))(`${title} [%s]`, (_name, ref) => {
    body(packFrom(ref), ref);
  });
}

const parsed = new Map<string, AirportPack>();
export function packFrom(ref: PackRef): AirportPack {
  const known = parsed.get(ref.name);
  if (known !== undefined) return known;
  const pack = parsePack(toRaw(readJson(ref)));
  parsed.set(ref.name, pack);
  return pack;
}

/** A pack from the same files with `mutate` applied to the raw JSON first. */
export function packWith(ref: PackRef, mutate: (files: JsonFiles) => void): AirportPack {
  const files = readJson(ref);
  mutate(files);
  return parsePack(toRaw(files));
}

/**
 * A wind with a tailwind COMPONENT of exactly `tailwindKt` on a runway of this heading. A pure tailwind
 * would be calm (no tailwind at all) when it is at or below the calm threshold, so a small component is
 * made from a stronger wind that is nearly crosswise.
 */
export function tailwindOn(headingDegrees: number, tailwindKt: number, calmWindKt = 0): WindObservation {
  if (tailwindKt > calmWindKt) return steady((headingDegrees + 180) % 360, tailwindKt);
  const speed = calmWindKt + 1;
  const offAxis = (Math.acos(tailwindKt / speed) * 180) / Math.PI;
  return steady(headingDegrees + 180 - offAxis, speed);
}
/** Wind at right angles to the heading: a crosswind of `speedKt`. */
export function crosswindOn(headingDegrees: number, speedKt: number): WindObservation {
  return steady((headingDegrees + 90) % 360, speedKt);
}
