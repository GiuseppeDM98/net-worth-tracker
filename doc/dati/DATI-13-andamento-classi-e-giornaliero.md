# DATI-13 — Patrimonio › Andamento: the classes by weight, and the daily line

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-12 (contract C6: the tab, the matrix module,
> the line, the rows that open, `hasNoMarketPrice`) and DATI-02 (contract C1: `useDailySnapshots`,
> `DailySnapshotsResult`, `DailyPoint`, `dailyUnitPrice`). Written on 2026-11-23; every `file:line` is cited
> @ b0bf8276 (a line number is a hint, the function's name is the anchor). Owner's points 4 and 5; decisions 14, 15,
> 28, 53, 83 and 84. Adds to C6, changes two of its shapes, and adds one constant to C1 (index § 7).

## 1. The problem today (evidence on the code)

- The owner asked the month-over-month and year-to-date reading «per strumento e per classe». After DATI-12 the tab
  has the instruments. Storico's «Composizione» charts the classes' shares over time, with the pension funds carved
  out as a band of their own (`lib/utils/historyComposition.ts`, `PENSION_BAND_KEY`); no page reads each class's
  month-over-month move in POINTS. The data is in every snapshot (`MonthlySnapshot.byAssetClass`, EUR by class with
  the debts negative and the pension funds folded into their classes, `types/assets.ts:595-597`, `:606-622`); the
  only per-class movement in the app is today against the last snapshot (`computeTopMovers`).
- After DATI-12 the selected instrument's line has twelve points a year. After DATI-02 a daily archive exists
  (`dailySnapshots/{userId}/months/{YYYY-MM}`, one row per instrument per day) and nothing reads it yet.

## 2. Goal and acceptance criteria

1. The tab has a view switch «Strumenti» | «Classi» (default «Strumenti», remembered). Proof: D1.
2. «Classi» is a matrix classes × months: a first column with the weight at the previous December, each month the
   change of the weight in POINTS against the month before, and «YTD» as «{±points} → {weight now}%». No semantic
   colour anywhere. A switch turns the cells into the value's change in euro. Proof: U1–U3, D2.
3. A weight is the class's value over the snapshot's total, the pension funds inside their classes as the snapshot
   holds them; the classes are in the app's order (`ASSET_CLASS_SEQUENCE`), only those that held a value in the
   year or at the previous December. Proof: U1, U4.
4. On the current year the line of the selected instrument — and of the selected class — is DAILY when the archive
   holds at least 20 points for it (`MIN_DAILY_POINTS`), monthly otherwise, and says which; with daily points it
   also states the change since the month began. A past year is monthly. What has no market price draws its value,
   never a price. Proof: U5–U7, D3.
5. The daily window is the year so far, and never less than 90 days, at `desktop:`; the last 90 days below it.
   Below `desktop:` the classes are rows that open like the instruments. Proof: D4, E2, E3.
6. The daily read happens only with the tab open and only on the current year. Proof: D5.
7. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1–E3 green;
   `npm run perf:budget` green with `/dashboard/assets` inside its ceiling, raised by no more than 1 KB gz and only
   with the register row (index § 8 rule 7); `mobile:census` and `mobile:budget` green.

## 3. Decisions

- **Decision 14** (owner, 2026-11-23): classes by weight in points, with a switch to the value in euro; a base
  column at December, YTD as «+3,1 → 55,1%», neutral colours.
- **Decision 15** (owner, 2026-11-23): below `desktop:`, rows that open: closed, the month in progress and the
  YTD; opened, a 4 × 3 grid of the twelve months and the chart.
- **Decision 28** (owner, 2026-11-23): the daily archive starts the day it is deployed — no backfill; so the daily
  line begins there.
- **Decision 53** (owner, 2026-11-23): what has no market price — a pension fund, a property, a loan — has no daily
  price: its line is its value, in both grains and under both measures.
- **Decision 83** (owner, 2026-11-23): a class's weight is read as the snapshot holds it, the pension funds inside
  their classes; the method note and the guide say that Storico's «Composizione» reads them apart.
- **Decision 84** (owner, 2026-11-23): at `desktop:` the daily window is the larger of the day of the year and 90
  days, so January never falls back to months; the 20-point threshold is ONE constant, `MIN_DAILY_POINTS`, shared
  with DATI-14.
- Adopted, reversible:
  - (a) 20 daily points is the threshold for a daily line: below it a daily line is a stub beside twelve months.
  - (b) the weight's denominator is the sum of `byAssetClass` (the net worth: debts lower their class); a snapshot
    with no `byAssetClass` is, for the classes, a month without a snapshot.
  - (c) below `desktop:` the daily window is the last 90 days.
  - (d) the verdict follows the view: in «Classi» it names the class whose weight moved most; the strip has two
    cells there too (the largest rise opens THE tile, the largest fall opens «Il perché»): `validateStrip` allows
    one cell per section and the tab has two.
  - (e) «Da inizio mese» is a percent only on a unit price; on a value — an instrument's or a class's — it is the
    change in euro and says «operazioni comprese» (decision 13: a change that includes flows is no return); on a
    weight it is points. It is never coloured.
  - (f) a closed class row carries two figures in the chosen measure, the month in progress and the YTD (decision
    15 to the letter; the declared exception of DATI-12, decision 82, covers it).
  - (g) a day the cron skipped is no point: the daily line's segment spans it.
  - (h) the view «Classi» is not a census surface: the census opens the default view.

## 4. Solution

### 4.1 The classes' matrix — `lib/utils/andamentoMatrix.ts` (added to C6, written here)

```ts
import { ASSET_CLASS_LABELS, ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';

export interface ClassCell {
  month: number;
  /** The class's share of the snapshot's total, in percent. */
  weight: number | null;
  /** Points against the previous month end. */
  weightDelta: number | null;
  value: number | null;
  valueDelta: number | null;
  inProgress: boolean;
}

export interface ClassRow {
  cls: string;
  label: string;
  /** At the base: the previous December, or the year's first snapshot when there is none. */
  baseWeight: number | null;
  baseValue: number | null;
  cells: ClassCell[];
  /** Points from the base to the year's last snapshot. */
  ytdPoints: number | null;
  endWeight: number | null;
  ytdValueDelta: number | null;
}

export interface ClassMatrix {
  year: number;
  months: number[];
  /** 0 = the previous December; otherwise the year's first month with a snapshot; null with no snapshot. */
  baseMonth: number | null;
  rows: ClassRow[];
}

interface SnapshotClasses {
  /** The sum of the classes: the net worth the weights are a share of. */
  total: number;
  values: Map<string, number>;
}

/** Null without `byAssetClass`: for the classes such a snapshot (an old one, a hand-made one) is a missing month. */
function classesOf(snapshot: MonthlySnapshot): SnapshotClasses | null {
  const entries = Object.entries(snapshot.byAssetClass ?? {});
  if (entries.length === 0) return null;
  return { total: entries.reduce((sum, [, value]) => sum + value, 0), values: new Map(entries) };
}

export function buildClassMatrix(input: {
  year: number;
  snapshots: readonly MonthlySnapshot[];
  today: { year: number; month: number };
}): ClassMatrix {
  const { year, today } = input;
  const slots: Array<SnapshotClasses | null> = Array.from({ length: 13 }, () => null);
  for (const snapshot of input.snapshots) {
    const slot = snapshot.year === year ? snapshot.month : snapshot.year === year - 1 && snapshot.month === 12 ? 0 : -1;
    if (slot >= 0) slots[slot] = classesOf(snapshot);
  }
  const months = slots.flatMap((slot, index) => (index > 0 && slot ? [index] : []));
  const baseMonth = slots[0] ? 0 : (months[0] ?? null);
  const lastMonth = months.length > 0 ? months[months.length - 1] : null;

  const present = new Set<string>();
  for (const slot of slots) if (slot) for (const [cls, value] of slot.values) if (value !== 0) present.add(cls);
  const known = ASSET_CLASS_SEQUENCE.filter((cls) => present.has(cls)) as string[];
  const ordered = [...known, ...[...present].filter((cls) => !known.includes(cls)).sort()];

  const round1 = (value: number) => Math.round(value * 10) / 10;
  const rows: ClassRow[] = ordered.map((cls) => {
    // A class absent from a snapshot is worth zero there; a total at or below zero has no weights.
    const at = (slot: number | null): { value: number; weight: number | null } | null => {
      const classes = slot === null ? null : slots[slot];
      if (!classes) return null;
      const value = classes.values.get(cls) ?? 0;
      return { value, weight: classes.total > 0 ? (value / classes.total) * 100 : null };
    };
    const cells: ClassCell[] = [];
    for (let month = 1; month <= 12; month++) {
      const now = at(month);
      const before = at(month - 1);
      cells.push({
        month,
        weight: now?.weight ?? null,
        weightDelta: now && before && now.weight !== null && before.weight !== null ? round1(now.weight - before.weight) : null,
        value: now ? now.value : null,
        valueDelta: now && before ? roundToCents(now.value - before.value) : null,
        inProgress: year === today.year && month === today.month,
      });
    }
    const base = at(baseMonth);
    const end = at(lastMonth);
    const measured = base && end && lastMonth !== baseMonth;
    return {
      cls,
      label: ASSET_CLASS_LABELS[cls] ?? cls,
      baseWeight: base?.weight ?? null,
      baseValue: base ? base.value : null,
      cells,
      // Rounded apart, then subtracted: the printed base, points and end always add up.
      ytdPoints: measured && base.weight !== null && end.weight !== null ? round1(round1(end.weight) - round1(base.weight)) : null,
      endWeight: end?.weight ?? null,
      ytdValueDelta: measured ? roundToCents(end.value - base.value) : null,
    };
  });
  return { year, months, baseMonth, rows };
}

/** The class whose weight moved most since the base, for the verdict; null with nothing measured. */
export function largestWeightMove(matrix: ClassMatrix): ClassRow | null {
  const measured = matrix.rows.filter((row) => row.ytdPoints !== null);
  if (measured.length === 0) return null;
  return measured.reduce((best, row) => (Math.abs(row.ytdPoints!) > Math.abs(best.ytdPoints!) ? row : best));
}
```

`lib/utils/andamentoNarrative.ts` gains two functions:

- `buildClassVerdict(matrix: ClassMatrix, isCurrentYear: boolean): PageVerdictModel` — on `largestWeightMove`.
  `headline`: «Da inizio anno il peso che si è mosso di più è {label}: {±x,x} punti»; with `baseMonth > 0` the
  subject names the window measured, «Da {mese} il peso che si è mosso di più è …»; on a past year «Nel {year} il
  peso …». `sentence`: «Ora è al {y,y}% del patrimonio netto.» — on a past year «A fine {year} era al {y,y}% del
  patrimonio netto.». `leadLength: 0`, `tone: 'neutral'` always. Nothing measured → headline «Servono due mesi di
  storia per leggere i pesi», no sentence.
- `selectClassStrip(matrix: ClassMatrix, tileId: string): StripFigure[]` — TWO cells, each `format: 'points'`,
  `tone: 'neutral'`: «Più su: {label}» = the largest positive `ytdPoints`, `opens: tileId`; «Più giù: {label}» = the
  largest negative one, `opens: VERDICT_REST_SECTION`. A side with no class → label «Più su» (or «Più giù»),
  `value: null`, `reason` «nessuna classe». `validateStrip` passes.

### 4.2 The daily line — `lib/utils/andamentoDaily.ts` (new, written here)

`lib/utils/dailySnapshot.ts` (C1's module) gains ONE constant, which DATI-14 imports for its own fallback:

```ts
/** Below this many daily points a daily line is a stub: its reader falls back to the coarser grain. */
export const MIN_DAILY_POINTS = 20;
```

```ts
/**
 * The line of Patrimonio › Andamento from the daily archive (2026-11-23). The archive starts the
 * day it was deployed (no backfill): until it holds enough days the line is the year's months, and
 * the caption says which of the two it is.
 */
import { dailyUnitPrice, MIN_DAILY_POINTS, type DailyPoint } from '@/lib/utils/dailySnapshot';

export interface LinePoint {
  /** YYYY-MM-DD: a day, or a month's last day for a monthly point. */
  iso: string;
  /** Null only on a monthly line: a month without a value between two that have one — a gap, never bridged. */
  value: number | null;
}

/** The caller asks `'value'` for a row without a market price (`AndamentoRow.priced` false): it has no price to draw. */
export function instrumentDailyLine(points: readonly DailyPoint[], assetId: string, measure: 'price' | 'value'): LinePoint[] {
  const line: LinePoint[] = [];
  for (const point of points) {
    const row = point.assets[assetId];
    const value = measure === 'price' ? dailyUnitPrice(row) : row && row.q > 0 ? row.v : null;
    if (value !== null) line.push({ iso: point.iso, value });
  }
  return line;
}

export function classDailyLine(points: readonly DailyPoint[], cls: string, measure: 'weight' | 'value'): LinePoint[] {
  const line: LinePoint[] = [];
  for (const point of points) {
    const value = point.byClass[cls] ?? 0;
    if (measure === 'value') {
      line.push({ iso: point.iso, value });
      continue;
    }
    const total = Object.values(point.byClass).reduce((sum, item) => sum + item, 0);
    if (total > 0) line.push({ iso: point.iso, value: (value / total) * 100 });
  }
  return line;
}

/**
 * The year's monthly values as line points, each on its month's last day. A month without a value
 * between the first and the last that have one is a null point: the line breaks there.
 */
export function monthlyLine(year: number, values: ReadonlyArray<{ month: number; value: number | null }>): LinePoint[] {
  const held = values.filter((item) => item.value !== null).map((item) => item.month);
  if (held.length === 0) return [];
  const first = Math.min(...held);
  const last = Math.max(...held);
  return values
    .filter((item) => item.month >= first && item.month <= last)
    .sort((a, b) => a.month - b.month)
    .map(({ month, value }) => {
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      return { iso: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`, value };
    });
}

/** `daily` comes from the two functions above and holds no null. */
export function chooseLine(daily: LinePoint[], monthly: LinePoint[]): { points: LinePoint[]; grain: 'daily' | 'monthly' } {
  return daily.length >= MIN_DAILY_POINTS ? { points: daily, grain: 'daily' } : { points: monthly, grain: 'monthly' };
}

/**
 * The change since the month of `todayIso` began: from the last point before the month (else the
 * month's first) to the latest. `'ratio'` is a percent — a unit price only; `'difference'` is the
 * plain difference, unrounded — euro on a value (trades included), points on a weight.
 */
export function monthToDate(daily: readonly LinePoint[], todayIso: string, kind: 'ratio' | 'difference'): number | null {
  const points = daily.filter((point): point is LinePoint & { value: number } => point.value !== null);
  const monthStart = `${todayIso.slice(0, 7)}-01`;
  const inMonth = points.filter((point) => point.iso >= monthStart);
  if (inMonth.length === 0) return null;
  const before = [...points].reverse().find((point) => point.iso < monthStart);
  const base = before ?? inMonth[0];
  const last = inMonth[inMonth.length - 1];
  if (base === last) return null;
  if (kind === 'difference') return last.value - base.value;
  return base.value > 0 ? (last.value / base.value - 1) * 100 : null;
}

/** 1 on the first of January. */
export function dayOfYear(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
}
```

### 4.3 The tab — `components/assets/AndamentoTab.tsx`

- **What changes in DATI-12's tab.** `AndamentoTabProps` gains `ownerId: string | undefined` — the page passes its
  `useActiveAccount().ownerId`, the OWNER's, so a co-owner reads the owner's archive. The tab now makes ONE read of
  its own, the daily archive; DATI-12 § 4.3's «no read of its own» stands for everything else. `AndamentoLineProps`
  becomes `{ label: string; title: string; points: LinePoint[]; grain: 'daily' | 'monthly'; caption: string | null;
  unit: 'price' | 'value' | 'weight'; height?: number }`: the tab builds the points, the line only draws them.
- State added: `view: 'instruments' | 'classes'` (default `'instruments'`, remembered under
  `patrimonio.andamento.vista`), `selectedClass` (default the first row of `buildClassMatrix`), `classMeasure:
  'weight' | 'value'` (default `'weight'`, remembered under `patrimonio.andamento.misuraClassi`). Each view keeps
  its own selection; the line follows the active view's.
- A view `SegmentedPill` «Strumenti» | «Classi» (`layoutId="andamento-vista"`, `semantics="radio"`) beside the
  year — below `desktop:` under the year select, above THE tile. The verdict and the strip follow the view
  (`buildClassVerdict`, `selectClassStrip`); THE tile's title in «Classi» is «Classi · {year}».
- «Classi» — `components/assets/AndamentoClassMatrix.tsx` (new): it copies the wrapper (the scrollable region,
  `aria-label="Matrice delle classi, scorre in orizzontale"`), the sticky first column and the roving-focus pattern
  of `AndamentoMatrix.tsx` — no shared component is extracted; the selected row carries `aria-current="true"`.
  Columns: «Classe»; the base — «Dic {year−1}» with the base weight («45,0%»), or the first month's name when
  `baseMonth > 0`; «Gen»…«Dic», the month in progress with «in corso» as in the instruments' matrix; «YTD». Measure
  pill «Peso (punti)» | «Valore €» (`layoutId="andamento-misura-classi"`, `semantics="radio"`):
  - «Peso (punti)»: a month cell is `weightDelta` as «+0,4» (one decimal, sign), neutral foreground, no fill; a
    zero move prints «0,0» in `text-muted-foreground`; a null `weightDelta` (either month without a snapshot) is
    an empty cell with the `title` «nessuno snapshot»; YTD is «{±ytdPoints} → {endWeight}%», «—» when null.
  - «Valore €»: the base column is the value at the base, the cells `valueDelta`, YTD `ytdValueDelta`; neutral;
    the same empty cell on a null.
  - Method note: «Un peso che sale non è un giudizio: dice come si è spostato il patrimonio. I punti sono
    percentuali del patrimonio netto; i fondi pensione stanno dentro le loro classi, diversamente da Storico.»
- **The daily read**, in the TAB (not the page): `days` = 90 when `useCompactLayout()` is true (below 1440: phone
  and tablet), else `Math.max(dayOfYear(todayIso), 90)`; `const dailyQuery = useDailySnapshots(year === today.year
  ? ownerId : undefined, days)` — the hook of C1 reads nothing without an owner, which is how a past year makes
  no read; `const daily = dailyQuery.data ?? []`.
- **The line's points.** Instruments: `lineMeasure = row.priced ? measure : 'value'` (decision 53), then
  `chooseLine(instrumentDailyLine(daily, row.id, lineMeasure), monthlyLine(year, row.cells → unitPrice | value))`.
  Classes: `chooseLine(classDailyLine(daily, cls, classMeasure), monthlyLine(year, row.cells → weight | value))`.
  While `dailyQuery.isPending` on the current year with an owner, the line is the monthly one with `caption:
  null`: a wait is not an absence (DESIGN → The Absence-Has-Three-Names Rule); the grain and the caption are chosen
  when the read settles.
- **The caption**, under the title, never coloured:
  - `grain === 'daily'` → «Giornaliero dal {primo giorno, d MMM}», followed — when `monthToDate` is not null — by
    « · Da inizio mese: {±x,x%}» on a unit price (`'ratio'`), « · Da inizio mese: {±€}, operazioni comprese» on a
    value (`'difference'`), « · Da inizio mese: {±x,x} punti» on a weight (`'difference'`, one decimal).
  - `'monthly'` on a past year → «Mensile».
  - `'monthly'` on the current year, in this order: `dailyQuery.isError` → «Mensile · archivio giornaliero non
    letto»; `daily.length === 0` → «Mensile · l'archivio giornaliero non ha ancora giorni»; otherwise (the archive
    has days, this row's line has {n} points, under 20) → «Mensile · {n} giorni nell'archivio per questa riga, ne
    servono 20».
- **The drawing.** `XAxis type="number" scale="time"` on each point's noon-UTC timestamp; the ticks are the first
  day of each month in the domain, printed «gen», «feb»…; the domain is the year on a monthly line, the points'
  own span on a daily one. A daily line has no dots, a monthly one has them; `connectNulls={false}`. The title:
  «Prezzo unitario», «Valore» or «Peso» by `unit`.
- **Below `desktop:`** «Classi» is a list of rows that open inside THE tile, on the model of the instruments' rows
  (DATI-12 § 4.4), the ONE measure pill at the head of the tile: closed — the class and two figures in the chosen
  measure, the month in progress (or the year's last month) and the YTD; open — the 4 × 3 grid of month cells and
  the line at 160 px. In an opened row of either view the line's title is «Ultimi 90 giorni» when the line is
  daily and its first point is 89 days back, «Dal {d MMM}» when it is daily and shorter, «{year}» when monthly.
- **States** (doc/guide/stati.md): the daily read failing does NOT fail the tab — the line is the monthly one with
  the caption above and an `ErrorNotice` (`live={false}`): at `desktop:` in the line's tile, above the chart; below
  it inside the opened row, above its line, without `collapse` (that prop belongs to a section of the page).

## 5. Constraints and traps

- **C1 and C6 are used as the index § 7 states them**, and what this spec changes is said there: `AndamentoTabProps`
  gains `ownerId`, `AndamentoLineProps` is replaced (§ 4.3), `MIN_DAILY_POINTS` joins C1's module; the classes'
  matrix, `buildClassVerdict`, `selectClassStrip` and `lib/utils/andamentoDaily.ts` are added to C6.
  `buildInstrumentMatrix`, `AndamentoRow` and `AndamentoMatrix.tsx` are not changed.
- **`useDailySnapshots` returns a `DailySnapshotsResult`, not a query**: `data` is undefined until every month of
  the window has answered; `isPending` and `isError` are its only other fields.
- **The archive is read a query per month and its closed months are kept on the device** (C1): the read still sits
  behind the tab's lazy boundary and the current-year gate — D5 holds it.
- **Colour never carries a judgement here** (decision 14): no `getMetricValueColor` on weights or on euro changes.
- **The Absence-Has-Three-Names Rule**: no archive yet, not enough days for this row, a failed read are three
  captions; the wait is a fourth state and has none.
- **`validateStrip`** (`lib/utils/verdictStrip.ts`): one cell per section — the classes' strip has two cells.
- **`useCompactLayout` is true below 1440**, on a phone AND on a tablet: both read 90 days and show the rows.
- **The ONE door to recharts**, **a list is ONE Tab stop**, **Small-Screen Composition** — as in DATI-12.
- **`byAssetClass` includes the loans as negatives and the pension funds apportioned** (`types/assets.ts:606-622`):
  the weights are of the NET worth. Storico's «Composizione» carves the pension out, so one class reads two
  weights on the two pages for the same month: the method note says so (decision 83).
- **The archive is read by the client SDK, not through a route**: an E2E cannot stub it with `page.route`; it
  plants rows through the emulator's REST, as `e2e/accumuloFixture.ts` does, and removes them.
- **Italian day**: `todayIso` from `getItalyDateIso()`.
- **No owner data**: fixtures «Azioni 60.000», «Obbligazioni 30.000», «Liquidità 10.000».

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/andamentoMatrix.test.ts` | 60/30/10 thousand → weights 60, 30, 10; next month 66/30/10 → equity +2,3 points (62,3%), bonds −1,7 | points on the value |
| U2 | unit · same | the base is December; with no December the year's first month, and `baseMonth` says it; YTD points from the base to the last snapshot; base 45,04 and end 47,16 → +2,2 (47,2 − 45,0); one snapshot only → no YTD | base = January always; round the difference instead of the two ends |
| U3 | unit · same | a class absent in a month reads weight 0 and a negative move; a total ≤ 0 → null weights, values kept; a snapshot with no `byAssetClass` is a missing month (null cells, never zeros) | skip the absent class; read the empty snapshot as zeros |
| U4 | unit · same | the order is `ASSET_CLASS_SEQUENCE`; an unknown key comes after, labelled with its key; a class at zero all year is not listed; one held only at the previous December is | alphabetical |
| U5 | unit · `__tests__/andamentoDaily.test.ts` | an instrument's daily line skips the days it was not held; «price» is v/q, «value» is v; a class's weight line divides by the day's total; `dayOfYear('2026-01-01')` = 1, `('2026-12-31')` = 365 | value for price |
| U6 | unit · same | 19 daily points → the monthly line, 20 → the daily; `monthlyLine` puts February on the 28th (29th in a leap year); a March without a value between February and April is ONE null point; the months before the first value are not emitted | threshold off by one; drop the null |
| U7 | unit · same | `monthToDate`: the base is the last point before the month; with none, the month's first; one point → null; `'difference'` on 1.000 → 1.500 is 500; `'ratio'` on a base ≤ 0 is null | base = first point of the line |
| U8 | unit · `__tests__/andamentoNarrative.test.ts` | the classes' verdict names the largest move and is neutral whatever the sign; `baseMonth: 3` → «Da marzo il peso…»; a past year → «A fine {year} era al…»; the strip's two cells pass `validateStrip` | tone from the sign; both cells opening the tile |
| D1 | dom · `__tests__/andamentoTab.test.tsx` (new) | the view pill switches the matrix and the verdict; the choice is still there after a remount; each view keeps its selection | the view not read from storage |
| D2 | dom · `__tests__/andamentoClassMatrix.dom.test.tsx` (new) | a cell reads «+2,3», the YTD «+2,3 → 62,3%», the base column «60,0%»; a null move is an empty cell; no cell has a fill or a metric colour class; «Valore €» shows euro | colour by sign |
| D3 | dom · `__tests__/andamentoTab.test.tsx` | 25 daily points → «Giornaliero dal …» with «Da inizio mese: …» as a percent in «Prezzo %» and as euro with «operazioni comprese» in «Valore €»; the read pending → the monthly line with no caption; an archive of 60 days and an instrument held for 5 → «Mensile · 5 giorni nell'archivio per questa riga, ne servono 20»; an empty archive → «… non ha ancora giorni»; a failed read → the monthly line, «… non letto» and the notice; a pension fund selected in «Prezzo %» draws its value under the title «Valore» | fail the tab; pass `measure` straight for a row without a market price |
| D4 | dom · same | compact layout: the service is asked the month keys of 90 days; at 1440 with the clock on 10 January the same keys (not ten days'), on 1 July the keys from January; an opened row's line is titled «Ultimi 90 giorni» when its first point is 89 days back | `days` = the day of the year alone |
| D5 | dom · same | a past year → the service is never called | always pass the owner |
| E1 | e2e · `e2e/assets.andamento.spec.ts` | 1440, «Classi»: the seeded classes, a «→» in the YTD cell, no cell with a fill or a metric colour class. Then 25 daily rows planted under `dailySnapshots/{test uid}/months/{YYYY-MM}` through the emulator's REST as `e2e/accumuloFixture.ts` does — the 25 Italian days ending today — and removed in `afterAll`: the selected instrument's caption reads «Giornaliero dal» | `chooseLine` always monthly |
| E2 | e2e · `e2e/assets.andamento.mobile.spec.ts` | 390, «Classi»: a closed class row shows two figures; it opens to twelve cells and a line; no horizontal overflow | the class grid 6 × 2 overflowing |
| E3 | e2e · `e2e/assets.andamento.tablet.spec.ts` | 768 and 1024, «Classi»: the list of rows, no table; a row opens with no horizontal overflow | the grid at a fixed width |

`__tests__/andamentoTab.test.tsx` mocks `@/lib/services/dailySnapshotService` (`getDailySnapshotMonth`) and
`useCompactLayout`, under a `QueryClientProvider` — never the hook: D4 and D5 assert the service's calls.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: «Classi» shows each class with its December weight, small signed moves month by
month in one neutral colour and a YTD like «+2,3 → 62,3%»; with 25 days planted in the archive the selected
instrument's line is daily and says since when; with 5 it stays monthly and says why; a pension fund's line is its
value under both measures.

- A — the diff. B–E by a throwaway Playwright script on the emulators at 1440, 1024, 768 and 390, light and dark: B
  the two views; C the classes' two measures; D the line with 25, 5 and 0 days planted through the emulator's REST
  (and removed), the caption's three forms of «Da inizio mese», a past year; E the rows of both views below
  `desktop:`, and a failed daily read — the script loads on the Firestore emulator a rules file that denies
  `dailySnapshots` (`PUT http://127.0.0.1:8080/emulator/v1/projects/demo-net-worth:securityRules`), checks the
  monthly line, the caption «Mensile · archivio giornaliero non letto» and the notice, then loads `firestore.rules`
  back. Decoys: «ornitorinco» (a class at zero all year: not listed) and «fenicottero» (a day in the archive for an
  instrument at quantity 0: no point).
- F — at the owner's «pronto», on the mirror: a closed month's weights against that snapshot's own `byAssetClass`
  over its sum, read in the emulator UI.

## 8. Putting it into service

No rules, no index. The daily line appears by itself on the 20th day after DATI-02 reached production. Measures:
`npm run perf:budget` (`/dashboard/assets` inside its ceiling; raised by no more than 1 KB gz and only with the
register row, index § 8 rule 7), `mobile:census` + `mobile:budget` (the surface of DATI-12, re-measured; the view
«Classi» is not a surface). With phase F closed and the commit in `develop`, the owner opens the PR `develop` →
`main` (index § 8 rule 13).

## 9. Documentation

- `doc/guide/patrimonio-andamento.md` (DATI-12's guide) — the classes' view (what a weight is, why it is neutral,
  the base, decision 83), the line's two grains, the window (decision 84) and `MIN_DAILY_POINTS`, the captions and
  the wait; § Composizione mobile; § Per-page blind spots: a class's weight differs from Storico's «Composizione»,
  which carves the pension out; what has no market price draws its value; a past year is always monthly (the hook
  reads «the last N days»); the weights are of the net worth, so a loan lowers its class; a snapshot without
  `byAssetClass` is a missing month for the classes; a day the cron skipped is no point; the view «Classi» is not
  measured by the census; the market effect per class net of trades is not there.
- `doc/guide/prima-schermata-misure.md` — the surface re-measured, if it moved. `doc/guide/velocita.md` § Registro —
  only if a ceiling was raised. `doc/guide/e2e-emulatori.md` — how a spec plants and removes the archive's rows.
- `README.md` — Patrimonio's feature lines. `AGENTS.md` § 3 — the guide's stub rewritten at equal or shorter
  length (decision 47).
- `Draft Release Temp.md` — one entry prepended in `## ✨ New Features`, in the file's form: «**Patrimonio ›
  Andamento — le classi per peso e la linea giornaliera** — Added the classes' view to Andamento (each class's
  weight month by month, in points) and a daily line for every instrument and class once the archive holds twenty
  days.»
- `CLAUDE.md` — the Patrimonio line rewritten at equal or shorter length with «… and each class by weight; the line
  is daily once the archive holds 20 days»; the «Latest» entry REPLACED whole (decision 46: the date, this spec in
  one sentence, «Open: doc/dati/ (README § 6)», «Next: DATI-14»); under 20.000 characters, counted with `node`.
- `doc/dati/README.md` § 6 (the row of 13 to `implemented`) and § 7 (C6 and C1 as built).

## 10. Declared out of scope

- Reading a past year's days → doc/guide/patrimonio-andamento.md § Per-page blind spots (the hook reads «the last
  N days»).
- The market effect per class net of trades → the same section.
- Daily volatility and drawdown, the Panoramica sparkline → DATI-14.
- A daily net-worth line on this tab → DATI-14 puts it on Panoramica, where the net worth lives.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-13-andamento-classi-e-giornaliero.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi — qui C6 e C1 —, regole della serie)
- Leggi doc/guide/patrimonio-andamento.md, doc/guide/patrimonio.md (§ Composizione mobile),
  doc/guide/stati.md, doc/guide/cache-persistita.md, doc/guide/prima-schermata.md,
  doc/guide/prima-schermata-misure.md, doc/guide/velocita.md, doc/guide/e2e-emulatori.md e
  doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Tocca la UI: leggi DESIGN.md (Small-Screen Composition, The First-Screen Rule, The Selected-Row
  Rule, The Absence-Has-Three-Names Rule) e PRODUCT.md prima di disegnare
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

Implementa la spec così com'è scritta, nell'ordine: MIN_DAILY_POINTS nel modulo di C1, la matrice
delle classi con U1–U4 e U8, la linea giornaliera con U5–U7, l'interruttore della vista e la matrice
delle classi (D1, D2), la linea a due grane con le sue didascalie (D3–D5), la composizione sotto
desktop, poi E1–E3, i budget, i documenti del § 9 e la riga 13 di doc/dati/README.md § 6 a
`implemented` (C6 e C1 nel § 7 come sono costruiti). OGNI test del § 6 va visto rosso con la sua
mutazione. Il codice dei §§ 4.1 e 4.2 è già scritto: copialo.

Fermati e chiedimi se: DATI-12 o DATI-02 non sono in develop con i contratti dell'indice
(hasNoMarketPrice, AndamentoRow.priced, AndamentoTabProps, useDailySnapshots che restituisce
DailySnapshotsResult — nomi o firme diversi), oppure il budget della prima schermata non torna verde
senza allargare una voce.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa. A commit in develop, ricordami la PR develop → main (regola 13
dell'indice).
```

Model: **Sonnet 5.5**, effort **medium** — an M spec in one area, no schema; it adds to C6 and one constant to C1
(index § 7), every criterion closed by a test. Estimated size: M (one new module, two extended, two components, 16
tests).
