import { describe, expect, it } from 'vitest';
import type { Cell, Reason, ReasonCode, Status } from '../../src/engine';
import { causeCode, cellView, STATUS_STYLE } from '../../src/ui/model/status';

const T0 = Date.UTC(2026, 9, 23, 0, 30);

function reason(code: ReasonCode, severity: Reason['severity'], figures: Reason['figures'] = {}): Reason {
  return { code, severity, figures, limit: null, text: `${code} text` };
}

function cell(status: Status, reasons: Reason[] = [], uncertain = false): Cell {
  return {
    modeId: 'M1',
    slotIndex: 0,
    status,
    cause: reasons[0]?.code ?? null,
    reasons,
    uncertain,
    runwayState: 'DRY',
    bandId: null,
    runways: [],
    demand: { arrivals: null, departures: null, capacityPerHour: null, capacityInSlot: null, knownDemand: null },
  };
}

describe('the cell to colour, icon and word mapping', () => {
  it('maps each status to its own class, icon and word', () => {
    expect(STATUS_STYLE.SUITABLE).toEqual({ className: 'cs-suitable', icon: '✓', word: 'suitable' });
    expect(STATUS_STYLE.MARGINAL).toEqual({ className: 'cs-marginal', icon: '', word: 'marginal' });
    expect(STATUS_STYLE.UNSUITABLE).toEqual({ className: 'cs-unsuitable', icon: '✕', word: 'unsuitable' });
    expect(STATUS_STYLE.UNKNOWN).toEqual({ className: 'cs-unknown', icon: '?', word: 'unknown' });
  });

  it('draws the green class for SUITABLE and for nothing else', () => {
    for (const status of ['SUITABLE', 'MARGINAL', 'UNSUITABLE', 'UNKNOWN'] as const) {
      const v = cellView(cell(status, status === 'SUITABLE' ? [] : [reason('TW', status === 'UNSUITABLE' ? 'FAIL' : 'MARGINAL')]), T0, 'NO TAF');
      expect(v.className === 'cs-suitable').toBe(status === 'SUITABLE');
      expect(v.status).toBe(status);
    }
  });

  it('gives each status a distinct icon and class, so colour is never the only signal', () => {
    const styles = Object.values(STATUS_STYLE);
    expect(new Set(styles.map((s) => s.icon)).size).toBe(4);
    expect(new Set(styles.map((s) => s.className)).size).toBe(4);
    expect(new Set(styles.map((s) => s.word)).size).toBe(4);
  });

  it('shows a cause code for every status except SUITABLE', () => {
    expect(causeCode(cell('SUITABLE'), 'NO TAF')).toBe('');
    expect(causeCode(cell('UNSUITABLE', [reason('TW', 'FAIL')]), 'NO TAF')).toBe('TW');
    expect(causeCode(cell('UNSUITABLE', [reason('XW', 'FAIL')]), 'NO TAF')).toBe('XW');
    expect(causeCode(cell('UNSUITABLE', [reason('CAP', 'FAIL')]), 'NO TAF')).toBe('CAP');
    expect(causeCode(cell('UNSUITABLE', [reason('PLAN', 'FAIL')]), 'NO TAF')).toBe('PLAN');
    expect(causeCode(cell('MARGINAL', [reason('VRB', 'MARGINAL')]), 'NO TAF')).toBe('VRB');
    expect(causeCode(cell('MARGINAL', [reason('TW', 'MARGINAL', { near: true, case: 'dry' })]), 'NO TAF')).toBe('TW');
    expect(causeCode(cell('MARGINAL', [reason('TW', 'MARGINAL', { case: 'wet', uncertain: true })]), 'NO TAF')).toBe('WET?');
    expect(causeCode(cell('MARGINAL', [reason('OVERLAY', 'MARGINAL', { overlayKind: 'TEMPO' })]), 'NO TAF')).toBe('TEMPO');
    expect(causeCode(cell('MARGINAL', [reason('OVERLAY', 'MARGINAL', { overlayKind: 'PROB' })]), 'NO TAF')).toBe('PROB');
    expect(causeCode(cell('MARGINAL', [reason('TAF', 'MARGINAL')]), 'NO TAF')).toBe('TAF');
  });

  it('names the missing report on an UNKNOWN cell', () => {
    expect(causeCode(cell('UNKNOWN', [reason('NO_WIND', 'UNKNOWN')]), 'NO TAF')).toBe('NO TAF');
    expect(causeCode(cell('UNKNOWN', [reason('NO_WIND', 'UNKNOWN')]), 'NO MET')).toBe('NO MET');
  });

  it('uses the first FAIL for an UNSUITABLE cell even when a marginal reason comes first', () => {
    expect(causeCode(cell('UNSUITABLE', [reason('VRB', 'MARGINAL'), reason('CAP', 'FAIL')]), 'NO TAF')).toBe('CAP');
  });

  it('builds the accessible name and flags the uncertainty corner', () => {
    const v = cellView(cell('MARGINAL', [reason('CAP', 'MARGINAL')], true), T0, 'NO TAF');
    expect(v.label).toBe('Mode M1, 00:30Z, marginal, cause capacity, depends on an uncertain input');
    expect(v.uncertain).toBe(true);
    expect(cellView(cell('SUITABLE'), T0, 'NO TAF').label).toBe('Mode M1, 00:30Z, suitable');
    expect(cellView(cell('SUITABLE'), T0, 'NO TAF').uncertain).toBe(false);
  });

  it('marks a later UTC day in the accessible name', () => {
    expect(cellView(cell('SUITABLE'), T0 + 86_400_000, 'NO TAF', T0).label).toBe('Mode M1, 00:30Z (+1 day), suitable');
  });
});
