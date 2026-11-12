# NOVE-05 — The savings rate: one rule, a floor, and euros below it

> Series `doc/nove/` (README.md § 5): **depends on nothing**; **NOVE-10 (Analisi) is implemented after it** and reads
> the contract `readSavings` (README.md § 7). Written on 2026-11-12; every `file:line` is cited on `develop` @
> b841cbd7. Executes the owner's point 2, decision 7 and the adopted choices (e) and (x) (README.md § 3-4).

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
| 11 | `lib/utils/emailNarrative.ts:383-391` (the verdict's fallback branch) | «Hai messo da parte −600 €, il -30,0% di quanto è entrato.» — it contradicts the tile rule at `:547-570`; only its surplus branch is tested (`emailNarrative.test.ts:164`) |
| 12 | `components/hall-of-fame/RecordRows.tsx:40-50`, `:129-134` | a deficit month prints «−600 €  30,0%»: the percentage loses its sign; with a tiny income «16.566,7%» |

Already safe in what they print, and the model for the cure: Tracciamento's verdict
(`lib/utils/cashflowNarrative.ts:317-369`: «le spese superano le entrate di X €», the magnitude; «hai speso senza
entrate» — it reads `savingsRate === null` as «no income», so § 4 moves it onto the totals), the email's tile (`emailNarrative.ts:547-570`), the PDF's
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
   spese) il mese chiude al 23%.» ② « Finora hai messo da parte −497 €: le spese superano le entrate; con il calendario (2600 € di
   entrate, 1500 € di spese) il mese chiude al 23%.» (whole month: 2.600 or 2.603 in, 2.000 out) ③ unchanged («Hai messo da parte il −30% delle entrate finora (…)»). **Proof**:
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
7. The captions of `CashflowTile` and `CashflowKpiTrio` print «—» for the rate in ① and ②; the coverage is
   unchanged («· 0,00×» on `CashflowTile` and none on `CashflowKpiTrio` in ①, «· 0,01×» on both in ②); «−30,0%»
   with U+2212 in ③ (a whole month of −30% for `CashflowTile`). The tile's reading «Speso più di quanto è
   entrato.» stays in ② and ③. **Proof**: `__tests__/cashflowKpiTrio.test.tsx`,
   `__tests__/cashflowTile.test.tsx` (RTL, new).
8. «Risparmio nel tempo»: a month that is not a `rate` is out of the average, of best and of worst, and still counts
   in the deficit footer; the average is weighted, Σ savings / Σ income over the closed months that are rates. A
   month after today's is not closed: out of every ranking and of the footer, no bar. **Proof**:
   `tracciamentoSummary.test.ts` H1-H3 and H5, `cashflowNarrative.test.ts` H4.
9. `SavingsRateBars` never draws outside its plot: a closed or running non-rate month with spending is a bar from
   0 to the floor, the floor on the plot's bottom edge, with the text «{mese}: spese oltre le entrate, −497 €» in its
   `<title>`, in the SVG's `aria-label` and in the hover tip; the other bars keep their sign and proportion. **Proof**: `__tests__/risparmioTile.test.tsx` (RTL, new).
10. The line chart's point is `null` for a non-rate month and its Y domain never goes below −100. **Proof**:
    `__tests__/savingsRateTrend.test.ts` on the extracted pure `buildSavingsRateTrendPoints`.
11. Analisi `describeFlow`: ② «; le spese superano le entrate di 497 €», ③ unchanged. **Proof**: `analisiNarrative.test.ts` F1.
12. The AI block prints «—» for a non-rate month and aggregate and carries one legend line; the type comment says
    the truth. **Proof**: `cashflowBlock.test.ts` B1-B2.
13. PDF «Risparmio netto»: no note in ① and ② (`describeNetSavingsNote` returns `null`), «−30,0% di quanto è
    entrato» with U+2212 in ③. Email verdict fallback: a deficit reads « Sono usciti 600 € più di quanto è
    entrato.», a surplus keeps today's clause. **Proof**: `pdfNarrative.test.ts` P1 (the note moves to the narrative module), `emailNarrative.test.ts` E1.
14. Hall of Fame: a deficit month's percentage keeps its minus, in the record rows and in the Dettaglio table;
    below the floor no percentage. **Proof**: `__tests__/recordRows.test.tsx` (RTL, new).
15. `grep -rnE "/ ?\(?[A-Za-z_.]*([Ii]ncome|[Ii]nflows?)\)? ?\* ?100" lib components app --include=*.ts --include=*.tsx`
    prints exactly: `lib/utils/savingsRate.ts` (two lines), `lib/utils/savingsRateBadge.ts` (one),
    `lib/utils/landingSampleData.ts` (the sample's income delta and `SAMPLE_SAVINGS_RATE`),
    `lib/services/dashboardOverviewService.ts` (the income delta) and `lib/utils/whatIfSummary.ts`
    (`lostShareOfIncomePct`) — the last three are not savings rates of recorded data. Today it prints nineteen
    lines. **Proof**: the command.
16. `npm run mobile:census` + `npm run mobile:budget` unchanged for Panoramica, Tracciamento and Analisi (the census
    fixture is a positive rate: no counted figure moves). **Proof**: the two runs.
17. `npm run perf:budget` stays within the ceilings of `/`, `/dashboard` (627,2 of 628 KB gz today),
    `/dashboard/cashflow`, `/dashboard/hall-of-fame` and `/dashboard/assistant`. **Proof**: the run.

## 3. Decisions

- **Owner 7 (2026-11-12)**: floor at −100% plus the calendar — without income or below the floor no percentage, euros;
  on the Panoramica the sentence adds how the month closes with the calendar; a true −30% stays.
- **Adopted, reversible**:
  - (e) the helper is `lib/utils/savingsRate.ts`, no imports, `SAVINGS_RATE_FLOOR = -100`; the average of «Risparmio
    nel tempo» is weighted by income;
  - the headline with a non-rate lived part follows the whole month (criterion 4);
- **Owner 41 (2026-11-12)**: on the Panoramica a deficit so far is said as a saving with its sign — «Finora hai
  messo da parte −497 €: le spese superano le entrate» — the same signed figure as the strip's cell «Messo da parte
  finora» (the strip's identity holds); «le spese superano le entrate di 497 €», unsigned, stays the form of
  Tracciamento and Analisi.
- **Adopted, reversible (continued)**:
  - `measuredCount` keeps today's meaning (closed months with income > 0) for every sentence that says «con
    entrate»; a new `rankedCount` (closed months that are rates) feeds the average, best, worst and the «Un solo
    mese» branch;
  - a month after today's is not judged (the «lived» rule of 2026-09-19): out of average, best, worst and deficits,
    and without a bar, as today;
  - the floor bar is a FULL `var(--destructive)` fill: DESIGN.md reserves the reduced fill for a window still
    running, and a closed deficit is not one;
  - the calendar's closing is said only when the lived part is not a rate (① and ②); the email's fallback follows
    the email's tile (euros only for a deficit);
  - the two divisions that already print safely (`resolveSavingsRate` in `assistantNarrative.ts`,
    `describeCashflowTile`'s surplus branch in `emailNarrative.ts`) read `meaningfulSavingsRate` too: nothing
    they print changes (both branch on the sign first) and criterion 15's command can be exact;
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
- The clause (`overviewNarrative.ts:370-382`) becomes a function, called as
  `describeSavedSoFar(input.savingsRate, input.cashflow)`:

```ts
function describeSavedSoFar(rate: number | null, cashflow: LivedCashflow | null | undefined): Narrative {
  const reading = cashflow?.reading;
  if (reading?.kind === 'no-income' || reading?.kind === 'deficit') {
    const lead: Narrative = reading.kind === 'no-income'
      ? [prose(' Nessuna entrata finora, '), figure(cachedFormatCurrencyEUR(reading.spending, true)), prose(' di spese')]
      : [prose(' Finora hai messo da parte '), figure(formatEuroMinus(-reading.deficit)),
         prose(': le spese superano le entrate')];
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

/** «; con il calendario (2600 € di entrate, 1500 € di spese) il mese chiude al 23%». Empty with nothing scheduled. */
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
  `const lived = input.cashflow?.reading; lived && (lived.kind === 'no-income' || lived.kind === 'deficit') ?
  isDeficit(input.cashflow!.monthReading) : (input.savingsRate ?? 0) < 0`, with `isDeficit = (r) => r.kind ===
  'deficit' || r.kind === 'no-income' || (r.kind === 'rate' && r.rate < 0)`. A lived `none` (nothing happened yet)
  keeps today's headline: the sentence has no clause to support a warning.
- The three hand-built `cashflow` fixtures of `__tests__/overviewNarrative.test.ts` (the
  `savings`/`savingsRate`/`scheduledExpenses`/`scheduledIncome` literals) are rebuilt through
  `resolveLivedCashflow(stats)` on an invented `expenseStats`, so they carry `reading` and `monthReading`; their
  asserted sentences do not change.
- `describeCashflow` (`overviewNarrative.ts:511`, the Cashflow tile's reading) takes the whole month's
  `SavingsReading` instead of the bare rate: `none` and `no-income` → `null`; `deficit`, or a `rate` < 0 →
  «Speso più di quanto è entrato.»; a `rate` ≥ 0 → today's text. `CashflowTile` passes
  `readSavings(expenseStats.currentMonth.income, expenseStats.currentMonth.expenses)`;
  `describeAssistantCashflow` (`assistantNarrative.ts:449`) passes `readSavings(inflows, inflows − netCashFlow)`.
- The strip cell (`overviewSummary.ts:112-118`): `verdictSavingsRate` returns the lived `reading` too; with
  `deficit` the cell is `{ value: -reading.deficit, format: 'signed-currency' }` — no `decimals`: `unsignedText`
  (`lib/utils/verdictStrip.ts:76-81`) then prints `cachedFormatCurrencyEUR(magnitude, true)`, the whole-euro form
  `formatEuroMinus` prints in the sentence, so cell and sentence carry the same text; with `no-income` it is `value: null`, `reason: 'nessuna entrata finora'` as today; with `rate`, today's cell. On a payload without `incomeScheduled` (`lived: false`) the cell reads
  `readSavings(current.income, current.expenses)`: `rate` → today's cell; `deficit` → `value: null`, `reason:
  'spese oltre le entrate'` (the sentence has no clause there); `no-income`/`none` → `reason: 'nessuna entrata
  nel mese'` as today.
- `app/dashboard/page.tsx:296-314` passes the same `cashflow` object: no new prop.

### Assistente — `lib/utils/assistantNarrative.ts:291-309`

`toNoContextVerdictInput` drops its own division (`:294`) and takes `monthSavingsRate`/`resolveLivedCashflow` from
the two modules above, so it feeds `buildOverviewVerdict` exactly what the Panoramica feeds it.
`resolveSavingsRate` (`:124`) returns `meaningfulSavingsRate(inflows, inflows − netCashFlow)`.

### Captions — `CashflowTile.tsx:123-135`, `CashflowKpiTrio.tsx:90-102`

Both read `savingsRate` already as `number | null`; their callers now pass `meaningfulSavingsRate(…)`
(`tracciamentoSummary.ts:116-126` `buildTotals` computes `savingsRate` through it; `coverageRatio` unchanged). The
caption prints the percentage as `withTypographicMinus(savingsRate, formatPercentage(Math.abs(savingsRate), 1))`
(`lib/utils/formatters.ts:58`: the value decides the sign, the second argument is the printed magnitude).

**Tracciamento's verdict stops reading `savingsRate === null` as «no income»** (it would otherwise say «hai speso
senza entrate» for 3 € in and 500 € out): in `lib/utils/cashflowNarrative.ts`, `resolveTone`, `resolveHeadline`
and `figuresSentence` branch on `totals.income <= 0` for «hai speso senza entrate» / «nessuna entrata: spese …», on
`totals.net < 0` for «hai speso più di quanto è entrato» / «le spese superano le entrate di {euro}», and print a
percentage only when `totals.savingsRate !== null`.

### «Risparmio nel tempo» — `tracciamentoSummary.ts`, `cashflowNarrative.ts`, `RisparmioTile.tsx`

- `buildTrailingMonthFlows` (`:491`): each month carries `reading: readSavings(income, spending)` and
  `savingsRate = reading.kind === 'rate' ? reading.rate : null`.
- `summarizeSavingsHistory` (`:520-542`): `closed` = the months BEFORE today's Italian month (today it is «every
  month but today's», so a future anchor's months of instalments would become deficits); `SavingsHistory` gains
  `futureMonths: MonthFlow[]` (the months after today's) and `rankedCount` (closed months whose reading is a
  rate). `average = weightedSavingsRate(closed)`; best and worst over the ranked months; `deficitMonths` = the
  closed months with a rate < 0 OR a `deficit` / `no-income` reading (a month that spent without earning is a
  deficit month); `measuredCount` keeps today's meaning, closed months with `income > 0`. The early return is taken
  when `measuredCount === 0 && deficitMonths.length === 0`.
- `describeSavingsHistory` and `describeSavingsHistoryAnswer` are unchanged in grammar (they print `historyRate` of
  values that are now all ≥ −100); their «Un solo mese con entrate» and «uguale in tutti» branches read
  `rankedCount`, and with `rankedCount === 0` they return what they return today for `measuredCount === 0`.
  `describeDeficitMonths` returns `null` only when `measuredCount === 0 && deficitMonths.length === 0`; the
  tile's empty state «Nessun mese con entrate nella finestra.» reads the same condition.
- `SavingsRateBars` (`RisparmioTile.tsx:40-131`): `bottom = months.some(isFloorMonth) ? SAVINGS_RATE_FLOOR :
  Math.min(...rates, 0)`, where `isFloorMonth` is «reading `deficit` or `no-income`, and not in
  `history.futureMonths`» — a floor bar puts the floor on the plot's bottom edge. A floor month is drawn as a bar
  from 0 to the floor in full `var(--destructive)`; a future month draws no bar, as today.
- The three texts of a month — the `<title>` of its bar, its entry in the SVG's `aria-label` and the
  `ChartHoverTip` value — come from ONE `export function describeSavingsBar(reading: SavingsReading, label: string,
  isFuture: boolean): string` in `cashflowNarrative.ts`: future → «{label}: non ancora iniziato»; `rate` →
  «{label}: −30%» (`withTypographicMinus`, today's `rateText`); `deficit` → «{label}: spese oltre le entrate,
  −497 €»; `no-income` → «{label}: spese oltre le entrate, −500 €» (`formatEuroMinus`); `none` → «{label}: nessun
  movimento». The tip's colour is `text-destructive` for a floor month.

### Analisi

- `describeFlow` (`analisiNarrative.ts:516-556`) takes the period's `SavingsReading` instead of the bare rate
  — `describeFlow(flow: FlowSummary, reading: SavingsReading): Narrative | null` —
  (caller `components/cashflow/AnalisiTab.tsx:980`, `readSavings(totals.income, totals.expenses)`): `deficit` →
  «; le spese superano le entrate di {497 €}»; `rate` < 0 → today's «del 30,0%»; the other branches unchanged.
- `SavingsRateTrendSection.tsx:131`: the inline division moves to a pure `export function
  buildSavingsRateTrendPoints(months: readonly { label: string; month: number; year: number; income: number;
  expenses: number }[]): { label: string; month: number; year: number; rate: number | null }[]` in
  `lib/utils/analisiSummary.ts` (`rate = meaningfulSavingsRate(income, expenses)`); the component keeps the window
  walk and sums each month before calling it; «Servono almeno 3 mesi di entrate per il trend» counts the non-null
  points as today; the file's header comment names `readSavings` instead of the formula; `SavingsRateLineChart.tsx:49` → `domain={[(min: number) => Math.max(Math.floor(min), SAVINGS_RATE_FLOOR), 'auto']}`.

### AI block — `lib/utils/cashflowBlock.ts`

`:312` and `:605` go through `meaningfulSavingsRate`; `pct` (`:636-638`) prints `withTypographicMinus(value, magnitude)` on the absolute value; `formatSavings`
(`:710-717`) keeps its parenthesis on its own «—», reworded « (tasso —: entrate nulle o negative, oppure spese
oltre il doppio delle entrate)» (`cashflowBlock.test.ts:348` takes the new text); `formatSeries` (`:740-763`)
prints after its last month the line «tasso —: entrate nulle o negative, oppure spese oltre il doppio delle
entrate», once, only when a month's rate is «—»; the comment at `:93` reads
«percent, ≥ −100, `null` when not a rate».

### PDF, email, Hall of Fame

- `CashflowSection.tsx:49,68`: the note's text moves to `pdfNarrative.ts` as `describeNetSavingsNote(income,
  spending)` → `null` (no note) unless a rate; printed with `withTypographicMinus(rate, …)` on the magnitude.
- `emailNarrative.ts:383-391`, the fallback branch (`else if (input.totalIncome > 0)`): a surplus keeps today's
  clause («Hai messo da parte +1180 €, il 28,2% di quanto è entrato.», pinned by `emailNarrative.test.ts:164`),
  its percentage read from `meaningfulSavingsRate`; a deficit prints « Sono usciti {euro(−savings)} più di quanto
  è entrato.», the tile's sentence; without income nothing, as today. `describeCashflowTile`'s surplus branch
  (`:567`) reads `meaningfulSavingsRate` too.
- `hallOfFameSummary.ts:241-244` `valueOf` (savings share): `meaningfulSavingsRate` instead of `shareOf`;
  `RecordRows.tsx` `readingOf` and `HallOfFameDettaglio.tsx` (beside `signedPercentage`, `:90`, `:241-242`) print
  the savings percentage with `withTypographicMinus(rate, formatPercentage(Math.abs(rate), 1))` — no «+», a «−»
  for a deficit; the comment of `readingOf` becomes «a savings rate keeps its minus (owner, 2026-11-12) and takes
  no «+»: it is a proportion of the income, not a gain».

### Deleted

`computeTrailingSavingsRateAverage` (`lib/utils/cashflowTimeSeries.ts:314-348`) and its cases in
`__tests__/cashflowTimeSeries.test.ts:254-278`.

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **A narrative module the server reads imports from `formatters`, never from `chartService`** (AGENTS.md § server
  modules — § 1, Italian Localization): here it means `savingsRate.ts` has NO import, and `cashflowBlock.ts`,
  `emailNarrative.ts`, `pdfNarrative.ts` add only `@/lib/utils/savingsRate` and names of `@/lib/utils/formatters`
  — never `chartService`.
- **The Comma Rule / typographic minus**: every negative figure prints U+2212 (`withTypographicMinus`); the
  captions' ASCII hyphen is part of the defect.
- **The strip's identity** (doc/guide/panoramica.md § Composizione mobile): the cell's text must be a substring of
  the verdict's sentence — the cell and `describeSavedSoFar` change together, and both round once.
- **The First-Screen budget**: a reason longer than nine characters is a wide cell (`WIDE_CELL_CHARS`,
  `components/ui/verdict-strip.tsx:29`): «nessuna entrata finora» already is one today; «−497 €» is not.
- **The system prompt is byte-identical for every user**: the block's legend is user content
  (`formatCashflowBlockSection` puts it in `userContent`), not system text;
  `__tests__/assistantPromptBundle.test.ts` (`withBlock.system` toBe `without.system`) and
  `__tests__/allocationAdvicePrompts.test.ts` (`a.system` toBe `b.system`) stay green.
- **Sentences live in narrative modules**; the three RTL tests assert on rendered text, not on class names.
- **Timezones**: every fixture date at noon; the «in progress» month is decided by `getItalyDateIso`.
- **The tests that pin a negative percentage keep their expected text** (`overviewSummary.test.ts:155` −12%,
  `overviewNarrative.test.ts:68,397`, `cashflowNarrative.test.ts:499,509,730`): all are rates above the floor. The
  eight `describeFlow(` calls of `analisiNarrative.test.ts` (among them `:442`, «del 12,3%») pass
  `readSavings(income, spending)` of figures giving the same rate (1000 / 1123 for −12,3%), their expected strings
  unchanged.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| R1 | `savingsRate.test.ts`: the five readings of criterion 1; −100 exactly is a rate; a negative income is none | `rate <= SAVINGS_RATE_FLOOR` |
| R2 | `weightedSavingsRate`: months (1.000/500), (3/500), (2.000/1.000) → 50% (the middle one ignored) | average of the rates |
| V1-V4 | `overviewNarrative.test.ts`: the four sentences of criteria 2-3, text joined from the `Narrative` | drop the `no-income`/`deficit` branch |
| V5-V6 | headline with ② and a positive whole month is not the warning; with a deficit whole month it is | read `input.savingsRate` only |
| V7 | `cashflowNarrative.test.ts`: `buildCashflowVerdict` with totals from `summarizePeriodCashflow` of income 3 € and spending 500 €, no calendar → headline «… hai speso più di quanto è entrato.», sentence contains «le spese superano le entrate di 497 €» | branch on `savingsRate === null` |
| V8 | `overviewNarrative.test.ts`: lived `none`, a calendar with spending only, monthly variation ≥ 0 → «{Mese} sta andando bene.» | drop the `none` exclusion |
| S1-S3 | `overviewSummary.test.ts`: the three cells and the identity (cell text ⊂ sentence) | `format: 'percent'` for the deficit |
| A1 | `assistantNarrative.test.ts`: two payloads — one current (income 3 €, spending 500 €, a salary of 2600 € in calendar) and one without `incomeScheduled` (whole month income 3 €, spending 500 €) — `buildNoContextVerdict(toNoContextVerdictInput(p, m))` equals `buildOverviewVerdict` on the input built from `resolveLivedCashflow` and `monthSavingsRate`; the second has no «%» | keep the own division |
| K1-K2 | `cashflowKpiTrio.test.tsx`, `cashflowTile.test.tsx` (RTL): «—» and «0,01×» in ②, «−30,0%» in ③ | pass the raw rate |
| K3 | `cashflowTile.test.tsx`: whole month income 3, spending 500 → the reading «Speso più di quanto è entrato.» | pass `meaningfulSavingsRate` to `describeCashflow` |
| H1-H4 | history: excluded from average/best/worst, counted in the footer (a window whose closed months are all 3 €-income months has a footer and no «Nessun mese con entrate»), weighted average, the sentence | `average = mean(rates)` |
| H5 | `tracciamentoSummary.test.ts`: a window anchored two months ahead, the two future months holding instalments only → neither is in `deficitMonths`, both are in `futureMonths` | `closed = months.filter((m) => m !== ongoing)` |
| T1 | `risparmioTile.test.tsx`: twelve months, eleven at +20% and one of income 3 € / spending 500 € → every `<rect>` has `y ≥ 0` and `y + height ≤ 120` (the viewBox), the floor bar ends at y = 120, its `<title>` and the hover tip read «{mese}: spese oltre le entrate, −497 €» | compute `bottom` without the floor-month branch |
| L1 | `savingsRateTrend.test.ts`: `null` point for ②, value for ③ | map every month to a number |
| F1 | `analisiNarrative.test.ts`: `describeFlow` with ② and ③ | print `Math.abs(rate)` always |
| B1-B2 | `cashflowBlock.test.ts`: «—» and the legend once; no legend when every row is a rate | drop `meaningfulSavingsRate` |
| P1, E1 | `pdfNarrative.test.ts` the note; `emailNarrative.test.ts` the fallback's deficit sentence | restore the percentage |
| HF1 | `recordRows.test.tsx`: «−600 €» with «−30,0%»; no percentage below the floor; `HallOfFameDettaglio` prints «−30,0%» for the same month | `Math.abs` |

Playwright: `e2e/overview.mobile.spec.ts`, `e2e/mobile-composition.cashflow.mobile.spec.ts`, `e2e/analisi*.spec.ts`
stay green untouched (positive fixtures). One new test in `e2e/overview.spec.ts`, on the wire like the rest of the
file (nothing is written): `patchOverview(page, { expenseStats: { ...BASE_EXPENSE_STATS, currentMonth: { income:
2603, expenses: 500, net: 2103, expensesScheduled: 0, incomeScheduled: 2600 } } })` → the verdict contains «Finora
hai messo da parte −497 €: le spese superano le entrate; con il calendario (2600 € di entrate) il mese chiude al
81%» and no «delle entrate finora».

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: an emulator account with 3 € in and 500 € out dated today and a salary dated after
today (on a month's last day no later row exists: the browser check then uses the wire patch of § 6) reads the sentence of criterion 2 ②, the strip «−497 €», the Cashflow tile's whole-month rate as today;
Tracciamento's «Risparmio nel tempo» with one planted 3 €-income month shows a normal scale and a floor bar.

- **A**: `tsc`, lint, Vitest (three zones), the Playwright specs of overview, cashflow, analisi; criterion 15's
  grep; `npm run perf:build` + `npm run perf:budget -- --dist=.next-perf` (criterion 17).
- **B**: emulators + seed + the planted rows (decoys «ornitorinco», «fenicottero» as notes).
- **C (browser, the session)**: Panoramica, Assistente (no call: the verdict only), Tracciamento, Analisi at 390 and
  1440; the PDF export of the running month.
- **D (data)**: the overview payload (`/api/dashboard/overview`) carries the same `incomeScheduled` the sentence used.
- **E**: an account with no rows at all → no clause, no strip cell value, as today.
- **F (owner, at his «pronto»)**: the mirror on a day early in the month, or his production account after the deploy.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): `mobile:census` + `mobile:budget`; remove fixtures and mirror.

## 8. Putting it into service

One PR to `develop`. No data change. The overview payload is unchanged (the readings are derived client-side from
fields it already carries), so `DASHBOARD_OVERVIEW_SOURCE_VERSION` (25) and `PERSIST_CACHE_VERSION` ('1') do not
move: no persisted shape changes, every reading is derived on read.

## 9. Documentation

- `doc/guide/panoramica.md`: «a deficit so far reads as a signed saving — «Finora hai messo da parte −X €: le spese
  superano le entrate» — the figure of the strip's cell» (decision 41).
- `AGENTS.md`: one repo-wide rule — «a savings rate goes through `readSavings` (`lib/utils/savingsRate.ts`): below
  −100% or without income the app speaks in euros (2026-11-12; pinned by `savingsRate.test.ts`, criterion 15's grep)».
- `doc/guide/panoramica.md` (§ Panoramica and Dashboard Data Isolation, the verdict's clause list; § Composizione
  mobile: the cell's three forms), `cashflow-tracciamento.md` (the weighted average, the floor bar, a future month
  not judged, `rankedCount`), `cashflow-analisi.md`, `assistente.md`, `email-pdf.md`: one bullet each, with the
  date.
- `doc/guide/hall-of-fame.md`: «A savings rate is a proportion, so it is unsigned beside a signed amount» → «A
  savings rate keeps its minus and takes no plus (2026-11-12)»; «one decimal, unsigned» → «one decimal, a minus when
  negative; null when not a rate (`meaningfulSavingsRate`)».
- `DESIGN.md`: nothing (no rule changes; The Absence-Has-Three-Names Rule already covers «nessuna entrata»).
- `CLAUDE.md` › «Latest», `Draft Release Temp.md` (Panoramica, Tracciamento entries rewritten), `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **The Analisi «Periodo» tile's place and form**: heir NOVE-10.
- **The savings ring** (deleted on 2026-08-31) does not come back with the donuts: heir none — NOVE-08's rule
  forbids a ring for a signed quantity.
- **A fee row's effect on the rate**: a fee is a spending row (decision 18, NOVE-07) and enters every rate through
  `readSavings` like any expense — no heir.
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
chiedimi se: un test che fissa una percentuale negativa sopra la soglia cambia il TESTO
atteso; nel confronto con develop dello stesso giorno, stessa build, si muove una voce di mobile:budget che la spec non nomina; perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro); il grep del criterio 15 stampa una riga che il criterio non elenca. Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il
riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec with a shared contract (`readSavings`) read by twelve sites in
seven areas. Estimated size: 1 session, ~5 h; ~60 lines pure, ~250 across the sites, ~500 of tests, one E2E test.
