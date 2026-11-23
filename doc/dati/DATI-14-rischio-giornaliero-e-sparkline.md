# DATI-14 — The daily archive read by Rendimenti (risk on the days) and by Panoramica (the sparkline's short periods)

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-02 (contract C1: `useDailySnapshots`,
> `DailyPoint`) and DATI-03 (`monotonePath`, `TILE_COLUMN_END_CLASS`). Independent of DATI-12/13.
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276. Owner's point 5; decision 11 (the uses of the daily
> archive: Rendimenti's volatility and drawdown, Panoramica's sparkline).

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
   deepest daily fall from a peak with its date, over the last 365 days of archive, once it holds 60 daily returns;
   before that, one line says how many days there are and how many it takes. The monthly figures, the Sharpe and
   the Sortino do not change. Proof: U1–U5, D1.
2. A daily return is the move of the instruments HELD on both days, at yesterday's weights — a purchase, a sale, a
   salary do not move it. Weekends are left out; a gap longer than four days breaks the chain. Proof: U1, U2.
3. On Panoramica the sparkline's «3M» period is drawn on the daily net worth when the archive holds at least 20
   points in the period; otherwise, and on every other period, it is today's monthly line. The hover reads a day
   («12 nov») on a daily line. Proof: U6, D2, D3.
4. The daily read happens on Panoramica only when «3M» is chosen. Proof: D4.
5. A failed daily read leaves both pages as they are today (monthly figures, monthly line) — no error state for the
   page. Proof: D5.
6. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1 green;
   `perf:budget` `/dashboard` and `/dashboard/performance` within 1 KB gz of `develop`; `mobile:census` and
   `mobile:budget` green (Panoramica's default period is «1A»: the first screen makes no daily read).

## 3. Decisions

- **Decision 11** (owner, 2026-11-23): the daily archive feeds Patrimonio › Andamento, the Assistente and the
  Consulente, Rendimenti's volatility and drawdown, Panoramica's sparkline.
- **Decision 28** (owner, 2026-11-23): no backfill — the readings turn on by themselves as the days accumulate.
- Adopted, reversible:
  - (a) the daily risk is ADDED beside the monthly one; the monthly volatility stays the input of the Sharpe and the
    Sortino (changing it would move four figures and their stories at once).
  - (b) 60 daily returns to show the figures (about three months of trading days); annualised by √252.
  - (c) the daily return is holdings-based (prices on yesterday's holdings), not a time-weighted return on the net
    worth: it needs no cashflow adjustment and cannot be bent by a transfer.
  - (d) the daily sparkline on «3M» only: «6M» and longer read well on months.
  - (e) holidays stay in the series as days with no move (the archive does not know a market calendar).

## 4. Solution

### 4.1 The daily risk — `lib/utils/dailyRisk.ts` (new, written here)

```ts
/**
 * Risk measured on the days of the daily archive (2026-11-23): what the monthly figures cannot
 * see — a fall and a recovery inside one month.
 *
 * A day's return is the move of the instruments held on BOTH days, weighted by what each was worth
 * the day before: prices on yesterday's holdings. A purchase, a sale or a salary change the holdings
 * of the NEXT pair, never the return. Weekends are skipped (no price moves and they would thin the
 * figure); a gap longer than four days is a hole in the archive, not a return.
 * Pure: the points come in ascending, as `useDailySnapshots` returns them.
 */
import type { DailyPoint } from '@/lib/utils/dailySnapshot';

export const DAILY_RISK_MIN_RETURNS = 60;
export const TRADING_DAYS_PER_YEAR = 252;
export const DAILY_GAP_MAX_DAYS = 4;

export interface DailyReturn {
  /** The day the return ends on. */
  iso: string;
  pct: number;
}

const noon = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
const isWeekend = (iso: string) => {
  const day = new Date(noon(iso)).getUTCDay();
  return day === 0 || day === 6;
};

export function dailyReturns(points: readonly DailyPoint[]): DailyReturn[] {
  const trading = points.filter((point) => !isWeekend(point.iso));
  const returns: DailyReturn[] = [];
  for (let index = 1; index < trading.length; index++) {
    const previous = trading[index - 1];
    const current = trading[index];
    if (Math.round((noon(current.iso) - noon(previous.iso)) / 86_400_000) > DAILY_GAP_MAX_DAYS) continue;
    let base = 0;
    let moved = 0;
    for (const [assetId, before] of Object.entries(previous.assets)) {
      const after = current.assets[assetId];
      if (!after || !(before.q > 0) || !(after.q > 0) || before.v === 0) continue;
      base += before.v;
      moved += before.v * (after.v / after.q / (before.v / before.q) - 1);
    }
    if (base > 0) returns.push({ iso: current.iso, pct: (moved / base) * 100 });
  }
  return returns;
}

export interface DailyRisk {
  /** How many daily returns the archive gives. */
  returns: number;
  fromIso: string | null;
  toIso: string | null;
  /** Annualised, in percent; null under `DAILY_RISK_MIN_RETURNS`. */
  volatility: number | null;
  /** The deepest fall from a peak, a negative percent; null when it never fell or is not measured. */
  maxDrawdown: number | null;
  troughIso: string | null;
  /** Today against the latest peak: 0 at a peak, negative below it; null when not measured. */
  currentDrawdown: number | null;
}

export function computeDailyRisk(points: readonly DailyPoint[]): DailyRisk {
  const returns = dailyReturns(points);
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

- `lib/utils/performanceNarrative.ts`: `describeDailyRisk(risk: DailyRisk): Narrative`
  - `returns < DAILY_RISK_MIN_RETURNS` → prose «Il rischio sui giorni si accende con {DAILY_RISK_MIN_RETURNS}
    giornate di archivio: oggi sono {returns}.» (zero: «…: l'archivio giornaliero non ha ancora giornate.»);
  - else → prose «Sui giorni la volatilità è », figure `{x,x%}`, prose « annua»; then, with a drawdown, prose « e la
    caduta più profonda da un massimo », figure `{−y,y%}`, prose ` (il {d MMM yyyy})`; with `currentDrawdown < −0,05`
    a last sentence prose « Oggi sei a », figure `{−z,z%}`, prose « dal massimo.»; never fell → « e non è mai scesa
    sotto un massimo».
- `components/performance/RischioTile.tsx`: a new optional prop `daily?: Narrative | null`; when present it renders
  under the existing reading as a sub-block — the eyebrow «Sui giorni» (`TILE_SUB_EYEBROW_CLASS`) and
  `NarrativeText` — inside the tile's body, before its method note; the method note gains «Sui giorni: mosse degli
  strumenti posseduti il giorno prima, fine settimana esclusi, annualizzate su 252 sedute.»
- `app/dashboard/performance/page.tsx` (`:1019-1029`): `const daily = useDailySnapshots(ownerId ?? undefined, 365);`
  `daily={daily.data ? describeDailyRisk(computeDailyRisk(daily.data)) : null}` — while loading or on error the prop
  is null and the tile is today's. The page's gate (doc/guide/stati.md) does NOT include this query.

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
export const SPARKLINE_DAILY_MIN_POINTS = 20;

/** The daily net worth as sparkline points, when there are enough to draw a line that says more than four months. */
export function dailySparkline(points: ReadonlyArray<{ iso: string; netWorth: number }>): SparklinePoint[] | null {
  if (points.length < SPARKLINE_DAILY_MIN_POINTS) return null;
  return points.map((point) => ({ totalNetWorth: point.netWorth, label: point.iso }));
}

export function monthlySparkline(data: DashboardOverviewSparklinePoint[]): SparklinePoint[] {
  return data.map((point) => ({ totalNetWorth: point.totalNetWorth, label: `${point.year}-${String(point.month).padStart(2, '0')}` }));
}
```

  `filterSparklineByPeriod` is unchanged.
- `app/dashboard/page.tsx` (`:232`, `:273-276`): `const daily = useDailySnapshots(sparklinePeriod ===
  SPARKLINE_DAILY_PERIOD ? (ownerId ?? undefined) : undefined, SPARKLINE_DAILY_DAYS);` and
  `sparklineDisplay = (sparklinePeriod === SPARKLINE_DAILY_PERIOD && daily.data ? dailySparkline(daily.data) : null)
  ?? monthlySparkline(filterSparklineByPeriod(overview.sparklineData, sparklinePeriod))`. While the daily read loads
  the monthly line is shown and is replaced when the points arrive (no skeleton, no layout shift: same height).
- `components/dashboard/NetWorthSparkline.tsx`: `data: SparklinePoint[]`; the hover's label formats `label` by its
  length — 7 characters → the month («nov 2026», today's format), 10 → the day («12 nov»). Nothing else changes
  (the curve is DATI-03's `monotonePath`, which holds for any number of points).
- The demo account and a co-owner: `ownerId` is the active account's, as every other read of the page.

## 5. Constraints and traps

- **C1 is used IDENTICAL**: `useDailySnapshots(ownerId | undefined, days)` reads nothing without an owner — that is
  the only gate used (no new option on the hook).
- **The First-Screen Rule / `mobile:budget`**: Panoramica's first screen makes no daily read because the default
  period is «1A» (`page.tsx:232`); D4 holds it, the census confirms it.
- **A page gates on every query it reads** (doc/guide/stati.md) — EXCEPT an additive reading that has its own
  fallback: both daily reads are declared here as additive, and the guides say so.
- **`TZ`**: the weekend test parses the ISO day at noon UTC — a day's weekday is the same in every zone; U3 runs
  under both.
- **Tile columns end on one line** (DATI-03): the «Rischio» tile grows by one block; its column is the one with
  `TILE_COLUMN_END_CLASS` on its last cell.
- **The monthly risk figures are shared contracts** (the email, the PDF, «Analizza con AI» read
  `metrics.volatility`): untouched.
- **React Compiler on**: `sparklineDisplay`'s `useMemo` (`:273`) may stay or go; correctness must not depend on it.
- **No owner data**: fixtures are two instruments at 100 and 50 with round moves.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/dailyRisk.test.ts` | two instruments worth 600 and 400; the first +1% → the day's return +0,6%; a purchase that doubles the first's quantity at the same price → 0% | net worth ratio in place of holdings |
| U2 | unit · same | an instrument bought today (absent yesterday) and one sold today (absent today) do not enter the day's return | include with a zero base |
| U3 | unit · same | Saturday and Sunday points are skipped: Friday → Monday is one return; a gap of five days gives none; the same under `TZ=UTC` and `Europe/Rome` | keep the weekends |
| U4 | unit · same | 59 returns → every figure null and `returns: 59`; 60 → a volatility; alternating ±1% → about 15,9% annual (`1,0 × √252`, sample deviation) | √12 |
| U5 | unit · same | +10%, −20%, +5%: deepest fall −20% on the second day, today −16%; a series that only rises → `maxDrawdown: null`, `currentDrawdown: 0` | fall measured from the first level |
| U6 | unit · `__tests__/sparklinePeriod.test.ts` | 19 daily points → null (monthly line), 20 → the daily points with day labels; monthly labels are `YYYY-MM` | threshold off by one |
| N1 | unit · `__tests__/performanceNarrative.test.ts` | the four sentences of `describeDailyRisk`: not enough days (with the count), no archive, figures with a drawdown, never fell | figures under the minimum |
| D1 | dom · `__tests__/rischioTile.test.tsx` | with `daily` the tile shows «Sui giorni» and the sentence; without it the tile's HTML is today's | always render the block |
| D2 | dom · `__tests__/netWorthSparkline.test.tsx` | a daily point's hover reads «12 nov», a monthly one «nov 2026» | one format |
| D3 | dom · `__tests__/dashboardSparkline.test.tsx` (new) | «3M» with 25 daily points draws 25 points; with 5 it draws the monthly ones | daily under the minimum |
| D4 | dom · same | on «1A» the daily service is never called; switching to «3M» calls it once | always read |
| D5 | dom · same, `__tests__/rischioTile.test.tsx` | the daily read rejecting leaves the monthly line and no «Sui giorni» block; the page shows no error | fail the page |
| E1 | e2e · `e2e/performance.spec.ts`, `e2e/dashboard.spec.ts` | with 70 planted weekdays: Rendimenti › Rischio shows «Sui giorni» with a percent; Panoramica on «3M» has more than 20 points in the sparkline's path | — |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: with 70 weekdays planted in the archive (one instrument moving ±1% a day) the
«Rischio» tile reads «Sui giorni la volatilità è 15,9% annua…» under its monthly sentence; with 10 it reads «…si
accende con 60 giornate di archivio: oggi sono 9»; Panoramica on «3M» draws a daily line whose hover names days, on
«1A» the monthly one.

- A — the diff. B–E by a throwaway Playwright script on the emulators at 1440 and 390, light and dark: B Rendimenti
  with 70 days; C with 10 and with none; D Panoramica «3M» with 70 and with 10 days, then «1A» (the network panel:
  no `dailySnapshots` read); E the daily read denied (a decoy account without the rule's access) → both pages as
  today. Decoys: «ornitorinco» (a weekend row with a wild price: it must not move the volatility) and «fenicottero»
  (a purchase on a flat day: the return stays 0).
- F — at the owner's «pronto», on the mirror, once his archive holds the days: the two readings on his data.

## 8. Putting it into service

No rules, no index. Both readings stay off until the archive of DATI-02 has the days: «Sui giorni» says so in
words; the sparkline simply stays monthly. Measures: `perf:budget` (`/dashboard`, `/dashboard/performance`),
`mobile:census` + `mobile:budget`.

## 9. Documentation

- `doc/guide/rendimenti.md` — § «Risk on the days» (the holdings-based return and why, the weekend rule, the
  minimum, √252, why it is beside and not instead of the monthly figures); § blind spots: holidays count as flat
  days; the daily figure covers the instruments, a cash account weighs as a flat holding; it differs from the
  monthly volatility by construction.
- `doc/guide/panoramica.md` — the «3M» daily line, the additive read; § blind spots: below 20 days «3M» is monthly.
- `doc/guide/stati.md` — one sentence: an additive reading with its own fallback is not part of the page's gate.
- `README.md` — the two feature lines. `Draft Release Temp.md` — «Rendimenti: volatilità e caduta massima misurate
  anche sui giorni», «Panoramica: la linea a 3 mesi è giornaliera».
- `CLAUDE.md` — Rendimenti and Panoramica lines, a clause each, under 20.000 characters.
- `doc/dati/README.md` § 6.

## 10. Declared out of scope

- A Sharpe and a Sortino on the daily returns → doc/guide/rendimenti.md § blind spots (they need a daily risk-free
  rate and a longer history).
- The daily underwater chart → doc/guide/rendimenti.md § blind spots.
- A market calendar for holidays → doc/guide/rendimenti.md § blind spots.
- Daily points on «6M» and longer → doc/guide/panoramica.md § blind spots.
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
  condivisi — qui C1, da usare IDENTICO —, regole della serie)
- Leggi doc/guide/rendimenti.md, doc/guide/panoramica.md (anche § Composizione mobile),
  doc/guide/stati.md, doc/guide/prima-schermata.md e doc/guide/e2e-playwright.md PRIMA di scrivere
  codice in quei domini
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

Implementa la spec così com'è scritta, nell'ordine: il rischio giornaliero con U1–U5 (ognuno visto
rosso con la sua mutazione), la sua frase (N1) e la tessera Rischio (D1, D5), la sparkline — i punti
(U6), l'etichetta del giorno (D2), la pagina (D3, D4) —, poi E1 e i budget. Il codice del § 4.1 e del
§ 4.3 è già scritto: copialo.

Fermati e chiedimi se: DATI-02 non è in develop con il contratto C1 dell'indice, la prima schermata
di Panoramica fa una lettura in più, oppure una cifra mensile del rischio cambia.

Collaudo: § 7, la F al mio «pronto» (quando il mio archivio avrà i giorni). Un branch, un commit, solo
dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an M spec that adds a financial measure on two pages under the
performance and first-screen budgets. Estimated size: M (one new module, one extended, three components touched,
~14 tests).
