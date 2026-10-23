// Reading one stored value safely (SEC-3, S-06): size cap, depth cap, forbidden
// keys, strict schema. A value that fails is discarded with a message and is
// never partly used.
import * as v from 'valibot';
import { checkDepth, checkSize, findForbiddenKeys } from '../refdata/guards';
import type { Store } from './store';

export const MAX_DEPTH = 6;

export type Read<T> =
  | { readonly kind: 'none' }
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'discarded'; readonly message: string };

export function readValidated<S extends v.GenericSchema>(
  store: Store,
  key: string,
  schema: S,
  maxChars: number,
  what: string,
): Read<v.InferOutput<S>> {
  const discard = (reason: string): Read<v.InferOutput<S>> => {
    try {
      store.removeItem(key);
    } catch {
      // Nothing more can be done; the value is still not used.
    }
    return { kind: 'discarded', message: `The stored ${what} could not be used (${reason}) and was discarded` };
  };
  let raw: string | null;
  try {
    raw = store.getItem(key);
  } catch {
    return { kind: 'none' };
  }
  if (raw === null) return { kind: 'none' };
  if (typeof raw !== 'string') return discard('not text');
  if (checkSize(what, raw, maxChars) !== null) return discard('too large');
  if (checkDepth(what, raw, MAX_DEPTH) !== null) return discard('nested too deeply');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return discard('not valid JSON');
  }
  if (findForbiddenKeys(what, parsed).length > 0) return discard('a key that is not allowed');
  const result = v.safeParse(schema, parsed);
  if (!result.success) {
    const first = result.issues[0];
    const version = first !== undefined && first.path?.[0]?.key === 'schemaVersion';
    return discard(version ? 'a different version' : 'it does not match the expected shape');
  }
  return { kind: 'ok', value: result.output };
}

/** Write a record; storage failures never escape (the browser store falls back to memory). */
export function writeJson(store: Store, key: string, value: unknown): void {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // A Store that throws is treated as unavailable; the caller keeps working with the value it holds.
  }
}
