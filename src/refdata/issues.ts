// A validation problem, always naming the file and the field path.
import { BOUNDS } from './schema';

export interface PackIssue {
  readonly file: string;
  /** Field path such as modes[2].arrivals[0]; empty for the whole file. */
  readonly path: string;
  readonly message: string;
}

export const formatIssue = (i: PackIssue): string => `${i.file}: ${i.path === '' ? '(whole file)' : i.path}: ${i.message}`;

/** Thrown by parsePack. `issues` holds every problem found, `message` the first few. */
export class PackValidationError extends Error {
  readonly issues: readonly PackIssue[];
  constructor(issues: readonly PackIssue[]) {
    const cap = BOUNDS.cap.maxReportedIssues;
    const shown = issues.slice(0, cap).map(formatIssue);
    if (issues.length > cap) shown.push(`...and ${issues.length - cap} more`);
    super(`Pack refused: ${shown.join('; ')}`);
    this.name = 'PackValidationError';
    this.issues = issues;
  }
}

/** Build a path string from valibot path items or plain segments. */
export function pathToString(segments: readonly (string | number)[]): string {
  let out = '';
  for (const s of segments) out += typeof s === 'number' ? `[${s}]` : out === '' ? s : `.${s}`;
  return out;
}
