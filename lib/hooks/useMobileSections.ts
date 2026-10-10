'use client';

/**
 * The controller of a page's rows below `desktop:` (The Closed-Row Rule, doc/mobile/MOB-02 § 4.2
 * and § 4.5): which tile is open, what the browser remembers, which failed read stays open, and
 * the one `TileCollapse` object each `Tile` receives.
 *
 * What a page does: `const sections = useMobileSections({ route: 'hall-of-fame', sections: ROWS })`,
 * then `collapse={sections.collapse('hof-anni')}` on each row, `restCollapse={sections.collapse(
 * VERDICT_REST_SECTION)}` on the `PageVerdict`, `<PageRest sections={sections} />` after THE tile,
 * and `sections.reveal(id)` from a strip cell. At 1440 `collapse()` is `undefined` and every tile is
 * the tile of today.
 *
 * TWO RULES OF ENGINEERING, both for the React Compiler:
 *   - `collapse(id)` answers the SAME object until that row's `open`, `mounted` or `failed` changes,
 *     or every tile re-renders on every tap. The cache is a state settled DURING render (AGENTS.md
 *     § Motion, pattern 3), never a ref read in render (`react-hooks/refs`).
 *   - a gesture handler is born once per id and holds NO render value that can go stale: it reads
 *     the memory from the store at EVENT time and knows only the key and the defaults it was born
 *     with — both constants of a page (pass a module-level `defaultOpen`: a literal array would be
 *     a new identity every render, every handler reborn, every tile re-rendered). The ids it does
 *     not know are filtered when the memory is READ (`resolveOpenSections`), so a row added later
 *     (Patrimonio's per-loan rows) needs no handler to learn about it.
 */

import { useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react';
import type { TileCollapse } from '@/components/ui/tile';
import { useCompactLayout } from '@/lib/hooks/useCompactLayout';
import {
  mobileSectionsKey,
  nextSectionsForAll,
  parseStoredSections,
  readStoredSections,
  resolveOpenSections,
  sectionPanelId,
  sectionTriggerId,
  subscribeStoredSections,
  VERDICT_REST_SECTION,
  writeStoredSections,
} from '@/lib/utils/mobileSections';
import { describeFailedSections } from '@/lib/utils/statesNarrative';

export interface SectionSpec {
  /** `<pagina>-<slug>`: `hof-anni`. The `section`'s id, the trigger's `<id>-trigger`, the panel's `<id>-panel`. */
  id: string;
  /** The tile's eyebrow — what the failed-reads announcement names. */
  eyebrow: string;
  /** The row's read failed: open on every visit until the reader closes it (never persisted). */
  failed?: boolean;
}

export interface MobileSections {
  /** Below `desktop:`. When false every method is inert and `collapse()` is `undefined`. */
  compact: boolean;
  /** The `TileCollapse` of a row (or of the verdict's rest); `undefined` at 1440 and for an unknown id. */
  collapse(id: string): TileCollapse | undefined;
  /** Opens a row, scrolls it into view and puts the focus on its trigger — what a strip cell does. */
  reveal(id: string): void;
  /** Every row open (the verdict's rest not counted). */
  allOpen: boolean;
  /** «Apri tutte» / «Chiudi tutte»: every row, never the verdict's rest. */
  setAll(open: boolean): void;
  /** The one live sentence for the failed reads (`PageRest`); `null` at 1440 or with nothing failed. */
  announcement: string | null;
}

export interface UseMobileSectionsOptions {
  /** The segment under `/dashboard/` (`hall-of-fame`); the Panoramica uses `panoramica`. */
  route: string;
  /** The tab, where the page has them (`budget`). */
  tab?: string;
  /** The rows, in DOM order. THE tile is not among them: it never closes (decision 21). */
  sections: readonly SectionSpec[];
  /** The rows open on a first visit; default none. */
  defaultOpen?: readonly string[];
  /** The id of the verdict's «Il perché»; `<prefisso>-perche` where two verdicts share a DOM. */
  restId?: string;
}

type SetIds = Dispatch<SetStateAction<ReadonlySet<string>>>;

/** One row's object and what its handler was born with — a different key or defaults means a new handler. */
interface CachedRow {
  collapse: TileCollapse;
  key: string;
  defaults: readonly string[];
}

const getServerSnapshot = () => null;
const NO_DEFAULTS: readonly string[] = [];

/** If the focus is inside the panel that is closing, it goes back to the row's trigger. */
function returnFocusFromPanel(id: string): void {
  const panel = document.getElementById(sectionPanelId(id));
  const active = document.activeElement;
  if (!panel || !active || !panel.contains(active)) return;
  document.getElementById(sectionTriggerId(id))?.focus({ preventScroll: true });
}

/**
 * The handler of one row, born once with the page's key and defaults. The memory it edits is
 * read from the store when the gesture happens — never from a render: the list it writes is what
 * the reader chose so far (the memory, or the defaults on a first visit) plus or minus this row.
 * A failed row's auto-open is not in that list, so closing it persists nothing about it.
 */
function createSectionHandler(id: string, key: string, defaults: readonly string[], setVisited: SetIds, setDismissed: SetIds) {
  return (nextOpen: boolean): void => {
    if (!nextOpen) returnFocusFromPanel(id);
    // Opened once in this visit: mounted from now on, closed or not (The Closed-Row Rule).
    setVisited((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    // Closing a failed row dismisses its auto-open for this visit; opening it again undoes that.
    setDismissed((prev) => {
      if (nextOpen ? !prev.has(id) : prev.has(id)) return prev;
      const next = new Set(prev);
      if (nextOpen) next.delete(id);
      else next.add(id);
      return next;
    });
    const chosen = new Set(parseStoredSections(readStoredSections(key)) ?? defaults);
    if (nextOpen) chosen.add(id);
    else chosen.delete(id);
    writeStoredSections(key, chosen);
  };
}

interface RebuildInput {
  known: readonly string[];
  open: ReadonlySet<string>;
  visited: ReadonlySet<string>;
  failed: ReadonlySet<string>;
  key: string;
  defaults: readonly string[];
  setVisited: SetIds;
  setDismissed: SetIds;
}

/**
 * The cache of rows: the previous map when nothing changed, otherwise a new map that keeps every
 * `TileCollapse` whose `open`/`mounted`/`failed` are unchanged, and every handler born with the
 * same key and defaults.
 */
function rebuildRows(previous: ReadonlyMap<string, CachedRow>, input: RebuildInput): ReadonlyMap<string, CachedRow> {
  const { known, open, visited, failed, key, defaults, setVisited, setDismissed } = input;
  let changed = previous.size !== known.length;
  const next = new Map<string, CachedRow>();
  for (const id of known) {
    const prev = previous.get(id);
    const isOpen = open.has(id);
    const isMounted = isOpen || visited.has(id);
    const hasFailed = failed.has(id);
    const sameBinding = prev !== undefined && prev.key === key && prev.defaults === defaults;
    if (prev && sameBinding && prev.collapse.open === isOpen && prev.collapse.mounted === isMounted && prev.collapse.failed === hasFailed) {
      next.set(id, prev);
      continue;
    }
    changed = true;
    const onOpenChange = sameBinding ? prev.collapse.onOpenChange : createSectionHandler(id, key, defaults, setVisited, setDismissed);
    next.set(id, { key, defaults, collapse: { id, open: isOpen, mounted: isMounted, failed: hasFailed, onOpenChange } });
  }
  return changed ? next : previous;
}

export function useMobileSections({
  route,
  tab,
  sections,
  defaultOpen = NO_DEFAULTS,
  restId = VERDICT_REST_SECTION,
}: UseMobileSectionsOptions): MobileSections {
  const compact = useCompactLayout();
  const key = mobileSectionsKey(route, tab);
  // The raw string is the snapshot (stable between reads); the parse is this render's.
  const raw = useSyncExternalStore(subscribeStoredSections, () => readStoredSections(key), getServerSnapshot);
  const stored = parseStoredSections(raw);

  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set());
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());

  const known = [...sections.map((section) => section.id), restId];
  const failedIds = sections.filter((section) => section.failed).map((section) => section.id);
  const failed = new Set(failedIds);
  const open = resolveOpenSections({ stored, known, defaults: defaultOpen, failed: failedIds, dismissed });
  const rows = known.filter((id) => id !== restId);

  // Pattern (3) of AGENTS.md § Motion: the cache settles during render, before any return.
  const [rowsCache, setRowsCache] = useState<ReadonlyMap<string, CachedRow>>(() => new Map());
  const current = rebuildRows(rowsCache, { known, open, visited, failed, key, defaults: defaultOpen, setVisited, setDismissed });
  if (current !== rowsCache) setRowsCache(current);

  const collapse = (id: string): TileCollapse | undefined => (compact ? current.get(id)?.collapse : undefined);

  // `reveal` and `setAll` close over nothing that changes on a tap (not `open`, not the cache): a
  // page hands `reveal` to its strip as `onOpen`, and a handler reborn on every tap would re-render
  // the verdict and the strip each time. What they need of the moment they read from the store.
  const reveal = (id: string): void => {
    createSectionHandler(id, key, defaultOpen, setVisited, setDismissed)(true);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // `scroll-mt-24` on the section keeps the row under the sticky navbar; the focus does not scroll again.
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    document.getElementById(sectionTriggerId(id))?.focus({ preventScroll: true });
  };

  const setAll = (nextOpen: boolean): void => {
    if (!nextOpen) rows.forEach(returnFocusFromPanel);
    if (nextOpen) setVisited((prev) => new Set([...prev, ...rows]));
    // «Chiudi tutte» dismisses every failed row for this visit; «Apri tutte» lets them all open again.
    setDismissed(nextOpen ? new Set() : new Set(failedIds));
    // The rest is never a failed row, so what the reader chose is what is open: read it from the store.
    const chosen = new Set(parseStoredSections(readStoredSections(key)) ?? defaultOpen);
    writeStoredSections(key, nextSectionsForAll(chosen, known, nextOpen, restId));
  };

  const allOpen = rows.every((id) => open.has(id));
  const announcement = compact ? describeFailedSections(sections.filter((section) => section.failed).map((section) => section.eyebrow)) : null;

  return { compact, collapse, reveal, allOpen, setAll, announcement };
}
