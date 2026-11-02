// The runways in use as short text for the summary cards: parallel runways of one number merge
// ("16L/R"), and arrivals and departures share one row when they use the same runways.
// Pure and generic: built from a mode's raw runway names, with no airport fact written here.
const RUNWAY = /^(\d{1,2})([LCR])$/;

/** Runway names as text: same number with L, C or R merges ("16L/R"), groups join with ", ", first-seen order kept, duplicates ignored. */
export function formatRunways(names: readonly string[]): string {
  const groups = new Map<string, { head: string; suffixes: string[] }>();
  for (const name of new Set(names)) {
    const m = RUNWAY.exec(name);
    // A name without a suffix (or one this does not understand) is its own group and prints as it is.
    const head = m === null ? name : (m[1] ?? name);
    const key = m === null ? `=${name}` : head;
    const group = groups.get(key) ?? { head, suffixes: [] };
    if (m !== null) group.suffixes.push(m[2] ?? '');
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => `${g.head}${g.suffixes.join('/')}`).join(', ');
}

export interface RunwayRow {
  readonly role: string;
  readonly text: string;
}

/** One row ("ARR and DEP") when both sides use the same runways, otherwise an ARR row and a DEP row; an empty side is left out. */
export function runwayRows(arrivals: readonly string[], departures: readonly string[]): readonly RunwayRow[] {
  const a = new Set(arrivals);
  const d = new Set(departures);
  if (a.size > 0 && a.size === d.size && [...a].every((r) => d.has(r))) return [{ role: 'ARR and DEP', text: formatRunways(arrivals) }];
  const rows: RunwayRow[] = [];
  if (a.size > 0) rows.push({ role: 'ARR', text: formatRunways(arrivals) });
  if (d.size > 0) rows.push({ role: 'DEP', text: formatRunways(departures) });
  return rows;
}
