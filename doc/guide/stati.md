# Stati: caricamento, vuoto, zero, errore

> **When to open this guide** — anyone touching `lib/utils/statesNarrative.ts` (`AbsenceKind`, `resolveSurfaceState`, `describeReadFailure`, `describeLastSuccessfulRead`), `components/ui/{skeleton,empty-state,error-notice,tile-grid-skeleton}.tsx`, `components/ui/sonner.tsx` (the severity of a toast), or wiring a loading · empty · zero · failed branch on any surface. `AGENTS.md` keeps the stub with the essentials; here is the full rule. File: `CLAUDE.md` → *Key Files* → *Stati*.

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
  nel Cashflow» — a sentence about the reader's data, told about data nobody read. It rejects now; both its callers
  hold an `ErrorNotice` branch that only a rejection can reach. When wiring a new surface, check the service too: an
  `isError` branch above a service that never rejects is decoration.
- **`Skeleton` (`components/ui/skeleton.tsx`) is the only muted placeholder.** `motion-safe:animate-pulse` — Tailwind's
  bare `animate-pulse` has no reduced-motion guard, and it was hand-written in eight files at six different heights —
  and `aria-hidden`, so the wait is announced once by `TileGridSkeleton`'s `role="status"`. `animate-spin` is
  deliberately left alone: a spinner IS the "in flight" signal, and at 16px it is not the vestibular problem the
  preference is about.
- **Reduced motion reduces the MOTION, not the content.** `shouldShowSavingsBadge` used to take `reducedMotion` as a
  show condition, so a reader who had asked the OS for stillness was never told their savings rate. It now governs the
  entrance transition only, in the component. The two remaining `shouldReduceMotion()` callers gate CONFETTI, which is
  motion carrying nothing — those are correct as they are.
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
