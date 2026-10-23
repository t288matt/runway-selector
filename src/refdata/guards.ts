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

/** Keys that appear twice in one JSON object (JSON.parse would silently keep the last). Run on raw text that already parsed. */
export function findDuplicateKeys(file: string, text: string): PackIssue[] {
  const found: PackIssue[] = [];
  const stack: { object: boolean; keys: Set<string>; expectKey: boolean }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      const top = stack[stack.length - 1];
      if (top?.object && top.expectKey) {
        const key = JSON.parse(text.slice(i, j + 1)) as string;
        if (top.keys.has(key)) found.push({ file, path: key, message: `The key "${key}" appears twice in the same object` });
        top.keys.add(key);
        top.expectKey = false;
      }
      i = j;
    } else if (c === '{' || c === '[') {
      stack.push({ object: c === '{', keys: new Set(), expectKey: c === '{' });
    } else if (c === '}' || c === ']') {
      stack.pop();
    } else if (c === ',') {
      const top = stack[stack.length - 1];
      if (top?.object) top.expectKey = true;
    }
  }
  return found;
}

/**
 * A copy without `_`-prefixed note keys at any depth (RD-7), and with -0 made 0.
 * Objects at the dotted paths in `keepAt` are copied whole: their keys are data, not notes.
 * Run AFTER findForbiddenKeys.
 */
export function stripNoteKeys(value: unknown, keepAt: readonly string[] = [], here = ''): unknown {
  if (Array.isArray(value)) return value.map((item, i) => stripNoteKeys(item, keepAt, `${here}[${i}]`));
  if (typeof value === 'number') return Object.is(value, -0) ? 0 : value;
  if (value !== null && typeof value === 'object') {
    const keep = keepAt.includes(here);
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (keep || !key.startsWith('_')) out[key] = stripNoteKeys(item, keepAt, here === '' ? key : `${here}.${key}`);
    }
    return out;
  }
  return value;
}
