// Cross-reference validation (AG-10, DESIGN section 5a). Our own code: it runs
// only when every file passed its own schema. Every message names the file
// and the field path. Nothing here knows any airport fact.
import type { PackIssue } from './issues';
import { MINUTES_PER_DAY, bandContains, formatClock, parseClock } from './planTime';
import type { AirportFile, ModesFile, OperatingPlanFile, RunwaysFile, SettingsFile } from './schema';

export interface ParsedFiles {
  readonly airport: AirportFile;
  readonly runways: RunwaysFile;
  readonly modes: ModesFile;
  readonly operatingPlan: OperatingPlanFile;
  readonly settings: SettingsFile;
}

const key = (s: string): string => s.toLowerCase();

export function crossCheck(f: ParsedFiles): PackIssue[] {
  const issues: PackIssue[] = [];
  const add = (file: string, path: string, message: string): void => {
    issues.push({ file, path, message });
  };

  // Runway names are unique (compared without regard to case).
  const runwayNames = new Set<string>();
  f.runways.runways.forEach((r, i) => {
    if (runwayNames.has(key(r.name))) add('runways.json', `runways[${i}].name`, `Duplicate runway name "${r.name}"`);
    runwayNames.add(key(r.name));
  });
  const runwayExact = new Set(f.runways.runways.map((r) => r.name));

  // Mode ids are unique; each mode's runway lists are valid.
  const modeIds = new Set<string>();
  f.modes.modes.forEach((m, i) => {
    if (modeIds.has(key(m.id))) add('modes.json', `modes[${i}].id`, `Duplicate mode id "${m.id}"`);
    modeIds.add(key(m.id));
    for (const list of ['arrivals', 'departures'] as const) {
      const seen = new Set<string>();
      m[list].forEach((name, j) => {
        if (!runwayExact.has(name)) {
          add('modes.json', `modes[${i}].${list}[${j}]`, `Mode "${m.id}" names runway end "${name}", which is not in runways.json`);
        }
        if (seen.has(name)) add('modes.json', `modes[${i}].${list}[${j}]`, `Mode "${m.id}" lists runway end "${name}" twice`);
        seen.add(name);
      });
    }
    if (m.enabled && m.arrivals.length + m.departures.length === 0) {
      add('modes.json', `modes[${i}]`, `Mode "${m.id}" is enabled but names no runway end in arrivals or departures (empty lists are allowed only for a disabled mode)`);
    }
  });
  const modeExact = new Set(f.modes.modes.map((m) => m.id));

  // Operating plan: ids, rows, coverage.
  const bandIds = new Set<string>();
  f.operatingPlan.bands.forEach((b, i) => {
    if (b.start === b.end && b.allDay !== true) {
      add('operating_plan.json', `bands[${i}].end`, `Band "${b.id}" has the same start and end; write "allDay": true for a whole-day band, otherwise give it a different end`);
    }
    if (b.allDay === true && b.start !== b.end) {
      add('operating_plan.json', `bands[${i}].allDay`, `Band "${b.id}" is allDay but its start and end differ; they must be equal`);
    }
    if (bandIds.has(key(b.id))) add('operating_plan.json', `bands[${i}].id`, `Duplicate band id "${b.id}"`);
    bandIds.add(key(b.id));
    const rowModes = new Set<string>();
    b.rows.forEach((row, j) => {
      if (!modeExact.has(row.mode)) {
        add('operating_plan.json', `bands[${i}].rows[${j}].mode`, `Band "${b.id}" names mode "${row.mode}", which is not in modes.json`);
      }
      if (rowModes.has(row.mode)) add('operating_plan.json', `bands[${i}].rows[${j}].mode`, `Band "${b.id}" has two rows for mode "${row.mode}"`);
      rowModes.add(row.mode);
    });
  });
  checkCoverage(f.operatingPlan, add);

  // Traffic bands: light < medium < busy, contiguous, from 0, busy open-ended.
  const tb = f.settings.trafficBands.value;
  const where = 'trafficBands.value';
  if (tb.light[0] !== 0) add('settings.json', `${where}.light[0]`, 'The light band must start at 0');
  if (tb.light[1] < tb.light[0]) add('settings.json', `${where}.light`, 'The light band ends before it starts');
  if (tb.medium[0] !== tb.light[1] + 1) add('settings.json', `${where}.medium[0]`, `The medium band must start at ${tb.light[1] + 1}, one above the light band's end`);
  if (tb.medium[1] < tb.medium[0]) add('settings.json', `${where}.medium`, 'The medium band ends before it starts');
  if (tb.busy[0] !== tb.medium[1] + 1) add('settings.json', `${where}.busy[0]`, `The busy band must start at ${tb.medium[1] + 1}, one above the medium band's end`);

  return issues;
}

function checkCoverage(plan: OperatingPlanFile, add: (file: string, path: string, message: string) => void): void {
  const file = 'operating_plan.json';
  const spans = plan.bands.map((b) => ({ id: b.id, start: parseClock(b.start), end: parseClock(b.end) }));
  const count = new Array<number>(MINUTES_PER_DAY).fill(0);
  for (const s of spans) {
    for (let m = 0; m < MINUTES_PER_DAY; m += 1) {
      if (bandContains(s.start, s.end, m)) count[m] = (count[m] ?? 0) + 1;
    }
  }
  const runs = (wanted: (n: number) => boolean): { from: number; to: number }[] => {
    const out: { from: number; to: number }[] = [];
    let from = -1;
    for (let m = 0; m <= MINUTES_PER_DAY; m += 1) {
      const hit = m < MINUTES_PER_DAY && wanted(count[m] ?? 0);
      if (hit && from < 0) from = m;
      if (!hit && from >= 0) {
        out.push({ from, to: m });
        from = -1;
      }
    }
    return out;
  };
  for (const g of runs((n) => n === 0)) {
    add(file, 'bands', `Time bands leave a gap from ${formatClock(g.from)} to ${formatClock(g.to)} (end exclusive); the bands must cover the 24 hours`);
  }
  for (const o of runs((n) => n > 1)) {
    const ids = spans.filter((s) => bandContains(s.start, s.end, o.from)).map((s) => `"${s.id}"`);
    add(file, 'bands', `Time bands overlap from ${formatClock(o.from)} to ${formatClock(o.to)} (bands ${ids.join(' and ')}); the bands must not overlap`);
  }
}
