# NOVE-23 — Accumulo: a sale's month in the calendar, the review month, the account for the investments

> Series `doc/nove/` (README.md § 5): **depends on NOVE-16, NOVE-17, NOVE-18 (retired) and on NOVE-21's retirement** (retired on 2026-11-19, PR #553)
> (the plan document, `computeUsableLiquidity`, `scheduleInstallments`, `buildRevisedPlan`, the matcher, the
> editor's sales). First of the five specs of «dal Consulente al piano di accumulo, in un clic» (owner, 2026-11-18):
> **23 → 24 → 25 → 22 → 26**. It changes the ENGINE and one setting, nothing of the Consulente: NOVE-24 writes the
> operating plan, NOVE-25 turns it into a plan with one click on the contracts this spec leaves (README § 7).
> Written on 2026-11-19; every `file:line` is cited on `develop` @ 7909fa4c. Executes decisions 68, 69, 75, 93, 95
> (README.md § 3).

## 1. The problem today (evidence on the code)

**A sale's month is written and ignored.** `PlanDisposal.monthIndex` exists (`types/accumulationPlan.ts`), the
revision can move a saved sale to another instalment (`diffRevisionDisposals`,
`lib/utils/accumulationPlanUtils.ts:487-512`), and three readers honour it: `buildProjectedAssets` (`:878`, the
class trajectory), the Consulente's block (`lib/server/allocationAdvice/prompts.ts:298`) and the kept-sale warning.
The money does not:

- `computeUsableLiquidity` sums EVERY open sale's proceeds into `disposalProceedsEur` (`:150-152`), lets them refill
  the reserve (`:159`) and puts them whole into `L` (`:166`), whatever the month;
- `scheduleInstallments` spreads `L` evenly: `total / buyingMonths` (`:261`) — a sale of the seventh month is
  spent from the first;
- `recalibrateInstallment` counts every open sale in the month's cash ceiling (`:369`);
- the matcher holds `const DISPOSAL_MONTH_INDEX = 1` (`lib/utils/accumulationPlanMatching.ts:135`, `:166`) and the
  tile `const isLateRow = currentIndex > 1` (`components/allocation/tiles/QuestoMeseTile.tsx:742`): a sale planned
  for the seventh month reads «In ritardo» from the second;
- a NEW sale of a revision is forced onto the first revised instalment (`monthIndex: k`,
  `accumulationPlanUtils.ts:568`);
- the editor offers the month only for a saved sale of a revision (`savedOpenSaleIds.has(…) ? <SaleMonthSelect>`,
  `components/allocation/AccumulationPlanDialog.tsx:1277`); a new sale reads «ricavo al mese 1»
  (`ACCUMULO_STEP2_SALE_PROCEEDS`, `lib/utils/accumulationNarrative.ts:652`);
- `accumulationPlanSchema.ts:50` accepts any integer as `monthIndex`, and `validateDraftAgainstAssets` never looks
  at it: a draft may carry a sale past its last instalment.

Invented figures: 12 months, 500 € a month, 1.200 € above the reserve, a sale of 2.400 € in month 1 and one of
6.000 € in month 7. Today `L` = 15.600 € and every instalment is 1.300 €: by the end of month 6 the plan has spent
7.800 € with 6.600 € arrived — 1.200 € taken from the reserve the plan «never touches».

**A plan has no moment to be looked at again.** The only date is the allocation's `reviewByIso`
(`planEndsAfterReview`, `lib/utils/accumuloMonth.ts:76-82`), which warns when the plan ENDS after it. Nothing says
«this month, look at the plan again».

**A new plan never knows which account pays.** `emptyDraft` starts on `sourceCashAssetIds: []`
(`AccumulationPlanDialog.tsx:235`); the settings know a debit and a credit account
(`types/assets.ts:465-466`, the tile «Conti di default» in `components/settings/tabs/SpeseTab.tsx:448-497`), none for
the investments. A plan created without a question (NOVE-25) has nowhere to read it.

## 2. Goal and acceptance criteria

1. A sale's proceeds enter the instalments from the sale's month: on the figures of § 1 the instalments are 800 €
   in months 1–6 and 1.800 € in months 7–12, total 15.600 €. **Proof**: U1, U2.
2. A plan with no sale after its first month schedules EXACTLY as today: `monthShares` is `null` and every figure
   of the existing suites is unchanged. **Proof**: U3 and the existing `accumulationPlanUtils`,
   `accumulationPlanRevision`, `accumulationPlanService`, `accumuloSummary` suites, green without an edit to an
   expected figure.
3. At every month `m` of the months scheduled the cumulative planned spend is at most `max(0, source cash − reserve
   + Σ proceeds of the sales due by month m + inflow × m)`: the reserve is never planned under, and a sale in a
   later month refills what is still missing of it before a euro of it is invested (decision 93). **Proof**: U2
   (property test on 200 seeded cases), U14.
4. A sale is «In programma» before its month, «Da fare» in it (and before the plan starts when it is a month-1
   sale, as today), «In ritardo» from the next; a ledger sale made early still proposes the match. **Proof**: U5,
   E1.
5. «Questo mese» shows an «In programma» sale with its month and no action. **Proof**: R1, E1.
6. The monthly recalibration counts only the sales due by the open month. **Proof**: U4.
7. A revision keeps the month of a new sale (not before the first revised instalment); a sale past the last
   instalment is refused with a sentence, in a draft and in a revision. **Proof**: U6, U7.
8. The editor offers «Vendi a» on every open sale, in a new plan too, and its preview states the instalment that
   changes; the draft's verdict no longer says «N rate da X €» when the instalments differ. **Proof**: U13, U15,
   R2, E2.
9. A plan may carry `reviewMonthIndex`; in that month «Questo mese» shows the review note with «Rivedi il piano»,
   until a revision is saved in that month. **Proof**: U8, R3, E3.
10. Impostazioni › Spese › «Conti di default» has «Conto per gli investimenti»; saved, it survives a hard refresh;
    cleared, it stays cleared. **Proof**: U9, U10, E4.
11. A new plan in the editor starts with that account ticked when it still is a source account. **Proof**: U11, R4.
12. `perf:budget` and `mobile:budget` close by README § 8's rules. **Proof**: § 7 G.

## 3. Decisions

- **Owner 68 (2026-11-19)**: «Il mese di una vendita conta nel calendario»: its proceeds enter the instalments from
  its month; «Questo mese» proposes it in that month, late from the next.
- **Owner 69 (2026-11-19)**: «Quando riallocare» is a review month the Consulente indicates; in that month «Questo
  mese» shows a note with «Rivedi il piano»; no phases with different quotas.
- **Owner 75 (2026-11-19)**: a new setting «Conto per gli investimenti», ONE account, in Impostazioni › Spese beside
  the debit and credit defaults (his proposal: «conto predefinito per liquidità investimento»).
- **Owner 93 (2026-11-19, the adversarial reading)**: a sale in a later month refills FIRST what is still missing
  of the reserve when it arrives, and only the rest enters the instalments from that month — the rule of
  2026-11-17 («the reserve is refilled before anything is bought») holds for every sale, a money-market fund's
  too. It replaces this spec's first M2 («a later sale is only invested»).
- **Owner 95 (2026-11-19, the adversarial reading)**: the editor's step-2 column «Al mese» stays the even average
  it is today («Da comprare» ÷ the months), declared: the editor is deleted by NOVE-26, and the true figures are
  the side panel's (the first instalment and the `describeSaleStep` sentences).
- **Adopted, reversible (this spec)**:
  - M1. Each tranche of money is spent EVENLY from the month it arrives to the last: the base (cash above the
    reserve, month-1 sales, inflows — what the refill leaves of them) from the first buying month, what the refill
    leaves of a later sale from its own month. The alternative — the smoothest path under the cash ceiling — gives
    the same figures whenever today's spread is feasible and is harder to state in one sentence.
  - M2. The refill runs in the order the money arrives (decision 93): the sales due by the first month; then,
    month by month, a later sale BEFORE that month's inflow. `L` is therefore today's figure whatever the months
    of the sales — only WHEN it is spent changes.
  - M3. The sale's month is counted from the plan's first month (`monthIndex`, absent = 1), as stored today; no
    migration.
  - M4. A new line state `'upcoming'` («In programma»); it wears the muted chip, like `todo`.
  - M5. The review note shows only in the review month and disappears once a revision is saved in that month; it is
    not a warning (muted text, the action beside it).
  - M6. `reviewMonthIndex` has no control in the editor: it is written by NOVE-25's click and by a planted
    document; a hand revision keeps it.
  - M7. The setting's field is `investmentCashAssetId`; the select lists the accounts of `isPlanSourceAccount`
    (type and class `cash`), the same list as the two defaults.
  - M8. The server does not read the setting in this spec (five places, not six): NOVE-24 adds the server reader it
    needs.

## 4. Solution

### 4.1 Types and schema (`types/accumulationPlan.ts`, `lib/utils/accumulationPlanSchema.ts`, `accumulationPlanDoc.ts`)

```ts
// types/accumulationPlan.ts — AccumulationPlan gains one field; AccumulationPlanDraft picks it.
/** The plan month the Consulente asked to look at the plan again (1..months); absent = none. */
reviewMonthIndex?: number;

export type AccumulationPlanDraft = Pick<
  AccumulationPlan,
  'name' | 'startMonth' | 'months' | 'liquidity' | 'positions' | 'disposals' | 'optimizerSnapshot' | 'reviewMonthIndex'
>;
```

- `planDisposalSchema.monthIndex` becomes `z.number().int().min(1).optional()`;
  `accumulationPlanDraftSchema` gains `reviewMonthIndex: z.number().int().min(1).optional()`.
- `docToAccumulationPlan` maps `reviewMonthIndex: data.reviewMonthIndex as number | undefined`.
- `createDraftPlan` and `updateDraftPlan` write `reviewMonthIndex: draft.reviewMonthIndex` beside
  `optimizerSnapshot` (`lib/services/accumulationPlanService.ts:159`, `:189`): `roundPlanEuros` is
  `removeUndefinedDeep`, so an undefined key is never written and an update leaves the stored value where it is
  (U12).
- A `reviewMonthIndex` past `months` is not an issue of the draft: `isPlanReviewDue` (§ 4.3) never shows it.
- `PlanDisposal`'s comments say «sold in its month (`monthIndex`, absent = 1)» and «a revision keeps a new sale's
  month, never before the first revised one».
- No rule changes: `firestore.rules` checks the owner, not the fields.

### 4.2 The engine (`lib/utils/accumulationPlanUtils.ts`)

```ts
/** The plan month a sale falls in, counted from the plan's first month; absent = month 1. */
export function disposalMonthIndex(disposal: Pick<PlanDisposal, 'monthIndex'>): number {
  return disposal.monthIndex ?? 1;
}

/**
 * Each tranche is spent evenly from the month it arrives to the last: the base from the first buying
 * month, what the refill left of a later sale from its own. Null when no later sale leaves a tranche: the
 * caller keeps the even spread it always had. `offset` is 0-based inside the months scheduled.
 */
function spreadMonthShares(
  baseEur: number, later: Array<{ offset: number; eur: number }>, months: number, refillMonths: number,
): number[] | null {
  const totalEur = baseEur + later.reduce((sum, tranche) => sum + tranche.eur, 0);
  if (later.length === 0 || months < 1 || totalEur <= 0) return null;
  const euros = new Array<number>(months).fill(0);
  const spread = (eur: number, from: number) => {
    const start = Math.min(Math.max(0, from), months - 1);
    for (let m = start; m < months; m++) euros[m] += eur / (months - start);
  };
  spread(baseEur, refillMonths);
  for (const tranche of later) spread(tranche.eur, tranche.offset);
  return euros.map((eur) => eur / totalEur);
}
```

`UsableLiquidity` gains two fields and `computeUsableLiquidity` one parameter, `firstIndex = 1` (the plan month of
the first month scheduled: 1 at activation and in the preview, `k` in a revision, the open index in a
recalibration):

```ts
/** Σ proceeds of the open sales due by the first month scheduled: they arrive at once. */
dueProceedsEur: number;
/** Each month's share of L (Σ = 1) when a later sale leaves a tranche; null = the even spread. */
monthShares: number[] | null;
```

```ts
const open = disposals.filter((d) => d.status !== 'executed' && d.status !== 'skipped');
const disposalProceedsEur = open.reduce((sum, d) => sum + d.estimatedProceedsEur, 0);   // every open sale, as today
// 0 = due by the first month scheduled; a sale past the last month is the validator's issue, clamped here.
const offsetOf = (d: PlanDisposal) => Math.min(Math.max(0, disposalMonthIndex(d) - firstIndex), Math.max(0, monthsRemaining - 1));
const dueProceedsEur = open.filter((d) => offsetOf(d) === 0).reduce((sum, d) => sum + d.estimatedProceedsEur, 0);
const inflowTotalEur = liquidity.monthlyInflowEur * monthsRemaining;
const L0 = availableNowEur + disposalProceedsEur;
const shortfallEur = Math.max(0, liquidity.reserveEur - sourceCashEur);
// The refill, in the order the money arrives (decision 93): the sales due; then, month by month, a later
// sale BEFORE that month's inflow. What a later sale has left is its tranche; a month whose inflow refills buys nothing.
let gapEur = Math.max(0, shortfallEur - dueProceedsEur);
let refillMonths = 0;
const later: Array<{ offset: number; eur: number }> = [];
for (let m = 0; m < monthsRemaining; m++) {
  for (const d of open) {
    if (m === 0 || offsetOf(d) !== m) continue;
    const refillEur = Math.min(gapEur, d.estimatedProceedsEur);
    gapEur -= refillEur;
    if (d.estimatedProceedsEur - refillEur > 1e-9) later.push({ offset: m, eur: d.estimatedProceedsEur - refillEur });
  }
  if (gapEur > 1e-9) {
    gapEur -= Math.min(gapEur, liquidity.monthlyInflowEur);
    refillMonths = m + 1;
  }
}
const L = availableNowEur + Math.max(0, disposalProceedsEur + inflowTotalEur - shortfallEur);   // today's line, unchanged
const monthShares = spreadMonthShares(L - later.reduce((sum, t) => sum + t.eur, 0), later, monthsRemaining, refillMonths);
```

`disposalProceedsEur` keeps meaning «every open sale» (the draft box «Vendite fuori piano» reads it,
`QuestoMeseTile.tsx:420`) and `L` is today's expression: every sale, whatever its month, refills before it is
invested, so the total a plan spends does not depend on the months (M2) — `plannedEur`
(`lib/utils/accumuloSummary.ts:415-422`) is NOT touched. With no later sale the loop gives today's `refillMonths`
(`min(months, ⌈gap ÷ inflow⌉)`, the months when the inflow is 0), `later` is empty and `monthShares` is `null`:
criterion 2. By construction a tranche's `offset` is never below `refillMonths` (a later sale leaves a tranche only
when the gap is closed), so no share is positive in a month that refills.

`scheduleInstallments` gains a last parameter `monthShares: number[] | null = null`; inside the month loop the
refill months are skipped as today (`if (m <= refill) break;`, `:259`) and one line changes:

```ts
const share = monthShares ? (monthShares[m - 1] ?? 0) : null;
// …
const budget = (share === null ? total / buyingMonths : total * share) + carry[s.positionId];
```

Nothing else in the function changes (the last month's sweep and `residualEur` as today). The three callers pass
`liquidity.monthShares`: `activatePlan` (`lib/services/accumulationPlanService.ts:235`), `buildDraftPreview`
(`accumulationPlanUtils.ts:1075`), `buildRevisedPlan` (`:581`, which also calls
`computeUsableLiquidity(…, revision.remainingMonths, deps, k)`).

`buildDraftPreview` gains `firstIndex?: number` in its input (default 1) and passes it to
`computeUsableLiquidity(draft.liquidity, assetsById, liveDisposals, draft.months, deps, firstIndex)` and to
`scheduleInstallments(totals, states, draft.months, draft.startMonth, firstIndex, liquidity.refillMonths,
liquidity.monthShares)`: a revision's draft counts its months from `k` while a sale's `monthIndex` is counted from
the plan's first month (M3) — ONE frame, the plan's.

`recalibrateInstallment` (`:350-381`) calls `computeUsableLiquidity(…, monthsRemaining, deps, index)`; its ceiling
(`:369`) reads `liquidity.dueProceedsEur` in place of `liquidity.disposalProceedsEur`; its budgets (`:373`) read
`liquidity.monthShares ? (totals[s.positionId] ?? 0) * liquidity.monthShares[0] : <today's expression>`. The
ceiling stays a guard: with budgets from `monthShares[0]` it never binds, so no test turns it red (U4 asserts the
quantities and `dueProceedsEur`).

`summarizeDraftTotal` (`lib/utils/accumuloSummary.ts:373-378`) also returns `firstEur: number | null` —
`liquidity.L × liquidity.monthShares[liquidity.refillMonths]` when `monthShares` is set, `null` otherwise;
`AccumuloTab` (`:190-197`) passes it as `draftFirstEur`, `resolveAccumuloVerdictInput`'s draft branch
(`accumuloSummary.ts:74-81`) returns it as `firstEur`, and the draft headline
(`lib/utils/accumulationNarrative.ts:1030`) reads, when `firstEur` is not null, «Bozza pronta: {n} rate da
{mese}, la prima di {firstEur €}.» in place of «… {n} rate da {€} da {mese}.» (U15).

`buildRevisedPlan`: a new sale keeps its month — `monthIndex: Math.max(k, disposal.monthIndex ?? k)` in place of
`monthIndex: k` (`:568`) — and one past the end is refused with the existing issue:

```ts
if (revision.disposals.some((d) => (d.monthIndex ?? k) > months)) return { ok: false, issue: 'sale_month_range' };
```

The comment of `PlanRevisionInput.disposals` (`:466`) says «the NEW disposals, each in its month (never before the
first revised one)».

`PlanRevisionInput` gains `reviewMonthIndex?: number | null` (absent = keep the plan's, `null` = clear): the
returned plan carries `reviewMonthIndex: revision.reviewMonthIndex === undefined ? plan.reviewMonthIndex :
revision.reviewMonthIndex ?? undefined`, and `revisePlan` writes it only when the input names it (`deleteField()`
for `null`).

`validateDraftAgainstAssets(draft, assetsById, firstIndex = 1)` gains its third parameter and one issue, after the
disposal checks — the draft's months are counted from `firstIndex`:

```ts
if (disposalMonthIndex(disposal) > firstIndex - 1 + draft.months) {
  issues.push({ code: 'sale_month_out', assetId: disposal.assetId,
    message: describeDraftIssue({ code: 'sale_month_out', label: labelOf(disposal.assetId, assetsById) }) });
}
```

`revisePlan` keeps calling the validator on the revised plan (its `months` are the whole plan's: `firstIndex` 1).

### 4.3 The matcher and the review month (`accumulationPlanMatching.ts`, `accumuloMonth.ts`)

`LineUiState` gains `'upcoming'`. The disposal branch (`:134-168`) drops the constant:

```ts
const saleIndex = disposalMonthIndex(disposal);
// … the candidates as today: a real sell on/after activation matches whatever the month …
} else {
  lineStates[key] = currentIndex > saleIndex ? 'late' : saleIndex > Math.max(currentIndex, 1) ? 'upcoming' : 'todo';
}
```

A month-1 sale before the plan starts (`currentIndex` 0) stays `todo`: the sale may be made as soon as the plan is
active, so the first instalment finds the cash. The matcher's comment (`:134`, «a disposal is sold at month 1 of
the plan») is rewritten to the sale's own month.

```ts
// lib/utils/accumuloMonth.ts
/** The plan asks to be looked at again this month: its review month is the open one and no revision was saved in it. */
export function isPlanReviewDue(
  plan: Pick<AccumulationPlan, 'reviewMonthIndex' | 'months' | 'revisions' | 'status'>,
  currentIndex: number,
  currentMonth: MonthKey,
): boolean {
  const review = plan.reviewMonthIndex;
  if (plan.status !== 'active' || !review || review > plan.months || review !== currentIndex) return false;
  return !(plan.revisions ?? []).some((revision) => toMonthKey(revision.at) === currentMonth);
}
```

### 4.4 Copy (`lib/utils/accumulationNarrative.ts`)

```ts
// ACCUMULO_LINE_STATUS_LABEL gains: upcoming: 'In programma'
export const ACCUMULO_REVIEW_DUE_NOTE =
  'Il Consulente ha indicato questo mese per rivedere il piano: guarda se quote e rata vanno ancora bene.';
// DraftIssueCode gains 'sale_month_out'; DraftIssueContext gains { code: 'sale_month_out'; label: string };
// describeDraftIssue gains:
case 'sale_month_out':
  return `La vendita di «${context.label}» è fissata oltre l’ultima rata: scegli un mese del piano.`;

/** «Da luglio la rata sale a 1.800 €: entra il ricavato di Fondo X.» — one sentence per month with a later sale. */
export function describeSaleStep(input: { month: MonthKey; instalmentEur: number; names: string[] }): string {
  // compact: no decimals («1.800 €»)
  return `Da ${monthLabelLong(input.month, false)} la rata sale a ${cachedFormatCurrencyEUR(input.instalmentEur, true)}: `
    + `entra il ricavato di ${input.names.join(', ')}.`;
}
```

The sentences are built by ONE pure helper, in `lib/utils/accumuloSummary.ts`:

```ts
/** One entry per month, after the first scheduled, in which an open sale leaves the instalment larger than the month before. */
export function listSaleSteps(input: {
  installments: Installment[];          // the months scheduled, in order: installments[0] is plan month `firstIndex`
  disposals: PlanDisposal[];
  firstIndex: number;
  nameOf: (assetId: string) => string;
}): Array<{ month: MonthKey; instalmentEur: number; names: string[] }>
```

For every distinct `disposalMonthIndex(d) > firstIndex` of the open sales (not executed, not skipped), in month
order: the instalment of that plan month (`installments[index − firstIndex]`), `instalmentEur` = Σ of its lines'
`plannedAmountEur`, `names` in the disposals' order; an entry is kept only when `instalmentEur` is larger than the
previous instalment's by more than 0,005 € (a sale the refill took whole changes no instalment: no sentence).

`ACCUMULO_STEP2_SALE_PROCEEDS` («ricavo al mese 1») and `ACCUMULO_STEP2_SALE_NOT_EXECUTED` are deleted with their
only uses.

### 4.5 «Questo mese» (`components/allocation/tiles/QuestoMeseTile.tsx`)

- The sale rows (`:736-835`): `isLateRow = currentIndex > disposalMonthIndex(disposal)`; a row whose state is
  `upcoming` shows the chip and, at the end of its caption, ` · ${monthLabelShort(addMonths(plan.startMonth,
  disposalMonthIndex(disposal) - 1))}`; it renders NO action (no «Registra», «Segna eseguita», «Salta»). The comment
  `:735` says «sold in their month».
- An early ledger sale the reader dismisses stays «In programma»: `effectiveLineState(rawState, key, ignored,
  isLate, isUpcoming = false)` (`components/allocation/tiles/accumuloShared.tsx:23`) returns `'upcoming'` for an
  ignored `toConfirm` when `isUpcoming`; the sale rows pass `isUpcoming = disposalMonthIndex(disposal) >
  Math.max(currentIndex, 1)` (the buy lines pass nothing).
- The review note, in the active view above the footer's actions (`:860`), when `isPlanReviewDue(plan,
  currentIndex, toMonthKey(today))`:
  `<p className="text-[12px] text-muted-foreground">{ACCUMULO_REVIEW_DUE_NOTE}</p>` followed by a `Button
  variant="link"` «Rivedi il piano» that runs the footer button's handler (`setReviseFromModel(false);
  setReviseOpen(true)`), disabled as that button is (demo, no intact instalment). `QuestoMeseTile` gains the prop
  `today: Date`: `AccumuloTab` passes the `today` of `useOpenAccumuloPlan` (`AccumuloTab.tsx:121`, the day
  `currentIndex` is read on) — never the `new Date()` the tile builds in render for its measurement (`:198`).

### 4.6 The editor (`components/allocation/AccumulationPlanDialog.tsx`, `PlanDraftSidePanel.tsx`)

- `SaleMonthSelect` (`:1655-1684`, exported for its test) on every sale row that is not locked
  (`!lockedSaleIds.has(disposal.assetId)`), in a new plan and in a revision; its label is «Vendi a» alone. In a new
  plan `firstIndex` is 1. A sale added in a revision starts at the first revised month: `updateDisposals` (`:543`)
  sets `monthIndex: firstRevisedIndex` on a disposal that has none when `revise`, and the select reads `current =
  disposal.monthIndex ?? firstIndex` (today `?? 1`, `:1661`).
- `diffRevisionDisposals` already carries a new sale's `monthIndex`; `buildRevisedPlan` now keeps it (§ 4.2).
- **One frame in a revision**: the dialog's three computations on the draft pass `firstRevisedIndex` (`:472`; 1 in
  a new plan) — `computeUsableLiquidity(…, draft.months, DEPS, firstRevisedIndex)` (`liquidity`, `:421`),
  `validateDraftAgainstAssets(draft, assetsById, firstRevisedIndex)` (`issues`, `:426`) and `buildDraftPreview({ …,
  firstIndex: firstRevisedIndex })` (`preview`, `:725`; `settledPreview`, `:791`). Without it a saved sale at month
  10 of a 12-month plan revised from the 4th instalment (9 months left) would read `sale_month_out`.
- Step 1 has no preview: its row «Liquidità per mese» (`ACCUMULO_STEP1_L_MONTHLY`, `:1002-1005`) reads
  `liquidity.monthShares ? liquidity.L * liquidity.monthShares[liquidity.refillMonths] : <today's expression>` —
  the first buying month's euros, from `liquidity` alone.
- The `describeSaleStep` sentences come from `listSaleSteps` (§ 4.4) with `nameOf = (id) => assetsById.get(id)?.name
  ?? id` and `firstIndex: firstRevisedIndex`, computed by the dialog: at step 2 from
  `settledPreview.schedule.installments` and handed to `PlanDraftSidePanel` as a new prop `saleSteps`, rendered one
  per entry under the average (`describeInstallmentAverage`, `:100-102`, which stays); at step 3 from
  `preview.schedule.installments`, rendered under the summary.
- `PlanDraftSidePanel`'s sales line (`:105`) is split: «vendite al mese 1» reads `liquidity.dueProceedsEur`, a new
  line «vendite nei mesi successivi» reads `liquidity.disposalProceedsEur − liquidity.dueProceedsEur`, each shown
  when above 0. The refill rows (`PlanDraftSidePanel.tsx:113`, `AccumulationPlanDialog.tsx:998`) stay as they are:
  every sale refills (decision 93).
- Step 2's column «Al mese» (`:1250-1251`) stays «Da comprare» ÷ the months (decision 95).
- A new prop `investmentAccountId: string | null`: `emptyDraft` (`:223-240`, exported for its test) gains it as its
  last parameter and starts on `sourceCashAssetIds: investmentAccountId ? [investmentAccountId] : []`.
  `AccumuloTab` computes `const investmentAccountId = resolveInvestmentAccountId(settings, allAssets)` once
  (`settings` is its prop, `components/allocation/AccumuloTab.tsx:118`) and passes it as the prop
  `investmentAccountId` to `AccumuloVuotoTile`, `PortafoglioModelloTile`, `QuestoMeseTile` and `ConsulenteHandoff`,
  which hand it to every `AccumulationPlanDialog` they mount (five mountings in four files; `QuestoMeseTile`'s two
  open on an existing plan and pass it too — `emptyDraft` reads it only for a new plan).

### 4.7 The setting «Conto per gli investimenti» (doc/guide/impostazioni.md § Settings — the FIVE places)

1. `types/assets.ts`: `investmentCashAssetId?: string; // The account a plan of accumulation draws from by default`
   beside `defaultCreditCashAssetId` (`:466`).
2. `assetAllocationService.getSettings` (`:153`): `investmentCashAssetId: data.investmentCashAssetId`.
3. Both write chains of `setSettings` (`:352-357` no-merge with `delete docData.investmentCashAssetId`, `:550-554`
   merge with `deleteField()`), guarded by `'investmentCashAssetId' in settings`.
4. `lib/utils/settingsDraft.ts`: the spese slice (`:181`), `sliceSettings` (`:419`, `|| NO_SELECTION`),
   `composeSettingsDocument` (`:545`).
5. `components/settings/tabs/SpeseTab.tsx`: a third row in «Conti di default», after «Conto di accredito»: label
   «Conto per gli investimenti», help «Da qui partono le rate del piano di accumulo», the same `Select`
   (`aria-label="Conto per gli investimenti"`, «Nessun default»).

`describeDefaultAccounts` (`lib/utils/settingsNarrative.ts:724-738`) gains `investmentName?: string`: when present
every branch's sentence is followed by a second prose segment ` Il piano di accumulo attinge da ${investmentName}.`;
absent, the reading is today's. The tile's note (`SpeseTab.tsx:501`, «Proposti nel modulo di spese ed entrate…»)
reads «Prelievo e accredito sono proposti nel modulo di spese ed entrate; il conto per gli investimenti nel piano
di accumulo. Solo conti veri, non asset di classe liquidità.», and the file's header comment (`:4-6`, «the two
settings the expense FORM reads») names the third. An account deleted in Patrimonio while it is the setting leaves
a dangling id, as the two defaults do today: `resolveInvestmentAccountId` answers `null` for it.

```ts
// lib/utils/accumulationPlanUtils.ts
/** The settings' account for the investments, when it still is a source account; null otherwise. */
export function resolveInvestmentAccountId(
  settings: Pick<AssetAllocationSettings, 'investmentCashAssetId'> | null | undefined,
  allAssets: readonly Asset[],
): string | null {
  const id = settings?.investmentCashAssetId;
  const asset = id ? allAssets.find((candidate) => candidate.id === id) : undefined;
  return asset && isPlanSourceAccount(asset) ? asset.id : null;
}
```

Fixtures: `__tests__/fixtures/storedSettings.ts` carries `investmentCashAssetId: 'cash-invest'` in `STORED_SETTINGS`
and `FULL_PAGE_SETTINGS`; `WRITTEN_KEYS` of `__tests__/settingsDraft.test.ts:43` names it.

## 5. Constraints and traps (AGENTS.md / DESIGN.md, «here it means that»)

- **The reserve is never planned under** (doc/guide/accumulo.md, owner 2026-11-17; decision 93): here it means U2
  is a property test, not three examples — the cumulative spend against criterion 3's bound for every month of
  every case — and a later sale pays the refill before its tranche exists (U14).
- **A partial sale leaves the position's value from month 0** (`resolvePositionStates`, `:90-104`: the shares to be
  sold leave the position's current value whatever the sale's month): unchanged and declared — the totals are
  computed once, on the portfolio as the plan will leave it; only the money's month moves.
- **No component test mounts the editor** (1.748 lines, six hooks; today every test replaces it with a mock): here
  it means R2 renders `SaleMonthSelect` alone and R4 is a unit test on `emptyDraft` — both exported for that —, and
  «Vendi a» on a new plan's row is proved in the browser (E2).
- **A change to the engine keeps the saved plans** (no migration, M3): here it means an ACTIVE plan saved before
  this spec keeps its instalments (they are stored); only a recalibration or a revision recomputes, and both now
  read the month. A plan whose sales are all in month 1 recomputes to the same figures (criterion 2).
- **Cents** (`roundToCents`, AGENTS.md § 2): `monthShares` are fractions, never rounded; the cents are rounded where
  they are today (`plannedAmountEur`, `carryInEur`, `residualEur`). Σ lines + residual = Σ totals stays the
  schedule's invariant (existing test).
- **Italian month** (`toMonthKey`, `monthIndexOf` from `lib/utils/planMonths.ts`): `isPlanReviewDue` receives the
  month key, never builds a `Date`; the tests run in three zones.
- **The settings fan-out** (impostazioni.md): a clearable field needs `delete` in the no-merge branch and
  `deleteField()` in the merge one, guarded by `in`; only a hard refresh proves the read mapping (E4 reloads).
- **React Compiler** (AGENTS.md § React Compiler): no manual `useMemo` added for the note; `isPlanReviewDue` is a
  pure call in render.
- **The Absence-Has-Three-Names Rule**: an «In programma» sale is not a to-do — no action, the muted chip; the
  review note is not a warning — no amber.
- **Shared account and demo**: the note's button is disabled in demo like the footer's; the setting is the owner's
  document (`ownerId`), as every setting.
- **Series labels never enter code**: no «NOVE-23» in a comment, a test name or a constant.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `__tests__/accumulationPlanUtils.test.ts` › `computeUsableLiquidity` on § 1's figures: `L` 15.600, `dueProceedsEur` 2.400, `refillMonths` 0, `monthShares` = six of 800/15.600 then six of 1.800/15.600; with `firstIndex` 7 the month-7 sale is due and `monthShares` is `null` | push every later tranche at `offset: 0` |
| U2 | same › `scheduleInstallments` with those shares, one position priced 1 €: instalments 800×6 then 1.800×6; property (seeded PRNG, 200 cases: 1–24 months, 0–3 sales in random months, inflow 0–2.000, cash from 5.000 under to 5.000 above the reserve): for every month `m` Σ planned spend of months 1…m ≤ `max(0, sourceCashEur − reserveEur + Σ proceeds of the sales with disposalMonthIndex ≤ firstIndex − 1 + m + monthlyInflowEur × m)`, and Σ lines + residual = Σ totals | `spread(tranche.eur, 0)` for a later sale |
| U3 | same › no later sale: `monthShares === null`, `refillMonths` and `L` equal today's on the suite's existing fixtures, and `scheduleInstallments(…, null)` deep-equals the call without the parameter | return an even array instead of `null` |
| U4 | same › `recalibrateInstallment` at month 3 of 12 with a sale in month 7: `result.liquidity.dueProceedsEur` excludes it and every `suggestedQuantity` is `floor(total × monthShares[0] ÷ price)` (smaller than the even budget's); at month 7 `dueProceedsEur` includes it | call `computeUsableLiquidity` without `index` |
| U14 | same › a later sale refills first (decision 93), 12 months, a sale in month 7, one position priced 1 €: (a) cash 3.000 € under the reserve, inflow 0, a sale of 6.000 € → `L` 3.000, `refillMonths` 6, instalments 0×6 then 500×6; (b) 5.000 € under, inflow 500, a sale of 8.000 € → `L` 9.000, `refillMonths` 6 (the inflows refill 3.000, the sale 2.000), instalments 0×6 then 1.500×6; (c) 3.000 € under, inflow 0, a sale of 2.000 € → `L` 0, `refillMonths` 12, `monthShares` `null` | `refillEur = 0` for a later sale |
| U5 | `__tests__/accumulationPlanMatching.test.ts`: sale in month 3 — `upcoming` at indexes 0, 1, 2, `todo` at 3, `late` at 4; a month-1 sale `todo` at index 0; a ledger sell at index 1 on the month-3 sale → `toConfirm` | `saleIndex > currentIndex` without `Math.max(…, 1)` |
| U6 | `__tests__/accumulationPlanRevision.test.ts`: revision from `k` = 4 with a new sale at month 6 keeps 6; at month 2 becomes 4; at month `months + 1` → `sale_month_range`; `reviewMonthIndex` absent keeps, a number replaces, `null` clears | `monthIndex: k` restored |
| U7 | `__tests__/accumulationPlanSchema.test.ts`: a sale with `monthIndex` 13 on 12 months → `sale_month_out` with the sentence; `monthIndex: 0` fails the zod schema; a revision's draft (`firstIndex` 4, 9 months left) with a sale at month 10 has no `sale_month_out`, at month 13 it has | drop the check; validate against `draft.months` alone |
| U8 | `__tests__/accumuloMonth.test.ts` › `isPlanReviewDue`: true only at the review index on an active plan; false after a revision dated in that month; false when `reviewMonthIndex > months` | drop the revisions clause |
| U9 | `__tests__/settingsRoundTrip.test.ts`: `investmentCashAssetId` written, read back, cleared in BOTH branches | `!== undefined` in place of `in` |
| U10 | `__tests__/settingsDraft.test.ts`: `compose ∘ slice` keeps the field; `WRITTEN_KEYS` | omit it from `composeSettingsDocument` |
| U11 | `__tests__/accumulationPlanUtils.test.ts` › `resolveInvestmentAccountId`: the id; `null` when the asset is gone or is a money-market fund in the cash class | drop `isPlanSourceAccount` |
| U12 | `__tests__/accumulationPlanService.test.ts`: `createDraftPlan` with `reviewMonthIndex: 6` writes `reviewMonthIndex: 6`, without it the payload has no such key; `__tests__/accumulationPlanDoc.test.ts` maps it | omit `reviewMonthIndex` from the `createDraftPlan` payload |
| U13 | `__tests__/settingsNarrative.test.ts`: the reading with and without `investmentName`; `__tests__/accumulationNarrative.test.ts`: `describeSaleStep` prints «1.800 €» (no decimals) and the names joined | drop the second segment; drop `compact` |
| U15 | `__tests__/accumuloSummary.test.ts`: on § 1's figures `summarizeDraftTotal(…).firstEur` is 800 and the draft headline reads «Bozza pronta: 12 rate da {mese}, la prima di 800 €.»; without a later sale `firstEur` is `null` and the headline is today's | read the even division |
| U16 | same › `listSaleSteps`: one entry per month of a later sale with that month's instalment and the names; `firstIndex` 4 reads `installments[index − 4]`; a sale the refill takes whole (U14 c) gives no entry; a month-1 sale gives none | list every open sale's month |
| R1 | `__tests__/questoMeseTile.test.tsx` (new, `dom` project; the dialog mocked as `accumuloVuotoTile.test.tsx` does): an `upcoming` sale shows «In programma», its month, no button; an ignored early match on a month-7 sale at index 2 reads «In programma» with no «Registra» | render the actions for `upcoming`; drop `isUpcoming` |
| R2 | `__tests__/accumulationPlanDialogSaleMonth.test.tsx` (new, `dom`): `SaleMonthSelect` alone — with `firstIndex` 1 and 12 months it lists the 12 months and `onChange` carries the chosen index; with `firstIndex` 4 a sale without `monthIndex` reads the 4th month | `?? 1` restored |
| R3 | `questoMeseTile.test.tsx`: the review note and its «Rivedi il piano» at the review month only | `review <= currentIndex` |
| R4 | `accumulationPlanDialogSaleMonth.test.tsx`: `emptyDraft(…, 'cash-invest')` starts on `sourceCashAssetIds: ['cash-invest']`, with `null` on `[]`; `__tests__/planDraftSidePanel.test.tsx` (existing): `saleSteps` renders one sentence per entry, and the two sales lines | ignore the parameter; render no sentence |
| E1 | `e2e/accumulo.spec.ts`: `seedAccumuloFixture({ saleMonthOffset: 2 })` → the sale row reads «In programma» with the month, no «Registra» on the row | — |
| E2 | `e2e/accumulo.spec.ts`: new plan in the editor, «Vendi» on an instrument, «Vendi a» the 3rd month → the side panel's sentence; «Attiva piano»; the calendar's 3rd instalment is larger than the 2nd; `removeOwnerPlans()` in `afterEach` | — |
| E3 | `e2e/accumulo.spec.ts`: `seedAccumuloFixture({ reviewAtOpenMonth: true })` → the note; its button opens the revision | — |
| E4 | `e2e/settings.draft.spec.ts` (it writes, and restores the WHOLE settings document in its `afterAll`; `e2e/settings.spec.ts` never writes): choose «Conto per gli investimenti», «Salva», reload → still chosen; «Nessun default», «Salva», reload → empty, and the settings document has no `investmentCashAssetId` | — |

`e2e/accumuloFixture.ts`: `seedAccumuloFixture({ startOffset?, status?, saleMonthOffset?, reviewAtOpenMonth? })`
(`:68`) gains the last two. `saleMonthOffset` plants `disposals: [{ assetId: 'seed-aapl', quantity: 1, monthIndex:
1 − startOffset + saleMonthOffset, estimatedProceedsEur: 175, status: 'planned' }]` — with the default `startOffset`
−2 and `saleMonthOffset` 2 the sale is in plan month 5 while the open month is 3; `reviewAtOpenMonth` writes
`reviewMonthIndex: 1 − startOffset` (thrown for `startOffset ≥ 1`: no month is open yet). The file also gains
`removeOwnerPlans()`: it lists `accumulationPlans` where `userId == 'test-user-1'` (REST `runQuery`), deletes each,
then the lock — `removeAccumuloFixture` removes only the planted id, and E2's plan has a generated one. Every test
that creates a plan from the page calls it in `afterEach` (README § 7).

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the seed account a new plan with a sale in its third month shows two smaller
instalments and then a larger one, and the calendar after «Attiva piano» agrees; «Questo mese» shows that sale «In
programma» with no action; a plan whose sales are in month 1 shows the same figures as before the change; a planted
review month shows the note; the setting survives a reload and ticks the account in a new plan.

- **A**: `npx tsc --noEmit`, lint, Vitest in three zones (machine, `TZ=Europe/Rome`, `TZ=UTC`), `npx playwright test
  e2e/accumulo e2e/settings` in every project.
- **B**: emulators + `emulators:seed` + `dev:emulator`; note the figures of the fixture plan's calendar BEFORE the
  change (a scratchpad script printing `installments[].lines[].plannedAmountEur` through firebase-admin) on the
  session's base commit.
- **C (browser)**: 390, 768×1024, 1024×768, 1440, light and dark: the editor's sale row with «Vendi a», the
  preview's sentence, the calendar; «Questo mese» with the «In programma» row and with the review note; Impostazioni
  › Spese with the third row.
- **D (data)**: after «Attiva piano» the document's `disposals[].monthIndex` is the chosen month and Σ of every
  month's lines up to month 2 ≤ cash above the reserve + two inflows; the script of B on the fixture plan prints
  the SAME figures as before; `assetAllocationSettings/<uid>.investmentCashAssetId` after the save, absent after
  the clear.
- **E (edges)**: shorten the months below the sale's month → the step's status line reads the `sale_month_out`
  sentence; record the sale in the ledger a month early → «Da confermare», then «Ignora» → «In programma» again,
  no «Registra»; a revision in the review month → the note disappears; in a revision, a saved sale in a month after
  the months left (month 10, nine left) raises no `sale_month_out` and a new sale's select opens on the first
  revised month; a new plan with the accounts under the reserve and a sale in a later month → the first
  instalments buy nothing until the sale's month (decision 93); delete the investment account in Patrimonio → a
  new plan opens with no account ticked.
- **F (owner, at «pronto»)**: the mirror (`npm run mirror:seed -- <email>`): the owner sets «Conto per gli
  investimenti», opens his plan (or a new one), moves a sale to a later month and reads the instalments; nothing is
  written to production. `npm run mirror:remove`.
- **G**: `npm run perf:budget` on every route, before and after on the same machine (README § 8). `mobile:census` +
  `mobile:budget` on `develop` and on the branch the same day, same build: the census fixture
  (`scripts/seedCensusE2E.mts`) is not changed by this spec, so this spec names NO entry — every entry,
  `allocazione-accumulo` included, reads the same on both, and one that moves stops the session. Stop the servers,
  delete the scripts.

## 8. Putting it into service

One PR to `develop`; no rule, no index, no migration (M3: an absent `monthIndex` is month 1, an absent
`reviewMonthIndex` is none). After the deploy the owner sets «Conto per gli investimenti» in Impostazioni › Spese on
his account (NOVE-25's click asks for it otherwise). Then NOVE-24.

## 9. Documentation

- `doc/guide/accumulo.md` § Rules (the guide has no «engine» section: the bullets go beside «The engine is pure»
  and «The reserve is the allocation's cash quota»): «a sale's proceeds enter the instalments from its month
  (`monthShares`, M1); a later sale refills what is still missing of the reserve before it is invested (owner,
  2026-11-19), so `L` does not depend on the months»; the matcher's `upcoming` state; «Questo mese» — the review
  note (`isPlanReviewDue`); the editor — «Vendi a» on every open sale, the default source account, «Al mese» an
  even average (owner, 2026-11-19); § Per-page blind spots: «a sale in a later month makes the first instalments
  smaller: it is the plan not spending money it does not have yet», «the recalibration's cash ceiling never binds
  once the budgets come from `monthShares[0]`: a guard no test turns red»; and the sentence that a money-market
  sale can be «added by hand at step 2» is corrected (no code path adds it: `listAddableAssets` reads
  `isPlanBuyable`; the sale comes from «Con vendite mirate» only).
- `doc/guide/impostazioni.md` § Files / the Spese tab: the third default account and its reader.
- `AGENTS.md` § 3 Accumulo: one bullet («a sale counts from its month; `computeUsableLiquidity` takes the first
  index»).
- `CLAUDE.md`: «Latest» REPLACED, no longer than the line it replaces; the Accumulo line of Key Features rewritten
  at equal or shorter length with «a sale counts from its month» in; the file measured after the edit with the
  command of README § 8, under 20,000 characters — a fact that does not fit moves to doc/guide/accumulo.md.
  `Draft Release Temp.md`: the sale's month, the review note, the new setting, in the user's words.
- `doc/nove/README.md` § 6: the row's status; § 7: the contracts are live.

## 10. Declared out of scope

- **The Consulente writing the plan** → NOVE-24. **The click that creates it** → NOVE-25.
- **A control for the review month in the editor or in the guided path** (M6): none, declared.
- **Phases with different quotas** (decision 69): none, declared.
- **The reserve of a new plan computed on the ticked account alone**: here `resolvePlanReserve` still sums every
  source account while the editor ticks one — who has two accounts starts with a shortfall the other account
  covers, and types the reserve by hand. NOVE-24 gives `resolvePlanReserve` its `sourceIds`, NOVE-25 (K7) and
  NOVE-22 (G4) read it; the editor never does (it is deleted by NOVE-26).
- **Step 2's «Al mese» as the first instalment** (decision 95): none, declared.
- **A source account that no longer exists** (deleted while a draft names it): the validator skips it, as today;
  NOVE-25 adds the issue (`source_missing`).
- **The setting read by Registra, by the trade dialog or by the server**: none here; NOVE-24 reads it on the
  server for the plan stage's data.
- **A sales row in the Calendario dialog**: none, declared (today's «no Calendario surface for disposals» stays).
- **The guided path's sales screen** → NOVE-22, on this spec's `disposalMonthIndex` and `sale_month_out`.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-23-accumulo-vendite-nel-calendario.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-23-accumulo-vendite-nel-calendario.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/accumulo.md, doc/guide/impostazioni.md, doc/guide/allocazione.md,
  doc/guide/velocita.md, doc/guide/prima-schermata.md, doc/guide/e2e-emulatori.md e
  doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Leggi DESIGN.md (The Absence-Has-Three-Names Rule, The Modal-Is-A-Tile Rule) e PRODUCT.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Controlla i processi rimasti da sessioni precedenti: node ~/.claude/processi-collaudo.mjs

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

Implementa la spec così com'è scritta, nell'ordine: i tipi e lo schema (§ 4.1); il motore
(§ 4.2) con U1-U4 e U14, e U3 PRIMA di ogni altra cosa (un piano senza vendite dopo il primo
mese deve dare le stesse cifre di oggi: le suite esistenti restano verdi senza toccare una
cifra attesa); il matcher e il mese di revisione (§ 4.3); i testi e listSaleSteps (§ 4.4);
«Questo mese» (§ 4.5); l'editor (§ 4.6); l'impostazione nelle cinque sedi (§ 4.7). I test
PRIMA del codice, ciascuno visto rosso con la sua mutazione; cifre inventate e tonde. Fermati
e chiedimi se: una suite esistente dell'accumulo cambia una cifra attesa; il test di proprietà
U2 trova un caso in cui la spesa cumulata supera il limite del criterio 3; perf:budget,
misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo
alzi tu, con raisedBy e una riga in velocita.md § Registro); mobile:budget, develop e branch
sulla stessa build, muove una voce qualsiasi (la spec non ne nomina nessuna).
Collaudo: § 7, la F sul mirror al mio «pronto». Un branch, un commit, solo dopo il mio OK con
il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an M/L spec on a shared contract (`computeUsableLiquidity`,
`scheduleInstallments`, the plan document) read by the activation, the revision, the recalibration, the summary and
the tile, plus a setting across its five places. Estimated size: 1 session, ~4 h; ~120 lines pure, ~120 across
components and the settings chain, ~350 of tests, four E2E tests.
