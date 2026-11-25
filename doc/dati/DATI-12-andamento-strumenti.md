# DATI-12 — Patrimonio › Andamento: every instrument month by month and year to date

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: nothing (DATI-13 depends on it; DATI-13
> and DATI-15 read `hasNoMarketPrice`, DATI-15 the rest of C6). Written on 2026-11-23; every `file:line` is cited
> @ b0bf8276 (a line number is a hint, the function's name is the anchor). Owner's point 4; decisions 12, 13, 15,
> 53, 79, 80, 81 and 82. Defines the shared contract **C6** (the Andamento matrix, index § 7).

## 1. The problem today (evidence on the code)

The owner wants, for each instrument, how it went month over month and year to date. Today:

- Patrimonio is one page with no tabs (`app/dashboard/assets/page.tsx`, header `:668`, verdict `:700`, Strumenti
  `:905`).
- The only per-instrument movement is three columns behind the «Andamento» button of the Strumenti table
  (`components/assets/StrumentiTile.tsx:670-680`, `showDeltas` `:319`, `:452-453`, `:554`, `:763`): Δ against the last
  completed month, YTD and all-time, each TODAY's price against ONE base (`computeAssetPerformanceDeltas`,
  `lib/utils/assetPerformanceDeltas.ts:84`). No month of the past can be read; the button exists on desktop only
  (`hidden … desktop:flex`, `:669`).
- The data is there: every monthly snapshot stores every instrument (`MonthlySnapshot.byAsset`: `quantity`, `price`,
  `totalValue`, `types/assets.ts:598-605`); the unit-price rule is written once, privately (`unitPriceHistory`,
  `assetPerformanceDeltas.ts:70-80`; the types without a unit price, `:47-49`; the property read gross of its debt,
  `:76`).
- A month-by-month heat scale exists for the portfolio's returns only (`HEATMAP_STEPS`, `heatmapCellStyle`,
  `HeatmapLegend`, `components/performance/MonthlyReturnsHeatmap.tsx:24`, `:48`, `:253`).

## 2. Goal and acceptance criteria

Patrimonio gains a second tab, «Andamento»: a matrix instruments × the twelve months of a chosen year plus the year
to date — the unit price's change in percent, or, at a switch, the value's change in euro — and, for the selected
instrument, its line over the year.

1. Patrimonio has two tabs, «Posizioni» (today's page, unchanged) and «Andamento», addressable as
   `/dashboard/assets?tab=andamento`; the tab's code loads on demand. Proof: D1, E1, the budget of § 8.
2. The matrix lists every instrument held in at least one month of the year (or at the previous December), also one
   sold during the year; twelve month cells and «YTD». The bank accounts are not in it — as they are not in the
   Strumenti table. Proof: U1, U2.
3. «Prezzo %» (default): a cell is the unit price at the month's end against the previous month's end, coloured on
   the heat scale; January reads against the previous December. What has no market price — a pension fund, a
   property, a loan — shows «—» and says why. Proof: U3, U4, D2.
4. «Valore €»: a cell is the value's change in euro over the month, NOT coloured; a month with trades carries a mark
   and the words «operazioni nel mese». Proof: U5, D3.
5. YTD in «Prezzo %» is against the previous December; for an instrument first held during the year, against its
   first month, and the cell says «da {mese}»; for one sold during the year it stops at its last month and says
   «fino a {mese}». YTD in «Valore €» is the value's change from the previous December (or the year's first
   snapshot) and carries no such words. Proof: U6.
6. The month in progress is marked «in corso». A year picker lists the years that have snapshots; the default is the
   current one when it has a snapshot, else the newest. Proof: U7, D4.
7. Selecting a row shows that instrument's line (unit price in «Prezzo %», value in «Valore €») over the year's
   months. Proof: D5.
8. Below `desktop:` (390, 768 and 1024) the matrix is a list of rows that open inside THE tile: closed, the name
   with the month in progress and the YTD; open, a 4 × 3 grid of the twelve months and the line. The first screen
   is verdict · year · strip · THE tile; the tab has no other tile and no «Il resto della pagina». Proof: E2, E3,
   the census of § 8.
9. The Strumenti table loses its «Andamento» button and its three Δ columns; a link «Andamento» opens the tab on
   every width. The all-time Δ is the matrix's last column, «Da sempre», on the current year. Proof: D6, E1.
10. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; the whole
    E2E suite green (`npm run test:e2e`: the seed of § 4.6 changes one row every spec reads); `npm run perf:budget`
    green with `/dashboard/assets` and `/dashboard/performance` inside their ceilings, raised by no more than 1 KB
    gz and only with the register row (index § 8 rule 7); `mobile:census` and `mobile:budget` green with the new
    surface and the «patrimonio» entry widened as § 8 says.

## 3. Decisions

- **Decision 12** (owner, 2026-11-23): a new tab «Andamento» in Patrimonio — tabs «Posizioni» | «Andamento», a year
  picker, a matrix and the chart of the selected instrument.
- **Decision 13** (owner, 2026-11-23): instruments in «Prezzo %», with a switch to «Valore €».
- **Decision 15** (owner, 2026-11-23): on a phone, rows that open (the month and the YTD closed; a 4 × 3 grid and
  the chart open).
- **Decision 53** (owner, 2026-11-23): what has no market price — an account, a pension fund, a property, a loan —
  has no price to follow: «—» in «Prezzo %», its line only in «Valore €». The rule is ONE function,
  `hasNoMarketPrice` (§ 4.1).
- **Decision 79** (owner, 2026-11-23): the phone's strip has TWO cells — «Saliti» ({up} su {priced}), which opens
  THE tile, and «Migliore», which opens «Il perché».
- **Decision 80** (owner, 2026-11-23): the matrix reads the page's instruments — no bank account; pension funds,
  properties and loans stay, with «—» in «Prezzo %».
- **Decision 81** (owner, 2026-11-23): the «patrimonio» entry of `perf/mobile-budget.json` is widened at 390, 768
  and 1024 for the tab bar that now sits above the verdict, measured against `develop` the same day, with its
  `raisedBy` and its register row.
- **Decision 82** (owner, 2026-11-23): a closed row keeps its two figures (decision 15) — an exception to The
  First-Screen Rule's count, declared in the register with a `raisedBy` that cites decision 15.
- Overturned: the «Andamento» toggle of the Strumenti table (its three columns move to the tab).
- Adopted, reversible:
  - (a) the matrix reads the monthly snapshots only: the month in progress is the snapshot the cron rewrites every
    evening, not a live quote. «Da sempre» alone reads today's price (it is the figure the Strumenti column showed).
  - (b) a month's base is the month before it, strictly: with that snapshot missing the cell is empty, never bridged.
  - (c) rows are ordered by value at the last snapshot of the year, the sold ones last.
  - (d) an instrument's class and name are today's (a snapshot row stores neither class nor type); one deleted
    since keeps the name its last snapshot row has. A deleted row that reads like an account or a fund (`price === 1`
    and `quantity === totalValue`) is not listed; one with a negative value (a loan) has no price; any other is
    read as priced, on `totalValue / quantity`.
  - (h) the YTD in «Valore €» starts at the previous December — or, without it, at the year's first snapshot — for
    every row, also one bought during the year: its whole value is then the change, and the mark of its month
    says why.
  - (i) the opening positions of the ledger's migration (`isBaseline`) are not «operazioni nel mese».
  - (j) the ledger only feeds the mark: unread or failed, the matrix is drawn without marks and says so.
  - (k) an instrument created and never bought («Mai comprato») is not listed: it is in no snapshot with a quantity.
  - (e) the heat scale moves to `components/ui/heatmap-scale.tsx` and Rendimenti imports it from there.
  - (f) the view switch «Strumenti | Classi» is NOT rendered by this spec (DATI-13 adds it with the classes).
  - (g) the chart is the year's monthly points (DATI-13 replaces them with the daily ones).

## 4. Solution

### 4.1 The unit price, shared — `lib/utils/assetPerformanceDeltas.ts`

Two exported functions join the module; `hasNoUnitPrice` (`:47-49`) and `unitPriceHistory` (`:70-80`) stay as they
are — the three Δ of a phone row and «Da sempre» keep reading a property gross of its debt, as today — except that
`unitPriceHistory`'s non-property branch calls `snapshotUnitPrice`:

```ts
/**
 * What has no market price to follow (owner, 2026-11-23): an account, a pension fund and a loan —
 * their quantity carries the value — and the hand-valued property, whose «price» is the owner's own
 * estimate. Andamento, the daily archive's readers and the Assistente's tools all ask here.
 */
export function hasNoMarketPrice(asset: Pick<Asset, 'type'>): boolean {
  return hasNoUnitPrice(asset) || isRealEstate(asset);
}

/** One snapshot row's EUR unit price, for an instrument that has a market price; null without a quantity. */
export function snapshotUnitPrice(row: { quantity: number; totalValue: number }): number | null {
  return row.quantity > 0 ? row.totalValue / row.quantity : null;
}
```

### 4.2 The matrix — `lib/utils/andamentoMatrix.ts` (new, written here) — contract C6

```ts
/**
 * Patrimonio › Andamento (2026-11-23): each instrument across the twelve months of a year and year
 * to date, from the monthly snapshots.
 *
 * Two readings of the same rows. «Prezzo %» is the UNIT price against the previous month end — what
 * the instrument did, whatever was bought or sold. «Valore €» is the value's change in euro — what
 * the position did, purchases included, which is why a month with trades is marked and never coloured.
 * Pure: the snapshots, the instruments and the trades come in; «today» is a parameter.
 */
import type { Asset, MonthlySnapshot } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';
import { roundToCents } from '@/lib/utils/cents';
import { isCashAccount } from '@/types/assets';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { hasNoMarketPrice, snapshotUnitPrice } from '@/lib/utils/assetPerformanceDeltas';

export type AndamentoMeasure = 'price' | 'value';

export interface AndamentoCell {
  /** 1..12. */
  month: number;
  /** The month has a snapshot. */
  snapshot: boolean;
  /** The month's snapshot holds the instrument. Three absences, three cells: no snapshot, not held, held without a base. */
  held: boolean;
  /** The unit price against the previous month end, in percent. */
  pricePct: number | null;
  /** EUR at the month's snapshot; null when the month has no snapshot or does not hold it. */
  value: number | null;
  /** EUR against the previous month end (zero when it was not held then). */
  valueDelta: number | null;
  /** Unit price at the month's end, for the line. */
  unitPrice: number | null;
  traded: boolean;
  inProgress: boolean;
}

export interface AndamentoRow {
  id: string;
  label: string;
  ticker: string;
  /** False for what has no market price (`hasNoMarketPrice`): a pension fund, a property, a loan. */
  priced: boolean;
  cells: AndamentoCell[];
  ytdPricePct: number | null;
  /** «Prezzo %» only. 0 = the previous December; 1..12 = the first month of the year that holds it; null = no YTD. */
  ytdFromMonth: number | null;
  /** «Prezzo %» only. The last month of the year that holds it; before the year's last snapshot = sold since. */
  ytdToMonth: number | null;
  /** From the previous December, or the year's first snapshot, to the year's last one — for every row. */
  ytdValueDelta: number | null;
  /** EUR at the year's last snapshot; 0 once sold. */
  endValue: number;
}

export interface AndamentoMatrix {
  year: number;
  /** The year's months that have a snapshot, ascending. */
  months: number[];
  rows: AndamentoRow[];
}

type SnapshotRow = MonthlySnapshot['byAsset'][number];

const held = (row: SnapshotRow | undefined): row is SnapshotRow => Boolean(row && (row.quantity > 0 || row.totalValue !== 0));

/** Slot 0 = December of the year before; slots 1..12 = the year's months; null = no snapshot. */
function indexYear(snapshots: readonly MonthlySnapshot[], year: number): Array<Map<string, SnapshotRow> | null> {
  const slots: Array<Map<string, SnapshotRow> | null> = Array.from({ length: 13 }, () => null);
  for (const snapshot of snapshots) {
    const slot = snapshot.year === year ? snapshot.month : snapshot.year === year - 1 && snapshot.month === 12 ? 0 : -1;
    if (slot < 0) continue;
    slots[slot] = new Map((snapshot.byAsset ?? []).map((row) => [row.assetId, row]));
  }
  return slots;
}

export function buildInstrumentMatrix(input: {
  year: number;
  assets: readonly Asset[];
  snapshots: readonly MonthlySnapshot[];
  trades: ReadonlyArray<Pick<AssetTransaction, 'assetId' | 'date' | 'isBaseline'>>;
  today: { year: number; month: number };
}): AndamentoMatrix {
  const { year, today } = input;
  const slots = indexYear(input.snapshots, year);
  const months = slots.flatMap((slot, index) => (index > 0 && slot ? [index] : []));
  const lastSlot = months.length > 0 ? months[months.length - 1] : null;
  const baseSlot = slots[0] ? 0 : (months[0] ?? null);

  const tradedMonths = new Set<string>();
  for (const trade of input.trades) {
    // The migration's opening position is not something the user did that month.
    if (trade.isBaseline) continue;
    const iso = getItalyDateIso(trade.date);
    if (Number(iso.slice(0, 4)) === year) tradedMonths.add(`${trade.assetId}:${Number(iso.slice(5, 7))}`);
  }

  const assetsById = new Map(input.assets.map((asset) => [asset.id, asset]));
  const ids = new Set<string>();
  for (const slot of slots) {
    if (!slot) continue;
    for (const [id, row] of slot) if (held(row)) ids.add(id);
  }

  const rows: AndamentoRow[] = [];
  for (const id of ids) {
    const asset = assetsById.get(id);
    const lastRow = [...slots].reverse().map((slot) => slot?.get(id)).find(Boolean);
    // No bank account: the instruments of the page. A deleted row has no type left — an account or a fund
    // reads price 1 and quantity = value; a loan reads a negative value.
    if (asset ? isCashAccount(asset) : Boolean(lastRow && lastRow.price === 1 && lastRow.quantity === lastRow.totalValue)) continue;
    const priced = asset ? !hasNoMarketPrice(asset) : (lastRow?.totalValue ?? 0) >= 0;
    const rowAt = (slot: number): SnapshotRow | undefined => {
      const row = slots[slot]?.get(id);
      return held(row) ? row : undefined;
    };
    const unitAt = (slot: number): number | null => {
      const row = rowAt(slot);
      return row && priced ? snapshotUnitPrice(row) : null;
    };
    const valueAt = (slot: number): number | null => rowAt(slot)?.totalValue ?? null;

    const cells: AndamentoCell[] = [];
    for (let month = 1; month <= 12; month++) {
      const both = slots[month] !== null && slots[month - 1] !== null;
      const unit = slots[month] ? unitAt(month) : null;
      const before = both ? unitAt(month - 1) : null;
      const value = slots[month] ? valueAt(month) : null;
      const valueBefore = both ? valueAt(month - 1) : null;
      cells.push({
        month,
        snapshot: slots[month] !== null,
        held: rowAt(month) !== undefined,
        pricePct: unit !== null && before !== null && before > 0 ? (unit / before - 1) * 100 : null,
        value,
        valueDelta: both && (value !== null || valueBefore !== null) ? roundToCents((value ?? 0) - (valueBefore ?? 0)) : null,
        unitPrice: unit,
        traded: tradedMonths.has(`${id}:${month}`),
        inProgress: year === today.year && month === today.month,
      });
    }

    // Year to date: from the previous December; an instrument that entered during the year, from its first month.
    const lastHeld = [...months].reverse().find((month) => rowAt(month)) ?? null;
    let ytdFromMonth: number | null = null;
    if (lastHeld !== null) {
      if (rowAt(0)) ytdFromMonth = 0;
      else {
        const firstHeld = months.find((month) => rowAt(month));
        ytdFromMonth = firstHeld !== undefined && firstHeld < lastHeld ? firstHeld : null;
      }
    }
    const unitEnd = lastHeld !== null ? unitAt(lastHeld) : null;
    const unitBase = ytdFromMonth !== null ? unitAt(ytdFromMonth) : null;

    rows.push({
      id,
      label: asset?.name ?? lastRow?.name ?? id,
      ticker: asset ? getAssetDisplayTicker(asset) : (lastRow?.ticker ?? ''),
      priced,
      cells,
      ytdPricePct: unitEnd !== null && unitBase !== null && unitBase > 0 ? (unitEnd / unitBase - 1) * 100 : null,
      ytdFromMonth,
      ytdToMonth: lastHeld,
      ytdValueDelta: lastSlot !== null && baseSlot !== null && lastSlot !== baseSlot
        ? roundToCents((valueAt(lastSlot) ?? 0) - (valueAt(baseSlot) ?? 0))
        : null,
      endValue: lastSlot !== null ? (valueAt(lastSlot) ?? 0) : 0,
    });
  }

  rows.sort((a, b) => Math.abs(b.endValue) - Math.abs(a.endValue) || a.label.localeCompare(b.label, 'it'));
  return { year, months, rows };
}

/** The years that have at least one snapshot, newest first. */
export function listMatrixYears(snapshots: readonly MonthlySnapshot[]): number[] {
  return [...new Set(snapshots.map((snapshot) => snapshot.year))].sort((a, b) => b - a);
}

export interface AndamentoSummary {
  priced: number;
  up: number;
  down: number;
  best: { label: string; pct: number } | null;
  worst: { label: string; pct: number } | null;
}

/** What the verdict says: of the instruments with a YTD, how many rose, the best and the worst. */
export function summarizeMatrix(matrix: AndamentoMatrix): AndamentoSummary {
  const measured = matrix.rows.filter((row) => row.ytdPricePct !== null) as Array<AndamentoRow & { ytdPricePct: number }>;
  const sorted = [...measured].sort((a, b) => b.ytdPricePct - a.ytdPricePct);
  return {
    priced: measured.length,
    up: measured.filter((row) => row.ytdPricePct > 0).length,
    down: measured.filter((row) => row.ytdPricePct < 0).length,
    best: sorted.length > 0 ? { label: sorted[0].label, pct: sorted[0].ytdPricePct } : null,
    worst: sorted.length > 1 ? { label: sorted[sorted.length - 1].label, pct: sorted[sorted.length - 1].ytdPricePct } : null,
  };
}
```

`lib/utils/andamentoNarrative.ts` (new):

- `buildAndamentoVerdict(summary: AndamentoSummary, rows: number, year: number, isCurrentYear: boolean):
  PageVerdictModel` — `headline`: «Da inizio anno {up} strumenti su {priced} sono saliti» on the current year, «Nel
  {year} {up} strumenti su {priced} sono saliti» on a past one («1 strumento su {priced} è salito»; «nessuno
  strumento su {priced} è salito» at zero); `sentence`: «Il migliore: {label} {+x,x%}. Il peggiore: {label}
  {−y,y%}.» — with one measured instrument only «Il migliore: …»; `leadLength: 0` (the sentence reprints the
  strip's cells: DESIGN → The Binding-Clause Rule); `tone` `positive` when `up > down`, `negative` when `down > up`,
  else `neutral`. With rows and no measured instrument (`summary.priced === 0`, `rows > 0`): headline «Nessuno
  strumento ha un prezzo da confrontare nel {year}», sentence «Guarda il Valore €.», tone `neutral`. With no row
  the tab shows no verdict but the «nothing recorded» state (§ 4.4).
- `selectAndamentoStrip(summary: AndamentoSummary, tileId: string): StripFigure[]` — TWO cells (decision 79), in
  the shape of `lib/utils/verdictStrip.ts` (a cell prints ONE number in one `StripFormat`): label «Saliti su
  {priced}», `value: up`, `format: 'ratio'`, `decimals: 0`, `opens: tileId`; label «Migliore», the best's percent,
  `format: 'signed-percent'`, `opens: VERDICT_REST_SECTION` («Il perché»); a null best → `value: null` with the
  `reason` «nessuno strumento misurato». `validateStrip` passes: two cells, two sections.

### 4.3 The page — `app/dashboard/assets/page.tsx`

The Allocazione pattern (`app/dashboard/allocation/page.tsx:171-172`, `:184-192`, `:204-205`, `:598-612`):

```ts
const AndamentoTab = lazyComponent(() => import('@/components/assets/AndamentoTab').then((m) => m.AndamentoTab));
const ANDAMENTO_LAZY = [AndamentoTab];
const ASSETS_TABS: TabDef[] = [
  { value: 'posizioni', label: 'Posizioni', icon: Wallet },
  { value: 'andamento', label: 'Andamento', icon: TrendingUp },
];
```

`lib/utils/assetsTabs.ts` (new, pure): `export const ASSETS_TAB_IDS = ['posizioni', 'andamento'] as const;`,
`export type AssetsTabId = (typeof ASSETS_TAB_IDS)[number];` and `export function getInitialTab(param: string |
null): AssetsTabId` — `'andamento'` for that value, `'posizioni'` for null and for anything else.

`PageTabs` with `layoutId="assets-tab"`, `ariaLabel="Sezioni di Patrimonio"`, `renderedPanels={new Set([activeTab])}`;
only the active panel is mounted (each carries its own verdict); the tab change writes `?tab=` with
`router.replace` as Allocazione's `handleTabChange` does; `usePreloadWhenIdle(ANDAMENTO_LAZY)`. Today's content from
the verdict down becomes the «Posizioni» panel, untouched. The header (`:668`) stays above the tabs.

The tab receives what the page already reads, as props, and makes no read of its own:

```ts
export interface AndamentoTabProps {
  assets: Asset[];
  /** The page's `useSnapshots` query, whole: the tab reads its data, its pending and its error. */
  snapshotsQuery: UseQueryResult<MonthlySnapshot[]>;
  /** The ledger's rows, or null when the ledger was not read (its query disabled, pending or failed). */
  trades: AssetTransaction[] | null;
  /** `computeAssetPerformanceDeltas` as the page computes it once: the «Da sempre» column. */
  performance: Record<string, AssetPerformanceData>;
  today: { year: number; month: number };
}
```

**The states** (doc/guide/stati.md). The page's loading branch (`loadingAssets || loadingOverview || …`) renders
`<PageTabs … loading>` with the ACTIVE tab's skeleton, as Allocazione's does: `TileGridSkeleton` for «Posizioni»,
`AndamentoTabSkeleton` (new, `components/assets/AndamentoTabSkeleton.tsx`: the verdict's line and one tile of
twelve columns; also the `fallback` of the `lazyComponent`) for «Andamento» — and with `?tab=andamento` the branch
waits for the assets and the snapshots only, not for the overview nor the mortgage instalments. The tab: snapshots
failed → `ErrorNotice` in place of the tile, no verdict; no snapshot at all → the «nothing recorded» `EmptyState`
(«Ancora nessuno snapshot: l'andamento nasce dal secondo mese.»), no verdict and no strip; the ledger unread →
the matrix with `trades: []` and, in «Valore €», the method note «Operazioni non lette: i mesi con acquisti e
vendite non sono segnati.» (The Absence-Has-Three-Names Rule).

### 4.4 The tab — `components/assets/AndamentoTab.tsx` (new) and its parts

- State: `year` (default `today.year` when `listMatrixYears` holds it, else the list's first; options
  `listMatrixYears`), `measure: AndamentoMeasure` (default `'price'`, remembered under
  `patrimonio.andamento.misura`), `selectedId` (default the first row with `priced: true`; none → the first row).
- Layout ≥ `desktop:`: `PageVerdict` (from `buildAndamentoVerdict`) with the year `Select` as its axis; then a
  12-column grid: tile «Strumenti · {year}» (span 12) holding the measure `SegmentedPill` («Prezzo %» | «Valore €»,
  `layoutId="andamento-misura"`, `semantics="radio"`: it picks a value two tiles read, not a panel), the matrix and
  the legend; a second tile (span 12) with the line, its eyebrow «Andamento» and its title the instrument's name,
  `aria-label` «Andamento di {nome}».
- **The matrix** — `components/assets/AndamentoMatrix.tsx`: a `<table>` in a horizontally scrollable wrapper
  (`tabIndex={0}`, `role="region"`, `aria-label="Matrice di Andamento, scorre in orizzontale"`), first column sticky
  (name, ticker under it in `text-muted-foreground`), columns «Gen»…«Dic», «YTD» and, on the current year, «Da
  sempre» (`performance[row.id]?.allTimeDelta`, the figure the Strumenti column showed; a row with no entry — sold,
  deleted, without a market price — «—»).
  - «Prezzo %»: a cell with a figure is a block with `heatmapCellStyle(cell.pricePct)` and the figure as `+1,2`
    (one decimal, sign, no «%» in the cell; the column head says «%»), its text `text-foreground` on the steps of
    30 and 55 and `text-background` on the step of 85. The three absences (§ 5): `!cell.snapshot` → an empty cell,
    `title` «nessuno snapshot»; `cell.snapshot && !cell.held` → an empty cell, no title; held with no base → «—»,
    `title` «nessun mese prima». A row with `priced: false`: one cell spanning the twelve months, «Senza prezzo di
    mercato: guarda il Valore €».
  - «Valore €»: plain cells, `font-mono tabular-nums`, the signed euro change in the neutral foreground (no semantic
    colour: a purchase is not a gain); a null `valueDelta` follows the same three absences; `traded` → a `•` before
    the figure and `title`/`aria-label` «operazioni nel mese».
  - `inProgress` → the column head carries «in corso» under the month, on the current year only.
  - YTD cell: the figure. In «Prezzo %» only: `ytdFromMonth > 0` → «da {mese abbreviato}» under it; `ytdToMonth`
    before the year's last snapshot month → «fino a {mese abbreviato}».
  - A row selects on click and from the keyboard: the whole table is ONE Tab stop (`useRovingFocus`), the selected
    row carries `aria-current="true"` (DESIGN → The Selected-Row Rule), Enter/Space selects.
  - `HeatmapLegend` under the table in «Prezzo %», with its two neutral swatches named «nessun dato» and «senza
    prezzo» through a new optional prop `emptyLabels` (Rendimenti keeps its own words); in «Valore €» the method
    note (`TileMethodNote`): «La variazione in euro comprende acquisti e vendite: i mesi con operazioni hanno un
    punto.»
- **The line** — `components/assets/AndamentoLine.tsx`, `AndamentoLineProps { label: string; measure:
  AndamentoMeasure; cells: AndamentoCell[]; priced: boolean; height?: number }`: Recharts through
  `components/ui/charts/recharts.ts`, one series over the year's months — `unitPrice` in «Prezzo %» (axis in euro,
  the title «Prezzo unitario»), `value` in «Valore €» and, in «Prezzo %», for a row without a market price (the
  title «Valore», with the line «Senza prezzo di mercato: la linea è il valore.»); months without a point are gaps
  (`connectNulls={false}`); the chart's colour is chart slot 1; tooltip through `chart-hover`.
- **Below `desktop:`** (`useCompactLayout`: 390, 768, 1024): `VerdictStrip` (`selectAndamentoStrip`) + the year
  select; THE tile, «Strumenti · {year}», always open (The First-Screen Rule: never a row), its first body line the
  ONE measure pill; inside, a list of flat rows that open — the model of `components/assets/AssetRow.tsx`
  (`divide-y`, a button of 44 px with `aria-expanded`, the panel on `grid-rows-[0fr] → [1fr]` with `inert` when
  closed), NOT `TileRowShell` and not sections of `useMobileSections`: the tab has one tile and no `PageRest`.
  Closed — name, ticker, and two figures in the chosen measure, each with its small label: the month in progress
  (or the year's last month) and the YTD (decision 82); open — a 4 × 3 grid of the twelve cells (same rendering
  rules as the table's cells, month label above each) and `AndamentoLine` at 160 px. The only sections the strip
  opens are the tile and `VERDICT_REST_SECTION`. On a tablet in landscape the verdict and THE tile sit as
  `lib/utils/tabletComposition.ts` places them on every page.
- `components/ui/heatmap-scale.tsx` (new): `HEATMAP_STEPS`, `heatmapCellStyle`, `HeatmapLegend`, and what they
  read — `heatmapStepOf`, the type `HeatmapStep`, `THRESHOLD_FORMAT`, `heatmapStepLabel` — moved verbatim from
  `components/performance/MonthlyReturnsHeatmap.tsx`; that file imports back the two it uses and re-exports
  nothing; `components/performance/tiles/ConsistenzaTile.tsx` imports `HeatmapLegend` from the new home.

### 4.5 The Strumenti table — `components/assets/StrumentiTile.tsx`

`showDeltas` and all it gates leave (`:121` its storage key, `:319`, `:338`, `:366-370`, `:452-453`, `:554-…`, `:763`,
the button `:669-680`, `DELTA_WINDOWS`, `DELTA_KEYS`, the sort by Δ and the table's Δ cells); the price columns are
always shown. The closed group of the instruments at zero and its stored toggle `STORAGE_KEYS.showArchived` stay as
they are: only the Δ leaves, and the sentence on the group in `doc/guide/patrimonio-strumenti.md` loses its «Andamento» (the toggle).
A link-styled button «Andamento» (`TrendingUp`) calls a new prop `onOpenAndamento` — the page
switches the tab: at `desktop:` in the tile's aside beside «Raggruppa per classe»; below it — where that aside is
not mounted (`!collapse`) — as the first line of the open panel of Strumenti, 44 px tall (a control never sits in a
row's button). The footer of the table (`:811`) reads «Il PMC è in euro, senza commissioni; uno strumento in valuta
mostra sotto anche il PMC nella sua valuta. Mese per mese: «Andamento».»; the file's header comment and the one of
`lib/utils/assetPerformanceDeltas.ts` are rewritten on the new state (no «Andamento» view, no remembered toggle).

The page keeps computing `performance` once (`computeAssetPerformanceDeltas(instruments, snapshots, today)`) and
passes it both to `StrumentiTile` — which now reads it only for the `AssetRow` rows below `desktop:` (the three Δ of
an opened row, `components/assets/AssetRow.tsx:407-425`, and its lazy sparkline, `:394-405`, were never behind the
toggle and stay) — and to the tab, for «Da sempre».

`e2e/assets.composite-chip.spec.ts` turns «Andamento» on and looks for the «Δ Mese» column (`:111-118`): that step
leaves; its measure of the sideways scroll stays, on the table as it now always is.

### 4.6 Census and seeds

The Accumulo precedent (`perf/mobile-budget.json:56-57`, `__tests__/mobileSurfaces.test.ts`): a new surface
`"patrimonio-andamento": { "path": "/dashboard/assets?tab=andamento", "tab": "Andamento", "target": true }` with
its three first-screen entries (390, 768, 1024) measured in this session.

- **The census seed is not touched**: `scripts/seedCensusE2E.mts` already writes 47 monthly snapshots with every
  instrument in `byAsset` at a price that moves, so the new surface has its figures.
- **`scripts/seedEmulator.ts`, ONE row**: its two snapshots (the current month and the one before, both relative
  to the seed's day — never a named month) share one `byAsset`, so every unit price is flat. The PREVIOUS month's
  snapshot takes its own copy in which the row `seed-btc` reads `price: 53921.57` and `totalValue: 26960.78` (the
  current 55.000 ÷ 1,02): «Bitcoin» then reads «+2,0» in the current month's column, whatever the month — in
  January against the December of slot 0. The snapshots' totals are not touched. Every E2E spec reads that
  account: the whole suite runs, and a spec that asserted Bitcoin's change over the last month is updated to the
  new figure and named in the summary.
- A year with a sold instrument, one bought mid-year and a marked month is the unit tests' (U1, U5, U6) and the
  guided verification's, which plants it (§ 7) — never the seeds'.

## 5. Constraints and traps

- **The First-Screen Rule and Small-Screen Composition** (DESIGN.md): below `desktop:` verdict · axis · strip · one
  tile · rest — here the axis is the year, the one tile the list.
- **The tabs load their code on demand** (doc/guide/cashflow.md § The tabs…; the Allocazione precedent): the tab is
  `lazyComponent`, and `/dashboard/assets`'s first load must not grow beyond the tab bar.
- **Only the active panel is mounted**: two page verdicts with the same view-transition name break the page scene
  (`allocation/page.tsx:606-607`).
- **`components/ui/charts/recharts.ts` is the ONE door to recharts.**
- **A list is ONE Tab stop** (`useRovingFocus`); the table's wrapper scrolls horizontally, so it is focusable and
  named (`tabIndex={0}`, `role="region"`, `aria-label`) — a rule this session writes in doc/guide/patrimonio.md
  § Andamento: no guide holds it yet.
- **Colour never carries the figure alone** (DESIGN → the metric colours; `getMetricValueColor`): the cell prints the
  signed number; the euro view is neutral by decision.
- **Text on the heat scale's fills is new**: DESIGN → Heatmap inside a Tile says its cells carry no figure, so the
  AA floor never applied to them. Here each cell prints one: the text's two colours (§ 4.4) are checked AA on every
  step, light, dark and on one costume, in phase C — and the amendment of § 9 says so.
- **The Absence-Has-Three-Names Rule**: no snapshot for the month, not held that month, held with no month before
  it — three different cells (§ 4.4, on `cell.snapshot` and `cell.held`); a row with no market price is a fourth
  thing, said once in its sentence.
- **The First-Screen Rule, The Closed-Row Rule** (DESIGN.md): THE tile is never a row, and `TileRowShell` is the
  shape `scripts/mobileCensus.mjs` counts as a closed row of the PAGE — the instruments' rows are not that.
- **`validateStrip`** (`lib/utils/verdictStrip.ts`): every cell opens a known section, no two the same one.
- **The ticker shown is `getAssetDisplayTicker(asset)`** (`lib/utils/assetDisplay.ts`), never `asset.ticker` inline.
- **`useAssetTransactions` may never run** (`{ enabled: ledgerReady }`, `app/dashboard/assets/page.tsx`): a query
  that stays pending without a fetch is not a loading state to wait on.
- **Italian month of a trade** (`getItalyDateIso`), **React Compiler on**: no manual `useMemo` for correctness; the
  matrix is built in the component body from stable props.
- **The mobile overflow guard** (doc/guide/e2e-playwright.md): the phone list must not scroll the page sideways.
- **No owner data**: seeds and fixtures use «ETF Alfa», «Azione Beta», round figures.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/andamentoMatrix.test.ts` | an instrument held all year → twelve cells; one sold in May is listed with cells to May and `endValue: 0`; one at quantity 0 in every snapshot is not listed | list every `byAsset` row |
| U2 | unit · same | a deleted instrument (not in `assets`) keeps the name and the ticker of its last snapshot row; a living one with a `displayTicker` shows the alias; a bank account is not listed, nor a deleted row with price 1 and quantity = value; a deleted row with a negative value is `priced: false` | label = id; `asset.ticker` inline; list the accounts |
| U3 | unit · same | unit 100 → 102 → 99,96: +2,0% then −2,0%; January reads against the previous December; a doubled quantity at the same price is 0% | value in place of unit price |
| U4 | unit · same | a pension fund, a loan and a property → `priced: false`, every `pricePct` null, values present; `hasNoMarketPrice` is true for the four types and false for an ETF in the `realestate` class | `hasNoUnitPrice` in place of `hasNoMarketPrice` |
| U5 | unit · same | value 1.000 → 1.500 with a buy in the month: `valueDelta` 500, `traded: true`; a trade at 23:30 UTC of the 31st counts in the NEXT Italian month; a baseline row marks nothing | `toISOString` month; count the baselines |
| U6 | unit · same | YTD from December; first held in June → `ytdFromMonth: 6` and the percent from June, while its `ytdValueDelta` is its whole value; sold in May → `ytdToMonth: 5` and the percent to May; held only in one month → no YTD; no December snapshot → value YTD from the first month | base always slot 0 |
| U7 | unit · same | `inProgress` only on today's month of today's year; a missing March snapshot gives March `snapshot: false` and April no change with `snapshot: true, held: true`; a month that does not hold the instrument is `held: false`; `listMatrixYears` newest first | bridge over the gap; `held` = `snapshot` |
| U8 | unit · `__tests__/andamentoNarrative.test.ts` | the verdict's headline, sentence, `leadLength: 0` and tone for more up, more down, one measured («1 strumento su 1 è salito», only «Il migliore»), rows with none measured («Nessuno strumento ha un prezzo da confrontare…»); the strip's two cells pass `validateStrip` against the tile's id and `VERDICT_REST_SECTION` | tone from the best alone; both cells opening the tile |
| D1 | unit · `__tests__/assetsTabs.test.ts` (new, node) | `getInitialTab`: `'andamento'` → `'andamento'`; null and an unknown value → `'posizioni'` | default to `'andamento'` |
| D2 | dom · `__tests__/andamentoMatrix.dom.test.tsx` (new) | «Prezzo %»: a +2,0 cell has the scale's fill and the text «+2,0»; a month without snapshot is empty with the title «nessuno snapshot», a month not held is empty with none, a held month with no base reads «—»; an unpriced row has the sentence; the legend is shown with «senza prezzo» | no text in the cell; one rendering for the three absences |
| D3 | dom · same | «Valore €»: no cell has a fill style; a traded month has `•` and the label «operazioni nel mese»; the method note is shown; with `trades: null` the note reads «Operazioni non lette…» | colour the euro view |
| D4 | dom · same | the month in progress reads «in corso» on the current year and no head reads it on a past one; changing the year rebuilds the rows; a current year missing from the list opens the newest | `inProgress` on every month |
| D5 | dom · same | the default selection is the first priced row; selecting a row with the keyboard moves `aria-current` and the line tile's `aria-label` «Andamento di {nome}» | click only |
| D6 | dom · `__tests__/strumentiTile.test.tsx` | no Δ column and no toggle; «Andamento» calls `onOpenAndamento`; with `collapse` set the link is in the open panel | keep the toggle; the link only in the aside |
| E1 | e2e · `e2e/assets.andamento.spec.ts` (new) | 1440: Patrimonio → «Andamento» from the Strumenti link: the URL has `?tab=andamento` and ONE `[role=tabpanel]` is in the DOM; «Bitcoin» reads «+2,0» in the current month's column, «BTP Valore 2030» «0,0», «Conto Corrente» is not listed, «Abitazione principale» has the sentence; «Valore €» shows uncoloured figures; the table scrolls inside its wrapper and the first column stays; reload keeps the tab | `getInitialTab` always `'posizioni'` |
| E2 | e2e · `e2e/assets.andamento.mobile.spec.ts` (new) | 390: rows closed show two figures; opening one shows twelve cells and the line; the strip has two cells; no horizontal overflow; targets ≥ 44 px | grid of 6 × 2 overflowing |
| E3 | e2e · `e2e/assets.andamento.tablet.spec.ts` (new) | 768 and 1024: the list of rows that open, as at 390 — no table; the 4 × 3 grid inside an open row with no horizontal overflow | the grid at a fixed width |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the year the script plants, «Andamento» shows one row rising about 2% every
month in green steps, one flat, one falling, one that appears in June with YTD «da giu», one sold in May with YTD
«fino a mag»; «Valore €» is uncoloured and June carries the mark on the bought instrument; the Strumenti table no
longer has Δ columns.

- A — the diff. B–E by a throwaway Playwright script on the emulators at 1440, 1024, 768 and 390, light and dark and
  one costume theme. The script first plants, for the emulator account, the PREVIOUS calendar year whole — thirteen
  snapshots, from the December before it to its own December, five invented instruments («ETF Alfa» +2% a month,
  «Azione Beta» flat, «ETF Gamma» −1% a month, «Azione Delta» first held in June with a buy row dated 10 June,
  «Azione Epsilon» sold in May) — a complete past year reads the same on any day; the emulators are restarted and
  reseeded after the tour. B the tab from the link and from the URL; C the two measures, the legend and the
  contrast of the cells' text on every step of the scale; D the year picker (the planted year, the current one),
  the selected row and its line, the keyboard on the table; E the list opened and closed at 390, 768 and 1024, an
  account with no snapshots («nothing recorded»), a failed snapshot read, the ledger unread. Decoys: «ornitorinco»
  (an instrument at quantity 0 in every snapshot: not listed) and «fenicottero» (a bank account: not listed).
- F — at the owner's «pronto», on the mirror: his own instruments, one month checked against his broker's statement.

## 8. Putting it into service

No rules, no index, no migration (the snapshots are read as they are). Measures: `npm run perf:budget`
(`/dashboard/assets` and `/dashboard/performance` inside their ceilings; raised by no more than 1 KB gz and only
with the register row, index § 8 rule 7); `npm run mobile:census -- --email=census@example.com` and `npm run
mobile:budget` on the same :3200 build, with three things written in doc/guide/prima-schermata-misure.md: the new
surface's baseline; the «patrimonio» entry widened at 390, 768 and 1024 by what the tab bar adds above the verdict
— measured against `develop` the same day, `raisedBy` «la barra dei tab Posizioni · Andamento sopra il verdetto»
(decision 81); and, for the new surface, the two figures of each closed row as a declared exception, `raisedBy`
«decisione 15: il mese e lo YTD sulla riga chiusa» (decision 82). With phase F closed and the commit in `develop`,
the owner opens the PR `develop` → `main` (index § 8 rule 13).

## 9. Documentation

- A NEW guide, `doc/guide/patrimonio-andamento.md` (doc/guide/patrimonio.md already had Strumenti split out of it
  into `patrimonio-strumenti.md`: the tab does not go back in; decision 47) — C6: the two measures and why the euro
  view is uncoloured, the YTD's two bases, the month in progress, `hasNoMarketPrice`, the three absences, the
  scrollable region's rule, § Composizione mobile (the rows that open inside THE tile, the strip's two cells),
  § Files; § Per-page blind spots: the class and the name are today's; a missing snapshot empties two cells; the
  month in progress is last evening's while «Da sempre» reads today's price; an instrument sold and bought again
  in the year has empty months in the middle and a YTD from December; a bond that matures is read as sold, its
  coupons are not in its price; a foreign instrument's unit price is in euro, the exchange rate inside it; the
  opening positions of the migration carry no mark; a deleted account or fund is not listed; the market effect
  net of trades as a third measure and a historical class per snapshot row are not there; no export.
- `doc/guide/patrimonio.md` — the two tabs and the page's loading branch; Strumenti without its «Andamento» view
  (in `doc/guide/patrimonio-strumenti.md`). `AGENTS.md` § 3 — a stub for the new guide, and
  Patrimonio's rewritten at equal or shorter length (decision 47).
- `doc/guide/rendimenti.md` — the heat scale's new home. `doc/guide/prima-schermata-misure.md` — the new surface,
  the widened entry and the declared exception (§ 8). `doc/guide/e2e-emulatori.md` — the seed's previous-month
  row of Bitcoin.
- `doc/guide/velocita.md` § Registro — only if a ceiling was raised.
- `DESIGN.md` — amendments by hand, before/after: Heatmap inside a Tile — the scale is a shared primitive
  (`components/ui/heatmap-scale.tsx`), and a cell that prints a figure on its fill takes `text-foreground` on the
  two lighter steps and `text-background` on the strongest, AA on each; a new sentence — in the Andamento matrix an
  instrument's change in euro, which includes purchases and sales, is not coloured (the net worth's own monthly
  change keeps its colour everywhere); Table inside a Tile (Strumenti) — no «Andamento» view and no sort by Δ, the
  link «Andamento» in the aside, the `AssetRow` rows below `desktop:` keep the three Δ.
- `README.md` — Patrimonio's feature lines.
- `CLAUDE.md` — the Patrimonio line rewritten at equal or shorter length with «a second tab, Andamento: each
  instrument month by month and YTD»; Key Files: `components/ui/heatmap-scale.tsx` joins the shared primitives; the
  «Latest» entry REPLACED whole (decision 46: the date, this spec in one sentence, «Open: doc/dati/ (README § 6)»,
  «Next: DATI-13»); under 20.000 characters, counted with `node`.
- `Draft Release Temp.md` — one entry prepended in `## ✨ New Features`, in the file's form: «**Patrimonio ›
  Andamento — ogni strumento mese per mese** — Added a second tab to Patrimonio: every instrument across the twelve
  months of a year and year to date, the unit price's change in percent or the value's change in euro, with its
  line.»
- `doc/dati/README.md` § 6 (the row of 12 to `implemented`) and § 7 (C6 as built: `hasNoMarketPrice`,
  `snapshotUnitPrice`, the matrix's types and functions, `buildAndamentoVerdict`, `selectAndamentoStrip`,
  `AndamentoTabProps`, `AndamentoLineProps`, `getInitialTab`).

## 10. Declared out of scope

- The classes' matrix (weight in points) and the «Strumenti | Classi» switch → DATI-13.
- Daily points in the line and the «ultimi 90 giorni» chart → DATI-13 (it needs DATI-02's archive).
- The market effect net of trades per instrument (`tradeAwarePriceEffect`, `lib/utils/marketEffect.ts:21-58`) as a
  third measure → doc/guide/patrimonio-andamento.md § Per-page blind spots.
- A historical class per snapshot row → the same section.
- Exporting the matrix → not planned; the same section says so.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-12-andamento-strumenti.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi — qui C6 —, regole della serie)
- Leggi doc/guide/patrimonio.md (anche § Composizione mobile), doc/guide/allocazione.md (il tab
  Accumulo, caricato a richiesta), doc/guide/rendimenti.md (la scala di colore che si sposta),
  doc/guide/stati.md, doc/guide/prima-schermata.md, doc/guide/prima-schermata-misure.md,
  doc/guide/velocita.md, doc/guide/e2e-emulatori.md e doc/guide/e2e-playwright.md PRIMA di scrivere
  codice in quei domini
- Tocca la UI: leggi DESIGN.md (The First-Screen Rule, The Closed-Row Rule, The Selected-Row Rule,
  The Binding-Clause Rule, Small-Screen Composition, Heatmap inside a Tile, Table inside a Tile, i
  colori delle metriche) e PRODUCT.md prima di disegnare
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

Implementa la spec così com'è scritta, nell'ordine: hasNoMarketPrice e snapshotUnitPrice, la matrice e
il verdetto con U1–U8, la scala di colore spostata (ConsistenzaTile la importa dalla nuova casa), i tab
della pagina e il ramo di caricamento (D1), la matrice e la linea (D2–D5), la tabella Strumenti e
e2e/assets.composite-chip.spec.ts (D6), la composizione sotto desktop — righe piatte che si aprono
dentro LA tessera, mai TileRowShell —, la riga del seed e la superficie del censimento, poi E1–E3, la
suite E2E intera, i due budget con la voce «patrimonio» allargata come dice il § 8, i documenti del § 9 e
la riga 12 di doc/dati/README.md § 6 a `implemented` (e C6 nel § 7 com'è costruito). OGNI test del § 6 va
visto rosso con la sua mutazione. Il codice del § 4.1 e del § 4.2 è già scritto: copialo.

Fermati e chiedimi se: il tab non si carica a richiesta senza far crescere la pagina oltre 1 KB gz, il
budget della prima schermata chiede di allargare una voce diversa da «patrimonio» o oltre ciò che la
barra dei tab aggiunge, il testo di una cella non raggiunge AA su un passo della scala, oppure una regola
di DESIGN.md contraddice una resa che la spec descrive.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa. A commit in develop, ricordami la PR develop → main (regola 13
dell'indice).
```

Model: **Opus 5.5**, effort **medium** — an L spec: a new tab under the performance and first-screen budgets, a
shared contract, three widths. Estimated size: L (three pure modules, five components, the page's tabs, one seed
row, 18 tests).
