# AI-02 — The Consulente's cashflow block

> Series `doc/ai/` (README.md § 5): **depends on AI-00** (retired on 2026-11-03, in develop since 2026-11-03, PR #497: the repo after the upgrade); **AI-04 depends on it** (the
> interview reads the same block) and **AI-05 reuses `buildCashAccountLines`** (the register's accounts). Written on
> 2026-11-01 from `develop` @ b9411a4d. Executes decision 7 (an aggregate block on 12 months + a 24-month monthly
> series, from a pure function), decision 27 (the same block in the Assistente's year, YTD and history analyses),
> the choice A8 and the decisions 45–48 on its content. Read adversarially on 2026-11-01: 32 findings applied, the
> decisions 21–73 in README.md § 3 (this spec: decisions 22, 25, 27, 34, 45, 46, 47, 48).

## 1. The problem today (evidence on the code)

- **The strategy's data is the YTD bundle** (`lib/server/allocationAdvice/run.ts:240-241` @ b9411a4d:
  `buildAssistantYtdContext(document.userId)` → `formatBundleForPrompt(bundle)`), i.e. `buildCashflowBreakdown`
  (`lib/utils/expenseBreakdown.ts:102` @ b9411a4d) on the rows from 1 January to the end of the current Italian month
  (`lib/services/assistantMonthContextService.ts:836-847` @ ce26af4d): totals, by type, by category and subcategory,
  income by CATEGORY with the dividends apart, the largest single expenses. Nothing else about the cashflow.
- **What the owner asked for and the bundle cannot say**: «quanto sono concentrati gli stipendi» (income by source
  over time: one year-to-date figure per income category, no month-by-month, no share of the first source); «dove
  spende» over a horizon (a January run sees one month); the savings capacity the strategy's `monthlyContribution`
  should rest on (no monthly series → no median, no spread); the recurring commitments (`Expense.isRecurring` +
  `recurringParentId`, the instalment plans by `installmentParentId`, the `debt` rows by `debtAssetId`); the liquid
  accounts' balances the cash reserve should be sized against, with their default roles.
- **The Assistente's year, YTD and history analyses have the same gap** (decision 27): each bundle is one period's
  `buildCashflowBreakdown`, with no 24-month series, no median, no commitments and no accounts by role.
- **The prompt does not ask for it**: `buildStrategyPrompt` (`lib/server/allocationAdvice/prompts.ts:148-158`
  @ b9411a4d) says «I blocchi STRUMENTI, ALLOCAZIONE OGGI, … MUTUI e FAMIGLIA sono esaustivi» — no cashflow block in
  the list; `STRATEGY_CONTRACT` (`:113-128` @ b9411a4d) never names income, spending or savings: § 1 «La situazione»
  is «cosa vedi nel portafoglio di oggi». The positional `priorPlan` (`:148` @ b9411a4d) is the only option.
- **The same rows are already read twice per run**: `runStrategy` (`run.ts:240` @ ce26af4d) and `runInstruments`
  (`run.ts:262` @ ce26af4d) both call `buildAssistantYtdContext`.
- **The expense read is Admin, windowed and private**: `fetchExpenses(userId, start, end)`
  (`assistantMonthContextService.ts:145-167` @ b9411a4d) on `expenses` by `userId` and a `date` range;
  `fetchSettings` (`:169-192` @ ce26af4d) returns a hand-picked subset — `dividendIncomeCategoryId` and
  `cashflowHistoryStartYear` are in it, `defaultDebitCashAssetId` and `defaultCreditCashAssetId`
  (`types/assets.ts:412-413` @ ce26af4d) are not.
- **An account's balance is computed, never stored**: `Asset` has no value field; Patrimonio's Liquidità prints
  `calculateAssetValue(asset)` (`lib/utils/patrimonioSummary.ts:105` @ ce26af4d), which lives in
  `lib/services/assetService.ts:603` @ ce26af4d beside the client SDK (`:15` @ ce26af4d). The pure precedent injects
  it (`assetValueOf`, `lib/utils/assistantPortfolioContext.ts:242` @ ce26af4d). The cash-account rule
  `isCashAccount` lives in `patrimonioSummary.ts:59` @ ce26af4d, a module that imports `assetService` (`:13`
  @ ce26af4d).
- **Italian windows**: AGENTS.md § Assistant · Assistente: «Every expense window is an Italian calendar window
  (`getItalyMonthBoundsUtc`)» — `lib/utils/dateHelpers.ts:166` @ b9411a4d; `getItalyMonthRangeBoundsUtc` (`:175`
  @ ce26af4d) spans months inside ONE year only.

## 2. Goal and acceptance criteria

The strategy (and, from AI-04, the interview) and the Assistente's year, YTD and history analyses read ONE cashflow
block that answers: how much comes in, from how many sources and how concentrated; where it goes, by category; how
much is left each month and how steady that is; which commitments recur; which accounts hold the liquidity.

1. **A pure module exists**: `lib/utils/cashflowBlock.ts` (new) with the § 4 exports, importing only `@/types/*`,
   `dateHelpers`, `expenseGrouping`, `recurrenceDates`, `cents` and `formatters`; the «today» is an input. Proof:
   `__tests__/cashflowBlock.test.ts` (new) runs with no `vi.mock` in `Europe/Rome` and `TZ=UTC`;
   `grep -n "lib/services\|lib/firebase\|patrimonioSummary" lib/utils/cashflowBlock.ts` prints nothing (phase C).
   Mutation: import `calculateAssetValue` from `lib/services/assetService.ts` → the grep prints the line.
2. **The month of a row is its Italian calendar month** (`getItalyDateIso(row.date).slice(0, 7)`). Proof: a row at
   `2026-02-01T00:30:00+01:00` (= `2026-01-31T23:30:00Z`) is filed under `2026-02` in both zones. Mutation: key by
   `row.date.getUTCMonth()` → filed under `2026-01`, red in both zones.
3. **The windows are fixed and declared**: aggregates on the 12 full Italian months before the current one; the
   current month counted up to the Italian today and printed apart, its later rows declared («più N righe
   programmate fino a fine mese (uscite X €, entrate Y €), non contate»); a 24-month series ending with the current
   month; the rows after today serve ONLY the commitments' next date and state. Proof: with `todayIso`
   `2026-11-15`, the rows of `2026-11-20` and `2026-12-20` of a monthly spending series: the aggregates and the
   series ignore both, the current month declares the first as scheduled, the commitment prints «prossima
   2026-11-20». Mutation: drop the `<= todayIso` cut → the current month counts the 20 November row.
4. **Income is a signed sum and its concentration a reading on the first source** (decisions 45, 47): rows of
   `settings.dividendIncomeCategoryId` are in the total, out of the sources and the HHI, printed «di cui dividendi e
   cedole X €»; first source ≥ 70% → «una fonte dominante (X%)», first two ≥ 80% → «due fonti principali», otherwise
   «fonti diversificate»; the HHI printed as a number. Proof: one source → «una fonte dominante (100%)», HHI 1,00;
   60/25/15 → «due fonti principali»; 40/30/30 → «fonti diversificate», HHI 0,34; 86/9/5 → «una fonte dominante
   (86%)», HHI 0,75; one salary plus a dividend row → still 100%; spending only → «nessuna entrata», `hhi` null.
   Mutation: read the HHI against 0,8 → the 86/9/5 fixture reads «due fonti principali»; count the dividends as a
   source → the salary drops below 100%.
5. **Spending is keyed by id and declared whole**: magnitudes by type (`fixed` → Spese Necessarie, `variable` →
   Spese Non Necessarie, `debt` → Debiti, no type → «non classificate» with its row count); categories by
   `getCategoryKey`, subcategories by `getSubCategoryKey`, labels through `resolveDisplayLabels`; subcategories capped
   at `CASHFLOW_BLOCK_SUBCATEGORY_CAP` across all categories with «e altre N sottocategorie minori, X € in tutto».
   Proof: two categories named «Casa» of two types print as «Casa (Spese Necessarie)» and «Casa (Spese Non
   Necessarie)»; 70 subcategories print 60 and «e altre 10 sottocategorie minori». Mutation: key by `categoryName`
   → the two «Casa» merge into one line.
6. **Savings count the whole instalment** (decision 48): savings = income (dividends included) − all spending; the
   rate is null when income ≤ 0 and prints «—»; the block prints «le rate contano per intero: la quota capitale
   riduce il debito». Proof: a fixture with a `debt` row carrying `debtInterestPaid`. Mutation: subtract only
   `debtInterestPaid` → the savings differ by the principal.
7. **The series has 24 rows**, oldest first: a month with no row prints «nessuna riga», a month before
   `cashflowHistoryStartYear` prints «prima dell'inizio dello storico» and counts nowhere, the current month is
   flagged «in corso». Proof: a fixture with a gap month and a floor year. Mutation: build the series from the months
   that HAVE rows → 23 rows.
8. **The spread is robust and honest about its base**: median and interquartile range of the monthly spending and
   savings, on the full months from the first month holding a counted row (never before the floor), the count
   declared («su 9 mesi»); under 3 months «dati insufficienti per le mediane». Proof: spending 1.000, 1.100 … 2.100 €
   over the 12 months → median 1.550 €, IQR 1.275–1.825 €; the last month raised to 9.000 € → the same three figures;
   a user whose first row is 9 months back → «su 9 mesi»; 2 months → the insufficient line. Mutation: the mean
   instead of the median → 2.125 € with the outlier; the medians from the window's start → «su 12 mesi».
9. **The commitments are the recorded series, never inferred**: rows with `isRecurring` grouped by
   `recurringParentId`, frequency `resolveRecurrenceFrequency(row.recurringFrequency)` (absent = monthly), and
   instalment plans grouped by `installmentParentId` with «rata N di M»; amount from the latest row up to today, a
   change printed «da X € a Y € dal YYYY-MM»; «prossima YYYY-MM-DD» when a row follows today, else «terminata il
   YYYY-MM»; active first, by monthly equivalent, cut at `CASHFLOW_BLOCK_ROW_CAP` AFTER sorting with «e altre N non
   elencate». Proof: a 12-row monthly series prints one line; a legacy series with no `recurringFrequency` prints
   «mensile»; 50 series print 40 and «e altre 10 non elencate», the largest among the printed. Mutation: cut before
   sorting → a small series printed, a large one cut.
10. **The loans are the `debt` rows with `debtAssetId`, and only there**: grouped by it (a recurring mortgage never
    also in the commitments), `monthly` = the median of `Math.abs(amount)` over the 12 full months' rows that are not
    `isDebtPayoff`, the payoffs summed apart («estinzioni anticipate X €»), a loan no longer among the assets
    «prestito eliminato», a `debt` row with no loan and no series «N rate senza prestito collegato, X €». Proof: a
    recurring `debt` series with `debtAssetId` appears once, under «Rate di prestito». Mutation: put the payoff in
    the median → the monthly figure moves.
11. **Transfers are counted apart, everything else counts**: `type === 'transfer'` rows are out of income and
    spending and printed «Trasferimenti fra conti: N righe, X € mossi», with «di cui N verso o da immobili, X €» when
    either end names a `realestate` asset; fee rows (`feeOfTransferId`), `excludeFromBudget` rows and `balancePending`
    rows dated up to today count like any row. Proof: the fixture. Mutation: filter by `countsTowardBudget` → the
    spending total drops.
12. **The accounts carry the Patrimonio balance and their roles**: `buildCashAccountLines(assets, settings,
    assetValueOf)` returns EVERY `isCashAccount` asset (AI-05's register names a closed one too), the balance from
    the injected `assetValueOf`, the roles from the two default ids, largest first; the block drops a zero-quantity
    account that holds no role. Proof: a money-market ETF with `assetClass: 'cash'` is never a line; a closed account
    is a line of `buildCashAccountLines`, absent from the block, and present in the block once named default debit.
    Mutation: filter by `assetClass === 'cash'` alone → the ETF appears.
13. **The block is printed whole**: `formatCashflowBlockForPrompt(block)` prints the § 4 shape; every count reads
    singular at 1 («1 riga», «1 mese»), a rounded zero never reads «-0 €». Proof: the printed block of one fixture
    asserted with `toBe` against the expected multi-line string (the U+00A0 of `Intl` normalised as in
    `allocationAdvicePrompts.test.ts`). Mutation: drop the cut line of the commitments → the `toBe` fails.
14. **ONE read per call, on Italian bounds**: `fetchCashflowBlockInputs(userId, now)` queries `expenses` once, from
    the Italian start of the month 23 months before the current one to the Italian end of the month 12 after it, and
    returns `todayIso = getItalyDateIso(now)`, the settings with the four fields, the assets, the categories and
    `assetValueOf = calculateAssetValue`. Proof: `__tests__/assistantMonthContextService.test.ts` (extend) at
    `2026-11-15T10:00:00Z` (bounds 2024-12 → 2027-11), `2026-01-15T10:00:00Z` (2024-02 → 2027-01) and
    `2026-10-31T23:30:00Z` (`todayIso` `2026-11-01`, bounds 2024-12 → 2027-11). Mutation: the current month from
    `now.getUTCMonth()` → the third case builds 2024-11 → 2027-10.
15. **The strategy reads it**: `runStrategy(document, onStage, priorPlan, now)` reads the bundle and the block in
    parallel before the strategy stage, once per strategy, never in the instruments, the review or a revision;
    `buildStrategyPrompt(answers, dataBlock, { priorPlan, cashflowBlock })` prints the block after `dataBlock` and
    before the plan in force; the esaustivi sentence names «CASHFLOW 12 MESI» and points the model at it for income,
    spending and savings; `STRATEGY_CONTRACT` § 1 names the cashflow and carries decision 46's line verbatim; `system`
    is the same with and without the block and across users. Proof: `__tests__/allocationAdvicePrompts.test.ts` and
    `__tests__/allocationAdviceRun.test.ts` (extend). Mutation: append the block after the prior plan → the order
    assertion fails; call the fetch in `runInstruments` → its count fails.
16. **A failed read is never a silent zero** (DESIGN → The Absence-Has-Three-Names Rule): in the Consulente the
    strategy fails with today's retryable error and no model call; in the Assistente the request answers today's 500.
    Proof: the run test with `fetchCashflowBlockInputs` rejected → `status: 'failed'`, retryable, the SDK spy never
    called; the route test with it rejected → 500. Mutation: catch the rejection and go on with `''` → the model is
    called.
17. **The Assistente's three analyses read it, nothing else does** (decision 27): the stream route builds the block
    for `year_analysis`, `ytd_analysis` and `history_analysis` when their bundle exists and passes it to
    `streamAssistantResponse`; `buildYearAnalysisPrompt`, `buildYtdAnalysisPrompt`, `buildHistoryAnalysisPrompt` print
    it in `userContent` after the numeric block, under a note, before «Domanda dell'utente»; `system` is unchanged;
    the month analysis, the chat (whatever `chatContext`), the `context` SSE event and the emails never carry it.
    Proof: `__tests__/assistantPromptBundle.test.ts`, `__tests__/anthropicStream.test.ts`,
    `__tests__/assistantRoutes.test.ts`, `__tests__/monthlyEmailService.test.ts` (extend). Mutation: build it for a
    chat with `chatContext: 'ytd'` → the route test's «not called» fails.
18. **What does not change stays green**: the rate limit, the SSE events, the document shape and its mapper,
    `formatBundleForPrompt`, `ASSISTANT_SYSTEM_CORE`, Patrimonio's `isCashAccount` callers. Proof: the existing
    suites (`allocationAdviceRoutes`, `allocationAdviceDocument`, `assistantPromptBundle`, `monthlyEmailService`,
    `patrimonioSummary`) green; `__tests__/monthlyEmailService.test.ts` gains `not.toContain('CASHFLOW 12 MESI')`.
    Mutation: append the block inside `formatBundleForPrompt` → that assertion fails.

## 3. Decisions

- **Decision 7 (owner)**: the block's content and its two windows.
- **Decision 27 (owner)**: the block is also appended to the Assistente's `year_analysis`, `ytd_analysis` and
  `history_analysis` prompts, `userContent` only, `system` unchanged; never to `month_analysis`, `chat`, `register`
  or the emails. Hence the shared name `lib/utils/cashflowBlock.ts`.
- **Decision 45 (owner)**: the concentration reading on the first source's share; the HHI printed as a number.
- **Decision 46 (owner)**: the strategy contract's new line, verbatim: «I "monthlyContribution" degli obiettivi
  stanno dentro la mediana del risparmio mensile del blocco CASHFLOW 12 MESI (se la superano, dillo e perché); la
  riserva di liquidità si misura sulla spesa mensile mediana e sui conti liquidi del blocco.» The block's header
  therefore reads «CASHFLOW 12 MESI», a name distinct from the bundle's «--- CASHFLOW ---».
- **Decision 47 (owner)**: dividends and coupons out of the sources and the HHI, printed apart.
- **Decision 48 (owner)**: the whole instalment is spending, and the block says so.
- **Decision 25 (owner)**: no income by household member (§ 10).
- **A8 (adopted)**: aggregates on the 12 full Italian months, the current month apart, a 24-month series, one read
  per call.
- **Adopted**: the read reaches 12 months past the current one, for the commitments' next date and state only; the
  current month counts up to the Italian today and declares its later rows; medians from the first month holding a
  row, never before `cashflowHistoryStartYear` (absent = no floor), none under 3 months; transfers to or from a
  property named apart; a failed read fails the stage (Consulente) or the request (Assistente).
- **Adopted**: transfers out of income and spending (as `buildCashflowBreakdown`, `expenseBreakdown.ts:122`
  @ ce26af4d) and counted apart; `excludeFromBudget` rows count (`countsTowardBudget` is the Budget's gate, not the
  cashflow's); `balancePending` rows count on their date.
- **Adopted**: `buildStrategyPrompt` takes an options object (README § 7: AI-04 adds `interview` to it); the three
  Assistente builders take `cashflowBlock?: string` as a fifth positional argument after `memoryItems`.
- **Adopted**: `isCashAccount` moves to `types/assets.ts` beside `isLoanAsset` (`:37` @ ce26af4d), the one-predicate
  home, so the pure module reads it without importing the client SDK through `patrimonioSummary.ts`;
  `patrimonioSummary.ts` re-exports it and its callers do not change.
- **Adopted**: the block is in Italian (the model answers in Italian, the other blocks are Italian), header in the
  `--- NOME (…) ---` convention of `formatBundleForPrompt`.

## 4. Solution

### The pure module (`lib/utils/cashflowBlock.ts`, new)

```ts
import type { Expense, ExpenseCategory, RecurrenceFrequency } from '@/types/expenses';
import type { Asset, AssetAllocationSettings } from '@/types/assets';

export const CASHFLOW_BLOCK_SERIES_MONTHS = 24;      // the series, current month included
export const CASHFLOW_BLOCK_AGGREGATE_MONTHS = 12;   // full months before the current one
export const CASHFLOW_BLOCK_FUTURE_MONTHS = 12;      // read past the current month, commitments only
export const CASHFLOW_BLOCK_ROW_CAP = 40;            // commitments printed (series + instalment plans)
export const CASHFLOW_BLOCK_SOURCE_CAP = 20;         // income sources printed
export const CASHFLOW_BLOCK_SUBCATEGORY_CAP = 60;    // spending subcategories printed, across categories
export const CASHFLOW_BLOCK_MIN_MEDIAN_MONTHS = 3;

export type CashflowBlockSettings = Pick<AssetAllocationSettings,
  'dividendIncomeCategoryId' | 'cashflowHistoryStartYear' | 'defaultDebitCashAssetId' | 'defaultCreditCashAssetId'>;

export interface CashflowBlockInput {
  /** The Italian «today» (`getItalyDateIso(now)`): the builder never reads the clock. */
  todayIso: string;
  categories: ExpenseCategory[];
  /** Every asset of the user: the cash accounts, the loans and the properties are picked here. */
  assets: Asset[];
  settings: CashflowBlockSettings | null;
  /** An asset's EUR balance — `calculateAssetValue`, injected (it lives beside the client SDK). */
  assetValueOf: (asset: Asset) => number;
}

export interface CashAccountLine { id: string; name: string; balance: number; roles: ('addebito' | 'accredito')[] }

export type IncomeReading = 'una fonte dominante' | 'due fonti principali' | 'fonti diversificate' | 'nessuna entrata';
export interface IncomeSource {
  key: string;             // `${getCategoryKey(row)}/${getSubCategoryKey(row)}`
  label: string;           // «Categoria › Sottocategoria», the category alone without a subcategory
  total: number;           // signed, 12 full months
  share: number | null;    // 0-100 of the positive sources' sum; null when total ≤ 0
  monthsPresent: number;   // full months holding a row of the source
}
export interface SpendingCategory {
  key: string; label: string; total: number; share: number;          // share 0-100 of spending.total
  subCategories: { key: string; label: string; total: number }[];    // the printed ones, after the global cap
}
export interface MonthRow {
  ym: string;                                   // 'YYYY-MM', Italian calendar
  state: 'full' | 'in-progress' | 'before-floor';
  income: number;                               // signed, dividends included
  necessary: number; nonNecessary: number; debt: number; unclassified: number;   // magnitudes ≥ 0
  savings: number;                              // income − the four spending figures
  savingsRate: number | null;                   // 0-100; null when income ≤ 0
  rows: number;                                 // counted rows (no transfers); 0 ⇒ «nessuna riga»
}
export interface Quartiles { q1: number; median: number; q3: number }
export interface Commitment {
  kind: 'recurring' | 'instalments';
  key: string;                                  // recurringParentId or installmentParentId
  label: string;                                // the latest row's category › subcategory
  frequency: RecurrenceFrequency;               // an instalment plan is 'monthly'
  amount: number;                               // |amount| of the latest row ≤ today, else of the first later row
  change: { from: number; sinceYm: string } | null;
  nextIso: string | null;                       // the first row after today
  endedYm: string | null;                       // the last row's month when no row follows today
  instalment: { number: number; total: number } | null;   // number 0 ⇒ «prima rata il …»
}
export interface LoanLine {
  debtAssetId: string;
  name: string | null;                          // null ⇒ «prestito eliminato»
  monthly: number | null;                       // median |amount|, 12 full months, payoffs out; null ⇒ none yet
  monthlyRows: number;
  payoff: number;                               // Σ |amount| of the 12 full months' payoff rows
  nextIso: string | null;
}
export interface CashflowBlock {
  windows: {
    aggregateFromYm: string; aggregateToYm: string; currentYm: string; todayIso: string; seriesFromYm: string;
    floorYm: string | null;                     // `${cashflowHistoryStartYear}-01`, null when the setting is absent
    medianFromYm: string | null; medianMonths: number;
  };
  income: { total: number; dividends: number; sources: IncomeSource[]; sourcesCut: { count: number; total: number };
            hhi: number | null; topShare: number | null; reading: IncomeReading };
  spending: { total: number; byType: { necessary: number; nonNecessary: number; debt: number; unclassified: number };
              untypedRows: number; byCategory: SpendingCategory[]; subCategoriesCut: { count: number; total: number } };
  savings: { total: number; rate: number | null };
  currentMonth: { income: number; spending: number; rows: number; scheduled: { rows: number; income: number; spending: number } };
  series: MonthRow[];                           // CASHFLOW_BLOCK_SERIES_MONTHS rows, oldest first
  volatility: { spending: Quartiles; savings: Quartiles } | null;   // null ⇒ «dati insufficienti per le mediane»
  commitments: { items: Commitment[]; cut: number };
  loans: { items: LoanLine[]; unlinked: { rows: number; total: number } };
  transfers: { rows: number; moved: number; property: { rows: number; moved: number } };
  accounts: CashAccountLine[];
}

export function buildCashflowBlock(expenses: readonly Expense[], input: CashflowBlockInput): CashflowBlock;
export function formatCashflowBlockForPrompt(block: CashflowBlock): string;
export function buildCashAccountLines(
  assets: readonly Asset[],
  settings: Pick<AssetAllocationSettings, 'defaultDebitCashAssetId' | 'defaultCreditCashAssetId'> | null,
  assetValueOf: (asset: Asset) => number,
): CashAccountLine[];
```

### Rules inside the builder (each one a test of § 6)

- **Months**: a row's month is `getItalyDateIso(row.date).slice(0, 7)`; its day `getItalyDateIso(row.date)`,
  compared as a string with `todayIso`. `currentYm = todayIso.slice(0, 7)`; month arithmetic on the index
  `year * 12 + (month - 1)`, never `Date.setMonth`. `aggregateFromYm` = current − 12, `aggregateToYm` = current − 1,
  `seriesFromYm` = current − 23.
- **What counts where**: a row counts in a FULL month when its month is in the series, before the current month,
  and not before `floorYm`; in the current month when its day is ≤ `todayIso`; a current-month row after today is
  «scheduled»; a row after the current month counts nowhere and feeds only the commitments and the loans' `nextIso`.
  Transfers never count as income or spending.
- **Income**: `type === 'income'`, the SIGNED sum of `amount` (as `buildCashflowBreakdown`, `expenseBreakdown.ts:128-139`
  @ ce26af4d), dividends included in `income.total` and summed in `income.dividends`. Sources: the income rows NOT in
  `settings.dividendIncomeCategoryId`, keyed by `getCategoryKey` + `getSubCategoryKey` (`lib/utils/expenseGrouping.ts:40,56`
  @ b9411a4d); the category's name is the current one in `input.categories` by id, else `getCategoryName(row)`; the
  subcategory's likewise from the category's `subCategories`, else `getSubCategoryLabel(row)`; the label is
  «Categoria › Sottocategoria» unless the subcategory key is `NO_SUBCATEGORY_KEY`; collisions resolved by
  `resolveDisplayLabels`. Shares over the sum of the POSITIVE source totals; a source ≤ 0 is listed after the others
  with no share. `hhi = Σ (share / 100)²` over all positive sources (before the cut), rounded with `roundToCents`;
  `topShare` = the first share. Reading (decision 45): `topShare ≥ 70` → 'una fonte dominante'; else first two
  shares ≥ 80 → 'due fonti principali'; else 'fonti diversificate'; no positive source → 'nessuna entrata', `hhi` and
  `topShare` null. Sources sorted by total desc, then label; cut at `CASHFLOW_BLOCK_SOURCE_CAP`, the rest in
  `sourcesCut`.
- **Spending**: every other non-transfer row, as `Math.abs(amount)` (`expenseBreakdown.ts:145` @ ce26af4d), by type:
  `fixed` → necessary, `variable` → nonNecessary, `debt` → debt, no type → unclassified with `untypedRows` (as
  `expenseBreakdown.ts:148` @ ce26af4d). Categories by `getCategoryKey`, labelled as the sources with the qualifier
  `EXPENSE_TYPE_LABELS[type]` (the category document's type, else the row's); all categories printed, by total desc;
  the subcategories ranked by total across ALL categories and the first `CASHFLOW_BLOCK_SUBCATEGORY_CAP` printed
  under their category, the rest in `subCategoriesCut` (the category totals stay whole). In a category that has
  subcategories, its rows without one print as «Senza sottocategoria» (`NO_SUBCATEGORY_LABEL`); a category with no
  subcategory at all prints its share alone.
- **Savings**: `income.total − spending.total`; `rate = savings / income × 100` when income > 0, else null. The same
  rule per month in the series.
- **Medians**: `medianFromYm` = the later of `aggregateFromYm` and the first FULL
  month (from `seriesFromYm`, not before `floorYm`) holding a counted row; `medianMonths` = the full months from
  `medianFromYm` to `aggregateToYm`; below `CASHFLOW_BLOCK_MIN_MEDIAN_MONTHS` (or no counted row) `volatility` is
  null. A month inside that span with no row counts as zero. Quartiles by linear interpolation at `(n − 1) · p`
  (p = 0,25 · 0,5 · 0,75; Excel's QUARTILE.INC), rounded with `roundToCents`.
- **Commitments**: the rows with `isRecurring === true` and a `recurringParentId`, grouped by it; the rows with an
  `installmentParentId`, grouped by it; a `debt` row with `debtAssetId` never enters a commitment (it is a loan's).
  A group is listed when one of its rows falls on or after `aggregateFromYm`. `frequency` =
  `resolveRecurrenceFrequency(latest.recurringFrequency)` (`lib/utils/recurrenceDates.ts:71` @ b9411a4d) for a series,
  `'monthly'` for an instalment plan. `amount` = `Math.abs` of the latest row ≤ today, else of the first later row;
  `change` = the amount before the current run of equal amounts (in cents) and the month the run began, when it
  differs. `nextIso` = the first row after today; `endedYm` = the last row's month when there is none. An instalment
  plan's `number` = `installmentNumber` of the latest row ≤ today (0 when none), `total` = `installmentTotal`. Order:
  active groups first by monthly equivalent desc (a yearly amount / 12), then label; then the ended ones by
  `endedYm` desc; cut at `CASHFLOW_BLOCK_ROW_CAP` AFTER sorting, the rest in `cut`.
- **Loans**: `type === 'debt'` rows with a `debtAssetId`, grouped by it; listed when a row falls on or after
  `aggregateFromYm`. `name` = the asset with that id for which `isLoanAsset` holds, else null. `monthly` = the median
  of `Math.abs(amount)` of the group's 12-full-month rows without `isDebtPayoff` (`monthlyRows` their count), null
  when there are none; `payoff` = the sum of the payoff rows' magnitudes in the 12 full months; `nextIso` = the first
  non-payoff row after today. `unlinked` = the 12 full months' `debt` rows with no `debtAssetId` that belong to no
  commitment.
- **Transfers**: the 12 full months' `type === 'transfer'` rows: `rows`, `moved = Σ |amount|`; `property` = those
  whose `transferCashAssetId` or `linkedCashAssetId` names an asset of `type === 'realestate'`.
- **Accounts**: `buildCashAccountLines(assets, settings, assetValueOf)` — `assets.filter(isCashAccount)`
  (`types/assets.ts` after the move), `roles` gets 'addebito' when the id is `defaultDebitCashAssetId` and 'accredito'
  when it is `defaultCreditCashAssetId`; `balance = assetValueOf(asset)`; sorted by balance desc, then name; every
  cash account is a line. `block.accounts` = its lines on `input.assets`, less those whose asset has `quantity === 0`
  and whose `roles` is empty.
- **Printing**: euro via `cachedFormatCurrencyEUR(Math.round(value) || 0, true)` (`lib/utils/formatters.ts:36`
  @ ce26af4d; `|| 0` keeps «-0 €» out), the series' columns via `formatNumberIt(Math.round(value) || 0, 0)`,
  percentages via `formatPercentageIt(value, 0)`, the HHI via `formatNumberIt(hhi, 2)`. Every count prints singular
  at 1: riga/righe, mese/mesi, fonte/fonti, sottocategoria/sottocategorie, rata/rate, altra/altre.

### The printed block (the shape the test asserts with `toBe`)

```
--- CASHFLOW 12 MESI (ultimi 12 mesi pieni: 2025-11 → 2026-10; il mese in corso 2026-11 fino al 2026-11-15, a parte; serie mensile di 24 mesi: 2024-12 → 2026-11) ---
Entrate: 31.200 € in 12 mesi (di cui dividendi e cedole 1.200 €, fuori dalle fonti). Fonti (totale, quota, mesi presenti): Stipendio › Azienda A 25.800 € 86% (12), Affitti › Box 2.700 € 9% (12), Rimborsi 1.500 € 5% (3). Concentrazione: una fonte dominante (86%), HHI 0,75.
Uscite: 22.800 € in 12 mesi — Spese Necessarie 14.400 € (63%), Spese Non Necessarie 7.200 € (32%), Debiti 1.200 € (5%). Per categoria: Casa 9.600 € (42%: Affitto 8.400 €, Bollette 1.200 €); Cibo 4.800 € (21%: Spesa 3.600 €, Fuori 1.200 €); Trasporti 3.600 € (16%: Carburante 2.400 €, Treno 1.200 €); Svago 3.600 € (16%); Prestiti 1.200 € (5%).
Risparmio: 8.400 € in 12 mesi, il 27% delle entrate; le rate contano per intero: la quota capitale riduce il debito.
Su 12 mesi (dal 2025-11): spesa mensile mediana 1.900 €, metà dei mesi fra 1.750 € e 2.100 €; risparmio mensile mediano 700 €, metà dei mesi fra 350 € e 950 €.
Il mese in corso (2026-11, fino al 2026-11-15): entrate 2.600 €, uscite 1.100 € (9 righe); più 4 righe programmate fino a fine mese (uscite 900 €, entrate 0 €), non contate.
Serie mensile in euro (entrate / Spese Necessarie / Spese Non Necessarie / Debiti / risparmio / tasso di risparmio):
2024-12: 2.600 / 1.200 / 600 / 100 / 700 / 27%
2025-04: nessuna riga
2026-11 (in corso, fino al 2026-11-15): 2.600 / 700 / 300 / 100 / 1.500 / 58%
Impegni ricorrenti (serie e piani a rate con almeno una riga dal 2025-11): Casa › Affitto mensile 700 € (prossima 2026-12-01); Auto › Assicurazione annuale 600 € (prossima 2027-03-10); Tecnologia › Telefono a rate 50 €, rata 7 di 12 (prossima 2026-12-15); Salute › Palestra mensile 45 € (da 40 € a 45 € dal 2026-03; prossima 2026-12-05); Svago › Streaming mensile 12 € (terminata il 2026-06); e altre 3 non elencate.
Rate di prestito: Prestito auto 100 €/mese (mediana su 12 rate; prossima 2026-12-01).
Trasferimenti fra conti: 14 righe, 9.000 € mossi, di cui 1 verso o da immobili, 5.000 € (non contati né fra le entrate né fra le uscite).
Conti liquidi: Conto risparmio 12.000 €; Conto principale 6.200 € (addebito e accredito predefiniti).
```

(Figures and names invented; the format is the contract; the series shows three of its 24 rows.) The other forms:
«Entrate: nessuna entrata registrata negli ultimi 12 mesi pieni.»; «Entrate: X € in 12 mesi, tutte dividendi e
cedole: nessuna fonte oltre a dividendi e cedole.»; «; e altre N fonti, X €» before «Concentrazione»; «Uscite:
nessuna uscita registrata negli ultimi 12 mesi pieni.»; «, Non classificate X € (p%, N righe senza tipo)» after
Debiti, and a «Non classificate» column in the series, only when a typeless row is in the 24 months; «. E altre N
sottocategorie minori, X € in tutto, già nei totali delle categorie» after the categories; «Risparmio: X € in 12 mesi
(tasso —: entrate nulle o negative); …»; «Mediane: dati insufficienti per le mediane (N mesi pieni con dati).»; a
series row «YYYY-MM: prima dell'inizio dello storico», and «; storico contato dal YYYY-MM» in the header when
`floorYm` falls inside the series; a rate «—» in a month with income ≤ 0; «rata N di M» or «prima rata il
YYYY-MM-DD»; «Impegni ricorrenti: nessuna serie né piano a rate dal YYYY-MM.»; «prestito eliminato 100 €/mese (…)»;
«Prestito X: prima rata il YYYY-MM-DD»; «; estinzioni anticipate X €» after a loan; «. N rate senza prestito
collegato, X €» after the loans; «Rate di prestito: nessuna.»; «Trasferimenti fra conti: nessuno.»; «Conti liquidi:
nessun conto registrato.»

### The server side

- **`types/assets.ts`**: `export function isCashAccount(asset: Pick<Asset, 'type' | 'assetClass'>): boolean` moves
  here, under `isLoanAsset`, with its comment. `lib/utils/patrimonioSummary.ts` imports it from `@/types/assets`
  (beside `Asset`, `:10` @ ce26af4d) and re-exports it (`export { isCashAccount }`), so
  `app/dashboard/assets/page.tsx:81` @ ce26af4d and `__tests__/patrimonioSummary.test.ts:52` @ ce26af4d stay as they
  are.
- **`lib/services/assistantMonthContextService.ts`**: `fetchSettings` adds `defaultDebitCashAssetId` and
  `defaultCreditCashAssetId` to the mapped fields, and its comment «Only the fields needed for context building»
  gains «— each new reader adds its fields here». ONE new export, built on the private fetchers (none renamed, none
  exported):

  ```ts
  export async function fetchCashflowBlockInputs(userId: string, now: Date): Promise<CashflowBlockInput & { expenses: Expense[] }> {
    const { year, month } = getItalyMonthYear(now);
    const current = year * 12 + (month - 1);
    const first = current - (CASHFLOW_BLOCK_SERIES_MONTHS - 1);
    const last = current + CASHFLOW_BLOCK_FUTURE_MONTHS;
    const start = getItalyMonthBoundsUtc(Math.floor(first / 12), (first % 12) + 1).start;
    const end = getItalyMonthBoundsUtc(Math.floor(last / 12), (last % 12) + 1).end;
    const [expenses, settings, assets, categories] = await Promise.all([
      fetchExpenses(userId, start, end), fetchSettings(userId), fetchAssets(userId), fetchExpenseCategories(userId),
    ]);
    return { expenses, todayIso: getItalyDateIso(now), categories, assets, settings, assetValueOf: calculateAssetValue };
  }
  ```

- **`lib/server/allocationAdvice/run.ts`**: `runStrategy(document, onStage, priorPlan, now)` — the call at `:363`
  @ ce26af4d passes `runAllocationAdviceStage`'s `now`. Before `enterStage`:

  ```ts
  const [bundle, cashflow] = await Promise.all([
    buildAssistantYtdContext(document.userId),
    fetchCashflowBlockInputs(document.userId, now),
  ]);
  const dataBlock = formatBundleForPrompt(bundle);
  const { expenses, ...input } = cashflow;
  const cashflowBlock = formatCashflowBlockForPrompt(buildCashflowBlock(expenses, input));
  // … enterStage, then buildStrategyPrompt(document.answers, dataBlock, { priorPlan, cashflowBlock })
  ```

  A rejection reaches the existing catch (`:371-380` @ ce26af4d): the stage fails at `'context'` with «Il percorso
  si è interrotto per un errore imprevisto. Riprova fra qualche istante.», retryable. `runInstruments`, `runReview`
  and `runRevise` do not read the block.
- **`lib/server/allocationAdvice/prompts.ts`**: `buildStrategyPrompt(answers: AllocationAdviceAnswers, dataBlock:
  string, opts: { priorPlan?: AllocationAdvicePriorPlan | null; cashflowBlock?: string } = {})`. `userContent`:
  the answers; the esaustivi sentence — byte-identical to today without a block, and with one «… PREVIDENZA, MUTUI,
  FAMIGLIA e CASHFLOW 12 MESI sono esaustivi. Il blocco CASHFLOW del periodo copre solo l'anno in corso: per entrate,
  spesa e risparmio usa il blocco CASHFLOW 12 MESI.»; `''`; `dataBlock`; then `''` + the block when non-empty; then
  `''` + the plan in force; then the closing request. `STRATEGY_CONTRACT`: § 1 becomes «1. **La situazione** — cosa
  vedi nel portafoglio di oggi e nel cashflow (entrate e loro concentrazione, spesa, capacità di risparmio) rispetto
  a orizzonte, tolleranza e obiettivi (2-4 frasi).», and decision 46's line is a new element right after the
  «Vincoli: …» element. `system` stays `${CONSULENTE_CORE}\n${STRATEGY_CONTRACT}`: the same for every user, with or
  without the block. `buildReviewPrompt` and `buildRevisionPrompt` do not change (AI-04 adds their `opts`).
- **`lib/server/assistant/prompts.ts`**: a private `CASHFLOW_BLOCK_NOTE` = «Il blocco CASHFLOW 12 MESI qui sotto
  copre gli ultimi 24 mesi fino a oggi, qualunque sia il periodo analizzato: le cifre del periodo vengono dai blocchi
  sopra; usalo per l'andamento recente, la capacità di risparmio e la sua stabilità, gli impegni ricorrenti e i
  conti.». `buildYearAnalysisPrompt`, `buildYtdAnalysisPrompt`, `buildHistoryAnalysisPrompt` gain a fifth parameter
  `cashflowBlock?: string`; their `userContent` array becomes
  `` …, numericBlock, ...(cashflowBlock ? [CASHFLOW_BLOCK_NOTE, cashflowBlock, ''] : []), `Domanda dell'utente: …` ``,
  byte-identical to today without it.
  `buildMonthAnalysisPrompt`, `buildChatPrompt`, `formatBundleForPrompt` and every `system` do not change.
- **`lib/server/assistant/anthropicStream.ts`**: `StreamAssistantResponseArgs` gains `cashflowBlock?: string | null`
  («the CASHFLOW 12 MESI block of the year, YTD and history analyses, 2026-11; null elsewhere»); `buildPrompt`
  (`:56` @ ce26af4d) gains it as its last parameter and passes it, as `cashflowBlock ?? undefined`, to the three
  builders (`:79-89` @ ce26af4d), never to the month builder or the chat.
- **`app/api/ai/assistant/stream/route.ts`**: two route-local declarations beside `fetchHistoryStartYear` (`:133`
  @ ce26af4d), then one statement after the bundle chain (`:217-245` @ ce26af4d):

  ```ts
  const CASHFLOW_BLOCK_MODES: readonly AssistantMode[] = ['year_analysis', 'ytd_analysis', 'history_analysis'];
  async function readCashflowBlock(userId: string, now: Date): Promise<string> {
    const { expenses, ...input } = await fetchCashflowBlockInputs(userId, now);
    return formatCashflowBlockForPrompt(buildCashflowBlock(expenses, input));
  }
  // after the bundle chain:
  const cashflowBlock = contextBundle && CASHFLOW_BLOCK_MODES.includes(body.mode)
    ? await readCashflowBlock(body.userId, new Date())
    : null;
  ```

  and `streamAssistantResponse({ …, cashflowBlock })` (`:311` @ ce26af4d). The `context` SSE event keeps sending
  `contextBundle` alone. A rejection reaches the route's outer catch: 500 «Impossibile avviare lo stream
  dell'assistente» (`:413` @ ce26af4d).

## 5. Constraints and traps (AGENTS.md rules, «here it means that»)

- **«Every expense window is an Italian calendar window»** (AGENTS.md § Assistant · Assistente) — here it means the
  bounds come from two `getItalyMonthBoundsUtc` calls (the 36 months cross years: `getItalyMonthRangeBoundsUtc` does
  not), the current month from `getItalyMonthYear(now)`, a row's month and day from `getItalyDateIso`; every suite
  runs in both zones.
- **The silent-cap rule** («a cap either does not exist or is stated in the text the model reads», AGENTS.md
  § Assistant · Assistente) — here it means every cut (sources, subcategories, commitments) prints its «e altre N»,
  the commitments' section names its start month, the medians name their months, the floor is named in the header.
- **`system` byte-identical** (README § 8) — here it means the block and the Assistente's note sit in `userContent`;
  the strategy contract's change is in `system` for everyone, proven by `toBe` between calls with and without the
  block and across users.
- **Key by id, label by name** (`doc/guide/cashflow.md` § Expense Grouping: key by id, label by name) — here it means
  sources and categories by `getCategoryKey`/`getSubCategoryKey`; a renamed category stays one line under its
  current name.
- **The sign convention** (`doc/guide/cashflow.md` § Expense Sign Convention and Type Changes) — here it means income
  signed, spending as magnitude by `type`, never classified by sign.
- **A series is materialised** (`doc/guide/cashflow.md` § Recurring Series) — here it means a commitment is read from
  its future rows, never from `recurringDay` arithmetic; an absent `recurringFrequency` is monthly; no row without
  `isRecurring` is ever inferred to be a series.
- **Window reads, not the whole history** (CLAUDE.md § Architecture Snapshot) — here it means 36 months by date, never
  the collection whole, whatever the account holds.
- **No owner data in a tracked file** (README § 8) — fixtures at noon Italian time, round amounts, generic names; the
  decoys of phase D are «Ornitorinco» and «Fenicottero».
- **The current month and the rows after today**: the series' last row and the current-month line count up to today;
  a 15 November run never shows 30 November's rent as paid.
- **January**: at `todayIso` `2026-01-15` the aggregates are 2025-01 → 2025-12 and the series 2024-02 → 2026-01.
- **A user with fewer than 12 months of rows**: the aggregates still say «in 12 mesi» (the window is the window), the
  series prints «nessuna riga» before the first row, the medians count from the first month with a row.
- **A shared-account viewer**: both routes pass the owner's id (`allocation-advice/run/route.ts:49-50,79` @ ce26af4d;
  the stream route's `body.userId` after `assertCanAccessAccount`), so the block reads the owner's rows.
- **Two reads of this year's rows per strategy**: the bundle and the block both query them; accepted, the bundle
  stays the Assistente's and untouched; written as a blind spot in `doc/guide/consulente.md` (§ 9).
- **Cases that do not change**: the demo account (neither the Consulente nor the Assistente runs there); a refund
  booked positive in a spending category (a magnitude, as in `buildCashflowBreakdown`); recurring income (only
  spending types recur, `canTypeRecur`); a row with `isRecurring` and no `recurringParentId` (a plain row: every
  occurrence written by `createRecurringExpenses` carries the id); a foreign-currency account (the injected balance
  is EUR); `includeDummySnapshots` (the block reads no snapshot).

## 6. Tests per level (with the mutation that proves each)

- **`__tests__/cashflowBlock.test.ts`** (new, pure, no `vi.mock`, `todayIso` `2026-11-15` unless stated):
  - the Italian month key of criterion 2. Mutation: `getUTCMonth()`.
  - the windows of criterion 3, and January (`todayIso` `2026-01-15`: aggregates 2025-01 → 2025-12, series
    2024-02 → 2026-01). Mutation: drop the `<= todayIso` cut.
  - the readings and HHI of criterion 4, the dividends apart, spending only → «nessuna entrata», the source cap at
    20 with «e altre N fonti». Mutation: the HHI thresholds; dividends as a source.
  - spending by type and key of criterion 5, typeless rows, the subcategory cap. Mutation: key by name.
  - savings with an instalment of criterion 6, a month with income 0 → «—». Mutation: interest only.
  - the 24-row series of criterion 7 with a gap and a floor. Mutation: months with rows only.
  - the quartiles of criterion 8 (the 1.000…2.100 € fixture, the outlier, 9 months, 2 months). Mutation: mean;
    medians from the window's start.
  - the commitments of criterion 9: one line per series, the legacy frequency, a yearly series, an amount change, an
    ended series, an instalment plan («rata 7 di 12», «prima rata il …»), the cap after sorting. Mutation: cut before
    sorting.
  - the loans of criterion 10: a recurring `debt` series with `debtAssetId` only under the loans, a payoff, a deleted
    loan, unlinked rows. Mutation: payoff in the median.
  - transfers, property transfers, fee rows, `excludeFromBudget` and `balancePending` rows of criterion 11.
    Mutation: the `countsTowardBudget` filter.
  - `buildCashAccountLines` of criterion 12. Mutation: the `assetClass` filter.
  - the printed block of criterion 13 (`toBe`), the singulars, no «-0 €». Mutation: drop a cut line.
- **`__tests__/assistantMonthContextService.test.ts`** (extend): the three `now` of criterion 14 — ONE `expenses`
  query, its two `date` bounds read back from `expenseWhereCalls` (`toDate().toISOString()`) equal to
  `getItalyMonthBoundsUtc(…).start/.end` of the first and last month; `todayIso`; `settings` holding the two
  defaults planted in `settingsDocGetMock`; `assetValueOf === calculateAssetValue`. Mutation: `now.getUTCMonth()`.
- **`__tests__/allocationAdvicePrompts.test.ts`** (extend): `:75` @ ce26af4d becomes `buildStrategyPrompt(ANSWERS,
  'DATI', { priorPlan: plan })`; with `{ cashflowBlock: '--- CASHFLOW 12 MESI (x) ---\nX' }` the user turn reads
  `'DATI\n\n--- CASHFLOW 12 MESI (x) ---\nX\n\n--- IL PIANO IN VIGORE'` with a plan; the esaustivi sentence with the
  block `toContain('FAMIGLIA e CASHFLOW 12 MESI sono esaustivi')`, without it `not.toContain('CASHFLOW 12 MESI')`;
  `system` `toBe` with and without the block; `system` `toContain` decision 46's line and the new § 1. Mutations: the
  block after the plan; the esaustivi words in `system`.
- **`__tests__/allocationAdviceRun.test.ts`** (extend): the factory at `:24` @ ce26af4d gains `fetchCashflowBlockInputs:
  cashflowMock`, resolved in both `beforeEach` with `{ expenses: [], todayIso: '2026-10-20', categories: [], assets:
  [], settings: null, assetValueOf: () => 0 }`; a whole run calls it ONCE with `('u1', now)`; the strategy call's
  user turn contains «--- CASHFLOW 12 MESI»; `runAllocationAdviceStage` for `instruments`, `review` and `revise`
  never calls it; rejected → the stage `failed` at `'context'`, retryable, the `stream` spy not called. Mutations:
  call it in `runInstruments`; swallow the rejection.
- **`__tests__/assistantPromptBundle.test.ts`** (extend): the three builders with `makeBundle()` and a block — the
  user turn holds the note and the block after the numeric block and before «Domanda dell'utente»; without it, the
  user turn `toBe` today's; `system` `toBe` with and without. Mutation: the block in `system`.
- **`__tests__/anthropicStream.test.ts`** (extend): `vi.mock('@/lib/server/assistant/prompts', …)` partial
  (`importOriginal`, `buildYtdAnalysisPrompt` a mock returning `{ system: 'S', userContent: 'U' }`); `mode:
  'ytd_analysis'` with a bundle object and `cashflowBlock: 'BLOCCO'` → the builder called with `'BLOCCO'` last;
  `mode: 'chat'` with `cashflowBlock: 'BLOCCO'` → the `create` call's messages do not contain it. Mutation: drop the
  forward.
- **`__tests__/assistantRoutes.test.ts`** (extend): the factory at `:75` @ ce26af4d gains
  `fetchCashflowBlockInputs: fetchCashflowBlockInputsMock` (resolved as in the run test); the admin mock answers
  `assetAllocationTargets` (`doc().get()` → `{ data: () => ({ cashflowHistoryStartYear: 2025 }) }`) for the history
  mode; `it.each` over the three modes with their bundle mock resolved → called once with `'user-1'`,
  `streamAssistantResponse` called with `cashflowBlock` containing «--- CASHFLOW 12 MESI», the stream text not
  containing it; `month_analysis` and a chat with `chatContext: 'ytd'` → not called, `cashflowBlock: null`; rejected
  → 500. Mutation: the chat branch reads it.
- **`__tests__/monthlyEmailService.test.ts`** (extend): `buildEmailAiPrompt`'s user content
  `not.toContain('CASHFLOW 12 MESI')`. Mutation: the block inside `formatBundleForPrompt`.
- **`__tests__/patrimonioSummary.test.ts`**: unchanged and green after the move.
- **`__tests__/reactCompilerCoverage.test.ts`**: unchanged (no component). **E2E**: none — the run and the stream are
  never opened by a probe (README § 8), and no screen changes.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared before A: «the strategy prompt and the Assistente's year, YTD and history prompts carry
the CASHFLOW 12 MESI block, read once per call; the month analysis, the chat and the emails do not; a failed read
fails visibly; every suite green in both zones; the strategy stage under 240 s on the mirror».

- **A — Invarianza**: before any new test, the existing suites green with only the three edits § 6 names
  (`allocationAdvicePrompts.test.ts:75`, the two mock factories): `TZ=Europe/Rome npx vitest run allocationAdvice
  assistant monthlyEmailService patrimonioSummary` and the same under `TZ=UTC`.
- **B — Cambio di contesto**: the new words the model reads are read with the owner on the diff of the two
  `prompts.ts` (the § 1 sentence, decision 46's line, the esaustivi sentence, `CASHFLOW_BLOCK_NOTE`) before C.
- **C — Comportamento nuovo**: `TZ=Europe/Rome npx vitest run cashflowBlock assistantMonthContextService
  allocationAdvicePrompts allocationAdviceRun assistantPromptBundle anthropicStream assistantRoutes monthlyEmailService
  patrimonioSummary`, the same under `TZ=UTC`, then the whole `npm test` in both zones; `npx tsc --noEmit`;
  `npm run lint`; `grep -n "lib/services\|lib/firebase\|patrimonioSummary" lib/utils/cashflowBlock.ts` → nothing.
  Every mutation of § 6 seen red once, then undone with the inverse edit.
- **D — Sotto la UI**: on the emulators (`npm run emulators`), a throwaway `__tests__/zz-emulator-cashflow-block.test.ts`
  (untracked, deleted in G; `vi.mock('server-only', () => ({}))` and `vi.mock('@/lib/firebase/config', () => ({ auth:
  { currentUser: null }, db: {} }))`), run alone with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-net-worth
  TZ=Europe/Rome npx vitest run zz-emulator-cashflow-block`. Through the real `adminDb` it plants, under the uid
  `cfb-user` with ids prefixed `cfb-` (never the seed's): the settings (a dividend category, the two default
  accounts); two cash accounts, a loan, a property, with the fields `calculateAssetValue` reads; the categories;
  14 months of invented rows — a monthly salary, an income category «Ornitorinco» in 3 different months, a dividend
  row, a monthly spending series «Fenicottero» with rows after today, a `debt` series with `debtAssetId` on the loan,
  one transfer onto the property, one month with no row, one current-month row after today. It calls the REAL
  `fetchCashflowBlockInputs('cfb-user', new Date('2026-11-15T10:00:00Z'))` → `buildCashflowBlock` →
  `formatCashflowBlockForPrompt` and asserts figures written as constants BEFORE the run, computed by hand from the
  planted rows: the income total and its dividends, «Ornitorinco» with its share and «(3)», the reading and the HHI,
  «Fenicottero» as ONE commitment with its next date, the loan's median and next date, the gap month's «nessuna
  riga», the property transfer, the scheduled row, the two accounts with their roles. `afterAll` deletes every
  planted document. While the file exists the whole `npm test` is not run (it needs the emulators).
- **E — Casi negativi**: the failed read (C: the run test → failed retryable stage, the route test → 500); no new
  access path — the block is read with the `userId` `assertCanAccessAccount` already checked, and the 403 tests of
  `allocationAdviceRoutes` and `assistantRoutes` stay green.
- **F — Giro guidato** (at the owner's «pronto», the only real spend): `npm run mirror:seed -- <email>` and the app
  on the emulators with the owner's key (WORKFLOW.md § 3, Obligation 5). Two temporary logs:
  `console.info('[consulente] strategy timing', { blockChars, ms })` around the strategy's model call and
  `console.info('[assistant/stream] cashflow block', { mode, chars })` in the route. The owner runs the Consulente
  once and asks one question on the Assistente's «YTD» tab; the logs show the block in both; the strategy stage under 240 s
  (`maxDuration` is 300 — above 240 s the measure goes to the owner before the commit); the owner reads «La
  situazione» for income concentration, spending and savings capacity, the goals' `monthlyContribution` against the
  block's median savings (decision 46), and the Assistente's answer for the recent trend.
- **G — Ripristino**: the two logs removed (`git diff` shows neither), the throwaway deleted, a query on
  `userId == 'cfb-user'` over `expenses`, `assets` and `expenseCategories` returns nothing, `npm run mirror:remove`.

## 8. Putting it into service

Branch `feat/cashflow-block`, one commit `feat(ai): the 24-month cashflow block in the Consulente's strategy and the
Assistente's year, YTD and history analyses`, PR to `develop`. No flag. The Vercel preview never calls
`/api/allocation-advice/run` nor an analysis (both spend): phase F on the mirror is the proof.

## 9. Documentation (the sentences that become false, and what replaces them)

- **`doc/guide/consulente.md`**:
  - § The run, first bullet (`:60-61` @ ce26af4d): «the context is the YTD bundle of the Assistente
    (`buildAssistantYtdContext` + `formatBundleForPrompt`, portfolio block included);» becomes «the context is the YTD
    bundle of the Assistente (`buildAssistantYtdContext` + `formatBundleForPrompt`, portfolio block included) and the
    CASHFLOW 12 MESI block, read beside it before the strategy stage (2026-11);». A new bullet after it states the
    block's rules: `lib/utils/cashflowBlock.ts` (pure) read by `fetchCashflowBlockInputs(userId, now)` in ONE query;
    the 12 full Italian months, the current month up to today apart with its scheduled rows declared, the 24-month
    series, the rows to month + 12 for the commitments only; income signed, dividends out of the sources; the reading
    on the first source's share with the HHI printed; spending by type and by category id, instalments counted whole;
    medians from the first month with a row, never before `cashflowHistoryStartYear`, none under 3 months; the
    commitments by series and plan, the loans by `debtAssetId`, the transfers apart; the accounts with the injected
    balance and their roles; a failed read fails the stage, retryable; the contract sizes `monthlyContribution` and
    the reserve on it.
  - § Files, «Pure» (`:16-20` @ ce26af4d) gains `lib/utils/cashflowBlock.ts` (shared with the Assistente's three
    analyses); «Suites to run» (`:29-31` @ ce26af4d) gains `cashflowBlock` and `assistantMonthContextService`.
  - § Per-page blind spots gains: «**The strategy reads this year's rows twice** (2026-11): the YTD bundle and the
    cashflow block query them apart — accepted, the bundle stays the Assistente's, and the block is read once per
    strategy, never by the instruments or the review.»
- **`doc/guide/assistente.md`**:
  - § Context service, «**One aggregator, not two**» (`:30-32` @ ce26af4d) — false once the analyses carry a second
    cashflow figure — becomes «**One aggregator per block, not two**: every figure of the BUNDLE comes from a single
    `buildCashflowBreakdown` call per builder, so `Σ expensesByCategory[].total === cashflow.totalExpenses` holds
    structurally. `transactionCount` **excludes transfers**, and a new required bundle field means updating ALL 4
    builders (month/year/ytd/history). The CASHFLOW 12 MESI block the year, YTD and history prompts carry beside the
    bundle (2026-11) is built by `buildCashflowBlock` on its own 24-month read (`fetchCashflowBlockInputs`) and never
    enters the bundle, the `context` SSE event or the emails.»
  - § Prompt builders gains: «**The year, YTD and history builders take `cashflowBlock` as their fifth argument**
    (2026-11): printed after the numeric block under a note saying it covers the last 24 months whatever the period,
    before «Domanda dell'utente»; the month builder, the chat and `buildEmailAiPrompt` never receive it; `system` is
    the same with or without it.»
  - The header's module list (`:5` @ ce26af4d) becomes
    `lib/utils/{assistantNarrative,assistantPeriodOptions,cashflowBlock,expenseBreakdown,goalProposal}.ts`; § Files,
    Assistant (`:15` @ ce26af4d): «over `lib/utils/expenseBreakdown.ts` (`buildCashflowBreakdown`)» gains
    «and `lib/utils/cashflowBlock.ts` (the CASHFLOW 12 MESI block, its rules in doc/guide/consulente.md § The run)»;
    the Suites (`:17` @ ce26af4d) gain `cashflowBlock` and `anthropicStream`.
- **AGENTS.md** § Assistant · Assistente, the second bullet (`:475` @ ce26af4d), rewritten in place (net 0 lines):
  «- ONE aggregator (`buildCashflowBreakdown`) per bundle builder; a new required bundle field means updating ALL 4
  builders; the CASHFLOW 12 MESI block (`lib/utils/cashflowBlock.ts`, 2026-11) is its own read beside the bundle, in
  the `userContent` of the year/ytd/history analyses and of the Consulente's strategy, never in the emails. `system`
  is byte-identical per mode — never interpolate per-request data; `cache_control` deliberately NOT used.» The
  Consulente stub (`:451`, `:455`) is not touched here: AI-04 rewrites it.
- **CLAUDE.md**: the Allocazione line (`:42` @ ce26af4d) ends «… and a date to review it by; the strategy reads the
  24-month cashflow block (2026-11). doc/guide/consulente.md.»; the Assistente AI line (`:45` @ ce26af4d) reads «(2026-10-20:
  instruments, roles, ledger, registers, household; the year, YTD and history analyses also the 24-month cashflow
  block, 2026-11)»; § Key Files «Shared primitives / utils» (`:74` @ ce26af4d) gains `cashflowBlock.ts`
  (`buildCashflowBlock`); «Latest» is replaced by the session's one line.
- **`doc/ai/README.md`** § 6: AI-02 «implemented on <date>».
- **`Draft Release Temp.md`**, two entries prepended to «## 🔧 Improvements»: «- **Allocazione — Consulente, il
  cashflow** — Improved what the strategy reads: besides the portfolio, your cashflow of the last two years (income
  and how concentrated it is, spending by category, the monthly savings and how steady they are, the recurring
  commitments and loan instalments, the balance of your accounts), so the goals' monthly contributions and the cash
  reserve rest on what you actually save.» and «- **Assistente AI — il cashflow nelle analisi** — Improved the year,
  year-to-date and history analyses: they also read your cashflow of the last 24 months, so an answer about a period
  can compare it with your recent income, spending, savings and commitments.»
- `doc/guide/cashflow.md`: nothing becomes false.

## 10. Declared out of scope (decision 22: each item decided)

- Income by household member: never in this block (decision 25).
- The interview's use of the block: AI-04 (it calls `fetchCashflowBlockInputs`, `buildCashflowBlock` and
  `formatCashflowBlockForPrompt` as `runStrategy` does).
- The review, the revision and the instrument search do not receive the block (they read the strategy's markdown,
  which carries the cashflow reading), and neither do the month analysis, the chat, Registra and the emails
  (decision 27 names the receivers).
- The register's accounts: AI-05 reuses `buildCashAccountLines`.

## 11. The prompt that implements it

In Italian, the owner's words (decision 34).

```
Leggi WORKFLOW.md, AGENTS.md (§ Commands, § Assistant · Assistente, § Allocazione › Consulente),
doc/guide/consulente.md (§ Files, § The run, § Per-page blind spots), doc/guide/assistente.md (§ Files, § Context
service, § Prompt builders), doc/guide/cashflow.md (§ Expense Grouping: key by id, label by name, § Expense Sign
Convention and Type Changes, § Recurring Series), doc/guide/e2e-emulatori.md (§ Emulator Exercise Scripts),
doc/ai/README.md § 3, § 4, § 7 e § 8, e doc/ai/AI-02-blocco-cashflow-consulente.md. Implementa AI-02 così com'è
scritta: il modulo puro lib/utils/cashflowBlock.ts con i nomi della § 4 (identici: sono contratti condivisi con AI-04
e AI-05), isCashAccount spostato in types/assets.ts, fetchCashflowBlockInputs nel servizio di contesto, il blocco nella
strategia del Consulente e nelle analisi anno, YTD e storico dell'Assistente (mai nel mese, nella chat, nelle email),
la riga della decisione 46 parola per parola, ogni test della § 6 con la sua mutazione vista rossa una volta. Vitest in
Europe/Rome E in TZ=UTC, tsc, lint. Collaudo: § 7 della spec, la fase D con lo script usa e getta sull'emulatore, la
corsa vera una sola volta, sul mirror, al mio «pronto». Ti fermi e mi chiedi se un test esistente diventa rosso per
una ragione che la spec non prevede, se una cifra della fase D non torna con quella dichiarata prima, se la strategia
supera i 240 s. Un branch, un commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **high**. Estimated size: 1 session, ~4 h; ~450 lines of pure module, ~400 of tests,
~80 of server and prompt changes, ~25 of docs.
