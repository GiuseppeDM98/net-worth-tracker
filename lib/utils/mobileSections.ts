/**
 * The rows of a page below `desktop:` — which are open, what is remembered, and the ids the DOM
 * uses — as pure functions and ONE store per browser (The Closed-Row Rule, proposed in
 * doc/mobile/MOB-09; the contract is this module's exports and `useMobileSections`, since 2026-10-10).
 *
 * `useMobileSections` (lib/hooks) is the controller; everything it decides is decided here, so
 * `__tests__/mobileSections.test.ts` pins the memory without a DOM.
 *
 * THE MEMORY is per device, not per account (doc/mobile/README.md § 9): the key names the route
 * (and the tab), never the owner, so a co-owner or the demo on the same browser inherits the
 * rows the reader opened — wanted. It is read through `useSyncExternalStore` as a RAW string
 * (the snapshot must be referentially stable between reads) and parsed by the caller; a storage
 * that throws (Safari private, quota, a blocked origin) reads as `null` and writes into a Map of
 * this module instead, so the row still opens and only the memory is lost at the reload.
 */

/** The verdict's «Il perché» is a row of the controller too, so the memory remembers it. */
export const VERDICT_REST_SECTION = 'perche';

export const sectionTriggerId = (id: string): string => `${id}-trigger`;
export const sectionPanelId = (id: string): string => `${id}-panel`;

/**
 * `mobile-sections:<route>[:<tab>]` — the route is the segment under `/dashboard/` (`hall-of-fame`,
 * `cashflow`), the Panoramica, which has none, uses `panoramica`.
 */
export function mobileSectionsKey(route: string, tab?: string): string {
  return tab ? `mobile-sections:${route}:${tab}` : `mobile-sections:${route}`;
}

/** The stored list, or `null` for anything that is not a JSON array of strings (never touched, or garbage). */
export function parseStoredSections(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The list as it is written: sorted and without duplicates, so two equal sets are one string. */
export function serializeSections(ids: Iterable<string>): string {
  return JSON.stringify(Array.from(new Set(ids)).sort());
}

export interface ResolveOpenSectionsInput {
  /** What the memory holds; `null` when the page was never touched on this browser. */
  stored: readonly string[] | null;
  /** Every id the page can open: its rows plus the verdict's rest. */
  known: readonly string[];
  /** The rows open on a first visit. */
  defaults: readonly string[];
  /** The rows whose read failed: open on every visit, whatever the memory says. */
  failed: Iterable<string>;
  /** The failed rows the reader closed in THIS visit; never persisted. */
  dismissed: Iterable<string>;
}

/**
 * `((stored ?? defaults) ∩ known) ∪ (failed − dismissed)`: the memory (or the defaults) for the
 * ids that still exist, plus every failed read the reader has not dismissed — a failure is
 * visible even closed, and open until the reader says otherwise.
 */
export function resolveOpenSections({ stored, known, defaults, failed, dismissed }: ResolveOpenSectionsInput): Set<string> {
  const chosen = stored ?? defaults;
  const open = new Set(chosen.filter((id) => known.includes(id)));
  const closedFailures = new Set(dismissed);
  for (const id of failed) {
    if (!closedFailures.has(id)) open.add(id);
  }
  return open;
}

/**
 * What «Apri tutte» / «Chiudi tutte» writes: every known row, or none — the verdict's rest
 * (`restId`) is not a row of the page and stays exactly as it was.
 */
export function nextSectionsForAll(
  current: ReadonlySet<string>,
  known: readonly string[],
  open: boolean,
  restId: string,
): string[] {
  return known.filter((id) => (id === restId ? current.has(id) : open));
}

// ── The store ─────────────────────────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();
/** What a failed write holds instead of the storage — read first, so the row opens all the same. */
const fallback = new Map<string, string>();

export function subscribeStoredSections(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The raw stored string, or `null`: a storage that throws is a storage that holds nothing. */
export function readStoredSections(key: string): string | null {
  const held = fallback.get(key);
  if (held !== undefined) return held;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Writes the list and notifies the subscribers. A write the storage refuses lands in the module's
 * Map, which the snapshot reads first: the page behaves, the memory does not survive the reload.
 */
export function writeStoredSections(key: string, ids: Iterable<string>): void {
  const value = serializeSections(ids);
  try {
    localStorage.setItem(key, value);
    fallback.delete(key);
  } catch {
    fallback.set(key, value);
  }
  listeners.forEach((listener) => listener());
}
