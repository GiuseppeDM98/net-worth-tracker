# Dialog e form trasversali

> **When to open this guide** — anyone touching `components/ui/responsive-modal.tsx` (the modal, `ModalWidth` sm/md/lg/xl), `components/ui/modal-status-line.tsx`, `lib/utils/dialogNarrative.ts` (every sentence a modal speaks), `lib/hooks/useArmedDelete.ts` (two-click confirms, `hasArmedConfirm`), or adding a modal or a form to any surface. `AGENTS.md` keeps the stub with the essentials plus the two form rules that stay there — `AGENTS.md § Dialog Form Reset` and `AGENTS.md § Two-Step Create Dialogs`; here is the full rule. File: `CLAUDE.md` → *Key Files* → *Dialog e form trasversali*.

## Dialog e form trasversali
- **A modal is a tile lifted off the page** (DESIGN.md → The Modal-Is-A-Tile Rule): eyebrow · title 20px · reading ·
  body · footer. `ResponsiveModal` owns the whole shell, so a caller passes content and never chrome — and never
  branches on `useMediaQuery` to order two buttons: the footer is `justify-end` on a dialog and `flex-col-reverse` at
  `h-11` on a drawer, so writing «Annulla» then the primary in DOM order puts the primary on TOP on a phone.
- **Four widths, and no others**: `sm` 420 · `md` 560 · `lg` 720 · `xl` 960. `dialogClassName` survives as an escape
  hatch and currently has no user; reach for a width name first.
- **The reading IS the status line.** `describeModalStatus(status, copy)` returns the idle/submitting/error sentence
  and its tone; `ModalStatusLine` renders it as ONE stable node — `role="status" aria-live="polite"
  aria-atomic="true"` — that is also Radix's `Description`. Two traps, both already paid for on /login: the container
  must never swap `status` for `alert` (a different node to the a11y tree, and some readers announce nothing across
  the swap), and `NarrativeText` colours only `mono` segments, so the tone is applied by the component.
- **`describeWriteError` is the ONE translation of a failed write**, exactly as `describeAuthError` is for a sign-in.
  11 Firestore codes are mapped; anything else takes a sentence that claims nothing rather than falling through to
  «Missing or insufficient permissions.» A server message written FOR a reader survives only if the thrower marks it
  with `userFacingError` — `assetTransactionService.parseWriteResponse` does, because the 422 bodies of the trade
  routes are the only sentences that know why an operation was refused.
- **Two-click confirms live in `lib/hooks/useArmedDelete.ts`** (moved there from `components/cashflow/budget/` when
  the fourth caller appeared). No timer, ever. **Escape while armed means DISARM**, and that cannot be done from the
  button: Radix's dismiss layer registers its document listener when the dialog MOUNTS, so it always runs before one
  added at arm time — capture phase included, and `stopPropagation` never reaches it. The hook therefore exports
  `hasArmedConfirm()`, a module-level count that `ResponsiveModal` reads in `onEscapeKeyDown` to `preventDefault()`.
  Verified in a browser on 2026-08-31: without it, Escape closed the modal with the row still armed.
- **The words are pure and tested.** `dialogNarrative.ts` holds every sentence a modal speaks — the status copy, the
  three `describe*Intent` builders (expense, trade, asset: they name the CONSEQUENCE, not the fields) and the readings
  that carry figures (movements, category delete/move, a dividend day, the test data). It imports from `formatters`,
  never `chartService`, so it stays SDK-free.
- **A summary block inside a modal is `bg-muted`**, never `bg-card` — on this surface that is a card inside a card.
- **The eyebrow's scope is the SINGULAR of one row's type.** `EXPENSE_TYPE_LABELS` is the plural of a category group
  («Spese Variabili»); the picker's own label is the one a modal about ONE row wants («Spesa variabile»).
- **In light mode `--card` and `--background` are both `oklch(1 0 0)`**, so a test that proves a modal is «lifted» by
  comparing it with the page background passes only in dark mode. What separates it there is the border and the Float
  shadow; assert the modal's surface equals a TILE's instead.

## Per-page blind spots

- **Blind spot** (looks like a bug, is not): no Playwright spec (the session's throwaway ones were deleted). Four
  two-click deletes still auto-disarm on a 3 s timer BY DESIGN, because they live on rows and not in modals and the
  owner kept them (`AssetRow`, `StrumentiTile`, `DividendTable`, `AssistantThreadList`); the ones that moved into the
  modal vocabulary lost theirs. `describeWriteError` maps 11 Firestore codes and anything else takes the generic
  sentence, so a NEW cause is invisible until it is added — and a server message survives only if the thrower marks it
  `userFacingError`, which today only `assetTransactionService` does. The status line is FORM-level: per-field zod
  errors keep their own line under the field, and the two can both be visible at once. `dialogClassName` still exists as
  a width escape hatch and has no user — reach for a `width` name. `PDFExportDialog`'s «Genera PDF» moved from the body
  into the footer, so a spec that located it inside the scrollable area needs updating.
