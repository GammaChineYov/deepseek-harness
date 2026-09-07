/**
 * Recently used models for the composer model seat, persisted to localStorage.
 *
 * The official ModelDirectory carries no model history — only a per-session
 * durable `lastUsed` projection that the client never reads as a list. This
 * module adds a tiny cross-session MRU list so the menu can offer a direct
 * pick row set. It stores only `{ provider, model }` ids — never effort or
 * message content — newest first, capped at {@link RECENT_LIMIT}.
 */

/** localStorage key for the MRU list. Bump on schema change. */
export const RECENT_STORAGE_KEY = 'dsh.modelSelect.recent.v1'

/** How many recent models the menu surfaces. */
export const RECENT_LIMIT = 4

/** One recently selected model route. */
export interface RecentModel {
  provider: string
  model: string
}

/** The slice of `Storage` this module touches, so tests can inject a fake. */
export interface RecentStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Returns `window.localStorage` on the browser, or undefined off-DOM (SSR import). */
export function defaultRecentStorage(): RecentStorage | undefined {
  // jsdom and browsers always expose window.localStorage; the undefined arm
  // guards only a bare SSR import of this pure module.
  /* v8 ignore next 1 */
  return (typeof window === 'undefined' || window.localStorage === undefined) ? undefined : window.localStorage
}

/** Parse a stored string into a validated MRU array; bad input yields `[]`. */
function parseStored(value: string | null): RecentModel[] {
  if (value === null) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is RecentModel =>
      typeof entry === 'object' && entry !== null
      && typeof (entry as RecentModel).provider === 'string'
      && typeof (entry as RecentModel).model === 'string',
    ).slice(0, RECENT_LIMIT)
  } catch {
    return []
  }
}

/**
 * Read the persisted MRU list, newest first.
 * @param storage - storage to read, or undefined when unavailable (then `[]`).
 * @returns at most {@link RECENT_LIMIT} validated entries, newest first.
 */
export function readRecentModels(storage: RecentStorage | undefined): RecentModel[] {
  if (storage === undefined) return []
  try {
    return parseStored(storage.getItem(RECENT_STORAGE_KEY))
  } catch {
    return []
  }
}

/**
 * Return a new MRU list with `entry` moved to the front (dedup by provider+model).
 * @param list - current list, newest first.
 * @param entry - the model just selected.
 * @returns a capped list with the entry first.
 */
export function addRecentModel(list: readonly RecentModel[], entry: RecentModel): RecentModel[] {
  const rest = list.filter(seen => !(seen.provider === entry.provider && seen.model === entry.model))
  return [entry, ...rest].slice(0, RECENT_LIMIT)
}

/**
 * Persist an MRU list; write failures (quota, private mode) are swallowed.
 * @param storage - storage to write, or undefined (no-op).
 * @param list - list to persist.
 */
export function persistRecentModels(storage: RecentStorage | undefined, list: readonly RecentModel[]): void {
  if (storage === undefined) return
  try {
    storage.setItem(RECENT_STORAGE_KEY, JSON.stringify(list.slice(0, RECENT_LIMIT)))
  } catch {
    // quota / private-mode writes are non-fatal for an MRU convenience list
  }
}
