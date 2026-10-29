// The ATIS-style runway text copied when a mode is clicked (issue 150). Pure: built from
// the mode's raw arrival and departure runway arrays, never from the mode id or the
// display strings, and it never adds or drops a runway. No airport fact is written here.
//   different arrivals and departures:        "07 FOR ARR. RWY 16L AND R FOR DEPS"
//   the same runways for both, more than one: "16L AND R FOR ARR AND DEPS"
//   the same single runway for both:          "16" (no ARR/DEP wording at all)
// The wording itself (RWY, FOR, ARR, DEPS, AND) is pack data (issue 154, AG-13): it is a
// report convention, not a universal ATIS fact, so every call site supplies it from the
// pack's own `atisWording`, with no default here. Everything in the copied text is upper
// case (owner, 29-10-2026). A parallel pair is merged only when its runways are in the
// arrays ("16L AND R"); a single runway prints as it is ("16", "07").
// Known limitation (design review, 29-10-2026): the full stop, the capitalisation and the
// arr-before-dep ordering stay hardcoded here as mechanics, not pack data; no real pack
// needs them to vary, so a full template DSL would be overengineering now.
import type { AtisWording } from '../../refdata/types';

const RUNWAY = /^(\d{1,2})([LCR]?)$/;

/** The words `atisText` needs; it never reads provenance, so a plain object (as well as a full `AtisWording`) satisfies this. */
export type AtisWords = Pick<AtisWording, 'rwyWord' | 'forWord' | 'arrWord' | 'depWord' | 'andWord'>;

/** "a", "a <and> b" or "a, b <and> c". */
function joinAnd(parts: readonly string[], andWord: string): string {
  if (parts.length <= 2) return parts.join(` ${andWord} `);
  return `${parts.slice(0, -1).join(', ')} ${andWord} ${parts[parts.length - 1]}`;
}

/** One runway list as words: runways with the same number are grouped ("34L AND R"), first-seen order kept. */
export function runwayWords(runways: readonly string[], andWord: string): string {
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
  return words.length === 0 ? 'none' : joinAnd(words, andWord);
}

/** The text to paste for a mode with these arrival and departure runways, in the pack's own wording. */
export function atisText(arrivals: readonly string[], departures: readonly string[], wording: AtisWords): string {
  const { rwyWord, forWord, arrWord, depWord, andWord } = wording;
  const arr = runwayWords(arrivals, andWord);
  const dep = runwayWords(departures, andWord);
  if (arr !== dep) return `${arr} ${forWord} ${arrWord}. ${rwyWord} ${dep} ${forWord} ${depWord}`;
  // Same runways both ways: a single physical runway needs no ARR/DEP wording at all ("16"); more than one still reads it out ("16L AND R FOR ARR AND DEPS").
  const single = new Set(arrivals).size === 1;
  return single ? arr : `${arr} ${forWord} ${arrWord} ${andWord} ${depWord}`;
}
