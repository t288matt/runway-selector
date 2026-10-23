import { expect, it } from 'vitest';
import { SLOT_MS, describeEachPack, runMode, tailwindOn, uniformModes, vrb } from './helpers';

describeEachPack('survival', (pack) => {
  const first = uniformModes(pack)[0];
  if (first === undefined) throw new Error('no mode');
  const id = first.mode.id;
  const h = first.used[0]?.headingDegrees ?? 0;
  const s = pack.settings;
  const bad = tailwindOn(h, s.tailwindDryKt + s.limitToleranceKt + 0.05, s.calmWindKt);
  const survivalOf = (run: ReturnType<typeof runMode>) => run.result.survival[pack.modes.findIndex((m) => m.id === id)]!;

  it('counts the slots before the first UNSUITABLE one, and names its cause and reason', () => {
    const run = runMode(pack, id, [{}, {}, { wind: bad }, {}]);
    const v = survivalOf(run);
    expect(v.viableSlots).toBe(2);
    expect(v.viableMs).toBe(2 * SLOT_MS);
    expect(v.firstUnsuitableSlot).toBe(2);
    expect(v.firstUnsuitableCause).toBe('TW');
    expect(v.firstUnsuitableReason?.code).toBe('TW');
    expect(v.endsInFailure).toBe(true);
    expect(v.viableUntilMs).toBe(run.baseMs + 2 * SLOT_MS);
  });

  it('a mode that never fails survives the whole window', () => {
    const run = runMode(pack, id, [{}, {}, {}]);
    const v = survivalOf(run);
    expect(v.viableSlots).toBe(3);
    expect(v.endsInFailure).toBe(false);
    expect(v.firstUnsuitableSlot).toBeNull();
    expect(v.firstUnsuitableCause).toBeNull();
    expect(v.viableUntilMs).toBe(run.baseMs + 3 * SLOT_MS);
  });

  it('an UNSUITABLE first slot gives no viable time', () => {
    const run = runMode(pack, id, [{ wind: bad }, {}]);
    const v = survivalOf(run);
    expect(v.viableSlots).toBe(0);
    expect(v.viableMs).toBe(0);
    expect(v.viableUntilMs).toBe(run.baseMs);
  });

  it('reports the first MARGINAL slot, and ignores marginal slots after a failure', () => {
    const run = runMode(pack, id, [{}, { wind: vrb(s.calmWindKt + 0.5) }, {}, { wind: bad }, { wind: vrb(s.calmWindKt + 0.5) }]);
    const v = survivalOf(run);
    expect(v.firstMarginalSlot).toBe(1);
    expect(v.firstUnsuitableSlot).toBe(3);
    expect(v.uncertainSlots).toBe(1);
  });

  it('UNKNOWN slots are counted as viable and marked uncertain, not failures', () => {
    const run = runMode(pack, id, [{}, { gov: 'NONE', wind: null }, {}]);
    const v = survivalOf(run);
    expect(v.viableSlots).toBe(3);
    expect(v.unknownSlots).toBe(1);
    expect(v.uncertainSlots).toBe(1);
    expect(v.endsInFailure).toBe(false);
  });
});
