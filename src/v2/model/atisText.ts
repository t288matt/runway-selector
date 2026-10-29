// The ATIS-style runway text copied when a mode is clicked (issue 150). Pure: built from
// the mode's raw arrival and departure runway arrays, never from the mode id or the
// display strings, and it never adds or drops a runway. No airport fact is written here.
//   different arrivals and departures:  "07 ARR. RWY 16L and R DEPS"
//   the same runways for both:          "16L and R for ARR and DEP"
// A parallel pair is merged only when its runways are in the arrays ("16L and R"); a
// single runway prints as it is ("16", "07").

const RUNWAY = /^(\d{1,2})([LCR]?)$/;

/** "a", "a and b" or "a, b and c". */
function joinAnd(parts: readonly string[]): string {
  if (parts.length <= 2) return parts.join(' and ');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** One runway list as words: runways with the same number are grouped ("34L and R"), first-seen order kept. */
export function runwayWords(runways: readonly string[]): string {
  const groups = new Map<string, string[]>();
  for (const rw of runways) {
    const m = RUNWAY.exec(rw);
    // A name this does not understand is its own group and prints as it is, so nothing is dropped.
    const key = m === null ? rw : (m[1] ?? rw);
    const suffix = m === null ? '' : (m[2] ?? '');
    const list = groups.get(key) ?? [];
    if (!list.some((s) => s === suffix)) list.push(suffix);
    groups.set(key, list);
  }
  // One flat list so the commas follow the runways read out: "25, 34L and R".
  const order = ['', 'L', 'C', 'R'];
  const words = [...groups].flatMap(([num, suffixes]) => {
    const sorted = [...suffixes].sort((x, y) => (order.indexOf(x) < 0 ? 9 : order.indexOf(x)) - (order.indexOf(y) < 0 ? 9 : order.indexOf(y)));
    return sorted.map((sfx, i) => (i === 0 ? `${num}${sfx}` : sfx));
  });
  return words.length === 0 ? 'none' : joinAnd(words);
}

/** The text to paste for a mode with these arrival and departure runways. */
export function atisText(arrivals: readonly string[], departures: readonly string[]): string {
  const arr = runwayWords(arrivals);
  const dep = runwayWords(departures);
  return arr === dep ? `${arr} for ARR and DEP` : `${arr} ARR. RWY ${dep} DEPS`;
}
