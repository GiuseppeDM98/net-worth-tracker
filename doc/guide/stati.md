# Stati: caricamento, vuoto, zero, errore

> **When to open this guide** — anyone touching `lib/utils/statesNarrative.ts` (`AbsenceKind`, `resolveSurfaceState`, `describeReadFailure`, `describeLastSuccessfulRead`, `describeFreshness`), `lib/utils/freshness.ts` + `lib/hooks/useFreshness.ts` (the «old but present» reading), `components/ui/{skeleton,empty-state,error-notice,tile-grid-skeleton}.tsx`, `components/ui/sonner.tsx` (the severity of a toast), or wiring a loading · empty · zero · failed branch on any surface. `AGENTS.md` keeps the stub with the essentials; here is the full rule. File: § *Files* below.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Stati**: `lib/utils/statesNarrative.ts` (`resolveSurfaceState` = the one wait/failure decision), `components/ui/{skeleton,empty-state,error-notice}.tsx`, `components/ui/sonner.tsx` — doc/guide/stati.md
- **The fourth reading** (2026-09-29): `lib/utils/freshness.ts` (`resolveFreshness`), `lib/hooks/useFreshness.ts`, `describeFreshness` in `statesNarrative.ts`, the `freshness` prop of `components/layout/PageHeader.tsx`; the persisted cache behind it in `lib/constants/persistCache.ts` (AGENTS.md § Caching); `e2e/freshness.spec.ts`

## Stati: caricamento, vuoto, zero, errore

- **An absence has three names, and they are not interchangeable** (DESIGN.md → The Absence-Has-Three-Names Rule):
  `missing` (nothing recorded) · `zero` (something is, and it is zero) · `failed` (the read did not happen). The
  `AbsenceKind` union in `statesNarrative.ts` exists so a component cannot collapse them into a boolean.
- **`resolveSurfaceState({ loading, failed })` is the ONE decision on which of the four states a surface is in**, and
  `loading` wins over `failed` because React Query re-enters `isLoading` while it retries — a retry is an attempt, not
  a verdict. What it exists to stop is `loading || !data`, the collapse that made the Panoramica pulse **forever** on a
  failed read (fixed 2026-09-01); the E2E probe that catches it asserts the skeleton's `role="status"` is GONE once the
  alert is up.
- **A failed read is checked BEFORE the empty branch, always.** Every query in this app defaults to `[]` or
  `undefined`, so a dropped connection is byte-identical to a new account — and the empty branch would then print a
  verdict about a set that was never read («non hai nessun centro di costo», to someone with eight).
- **`describeReadFailure` requires its `consequence`.** There is no generic fallback on purpose: a shared module does
  not know the Italian agreement of a subject it was handed («Classi non è stato letto» is wrong), and a sentence that
  claims nothing is worse than no sentence. The caller knows what it lost. `untouched` is optional and defaults to
  «Nessun dato registrato è stato toccato»; `canRetry` and `onRetry` travel together, so no button is ever offered
  that does nothing.
- **The reassurance is said once per page**: `compact` drops it inside a cell of 4 columns or fewer, because three
  lines in a 3/12 cell make the notice taller than the tiles beside it. On a page where several queries fail together
  at least one of them is wide, so the sentence survives.
- **A service must not swallow its own failure into zeros.** `getAnnualCashflowData` did (a `catch` returning
  `annualSavings: 0`), which meant the FIRE calculator answered a dropped connection with «servono spese registrate
  nel Cashflow» — a sentence about the reader's data, told about data nobody read. It rejected from then on; since
  2026-09-29 the figure is `computeAnnualCashflowData` over `useExpenses`, and the failure is the expenses key's
  `isError`, which the three FIRE tabs route to their `ErrorNotice`. When wiring a new surface, check the service too: an
  `isError` branch above a service that never rejects is decoration.
- **The auth wait is a skeleton too, and it is in the HTML** (2026-09-28). `ProtectedRoute` renders its
  `fallback` — the dashboard layout passes `<PageContainer><TileGridSkeleton label="Verifica dell'accesso" /></PageContainer>`
  — while `useAuth().loading` and through the redirect to `/login`; on the server `loading` is always true, so
  that skeleton is what every prerendered dashboard route carries. The spinner it replaced (`border-gray-300
  border-t-blue-600`, the last hardcoded chrome) is gone. `TileGridSkeleton` takes a `label` so a screen reader hears
  WHICH wait it is: the auth wait says «Verifica dell'accesso», a page's own skeleton stays «Caricamento» — and the
  benchmark's auth marker reads that label (`scripts/perfBenchmark.mjs`, `isAuthPending`). The cold-load sequence is
  generic skeleton (SSR, the default cells at 1920) → page skeleton (mount, its own cells, the same primitive and
  width) → data; the page header's WORDS are the page's and arrive with it, but its silhouette is in the fallback
  (`PageHeaderSkeleton`, `components/layout/PageHeader.tsx`: the same boxes at the same heights, no `h1`), because
  without it the grid moved down 56px at 1440 and 65px at 390 when the page mounted (measured 2026-09-28).
- **`Skeleton` (`components/ui/skeleton.tsx`) is the only muted placeholder.** `motion-safe:animate-pulse` — Tailwind's
  bare `animate-pulse` has no reduced-motion guard, and it was hand-written in eight files at six different heights —
  and `aria-hidden`, so the wait is announced once by `TileGridSkeleton`'s `role="status"`. `animate-spin` is
  deliberately left alone: a spinner IS the "in flight" signal, and at 16px it is not the vestibular problem the
  preference is about.
- **Reduced motion reduces the MOTION, not the content.** `shouldShowSavingsBadge` used to take `reducedMotion` as a
  show condition, so a reader who had asked the OS for stillness was never told their savings rate. It now governs the
  entrance transition only, in the component. No surface fires confetti any more (Storico's burst went on 2026-09-13, the
  FIRE Calcolatore's on 2026-09-22 with its critique), so `celebrationUtils` keeps only the once-per-milestone record.
- **A toast's severity is the icon and a 2px leading rule, never the surface.** Sonner maps `--normal-bg` for every
  type, so before this an error and a success were the same grey tile with a different 16px glyph. The tint variant was
  rejected: `bg-*/10` washes the fill with the text's own hue and this project already records those combinations as
  structurally below AA.
- **A failed WRITE speaks `describeWriteError`, on a toast exactly as in a modal.** Thirteen call sites passed
  `(err as Error).message` straight through — the thing that module exists to prevent. Where the message really is the
  product's own Italian (the assistant hooks' `payload?.error ?? '<italiano>'`), the throw is marked with
  `userFacingError` so the translation keeps it; everything unmarked takes the generic sentence. The assistant's SSE
  route no longer forwards the Anthropic SDK's English message to the client either — that string is a log line.
- **Where the 20 surfaces are**: `app/dashboard/{page,assets,history,performance,allocation,hall-of-fame,settings}`,
  the five Cashflow tabs (the `loadFailed` prop is threaded from `app/dashboard/{cashflow,analisi}/page.tsx`, because
  the tabs do not own their queries), Dividendi, the five FIRE tabs, Previdenza and Centri di Costo. Adding a
  twenty-first means: read the query's `isError`, branch with `resolveSurfaceState`, and write the `consequence`.

## The fourth reading: old but present (2026-09-29)

- **A figure can be on screen and not be current.** Since 2026-09-29 the query cache is persisted to IndexedDB and
  restored before the first fetch (AGENTS.md § Caching), so a reload paints the last known figures at once and
  refetches behind them. That is a fourth state beside the three absences, and it has its own sentence: «Aggiornato
  alle 18:42, sto rileggendo…» — `describeFreshness` (`statesNarrative.ts`): the hour alone on the same Italian
  calendar day, «ieri» the day before, «il 27 settembre» further back; Italy's clock through `Intl` with a `timeZone`,
  whatever the machine's zone, and no Firebase import (`dateHelpers` carries `Timestamp` as a value). `null` when
  nothing on screen is old — the clause disappears, never a placeholder.
- **Every load rereads what it restored.** The restore marks the restored queries invalidated (`onSuccess` of the
  provider, `refetchType: 'none'`): every hook that mounts on them, and every `fetchQuery`, refetches whatever their
  age — stale-while-revalidate, not stale-instead-of-fresh. Without it a reload within `staleTime` painted the
  restored figures and read NOTHING for five minutes (the full suite found it on 2026-09-29: an Admin write between
  two `goto` stayed invisible), and an F5 asked to refresh would have refreshed nothing — the one behaviour the
  in-memory cache never had.
- **The decision is `resolveFreshness`** (`lib/utils/freshness.ts`): a query is «old» when it is REFETCHING a figure
  it already has (`isFetching` and not `isLoading`) AND that figure was either read BEFORE this page load
  (`dataUpdatedAt < performance.timeOrigin`: it came out of the persisted cache, another load's reading of the world,
  however young) or is older than the query's own `staleTime` — the global five minutes
  (`lib/query/queryDefaults.ts`), the overview's minute. So a reload thirty seconds after the first visit says
  «Aggiornato alle…» (true: the figures are from another load), while an invalidation after a save rereads a
  two-minute-old list in silence, exactly as the app always did. The page's OLDEST such figure is the one dated; the
  overview's payload dates its own content (`freshness.updatedAt`), and the older of the two wins.
- **The line lives in the page HEADER, not under the verdict** (owner, 2026-09-29): on `desktop:` after the
  description in the same fixed-height row («Cashflow · Traccia e analizza… · Aggiornato alle 18:42, sto
  rileggendo…»), below it in the description's line, which the sentence takes while it lasts and the description gets
  back — so nothing under it moves when the sentence goes (a reserved 16px slot under every verdict, or a 16px jump
  when it emptied, were the alternatives). ONE stable `role="status" aria-live="polite" aria-atomic` node per width,
  marked `data-freshness`, that changes text and EMPTIES — never a node that appears and disappears
  (doc/guide/dialog.md). A page passes its `useQuery` results to `useFreshness` and the reading to `PageHeader`
  (`freshness`); a tab that owns the header takes it as a prop (Analisi); a page whose queries live in its component
  reads the same hooks itself (Previdenza, FIRE: the same cache entries, no second read).
- **The skeleton is for a FIRST read only.** During the restore every query is `pending` and not fetching —
  `isLoading` false, `data` undefined — and a page mounted then would print «nothing recorded» about a set it is
  about to receive: `ProtectedRoute` keeps the auth fallback («Verifica dell'accesso») until `useIsRestoring()` is
  false as well, so no page ever sees that frame. With a restored figure the page skips its own skeleton and opens
  on the header's sentence; `e2e/freshness.spec.ts` pins the three facts on Cashflow (no page skeleton on the reload,
  the node HAD the sentence, the node is empty once the fresh read landed).
- **Two surfaces carry no sentence by construction**: Rendimenti reads its six collections with `fetchQuery` (no
  observer, and a stale entry is awaited, never painted), and Impostazioni's settings document is read with
  `staleTime: 0` — there the header dates only the categories and the accounts lists.

## Per-page blind spots

- **Il ramo `isError` copre 20 superfici, non ogni query**: cablate quelle da cui dipende il verdetto o l'inventario, non le secondarie (prezzi, benchmark, FX) — una di quelle che fallisce degrada ancora in silenzio. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
