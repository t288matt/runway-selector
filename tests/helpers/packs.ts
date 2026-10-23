// Shared pack helpers. Later steps run a scenario over every pack with
// `describeForEachPack` (or loop over PACKS themselves).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe } from 'vitest';
import { PACK_FILE_NAMES, parsePack, type AirportPack, type PackFileName } from '../../src/refdata';

const root = resolve(import.meta.dirname, '..', '..');

export interface PackRef {
  readonly name: string;
  readonly dir: string;
}

export const YSSY_PACK: PackRef = { name: 'YSSY', dir: join(root, 'refdata', 'airports', 'YSSY') };
export const TEST_PACK: PackRef = { name: 'TEST', dir: join(root, 'tests', 'fixtures', 'TEST') };
export const TEST1_PACK: PackRef = { name: 'TEST1', dir: join(root, 'tests', 'fixtures', 'TEST1') };
export const PACKS: readonly PackRef[] = [YSSY_PACK, TEST_PACK, TEST1_PACK];

export type RawFiles = Record<PackFileName, string>;
export type JsonFiles = Record<PackFileName, any>; // eslint-disable-line typescript/no-explicit-any

export function readRaw(ref: PackRef): RawFiles {
  const out = {} as RawFiles;
  for (const name of PACK_FILE_NAMES) out[name] = readFileSync(join(ref.dir, name), 'utf8');
  return out;
}

/** The pack's files parsed into plain JSON, ready to mutate (a deep copy each call). */
export function readJson(ref: PackRef): JsonFiles {
  const raw = readRaw(ref);
  const out = {} as JsonFiles;
  for (const name of PACK_FILE_NAMES) out[name] = JSON.parse(raw[name]);
  return out;
}

export function toRaw(files: JsonFiles): RawFiles {
  const out = {} as RawFiles;
  for (const name of PACK_FILE_NAMES) out[name] = JSON.stringify(files[name]);
  return out;
}

export function loadPackFrom(ref: PackRef): AirportPack {
  return parsePack(readRaw(ref));
}

/** Run `body` once for each pack, inside a describe block named after the pack. */
export function describeForEachPack(title: string, body: (pack: AirportPack, ref: PackRef) => void, refs: readonly PackRef[] = PACKS): void {
  describe.each(refs.map((ref) => [ref.name, ref] as const))(`${title} [%s]`, (_name, ref) => {
    body(loadPackFrom(ref), ref);
  });
}
