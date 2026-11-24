# DATI-05 — Sold-out instruments: a closed group, no deletion over a history, a name for the orphans

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: nothing. Written on 2026-11-23; every `file:line`
> is cited @ b0bf8276 (a line number is a hint, the function's name is the anchor). Owner's points 7.3, 7.4 and 7.5;
> decisions 3, 4, 57 and 58.

## 1. The problem today (evidence on the code)

- **A sold-out instrument sits among the held ones.** Strumenti draws every asset that is not a cash account
  (`app/dashboard/assets/page.tsx:329`); an instrument at quantity 0 keeps its row, in the order of the others
  (`components/assets/StrumentiTile.tsx:391-425`, `sortedAssets`), told apart only by a chip — «Azzerato», «Mai
  comprato», «Estinto» (`:497-501`, `lib/utils/zeroQuantityChip.ts`). The table grows with every position ever closed.
- **Deleting an instrument orphans its history, and nothing says so.** The trash button arms on a first press and
  deletes on the second (`StrumentiTile.tsx:194-225`, `components/assets/AssetRow.tsx:473-487`), the words being only
  «Premi di nuovo per eliminare {name}». `DELETE /api/assets/{id}` (`app/api/assets/[assetId]/route.ts:52-174`)
  removes the future dividends, unlinks the fee rows and deletes the asset document; it does NOT touch
  `assetTransactions`. The trades stay, naming an asset that no longer exists.
- **An orphan sale reads as an id.** `summarizePeriodSales` writes `name: asset ? getAssetDisplayTicker(asset) :
  assetId` (`lib/utils/periodSales.ts:139`) — a Firestore id in the Panoramica's and Patrimonio's sales verdict
  (`lib/services/dashboardOverviewService.ts:667`) and in the monthly email (`lib/server/monthlyEmailService.ts:1364`)
  — and estimates no tax (`estimateSaleTax(gainToEstimate, asset?.taxRate)`, `:136`, null without a rate). Movimenti
  already says «Strumento eliminato» (`components/assets/tiles/MovimentiTile.tsx`, the visible name and, in lower
  case, the `aria-label`).
- No E2E covers the chips nor the delete; Vitest has `zeroQuantityChip`, `strumentiTile.test.tsx`,
  `assetDeleteRoute.test.ts`.

## 2. Goal and acceptance criteria

1. In Strumenti, an instrument at quantity 0 that has at least one row in the Registro operazioni leaves the list and
   joins a group at the bottom of the tile, closed, titled «N strumenti azzerati» («1 strumento azzerato»). Proof:
   U1, R1, E1.
2. Opened, the group lists each one with its name, «venduto il {dd/mm/yyyy}» (the day of its last sale) and two
   actions, «Movimenti» and «Compra»; newest sale first. Proof: U2, R1.
3. «Mai comprato» (created empty, no ledger row), «Estinto» (a loan) and a zero position with no ledger row stay in
   the list with their chip, as today. Proof: U1.
4. The group obeys the owner filter and no other control: sorting, «Raggruppa per classe» and «Andamento» act on the
   list above it. Its open/closed state is remembered per browser. Proof: R2.
5. The same group closes the phone's list of rows (below `desktop:`). Proof: R3, E2.
6. When every instrument is in the group (none live), the tile shows the sentence «Nessuno strumento in portafoglio:
   quelli venduti sono qui sotto.» in place of an empty table, at both widths (decision 58). Proof: R6.
7. An instrument with an operation in the Registro other than the migration's opening position cannot be deleted:
   the server answers 409 with the count and deletes nothing; the button, when the ledger is read, does not arm and
   says why, in the table and in the phone's rows. Proof: S1, R4, R5, E1.
8. An instrument with no row in the Registro is deleted as today (two presses); one whose ONLY row is the opening
   position is deleted with that row (decision 57). Proof: R4 (the case with 0 operations arms as before), S2, S3.
9. A sale whose instrument no longer exists reads «Strumento eliminato» wherever `summarizePeriodSales` feeds a name.
   Proof: U4.
10. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run` and `TZ=UTC npx vitest run` green;
    `npm run perf:budget` green with `/dashboard/assets` inside its ceiling, raised by no more than 1 KB gz and only
    with the register row (index § 8 rule 7); `npm run mobile:budget` identical to `develop`'s run of the same day on
    the Patrimonio surfaces (the census fixture has no sold-out instrument — § 8).

## 3. Decisions

- **Decision 3** (owner, 2026-11-23): a closed group at the bottom of the table, automatic — quantity 0 plus
  operations in the ledger, no new field; opened it shows «venduto il», Movimenti, Compra; «Mai comprato» stays above.
- **Decision 4** (owner, 2026-11-23): deletion is forbidden when the instrument has operations — no trash bin; the
  row says why; the sales already orphaned read «Strumento eliminato».
- **Decision 57** (owner, 2026-11-23), which narrows decision 4: the migration's opening position is not an
  operation of the owner's. An instrument whose only row in the Registro is that opening position is deleted WITH
  it — the server refuses to delete an opening position on its own (`prepareDelete`: «La posizione iniziale non può
  essere eliminata.»), so without this an instrument entered by mistake before the migration could never go.
- **Decision 58** (owner, 2026-11-23): with every instrument sold out, a sentence takes the table's place.
- Adopted, reversible:
  - (a) **the opening position counts for the group, not for the refusal**: an instrument at zero whose rows
    include it is archived like any other; the trash counts only the rows that are NOT it. To delete an instrument
    created by mistake the owner deletes its operations first, from «Movimenti» — each delete re-validates the
    replay — and the opening position, when there is one, leaves with the instrument.
  - (b) a grouped row has no «Modifica» and no trash: it cannot be deleted by rule, and a re-purchase brings it back
    to the list with every action.
  - (c) the refusal is a toast, not a disabled button: a disabled control explains nothing on touch.
  - (d) the fee-unlinking block of the DELETE route goes: with the refusal no deleted asset can have a trade.
  - (e) the tax of an existing orphan stays unestimated (its rate went with the asset); the sentence already has the
    «imposta non stimata» form.

## 4. Solution

### 4.1 Pure module — `lib/utils/instrumentArchive.ts` (new, written here)

```ts
/**
 * The instruments that were sold out: what the Registro operazioni says about them, and the words.
 *
 * An instrument at zero quantity WITH a history is not a holding and not a mistake: it leaves the list
 * for a closed group, and it cannot be deleted — its trades are what the realized gains, Rendimenti and
 * the sales of a month are computed from (owner, 2026-11-23). One created empty and never bought has no
 * history: it stays in the list, deletable.
 */
import type { Asset } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';
import { formatItalianDate } from '@/lib/utils/dateHelpers';

export interface LedgerFootprint {
  /** Every row of the instrument in the ledger, the opening one included. */
  operations: number;
  /** The rows the owner entered: every row but the migration's opening position. These forbid a delete. */
  ownOperations: number;
  /** The day of its most recent sale, null when it was never sold. */
  lastSale: Date | null;
}

export function summarizeLedgerFootprints(transactions: AssetTransaction[]): Map<string, LedgerFootprint> {
  const footprints = new Map<string, LedgerFootprint>();
  for (const trade of transactions) {
    const footprint = footprints.get(trade.assetId) ?? { operations: 0, ownOperations: 0, lastSale: null };
    footprint.operations += 1;
    if (!trade.isBaseline) footprint.ownOperations += 1;
    if (trade.type === 'sell' && (!footprint.lastSale || trade.date > footprint.lastSale)) footprint.lastSale = trade.date;
    footprints.set(trade.assetId, footprint);
  }
  return footprints;
}

type Position = Pick<Asset, 'id' | 'quantity'>;

/** Null footprints = the ledger is not read yet: nothing is archived, the chip keeps saying «Azzerato». */
export function isArchivedInstrument(asset: Position, footprints: ReadonlyMap<string, LedgerFootprint> | null): boolean {
  return asset.quantity === 0 && (footprints?.get(asset.id)?.operations ?? 0) > 0;
}

/** The list and the group. The group comes newest sale first; one never sold (a correction to zero) last. */
export function splitArchivedInstruments<T extends Position>(
  assets: T[],
  footprints: ReadonlyMap<string, LedgerFootprint> | null,
): { live: T[]; archived: T[] } {
  const live: T[] = [];
  const archived: T[] = [];
  for (const asset of assets) (isArchivedInstrument(asset, footprints) ? archived : live).push(asset);
  const saleTime = (asset: T) => footprints?.get(asset.id)?.lastSale?.getTime() ?? 0;
  archived.sort((a, b) => saleTime(b) - saleTime(a));
  return { live, archived };
}

export function describeArchiveGroup(count: number): string {
  return count === 1 ? '1 strumento azzerato' : `${count} strumenti azzerati`;
}

export function describeSoldOn(footprint: LedgerFootprint | undefined): string {
  return footprint?.lastSale ? `venduto il ${formatItalianDate(footprint.lastSale)}` : 'azzerato';
}

/**
 * How many rows forbid the delete: the owner's own, never the migration's opening position (an
 * instrument entered by mistake before the migration goes with it). Null = the ledger is not read.
 */
export function deleteBlockingOperations(
  assetId: string,
  footprints: ReadonlyMap<string, LedgerFootprint> | null,
): number | null {
  return footprints ? footprints.get(assetId)?.ownOperations ?? 0 : null;
}

/** Why the trash did nothing. `operations` comes from the ledger in hand or from the server's 409. */
export function describeDeleteRefusal(name: string, operations: number): string {
  const rows = operations === 1 ? '1 operazione' : `${operations} operazioni`;
  return `${name} ha ${rows} nel registro e non si può eliminare: da lì si calcolano plusvalenze e rendimenti. Per eliminarlo, elimina prima le sue operazioni da «Movimenti».`;
}

/** The tile's body when every instrument is in the group. */
export const ALL_ARCHIVED_SENTENCE = 'Nessuno strumento in portafoglio: quelli venduti sono qui sotto.';

export const DELETED_INSTRUMENT_NAME = 'Strumento eliminato';
```

`formatItalianDate` is `lib/utils/dateHelpers.ts:121`; U2 pins its output on a fixed day so a format change there is seen.

### 4.2 Page and tile

- `app/dashboard/assets/page.tsx:290`: beside `tradedAssetIds`, `const ledgerFootprints = useMemo(() =>
  (tradesQuery.data ? summarizeLedgerFootprints(tradesQuery.data) : null), [tradesQuery.data]);`, passed to
  `StrumentiTile` as `ledgerFootprints`. `tradedAssetIds` stays (the chip reads it).
- `components/assets/StrumentiTile.tsx`:
  - after `visibleAssets` (`:303-306`): `const { live, archived } = splitArchivedInstruments(visibleAssets,
    ledgerFootprints);` — `sortedAssets` (`:391`) and `groupedAssets` (`:428`) take `live` in place of `visibleAssets`.
  - a new stored toggle `STORAGE_KEYS.showArchived` = `'patrimonio.strumenti.azzerati'` (beside `showDeltas`, `:121`),
    read with `readStoredToggle`, off by default.
  - below the table (after `</div>` of `:804`) and below the phone's rows (after the map of `:718`), when
    `archived.length > 0`: one disclosure, the SAME component at both widths —
    `components/assets/ArchivedInstruments.tsx` (new): a `<button aria-expanded aria-controls>` row with a chevron and
    `describeArchiveGroup(archived.length)`, and, open, a `<ul>` of rows: name (ticker under it when it differs),
    `describeSoldOn(footprints.get(id))` in `text-muted-foreground`, then «Movimenti» (`onMovements(asset)`) and
    «Compra» (`onRegisterTrade(asset)`, the handler the row's «Registra operazione» button already calls, `:567-580` —
    the dialog opens on «Compra», type `buy`, its default). Text buttons (`variant="ghost" size="sm"`), 44 px tall
    below `desktop:`; only «Compra» is disabled with the demo's title when `isDemo` — «Movimenti» reads, as the
    row's own button does. The list is one Tab stop per button (two per row): no roving focus, the group is short.
  - when `live.length === 0 && archived.length > 0`, the table (its `<thead>` included) and the phone's list are
    replaced by `<p className="text-[13px] text-muted-foreground">{ALL_ARCHIVED_SENTENCE}</p>`, the element of the
    tile's existing empty sentence («Nessuno strumento ancora…»), which keeps its own condition (`assets.length === 0`);
    the group follows it.
  - `DeleteButton` (`:194`) takes `operations: number | null` = `deleteBlockingOperations(asset.id, ledgerFootprints)`.
    With `operations > 0` its click neither arms nor deletes: it calls `toast.info(describeDeleteRefusal(asset.name,
    operations))` and announces the same sentence through the tile's live region; `aria-label` stays «Elimina
    {name}». With 0 or null it behaves as today. `AssetRow.tsx` (`:269-280`, `:473-487`) receives the same count as a
    new prop `deleteOperations?: number | null` (default null) and does the same on its own trash.
  - `handleDelete` (`:352-364`) takes the asset id only: the name it prints is
    `assets.find((a) => a.id === assetId)?.name ?? DELETED_INSTRUMENT_NAME` (`assets` joins the callback's
    dependencies). A rejection that is an `AssetDeleteRefusedError` toasts `describeDeleteRefusal(name,
    error.operations)` with `toast.info` instead of `describeWriteError`.
  - the two comments that say a sold position «stays in the table» are rewritten to the new rule.
- `lib/services/assetService.ts`: exports
  `class AssetDeleteRefusedError extends Error { readonly code = 'has-ledger-operations'; constructor(readonly operations: number) { super('Asset has ledger operations'); } }`.
  `deleteAsset` (`:528`) throws it on a 409 whose body has that `code`, with the body's `operations`; its final
  `catch`, which wraps every error in «Failed to delete asset …», first rethrows it untouched
  (`if (error instanceof AssetDeleteRefusedError) throw error;`). `lib/hooks/useAssets.ts`: the comment of
  `useDeleteAsset` on the fee rows «unlinked by the same call» is rewritten — an asset that reaches the delete has no
  fee row; the expenses invalidation stays.

### 4.3 Server — `app/api/assets/[assetId]/route.ts` DELETE

The route already reads the asset's trades (`tradesSnapshot`, two equalities, no composite index) to unlink their
fee rows. That read moves right after the ownership check (`:66-82`), before anything is deleted, and decides:

```ts
// The migration's opening position is not an operation of the owner's: it leaves with the instrument (2026-11-23).
const ownTrades = tradesSnapshot.docs.filter((tradeDoc) => tradeDoc.data().isBaseline !== true);
if (ownTrades.length > 0) {
  return NextResponse.json(
    { error: 'Asset has ledger operations', code: 'has-ledger-operations', operations: ownTrades.length },
    { status: 409 },
  );
}
```

(`docs.filter` and `.length`, never `.empty`: the route's unit mock answers `{ docs, size }`.) Past the check every
remaining trade is an opening position: `tradesSnapshot.docs.forEach((tradeDoc) => batch.delete(tradeDoc.ref));`
joins the batch beside the dividends and the asset. The block that unlinks the fee rows (`feeRowIds`, `feeRowSnaps`,
the `batch.update` with `FieldValue.delete()`) is removed with its comment — an opening position carries no fee —
and `FieldValue` leaves the import. The JSDoc's cascade loses the fee line and gains the 409 and the opening
position; the future-dividends delete stays; the success log names the opening rows removed.

The check and the batch are not one transaction: a trade created on the asset between the two (another tab, the
Assistente) would be orphaned. Declared in doc/guide/patrimonio.md § Per-page blind spots (§ 9), not cured.

### 4.4 The orphan's name — `lib/utils/periodSales.ts:139`

`name: asset ? getAssetDisplayTicker(asset) : DELETED_INSTRUMENT_NAME`. Two orphans in one period read as two rows
with the same name: they are two instruments, and the row's `id` (still the asset id) keeps the React keys distinct.
`components/assets/tiles/MovimentiTile.tsx` takes the constant for the visible name; its `aria-label` keeps the
lower-case form through `DELETED_INSTRUMENT_NAME.toLowerCase()`. The constant is the ONE word for a trade whose asset
is gone: DATI-15 imports it (index § 7).

## 5. Constraints and traps

- **«A list as ONE Tab stop»** (`useRovingFocus`): here it means NOT here — the group is a short disclosure of
  buttons, the pattern of a tile's footer actions; the table above keeps its own behaviour.
- **The Closed-Row Rule / First-Screen Rule** (DESIGN.md): the group is inside the Strumenti tile, below
  `desktop:` inside its open row — it adds no closed row to the page and no figure to the first screen.
- **«A tile stretched…is cured in the GRID»**: the footer paragraph (`:810`, `mt-auto`) stays the tile's last child;
  the group goes above it.
- **Server route shape + `assertCanAccessAccount`**: the new query uses the `userId` the route already authorized.
- **Max 3 `.where()` on a unit-tested chain**: two here.
- **Demo mode**: every mutation is gated by `isDemo`; «Compra» too. «Movimenti» is a read and stays enabled.
- **The React Compiler is on**: `splitArchivedInstruments` is called in render; no `useMemo` is needed, but
  `sortedAssets` keeps its own (it is an input of other memos).
- **Invented figures**: the fixtures name instruments «ornitorinco» and «fenicottero», never a real ticker.
- **A series label never enters the code.**

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/instrumentArchive.test.ts` | quantity 0 + 2 rows → archived; quantity 0 + no row → live; quantity 5 + rows → live; footprints null → nothing archived | `> 0` → `>= 0` |
| U5 | unit · same | `deleteBlockingOperations`: an opening position alone → 0; an opening position and two trades → 2; no row → 0; footprints null → null | count `operations` in place of `ownOperations` |
| U2 | unit · same | `lastSale` is the latest SELL, a later BUY ignored; the group is newest sale first; `describeSoldOn` prints the Italian day of a fixed date | `trade.type === 'sell'` dropped |
| U3 | unit · same | the two forms of `describeArchiveGroup` and of `describeDeleteRefusal` | swap singular/plural |
| U4 | unit · `__tests__/periodSales.test.ts` | a sale whose asset is missing is named «Strumento eliminato», its id kept (the existing case «…label an unknown asset by its id» becomes this one) | restore `assetId` |
| R1 | dom · `__tests__/strumentiTile.test.tsx` | with one archived instrument: not in the table, a button «1 strumento azzerato» `aria-expanded="false"`; opened: its name, «venduto il …», «Movimenti», «Compra» | `live` → `visibleAssets` in `sortedAssets` |
| R2 | dom · same | sorting by value does not reorder the group; the owner filter hides a member's archived row; reopening the tile restores the open state from `localStorage` | group fed from `assets` instead of `visibleAssets` |
| R3 | dom · same (compact layout mocked) | the group follows the phone rows | render it only in the table branch |
| R4 | dom · same, `describe.each` on the two layouts (`layout.compact` false and true) | trash on an instrument with 3 own operations: it does not arm (no «Conferma» in the table, no «Premi di nuovo» in the phone's row) and `toast.info` is called with the refusal; on one with 0, and on one with the opening position alone: arms as before | drop the `operations > 0` branch |
| R5 | dom · same | `deleteAsset` rejecting with `new AssetDeleteRefusedError(2)` (the ledger not read, the button armed) → `toast.info` with the refusal naming the instrument, never the generic failure | rewrap the error in `deleteAsset`'s catch (the unit of `__tests__/assetService.deleteAsset.test.ts`, new: a 409 with the code → `AssetDeleteRefusedError` with `operations`) |
| R6 | dom · same, both layouts | every instrument archived → `ALL_ARCHIVED_SENTENCE`, no `<thead>`, the group below | keep the empty table |
| S1 | unit · `__tests__/assetDeleteRoute.test.ts` | one trade of the owner's → 409, `code`, `operations: 1`, no `delete` called on any ref; an opening position and one trade → 409 with `operations: 1` | move the check after the delete |
| S2 | unit · same | no trade → the asset and its future dividends are deleted (the file's first test, rewritten; its second, «skips a named fee row that no longer exists», is deleted with the block it covered, and the header's lines on the fee unlink go) | — (kept behaviour) |
| S3 | unit · same | the opening position alone → 200, the asset AND `baseline-{assetId}` deleted | drop the `isBaseline` filter (the route answers 409) |
| E1 | e2e · `e2e/assets.archive.spec.ts` (new) | planted: «ornitorinco» (two trades, quantity 0), «fenicottero» (`createdEmpty`, no row) and a held «ETF Alfa» with one buy. The first is under «1 strumento azzerato», the second in the table with its chip and its trash deletes it; the trash of «ETF Alfa» toasts the refusal and the row stays after a reload; a direct `page.request.delete('/api/assets/{id}')` with the test's token answers 409 with `operations: 1` | drop the `operations > 0` branch of `DeleteButton` (the toast assertion); remove the server check (the direct call) |
| E2 | e2e · `e2e/assets.archive.mobile.spec.ts` (new) | at 390: the group under the rows, 44 px buttons, no horizontal overflow | fixed 32 px height |

**The harness.** `__tests__/strumentiTile.test.tsx` mocks `sonner` with `success` and `error` only: the mock gains
`info: vi.fn()`. R2 drives the owner filter, a Radix `Select` that jsdom cannot open: the test mocks
`@/components/ui/select` with a native `<select>` (`Select` → `select`, `SelectItem` → `option`, `SelectTrigger`,
`SelectValue` and `SelectContent` → fragments) and changes it with `fireEvent.change`. E1 and E2 plant their three
instruments with the Admin SDK and remove them in `afterAll`, the ledger rows first and then the assets (each suite
its own fixture, doc/guide/e2e-playwright.md).

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: an instrument sold in full disappears from the table and appears under
«1 strumento azzerato»; «Compra» there opens the purchase dialog and, saved, the instrument is back in the table;
the trash on any instrument with operations answers with the refusal sentence and deletes nothing.

- A — the diff. B–E by a throwaway Playwright script on the emulators, at 1440 and 390: B sell all of «ornitorinco»
  → grouped, «venduto il» today; C «Compra» → back in the list; with every instrument sold, the sentence in place
  of the table; D trash on an instrument created in the run with one purchase → the toast, the row after reload;
  delete that purchase from Movimenti, then the trash arms and deletes; trash on a seeded instrument that has only
  its opening position → it arms and deletes, and `baseline-{id}` is gone from the emulator; E an orphan sale
  planted (a trade whose asset document is removed through the Admin REST, together with
  `dashboardOverviewSummaries/{uid}` so the Panoramica recomputes) → Panoramica's sales sentence says «Strumento
  eliminato».
- F — at the owner's «pronto», on the mirror: the group on his own sold-out instruments.

## 8. Putting it into service

No DDL, no rules, no index. `scripts/seedCensusE2E.mts` is not touched (no sold-out instrument: the first-screen
budget does not move). No bump of `DASHBOARD_OVERVIEW_SOURCE_VERSION`: a stored payload that names an orphan by its
id is rewritten the next Italian day. Measure: `perf:budget` on `/dashboard/assets` (ceiling 750 KB gz; the new
component is small — stop above +1 KB) and `mobile:budget` against `develop` the same day. With phase F closed and
the commit in `develop`, the owner opens the PR `develop` → `main` (index § 8 rule 13).

## 9. Documentation

- `doc/guide/patrimonio.md` (493 lines: this spec takes it past ~500, so this session SPLITS it — decision 47: the
  section on Strumenti, with the group and the deletion rule, moves to a new `doc/guide/patrimonio-strumenti.md`,
  with its stub in AGENTS.md § 3 and its line in CLAUDE.md's Patrimonio entry; `patrimonio.md` keeps one sentence
  that points there). In the Strumenti text: the sentence on `isHeld` («a sold position stays in the table as
  «Azzerato»») is REWRITTEN — a sold position with operations leaves the list for the closed group; the group (rule,
  words, what stays in the list, the all-archived sentence); the deletion rule beside the paragraph «Every delete on
  the page is `useArmedDelete`» (own operations forbid it, the opening position leaves with the instrument, how to
  delete a mistake); the bullet «Deleting an asset unlinks its trades' fee rows» of § Asset Pricing is removed.
  § Files: the two new modules. § Per-page blind spots: a zero position with no ledger row stays in the list,
  deletable; an existing orphan's tax is not estimated; the delete's check and its batch are not one transaction; a
  bond past maturity stays in the list until its sale is recorded; the sold-out label is not shown in other pickers
  (Accumulo's, the Assistente's lists).
- `doc/guide/registro-operazioni.md` — the sentences on the asset's delete route that «remove `feeOfTradeId`» are
  rewritten: an instrument with own operations cannot be deleted (409 `has-ledger-operations`), one with the opening
  position alone is deleted with it. `doc/guide/cashflow.md` — «A row whose trade or asset was deleted wholesale
  loses `feeOfTradeId`» loses «or asset» (no deleted asset has a fee row any more).
- `AGENTS.md` § 3, Patrimonio stub — rewritten at equal or shorter length with both rules and the date; one stub
  added for the new guide.
- `DESIGN.md` — no change (no new pattern: a disclosure inside a tile).
- `Draft Release Temp.md` — one entry prepended in `## 🔧 Improvements`, in the file's form: «**Patrimonio — gli
  strumenti azzerati** — Changed Strumenti: an instrument sold in full leaves the list for a closed group at the
  bottom, «N strumenti azzerati», with «venduto il», «Movimenti» and «Compra»; an instrument with operations in the
  Registro can no longer be deleted (the trash says why), and the sales of an instrument deleted before read
  «Strumento eliminato».»
- `CLAUDE.md` — the Patrimonio line rewritten at equal or shorter length with «a sold-out instrument in a closed
  group, never deleted over its history» and the new guide; the «Latest» entry REPLACED whole (decision 46: the
  date, this spec in one sentence, «Open: doc/dati/ (README § 6)», «Next: DATI-06»); under 20.000 characters,
  counted with `node`.
- `doc/dati/README.md` § 6: status row.

## 10. Declared out of scope

- The dividends of a sold-out instrument → DATI-04.
- A bin with restore, or a deletion that also removes the owner's trades → not planned (decision 4; decision 57
  removes the opening position only).
- The sold-out label in other pickers (Accumulo's instrument picker, the Assistente's lists) → not planned;
  doc/guide/patrimonio.md § blind spots names it.
- Repairing the existing orphan trades (re-attaching a name or a tax rate) → not planned: the asset is gone.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-05-strumenti-azzerati.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, regole della serie)
- Leggi doc/guide/patrimonio.md, doc/guide/registro-operazioni.md, doc/guide/server.md,
  doc/guide/dialog.md, doc/guide/e2e-playwright.md e doc/guide/e2e-emulatori.md PRIMA di scrivere codice in
  quei domini
- Tocca la UI: leggi DESIGN.md e PRODUCT.md prima di disegnare
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Prima di tutto: lancia `node ~/.claude/processi-collaudo.mjs` (conta gli script di collaudo e i servizi
che questo repo usa — emulatori Firebase, server Next — ancora accesi; la seconda riga dell'output
dice quali servizi ha cercato). Se trova qualcosa non è di
questa sessione, che è appena iniziata: quelli «di un'altra sessione aperta» non si toccano; quelli
«di nessuna sessione nota» me li nomini (cosa, da quanto) e li chiudi con `--chiudi --anche-ignote`
solo dopo il mio sì. Dimmelo in una riga: «processi: nessuno» oppure l'elenco.

Se il repo ha un lockfile: lancia l'audit del gestore di pacchetti e confrontalo con
doc/guide/dipendenze.md (regola 8 di WORKFLOW.md). Rispondimi in una riga: invariate dal
<data>, oppure gli avvisi nuovi; quelli nuovi li registriamo nella guida con una decisione,
non si aggiorna nulla in questa sessione. Se la guida manca, creala.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: il modulo puro con U1–U5, la route DELETE (S1–S3),
l'errore tipizzato di assetService.deleteAsset, il gruppo nella tessera a entrambe le larghezze, la frase
«tutti azzerati» e il cestino che rifiuta (R1–R6, con i due cambi dell'harness del § 6), il nome
dell'orfano in periodSales e in MovimentiTile (U4), poi E1 ed E2 sugli emulatori, i documenti del § 9
(con la divisione di doc/guide/patrimonio.md) e la riga 05 di doc/dati/README.md § 6 a `implemented`.
OGNI test del § 6 va visto rosso con la sua mutazione; la suite gira sotto TZ=Europe/Rome e sotto TZ=UTC.
Il codice dei § 4.1 e § 4.3 è già scritto: copialo.

Fermati e chiedimi se: la tessera Strumenti non è più come la descrive il § 1 (commit b0bf8276), il
gruppo sposta una voce di `mobile:budget`, oppure `perf:budget` di /dashboard/assets sale oltre 1 KB.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa. A commit in develop, ricordami la PR develop → main (regola 13
dell'indice).
```

Model: **Sonnet 5.5**, effort **medium** — an M spec in one area (Patrimonio), no new collection nor shared
contract, every criterion closed by a test. Estimated size: M (two new modules, eight touched, one guide split,
17 tests).
