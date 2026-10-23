// Checks on pasted text before anything reads it (SEC-3, WX-1): a size cap,
// plain ASCII only, no control characters other than line breaks and tabs.

/**
 * Longest pasted report accepted, in characters (ASCII only, so also bytes).
 * A real TAF is well under 2 KB. This is the one place the weather module
 * sets its size cap; the pack loader's caps for files are in refdata/schema.
 */
export const MAX_REPORT_CHARS = 4096;

export type CleanText = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly message: string };

function hex4(code: number): string {
  return code.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Validates and normalises pasted text: refuses over-long text and any
 * character outside printable ASCII except tab, line feed and carriage return;
 * returns upper-case text with a trailing "=" and any "$" maintenance marks
 * removed and runs of white space folded to single spaces (TAF line layout
 * carries no meaning).
 */
export function cleanReportText(raw: string, label: string): CleanText {
  if (typeof raw !== 'string') return { ok: false, message: `${label} is not text.` };
  if (raw.length > MAX_REPORT_CHARS) {
    return { ok: false, message: `${label} is ${raw.length} characters long; the limit is ${MAX_REPORT_CHARS}. Nothing was read.` };
  }
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    const isLineBreakOrTab = c === 9 || c === 10 || c === 13;
    if (c >= 0x20 && c <= 0x7e) continue;
    if (isLineBreakOrTab) continue;
    const kind = c < 0x20 || c === 0x7f ? 'control character' : 'non-ASCII character';
    return { ok: false, message: `${label} contains a ${kind} (U+${hex4(c)}) at position ${i + 1}. Only plain ASCII text is accepted. Nothing was read.` };
  }
  // "$" is the maintenance-check indicator some feeds append to a line (even glued to the last group, as in "BKN010$").
  const text = raw.replace(/\$/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase().replace(/\s*=\s*$/, '');
  if (text === '') return { ok: false, message: `${label} is empty.` };
  return { ok: true, text };
}
