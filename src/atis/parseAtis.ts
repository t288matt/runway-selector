// Reads the runways in use from the `RWY:` line of a real-world ATIS (issue 159).
// Pure. The wording (the word for runway, for, arrivals, departures and "and") comes
// from the pack's `atisWording`; nothing about any airport is written here. The one
// general rule: the arrivals and departures words may carry a trailing S or not
// ("ARR" and "ARRS" are the same word). Anything that does not fit the shape returns
// null: this never guesses a runway.
//   RWY: 34L FOR ARRS. RWY 16R FOR DEPS        -> arrivals 34L, departures 16R
//   RWY: 21 AND 24 FOR ARR. RWY 21 FOR DEP.    -> arrivals 21, 24; departures 21
//   RWY: 16L AND R FOR ARRS AND DEPS           -> both 16L and 16R ("AND R" is the same number)
import type { AtisWording } from '../refdata/types';

export type AtisParseWords = Pick<AtisWording, 'rwyWord' | 'forWord' | 'arrWord' | 'depWord' | 'andWord'>;

export interface ParsedRunways {
  readonly arrivals: readonly string[];
  readonly departures: readonly string[];
}

/** Longest text this will look at; a real ATIS block is far shorter. */
const MAX_CHARS = 8 * 1024;

const RUNWAY = /^(\d{1,2})([LCR]?)$/;
const SIDE = /^[LCR]$/;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The word with or without a trailing S: "ARR" and "ARRS" both match either form. */
function wordRegExp(word: string): string {
  const base = word.replace(/S$/, '');
  return base === '' ? escapeRegExp(word) : `${escapeRegExp(base)}S?`;
}

/** "21 AND 24", "25, 34L AND R", "16L AND R" as runway names, or null when any piece is not a runway. */
function runwaysFrom(text: string, andWord: string): string[] | null {
  const parts = text
    .split(new RegExp(`\\s*,\\s*|\\s+${escapeRegExp(andWord)}\\s+|\\s+`))
    .filter((p) => p !== '');
  const out: string[] = [];
  let lastNumber: string | null = null;
  for (const p of parts) {
    const m = RUNWAY.exec(p);
    if (m !== null) {
      out.push(p);
      lastNumber = m[1] ?? null;
    } else if (SIDE.test(p) && lastNumber !== null) {
      // "16L AND R": the bare side belongs to the number just before it.
      out.push(`${lastNumber}${p}`);
    } else {
      return null;
    }
  }
  return out.length === 0 ? null : out;
}

/**
 * The text after the runway word and the colon on the first RWY line, as candidates: the line alone, then the line joined with
 * up to three following lines (an entry that wraps onto continuation lines), stopping at a blank line. The shortest that parses wins.
 */
function runwayCandidates(text: string, rwyWord: string): string[] {
  const lines = text.split(/\r?\n/);
  const head = new RegExp(`^[ \\t]*${escapeRegExp(rwyWord)}[ \\t]*:?[ \\t]*(\\S.*)$`);
  const at = lines.findIndex((l) => head.test(l));
  if (at < 0) return [];
  const first = head.exec(lines[at] ?? '')?.[1] ?? '';
  const out = [first];
  let joined = first;
  for (const l of lines.slice(at + 1, at + 4)) {
    if (l.trim() === '') break;
    joined = `${joined} ${l.trim()}`;
    out.push(joined);
  }
  return out;
}

const unique = (xs: readonly string[]): string[] => [...new Set(xs)];

export function parseAtisRunways(atisText: string, wording: AtisParseWords): ParsedRunways | null {
  if (atisText.length === 0 || atisText.length > MAX_CHARS) return null;
  const rwyWord = wording.rwyWord.toUpperCase();
  const andWord = wording.andWord.toUpperCase();
  for (const line of runwayCandidates(atisText.toUpperCase(), rwyWord)) {
    const parsed = parseRunwayText(line, wording, rwyWord, andWord);
    if (parsed !== null) return parsed;
  }
  return null;
}

function parseRunwayText(line: string, wording: AtisParseWords, rwyWord: string, andWord: string): ParsedRunways | null {
  const forWord = escapeRegExp(wording.forWord.toUpperCase());
  const arrOnly = new RegExp(`^${wordRegExp(wording.arrWord.toUpperCase())}$`);
  const depOnly = new RegExp(`^${wordRegExp(wording.depWord.toUpperCase())}$`);
  const arrivals: string[] = [];
  const departures: string[] = [];
  const clauses = line
    .split('.')
    .map((c) => c.trim())
    .filter((c) => c !== '');
  if (clauses.length === 0 || clauses.length > 4) return null;
  for (const raw of clauses) {
    // The runway word may head a clause; it is optional on each.
    const clause = raw.replace(new RegExp(`^${escapeRegExp(rwyWord)}\\s*:?\\s*`), '');
    const halves = clause.split(new RegExp(`\\s+${forWord}\\s+`));
    if (halves.length !== 2) return null;
    const runways = runwaysFrom(halves[0] ?? '', andWord);
    if (runways === null) return null;
    const roles = (halves[1] ?? '').split(new RegExp(`\\s+${escapeRegExp(andWord)}\\s+|\\s*,\\s*`)).map((r) => r.trim());
    if (roles.length > 2) return null;
    for (const role of roles) {
      if (arrOnly.test(role)) arrivals.push(...runways);
      else if (depOnly.test(role)) departures.push(...runways);
      else return null;
    }
  }
  if (arrivals.length === 0 || departures.length === 0) return null;
  return { arrivals: unique(arrivals), departures: unique(departures) };
}
