// Shared helpers for the weather tests: the real-report fixtures and packs
// whose weather station is set to a fixture's station.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parsePack, type AirportPack } from '../../src/refdata';
import { decodeMetar, decodeTaf } from '../../src/weather/decode';
import type { DecodedMetar, DecodedTaf, DecodeResult } from '../../src/weather/types';
import { readJson, toRaw, type PackRef } from '../helpers/packs';

const root = resolve(import.meta.dirname, '..', '..');

export interface Fixture {
  readonly id: string;
  readonly kind: 'METAR' | 'TAF';
  readonly station: string;
  readonly country: string;
  readonly raw: string;
  /** Synthetic clock for the test; the report text is real, the clock is not. */
  readonly nowUtc: string;
  readonly source: { readonly name: string; readonly url: string; readonly retrieved: string; readonly licence: string };
  readonly tags: readonly string[];
}

export const FIXTURES: readonly Fixture[] = JSON.parse(readFileSync(join(root, 'tests', 'fixtures', 'weather', 'reports.json'), 'utf8'));

export function fixture(id: string): Fixture {
  const f = FIXTURES.find((x) => x.id === id);
  if (f === undefined) throw new Error(`no fixture ${id}`);
  return f;
}

export interface PackOverrides {
  readonly weatherStation?: string;
  /** Setting values by name (the pack file wraps each as { value, description }). */
  readonly settings?: Readonly<Record<string, unknown>>;
}

/** A pack loaded through parsePack from the given pack's files, with the station and any settings changed. */
export function packWith(ref: PackRef, overrides: PackOverrides = {}): AirportPack {
  const files = readJson(ref);
  if (overrides.weatherStation !== undefined) files['airport.json'].weatherStation = overrides.weatherStation;
  for (const [name, value] of Object.entries(overrides.settings ?? {})) {
    files['settings.json'][name].value = value;
  }
  return parsePack(toRaw(files));
}

export function nowOf(f: Fixture): number {
  return Date.parse(f.nowUtc);
}

export function decodeFixture(f: Fixture, ref: PackRef, nowMs: number = nowOf(f)): DecodeResult<DecodedMetar | DecodedTaf> {
  const pack = packWith(ref, { weatherStation: f.station });
  return f.kind === 'METAR' ? decodeMetar(f.raw, { pack, nowMs }) : decodeTaf(f.raw, { pack, nowMs });
}

export function decodeMetarFixture(id: string, ref: PackRef, nowMs?: number): DecodedMetar {
  const f = fixture(id);
  const r = decodeMetar(f.raw, { pack: packWith(ref, { weatherStation: f.station }), nowMs: nowMs ?? nowOf(f) });
  if (r.kind !== 'ok') throw new Error(`${id}: expected ok, got ${r.kind}`);
  return r.report;
}

export function decodeTafFixture(id: string, ref: PackRef, nowMs?: number): DecodedTaf {
  const f = fixture(id);
  const r = decodeTaf(f.raw, { pack: packWith(ref, { weatherStation: f.station }), nowMs: nowMs ?? nowOf(f) });
  if (r.kind !== 'ok') throw new Error(`${id}: expected ok, got ${r.kind}`);
  return r.report;
}

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const utc = (iso: string): number => Date.parse(iso);
