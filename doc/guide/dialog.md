# Dialog e form trasversali

> **When to open this guide** — anyone touching `components/ui/responsive-modal.tsx` (the modal, `ModalWidth` sm/md/lg/xl), `components/ui/modal-status-line.tsx`, `lib/utils/dialogNarrative.ts` (every sentence a modal speaks), `lib/hooks/useArmedDelete.ts` (two-click confirms, `hasArmedConfirm`), the two-step create dialogs (`components/assets/AssetDialog.tsx`, `components/expenses/ExpenseDialog.tsx` — § Two-Step Create Dialogs (`AssetDialog`, `ExpenseDialog`)), a dialog's reset `useEffect` (§ Dialog Form Reset), or adding a modal or a form to any surface. `AGENTS.md` keeps the stubs with the essentials — `AGENTS.md § Dialog e form trasversali`, `§ Dialog Form Reset` and `§ Two-Step Create Dialogs`, whose full text moved here on 2026-10-10; here is the full rule. File: § *Files* below.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Dialog e form trasversali**: `components/ui/{responsive-modal,modal-status-line}.tsx` (`ModalWidth` sm/md/lg/xl), `lib/utils/modalOrigin.ts` (`resolveCenteredModalOrigin`), `lib/utils/dialogNarrative.ts` (`describeFormRefusal`, `describeExpenseDeleteConsequence`, `describeSeriesDeleteReading`, `describeMovementDetailReading`, `describeMovementsFilterReading`, `describeSnapshotOverwrite`), `lib/hooks/useArmedDelete.ts`, `components/expenses/SeriesDeleteDialog.tsx` (`resolveSeriesDeleteMode` = the ONE rule for «solo questa o tutte?»), `lib/constants/aiModels.ts`; `components/layout/LogoutDialog.tsx` stays an `AlertDialog` — doc/guide/dialog.md
- **Two-step create dialogs and the reset rule** (moved here from `AGENTS.md` § 2 on 2026-10-10): `components/assets/AssetDialog.tsx`, `components/expenses/ExpenseDialog.tsx` (the `openSubject` reset during render in both); guard `e2e/assets.rows.spec.ts` «Nuovo after Modifica opens on step 1» (the test «AssetDialog leaves with its exit animation and gives the focus back to «Modifica»; «Aggiungi asset» then opens on step 1»)

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
- **A refused submit lands in the reading line, in Italian, and scrolls to the field** (`describeFormRefusal` →
  «Mancano 2 campi: Importo e Categoria.»; `handleSubmit(onSubmit, onInvalid)`, `aria-invalid` on the field,
  `scrollIntoView` + focus on the first): `AssetDialog` since 2026-09-14 morning, `ExpenseDialog` since the afternoon,
  `BudgetItemDialog` since the evening (its submit was `disabled` until the form was valid, so a keyboard reader
  pressed Enter on a dead button and nothing said why; the two rule refusals — the allocation ceiling and the
  duplicate — are `describeBudgetAmountRefusal` / `describeBudgetDuplicateRefusal` in `budgetNarrative.ts`).
  **And the refusal is red only since that evening, on EVERY modal**: `ModalStatusLine` merged its classes BEFORE
  the ones Radix's `Description` hands down through `asChild` (`text-sm text-muted-foreground` from shadcn's
  wrapper), and `tailwind-merge` kept the last — so the reading was 14px muted in both tones and a refusal never
  took `text-destructive` (a size utility also drops `leading-[1.45]`). The incoming `className` now comes first.
  A refusal's colour is asserted by `e2e/cashflow.budget.spec.ts` against a `text-destructive` probe; the two
  Tracciamento and Patrimonio specs check the words only.
  A zod `z.number()` fed `NaN` by `valueAsNumber` says «Invalid input» unless the schema carries `{ error: '…' }` —
  every number the expense form can leave empty now does. Step 2 keeps the counter in the eyebrow («Passo 2 di 2 ·
  Spesa variabile»).
- **A delete on a ROW of a table arms in the row; a delete that needs a CHOICE is a modal** (2026-09-14, the Movimenti
  table): `useArmedDelete` on a plain row with the consequence printed in the row (`describeExpenseDeleteConsequence`)
  and one live region per table; `SeriesDeleteDialog` («solo questa o tutte le 12?», `describeSeriesDeleteReading`,
  `sm`, a `bg-muted` summary block for the row's facts) for a row of an instalment plan or a recurring series —
  shared by the table and the feed's detail drawer, which each used to mount an `AlertDialog` for it.
- **The vocabulary is total since 2026-09-18** (the owner's four calls, that session): the Panoramica's snapshot
  confirm, the feed's detail, the Movimenti filters and the assistant's Conversazioni and Memoria are
  `ResponsiveModal` — the only raw primitive left is `LogoutDialog`. Three patterns came out of it. **A detail whose
  delete arms puts the consequence in its READING** (`describeMovementDetailReading`: idle → the day, armed → the
  consequence in the negative tone, disarmed → «Eliminazione annullata. …»): the reading is the modal's one live
  region, so no second `role="status"` is mounted, and a region that silently returned to its idle sentence would
  announce the date, not that nothing was deleted. **A row of a series never arms in the detail** — its first press
  hands over to `SeriesDeleteDialog`, which IS its confirmation (it used to confirm twice). **A modal that holds a
  list, not a decision, has no footer** (Conversazioni, Memoria), **and a `Tile` inside a modal is a sub-tile**:
  `border-transparent bg-muted shadow-none`, the cadence kept and the chrome dropped (`AssistantMemoryPanel`).
  The row that opened a detail stays WITH it after the close (`useState<{ expense, open }>`), so the modal animates
  out on its content instead of unmounting on an empty shell.
- **`triggerOrigin` is resolved AT THE CLICK, from the trigger alone** (`resolveCenteredModalOrigin`,
  `lib/utils/modalOrigin.ts`, 2026-09-18): a centred dialog's centre is (50vw, 50vh) whatever its size, so a point
  of the viewport in the dialog's own box is `calc(50% + Xpx - 50vw)` — nothing to measure (the `contentRef` prop that
  existed for it is gone), and the origin is on the panel from its FIRST frame. Setting it later is not a jump but a GLIDE: `DialogContent`
  carries `duration-200` with `transition-property` at its default `all`, so a changed `transform-origin` is
  tweened across the zoom and the panel scales around a moving pivot. **Never clear it on close**: the exit animates
  too, and `setOrigin(undefined)` in `onOpenChange` makes it glide back (12 values, measured) — every opener sets a
  fresh origin, so nothing stale survives. Take the rect from `event.currentTarget`, since a header action is mounted
  twice and a ref lands on either copy. **All five pages are on it** (Panoramica, Hall of Fame, Dividendi, Rendimenti,
  Impostazioni): until that day Hall of Fame and Dividendi set the origin in a `requestAnimationFrame` after mount
  (the glide) and Rendimenti and Impostazioni used the trigger's VIEWPORT percentage on the dialog's BOX (no glide, a
  pivot 253px from the button). Pinned by `e2e/modal.origin.spec.ts` and `e2e/panoramica.snapshot.spec.ts`, open AND
  close; read the geometry on an OPEN settled frame — a closing panel at scale 0.95 is displaced by 0.05 × its
  distance from the pivot, which reads as an 18px error that is not one.
- **A modal mounted only while it is needed unmounts in `onExitComplete`, never at `onClose`** (2026-10-07,
  Patrimonio's `AssetDialog` and `CashAccountDialog`): the host keeps `{ open, mounted }` (or `{ open, record }`, a
  record set meaning mounted), `open` drives the
  animation, `mounted` the tree, and `ResponsiveModal.onExitComplete` turns it false. That callback is Radix's
  `onCloseAutoFocus`, which the `FocusScope` dispatches in a `setTimeout(0)` from its cleanup — after `Presence` has
  waited for the exit animation (the dialog's zoom-out and vaul's `slideToBottom` keyframes alike) — so the focus is
  handed back first, then the host unmounts. A reopen during the exit keeps the content, so the event does not come;
  the host still guards on its own `open` (`prev.open ? prev : …`), since a timer queued before a reopen can land after
  it. Keep the record through the exit (the modal leaves on its own title) and pass `returnFocusTo` from
  `event.currentTarget`. **The focus does NOT prove the exit happened**: unmounted at `onClose`, the dialog still gave
  the focus back (seen 2026-10-07 — the scope's cleanup calls the handler after the unmount, and the handler holds the
  ref); what proves it is a `[role=dialog][data-state="closed"]` frame watched from BEFORE the Escape
  (`e2e/assets.rows.spec.ts`). On a hand-over to another modal, clear the closing one's opener (or move it to the next
  modal), or its restore sends the focus behind the modal that is opening.
- **In light mode `--card` and `--background` are both `oklch(1 0 0)`**, so a test that proves a modal is «lifted» by
  comparing it with the page background passes only in dark mode. What separates it there is the border and the Float
  shadow; assert the modal's surface equals a TILE's instead.

## Dialog Form Reset
- The reset `useEffect` must include `open` in its deps and start with `if (!open) return`. It holds ONLY the
  react-hook-form calls (`reset`, `setValue`, `replaceTiers`); every `useState` setter of the dialog's own UI state
  (step, status, toggles, a selected id) is settled during render, keyed on `(open, record)` — see AGENTS.md § Motion →
  `react-hooks/set-state-in-effect` (2026-09-06).
- The new-record branch must enumerate **every** field, optional ones included, and call `replaceTiers([])` — `reset()`
  does not clear field arrays.
- **`useWatch()` for render, `getValues()` for handlers — never `watch()`** (incompatible with the React Compiler, which
  then skips the whole component).

## Two-Step Create Dialogs (`AssetDialog`, `ExpenseDialog`)
> The default for a form whose fields depend on a discriminant. Keep the two implementations in step.
- **A marker on a label is a claim the validation has to honour.** `*` = required, `(opzionale)` in
  `text-muted-foreground font-normal` = explicitly optional; the zod schema, any imperative guard in `onSubmit` and the
  marker's own condition must agree (2026-08-30: Sottocategoria was `.optional()` in zod, blocked by a guard, and
  starred on a condition NARROWER than the guard's). `AssetDialog`'s own fields, and how Sottocategoria became
  genuinely optional on both write paths: doc/guide/patrimonio.md § Two-Step Create Dialogs — `AssetDialog`.
- **The picker exists because the type is not one field among many** — it decides which categories/classes exist, which
  accounts are asked for, and how many balances move. Step 1 turns *one form with N conditional shapes* into *N plain
  forms*; a discriminant that only re-labels things does NOT earn a step.
- **Create opens on step 1, edit skips to step 2** — changing a saved record's type is a different act, with
  reconciliation consequences the in-form notice must explain, so the `Select` stays there and only there.
- **`setStep(record ? 2 : 1)` is settled during render on the `(open, record)` subject**, never in `useState`'s
  initializer (the record prop stays null between opens and the second "new" would reopen on the form) and, since
  2026-09-06, no longer in the `open` effect either (`react-hooks/set-state-in-effect`). **It stays so where the host
  mounts the dialog only while open** (Patrimonio since 2026-10-07 — § Dialog e form trasversali above): there an
  initializer would be right, but one way that holds for every host beats two; the comment above `openSubject` in
  `AssetDialog.tsx` says so, and `e2e/assets.rows.spec.ts` keeps «Nuovo after Modifica opens on step 1» as a guard.
- **Make the back-link callback OPTIONAL and let its absence select the `Select`** (`onBackToTypePicker?`), so the two
  controls are mutually exclusive by construction rather than via a second boolean that can drift.
- **The picker is a module-level component**, and the type entry carries `Icon` as the COMPONENT, never a rendered node.
- Step 1 selects through the same handler that re-points the category on a type change: the user can return to the
  picker with a category already chosen, and that category belongs to the type being left.

## Per-page blind spots

- **Blind spot** (looks like a bug, is not): no Playwright spec of its own (the session's throwaway ones were
  deleted; the refusal vocabulary is pinned by `e2e/cashflow.budget.spec.ts` and `e2e/cashflow.dividendi.spec.ts`,
  the feed's armed detail by `e2e/cashflow.tracciamento.spec.ts`, the counting filters by
  `e2e/cashflow.mobile.spec.ts`; the assistant's two modals have none). **Below 769px NO modal takes the focus when
  it opens** (measured 2026-09-18, with and without touch): vaul's `Drawer` defaults to `autoFocus = false`, so the
  focus stays on the opener behind the sheet, and after a hand-over between two drawers (a detail → its edit form)
  it lands on `body` because the opener has unmounted. A dialog above 768 focuses itself as Radix does. Not
  changed: `autoFocus` on a phone opens the keyboard on every form's first field, which is why vaul ships it off —
  it is a decision for all 40 mounts at once, not a polish.
  NO two-click confirm auto-disarms on a timer any more — that was not true until 2026-09-22, when Impostazioni's two
  (the category delete and the dividend sync, 3 s each) went to `useArmedDelete` with its revoke of an access. Before
  them the last one (`AssistantThreadList`, kept BY DESIGN while
  it lived on the rows of a side sheet) went to `useArmedDelete` on 2026-09-18, the day the sheet became a modal —
  inside a modal that timer was also a trap, Escape closing it with the row armed. The others lost theirs on 2026-09-14:
  Patrimonio's three (`AssetRow`, `StrumentiTile`, `CashAccountDialog` — the last one a MODAL whose armed state the
  page held on a timer, so Escape closed it with the row armed) went to `useArmedDelete` by the owner's call
  (doc/guide/patrimonio.md), and `DividendTable` followed the same evening (its «Conferma» kept the accessible name
  «Elimina» and no live region until then). `ResponsiveModal.returnFocusTo` names the control the focus goes back
  to: Radix restores it to whatever was focused at open, which is `body` after a window event or a non-focusable row. `describeWriteError` maps 11 Firestore codes and anything else takes the generic
  sentence, so a NEW cause is invisible until it is added — and a server message survives only if the thrower marks it
  `userFacingError`, which today only `assetTransactionService` does. The status line is FORM-level: per-field zod
  errors keep their own line under the field, and the two can both be visible at once. `dialogClassName` still exists as
  a width escape hatch and has no user — reach for a `width` name. `PDFExportDialog`'s «Genera PDF» moved from the body
  into the footer, so a spec that located it inside the scrollable area needs updating.
- **A controlled modal with no Radix `Trigger` hands focus to `body` on close** (2026-09-20, Rendimenti's two header dialogs,
  measured 2/2): `@radix-ui/react-dialog`'s modal content handles `onCloseAutoFocus` with `preventDefault()` +
  `triggerRef.current?.focus()`, and with no Trigger that ref is null — the FocusScope's own restore is cancelled and nothing
  replaces it. **Since 2026-10-08 `ResponsiveModal` keeps its own fallback**: a layout effect on `open` records
  `document.activeElement` (before Radix's FocusScope moves it into the content from a passive effect) and
  `onCloseAutoFocus` restores it — skipped when it is `body` or has since unmounted — so every keyboard opener and
  every Chrome click gets its focus back on all 40 modals without a prop (pinned by `e2e/pension.spec.ts`, seen red with
  the fallback removed). `returnFocusTo` still wins and is still needed where the opener NEVER held the focus: Safari
  does not focus a clicked button, and a row opened from a window event or a non-focusable cell leaves `body` focused at
  open. Fed from `event.currentTarget` at the click (a `PageHeader` action is mounted twice; only `currentTarget` is the
  copy that was pressed). Pinned by `e2e/performance.degraded.spec.ts`.
- **`e2e/modal.origin.spec.ts` can fail on a SLOW or cold dev server** (no `data-state="closed"` frame inside the
  sampler's 2,6 s window — the dialog opened more than ~1,5 s after the click; 2026-09-29 on the Windows laptop, 2026-10-04
  on the Mac with the server started cold for the one spec, on `develop` too). The window is the spec's, not the app's. An
  origin off the button's centre is NOT this flake: the spec reads the box after the entrance (doc/guide/e2e-emulatori.md).
  (moved from `CLAUDE.md` → Known Issues on 2026-10-07)
- **Sotto i 769px nessuna modale prende il fuoco quando si apre** (2026-09-18): `vaul` nasce con `autoFocus = false`, il fuoco resta sull'opener e dopo un passaggio tra due drawer finisce su `body`. Non cambiato: `autoFocus` su un telefono apre la tastiera su ogni form — una decisione per 40 mount. doc/guide/dialog.md. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
