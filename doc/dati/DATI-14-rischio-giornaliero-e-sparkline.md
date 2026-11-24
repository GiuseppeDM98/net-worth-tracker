# DATI-14 — The daily archive read by Rendimenti (risk on the days) and by Panoramica (the sparkline's short periods)

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-02 (contract C1: `useDailySnapshots`,
> `DailySnapshotsResult`, `DailyPoint`), DATI-03 (`monotonePath`, `TILE_COLUMN_END_CLASS`) and DATI-13 (one
> constant of C1's module, `MIN_DAILY_POINTS`). Written on 2026-11-23; every `file:line` is cited @ b0bf8276 (a
> line number is a hint, the function's name is the anchor). Owner's point 5; decisions 11, 28, 54, 84 and 88.

## 1. The problem today (evidence on the code)

- **Risk is measured on months.** The volatility is the standard deviation of the MONTHLY returns × √12
  (`calculateVolatility`, `lib/services/performanceService.ts:409-441`), null under a minimum of returns; the
  drawdown is the peak-to-trough of the monthly TWR index (`calculateMaxDrawdown`, `:452-470`). A fall and a recovery
  inside one month do not exist for either figure. The «Rischio» tile reads them
  (`app/dashboard/performance/page.tsx:1019-1029`, `describeRisk`, `lib/utils/performanceNarrative.ts:482-488`).
- **The Panoramica sparkline has one point a month** (`DashboardOverviewSparklinePoint { month, year,
  totalNetWorth }`, `types/dashboardOverview.ts:7-11`; «"1M" really means "this month vs last"»,
  `lib/utils/sparklinePeriod.ts:1-8`): its shortest period, «3M» (`components/dashboard/PeriodSelector.tsx:5`), is a
  line through four points.
- After DATI-02 a daily row exists per account: the net worth, the classes and, per instrument, quantity and value.
  Nothing reads it on these two pages.

## 2. Goal and acceptance criteria

1. The «Rischio» tile gains a second reading, «Sui giorni»: the annualised volatility of the daily returns and the
   deepest daily fall from a peak with its date, over the PERIOD CHOSEN on the page as far back as the archive
   goes, once the period holds 60 daily returns; before that, one line says how many there are and how many it
   takes. The block's eyebrow names the day it starts from. The monthly figures, the Sharpe and the Sortino do not
   change. Proof: U1–U5, N1, D1.
2. A daily return is the move of the instruments HELD on both days, at yesterday's weights — a purchase, a sale, a
   salary do not move it — on the SAME base as the monthly figures beside it: what Rendimenti keeps out of its
   measured base is out here, and a loan is never in. Weekends are left out; a gap longer than four days breaks the
   chain. Proof: U1, U2, U3.
3. On the hero tile of Panoramica AND of Patrimonio (one component) the sparkline's «3M» period is drawn on the
   daily net worth when the archive holds at least 20 points in the period (`MIN_DAILY_POINTS`); otherwise, and on
   every other period, it is today's monthly line. The hover reads a day («12 Nov») on a daily line. Proof: U6,
   D2, D3.
4. The daily read happens on those two pages only when «3M» is chosen; on Rendimenti, below `desktop:`, only once
   the «Rischio» row has been opened. Proof: D4, N2.
5. A failed daily read leaves the three pages as they are today (monthly figures, monthly line) — no error state
   for the page. Proof: D5, N2.
6. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1 and E2
   green; `npm run perf:budget` green with `/dashboard`, `/dashboard/assets` and `/dashboard/performance` inside
   their ceilings, raised by no more than 1 KB gz and only with the register row (index § 8 rule 7);
   `mobile:census` and `mobile:budget` green (the hero's default period is «1A» and the «Rischio» row is closed on
   a first visit: no first screen makes a daily read).

## 3. Decisions

- **Decision 11** (owner, 2026-11-23): the daily archive feeds Patrimonio › Andamento, the Assistente and the
  Consulente, Rendimenti's volatility and drawdown, Panoramica's sparkline.
- **Decision 28** (owner, 2026-11-23): no backfill — the readings turn on by themselves as the days accumulate.
- **Decision 54** (owner, 2026-11-23): the risk «Sui giorni» is measured on the same base as the monthly risk of
  Rendimenti: `computeDailyRisk` receives the ids the page resolved as out of the base.
- **Decision 84** (owner, 2026-11-23): the daily line on «3M» turns on at 20 points, the threshold of Andamento's
  line — ONE constant, `MIN_DAILY_POINTS`.
- **Decision 88** (owner, 2026-11-23): «Sui giorni» ALWAYS follows the chosen period (YTD, 1A, 3A, 5A, Tutto, a
  custom one), as far back as the archive goes; its label says the window («Sui giorni · dal {giorno}»); under 60
  returns in the window it says «Giorni insufficienti». The closed months of the archive are read at most once a day per
  device (C1: the persisted cache lives 24 hours), so a long period costs its reads once a day.
- Adopted, reversible:
  - (a) the daily risk is ADDED beside the monthly one; the monthly volatility stays the input of the Sharpe and the
    Sortino (changing it would move four figures and their stories at once).
  - (b) 60 daily returns to show the figures (about three months of trading days); annualised by √252.
  - (c) the daily return is holdings-based (prices on yesterday's holdings), not a time-weighted return on the net
    worth: it needs no cashflow adjustment and cannot be bent by a transfer.
  - (d) the daily sparkline on «3M» only: «6M» and longer read well on months. For its first two months the daily
    «3M» line covers the days the archive has, fewer than three months.
  - (e) holidays stay in the series as days with no move (the archive does not know a market calendar).
  - (f) the hero is ONE component for two pages (doc/guide/panoramica.md): the daily «3M» is Patrimonio's too.
  - (g) the archive is read five years back at most (`DAILY_RISK_MAX_DAYS`), whatever the period.
  - (h) below `desktop:` Rendimenti reads the archive at the first opening of the «Rischio» row (AGENTS.md:
    «Lazy-gate expensive panels»); at `desktop:` when the page has its figures.
  - (i) an instrument whose value in the archive is zero or negative on either day is left out of that day's
    return: a zero is a quote that failed far more often than a holding wiped out.

## 4. Solution

### 4.1 The daily risk — `lib/utils/dailyRisk.ts` (new, written here)

```ts
/**
 * Risk measured on the days of the daily archive (2026-11-23): what the monthly figures cannot
 * see — a fall and a recovery inside one month.
 *
 * A day's return is the move of the instruments held on BOTH days, weighted by what each was worth
 * the day before: prices on yesterday's holdings. A purchase, a sale or a salary change the holdings
 * of the NEXT pair, never the return. The instruments are those of Rendimenti's measured base (the
 * ids the page resolved as out of it are skipped) and only what is worth more than zero on both
 * days: a loan — quantity its principal, value minus that — is a liability, never a holding.
 * Weekends are skipped (no price moves and they would thin the figure); a gap longer than four
 * days is a hole in the archive, not a return.
 * Pure: the points come in ascending, as `useDailySnapshots` returns them.
 */
import type { DailyPoint } from '@/lib/utils/dailySnapshot';

export const DAILY_RISK_MIN_RETURNS = 60;
export const TRADING_DAYS_PER_YEAR = 252;
export const DAILY_GAP_MAX_DAYS = 4;
/** Five years: the furthest back the archive is read, whatever the period. */
export const DAILY_RISK_MAX_DAYS = 1830;

export interface DailyReturn {
  /** The day the return ends on. */
  iso: string;
  pct: number;
}

export interface DailyRiskWindow {
  /** The ids out of Rendimenti's measured base (`excludedAssetIds` of `lib/utils/performanceBase.ts`). */
  excludedAssetIds: readonly string[];
  /** The chosen period in Italian days, both ends included. */
  fromIso: string;
  toIso: string;
}

const noon = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const isWeekend = (iso: string) => {
  const day = new Date(noon(iso)).getUTCDay();
  return day === 0 || day === 6;
};

/** How many days back from today the archive is read for a period that starts on `fromIso`. */
export function dailyRiskDays(fromIso: string, todayIso: string): number {
  const span = Math.round((noon(todayIso) - noon(fromIso)) / 86_400_000) + 1;
  return Math.min(Math.max(span, 1), DAILY_RISK_MAX_DAYS);
}

export function dailyReturns(points: readonly DailyPoint[], window: DailyRiskWindow): DailyReturn[] {
  const excluded = new Set(window.excludedAssetIds);
  const trading = points.filter((point) => point.iso >= window.fromIso && point.iso <= window.toIso && !isWeekend(point.iso));
  const returns: DailyReturn[] = [];
  for (let index = 1; index < trading.length; index++) {
    const previous = trading[index - 1];
    const current = trading[index];
    if (Math.round((noon(current.iso) - noon(previous.iso)) / 86_400_000) > DAILY_GAP_MAX_DAYS) continue;
    let base = 0;
    let moved = 0;
    for (const [assetId, before] of Object.entries(previous.assets)) {
      if (excluded.has(assetId)) continue;
      const after = current.assets[assetId];
      // Held on both days and worth more than zero on both: a loan (value −quantity) never enters the base.
      if (!after || !(before.q > 0) || !(after.q > 0) || !(before.v > 0) || !(after.v > 0)) continue;
      base += before.v;
      moved += before.v * (after.v / after.q / (before.v / before.q) - 1);
    }
    if (base > 0) returns.push({ iso: current.iso, pct: (moved / base) * 100 });
  }
  return returns;
}

export interface DailyRisk {
  /** How many daily returns the window gives. */
  returns: number;
  /** The days the first and the last return end on. */
  fromIso: string | null;
  toIso: string | null;
  /** Annualised, in percent; null under `DAILY_RISK_MIN_RETURNS`. */
  volatility: number | null;
  /** The deepest fall from a peak, a negative percent; null when it never fell or is not measured. */
  maxDrawdown: number | null;
  troughIso: string | null;
  /** The last day against the latest peak: 0 at a peak, negative below it; null when not measured. */
  currentDrawdown: number | null;
}

export function computeDailyRisk(points: readonly DailyPoint[], window: DailyRiskWindow): DailyRisk {
  const returns = dailyReturns(points, window);
  const empty: DailyRisk = {
    returns: returns.length,
    fromIso: returns[0]?.iso ?? null,
    toIso: returns[returns.length - 1]?.iso ?? null,
    volatility: null,
    maxDrawdown: null,
    troughIso: null,
    currentDrawdown: null,
  };
  if (returns.length < DAILY_RISK_MIN_RETURNS) return empty;

  const mean = returns.reduce((sum, item) => sum + item.pct, 0) / returns.length;
  const variance = returns.reduce((sum, item) => sum + (item.pct - mean) ** 2, 0) / (returns.length - 1);

  let level = 100;
  let peak = 100;
  let deepest = 0;
  let troughIso: string | null = null;
  for (const item of returns) {
    level *= 1 + item.pct / 100;
    if (level > peak) peak = level;
    const fall = (level / peak - 1) * 100;
    if (fall < deepest) {
      deepest = fall;
      troughIso = item.iso;
    }
  }
  return {
    ...empty,
    volatility: Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR),
    maxDrawdown: deepest < 0 ? deepest : null,
    troughIso,
    currentDrawdown: (level / peak - 1) * 100,
  };
}
```

### 4.2 Rendimenti

- `lib/utils/performanceNarrative.ts` gains a type and two functions:
  - `export interface DailyRiskReading { eyebrow: string; reading: Narrative }`.
  - `describeDailyRisk(risk: DailyRisk): DailyRiskReading`. The eyebrow is «Sui giorni · dal {d} {mese} {yyyy}» on
    `risk.fromIso` (the month from `MONTH_NAMES`, lower case), plain «Sui giorni» with no return. The reading,
    five branches, each a whole sentence:
    1. `returns === 0` → prose «Giorni insufficienti: il rischio sui giorni si accende con 60 rendimenti
       giornalieri nel periodo, e l'archivio non ne ha ancora.»
    2. `0 < returns < DAILY_RISK_MIN_RETURNS` → prose «Giorni insufficienti: il rischio sui giorni si accende con
       60 rendimenti giornalieri nel periodo, oggi sono {returns}.» (one: «…, oggi ce n'è uno.»).
    3. measured, with a drawdown, the last day at a peak (`currentDrawdown ≥ −0,05`) → prose «Sui giorni la
       volatilità è », figure `{x,x%}`, prose « annua e la caduta più profonda da un massimo è », figure `{−y,y%}`
       with `sign: 'negative'`, prose « (il {d} {mese} {yyyy}).»
    4. the same with `currentDrawdown < −0,05` → branch 3 followed by prose « L'ultimo giorno è a », figure
       `{−z,z%}` with `sign: 'negative'`, prose « dal massimo.»
    5. measured, never fell → prose «Sui giorni la volatilità è », figure `{x,x%}`, prose « annua e il portafoglio
       non è mai sceso sotto un massimo.»
  - `readDailyRisk(result: Pick<DailySnapshotsResult, 'data'>, window: DailyRiskWindow): DailyRiskReading | null` —
    null while `data` is undefined (the read pending, failed or never asked), else
    `describeDailyRisk(computeDailyRisk(result.data, window))`.
- `components/performance/tiles/RischioTile.tsx` (the one of Rendimenti; the Budget has a tile of the same name):
  a new optional prop `daily?: DailyRiskReading | null`. When present, a sub-block sits after the tile's five rows
  and before `TileMethodNote`: the eyebrow (`TILE_SUB_EYEBROW_CLASS`) and `NarrativeText`. Only then the method
  note gains the line «Sui giorni: mosse degli strumenti della base posseduti il giorno prima, fine settimana
  esclusi, annualizzate su 252 sedute; segue il periodo scelto fin dove arriva l'archivio.» Without the prop the
  tile's HTML is today's.
- `app/dashboard/performance/page.tsx`, after `useMobileSections` and BEFORE the first early return (`if
  (loading)`), never inside the JSX:

  ```ts
  // «Sui giorni» follows the period and the base of the figures beside it. Read at the first opening of the row
  // below desktop, at once at 1440; additive: it is not part of the page's gate and its failure shows nothing.
  const rischioRow = sections.collapse(PERFORMANCE_SECTION_IDS.rischio);
  const measuredPeriod = metrics && !metrics.hasInsufficientData ? metrics : null;
  const dailyWindow = measuredPeriod && base
    ? { excludedAssetIds: base.excludedAssetIds, fromIso: getItalyDateIso(measuredPeriod.startDate), toIso: getItalyDateIso(measuredPeriod.endDate) }
    : null;
  const dailyWanted = dailyWindow !== null && (!rischioRow || rischioRow.mounted);
  const dailyQuery = useDailySnapshots(dailyWanted ? ownerId : undefined, dailyWindow ? dailyRiskDays(dailyWindow.fromIso, getItalyDateIso()) : 1);
  const dailyReading = dailyWindow ? readDailyRisk(dailyQuery, dailyWindow) : null;
  ```

  and, on the tile, `daily={dailyReading}`. While the read is pending or failed the prop is null and the tile is
  today's; when it settles the tile grows by one block (its column ends with `TILE_COLUMN_END_CLASS`, DATI-03).

### 4.3 Panoramica

- `lib/utils/sparklinePeriod.ts`:

```ts
/** A point of the hero sparkline: a month (the server's summary) or, on a short period, a day of the archive. */
export interface SparklinePoint {
  totalNetWorth: number;
  /** YYYY-MM for a monthly point, YYYY-MM-DD for a daily one. */
  label: string;
}

export const SPARKLINE_DAILY_PERIOD: SparklinePeriod = '3M';
export const SPARKLINE_DAILY_DAYS = 92;

/** The daily net worth as sparkline points, when there are enough to draw a line that says more than four months. */
export function dailySparkline(points: ReadonlyArray<{ iso: string; netWorth: number }>): SparklinePoint[] | null {
  if (points.length < MIN_DAILY_POINTS) return null;
  return points.map((point) => ({ totalNetWorth: point.netWorth, label: point.iso }));
}

export function monthlySparkline(data: DashboardOverviewSparklinePoint[]): SparklinePoint[] {
  return data.map((point) => ({ totalNetWorth: point.totalNetWorth, label: `${point.year}-${String(point.month).padStart(2, '0')}` }));
}
```

  `MIN_DAILY_POINTS` is imported from `lib/utils/dailySnapshot.ts` (DATI-13 wrote it there);
  `filterSparklineByPeriod` is unchanged.
- `lib/hooks/useHeroSparkline.ts` (new) — the ONE choice, for the two pages that show the hero:

  ```ts
  /** The hero's line: the archive's days on «3M» when it holds enough of them, the server's months otherwise. */
  export function useHeroSparkline(
    ownerId: string | undefined,
    period: SparklinePeriod,
    monthly: DashboardOverviewSparklinePoint[] | undefined,
  ): SparklinePoint[] {
    const isDailyPeriod = period === SPARKLINE_DAILY_PERIOD;
    // Additive: no owner, no read — every other period makes none; a failed read leaves the months.
    const daily = useDailySnapshots(isDailyPeriod ? ownerId : undefined, SPARKLINE_DAILY_DAYS);
    const days = isDailyPeriod && daily.data ? dailySparkline(daily.data) : null;
    return days ?? monthlySparkline(filterSparklineByPeriod(monthly ?? [], period));
  }
  ```

  While the daily read loads the monthly line is shown and is replaced when the points arrive (no skeleton, no
  layout shift: same height).
- `app/dashboard/page.tsx` (`sparklineDisplay`, `:273-276`) and `app/dashboard/assets/page.tsx` (`:400-402`):
  `const sparklineDisplay = useHeroSparkline(ownerId, sparklinePeriod, overview?.sparklineData);` in place of the
  memo. `ownerId` is the active account's, as every other read of the two pages (the demo, a co-owner).
- The type changes for every caller of the sparkline: `PatrimonioTile.sparklineDisplay: SparklinePoint[]`
  (`components/dashboard/overview/PatrimonioTile.tsx`, which reads `.totalNetWorth` only); the landing
  (`app/page.tsx`) passes `monthlySparkline(filterSparklineByPeriod(SAMPLE_SPARKLINE, sparklinePeriod))`;
  `components/pension/tiles/FondoOggiTile.tsx` builds `{ totalNetWorth, label: 'YYYY-MM' }` for its own
  `NetWorthSparkline`; the fixture of DATI-03's R1 in `__tests__/netWorthSparkline.test.tsx` goes through
  `monthlySparkline`.
- `components/dashboard/NetWorthSparkline.tsx`: `data: SparklinePoint[]`; the hover's label formats `label` by its
  length — 7 characters → `${MONTH_NAMES_SHORT[m − 1]} ${yyyy}` («Nov 2026», today's text unchanged), 10 →
  `${Number(dd)} ${MONTH_NAMES_SHORT[m − 1]}` («12 Nov»). Nothing else changes (the curve is DATI-03's
  `monotonePath`, which holds for any number of points; the x is the point's index, so a day the cron skipped
  takes no room).

## 5. Constraints and traps

- **C1 is used as the index § 7 states it**: `useDailySnapshots(ownerId | undefined, days)` reads nothing without
  an owner — the only gate used (no new option on the hook) — and returns a `DailySnapshotsResult` (`data`
  undefined until every month has answered), not a query.
- **Hooks before the early returns**: Rendimenti returns early three times (`loading`, `loadFailed`, no figures);
  the daily hook sits above them, with `metrics` possibly null — § 4.2's code handles it.
- **`sections.collapse(id)` is undefined at `desktop:`** (`lib/hooks/useMobileSections.ts`) and carries `mounted`
  (open now or opened before) below it: that is the row's lazy gate.
- **The First-Screen Rule / `mobile:budget`**: no first screen makes a daily read — the hero's default period is
  «1A» on both pages, Rendimenti's «Rischio» row is closed on a first visit; D4 and N2 hold it, the census
  confirms it.
- **A page gates on every query it reads** (AGENTS.md, «An async view must gate on EVERY query it reads») — EXCEPT
  an additive reading that has its own fallback: the three daily reads are declared here as additive, and
  AGENTS.md and the guides say so (§ 9). doc/guide/panoramica.md § Panoramica and Dashboard Data Isolation («no
  page-level fan-out queries») gains the one exception.
- **`TZ`**: the weekend test parses the ISO day at noon UTC — a day's weekday is the same in every zone; U3 runs
  under both.
- **Tile columns end on one line** (DATI-03): the «Rischio» tile grows by one block; its column is the one with
  `TILE_COLUMN_END_CLASS` on its last cell.
- **The monthly risk figures are shared contracts** (the email, the PDF, «Analizza con AI» read
  `metrics.volatility`): untouched.
- **The archive is read by the client SDK**: an E2E plants its rows through the emulator's REST with
  `Authorization: Bearer owner` (the rules forbid a client write), as `e2e/accumuloFixture.ts` does, and removes
  them in `afterAll`.
- **React Compiler on**: no manual `useMemo` is needed around the hook's result.
- **No owner data**: fixtures are two instruments at 100 and 50 with round moves.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/dailyRisk.test.ts` | two instruments worth 600 and 400; the first +1% → the day's return +0,6%; a purchase that doubles the first's quantity at the same price → 0%; with the second id in `excludedAssetIds` the return is +1% | net worth ratio in place of holdings; ignore `excludedAssetIds` |
| U2 | unit · same | an instrument bought today (absent yesterday) and one sold today (absent today) do not enter the day's return; a loan (q 800, v −800) beside 600/400 leaves the day at +0,6%; an instrument at value 0 today is left out | include with a zero base; `before.v === 0` in place of `!(before.v > 0)` |
| U3 | unit · same | Saturday and Sunday points are skipped: Friday → Monday is one return; a gap of five days gives none; a point before `fromIso` or after `toIso` gives none; `dailyRiskDays('2026-01-01', '2026-01-10')` = 10, a start in the future → 1, ten years back → 1830; the same under `TZ=UTC` and `Europe/Rome` | keep the weekends; drop the window |
| U4 | unit · same | 59 returns → every figure null and `returns: 59`; 60 → a volatility; a price alternating 100 → 101 → 100 … for 60 returns (+1% and −0,990%) → 15,9% annual (`toBeCloseTo(15.9, 1)`) | √12 |
| U5 | unit · same | 57 flat days, then +10%, −20%, +5%: deepest fall −20% on the 59th return's day, the last day at −16%; 60 rising returns → `maxDrawdown: null`, `currentDrawdown: 0` | fall measured from the first level |
| U6 | unit · `__tests__/sparklinePeriod.test.ts` | 19 daily points → null (monthly line), 20 → the daily points with day labels; monthly labels are `YYYY-MM` | threshold off by one |
| N1 | unit · `__tests__/performanceNarrative.test.ts` | the five branches of `describeDailyRisk`, each sentence ending with its full stop: no return, some («oggi sono 9», «oggi ce n'è uno»), figures with a drawdown, the same below the peak («L'ultimo giorno è a…»), never fell; the eyebrow «Sui giorni · dal 3 giugno 2026», and «Sui giorni» with no return | figures under the minimum |
| N2 | unit · same | `readDailyRisk({ data: undefined }, window)` is null; with points it is the reading | a reading on undefined data |
| D1 | dom · `__tests__/rischioTile.test.tsx` | with `daily` the tile shows the eyebrow and the sentence after its rows, and the method note's line «Sui giorni: …»; without it the tile's HTML is today's (no block, no line) | always render the block; the note's line unconditional |
| D2 | dom · `__tests__/netWorthSparkline.test.tsx` | a daily point's hover reads «12 Nov», a monthly one «Nov 2026» | one format |
| D3 | dom · `__tests__/useHeroSparkline.test.tsx` (new, `renderHook`, `getDailySnapshotMonth` mocked as in `__tests__/useDailySnapshots.test.tsx`) | «3M» with 25 daily points returns 25 points with day labels; with 5 it returns the monthly ones | daily under the minimum |
| D4 | dom · same | on «1A» the daily service is never called; switching to «3M» calls it | always read |
| D5 | dom · same | the daily service rejecting leaves the monthly points and throws nothing | fail on the error |
| E1 | e2e · `e2e/overview.spec.ts` | 25 daily rows planted for the base account under `dailySnapshots/{uid}/months/{YYYY-MM}` through the emulator's REST — the 25 Italian days ending today — and removed in `afterAll`: Panoramica on «3M» has more than 20 points in the sparkline's path and its hover names a day; on «1A» the path has the months | `dailySparkline` always null |
| E2 | e2e · `e2e/performance.degraded.spec.ts` (project `degraded`, scenario `performance`) | the «Rischio» tile shows the block «Sui giorni» with its «Giorni insufficienti» sentence — the read is wired, on an archive that has no days in the scenario's period | `daily={null}` fixed |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: with 70 weekdays planted in the archive (one instrument whose price alternates
100 and 101) and the period «1A», the «Rischio» tile reads «Sui giorni la volatilità è 15,9% annua…» under an
eyebrow that names the first day; with 10 weekdays it reads «Giorni insufficienti: … oggi sono 9.»; the hero on
«3M» draws a daily line whose hover names days, on «1A» the monthly one — on Panoramica and on Patrimonio.

- A — the diff. B–E by a throwaway Playwright script on the emulators at 1440 and 390, light and dark; the script
  plants the days through the emulator's REST, for an account whose snapshots cover the last twelve months (the
  census account), and removes them. B Rendimenti with 70 days on «1A», then on a shorter period (the eyebrow's
  day and the count follow it); C with 10 and with none; at 390 the «Rischio» row closed (the network panel: no
  `dailySnapshots` read) and then opened; D Panoramica and Patrimonio «3M» with 70 and with 10 days, then «1A» (no
  `dailySnapshots` read); E the daily read failing — the script loads on the Firestore emulator a rules file that
  denies `dailySnapshots` (`PUT http://127.0.0.1:8080/emulator/v1/projects/demo-net-worth:securityRules`), checks
  the three pages as today's, then loads `firestore.rules` back. Decoys: «ornitorinco» (a weekend row with a wild
  price: it must not move the volatility) and «fenicottero» (a purchase on a flat day: the return stays 0).
- F — at the owner's «pronto», on the mirror, once his archive holds the days: the two readings on his data.

## 8. Putting it into service

No rules, no index. Both readings stay off until the archive of DATI-02 has the days: «Sui giorni» says so in
words; the sparkline simply stays monthly. Measures: `npm run perf:budget` (`/dashboard`, `/dashboard/assets`,
`/dashboard/performance` inside their ceilings; raised by no more than 1 KB gz and only with the register row,
index § 8 rule 7), `mobile:census` + `mobile:budget`. With phase F closed and the commit in `develop`, the owner
opens the PR `develop` → `main` (index § 8 rule 13).

## 9. Documentation

- `doc/guide/rendimenti.md` — § «Risk on the days» (the holdings-based return and why, the base it shares with the
  monthly figures, the period it follows and the five-year cap, the weekend rule, the minimum, √252, why it is
  beside and not instead of the monthly figures, the row's lazy read); § Per-page blind spots: holidays count as
  flat days; a pension fund or a property inside the base weighs as a flat holding (its value sits in the
  quantity); an instrument priced by hand jumps on the day of its update; a split reads as a fall on its day; a
  detached coupon or dividend is a price fall — the daily return is a price return; a value at zero in the archive
  leaves the instrument out of that day; a weekday the cron skipped makes one two-day return; with the cron
  stopped «L'ultimo giorno» is the last archived one; the daily figure differs from the monthly volatility by
  construction; no daily Sharpe or Sortino, no daily underwater chart, no market calendar.
- `doc/guide/panoramica.md` — the «3M» daily line and `useHeroSparkline`; § Panoramica and Dashboard Data
  Isolation: the one client read beside the overview is the archive on «3M», additive; § Per-page blind spots:
  below 20 days «3M» is monthly, and for its first months the daily line covers fewer than three; daily points on
  «6M» and longer are not there. `doc/guide/patrimonio.md` — the hero's «3M», one sentence.
- `doc/guide/grafici.md` — the sparkline's point (`SparklinePoint`) and the hover's label by its length.
- `doc/guide/stati.md` and `AGENTS.md` (the gate rule) — one clause each: an additive reading with its own
  fallback is not part of the page's gate. `doc/guide/velocita.md` § Registro — only if a ceiling was raised.
- `README.md` — the two feature lines. `Draft Release Temp.md` — two entries prepended in `## ✨ New Features`, in
  the file's form: «**Rendimenti — il rischio misurato anche sui giorni** — Added a daily reading to the Rischio
  tile: annualised volatility and deepest fall on the daily archive, over the chosen period.» and «**Panoramica e
  Patrimonio — la linea a 3 mesi è giornaliera** — The hero's 3M sparkline draws the daily net worth once the
  archive holds twenty days.»
- `CLAUDE.md` — the Rendimenti and Panoramica lines rewritten at equal or shorter length, a clause each; the
  «Latest» entry REPLACED whole (decision 46: the date, this spec in one sentence, «Open: doc/dati/ (README § 6)»,
  «Next: DATI-15»); under 20.000 characters, counted with `node`. `AGENTS.md` § 3 — the stubs of the guides
  touched rewritten at equal or shorter length (decision 47).
- `doc/dati/README.md` § 6 (the row of 14 to `implemented`).

## 10. Declared out of scope

- A Sharpe and a Sortino on the daily returns → doc/guide/rendimenti.md § Per-page blind spots (they need a daily
  risk-free rate and a longer history).
- The daily underwater chart → the same section.
- A market calendar for holidays → the same section.
- Daily points on «6M» and longer → doc/guide/panoramica.md § Per-page blind spots.
- The Assistente and the Consulente reading the archive → DATI-15.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-14-rischio-giornaliero-e-sparkline.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi — qui C1 —, regole della serie)
- Leggi doc/guide/rendimenti.md, doc/guide/panoramica.md (anche § Composizione mobile),
  doc/guide/patrimonio.md (la tessera Patrimonio in comune), doc/guide/grafici.md,
  doc/guide/stati.md, doc/guide/prima-schermata.md, doc/guide/velocita.md,
  doc/guide/e2e-emulatori.md e doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Tocca la UI: leggi DESIGN.md (The First-Screen Rule, le colonne di tessere) e PRODUCT.md prima di
  disegnare
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

Implementa la spec così com'è scritta, nell'ordine: il rischio giornaliero con U1–U5, la sua frase e la
sua lettura (N1, N2), la tessera Rischio (D1) e la pagina Rendimenti, la sparkline — i punti (U6),
l'etichetta del giorno (D2), l'hook delle due pagine (D3–D5) e tutti i chiamanti del tipo —, poi E1 ed
E2, i budget, i documenti del § 9 e la riga 14 di doc/dati/README.md § 6 a `implemented`. OGNI test
del § 6 va visto rosso con la sua mutazione. Il codice del § 4.1, del § 4.2 e del § 4.3 è già scritto:
copialo.

Fermati e chiedimi se: DATI-02, DATI-03 o DATI-13 non sono in develop con i contratti dell'indice
(useDailySnapshots che restituisce DailySnapshotsResult, monotonePath, MIN_DAILY_POINTS), una prima
schermata fa una lettura in più, oppure una cifra mensile del rischio cambia.

Collaudo: § 7, la F al mio «pronto» (quando il mio archivio avrà i giorni). Un branch, un commit, solo
dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa. A commit in develop,
ricordami la PR develop → main (regola 13 dell'indice).
```

Model: **Opus 5.5**, effort **medium** — an M spec that adds a financial measure on three pages under the
performance and first-screen budgets. Estimated size: M (one new module, one new hook, two modules extended, five
components and three pages touched, 15 tests).
