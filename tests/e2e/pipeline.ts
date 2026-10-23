// End-to-end harness (YR-12 part 1). Pasted text -> decode adapter -> buildWeatherSlots ->
// (traffic slots) -> plan(pack, input). Nothing in here judges a result: expectations live in
// the scenario files and are worked by hand from the requirements and the pack numbers.
import { parsePack, type AirportPack } from '../../src/refdata';
import { plan, type Cell, type EngineInput, type PlanResult, type TrafficSlot } from '../../src/engine';
import { buildWeatherSlots, decodeMetar, decodeTaf } from '../../src/weather';
import type { BuildWeatherSlotsResult, DecodedMetar, DecodedTaf } from '../../src/weather';
import { readJson, toRaw, type JsonFiles, type PackRef } from '../helpers/packs';

export interface RunOptions {
  readonly ref: PackRef;
  /** Edits the pack's raw JSON before parsePack (a copy; the files on disk are never touched). */
  readonly edit?: (files: JsonFiles) => void;
  /** Set the pack's weather station (used to replay a real report from another station). */
  readonly station?: string;
  readonly nowIso: string;
  /** Raw pasted text; null or undefined means the box is empty. */
  readonly metar?: string | null;
  readonly taf?: string | null;
  /** Minutes from the start of slot 0, or null for the full TAF validity. */
  readonly windowMinutes: number | null;
  readonly current?: string | null;
  /** Arrivals per slot (null or missing = unknown). */
  readonly arrivals?: readonly (number | null)[];
  /** Departures per slot (null or missing = unknown). */
  readonly departures?: readonly (number | null)[];
}

export interface Run {
  readonly pack: AirportPack;
  readonly nowMs: number;
  readonly metar: DecodedMetar | null;
  readonly taf: DecodedTaf | null;
  readonly built: BuildWeatherSlotsResult;
  readonly input: EngineInput;
  readonly out: PlanResult;
}

export function makePack(ref: PackRef, edit?: (files: JsonFiles) => void, station?: string): AirportPack {
  const files = readJson(ref);
  if (station !== undefined) files['airport.json'].weatherStation = station;
  edit?.(files);
  return parsePack(toRaw(files));
}

export function run(o: RunOptions): Run {
  const pack = makePack(o.ref, o.edit, o.station);
  const nowMs = Date.parse(o.nowIso);
  let metar: DecodedMetar | null = null;
  let taf: DecodedTaf | null = null;
  if (o.metar !== undefined && o.metar !== null) {
    const r = decodeMetar(o.metar, { pack, nowMs });
    if (r.kind === 'error') throw new Error(`METAR refused: ${r.message} :: ${o.metar}`);
    if (r.kind === 'ok') metar = r.report;
  }
  if (o.taf !== undefined && o.taf !== null) {
    const r = decodeTaf(o.taf, { pack, nowMs });
    if (r.kind === 'error') throw new Error(`TAF refused: ${r.message} :: ${o.taf}`);
    if (r.kind === 'ok') taf = r.report;
  }
  const built = buildWeatherSlots({ pack, nowMs, metar, taf, windowMinutes: o.windowMinutes });
  const traffic: TrafficSlot[] =
    o.arrivals === undefined && o.departures === undefined
      ? []
      : built.slots.map((s, i) => ({ startMs: s.startMs, arrivals: o.arrivals?.[i] ?? null, departures: o.departures?.[i] ?? null }));
  const input: EngineInput = { nowMs, weather: built.slots, traffic, currentMode: o.current ?? null };
  return { pack, nowMs, metar, taf, built, input, out: plan(pack, input) };
}

/** "HH:MM" (UTC) of slot i, or the full ISO text when the window spans days. */
export function hhmm(r: Run, i: number): string {
  return new Date(r.out.evaluation.slots[i]!.startMs).toISOString().slice(11, 16);
}

/** Index of the slot starting at the given UTC time ("HH:MM", or a full ISO prefix such as "2026-11-01T03:00"). */
export function at(r: Run, when: string): number {
  const i = r.out.evaluation.slots.findIndex((s) => new Date(s.startMs).toISOString().includes(when));
  if (i < 0) throw new Error(`no slot starting ${when}`);
  return i;
}

export function cell(r: Run, modeId: string, slot: number | string): Cell {
  const mi = r.pack.modes.findIndex((m) => m.id === modeId);
  if (mi < 0) throw new Error(`no mode ${modeId}`);
  const si = typeof slot === 'number' ? slot : at(r, slot);
  const c = r.out.evaluation.cells[mi]?.[si];
  if (c === undefined) throw new Error(`no cell ${modeId} slot ${slot}`);
  return c;
}

export function statuses(r: Run, modeId: string): string[] {
  const mi = r.pack.modes.findIndex((m) => m.id === modeId);
  return (r.out.evaluation.cells[mi] ?? []).map((c) => c.status);
}

export function chosen(r: Run): (string | null)[] {
  return r.out.plan.slots.map((s) => s.modeId);
}

export const pad = (n: number, w: number): string => String(n).padStart(w, '0');
/** A METAR/TAF wind group such as 07025KT. */
export const kt = (dir: number, speed: number, gust?: number): string => `${pad(dir, 3)}${pad(speed, 2)}${gust === undefined ? '' : `G${pad(gust, 2)}`}KT`;
