# DATI-20 — A single bond is bought and sold in lots: the plan waits for a whole lot, the Consulente knows it

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-06 (ONE form: the instrument is created
> empty, re-read, and handed to the trade form), DATI-18 (the trade form's bond block, which it edits too) and
> DATI-19 (the Consulente's facts, prompts and reconcile, which it edits too). DATI-21 adds its line beside this
> spec's warning. Written on 2026-11-23 in the adversarial-reading session, on the owner's point 14; every
> `file:line` is cited @ 94101a1c (a line number is a hint, the function's name is the anchor). Decisions 40–45
> and 93.

## 1. The problem today (evidence on the code)

**A plan proposes a bond purchase nobody can execute.** A single bond is traded in lots — 1.000 € of nominal for a
government bond, more for some corporate ones — and the app has no such notion: `grep -rniE "lotto|minLot|lotSize"`
over `lib/` and `components/` finds nothing. The plan of accumulation sizes every purchase in whole UNITS:
`Math.floor(budget / s.buyPriceEur + 1e-9)` in `scheduleInstallments` (`lib/utils/accumulationPlanUtils.ts:366`), the
same floor on a swap (`:393`), in `recalibrateInstallment` (`:521`, `:540`) and, by one unit at a time, in the last
month's redistribution (`:424-455`). For a bond the unit is 1 € of nominal — `BondDetails.nominalValue` defaults to 1
(`lib/utils/bondPricing.ts:25`, «the quantity is then the nominal in euro, exactly as a broker statement reads») —
so a monthly share of 137 € becomes the line «compra 138 quote» at 0,99 €: an order no bank takes.

**The Consulente creates such bonds and plans them by the month.** «Applica» creates a new bond from an ISIN at 0
quotes, priced on 1 € of nominal (`newInstrumentFormData`, `resolveNewInstrumentPricing`,
`lib/utils/advicePlan.ts:110-158`; `bondUnitPriceEur`, `lib/utils/bondPricing.ts:89`), and its plan stage answers
weights, months and sales in «quote intere» (`PLAN_CONTRACT`, `lib/server/allocationAdvice/prompts.ts:662`); the
block it reads (`formatOperatingPlanFacts`, `:627`) prints quotes, price and value, never a lot. The reconcile floors
a `sellQuantity` to a whole unit (`reconcileOperatingPlan`, `lib/utils/operatingPlan.ts:253`), not to a lot.

**A sale seeded by «Con vendite mirate» has the same floor** (`seedDisposalsFromSale`,
`lib/utils/accumulationPlanUtils.ts:1378`), and the trade form accepts any quantity of a bond without a word
(`components/assets/TransactionDialog.tsx:112`, `quantity: z.number().optional().or(z.nan())`).

## 2. Goal and acceptance criteria

1. A bond carries its lot in two fields, in the bond's currency of nominal: «Taglio minimo» (shown at 1.000 on a
   bond that never stored one, saved in `bondDetails.minimumLot`) and «Multipli di» (empty = the minimum itself,
   saved in `bondDetails.lotStep`). Proof: U5, D1, E1.
2. `lotRuleOf(asset)` is the ONE answer to «in what quantities is this traded»: null for anything that is not a
   single bond or whose unit's nominal is unknown; else the minimum and the step, in units and in nominal.
   Proof: U1–U3.
3. Every quantity a plan proposes for a lot instrument is a multiple of its step and never leaves the position
   between zero and its minimum lot: the regular line, the swap, the last month's redistribution, the
   recalibration, the seeded sale. The first purchase reaches the minimum; once the position holds it, the plan
   buys by steps. The month whose share does not reach an order buys nothing and carries the money. Σ lines +
   residual = Σ totals still holds. Proof: U4, U6–U11, U19.
4. In the last month a lot instrument takes its next order from the pooled carry only when it still lacks at
   least half of that order. Proof: U9.
5. A recalibration proposes the lot the calendar planned for that month, and none in a month that waits: the
   carried money is counted once. Proof: U10.
6. The plan says it: for every lot instrument that does not buy in every buying month, one sentence — how many
   purchases are left and when the next is, or that its share never reaches a lot and it will not be bought — on
   the path's summary (creation and revision), on «Questo mese» and on the Consulente's fourth tick. Proof: U12,
   U13, P1, T1, D2.
7. The Consulente's plan stage reads the lot of every bond (held and new) in its facts block, in QUOTES, and the
   rule in its contract; a partial `sellQuantity` the lot does not allow is brought down to one it allows, with a
   sentence; when there is none the sale leaves the plan, with a sentence. The tick's preview schedules a new
   bond in lots. Proof: U14–U17, U20.
8. The trade form warns, and saves: recording a purchase or a sale of a lot instrument whose quantity is not a
   multiple of the step, or that leaves the position between zero and its minimum lot, shows one line under the
   quantity; selling everything held never warns; an adjustment and an edit never warn. Proof: U18, E1.
9. An instrument that is not a single bond behaves exactly as before: `lot: null` everywhere. Proof: the existing
   `accumulationPlanUtils`, `accumulationPlanRevision`, `accumulationPlanReviewFlow`, `accumulationClassTrajectory`,
   `operatingPlan` and `advicePlan` suites stay green untouched, bar the `PositionState` literals that gain
   `lot: null`.
10. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1 green;
    `npm run perf:budget` green with `/dashboard/allocation`, `/dashboard/allocation/piano` and
    `/dashboard/assets` inside their ceilings, raised by no more than 1 KB gz and only with the register row
    (index § 8 rule 7); `npm run mobile:budget` green on `allocazione-accumulo`, on the same build as the census.

## 3. Decisions

- **Owner, 2026-11-23** (point 14, index decisions 40–45): a spec of its own, written and read adversarially in the
  reading session (40); a field on the bond, proposed at 1.000, editable — a bond already saved counts 1.000 (41);
  the plan accumulates and buys when a lot is reached, says when, and declares a bond that never reaches one (42);
  by hand a warning only (43); the Consulente gets the lot as a fact AND the rule in its prompt (44); in the last
  month a bond takes a lot from the pool only when it lacks at least half a lot (45).
- **Decision 93** (owner, 2026-11-23): TWO fields — «Taglio minimo» and «Multipli di» — for the bonds whose
  minimum purchase is not their step (100.000, then multiples of 1.000): the plan buys the first lot at the
  minimum and then by steps. Without a step the minimum is the step (a government bond: 1.000 and 1.000).
- **Decision 60** (owner, 2026-11-23): ONE form for every purchase — DATI-06 makes the asset form create the
  instrument empty and hand it, re-read, to the trade form: the warning reads the lot just saved.
- Adopted, reversible before the implementation:
  - (a) **the lot lives in `BondDetails.minimumLot` and `BondDetails.lotStep`**, beside `nominalValue`; a bond
    without stored details reads the defaults. No field on `Asset`, no migration, no backfill.
  - (b) **the lot binds only where the unit's nominal is known**: a bond quoted in percent
    (`isBondQuotedInPercent`: type `bond`, class `bonds`, an ISIN) or one that stores `nominalValue`. A bond priced by
    hand in euro with no nominal counts whatever the user counts (often the lot itself): no lot.
  - (c) **the rule rides on `PositionState.lot`**, read from the buy asset in `resolvePositionStates` with the
    units it holds today: no new argument on any scheduler function, no change to `PlanDeps`.
  - (d) **«the position holds its minimum» counts the buy asset's quantity today plus what the plan bought of it
    in the months before**; a sale still to be made is not subtracted.
  - (e) **the minimum is a whole number of steps**: one the user wrote otherwise (1.000 and 300) is rounded up to
    the next step (1.200).
  - (f) **the recalibration spends a lot position's recorded carry-in in its month and spreads the rest**, for a
    lot position alone: the other instruments keep today's arithmetic to the cent. When the account no longer
    holds the carried money the cash ceiling scales every budget, as today, and the month proposes no lot.
  - (g) **the sentence is silent for a lot instrument that buys in every buying month**, for one the plan
    already bought, for one a swap buys and for one without a price (`describeUnpricedWarning` speaks for it).
  - (h) **the plan's sentences print the nominal without a currency sign** («1.000 di nominale»): the lot is in
    the bond's currency, the plan's money in euro. The trade form's warning prints the instrument's currency.
  - (i) **the rule goes in the plan stage's contract only** (`PLAN_CONTRACT`): it is the one stage that knows the
    inflow, the months and the weights. The strategy, the instruments search and the review are not touched.
  - (j) **the warning never blocks and never touches the server**: the statement is right (a partial redemption, a
    legacy lot); the trade's validation, the replay and the routes are untouched. It shows while RECORDING a
    trade only: in an edit the quantity held is already the one after the trade.
  - (k) **the quantity typed on the plan path's sale screen is not checked**: it is the user's own figure, as in
    the trade form; heir: doc/guide/accumulo.md § Per-page blind spots.

## 4. Solution

### 4.1 The rule — `lib/utils/bondLot.ts` (new, written here)

```ts
/**
 * The lot of a single bond (2026-11-23): the smallest nominal a bank trades and the step every
 * order moves by — 1.000 and 1.000 for a government bond, 100.000 and 1.000 for some corporate
 * ones. The ONE place that turns them into units and says which quantity can be traded: the plan's
 * pure layer, the Consulente's facts and the trade form read the same answer.
 */

import { effectiveBondNominal, isBondQuotedInPercent } from '@/lib/utils/bondPricing';
import { formatNumberIt } from '@/lib/utils/formatters';

/** The minimum lot of a bond that stores none: 1.000 of nominal, in the bond's currency. */
export const DEFAULT_BOND_MINIMUM_LOT = 1000;

/** The asset fields the rule reads. */
export interface BondLotFields {
  type: string;
  assetClass: string;
  isin?: string;
  bondDetails?: { nominalValue?: number; minimumLot?: number; lotStep?: number } | null;
}

const isPositive = (value: number | undefined): value is number => value !== undefined && !isNaN(value) && value > 0;

/** The minimum actually applied: the stored one when positive, else 1.000. */
export function effectiveBondMinimumLot(minimumLot: number | undefined): number {
  return isPositive(minimumLot) ? minimumLot : DEFAULT_BOND_MINIMUM_LOT;
}

/** The step actually applied: the stored one when positive, else the minimum lot itself. */
export function effectiveBondLotStep(lotStep: number | undefined, minimumLot: number | undefined): number {
  return isPositive(lotStep) ? lotStep : effectiveBondMinimumLot(minimumLot);
}

/**
 * Whether a lot binds this asset: a single bond whose UNIT has a known nominal — quoted in percent
 * (then one unit is `effectiveBondNominal` of nominal, 1 € by default) or storing its nominal. A bond
 * priced by hand in euro with no nominal counts in the user's own units: no lot.
 */
export function hasBondLot(asset: BondLotFields): boolean {
  if (asset.type !== 'bond') return false;
  return isBondQuotedInPercent(asset) || isPositive(asset.bondDetails?.nominalValue ?? undefined);
}

/** A lot in units and in nominal. */
export interface LotRule {
  /** The units a position holds at least, once it holds any. */
  minUnits: number;
  /** Every order moves a multiple of these. */
  stepUnits: number;
  minNominal: number;
  stepNominal: number;
}

/** The lot of an asset; null when none binds it. The minimum is a whole number of steps. */
export function lotRuleOf(asset: BondLotFields): LotRule | null {
  if (!hasBondLot(asset)) return null;
  const nominal = effectiveBondNominal(asset.bondDetails?.nominalValue ?? undefined);
  const minimumLot = asset.bondDetails?.minimumLot ?? undefined;
  const unitsOf = (amount: number) => Math.max(1, Math.ceil(amount / nominal - 1e-9));
  const stepUnits = unitsOf(effectiveBondLotStep(asset.bondDetails?.lotStep ?? undefined, minimumLot));
  const minUnits = Math.ceil(unitsOf(effectiveBondMinimumLot(minimumLot)) / stepUnits - 1e-9) * stepUnits;
  return { minUnits, stepUnits, minNominal: minUnits * nominal, stepNominal: stepUnits * nominal };
}

/**
 * The largest quantity not above `quantity` an order may BUY on top of `held` units: whole units
 * without a rule; with one, whole steps that leave the position at its minimum lot or above. 0 when
 * there is none.
 */
export function buyableUnits(quantity: number, rule: LotRule | null, held: number): number {
  if (!rule) return Math.max(0, Math.floor(quantity + 1e-9));
  const units = Math.floor(quantity / rule.stepUnits + 1e-9) * rule.stepUnits;
  return units > 0 && held + units + 1e-9 >= rule.minUnits ? units : 0;
}

/** The smallest order that may be bought on top of `held`: the steps still lacking to the minimum lot, else one step; 1 without a rule. */
export function nextOrderUnits(rule: LotRule | null, held: number): number {
  if (!rule) return 1;
  const lacking = rule.minUnits - held;
  return lacking > 1e-9 ? Math.ceil(lacking / rule.stepUnits - 1e-9) * rule.stepUnits : rule.stepUnits;
}

/**
 * The largest quantity not above `quantity` an order may SELL out of `held`: everything, or whole
 * steps that leave the minimum lot. 0 when there is none.
 */
export function sellableUnits(quantity: number, rule: LotRule, held: number): number {
  if (quantity + 1e-9 >= held) return held;
  const room = Math.floor((held - rule.minUnits) / rule.stepUnits + 1e-9) * rule.stepUnits;
  const units = Math.floor(quantity / rule.stepUnits + 1e-9) * rule.stepUnits;
  return Math.max(0, Math.min(units, room));
}

/** What a trade's quantity breaks: the step, or the minimum the position is left under. Null = nothing. */
export function lotProblemOf(type: 'buy' | 'sell', quantity: number, rule: LotRule, held: number): 'step' | 'minimum' | null {
  // Everything held (or more: the server's refusal, not this line's): the whole position goes, whatever it counts.
  if (type === 'sell' && quantity + 1e-9 >= held) return null;
  const steps = quantity / rule.stepUnits;
  if (Math.abs(steps - Math.round(steps)) > 1e-9) return 'step';
  const after = type === 'buy' ? held + quantity : held - quantity;
  return after + 1e-9 < rule.minUnits ? 'minimum' : null;
}

/** The lot warning of a trade being recorded: null when there is nothing to say. Never blocks the save. */
export function describeLotWarning(input: {
  type: 'buy' | 'sell' | 'adjustment';
  quantity: number | undefined;
  heldQuantity: number;
  rule: LotRule | null;
  currency: string;
}): string | null {
  const { type, quantity, heldQuantity, rule, currency } = input;
  if (type === 'adjustment' || !rule) return null;
  if (quantity === undefined || isNaN(quantity) || quantity <= 0) return null;
  const problem = lotProblemOf(type, quantity, rule, heldQuantity);
  if (!problem) return null;
  const nominal = (amount: number) => `${formatNumberIt(amount, 0)} ${currency} di nominale`;
  return problem === 'step'
    ? `La quantità non è un multiplo di ${nominal(rule.stepNominal)}: controlla l'estratto conto. Puoi salvare comunque.`
    : `Con questa operazione la posizione resta sotto il taglio minimo (${nominal(rule.minNominal)}): controlla l'estratto conto. Puoi salvare comunque.`;
}
```

### 4.2 The type and the asset form

- `types/assets.ts`, `BondDetails`: after `nominalValue`,
  `minimumLot?: number; // Smallest tradable nominal, in currency (1000 for a government bond). Default: 1000 (lib/utils/bondLot.ts)`
  and `lotStep?: number; // Every order is a multiple of this nominal. Default: minimumLot (lib/utils/bondLot.ts)`.
  The `WARNING` comment above the interface already lists the three places a new field owes.
- `lib/utils/bondDetailsForm.ts`: `BondDetailsFormInput` gains `bondMinimumLot?: number` and `bondLotStep?:
  number`; `buildBondDetailsFromForm` spreads, right after the `nominalValue` line,
  `...(isFilledNumber(data.bondMinimumLot) && data.bondMinimumLot > 0 ? { minimumLot: data.bondMinimumLot } : {}),`
  and the same for `lotStep` from `data.bondLotStep`.
- `components/assets/AssetDialog.tsx`:
  - the schema, after `bondNominalValue` (`:433`):
    `bondMinimumLot: z.number().positive('Il taglio minimo deve essere positivo').optional().or(z.nan()),` and
    `bondLotStep: z.number().positive('Il multiplo deve essere positivo').optional().or(z.nan()),`;
  - the field-label map (`:558`): `bondMinimumLot: 'Taglio minimo'`, `bondLotStep: 'Multipli di'`;
  - the `useForm` default values (`:991`): `bondMinimumLot: DEFAULT_BOND_MINIMUM_LOT`;
  - the reset effect, the EDIT branch: inside the `reset({ … })` object — not inside `if (asset.bondDetails)`,
    where a bond saved without details would leave the field empty when «Dettagli Cedole» is switched on —
    `bondMinimumLot: effectiveBondMinimumLot(asset.bondDetails?.minimumLot)` and `bondLotStep:
    asset.bondDetails?.lotStep`; the new-record branch (`:1345`) `bondMinimumLot: DEFAULT_BOND_MINIMUM_LOT,
    bondLotStep: undefined` beside `bondNominalValue: undefined`; the switch that clears the bond block (`:2779`)
    also `setValue('bondMinimumLot', DEFAULT_BOND_MINIMUM_LOT)` and `setValue('bondLotStep', undefined)`;
  - the two fields, right after «Valore nominale per unità» (`:2922-2944`), same markup, side by side from `sm:`:
    «Taglio minimo ({watchCurrency})», `id="bondMinimumLot"`, `type="number"`, `step="any"`, `placeholder="1000"`,
    `{...register('bondMinimumLot', { valueAsNumber: true })}`; «Multipli di ({watchCurrency})» `(opzionale)`,
    `id="bondLotStep"`, the same attributes, `placeholder="come il taglio minimo"`; each with its error line, and
    ONE help line under the pair: «Il nominale minimo che si può comprare e il passo di ogni ordine: 1.000 e
    1.000 per i titoli di Stato. Il piano di accumulo compra solo quantità che li rispettano.»
  The fields show only inside the «Dettagli Cedole» block, as «Valore nominale» does: a bond without that block
  keeps the defaults.

### 4.3 The plan's engine — `lib/utils/accumulationPlanUtils.ts`

- `PositionState` gains `lot: (LotRule & { heldUnits: number }) | null; // the buy asset's lot (lib/utils/bondLot.ts)
  with the units it holds today; null unless a single bond`. `resolvePositionStates` sets it from
  `const rule = buyAsset ? lotRuleOf(buyAsset) : null;` as `lot: rule ? { ...rule, heldUnits: buyAsset!.quantity } :
  null`.
- Two module-private helpers above `scheduleInstallments`:

  ```ts
  /** The units `budget` buys of the position, `bought` being what the plan bought of it before: whole units — of a single bond, what its lot allows. */
  const affordableUnits = (budget: number, s: PositionState, bought: number): number =>
    buyableUnits(budget / s.buyPriceEur, s.lot, (s.lot?.heldUnits ?? 0) + bought);
  /** The smallest order the position may still place, in units: one unit, or a bond's next lot. */
  const nextUnits = (s: PositionState, bought: number): number => nextOrderUnits(s.lot, (s.lot?.heldUnits ?? 0) + bought);
  ```

- `scheduleInstallments`: beside `carry` and `spentByPosition`, `const boughtUnits: Record<string, number> = {};`
  initialised at 0 for every state. The regular line's `const q = Math.floor(budget / s.buyPriceEur + 1e-9);`
  becomes `const q = affordableUnits(budget, s, boughtUnits[s.positionId]);` and the swap's floor becomes
  `const q = affordableUnits(swap.eur, s, boughtUnits[s.positionId]);`; each is followed by
  `boughtUnits[s.positionId] += q;`. Nothing else in the two loops: `spend`, the carry and the swap's residual
  already follow `q`.
- The last month's redistribution (`else if (m === months)`): the candidates' filter becomes

  ```ts
  const orderEur = (s: PositionState) => nextUnits(s, boughtUnits[s.positionId]) * s.buyPriceEur;
  const candidates = pricedStates.filter((s) => {
    const lacking = remainingDeficit[s.positionId];
    // A bond's order is taken from the pool only when at least half of it is still lacking (owner, 2026-11-23):
    // one unit of anything else keeps the old rule, any deficit.
    const enough = s.lot ? lacking >= orderEur(s) / 2 - 1e-9 : lacking > 1e-9;
    return enough && orderEur(s) <= pool;
  });
  ```

  the sort's `byPrice` compares `orderEur(a) - orderEur(b)`; the pick adds one order: `const units =
  nextUnits(picked, boughtUnits[picked.positionId]); const eur = units * picked.buyPriceEur;` then
  `line.plannedQuantity += units;`, `line.plannedAmountEur = roundToCents(line.plannedAmountEur + eur);`,
  `spentByPosition[picked.positionId] += eur;`, `pool -= eur;`, `remainingDeficit[picked.positionId] -= eur;`,
  `boughtUnits[picked.positionId] += units;`.
- `recalibrateInstallment`: the lookup `const installment = plan.installments.find((i) => i.index === index);` moves
  above the budgets, and the loop that fills them becomes

  ```ts
  for (const s of pricedStates) {
    const total = totals[s.positionId] ?? 0;
    // A bond's lot is bought with the months that waited for it (2026-11-23): what the calendar carried into
    // this instalment is spent now, the rest is spread as ever. The carried cash is in the account, so `totals`
    // already counts it: it leaves the split, it is never added on top.
    const carryIn = s.lot ? Math.min(total, Math.max(0, installment?.carryInEur?.[s.positionId] ?? 0)) : 0;
    const spread = liquidity.monthShares
      ? (total - carryIn) * liquidity.monthShares[0]
      : buyingMonths > 0 && liquidity.refillMonths === 0 ? (total - carryIn) / buyingMonths : 0;
    // A month that refills the reserve buys nothing: the carry waits with the rest.
    budgets[s.positionId] = spread + (liquidity.refillMonths === 0 ? carryIn : 0);
  }
  ```

  `floorQuantities` reads `affordableUnits(budgets[s.positionId], s, 0)`; the swap line reads
  `quantities[s.positionId] += affordableUnits(swap.eur, s, quantities[s.positionId]);`. The asset's quantity is
  today's, so `bought` starts at 0.
- `seedDisposalsFromSale`: `const whole = Math.min(Math.floor(soldEur / price + 1e-9), Math.ceil(asset.quantity) -
  1); const rule = lotRuleOf(asset); const quantity = rule ? sellableUnits(whole, rule, asset.quantity) : whole;`.
- A new export, beside `projectPlanOutcome`:

  ```ts
  /** One lot position's purchases from `fromIndex` on. */
  export interface LotPurchases {
    positionId: string;
    label: string;
    minNominal: number;
    stepNominal: number;
    /** The months, ascending, of the instalments from `fromIndex` on with a regular line of the position still `planned`. */
    months: MonthKey[];
    /** The instalments from the later of `fromIndex` and the plan's first month with a regular line of ANY position, to the last; 0 in a plan that never buys. */
    buyingMonths: number;
    /** A line of the position that is not skipped and is not in `months`: an earlier month's, an executed one, a swap's. */
    bought: boolean;
  }

  export function summarizeLotPurchases(states: readonly PositionState[], installments: readonly Installment[], fromIndex: number): LotPurchases[]
  ```

  It returns one entry, in the states' order, per state with a `lot`, a price (`!unpriced`) and
  `targetPercentage > 0`. `isRegularLine` is imported from `lib/utils/accumuloMonth.ts`.

No stored shape changes: `InstallmentLine.plannedQuantity`, `carryInEur` and `residualEur` are the same fields, so
`accumulationPlanDoc.ts`, `accumulationPlanSchema.ts`, the service and the rules are untouched. A plan saved before
this spec keeps its unit-sized lines of a bond until it is revised: the recalibration of its open month proposes
the lot-sized quantities, 0 while the month's own money does not reach one (a blind spot, § 9).

### 4.4 The sentence — `lib/utils/accumulationNarrative.ts`

```ts
/** A lot instrument's calendar in one sentence (2026-11-23); null when there is nothing to say. */
export function describeLotSchedule(purchases: LotPurchases): string | null {
  const nominal = (amount: number) => formatNumberIt(amount, 0);
  const lot = purchases.stepNominal === purchases.minNominal
    ? `a tagli da ${nominal(purchases.minNominal)} di nominale`
    : `da ${nominal(purchases.minNominal)} di nominale in su, a multipli di ${nominal(purchases.stepNominal)}`;
  if (purchases.months.length === 0) {
    // Bought already, or a plan with no buying month left: other lines say it.
    if (purchases.bought || purchases.buyingMonths === 0) return null;
    return `${purchases.label} si compra ${lot}: la sua quota non ci arriva entro la fine del piano, non verrà comprato.`;
  }
  if (purchases.months.length >= purchases.buyingMonths) return null;
  const count = purchases.months.length === 1 ? '1 acquisto' : `${purchases.months.length} acquisti`;
  const { year, monthIndex } = parseMonthKey(purchases.months[0]);
  return `${purchases.label} si compra ${lot}: ${count} da qui alla fine del piano, il prossimo ${monthWithPrepositionA(monthIndex + 1)} ${year}.`;
}

/** Every lot sentence of a plan, in the positions' order. */
export function describeLotSchedules(purchases: readonly LotPurchases[]): string[] {
  return purchases.map(describeLotSchedule).filter((sentence): sentence is string => sentence !== null);
}
```

`formatNumberIt` comes from `lib/utils/formatters.ts`, `parseMonthKey` from `lib/utils/planMonths.ts`,
`monthWithPrepositionA` from `lib/utils/patrimonioNarrative.ts` («ad aprile», «a marzo»). The four surfaces:

- `lib/utils/planPathNarrative.ts`: `PlanPathSummary` gains `lotSchedules: string[]` — a calendar, not a
  warning: it does not go in `warnings`, which the page renders in the warning box. The creation summary fills
  it with `describeLotSchedules(summarizeLotPurchases(resolvePositionStates(draft.positions, assetsById,
  context.deps, draft.disposals), preview.schedule.installments, 1))`; the revision summary keeps the states it
  already resolves for its unpriced warning (`:345`) and fills it with
  `describeLotSchedules(summarizeLotPurchases(states, plan.installments, result.firstIndex))`; a refused
  revision returns `lotSchedules: []`.
- `components/allocation/piano/PianoScreens.tsx`: one `<p className={NOTE_CLASS}>` per sentence, right after
  `summary.taxTotal` (`:419`) and before the warnings.
- `components/allocation/tiles/QuestoMeseTile.tsx`: a plain constant beside `unpricedLabels` (`:458`, no memo:
  the tile has none there) — `describeLotSchedules(summarizeLotPurchases(states, plan.installments,
  currentIndex))` — rendered right after the `unpricedLabels` paragraph (`:709`) and before `AdvisorNotes`, one
  `<p className="mt-2 text-[12px] text-muted-foreground">` per sentence: neutral ink, a calendar.
- `lib/utils/advicePlan.ts`: `AdvicePlanBuild` gains `states: PositionState[]` — the ones `buildAdvicePlan`
  resolves for the weights (`:454`), on the map that holds the provisional instruments. `syntheticAsset`
  (`:277`) gains `...(formData.isin ? { isin: formData.isin } : {})`: today the provisional asset of a new bond
  has no ISIN, so no lot would bind it and the preview would schedule it in units.
  `components/allocation/consulente/ConsulentePlanTick.tsx`: under the tick's sentence
  (`describeAdvicePlanSummary`), the same paragraphs from `describeLotSchedules(summarizeLotPurchases(
  build.states, build.preview.schedule.installments, build.firstIndex))`.

### 4.5 The Consulente — facts, contract, reconcile

- `lib/utils/operatingPlan.ts`: `OperatingPlanInstrument` gains `lot?: LotRule` («a single bond's lot, in quotes
  and in nominal; absent on anything else»). `OPERATING_PLAN_COPY` gains

  ```ts
  toLot: (asked: number, name: string, sold: number) =>
    `Il Consulente indicava ${formatQuantity(asked)} quote di ${name}: il piano ne vende ${formatQuantity(sold)}, quanto il suo taglio minimo permette.`,
  belowLot: (name: string) => `La vendita parziale di ${name} non rispetta il suo taglio minimo: non entra nel piano.`,
  ```

  and step 6 of `reconcileOperatingPlan`, after `const asked = …` and its `asked <= 0` branch, before the
  `asked >= heldQuantity` branch:

  ```ts
  const lot = facts.instruments.find((instrument) => instrument.ref === row.ref)?.lot;
  if (lot && asked < heldQuantity) {
    const whole = sellableUnits(asked, lot, heldQuantity);
    if (whole <= 0) {
      corrections.push(OPERATING_PLAN_COPY.belowLot(nameOf(row.ref)));
      removeSale(row);
      continue;
    }
    if (whole !== asked) corrections.push(OPERATING_PLAN_COPY.toLot(asked, nameOf(row.ref), whole));
    row.sellQuantity = whole;
    continue;
  }
  ```

  A sale of everything held (`asked >= heldQuantity`, or no `sellQuantity`) is never rounded: the whole position
  goes, whatever it counts. The rules keep the count DATI-19 left (seventeen): this is a branch of the sixth.
- `lib/utils/operatingPlanFacts.ts`: BOTH `legendOf` — the one of `buildOperatingPlanFacts` (`:59`) and the one of
  `refreshOperatingPlanFacts` (`:156`) — add `...(lotRuleOf(asset) ? { lot: lotRuleOf(asset)! } : {})`; a `new`
  instrument gets `lot` from `lotRuleOf({ type: row.prefill.type, assetClass: row.prefill.assetClass, isin:
  row.prefill.isin })` when not null (a new bond is created on 1 € of nominal with no stored lot: 1.000 quotes),
  and a `new` row the refresh keeps as it is keeps its stored `lot`. The held facts are untouched.
- `lib/server/allocationAdvice/prompts.ts`:
  - a private `lotFact(lot: LotRule): string` — `` `taglio minimo ${quantityFact(lot.minUnits)} quote` `` followed,
    when `lot.stepUnits !== lot.minUnits`, by `` `, poi multipli di ${quantityFact(lot.stepUnits)}` ``: QUOTES,
    the unit `sellQuantity` is written in (a bond that stores a nominal of 1.000 per unit reads «taglio minimo 1
    quote»);
  - `heldFactLine` pushes `lotFact(instrument.lot)`, when set, after the tax (or after the price on a 0-quote
    row) and before «DA TENERE»; the `new` rows' line appends the same part; in both, DATI-19's « · peso voluto
    nella sotto-categoria …» stays the row's last part;
  - the first section's header becomes «… · tasse stimate se venduto tutto · taglio minimo in quote per
    un'obbligazione singola):»;
  - `PLAN_CONTRACT` gains one rule, after «Le quote da vendere non superano quelle possedute…»:
    `"- Un'obbligazione singola si compra e si vende a tagli, scritti nel blocco in quote («taglio minimo N quote», e «poi multipli di M» quando il passo è più piccolo): la posizione non resta sotto il taglio minimo e ogni ordine è un multiplo del passo. L'app la compra nel mese in cui la sua quota accumulata arriva a un ordine possibile, non ogni mese. Non dare un peso \"buy\" a un'obbligazione la cui quota nell'intero piano (il suo peso × il versamento × i mesi, più la sua parte della liquidità sopra la riserva) resta sotto il taglio: mettila \"hold\" oppure allunga il piano, e dillo in \"departures\". \"sellQuantity\" di un'obbligazione è un multiplo del passo che lascia almeno il taglio minimo, oppure tutte le quote."`
  The system stays static: the rule is the same for every user, the lots sit in the user content.

### 4.6 The trade form — `components/assets/TransactionDialog.tsx`

`describeLotWarning` lives in `lib/utils/bondLot.ts` (§ 4.1), pure and tested there: no test imports the dialog
for it. The dialog renders it under the quantity field, after `errors.quantity`'s line, as
`<p className="text-sm text-warning-foreground">` with `role="status"`, ONLY while recording a trade (`transaction`
absent): `describeLotWarning({ type, quantity, heldQuantity, rule: lotRuleOf(asset), currency: asset.currency })`
from the watched `type` and `quantity` and the `heldQuantity` the dialog already reads (`:347`). In an edit that
quantity is already the one after the trade: the line is not shown. The zod schema, the submit and the payload are
untouched. The asset is the one DATI-06's flow hands over after re-reading it: a lot typed in the asset form a
moment before is there.

## 5. Constraints and traps

- **«`quantity = 0` marks a sold asset — or one created empty for a plan»** (AGENTS.md § Patrimonio): here it means
  the lot is read from the buy asset whatever it holds — a bond the Consulente created at 0 quotes has its lot,
  and its first purchase must reach the minimum.
- **«A Borsa Italiana bond quote is `% of par`, always, and `lib/utils/bondPricing.ts` is the ONE conversion»**:
  `bondLot.ts` imports `effectiveBondNominal` and `isBondQuotedInPercent` and re-implements neither.
- **«A new `BondDetails` field»** owes `buildBondDetailsFromForm`, BOTH branches of the reset effect and the edit
  round-trip (the type's own WARNING): § 4.2 lists the sites, for both fields.
- **The recalibration recomputes the totals from the REAL account** (`computeUsableLiquidity`): the money a lot
  waited for is already in them. Adding the recorded carry on top buys the lot a month early and a second one
  after — § 4.3 takes it out of the split first.
- **The Consulente counts in quotes, the lot is in nominal**: a lot printed in euro beside quantities in quotes
  turns a partial sale of a bond that stores its nominal into a total one. The facts print quotes.
- **«Functions that call `new Date()` internally are untestable»**: nothing here reads a clock.
- **«A system prompt is static»** (index § 8): `PLAN_CONTRACT` gains a constant sentence; every lot is in the facts
  block. `__tests__/allocationAdvicePrompts.test.ts` pins both.
- **«Only `ConsulentePlanTick.tsx` may import the plan's builder and utils on the route»** (doc/guide/consulente-piano.md):
  the tick is where § 4.4's fourth surface lives; no other Consulente component imports `summarizeLotPurchases`.
- **«every reading of "a month that buys" goes through `isRegularLine`»** (AGENTS.md § Accumulo): `summarizeLotPurchases`
  does.
- **The React Compiler is on**: `describeLotWarning` is a pure call in render.
- **Curly apostrophes break `.tsx`**: the Italian strings with an apostrophe are delimited by double quotes or
  backticks.
- **A series label never enters the code**: comments say «2026-11-23».
- **Figures in tests are invented and round**: «BTP Alfa», lot 1.000, inflow 400; «Obbligazione Beta», 100.000
  and 1.000.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/bondLot.test.ts` (new) | `lotRuleOf`: a bond with an ISIN and no details → 1000 / 1000 units, 1000 / 1000 of nominal; with `nominalValue: 1000` → 1 / 1 and 1000 / 1000; with `nominalValue: 100, minimumLot: 1000` → 10 / 10; `minimumLot: 100000, lotStep: 1000` → 100000 / 1000; `minimumLot: 1000, lotStep: 300` → the minimum 1200 | `Math.ceil(amount / nominal …)` → `Math.floor(nominal / amount)`; `lotStep` ignored |
| U2 | unit · same | an ETF, a stock, a cash account → null; a bond with no ISIN and no nominal → null | `hasBondLot` → `asset.type === 'bond'` alone |
| U3 | unit · same | `minimumLot: 0`, `NaN`, `undefined` → 1000; `lotStep` `0`, `NaN`, `undefined` → the minimum | `effectiveBondMinimumLot` returns the stored value unguarded |
| U4 | unit · same | `buyableUnits`: without a rule `(7.9, null, 0)` 7; 1000/1000 from 0: `2999` → 2000, `999` → 0; 100000/1000 from 0: `99000` → 0, `120500` → 120000; from 100000 held: `2500` → 2000. `nextOrderUnits`: 100000 from 0, 1000 from 100000, 1 without a rule. `sellableUnits`: 1000/1000 with 5000 held: `2500` → 2000, `800` → 0, `5000` → 5000; 100000/1000 with 150000 held: `80000` → 50000 | `held + units >= minUnits` dropped; `room` dropped |
| U5 | unit · `__tests__/assetDialogHelpers.test.ts` | `buildBondDetailsFromForm` with `bondMinimumLot: 5000, bondLotStep: 1000` returns both; with `NaN` neither key | drop a spread |
| U6 | unit · `__tests__/accumulationPlanUtils.test.ts` | a lot position (1000 / 1000, 0 held, price 0,99) with a monthly share of 400 over 6 months: lines only where the carry reaches 990, every `plannedQuantity` a multiple of 1000, the months between carry (`carryInEur` grows) | `affordableUnits` → `Math.floor(budget / s.buyPriceEur + 1e-9)` |
| U7 | unit · same | on U6's plan, Σ `plannedAmountEur` + `residualEur` = Σ totals to the cent | `carry[s.positionId] = budget - Math.floor(budget / s.buyPriceEur + 1e-9) * s.buyPriceEur` |
| U8 | unit · same | a swap of 2.500 € into the lot position buys 2000 units and leaves the rest in the residual | the swap's `affordableUnits` → the old floor |
| U9 | unit · same | last month, pool 1.200: a lot position lacking 600 gets a lot; lacking 300 gets none and a unit position takes the money; a bond that stores `nominalValue: 1000` (one unit a lot, 990 €) lacking 300 gets none | `orderEur(s) / 2` → `> 1e-9`; `s.lot ?` → `nextUnits(…) > 1 ?` |
| U10 | unit · `__tests__/accumulationPlanRevision.test.ts` | `recalibrateInstallment`, the account holding what the calendar carried: on the month U6 buys a lot `suggestedQuantity` 1000 = `plannedQuantity` and `shouldProposeRecalibration` false; on a waiting month both 0; with a share of 320: month 3 suggests 0, month 4 suggests 1000 | `(total - carryIn)` → `total` (month 3 buys); drop `+ carryIn` (no month buys) |
| U11 | unit · `__tests__/accumulationPlanUtils.test.ts` | `seedDisposalsFromSale` on a bond held 5000 with `soldEur` 2.990 at 0,99 → `quantity` 3000; with 900 → no disposal; on a bond held 1000 → no partial disposal | drop `sellableUnits` |
| U12 | unit · same | `summarizeLotPurchases` on U6's schedule: one entry, `months` the buying ones from `fromIndex`, `bought` true once `fromIndex` is past the first purchase; an executed line leaves `months`; a plan of the bond alone at 300 a month → `months` 1, `buyingMonths` 3; a plan that never buys → `buyingMonths` 0; a non-bond, a 0% and an unpriced position give no entry | `fromIndex` taken as the first month that buys the bond; `!unpriced` dropped |
| U13 | unit · `__tests__/accumulationNarrative.test.ts` | `describeLotSchedule`: no month, never bought → «…non verrà comprato.»; no month and `bought`, or `buyingMonths` 0 → null; two of six → «2 acquisti … il prossimo ad aprile 2027.»; one → «1 acquisto»; six of six → null; 100.000 / 1.000 → «da 100.000 di nominale in su, a multipli di 1.000» | `>= purchases.buyingMonths` → `>`; drop the `bought` guard |
| U14 | unit · `__tests__/operatingPlan.test.ts` | `reconcileOperatingPlan`, a held bond with `lot` 1000 / 1000 and 5000 held: `sellQuantity` 2500 → 2000 with the `toLot` sentence; 800 → the sale removed with `belowLot`; 5000 → sold whole, no sentence; a bond of one quote per lot (`lot` 1 / 1, 5 held): 2 stays 2 | drop the `lot &&` branch |
| U15 | unit · `__tests__/operatingPlanFacts.test.ts` | `buildOperatingPlanFacts` AND `refreshOperatingPlanFacts`: a held bond carries `lot`; an ETF none; a `new` bond with an ISIN `lot` 1000 / 1000, kept by the refresh | the spread dropped from one `legendOf` |
| U16 | unit · `__tests__/allocationAdvicePrompts.test.ts` | `formatOperatingPlanFacts` prints «taglio minimo 1.000 quote» on the bond's row and on the new bond's, «taglio minimo 1 quote» for a bond that stores a nominal of 1.000, «taglio minimo 100.000 quote, poi multipli di 1.000», nothing on the ETF's; with DATI-19's weight the row ends with «peso voluto…» | print `lot.minNominal` |
| U17 | unit · same | `PLAN_CONTRACT` contains «taglio minimo» and is the same string across two calls of `buildPlanPrompt` with different facts | interpolate a lot into the contract |
| U18 | unit · `__tests__/bondLot.test.ts` | `describeLotWarning`: buy 1500 of a 1000 / 1000 lot → the step sentence with the currency; 2000 → null; a first buy of 50000 of a 100000 / 1000 lot → the minimum sentence; a sale of 2000 out of 2500 → the minimum sentence; a sale of everything held (1500) → null; an adjustment, an ETF (`rule: null`), an empty quantity → null | drop the «everything held» line; `after` computed as `held + quantity` on a sale |
| U19 | unit · `__tests__/accumulationPlanUtils.test.ts` | a 100000 / 1000 position at price 1, 0 held, a share of 60.000 a month: month 1 buys nothing, month 2 buys 120000, month 3 buys 60000; the same position with 100000 held buys 60000 in month 1 | `boughtUnits` not updated after a line |
| U20 | unit · `__tests__/advicePlan.test.ts` | a plan that buys a `new` bond with an ISIN: `build.states` holds its position with a `lot`, and every line of it in `build.preview` is a multiple of 1000 | `syntheticAsset` without `isin` |
| P1 | unit · `__tests__/planPath.test.ts` | the creation summary and the revision summary of a plan with a lot bond carry the sentence in `lotSchedules`, none in `warnings`; a plan of ETFs and a refused revision carry `[]` | the sentences pushed to `warnings` |
| T1 | dom · `__tests__/consulentePlanTick.test.tsx` | a ready plan with a row that buys a new bond prints the sentence under the tick | the tick resolves the states on the route's assets instead of `build.states` |
| D1 | dom · `__tests__/assetDialogBondLot.test.tsx` (new, on the harness of `assetDialogCreateEmpty.test.tsx`) | a new bond with «Dettagli Cedole» open shows «Taglio minimo» at 1000 and «Multipli di» empty; editing a bond that stores 5000 and 1000 shows them; one saved WITHOUT details, edited, the switch turned on → 1000 | the edit branch sets the field inside `if (asset.bondDetails)` |
| D2 | dom · `__tests__/questoMeseTile.test.tsx` | an active plan with a lot position that buys in two of six months prints the sentence after the unpriced line and before «Dal Consulente»; a plan of ETFs prints none | drop the paragraph |
| E1 | e2e · `e2e/assets.bond.spec.ts` | a bond saved with «Taglio minimo» 5000 and «Multipli di» 1000 reads `bondDetails.minimumLot === 5000` and `lotStep === 1000` on Firestore; reopened, the fields show them; recording a purchase of 5500 shows the warning and saves | drop the spreads in `buildBondDetailsFromForm` |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the fixture account a plan of 400 €/month over two ETFs and one BTP at 0,99
buys the BTP in lots of 1000 units on the months its carry reaches 990 €, and «Questo mese» says «… si compra a tagli
da 1.000 di nominale: N acquisti da qui alla fine del piano, il prossimo a/ad …»; the trade form warns on 1500 and
saves it.

- A — the diff; the suites of doc/guide/accumulo.md § Files and doc/guide/consulente-piano.md § Files green.
- B–E automated by a throwaway Playwright script on the emulators (a planted bond «BTP ornitorinco», invented
  figures), at 1440 and 390: B the asset form's two fields, saved and reread on Firestore; C a plan created by the
  path at `/dashboard/allocation/piano` — the summary's sentence as a note, not in the warning box, then the
  stored `installments` read on Firestore: every line of the bond a multiple of 1000, the months between with a
  growing `carryInEur`; the open month's «Ricalibra» proposes nothing to change; D the trade form's warning and
  the saved trade, then the same trade opened in edit (no line); E the Consulente's click: the script plants the
  stored operating plan itself, with the held «BTP ornitorinco» (5000 units, an ISIN, no details) and a `sell`
  row of 2500 as the model wrote it, not reconciled — the tick shows the correction's sentence and the plan
  sells 2000. No model call. Decoy: «Obbligazione fenicottero», priced by hand with no ISIN and no nominal — no
  lot anywhere.
- F — at the owner's «pronto», on the mirror: «Questo mese» and the path's summary with a bond in the plan; the
  two fields on one of his bonds. The Consulente's real run is his, in production after the deploy (WORKFLOW § 3).
- G — the planted bonds, the trade and the plan deleted by the app; the script deleted.

## 8. Putting it into service

No DDL, no rule, no deploy step, no migration: an absent `minimumLot` reads 1.000, an absent `lotStep` the
minimum. Measures: `npm run perf:budget` on `/dashboard/allocation`, `/dashboard/allocation/piano` and
`/dashboard/assets`, inside their ceilings — a ceiling is raised by no more than 1 KB gz and only with the register
row (index § 8 rule 7); `npm run mobile:census -- --email=census@example.com` and `npm run mobile:budget` on the
same :3200 build, green on `allocazione-accumulo`. With phase F closed and the commit in `develop`, the owner opens
the PR `develop` → `main` (index § 8 rule 13); after it, on the production account: open a bond and see «Taglio
minimo» 1.000; a plan already active keeps its lines until revised.

## 9. Documentation

- `doc/guide/accumulo.md` § Rules — one bullet: a single bond is bought in lots (`lib/utils/bondLot.ts`,
  `PositionState.lot`, the first purchase at the minimum and then by steps, the carry that waits, the half-order
  rule of the last month, the recalibration's carry-in counted once, `summarizeLotPurchases` →
  `describeLotSchedule` and its four surfaces); § Files — `bondLot` among the utils and the suites; § Per-page
  blind spots — a plan saved before 2026-11-23 keeps its unit-sized bond lines until revised, and its
  recalibration proposes 0 while the month's money is under a lot; the sale quantity typed on the path is not
  checked against the lot; a bond priced by hand with no nominal has no lot; «Con vendite mirate» never sells
  part of a bond that holds a single lot; a sale still to be made is not subtracted from the units held when the
  plan decides whether the minimum is reached; the sentences print the nominal without a currency.
- `doc/guide/consulente-piano.md` § The stage — the lot in the facts block (in quotes), the contract's rule, the
  reconcile's two sentences, `AdvicePlanBuild.states`; § Per-page blind spots — the lot rule is in the plan stage
  alone: the strategy, the instruments search and the review do not read it.
- `doc/guide/patrimonio.md` (and `doc/guide/patrimonio-strumenti.md` for the instruments' rows) — the bond's «Taglio minimo»
  and «Multipli di» beside the nominal, one sentence where the bond pricing is described; § Per-page blind spots —
  the lot is the user's field: Borsa Italiana's page is not read for it.
- `doc/guide/registro-operazioni.md` — the trade form's warning; § Per-page blind spots — it never blocks, the
  server never checks it, an edit and an adjustment show none.
- `doc/guide/ottimizzatore.md` § Per-page blind spots — the model's weights are not rounded to lots: a model is
  weights, the plan turns them into orders.
- `doc/guide/velocita.md` § Registro — only if a ceiling was raised.
- `AGENTS.md` § 3, the Accumulo stub — `lotRuleOf` (`lib/utils/bondLot.ts`) enters the list of its last bullet
  («Il resto — …») as one name; the stub rewritten at equal or shorter length (decision 47).
- `README.md` — Allocazione › Accumulo: one sentence, «un'obbligazione si compra a tagli».
- `Draft Release Temp.md` — one entry prepended in `## ✨ New Features`, in the file's form: «**Obbligazioni — il
  taglio minimo** — The plan of accumulation and the Consulente buy and sell a single bond in lots: «Taglio
  minimo» and «Multipli di» on the bond (1.000 by default), a month that does not reach a lot waits, and the
  trade form warns on a quantity the lot does not allow.»
- `CLAUDE.md` — Accumulo's sentence rewritten at equal or shorter length; the «Latest» entry REPLACED whole
  (decision 46: the date, this spec in one sentence, «Open: doc/dati/ (README § 6)», «Next: DATI-21»); under
  20.000 characters, counted with `node`.
- `doc/dati/README.md` § 6 (the row of 20 to `implemented`).

## 10. Declared out of scope

- A check of the lot on the server, or a refusal in the form → not planned (decision 43); doc/guide/registro-operazioni.md
  § Per-page blind spots.
- The lot read from Borsa Italiana's page by the scraper → not planned: the fields are the user's;
  doc/guide/patrimonio.md § Per-page blind spots.
- The rule in the Consulente's strategy, instruments and review stages → not planned (adopted choice i);
  doc/guide/consulente-piano.md § Per-page blind spots.
- The optimizer's weights («Portafoglio modello») rounded to lots → not planned; doc/guide/ottimizzatore.md
  § Per-page blind spots.
- A warning on an adjustment to a quantity the lot does not allow → not planned: an adjustment is a correction of
  the count; doc/guide/registro-operazioni.md § Per-page blind spots.
- Registra (the Assistente) on a bond → none: a bond goes through the form (DATI-16's adopted choice), where the
  warning lives.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-20-lotto-minimo-obbligazioni.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi, regole della serie)
- Leggi doc/guide/accumulo.md, doc/guide/consulente-piano.md, doc/guide/consulente.md,
  doc/guide/patrimonio.md, doc/guide/registro-operazioni.md, doc/guide/ottimizzatore.md,
  doc/guide/dialog.md, doc/guide/velocita.md, doc/guide/prima-schermata.md,
  doc/guide/e2e-emulatori.md e doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Tocca la UI: leggi DESIGN.md e PRODUCT.md prima di disegnare
- Tocca l'API di Anthropic (il contratto del piano del Consulente): usa la skill claude-api prima di
  toccare il prompt
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

Implementa la spec così com'è scritta, nell'ordine: la regola pura (U1–U4, U18), il tipo e il modulo
dello strumento (U5, D1), il motore del piano (U6–U12, U19), la frase e le sue quattro superfici — il
riepilogo del percorso, PianoScreens, «Questo mese», la spunta del Consulente con
lib/utils/advicePlan.ts (U13, P1, D2, U20, T1) —, il Consulente — fatti, contratto, riconciliazione
(U14–U17) —, l'avviso nel modulo dell'operazione, poi E1, perf:budget e mobile:budget, i documenti del
§ 9 e la riga 20 di doc/dati/README.md § 6 a `implemented`. OGNI test del § 6 va visto rosso con la
sua mutazione. Il codice dei §§ 4.1, 4.3, 4.4 e 4.5 è già scritto: copialo.

Fermati e chiedimi se: DATI-06, DATI-18 o DATI-19 non sono in develop come li descrivono le loro spec (per una ritirata, l'indice § 7)
(il modulo unico che rilegge lo strumento, il blocco obbligazione del modulo dell'operazione,
OperatingPlanInstrument.wanted e le diciassette regole della riconciliazione), una suite esistente
del piano di accumulo va rossa per uno strumento che non è un'obbligazione, la somma «righe + residuo
= totali» non torna al centesimo con un lotto, il prompt di sistema del piano smette di essere
identico tra due utenti, oppure un tetto di perf:budget si alzerebbe di più di 1 KB gz.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa. A commit in develop, ricordami la PR develop → main (regola 13
dell'indice).
```

Model: **Opus 5.5**, effort **medium** — an L spec on the plan's engine: five floors of one pure module follow a
two-number lot, the recalibration counts a carry once, and the Consulente's static contract gains a rule.
Estimated size: L (one pure module, the engine, one sentence on four surfaces, the facts and the reconcile, two
fields, one warning; 25 tests).
