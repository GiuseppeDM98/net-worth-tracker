'use client';

import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

/**
 * The query of Tailwind's `max-desktop:` — `(width < 1440px)`, the range form, never
 * `(max-width: 1439px)`, which would leave a fractional zoom width (1439.5) in neither branch.
 * `useMediaQuery` is `false` on the server and during hydration (`lib/hooks/useMediaQuery.ts`).
 */
const COMPACT_QUERY = '(width < 1440px)';

/**
 * Whether the page is composed for a small screen (The Closed-Row Rule, doc/mobile/README.md):
 * below `desktop:` the rows of a page are closed tiles and the verdict is cut; at 1440 nothing of
 * that exists and `useMobileSections().collapse(id)` answers `undefined`. ONE store, not a second
 * one beside `useMediaQuery`: the CSS (`max-desktop:`) and this hook read the same query, so a
 * component is never styled for one width and behaving for another.
 */
export function useCompactLayout(): boolean {
  return useMediaQuery(COMPACT_QUERY);
}
