// Rigs for the optimiser tests: two modes A and B of any pack, with winds found by
// search so one scenario body runs on every pack. The operating plan is replaced by
// one all-day band with fixed weights; every other mode is forbidden by the plan.
import { parsePack, type AirportPack } from '../../src/refdata';
import { evaluate, plan, type EngineInput, type PlanResult, type Status, type TrafficLevel, type WindObservation } from '../../src/engine';
import { DAY_START_MS, SLOT_MS, inputFor, steady, type Spec } from './helpers';
import { readJson, toRaw, type JsonFiles, type PackRef } from '../helpers/packs';

export const BASE = DAY_START_MS;

export interface Weights {
  prefA: number;
  prefB: number;
  light: number;
  medium: number;
  busy: number;
  unknown: number;
  marginal: number;
  noMode: number;
}
export const WORKED: Weights = { prefA: 0, prefB: 2, light: 1, medium: 5, busy: 25, unknown: 7, marginal: 3, noMode: 1000 };

export interface Rig {
  readonly ref: PackRef;
  readonly a: string;
  readonly b: string;
  readonly badForA: WindObservation;
  readonly badForB: WindObservation;
  readonly badForBoth: WindObservation;
  /** A passes only within the near-limit margin (MARGINAL); B is SUITABLE. */
  readonly marginalA: WindObservation;
}

function setSetting(files: JsonFiles, name: string, value: unknown): void {
  files['settings.json'][name].value = value;
}

function normalise(files: JsonFiles, a: string, b: string, w: Weights, capacityA: number | null = null): void {
  for (const m of files['modes.json'].modes) m.capacity = null;
  const modeA = files['modes.json'].modes.find((m: { id: string }) => m.id === a);
  if (modeA !== undefined) modeA.capacity = capacityA;
  const rows = files['modes.json'].modes.map((m: { id: string }) => ({
    mode: m.id,
    allowed: m.id === a || m.id === b,
    penalty: m.id === a ? w.prefA : m.id === b ? w.prefB : 0,
  }));
  files['operating_plan.json'].bands = [{ id: 'all', allDay: true, start: '00:00', end: '00:00', rows }];
  setSetting(files, 'changePenaltyLight', w.light);
  setSetting(files, 'changePenaltyMedium', w.medium);
  setSetting(files, 'changePenaltyBusy', w.busy);
  setSetting(files, 'unknownDemandChangePenalty', w.unknown);
  setSetting(files, 'marginalPenalty', w.marginal);
  setSetting(files, 'noModePenalty', w.noMode);
  setSetting(files, 'preferenceDefaultPenalty', 5);
}

function statusesOf(pack: AirportPack, wind: WindObservation | null, ids: string[]): Status[] {
  const spec: Spec = wind === null ? { gov: 'NONE', wind: null } : { wind };
  const r = evaluate(pack, inputFor(BASE, [spec]));
  return ids.map((id) => r.cells[pack.modes.findIndex((m) => m.id === id)]?.[0]?.status ?? 'UNKNOWN');
}

const rigs = new Map<string, Rig>();

/** Pick two enabled modes with winds that break one and not the other, found by search. */
export function rigFor(ref: PackRef): Rig {
  const known = rigs.get(ref.name);
  if (known !== undefined) return known;
  const files = readJson(ref);
  const enabled = files['modes.json'].modes.filter((m: { enabled: boolean }) => m.enabled).map((m: { id: string }) => m.id);
  normalise(files, enabled[0], enabled[1] ?? enabled[0], WORKED);
  for (const row of files['operating_plan.json'].bands[0].rows) row.allowed = true;
  const probe = parsePack(toRaw(files));
  const speeds: number[] = [];
  for (let s = 4; s <= 60; s += 0.5) speeds.push(s);
  const find = (ids: string[], want: Status[]): WindObservation | null => {
    for (const speed of speeds) {
      for (let dir = 0; dir < 360; dir += 5) {
        const wind = steady(dir, speed);
        const got = statusesOf(probe, wind, ids);
        if (want.every((st, i) => got[i] === st)) return wind;
      }
    }
    return null;
  };
  for (let i = 0; i < enabled.length; i += 1) {
    for (let j = i + 1; j < enabled.length; j += 1) {
      const a: string = enabled[i];
      const b: string = enabled[j];
      const badForA = find([a, b], ['UNSUITABLE', 'SUITABLE']);
      const badForB = find([a, b], ['SUITABLE', 'UNSUITABLE']);
      const badForBoth = find([a, b], ['UNSUITABLE', 'UNSUITABLE']);
      const marginalA = find([a, b], ['MARGINAL', 'SUITABLE']);
      if (badForA !== null && badForB !== null && badForBoth !== null && marginalA !== null) {
        const rig = { ref, a, b, badForA, badForB, badForBoth, marginalA };
        rigs.set(ref.name, rig);
        return rig;
      }
    }
  }
  throw new Error(`No usable mode pair in pack ${ref.name}`);
}

/** The rig's pack with the fixed weights, optionally edited further in the raw JSON. */
export function packOf(rig: Rig, w: Weights = WORKED, edit?: (files: JsonFiles) => void, capacityA: number | null = null): AirportPack {
  const files = readJson(rig.ref);
  normalise(files, rig.a, rig.b, w, capacityA);
  edit?.(files);
  return parsePack(toRaw(files));
}

/** Arrivals count that falls in the given level, from the pack's own bands. */
export function countFor(pack: AirportPack, level: TrafficLevel): number {
  return pack.settings.trafficBands[level][0] ?? 0;
}

export type Wx = 'ok' | 'badA' | 'badB' | 'badBoth' | 'marginalA' | 'none';

export function specsFor(rig: Rig, wx: readonly Wx[]): Spec[] {
  return wx.map((w): Spec => {
    if (w === 'ok') return {};
    if (w === 'none') return { gov: 'NONE', wind: null };
    const wind = w === 'badA' ? rig.badForA : w === 'badB' ? rig.badForB : w === 'badBoth' ? rig.badForBoth : rig.marginalA;
    return { wind };
  });
}

export function trafficFor(pack: AirportPack, levels: readonly (TrafficLevel | null)[]): EngineInput['traffic'] {
  return levels.map((level, i) => ({ startMs: BASE + i * SLOT_MS, arrivals: level === null ? null : countFor(pack, level), departures: null }));
}

export function run(pack: AirportPack, rig: Rig, wx: readonly Wx[], levels: readonly (TrafficLevel | null)[], currentMode: string | null = null): PlanResult {
  const input: EngineInput = { ...inputFor(BASE, specsFor(rig, wx), trafficFor(pack, levels)), currentMode };
  return plan(pack, input);
}

export const same = <T>(n: number, v: T): T[] => Array.from({ length: n }, () => v);

export function modesOf(r: PlanResult): (string | null)[] {
  return r.plan.slots.map((s) => s.modeId);
}
