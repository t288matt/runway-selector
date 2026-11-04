// Using the saved copy of a pack (issue 183) on the v2 screen: read it, re-check it in full, and say whether a fresh
// result is the same as what is already shown. The clock is the injected one; nothing here touches the network.
import { packFromSavedText, type AirportPack, type AppFile, type AppGroup } from '../refdata';
import { clearSavedPack, loadSavedDefaultId, loadSavedPack } from '../store';
import type { AppDeps } from './deps';

export interface SavedPack {
  readonly pack: AirportPack;
  readonly app: AppFile;
}

/**
 * A valid, unexpired saved pack for `airportId` (the last default airport when undefined), or null: no copy, expired,
 * corrupt, wrong version, oversize, or not a valid pack any more. A copy that fails the pack checks is removed.
 */
export function savedPackFor(deps: AppDeps, airportId: string | undefined): SavedPack | null {
  const icao = airportId ?? loadSavedDefaultId(deps.store);
  if (icao === null) return null;
  const text = loadSavedPack(deps.store, icao, deps.now());
  if (text === null) return null;
  const built = packFromSavedText(text);
  if (built === null) {
    clearSavedPack(deps.store, icao);
    return null;
  }
  if (airportId === undefined && built.app.default !== icao) return null;
  return built;
}

export interface ShownPack {
  readonly pack: AirportPack;
  readonly airports: readonly string[];
  readonly groups?: readonly AppGroup[] | undefined;
}

/** True when a fresh pack with its app.json lists is the same as what is on screen, so nothing needs to change. */
export function sameAsShown(shown: ShownPack, fresh: ShownPack): boolean {
  return (
    JSON.stringify(shown.pack) === JSON.stringify(fresh.pack) &&
    JSON.stringify(shown.airports) === JSON.stringify(fresh.airports) &&
    JSON.stringify(shown.groups) === JSON.stringify(fresh.groups)
  );
}
