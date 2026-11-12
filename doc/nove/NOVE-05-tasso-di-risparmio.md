# NOVE-05 — The savings rate: one rule, a floor, and euros below it

> Series `doc/nove/` (README.md § 5): **depends on nothing**; **NOVE-10 (Analisi) is implemented after it** and reads
> the contract `readSavings` (README.md § 7). Written on 2026-11-12; every `file:line` is cited on `develop` @
> b841cbd7. Executes the owner's point 2, decision 7 and the adopted choice (e) (README.md § 3-4).

## 1. The problem today (evidence on the code)

Early in a month, with a few euros of income already in and the month's spending started, the Panoramica reads «Hai
messo da parte il −7xx% delle entrate finora». Fourteen sites divide `(income − spending) / income` on their own;
every one guards `income > 0` and none has a floor: income 3 € and spending 500 € is −16.567% wherever it is printed.

| # | Site (file:line @ b841cbd7) | What it prints today |
| --- | --- | --- |
| 1 | `lib/utils/overviewNarrative.ts:91-104` `resolveLivedCashflow`, `:370-382` the clause, `:248-250` the headline | «Hai messo da parte il −16567% delle entrate finora (…)»; with NO income the whole clause and the calendar aside vanish and a growing month reads «sta andando bene» |
| 2 | `lib/utils/overviewSummary.ts:74-78` `verdictSavingsRate`, `:112-118` the strip cell «Messo da parte finora» | «−16567%» |
| 3 | `lib/utils/assistantNarrative.ts:291-309` `toNoContextVerdictInput` (own division at `:294`) | the same sentence as 1 |
| 4 | `components/dashboard/overview/CashflowTile.tsx:123-135`; `components/cashflow/tiles/CashflowKpiTrio.tsx:90-102` (Tracciamento and Analisi «Periodo») | caption «-16.566,7% · 0,01×», with the ASCII hyphen |
| 5 | `lib/utils/tracciamentoSummary.ts:447-495` `buildTrailingMonthFlows`, `:520-542` `summarizeSavingsHistory`; `lib/utils/cashflowNarrative.ts:570-604`, `:777-783` | «In media −1.372%; … il peggiore agosto (−16.567%)»: one closed month with a tiny income spoils twelve; the average is the unweighted mean of the monthly rates |
| 6 | `components/cashflow/tiles/RisparmioTile.tsx:40-131` `SavingsRateBars` (scale `:41-45`, no clamp) | one deep bar flattens the others |
| 7 | `lib/utils/analisiNarrative.ts:516-556` `describeFlow` | «; le spese superano le entrate del 16.566,7%» |
| 8 | `components/cashflow/SavingsRateTrendSection.tsx:131` (own division), `components/cashflow/SavingsRateLineChart.tsx:49` (`domain={['auto','auto']}`), `:68` (`ReferenceArea y1={-100}`) | a −700% point rescales the axis |
| 9 | `lib/utils/cashflowBlock.ts:312`, `:605`, `:636-638`, `:710-717`, `:740-763` (the type comment at `:93` says «0-100») | the in-progress month's row carries «-16.567%» to the Assistente, the Consulente and the two emails' AI comments |
| 10 | `components/pdf/sections/CashflowSection.tsx:49`, `:68` | «-16.566,7% di quanto è entrato» |
| 11 | `lib/utils/emailNarrative.ts:383-391` (the verdict's fallback branch) | «Hai messo da parte −600 €, il -30,0% di quanto è entrato.» — it contradicts the tile rule at `:547-570`, and is untested |
| 12 | `components/hall-of-fame/RecordRows.tsx:40-50`, `:129-134` | a deficit month prints «−600 €  30,0%»: the percentage loses its sign; with a tiny income «16.566,7%» |

Already safe, and the model for the cure: Tracciamento's verdict (`lib/utils/cashflowNarrative.ts:317-369`: «le spese
superano le entrate di −X €», «hai speso senza entrate»), the email's tile (`emailNarrative.ts:547-570`), the PDF's
reading (`lib/utils/pdfNarrative.ts:299-329`), the Assistente's period verdict (`assistantNarrative.ts:121-151`).

Why the owner sees it: the Panoramica verdict and strip judge the LIVED part of the month (the totals minus the
scheduled rows), while the Cashflow tile beside them judges the whole month, calendar included — which, the same
day, is a normal positive rate.

Not a savings rate, untouched: `savingsRateBadge.ts` (shown only ≥ 30%), Storico's labour coverage, FIRE, Budget,
Divisione, the landing's constant. Dead code: `lib/utils/cashflowTimeSeries.ts:314-348`
`computeTrailingSavingsRateAverage`, used only by its test.

## 2. Goal and acceptance criteria

One pure helper decides what can be said; below −100%, or with no income, the app speaks in euros.

The three cases every test names — **①** income 0, spending 500; **②** income 3, spending 500; **③** income 2.000,
spending 2.600 (−30%) — with a calendar of 1.500 € of spending and 2.600 € of income still to come where it applies.

1. `readSavings` returns `no-income` for ①, `deficit` (497) for ②, `rate` (−30) for ③, `none` for 0/0, and a rate of
   exactly −100 is still a `rate`. **Proof**: `__tests__/savingsRate.test.ts`.
2. Panoramica verdict: ① « Nessuna entrata finora, 500 € di spese; con il calendario (2600 € di entrate, 1500 € di
   spese) il mese chiude al 19%.» ② « Finora le spese superano le entrate di −497 €; con il calendario (…) il mese
   chiude al 19%.» ③ unchanged («Hai messo da parte il −30% delle entrate finora (…)»). **Proof**:
   `overviewNarrative.test.ts` V1-V3.
3. With nothing in calendar, ① and ② end at the first clause (no «con il calendario»). **Proof**: V4.
4. The headline with ① or ② follows the WHOLE month's reading: a growing month whose month closes positive reads
   «{Mese} è in crescita…»/«sta andando bene», never «…ma le spese superano le entrate»; when the whole month is
   itself a deficit the warning headline stays. **Proof**: V5-V6.
5. Strip cell «Messo da parte finora»: ① no value, reason «nessuna entrata finora»; ② «−497 €»; ③ «−30%»; the cell's
   text is contained in the verdict's sentence in every case (the identity of
   `__tests__/overviewSummary.test.ts:146-155`). **Proof**: S1-S3.
6. The Assistente's no-context verdict is the same sentence as the Panoramica for the same payload. **Proof**:
   `assistantNarrative.test.ts` A1.
7. The captions of `CashflowTile` and `CashflowKpiTrio` print «—» for the rate in ① and ②, keep the coverage
   («· 0,01×»), and print «−30,0%» with U+2212 in ③. **Proof**: `__tests__/CashflowKpiTrio.test.tsx`,
   `__tests__/CashflowTile.test.tsx` (RTL, new).
8. «Risparmio nel tempo»: a month that is not a `rate` is out of the average, of best and of worst, and still counts
   in the deficit footer; the average is weighted, Σ savings / Σ income over the closed months that are rates.
   **Proof**: `tracciamentoSummary.test.ts` H1-H3, `cashflowNarrative.test.ts` H4.
9. `SavingsRateBars` never draws below −100: a non-rate month with spending is a bar at the floor with the tooltip
   «{mese}: spese oltre le entrate, −497 €»; the other bars keep their height. **Proof**: `__tests__/RisparmioTile.test.tsx` (RTL, new).
10. The line chart's point is `null` for a non-rate month and its Y domain never goes below −100. **Proof**:
    `__tests__/savingsRateTrend.test.ts` on the extracted pure `buildSavingsRateTrendPoints`.
11. Analisi `describeFlow`: ② «; le spese superano le entrate di 497 €», ③ unchanged. **Proof**: `analisiNarrative.test.ts` F1.
12. The AI block prints «—» for a non-rate month and aggregate and carries one legend line; the type comment says
    the truth. **Proof**: `cashflowBlock.test.ts` B1-B2.
13. PDF note: «—» in ① and ②, U+2212 in ③. Email verdict fallback: a deficit reads «Sono usciti 600 € più di quanto
    è entrato.» **Proof**: `pdfNarrative.test.ts` P1 (the note moves to the narrative module), `emailNarrative.test.ts` E1.
14. Hall of Fame: a deficit month's percentage keeps its minus; below the floor no percentage. **Proof**:
    `__tests__/RecordRows.test.tsx` (RTL, new).
15. `grep -rnE "/ ?(income|totalIncome|inflows)\) ?\* ?100" lib components --include=*.ts --include=*.tsx` finds only
    `lib/utils/savingsRate.ts` and `lib/utils/savingsRateBadge.ts`. **Proof**: the command.
16. `npm run mobile:census` + `npm run mobile:budget` unchanged for Panoramica, Tracciamento and Analisi (the census
    fixture is a positive rate: no counted figure moves). **Proof**: the two runs.

## 3. Decisions

- **Owner 7 (2026-11-12)**: floor at −100% plus the calendar — without income or below the floor no percentage, euros;
  on the Panoramica the sentence adds how the month closes with the calendar; a true −30% stays.
- **Adopted, reversible**:
  - (e) the helper is `lib/utils/savingsRate.ts`, no imports, `SAVINGS_RATE_FLOOR = -100`; the average of «Risparmio
    nel tempo» is weighted by income;
  - the headline with a non-rate lived part follows the whole month (criterion 4);
  - the deficit figure in the Panoramica sentence carries the minus («di −497 €»), the convention Tracciamento's
    verdict already uses (`cashflowNarrative.ts:346-369`) and what keeps the strip's identity;
  - `savingsRateBadge.computeSavingsRate` keeps its own guard (it returns 0, is shown only ≥ 30% and is pinned by
    `savingsRateBadge.test.ts:18`); `computeTrailingSavingsRateAverage` and its test are deleted.
- **Not overturned**: the owner's «lived» decision (2026-09-19: verdict and strip judge what already happened). The
  calendar's closing is ADDED when the lived part cannot be judged; it never replaces a lived rate.

## 4. Solution

### `lib/utils/savingsRate.ts` (new, no imports) — the contract (README.md § 7)

```ts
/**
 * What can be said about «how much of the income was saved». A percentage of the income stops
 * being readable when the deficit is larger than the income itself (rate < −100%) or there is
 * no income at all: below that line the app speaks in euros (owner, 2026-11-12).
 */
export const SAVINGS_RATE_FLOOR = -100;

export type SavingsReading =
  | { kind: 'none' }
  | { kind: 'no-income'; spending: number }
  | { kind: 'deficit'; deficit: number; income: number; spending: number }
  | { kind: 'rate'; rate: number; savings: number; income: number; spending: number };

/** `income` and `spending` are magnitudes (≥ 0); a negative income counts as none. */
export function readSavings(income: number, spending: number): SavingsReading {
  const inflow = Math.max(income, 0);
  const outflow = Math.max(spending, 0);
  if (inflow === 0) return outflow === 0 ? { kind: 'none' } : { kind: 'no-income', spending: outflow };
  const savings = inflow - outflow;
  const rate = (savings / inflow) * 100;
  if (rate < SAVINGS_RATE_FLOOR) return { kind: 'deficit', deficit: -savings, income: inflow, spending: outflow };
  return { kind: 'rate', rate, savings, income: inflow, spending: outflow };
}

/** The rate when it can be printed as a percentage, else `null`. */
export function meaningfulSavingsRate(income: number, spending: number): number | null {
  const reading = readSavings(income, spending);
  return reading.kind === 'rate' ? reading.rate : null;
}

/** Σ savings / Σ income over the periods that are rates; `null` when none is. */
export function weightedSavingsRate(periods: readonly { income: number; spending: number }[]): number | null {
  let income = 0;
  let savings = 0;
  for (const period of periods) {
    const reading = readSavings(period.income, period.spending);
    if (reading.kind !== 'rate') continue;
    income += reading.income;
    savings += reading.savings;
  }
  return income > 0 ? (savings / income) * 100 : null;
}
```

### Panoramica — `lib/utils/overviewNarrative.ts`, `lib/utils/overviewSummary.ts`

- `LivedCashflow` gains `reading: SavingsReading` (= `readSavings(income, expenses − scheduledExpenses)` of the lived
  part) and `monthReading: SavingsReading` (= `readSavings(current.income, current.expenses)`, the whole month);
  `savingsRate` becomes `reading.kind === 'rate' ? reading.rate : null`.
- `monthSavingsRate` (`overviewSummary.ts:52-57`) returns `meaningfulSavingsRate(income, expenses)`.
- The clause (`overviewNarrative.ts:370-382`) becomes a function `describeSavedSoFar(input)`:

```ts
function describeSavedSoFar(rate: number | null, cashflow: LivedCashflow | null | undefined): Narrative {
  const reading = cashflow?.reading;
  if (reading?.kind === 'no-income' || reading?.kind === 'deficit') {
    const lead: Narrative = reading.kind === 'no-income'
      ? [prose(' Nessuna entrata finora, '), figure(cachedFormatCurrencyEUR(reading.spending, true)), prose(' di spese')]
      : [prose(' Finora le spese superano le entrate di '), figure(formatEuroMinus(-reading.deficit))];
    return [...lead, ...describeCalendarClosing(cashflow!)];
  }
  if (rate === null) return [];
  const rounded = Math.round(rate);
  return [
    prose(' Hai messo da parte il '),
    figure(`${rounded < 0 ? '−' : ''}${Math.abs(rounded)}%`),
    prose(cashflow ? ' delle entrate finora' : ' delle entrate'),
    ...describeCalendarAside(cashflow),
  ];
}

/** «; con il calendario (2600 € di entrate, 1500 € di spese) il mese chiude al 19%». Empty with nothing scheduled. */
function describeCalendarClosing(cashflow: LivedCashflow): Narrative {
  const expenses = cashflow.scheduledExpenses >= 1 ? cashflow.scheduledExpenses : 0;
  const income = cashflow.scheduledIncome >= 1 ? cashflow.scheduledIncome : 0;
  if (!expenses && !income) return [];
  const euro = (value: number) => figure(cachedFormatCurrencyEUR(value, true));
  const parts: Narrative = income && expenses
    ? [euro(income), prose(' di entrate, '), euro(expenses), prose(' di spese')]
    : income ? [euro(income), prose(' di entrate')] : [euro(expenses), prose(' di spese')];
  const month = cashflow.monthReading;
  const closing: Narrative = month.kind === 'rate'
    ? [prose(' il mese chiude al '), figure(`${Math.round(month.rate) < 0 ? '−' : ''}${Math.abs(Math.round(month.rate))}%`)]
    : month.kind === 'deficit' || month.kind === 'no-income'
      ? [prose(' il mese chiude a '), figure(formatEuroMinus(-(month.kind === 'deficit' ? month.deficit : month.spending)))]
      : [];
  return closing.length ? [prose('; con il calendario ('), ...parts, prose(')'), ...closing] : [];
}
```

  The sentence still ends with the full stop the builder appends today. `hasSavingsClause` becomes «the clause is
  non-empty» (the «il risparmio» subject of `overviewRestLabel` follows it).
- The headline (`resolveHeadline`, `:230-269`): the «spending exceeds income» test reads
  `input.cashflow && input.cashflow.reading.kind !== 'rate' ? isDeficit(input.cashflow.monthReading) :
  (input.savingsRate ?? 0) < 0`, with `isDeficit = (r) => r.kind === 'deficit' || r.kind === 'no-income' ||
  (r.kind === 'rate' && r.rate < 0)`.
- The strip cell (`overviewSummary.ts:112-118`): `verdictSavingsRate` returns the lived `reading` too; with
  `deficit` the cell is `{ value: -reading.deficit, format: 'signed-currency' }` — no `decimals`: `unsignedText`
  (`lib/utils/verdictStrip.ts:76-81`) then prints `cachedFormatCurrencyEUR(magnitude, true)`, the whole-euro form
  `formatEuroMinus` prints in the sentence, so cell and sentence carry the same text; with `no-income` it is `value: null`, `reason: 'nessuna entrata finora'` as today; with `rate`, today's cell.
- `app/dashboard/page.tsx:296-314` passes the same `cashflow` object: no new prop.

### Assistente — `lib/utils/assistantNarrative.ts:291-309`

`toNoContextVerdictInput` drops its own division (`:294`) and takes `monthSavingsRate`/`resolveLivedCashflow` from
the two modules above, so it feeds `buildOverviewVerdict` exactly what the Panoramica feeds it.

### Captions — `CashflowTile.tsx:123-135`, `CashflowKpiTrio.tsx:90-102`

Both read `savingsRate` already as `number | null`; their callers now pass `meaningfulSavingsRate(…)`
(`tracciamentoSummary.ts:116-126` `buildTotals` computes `savingsRate` through it; `coverageRatio` unchanged). The
caption prints the percentage as `withTypographicMinus(savingsRate, formatPercentage(Math.abs(savingsRate), 1))`
(`lib/utils/formatters.ts:58`: the value decides the sign, the second argument is the printed magnitude).

### «Risparmio nel tempo» — `tracciamentoSummary.ts`, `cashflowNarrative.ts`, `RisparmioTile.tsx`

- `buildTrailingMonthFlows` (`:491`): each month carries `reading: readSavings(income, spending)` and
  `savingsRate = reading.kind === 'rate' ? reading.rate : null`.
- `summarizeSavingsHistory` (`:520-542`): `average = weightedSavingsRate(closedMonths)`; best and worst over the
  closed months whose reading is a rate; `deficitMonths` counts the closed months with a rate < 0 OR a `deficit` /
  `no-income` reading (a month that spent without earning is a deficit month).
- `describeSavingsHistory` and `describeSavingsHistoryAnswer` are unchanged in grammar (they print `historyRate` of
  values that are now all ≥ −100).
- `SavingsRateBars` (`RisparmioTile.tsx:40-131`): `bottom = Math.max(Math.min(...rates, 0), SAVINGS_RATE_FLOOR)`;
  a month whose reading is `deficit` or `no-income` is drawn as a bar from 0 to the floor in `var(--destructive)` at
  40% opacity; its `aria-label`/tooltip is `` `${month}: spese oltre le entrate, ${formatEuroMinus(-gap)}` ``
  (gap = `deficit` or `spending`), the sentence built in `cashflowNarrative.ts` as `describeSavingsBar(reading, month)`.

### Analisi

- `describeFlow` (`analisiNarrative.ts:516-556`) takes the period's `SavingsReading` instead of the bare rate
  (caller `components/cashflow/AnalisiTab.tsx:980`, `readSavings(totals.income, totals.expenses)`): `deficit` →
  «; le spese superano le entrate di {497 €}»; `rate` < 0 → today's «del 30,0%»; the other branches unchanged.
- `SavingsRateTrendSection.tsx:131`: the inline division moves to a pure
  `buildSavingsRateTrendPoints(months)` in `lib/utils/analisiSummary.ts` (point `null` unless the reading is a
  rate); `SavingsRateLineChart.tsx:49` → `domain={[(min: number) => Math.max(Math.floor(min), SAVINGS_RATE_FLOOR), 'auto']}`.

### AI block — `lib/utils/cashflowBlock.ts`

`:312` and `:605` go through `meaningfulSavingsRate`; `pct` (`:636-638`) prints `withTypographicMinus(value, magnitude)` on the absolute value; the «—» legend
line of `formatSavings` (`:710-717`) becomes «(tasso —: entrate nulle, oppure spese oltre il doppio delle entrate)»
and is printed once under the series (`formatSeries`, `:740-763`) when any row is «—»; the comment at `:93` reads
«percent, ≥ −100, `null` when not a rate».

### PDF, email, Hall of Fame

- `CashflowSection.tsx:49,68`: the note's text moves to `pdfNarrative.ts` as `describeNetSavingsNote(income,
  spending)` → `null` (no note) unless a rate; printed with `withTypographicMinus(rate, …)` on the magnitude.
- `emailNarrative.ts:383-391`: the fallback branch calls the tile's own `describeCashflowTile` sentence builder for
  the savings clause, so a deficit reads «Sono usciti X € più di quanto è entrato.»
- `hallOfFameSummary.ts:241-244` `valueOf` (savings share): `meaningfulSavingsRate`; `RecordRows.tsx:40-50,129-134`:
  the savings percentage is printed signed (`withTypographicMinus(rate, magnitude)`), not as the bare magnitude.

### Deleted

`computeTrailingSavingsRateAverage` (`lib/utils/cashflowTimeSeries.ts:314-348`) and its cases in
`__tests__/cashflowTimeSeries.test.ts:254-278`.

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **A narrative module the server reads imports from `formatters`, never from `chartService`** (AGENTS.md § server
  modules): here it means `savingsRate.ts` has NO import, and `cashflowBlock.ts`, `emailNarrative.ts`,
  `pdfNarrative.ts` keep their import lists.
- **The Comma Rule / typographic minus**: every negative figure prints U+2212 (`withTypographicMinus`); the
  captions' ASCII hyphen is part of the defect.
- **The strip's identity** (doc/guide/panoramica.md § Composizione mobile): the cell's text must be a substring of
  the verdict's sentence — the cell and `describeSavedSoFar` change together, and both round once.
- **The First-Screen budget**: a reason longer than nine characters is a wide cell (`WIDE_CELL_CHARS`,
  `components/ui/verdict-strip.tsx:29`): «nessuna entrata finora» already is one today; «−497 €» is not.
- **The system prompt is byte-identical for every user**: the block's legend is user content
  (`formatCashflowBlockSection`), not system text; `expect(a.system).toBe(b.system)` stays green.
- **Sentences live in narrative modules**; the three RTL tests assert on rendered text, not on class names.
- **Timezones**: every fixture date at noon; the «in progress» month is decided by `getItalyDateIso`.
- **The tests that pin a negative percentage stay green** (`overviewSummary.test.ts:155` −12%,
  `overviewNarrative.test.ts:68,397`, `analisiNarrative.test.ts:442`, `cashflowNarrative.test.ts:499,509,730`): all
  are rates above the floor.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| R1 | `savingsRate.test.ts`: the five readings of criterion 1; −100 exactly is a rate; a negative income is none | `rate <= SAVINGS_RATE_FLOOR` |
| R2 | `weightedSavingsRate`: months (1.000/500), (3/500), (2.000/1.000) → 50% (the middle one ignored) | average of the rates |
| V1-V4 | `overviewNarrative.test.ts`: the four sentences of criteria 2-3, text joined from the `Narrative` | drop the `no-income`/`deficit` branch |
| V5-V6 | headline with ② and a positive whole month is not the warning; with a deficit whole month it is | read `input.savingsRate` only |
| S1-S3 | `overviewSummary.test.ts`: the three cells and the identity (cell text ⊂ sentence) | `format: 'percent'` for the deficit |
| A1 | `assistantNarrative.test.ts`: same payload → same sentence as `buildOverviewVerdict` on the Panoramica's input | keep the own division |
| K1-K2 | `CashflowKpiTrio.test.tsx`, `CashflowTile.test.tsx` (RTL): «—» and «0,01×» in ②, «−30,0%» in ③ | pass the raw rate |
| H1-H4 | history: excluded from average/best/worst, counted in the footer, weighted average, the sentence | `average = mean(rates)` |
| T1 | `RisparmioTile.test.tsx`: no bar's `y + height` beyond the floor's y; the deficit bar's label | remove the clamp |
| L1 | `savingsRateTrend.test.ts`: `null` point for ②, value for ③ | map every month to a number |
| F1 | `analisiNarrative.test.ts`: `describeFlow` with ② and ③ | print `Math.abs(rate)` always |
| B1-B2 | `cashflowBlock.test.ts`: «—» and the legend once; no legend when every row is a rate | drop `meaningfulSavingsRate` |
| P1, E1 | `pdfNarrative.test.ts` the note; `emailNarrative.test.ts` the fallback's deficit sentence | restore the percentage |
| HF1 | `RecordRows.test.tsx`: «−600 €» with «−30,0%»; no percentage below the floor | `Math.abs` |

Playwright: `e2e/overview.mobile.spec.ts`, `e2e/mobile-composition.cashflow.mobile.spec.ts`, `e2e/analisi*.spec.ts`
stay green untouched (positive fixtures). One new test in `e2e/overview.spec.ts`: an account planted with income 3 €
and spending 500 € dated today plus one scheduled salary → the verdict contains «Finora le spese superano le entrate
di −497 €» and no «%» follows «messo da parte» (data-only planting, doc/guide/e2e-playwright.md).

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: an emulator account on the 3rd of the month with 3 € in, 500 € out and a salary in
calendar reads the sentence of criterion 2 ②, the strip «−497 €», the Cashflow tile's whole-month rate as today;
Tracciamento's «Risparmio nel tempo» with one planted 3 €-income month shows a normal scale and a floor bar.

- **A**: `tsc`, lint, Vitest (three zones), the Playwright specs of overview, cashflow, analisi; criterion 15's grep.
- **B**: emulators + seed + the planted rows (decoys «ornitorinco», «fenicottero» as notes).
- **C (browser, the session)**: Panoramica, Assistente (no call: the verdict only), Tracciamento, Analisi at 390 and
  1440; the PDF export of the running month.
- **D (data)**: the overview payload (`/api/dashboard/overview`) carries the same `incomeScheduled` the sentence used.
- **E**: an account with no rows at all → no clause, no strip cell value, as today.
- **F (owner, at his «pronto»)**: the mirror on a day early in the month, or his production account after the deploy.
- **G**: `mobile:census` + `mobile:budget`; remove fixtures and mirror.

## 8. Putting it into service

One PR to `develop`. No data change. The overview payload is unchanged (the readings are derived client-side from
fields it already carries), so `DASHBOARD_OVERVIEW_SOURCE_VERSION` does not move.

## 9. Documentation

- `AGENTS.md`: one repo-wide rule — «a savings rate goes through `readSavings` (`lib/utils/savingsRate.ts`): below
  −100% or without income the app speaks in euros (2026-11-12; pinned by `savingsRate.test.ts`, criterion 15's grep)».
- `doc/guide/panoramica.md` (§ the verdict, § Composizione mobile: the cell's three forms), `cashflow-tracciamento.md`
  (the weighted average, the floor bar), `cashflow-analisi.md`, `assistente.md`, `email-pdf.md`, `hall-of-fame.md`:
  one bullet each, with the date.
- `DESIGN.md`: nothing (no rule changes; The Absence-Has-Three-Names Rule already covers «nessuna entrata»).
- `CLAUDE.md` › «Latest», `Draft Release Temp.md` (Panoramica, Tracciamento entries rewritten), `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **The Analisi «Periodo» tile's place and form**: heir NOVE-10.
- **The savings ring** (deleted on 2026-08-31) does not come back with the donuts: heir none — NOVE-08's rule
  forbids a ring for a signed quantity.
- **A fee row's effect on the rate**: heir NOVE-07.
- **The badge** keeps its rule: declared, no heir.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-05-tasso-di-risparmio.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-05-tasso-di-risparmio.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/panoramica.md, cashflow.md, cashflow-tracciamento.md, cashflow-analisi.md,
  assistente.md, email-pdf.md, hall-of-fame.md, prima-schermata.md PRIMA di scrivere codice
- Leggi DESIGN.md (The Comma Rule, The Binding-Clause Rule, The First-Screen Rule,
  The Absence-Has-Three-Names Rule) e PRODUCT.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Lancia npm audit e confrontalo con doc/guide/dipendenze.md (regola 8 di WORKFLOW.md).
Rispondimi in una riga: invariate dal <data>, oppure gli avvisi nuovi; quelli nuovi li
registriamo nella guida con una decisione, non si aggiorna nulla in questa sessione.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: savingsRate.ts con i suoi test; la
Panoramica (frase, titolo, cella della striscia) e l'Assistente; le didascalie; «Risparmio
nel tempo»; Analisi; il blocco AI; PDF, email, Hall of Fame; la cancellazione del codice
morto. I test PRIMA del codice, ciascuno visto rosso con la sua mutazione; cifre inventate
e tonde. Nessun controllo che spende: l'Assistente si guarda senza inviare. Fermati e
chiedimi se: un test che fissa una percentuale negativa sopra la soglia diventa rosso;
mobile:budget si muove su una superficie; il grep del criterio 15 trova un quindicesimo
sito. Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il
riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec with a shared contract (`readSavings`) read by twelve sites in
seven areas. Estimated size: 1 session, ~5 h; ~60 lines pure, ~250 across the sites, ~500 of tests, one E2E test.
