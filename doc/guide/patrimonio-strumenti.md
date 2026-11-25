# Patrimonio — Strumenti

> **Quando aprire questa guida** — chi tocca `components/assets/{StrumentiTile,AssetRow,ArchivedInstruments}.tsx`, `lib/utils/{instrumentArchive,zeroQuantityChip}.ts` o la route `DELETE /api/assets/[assetId]`. Split da `doc/guide/patrimonio.md` il 2026-11-24 (la guida madre superava ~500 righe): qui la tabella e le righe degli strumenti, il gruppo degli azzerati e la regola dell'eliminazione; il resto della pagina (tile, valutazione, mutui, intestatari, composizione mobile) resta lì.

## Files

- **The sold-out group and the delete's refusal** (2026-11-24): the pure `lib/utils/instrumentArchive.ts` (`summarizeLedgerFootprints`, `isArchivedInstrument`, `splitArchivedInstruments`, `deleteBlockingOperations`, the words `describeArchiveGroup`/`describeSoldOn`/`describeDeleteRefusal`, `ALL_ARCHIVED_SENTENCE`, `DELETED_INSTRUMENT_NAME`), `components/assets/ArchivedInstruments.tsx` (a `lazyComponent` of `StrumentiTile`: closed by default and absent for most accounts, so out of the initial JS of `/dashboard/assets`), `lib/utils/deletedInstrumentName.ts` (the one word «Strumento eliminato», its own module so `periodSales` does not pull the group's words into a shared chunk; `instrumentArchive.ts` re-exports it), the `ledgerFootprints` the page builds from the trades it already reads, `AssetDeleteRefusedError` in `lib/services/assetService.ts`, the check in `app/api/assets/[assetId]/route.ts`; tests `__tests__/{instrumentArchive,strumentiTile,assetDeleteRoute,assetService.deleteAsset,periodSales}.test.ts{,x}`, `e2e/assets.archive.spec.ts` (1440) and `e2e/assets.archive.mobile.spec.ts` (390).
- **Composite class chip** (2026-09-26): `InstrumentClassChip` in `components/assets/AssetRow.tsx` (desktop `Classe` column and phone row; the group header keeps `AssetClassChip`), pure `describeAssetClassChip` + `rankedClassLegs` + `SHORT_CLASS_LABELS` in `lib/utils/assetDisplayClass.ts`; tests `__tests__/assetDisplayClass.test.ts`, `e2e/assets.composite-chip.spec.ts` (1440: the 112px floor, «Andamento» without sideways scroll, the grouped header's plain chip; 390: the chip ends before the amount after a 12-character ticker, `main` does not scroll)
- **Light rows and dialogs** (2026-10-07): `StrumentiTile` (`!useCompactLayout()` since 2026-10-14, one list), `AssetRow` (`ASSET_ROW_LAZY_CHARTS`, the sparkline a `lazyComponent`), `AssetSparkline` (colours as a prop), the `{ open, mounted }` state and the openers in `app/dashboard/assets/page.tsx`, `onExitComplete` in `components/ui/responsive-modal.tsx`, the six watching leaves at the top of `AssetDialog.tsx`; specs `e2e/assets.rows.spec.ts` (1440) and `e2e/assets.rows.mobile.spec.ts` (390), the census scenario `asset` (`scripts/perfRenderCensus.mjs`)
- **Suites to run after a change here** (2026-11-24): `instrumentArchive`, `strumentiTile` (dom), `assetDeleteRoute`, `assetService.deleteAsset`, `periodSales` · **Browser** `e2e/assets.archive{,.mobile}.spec.ts`, `e2e/assets.rows{,.mobile}.spec.ts`, `e2e/assets.sale-tax.spec.ts`

## Rules

- **A sold-out instrument with a history leaves the list** (owner, 2026-11-23; 2026-11-24): quantity 0 AND at least one row in the Registro (`isArchivedInstrument`, no new field) → a closed group at the bottom of the tile, «N strumenti azzerati» (`ArchivedInstruments`, the SAME component under the table and under the phone's rows). Opened it lists each one with its name, «venduto il {dd/mm/yyyy}» (the day of its last sale; «azzerato» when it was never sold — a correction to zero), «Movimenti» and «Compra» (the row's own trade dialog, on `buy`; «Compra» is disabled in the demo, «Movimenti» is a read), newest sale first. The opening position counts for the group. The group obeys the owner filter and no other control (sorting, «Raggruppa per classe» and «Andamento» act on the list above it); its open state is remembered per browser (`patrimonio.strumenti.azzerati`). A grouped row has no «Modifica» and no trash — it cannot be deleted by rule — and a re-purchase brings it back to the list with every action. **Stay in the list with their chip**: «Mai comprato» (created empty, no ledger row), «Estinto» (a loan) and a zero position with no ledger row. **While the ledger is unread** (`ledgerFootprints` null) nothing is archived and the chip says «Azzerato». **With every instrument in the group** the tile prints «Nessuno strumento in portafoglio: quelli venduti sono qui sotto.» in place of the table (no `<thead>`), at both widths; the tile's own empty sentence keeps its condition (`assets.length === 0`).
- **No deletion over a history** (owner, 2026-11-23): an instrument with an operation in the Registro other than the migration's opening position cannot be deleted. The route reads the asset's trades BEFORE any write and answers 409 `has-ledger-operations` with `operations` (the count of the owner's own rows), deleting nothing; `deleteAsset` throws `AssetDeleteRefusedError`, which `handleDelete` turns into a `toast.info`. With the ledger read, the trash (table and phone row) does not arm: it toasts `describeDeleteRefusal` and says the same sentence in the tile's live region — a toast, not a disabled button, because a disabled control explains nothing on touch. An instrument with no row is deleted as before (two presses); one whose ONLY row is the opening position (`isBaseline`) is deleted WITH it, since the server refuses to delete an opening position alone. To delete an instrument entered by mistake, delete its operations first from «Movimenti» (each delete re-validates the replay). No deleted asset has a fee row any more: the route no longer unlinks fee rows.
- **A new ledger instrument is born empty and bought in «Registra operazione»** (owner, 2026-11-23): `AssetDialog`'s create of a ledger type has no quantity, PMC or opening date; «Crea e registra l’acquisto» creates it at 0 units (`createdEmpty: true`), toasts «Strumento creato: ora registra il primo acquisto.», closes and opens the row's trade dialog on `buy` with the created asset re-read (`getAssetById`). Closed without buying, it sits in the list as «Mai comprato». The manual price («Prezzo manuale») is the only price field left on that create. The flow and the cached-`null` meta: doc/guide/registro-operazioni.md § Per-page blind spots.
- **The currency is a list, locked once the instrument has operations** (owner, 2026-11-23): «Valuta» offers the thirteen `INSTRUMENT_CURRENCIES` (`lib/constants/currencies.ts`) plus the form's current value when it is not among them (a legacy `GBp`, a currency a quote found). The ticker's blur looks the quote up silently and sets the currency with «Valuta rilevata: {CUR}» — never over a currency the owner picked (dirty field), and the submit's own quote never overwrites a picked or locked one. On an edit the select is disabled while the instrument holds units or has trades, with «La valuta non cambia: le operazioni sono registrate in {CUR}.» — a trade's price is in the instrument's currency. A cash account has no select: it is saved in euro (doc/guide/patrimonio.md § Asset Pricing, FX and Assets).
- **A sale whose instrument is gone reads «Strumento eliminato»** (`DELETED_INSTRUMENT_NAME`): in `summarizePeriodSales` (the Panoramica's and Patrimonio's sales verdict, the monthly email) and in Movimenti's rows, the row's id staying its key; a stored overview payload that names an orphan by id is rewritten the next Italian day.
- **Below `desktop:` the rows are `AssetRow`, flat and expandable** (CSS `grid-rows-[0fr] → [1fr]` with `inert`
  on the closed panel): a card per row inside the Strumenti tile would be a card inside a card. **ONE list is in the
  DOM per width** (2026-10-07): `StrumentiTile` reads `!useCompactLayout()` (since 2026-10-14; `useMediaQuery('(min-width:
  1440px)')` until then) — inclusive, as `desktop:` — and renders the table OR the rows; until 2026-10-07 both were there
  at every width, the hidden copy included. The tile mounts after the page's data, long after hydration, so the hook's
  server snapshot never decides it (it would be the TABLE, patrimonio.md § Composizione mobile). The tile's toggles and footer sentences still switch by CSS: they hold no list. **A row draws its
  sparkline at its FIRST opening and keeps it** (`hasOpened`; unmounting it on close would empty the panel while it
  collapses), in a 32px slot reserved before (`SPARKLINE_SLOT`), so the panel's height never moves; the chart is a
  `lazyComponent` — the only path from Patrimonio to recharts, so the page's initial JS lost recharts (764,7 → 655,8 KB
  gz) — preloaded when idle on a phone only, and its colours come from the page's ONE `useChartColors()` as a prop. It
  no longer animates its draw: the line used to animate inside the closed row at page load, so a reader opening a row
  always found it already still. Before: one recharts chart per row, its rAF loop and its `getComputedStyle` on a phone at
  each visit, all closed. Pinned by `e2e/assets.rows{,.mobile}.spec.ts`. Class chips take
  their label from `ASSET_CLASS_LABELS` (Italian); `lib/utils/assetUtils.ts` with its English map is gone.
- **A composite instrument is ONE row with a split chip** (2026-09-26): a 60/40 fund stays one row, grouped and sorted
  under its prevailing class, but its chip (`InstrumentClassChip`) has one segment per composition leg, as wide as the
  leg's share of the market value (`leverageRatio` never widens a segment), each tinted like that class's own chip.
  Two segments read «Azioni · Obbl.» (fixed short forms, `SHORT_CLASS_LABELS` — the sixth label map,
  doc/guide/allocazione.md), three or more «Misto»; a leg under 5 % (`MIN_CHIP_SEGMENT_PCT`) gets no segment and no
  word (a 97/3 fund reads «Azioni» at plain width) but stays in the `sr-only` shares («Azioni 97%, Liquidità 3%») —
  text, not an `aria-label`, since the chip's content is the information. **The 5 % floor reads the share AS
  PRINTED** (one decimal, `formatPercentageIt`): a 4,96 % leg is heard as «5%» and keeps its segment, a 4,94 % one is
  heard as «4,9%» and has none — the chip never drops a leg the screen reader announces at 5 % or more. The widths are
  normalised over the visible legs; the spoken shares are the stored ones, unscaled. **From two segments the chip is
  at least 112px wide in the desktop table only** (`desktop:min-w-[112px]`, owner's decision 2026-09-27): there the
  chips stand in the Classe column and the proportions compare down it; on the phone row each chip starts after a
  ticker of its own width, so there is no column, and a floor would push the chip under the amount on a long ticker. **One
  ranking for group and chip** (`rankedClassLegs`: one leg per class, largest first, ties to the first in the
  composition): a class named twice is summed before ranking, so the first segment IS the group. **The ring is an
  overlay, not a CSS border**: a `border-box` gradient under a translucent `padding-box` fill shows through and doubled
  the tint (seen in the browser, 2026-09-26); the overlay is the 30% gradient masked to its outer 1px
  (`mask-composite: exclude`), and the chip's 1px of padding stands in for the plain chip's border, so both measure
  the same. In the inline style the `-webkit-mask` pair is declared BEFORE the standard `mask`: an engine that aliases
  the prefixed shorthand to `mask` would otherwise reset the `exclude`. The ring itself is asserted by no test (the
  spec reads the fill's stops only) — look at it in the browser when touching the mask.
- **«Andamento» is a VIEW, not four more columns** (2026-09-14, the page's first Impeccable critique): with the
  toggle on, Quantità · Prezzo · PMC · TER leave the table and the three Δ windows take their place, so at 1440
  nothing scrolls and the actions never leave sight (appended, the Δ columns pushed the actions column 202px out of
  view; made sticky, the actions column covered the Δ columns at rest — the thing the toggle exists to show). The
  actions column stays `sticky right-0 bg-card` as the safety net for a table that does scroll, with a 1px left rule
  only while it does (`tableScrolls`, measured); **`right-5` to mirror the wrapper's `px-5` is wrong** — the sticky
  constraint is measured from the scroller's CONTENT edge and shifted the column 20px over the last Δ cell. The
  three Δ columns are sortable (a row without the window goes last in both directions), every sortable header is
  a `<th aria-sort>` with a `<button>` inside (a focusable `<th>` reads as a heading and takes the browser's default
  outline), the actions header is named `sr-only` («Azioni sulla riga» — a visible «AZIONI» sat over a column of
  «Azioni» class chips), and both toggles are remembered per browser (`localStorage`, `STORAGE_KEYS`).
- **The table says what the storage does not** (same session). A hand-VALUED holding — `!hasMarketPrice(type,
  subCategory)`: a property, a pension fund, a private-equity stake, value in `quantity` at price 1 — prints «—» in
  Quantità/Prezzo/PMC and «valore a mano dal 12/08» under its name (`describeManualValuation`, off
  `lastPriceUpdate`), and **`hasCostBasis` is false for it**: its PMC equals its price by construction, so the G/P
  was a structural «+0,00 €» (on a private-equity stake, for one), a zero nothing measured. A quoted
  instrument the owner prices by hand (`autoUpdatePrice: false`) keeps its real quantity, price and PMC. A bond
  prints «scade il 10/03/2032 · prossima cedola 10/12» (`resolveBondRowFacts` in `patrimonioSummary.ts` reads the
  dates the coupon scheduler already knows, `describeBondRow` in `patrimonioNarrative.ts` says them; the coupon
  clause drops for a zero coupon or a matured bond); the composition of the sub-line is `describeAssetRowSubLine` in
  `AssetRow.tsx`, shared by the table and the mobile row — NOT in the narrative module, which must stay SDK-free.
- **Every delete on the page is `useArmedDelete`** (2026-09-14, owner's call: the table rows, `AssetRow` and the
  cash-account modal all lost the 3 s timer that dialog.md had kept «by design» on rows): the arm and the disarm
  are announced through ONE `role="status"` live region per tile (`StrumentiTile` passes `announce` to every
  row and to `AssetRow`), the armed label is «Premi di nuovo per eliminare {name}», and in `CashAccountDialog` the
  READING carries the consequence while armed («Elimini Conto BNL e il suo saldo di 6044,37 €: i movimenti
  collegati restano nel cashflow senza conto. Non è reversibile.», `describeCashAccountReading`) — before, the page
  held the armed state on a timer, `hasArmedConfirm()` was false and Escape CLOSED the modal with the row armed.

## Per-page blind spots

- **«Intestatari» in quote on a new ledger instrument** (owner, 2026-11-25, left as it is): the instrument is born at 0 units, so the units form reads «0 + 0 + 0 = 0 quote» and a typed quota is past the whole until the first buy; the percent form works from the create, the units one from «Modifica» once it holds units.
- **Sold-out group** (2026-11-24): a zero position with no ledger row stays in the list, deletable; an existing orphan's tax is not estimated (its rate went with the asset — the sentence has the «imposta non stimata» form); the delete's check and its batch are not one transaction (a trade created on the asset between the two — another tab, the Assistente — would be orphaned); a bond past maturity stays in the list until its sale is recorded; the sold-out label is not shown in other pickers (Accumulo's instrument picker, the Assistente's lists).
- **Light rows and dialogs** (2026-10-07): typing an ISIN still re-renders the whole asset form at each key — it turns
  every bond label to «% del nominale», so it stays a root watch (rare, one field); a row's sparkline, once opened,
  stays mounted until the page unmounts; the account detail and the asset form cross-fade when «Modifica» hands one
  over to the other (the detail plays its exit, which it used to skip); a phone downloads the sparkline's chunk when
  idle even if no row is ever opened.
- **Composite chip**: sorting by «Classe» and the group headers still read the PREVALENT class only — a 60/40 fund
  sorts and groups with pure «Azioni» (one instrument, one row; the split lives in the chip); the chip's segments are
  the stored `composition`, never re-read from the market, so a fund whose mix drifted shows its last saved split.
