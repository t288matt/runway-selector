// Raw-input guards (SEC-3). They run on the raw text, BEFORE any schema parse:
// size cap, nesting-depth cap, then (after JSON.parse) forbidden keys.
import type { PackIssue } from './issues';
import { pathToString } from './issues';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function checkSize(file: string, text: string, maxBytes: number): PackIssue | null {
  // Characters never take fewer bytes than one, so a long string fails without encoding it.
  const bytes = text.length > maxBytes ? text.length : new TextEncoder().encode(text).length;
  return bytes > maxBytes ? { file, path: '', message: `File is larger than the ${maxBytes} byte limit` } : null;
}

/** Nesting depth of the raw JSON text, counted without parsing it. */
export function checkDepth(file: string, text: string, maxDepth: number): PackIssue | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (escaped) escaped = false;
      else if (c === 92) escaped = true; // backslash
      else if (c === 34) inString = false; // quote
    } else if (c === 34) {
      inString = true;
    } else if (c === 123 || c === 91) {
      depth += 1;
      if (depth > maxDepth) return { file, path: '', message: `Nesting is deeper than ${maxDepth} levels (at character ${i})` };
    } else if (c === 125 || c === 93) {
      depth -= 1;
    }
  }
  return null;
}

/** Every key named __proto__, constructor or prototype, at any depth. Run on parsed JSON. */
export function findForbiddenKeys(file: string, value: unknown): PackIssue[] {
  const found: PackIssue[] = [];
  const walk = (node: unknown, path: (string | number)[]): void => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, [...path, i]));
      return;
    }
    for (const key of Object.keys(node)) {
      const here = [...path, key];
      if (FORBIDDEN_KEYS.has(key)) found.push({ file, path: pathToString(here), message: `The key "${key}" is not allowed` });
      walk((node as Record<string, unknown>)[key], here);
    }
  };
  walk(value, []);
  return found;
}

/** A copy without `_`-prefixed note keys at any depth (RD-7). Run AFTER findForbiddenKeys. */
export function stripNoteKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNoteKeys);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (!key.startsWith('_')) out[key] = stripNoteKeys(item);
    }
    return out;
  }
  return value;
}
