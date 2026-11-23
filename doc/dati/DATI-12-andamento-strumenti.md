# DATI-12 — Patrimonio › Andamento: every instrument month by month and year to date

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: nothing (DATI-13 depends on it).
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276. Owner's point 4; decisions 12, 13, 15. Defines the
> shared contract **C6** (the Andamento matrix, index § 7).

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
   sold during the year; twelve month cells and «YTD». Proof: U1, U2.
3. «Prezzo %» (default): a cell is the unit price at the month's end against the previous month's end, coloured on
   the heat scale; January reads against the previous December. An instrument with no unit price (a cash account, a
   pension fund, a loan) shows «—» and says why. Proof: U3, U4, D2.
4. «Valore €»: a cell is the value's change in euro over the month, NOT coloured; a month with trades carries a mark
   and the words «operazioni nel mese». Proof: U5, D3.
5. YTD is against the previous December; for an instrument first held during the year, against its first month, and
   the cell says «da {mese}». Proof: U6.
6. The month in progress is marked «in corso». A year picker lists the years that have snapshots; the default is the
   current one. Proof: U7, D4.
7. Selecting a row shows that instrument's line (unit price in «Prezzo %», value in «Valore €») over the year's
   months. Proof: D5.
8. On a phone the matrix is a list of rows that open: closed, the name with the month in progress and the YTD;
   open, a 4 × 3 grid of the twelve months and the line. The first screen is verdict · year · strip · one tile ·
   «Il resto della pagina». Proof: E2, the census of § 8.
9. The Strumenti table loses its «Andamento» button and its three Δ columns; a link «Andamento» in the tile's head
   opens the tab. The all-time Δ is the matrix's last column, «Da sempre», on the current year. Proof: D6, E1.
10. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1–E3 green;
    `npm run perf:budget` `/dashboard/assets` within 1 KB gz of `develop`; `mobile:census` and `mobile:budget` green
    with the new surface.

## 3. Decisions

- **Decision 12** (owner, 2026-11-23): a new tab «Andamento» in Patrimonio — tabs «Posizioni» | «Andamento», a year
  picker, a matrix and the chart of the selected instrument.
- **Decision 13** (owner, 2026-11-23): instruments in «Prezzo %», with a switch to «Valore €».
- **Decision 15** (owner, 2026-11-23): on a phone, rows that open (the month and the YTD closed; a 4 × 3 grid and
  the chart open).
- Overturned: the «Andamento» toggle of the Strumenti table (its three columns move to the tab).
- Adopted, reversible:
  - (a) the matrix reads the monthly snapshots only: the month in progress is the snapshot the cron rewrites every
    evening, not a live quote.
  - (b) a month's base is the month before it, strictly: with that snapshot missing the cell is empty, never bridged.
  - (c) rows are ordered by value at the last snapshot of the year, the sold ones last.
  - (d) an instrument's class and name are today's (a snapshot row stores neither class nor type); one deleted
    since keeps the name its last snapshot row has.
  - (e) the heat scale moves to `components/ui/heatmap-scale.tsx` and Rendimenti imports it from there.
  - (f) the view switch «Strumenti | Classi» is NOT rendered by this spec (DATI-13 adds it with the classes).
  - (g) the chart is the year's monthly points (DATI-13 replaces them with the daily ones).

## 4. Solution

### 4.1 The unit price, shared — `lib/utils/assetPerformanceDeltas.ts`

`hasNoUnitPrice` (`:47-49`) becomes exported; a new exported function takes the rule out of `unitPriceHistory`
(`:70-80`), which then calls it:

```ts
/**
 * One snapshot row's EUR unit price; null without a quantity. A hand-valued property reads its gross
 * `price` (the row's `totalValue` is net of the debt, and a debt is not a price).
 */
export function snapshotUnitPrice(row: { quantity: number; price: number; totalValue: number }, isProperty: boolean): number | null {
  if (!(row.quantity > 0)) return null;
  return (isProperty ? row.quantity * row.price : row.totalValue) / row.quantity;
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
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import { hasNoUnitPrice, snapshotUnitPrice } from '@/lib/utils/assetPerformanceDeltas';

export type AndamentoMeasure = 'price' | 'value';

export interface AndamentoCell {
  /** 1..12. */
  month: number;
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
  /** False for the types whose quantity carries the value: no unit price exists. */
  priced: boolean;
  cells: AndamentoCell[];
  ytdPricePct: number | null;
  /** 0 = the previous December; 1..12 = the first month of the year that holds it; null = no YTD. */
  ytdFromMonth: number | null;
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
  trades: ReadonlyArray<Pick<AssetTransaction, 'assetId' | 'date'>>;
  today: { year: number; month: number };
}): AndamentoMatrix {
  const { year, today } = input;
  const slots = indexYear(input.snapshots, year);
  const months = slots.flatMap((slot, index) => (index > 0 && slot ? [index] : []));
  const lastSlot = months.length > 0 ? months[months.length - 1] : null;
  const baseSlot = slots[0] ? 0 : (months[0] ?? null);

  const tradedMonths = new Set<string>();
  for (const trade of input.trades) {
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
    const priced = asset ? !hasNoUnitPrice(asset) : true;
    const isProperty = asset?.type === 'realestate';
    const rowAt = (slot: number): SnapshotRow | undefined => {
      const row = slots[slot]?.get(id);
      return held(row) ? row : undefined;
    };
    const unitAt = (slot: number): number | null => {
      const row = rowAt(slot);
      return row && priced ? snapshotUnitPrice(row, isProperty) : null;
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

    const named = asset ?? [...slots].reverse().map((slot) => slot?.get(id)).find(Boolean);
    rows.push({
      id,
      label: named?.name ?? id,
      ticker: named?.ticker ?? '',
      priced,
      cells,
      ytdPricePct: unitEnd !== null && unitBase !== null && unitBase > 0 ? (unitEnd / unitBase - 1) * 100 : null,
      ytdFromMonth,
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

`lib/utils/andamentoNarrative.ts` (new): `buildAndamentoVerdict(summary, year, isCurrentYear): PageVerdictModel` —
«Nel {year} {up} strumenti su {priced} sono saliti» (current year: «Da inizio anno …»), detail «Il migliore:
{label} {+x,x%}. Il peggiore: {label} {−y,y%}.», tone `positive` when `up > down`, `negative` when `down > up`, else
`neutral`; no measurable instrument → the «nothing recorded» verdict of doc/guide/stati.md («Nessuno strumento ha
ancora due mesi di storia»). The strip (`lib/utils/verdictStrip.ts` shape): «Saliti» {up}, «Scesi» {down}, «Migliore»
{pct}, «Peggiore» {pct}.

### 4.3 The page — `app/dashboard/assets/page.tsx`

The Allocazione pattern (`app/dashboard/allocation/page.tsx:171-172`, `:184-192`, `:204-205`, `:598-612`):

```ts
const AndamentoTab = lazyComponent(() => import('@/components/assets/AndamentoTab').then((m) => m.AndamentoTab));
const ANDAMENTO_LAZY = [AndamentoTab];
const ASSETS_TABS: TabDef[] = [
  { value: 'posizioni', label: 'Posizioni', icon: Wallet },
  { value: 'andamento', label: 'Andamento', icon: TrendingUp },
];
type AssetsTabId = 'posizioni' | 'andamento';
const getInitialTab = (param: string | null): AssetsTabId => (param === 'andamento' ? 'andamento' : 'posizioni');
```

`PageTabs` with `layoutId="assets-tab"`, `ariaLabel="Sezioni di Patrimonio"`, `renderedPanels={new Set([activeTab])}`;
only the active panel is mounted (each carries its own verdict); the tab change writes `?tab=` with
`router.replace` as Allocazione's `handleTabChange` does; `usePreloadWhenIdle(ANDAMENTO_LAZY)`. Today's content from
the verdict down becomes the «Posizioni» panel, untouched. The header (`:668`) stays above the tabs.

The tab receives what the page already reads — `assets`, `snapshotsQuery` (`:202`), `tradesQuery` (`:287`) — as
props: it makes no read of its own. It gates on all three (doc/guide/stati.md: loading, nothing recorded, failed).

### 4.4 The tab — `components/assets/AndamentoTab.tsx` (new) and its parts

- State: `year` (default `today.year`, options `listMatrixYears`), `measure: AndamentoMeasure` (default `'price'`,
  remembered under `patrimonio.andamento.misura`), `selectedId` (default the first row).
- Layout ≥ `desktop:`: `PageVerdict` (from `buildAndamentoVerdict`) with the year `Select` as its axis; then a
  12-column grid: tile «Strumenti · {year}» (span 12) holding the measure `SegmentedPill` («Prezzo %» | «Valore €»,
  `layoutId="andamento-misura"`, `semantics="tabs"`), the matrix and the legend; tile «{nome}» (span 12) with the
  line.
- **The matrix** — `components/assets/AndamentoMatrix.tsx`: a `<table>` in a horizontally scrollable wrapper, first
  column sticky (name, ticker under it in `text-muted-foreground`), columns «Gen»…«Dic», «YTD» and, on the current
  year, «Da sempre» (`computeAssetPerformanceDeltas(...).allTimeDelta`, the figure the Strumenti column showed).
  - «Prezzo %»: each cell a block with `heatmapCellStyle(cell.pricePct)` and the figure as `+1,2` (one decimal, sign,
    no «%» in the cell; the column head says «%»); null → the empty step of the scale with «—». A row with
    `priced: false`: one cell spanning the twelve months, «Senza prezzo unitario: guarda il Valore €».
  - «Valore €»: plain cells, `font-mono tabular-nums`, the signed euro change in the neutral foreground (no semantic
    colour: a purchase is not a gain); `traded` → a `•` before the figure and `title`/`aria-label` «operazioni nel
    mese».
  - `inProgress` → the column head carries «in corso» under the month.
  - YTD cell: the figure; `ytdFromMonth > 0` → «da {mese abbreviato}» under it.
  - A row is a button for selection: the whole table is ONE Tab stop (`useRovingFocus`), `aria-selected` on the
    selected row, Enter/Space selects.
  - `HeatmapLegend` under the table in «Prezzo %»; in «Valore €» the method note (`TileMethodNote`): «La variazione
    in euro comprende acquisti e vendite: i mesi con operazioni hanno un punto.»
- **The line** — `components/assets/AndamentoLine.tsx`: Recharts through `components/ui/charts/recharts.ts`, one
  series over the year's months — `unitPrice` in «Prezzo %» (axis in euro, the title «Prezzo unitario»), `value` in
  «Valore €»; months without a point are gaps (`connectNulls={false}`); the chart's colour is chart slot 1; tooltip
  through `chart-hover`.
- **Phone** (`useCompactLayout`): `VerdictStrip` + the year select; ONE tile first, «Strumenti · {year}», as a list
  of `TileRowShell` rows (`Tile`'s `collapse`): closed — name, ticker, the month in progress (or the last month) and
  the YTD, each with its small label; open — the measure pill, a 4 × 3 grid of the twelve cells (same rendering
  rules as the table's cells, month label above each) and `AndamentoLine` at 160 px. Sections through
  `useMobileSections` (`lib/utils/mobileSections.ts`), «Il resto della pagina» empty beyond the tile: the tab has one
  tile on a phone.
- `components/ui/heatmap-scale.tsx` (new): `HEATMAP_STEPS`, `heatmapCellStyle`, `HeatmapLegend` moved verbatim from
  `MonthlyReturnsHeatmap.tsx:24-60`, `:243-270`; the old file imports them back.

### 4.5 The Strumenti table — `components/assets/StrumentiTile.tsx`

`showDeltas` and all it gates leave (`:121` its storage key, `:319`, `:338`, `:366-370`, `:452-453`, `:554-…`, `:763`,
`:811`, the button `:669-680`, `DELTA_WINDOWS`); the price columns are always shown. In the same place a link-styled
button «Andamento» (`TrendingUp`), on every width, calls a new prop `onOpenAndamento` — the page switches the tab.
The page stops computing `computeAssetPerformanceDeltas` for the table and passes it to the tab instead.

The phone rows of «Posizioni» (`components/assets/AssetRow.tsx`: the three Δ of an opened row, `:407-425`, and its
lazy sparkline, `:394-405`) are NOT behind the toggle and stay as they are: the page keeps passing them the deltas.

### 4.6 Census and seeds

The Accumulo precedent (`perf/mobile-budget.json:56-57`, `scripts/seedCensusE2E.mts:501-535`,
`__tests__/mobileSurfaces.test.ts`): a new surface `"patrimonio-andamento": { "path":
"/dashboard/assets?tab=andamento", … }` with its first-screen entry measured in this session; the census seed gains
twelve monthly snapshots of the current year plus the previous December for its instruments (round invented prices:
+2% a month on one, flat on one, −1% on one, one bought in June) — `scripts/seedEmulator.ts` gets the same so the
E2E has a year to read.

## 5. Constraints and traps

- **The First-Screen Rule and Small-Screen Composition** (DESIGN.md): below `desktop:` verdict · axis · strip · one
  tile · rest — here the axis is the year, the one tile the list.
- **The tabs load their code on demand** (doc/guide/cashflow.md § The tabs…; the Allocazione precedent): the tab is
  `lazyComponent`, and `/dashboard/assets`'s first load must not grow beyond the tab bar.
- **Only the active panel is mounted**: two page verdicts with the same view-transition name break the page scene
  (`allocation/page.tsx:606-607`).
- **`components/ui/charts/recharts.ts` is the ONE door to recharts.**
- **A list is ONE Tab stop** (`useRovingFocus`); the table's wrapper scrolls horizontally and is focusable with a
  label (doc/guide/shell.md, the scrollable-region rule).
- **Colour never carries the figure alone** (DESIGN → the metric colours; `getMetricValueColor`): the cell prints the
  signed number; the euro view is neutral by decision.
- **The Absence-Has-Three-Names Rule**: no snapshot for the month (empty cell), not held (empty), no unit price
  («—» with its sentence) are three different cells.
- **Italian month of a trade** (`getItalyDateIso`), **React Compiler on**: no manual `useMemo` for correctness; the
  matrix is built in the component body from stable props.
- **The mobile overflow guard** (doc/guide/e2e-playwright.md): the phone list must not scroll the page sideways.
- **No owner data**: seeds and fixtures use «ETF Alfa», «Azione Beta», round figures.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/andamentoMatrix.test.ts` | an instrument held all year → twelve cells; one sold in May is listed with cells to May and `endValue: 0`; one at quantity 0 in every snapshot is not listed | list every `byAsset` row |
| U2 | unit · same | a deleted instrument (not in `assets`) keeps the name of its last snapshot row | label = id |
| U3 | unit · same | unit 100 → 102 → 99,96: +2,0% then −2,0%; January reads against the previous December; a doubled quantity at the same price is 0% | value in place of unit price |
| U4 | unit · same | a cash account, a pension fund, a loan → `priced: false`, every `pricePct` null, values present; a property with a debt reads its gross price | drop `hasNoUnitPrice` |
| U5 | unit · same | value 1.000 → 1.500 with a buy in the month: `valueDelta` 500, `traded: true`; a trade at 23:30 UTC of the 31st counts in the NEXT Italian month | `toISOString` month |
| U6 | unit · same | YTD from December; first held in June → `ytdFromMonth: 6` and the percent from June; held only in one month → no YTD; no December snapshot → value YTD from the first month | base always slot 0 |
| U7 | unit · same | `inProgress` only on today's month of today's year; a missing March snapshot empties March AND April's change; `listMatrixYears` newest first | bridge over the gap |
| U8 | unit · `__tests__/andamentoNarrative.test.ts` | the verdict's sentence and tone for more up, more down, none measurable; the strip's four figures | tone from the best alone |
| D1 | dom · `__tests__/assetsPageTabs.test.tsx` (new) | `?tab=andamento` opens the tab; an unknown value opens «Posizioni»; only one panel is in the DOM | mount both |
| D2 | dom · `__tests__/andamentoMatrix.dom.test.tsx` (new) | «Prezzo %»: a +2,0 cell has the scale's fill and the text «+2,0»; an unpriced row has the sentence; the legend is shown | no text in the cell |
| D3 | dom · same | «Valore €»: no cell has a fill style; a traded month has `•` and the label «operazioni nel mese»; the method note is shown | colour the euro view |
| D4 | dom · same | the month in progress reads «in corso»; changing the year rebuilds the rows | — |
| D5 | dom · same | selecting a row with the keyboard updates `aria-selected` and the line's title | click only |
| D6 | dom · `__tests__/strumentiTile.test.tsx` | no Δ column and no toggle; «Andamento» calls `onOpenAndamento` | keep the toggle |
| E1 | e2e · `e2e/assets.andamento.spec.ts` (new) | Patrimonio → «Andamento» from the Strumenti link: the URL has `?tab=andamento`, the matrix shows the seeded +2% instrument with «+2,0» in a month, switching to «Valore €» shows the June mark; reload keeps the tab | — |
| E2 | e2e · `e2e/assets.andamento.mobile.spec.ts` (new) | 390: rows closed show two figures; opening one shows twelve cells and the line; no horizontal overflow; targets ≥ 44 px | grid of 6 × 2 overflowing |
| E3 | e2e · `e2e/assets.andamento.tablet.spec.ts` (new) | 768 and 1024: the table scrolls inside its wrapper, the first column stays | — |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the seeded account «Andamento» shows one row rising about 2% every month in
green steps, one flat, one falling, one that appears in June with YTD «da giu»; «Valore €» is uncoloured and June
carries the mark on the bought instrument; the Strumenti table no longer has Δ columns.

- A — the diff. B–E by a throwaway Playwright script on the emulators at 1440, 1024, 768 and 390, light and dark and
  one costume theme: B the tab from the link and from the URL; C the two measures and the legend; D the year picker
  (the previous year, a year with one snapshot), the selected row and its line, the keyboard on the table; E the
  phone list opened and closed, an account with no snapshots («nothing recorded»), a failed snapshot read. Decoys:
  «ornitorinco» (an instrument at quantity 0 in every snapshot: not listed) and «fenicottero» (a cash account: «—»
  in «Prezzo %»).
- F — at the owner's «pronto», on the mirror: his own instruments, one month checked against his broker's statement.

## 8. Putting it into service

No rules, no index, no migration (the snapshots are read as they are). Measures: `npm run perf:budget`
(`/dashboard/assets` ≤ +1 KB gz, `raisedBy` if raised); `npm run mobile:census -- --email=census@example.com` and
`npm run mobile:budget` on the same :3200 build, the new surface's baseline written in
doc/guide/prima-schermata-misure.md.

## 9. Documentation

- `doc/guide/patrimonio.md` — § «Andamento» (C6: the two measures and why the euro view is uncoloured, the YTD
  base, the month in progress, the types without a unit price), § Composizione mobile (the rows that open), § Files;
  § blind spots: the class and the name are today's; a missing snapshot empties two cells; the month in progress is
  last evening's.
- `doc/guide/rendimenti.md` — the heat scale's new home. `doc/guide/prima-schermata-misure.md` — the new surface.
- `doc/guide/velocita.md` § Registro — only if a ceiling was raised.
- `DESIGN.md` — amendment, before/after: the heat scale is a shared primitive (`components/ui/heatmap-scale.tsx`);
  a euro change that includes flows is never coloured.
- `README.md` — Patrimonio's feature lines. `AGENTS.md` § 3 — Patrimonio's stub.
- `CLAUDE.md` — Patrimonio line: «a second tab, Andamento: each instrument month by month and YTD (2026-11)»; Key
  Files: `components/ui/heatmap-scale.tsx`; under 20.000 characters.
- `Draft Release Temp.md` — «Patrimonio › Andamento: ogni strumento mese per mese e da inizio anno, in % sul prezzo
  o in euro sul valore».
- `doc/dati/README.md` § 6 and § 7 (C6 as built).

## 10. Declared out of scope

- The classes' matrix (weight in points) and the «Strumenti | Classi» switch → DATI-13.
- Daily points in the line and the «ultimi 90 giorni» chart → DATI-13 (it needs DATI-02's archive).
- The market effect net of trades per instrument (`tradeAwarePriceEffect`, `lib/utils/marketEffect.ts:21-58`) as a
  third measure → doc/guide/patrimonio.md § blind spots.
- A historical class per snapshot row → doc/guide/patrimonio.md § blind spots.
- Exporting the matrix → not planned.

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
  Accumulo, caricato a richiesta), doc/guide/stati.md, doc/guide/prima-schermata.md,
  doc/guide/velocita.md e doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Tocca la UI: leggi DESIGN.md (The First-Screen Rule, Small-Screen Composition, i colori delle
  metriche) e PRODUCT.md prima di disegnare
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

Implementa la spec così com'è scritta, nell'ordine: la funzione del prezzo unitario e la matrice con
U1–U8 (ognuno visto rosso con la sua mutazione), la scala di colore spostata, i tab della pagina (D1),
la matrice e la linea (D2–D5), la tabella Strumenti (D6), la composizione sul telefono, i seed e la
superficie del censimento, poi E1–E3 e i due budget. Il codice del § 4.2 è già scritto: copialo.

Fermati e chiedimi se: il tab non si carica a richiesta senza far crescere la pagina oltre 1 KB gz, il
budget della prima schermata non torna verde senza allargare una voce, oppure una regola di DESIGN.md
contraddice una resa che la spec descrive.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec: a new tab under the performance and first-screen budgets, a
shared contract, three widths. Estimated size: L (two pure modules, four components, the page's tabs, seeds, ~22
tests).
