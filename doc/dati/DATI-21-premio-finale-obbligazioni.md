# DATI-21 — A bond's final premium is owed on the units bought at issue: the app counts them, the Consulente knows it

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-04 (contract C8: `lib/utils/dividendEntitlement.ts`,
> `lib/server/dividendEntitlementService.ts`, the zero-quantity guard of `scheduleFinalPremium`,
> `scheduleCouponsForOpenedPosition`, the dialog's `toast.info`), DATI-06 (ONE form for every purchase), DATI-18
> (it edits `commitTradeMutation` and the trade form before this spec) and DATI-20 (`lib/utils/bondLot.ts`, the lot
> branch in step 6 of `reconcileOperatingPlan`, the warning line under the trade form's quantity). Written on
> 2026-11-23; every `file:line` is cited @ 94101a1c (a line number is a hint, the function's name is the anchor).
> Owner's point 15; decisions 69, 70, 71, 72 and 94.

## 1. The problem today (evidence on the code)

- **The premium is computed on everything held.** `scheduleFinalPremium` (`lib/services/couponScheduling.ts:106`)
  writes the maturity record as `finalPremiumRate / 100 × nominal × quantity`, the asset's whole quantity. A retail
  government bond (BTP Valore, BTP Italia) pays its final premium only on the units bought at issue and held without
  interruption to maturity: the same bond bought on the market pays none. A second purchase of a bond that carries a
  `finalPremiumRate` raises the premium the app announces.
- **DATI-04 makes it systematic.** Its `reconcileAnnouncedDividend` rewrites every automatic record that has not been
  cashed on the quantity the ledger holds before the ex-date; the premium's ex-date is the maturity, so after any
  purchase the record takes the new, larger quantity.
- **Nothing says how many units are entitled.** `BondDetails` (`types/assets.ts`) has `finalPremiumRate` and no count;
  `finalPremiumRate` is read in three places only — `couponScheduling.ts:109`, `lib/utils/bondDetailsForm.ts:90`,
  `components/assets/AssetDialog.tsx:1308`.
- **The Consulente does not know the premium exists.** `formatBondTermsBlock` (`lib/utils/allocationAdviceBonds.ts`)
  prints maturity, coupon, value and role; `heldFactLine` (`lib/server/allocationAdvice/prompts.ts:603`) prints
  quantity, price, value and tax; `reconcileOperatingPlan` (`lib/utils/operatingPlan.ts`) checks a sale against the
  held quantity and nothing else. It can propose selling a bond that loses its premium by being sold, or buying more
  of it as if the new units earned one.
- **A sale typed by hand says nothing either**: `TransactionDialog.tsx` has no line about the premium.

## 2. Goal and acceptance criteria

A bond with a final premium carries the number of units the premium is owed on; a purchase never raises that number,
a sale lowers it when the holding falls below it, the owner can correct it; the maturity record, the Consulente and
the trade form all read it.

1. `BondDetails.finalPremiumQuantity` exists; absent means «everything held». Only a `bond` has a premium: details
   left on an asset whose type was changed are not read. Proof: U1, U2, U11.
2. The asset form shows «Unità con diritto al premio» on a held bond with a premium, proposed at the stored count or,
   when none is stored, at the quantity held; it refuses a count above the quantity held; a bond that holds
   nothing keeps what it stores. Proof: D1.
3. The first trade CREATED on a bond that holds something and has no stored count stores the count: the quantity
   held before the trade, capped by the quantity after it. Proof: U3, S1.
4. Every ledger mutation lowers a stored count to the quantity it leaves, never raises it; a trade settled on the
   maturity day or after — the redemption — never changes it. A trade on anything that is not a premium bond
   writes what it writes today. Proof: U4, U5, S2, S3.
5. The maturity record is written and rewritten on the entitled units, and deleted when they reach 0 — at a save
   of the form, at a purchase that opens the position (DATI-04's `scheduleCouponsForOpenedPosition`), after every
   trade and on the payment day. Proof: U6, U7, S4, P2.
6. The trade result says how many entitled units a mutation removed, and the form toasts it; an edit or a delete
   of a PURCHASE on a bond that stores its count toasts the reminder of decision 94. Proof: U8, D2.
7. Under the trade form's quantity a sale that cuts into the entitled units prints the premium it gives up, a
   purchase on a bond with a premium prints that the new units earn none; neither blocks the submit. Proof: U9,
   D2.
8. The Consulente's bond block and the operating plan's facts carry the premium; `PLAN_CONTRACT` and
   `STRATEGY_CONTRACT` carry one static rule each. Proof: U10, U11, P1.
9. A sale the operating plan proposes keeps its quantity and gains one sentence with the premium lost in euro —
   a sale of the whole position too. Proof: U12.
10. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run` and `TZ=UTC npx vitest run` are green;
    `npm run perf:budget` is green with `/dashboard/assets` and `/dashboard/allocation` inside their ceilings,
    raised by no more than 1 KB gz and only with the register row (index § 8 rule 7).

## 3. Decisions

- **Decision 69** (owner, 2026-11-23): a spec of its own, after DATI-04 and DATI-20, written and read adversarially
  in the session that wrote it.
- **Decision 70** (owner, 2026-11-23): a field on the bond, «Unità con diritto al premio», proposed at the quantity
  held when the premium is set; a later purchase never raises it; a sale lowers it when the quantity falls below it;
  the owner corrects it by hand.
- **Decision 71** (owner, 2026-11-23): the Consulente reads the fact, has a rule in its contract, and the code adds
  to every sale it proposes one sentence with the premium lost in euro. The sale is not removed.
- **Decision 72** (owner, 2026-11-23): a sale typed by hand prints a warning with the figure under the quantity and
  never blocks; after the save the maturity record is recomputed.
- **Decision 94** (owner, 2026-11-23): after an edit or a delete of a purchase on a bond with a premium and a
  stored count, one line of reminder — «Controlla le unità con diritto al premio nella scheda
  dell'obbligazione.» — and nothing changes by itself.
- **Decision 60** (owner, 2026-11-23): ONE form for every purchase (DATI-06): a new bond is created empty and its
  first purchase goes through the trade form, where DATI-04 schedules the premium of the position that opens.
- Adopted, reversible:
  - (a) absent `finalPremiumQuantity` = the whole quantity held, so a bond registered before this spec keeps the
    premium it announces today with no migration; the count is stored by the first trade created on it (criterion 3)
    or by a save of the asset form. Emptying the field in the form means the same: everything held.
  - (b) only the CREATION of a trade stores a missing count; an edit or a delete of a trade leaves a missing count
    missing and lowers a stored one. Once stored, the count does not follow a correction of the purchase it came
    from: the reminder of decision 94 says to check it.
  - (c) the count is never raised by the ledger: deleting a sale by mistake does not give the units back — the toast
    of criterion 6 names the count and the asset form restores it.
  - (d) the Consulente's euro figures exist for a bond in EUR only; a premium bond in another currency carries the
    fact without an amount (the bonds that pay a final premium are euro government bonds).
  - (e) the purchase line of criterion 7 is information, not a refusal: buying a premium bond on the market is legal.
  - (f) the premium is not added to any yield or return figure; it stays one record at maturity (`dividendType:
    'finalPremium'`).
  - (g) «the maturity» is the bond's `maturityDate` on the Italian calendar, and a trade counts by its value date
    (`settlementDayIso`, DATI-04): the redemption recorded on the maturity day leaves the count, and the premium
    it pays, alone.
  - (h) the service that rewrites the pending record passes the STORED count, not the one capped by today's
    quantity: the quantity held before the maturity already caps it.

## 4. Solution

### 4.1 The rule — `lib/utils/bondPremium.ts` (new, written here)

```ts
/**
 * A bond's final premium is owed on the units bought at issue and never sold (2026-11-23).
 *
 * Until then the maturity record took the whole quantity held, so a second purchase on the market
 * raised a premium nobody will pay. `finalPremiumQuantity` counts the entitled units: absent, the
 * whole position; a purchase never raises it, a sale lowers it when the holding falls below. The
 * rule, the trade form's lines and the toasts live here, pure: no test imports a dialog for them.
 */
import type { BondDetails } from '@/types/assets';
import { effectiveBondNominal } from '@/lib/utils/bondPricing';
import { getItalyDateIso, toDate } from '@/lib/utils/dateHelpers';
import { settlementDayIso } from '@/lib/utils/dividendEntitlement';
import { stripFloatNoise } from '@/lib/utils/floatNoise';
import { formatCurrency } from '@/lib/utils/formatters';

const EPSILON = 1e-9;
const formatUnits = (value: number): string => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 6 }).format(value);

export type PremiumFields = Pick<BondDetails, 'finalPremiumRate' | 'finalPremiumQuantity' | 'nominalValue' | 'maturityDate'>;

/** Whether the details name a premium at maturity at all. */
export function hasFinalPremium(details: PremiumFields | null | undefined): details is PremiumFields {
  return !!details && typeof details.finalPremiumRate === 'number' && details.finalPremiumRate > 0;
}

/**
 * The premium details of an ASSET, null when it has none. Only a bond: `bondDetails` survive a
 * change of type, and an ETF that was once typed as a bond pays no premium.
 */
export function premiumDetailsOf(asset: { type: string; bondDetails?: PremiumFields | null }): PremiumFields | null {
  return asset.type === 'bond' && hasFinalPremium(asset.bondDetails) ? asset.bondDetails : null;
}

/** Whether a trade of `tradeDayIso` settles before the maturity: only such a trade changes who is owed the premium. */
export function settlesBeforeMaturity(details: PremiumFields, tradeDayIso: string): boolean {
  return !details.maturityDate || settlementDayIso(tradeDayIso) < getItalyDateIso(toDate(details.maturityDate));
}

/** The premium of ONE unit, in the bond's currency. */
export function premiumPerUnit(details: PremiumFields): number {
  return stripFloatNoise(((details.finalPremiumRate ?? 0) / 100) * effectiveBondNominal(details.nominalValue));
}

/** The units the premium is owed on: the stored count capped by what is held; everything held while none is stored. */
export function premiumEntitledQuantity(quantity: number, details: PremiumFields | null | undefined): number {
  if (!hasFinalPremium(details)) return 0;
  const held = Math.max(0, quantity);
  const stored = details.finalPremiumQuantity;
  return stored === undefined ? held : Math.min(held, Math.max(0, stored));
}

/**
 * What a ledger mutation writes in `finalPremiumQuantity`, or undefined to leave the field alone.
 * A missing count is stored only by a trade CREATED on a bond that already holds something; a trade
 * settled on the maturity day or after — the redemption — changes nothing.
 */
export function nextPremiumQuantity(input: {
  details: PremiumFields | null | undefined;
  quantityBefore: number;
  quantityAfter: number;
  isNewTrade: boolean;
  /** The Italian day of the trade written, edited or deleted. */
  tradeDayIso: string;
}): number | undefined {
  const { details, quantityBefore, quantityAfter, isNewTrade, tradeDayIso } = input;
  if (!hasFinalPremium(details) || !settlesBeforeMaturity(details, tradeDayIso)) return undefined;
  const after = Math.max(0, quantityAfter);
  const stored = details.finalPremiumQuantity;
  if (stored === undefined) {
    if (!isNewTrade || quantityBefore <= EPSILON) return undefined;
    return stripFloatNoise(Math.min(quantityBefore, after));
  }
  const next = stripFloatNoise(Math.min(Math.max(0, stored), after));
  return Math.abs(next - stored) < EPSILON ? undefined : next;
}

/** The premium a sale gives up — units and gross amount in the bond's currency — or null when it gives up none. */
export function premiumLostBySale(input: {
  sellQuantity: number;
  heldQuantity: number;
  details: PremiumFields | null | undefined;
}): { units: number; gross: number } | null {
  const { sellQuantity, heldQuantity, details } = input;
  if (!hasFinalPremium(details) || !(sellQuantity > 0)) return null;
  const entitled = premiumEntitledQuantity(heldQuantity, details);
  const units = entitled - Math.max(0, heldQuantity - sellQuantity);
  if (units <= EPSILON) return null;
  return { units, gross: stripFloatNoise(units * premiumPerUnit(details)) };
}

/** The premium line under a trade's quantity: null when there is nothing to say. Never blocks the save. */
export function describePremiumWarning(input: {
  type: 'buy' | 'sell' | 'adjustment';
  quantity: number | undefined;
  heldQuantity: number;
  asset: { type: string; bondDetails?: PremiumFields | null };
  currency: string;
  /** The trade's own day, as the form holds it. */
  tradeDayIso: string;
}): string | null {
  const { type, quantity, heldQuantity, asset, currency, tradeDayIso } = input;
  const details = premiumDetailsOf(asset);
  if (!details || quantity === undefined || isNaN(quantity) || quantity <= 0) return null;
  if (!settlesBeforeMaturity(details, tradeDayIso)) return null;
  if (type === 'sell') {
    const lost = premiumLostBySale({ sellQuantity: quantity, heldQuantity, details });
    if (!lost) return null;
    return `Vendendo perdi il premio finale su ${formatUnits(lost.units)} unità: ${formatCurrency(lost.gross, currency)} lordi a scadenza. Puoi salvare comunque.`;
  }
  if (type === 'buy' && heldQuantity > 0) {
    const entitled = premiumEntitledQuantity(heldQuantity, details);
    return entitled > EPSILON
      ? `Le unità comprate ora non danno diritto al premio finale: spetta alle ${formatUnits(entitled)} già possedute.`
      : 'Le unità comprate ora non danno diritto al premio finale.';
  }
  return null;
}

/** The toast line after a trade that removed entitled units, or null. */
export function describePremiumOutcome(premium: { entitled: number; lost: number } | undefined): string | null {
  if (!premium) return null;
  return `Premio finale: ora spetta su ${formatUnits(premium.entitled)} unità (${formatUnits(premium.lost)} in meno). Se non è così, correggi «Unità con diritto al premio» nella scheda dell'obbligazione.`;
}

export const PREMIUM_CHECK_REMINDER = "Controlla le unità con diritto al premio nella scheda dell'obbligazione.";

/**
 * After an edit or a delete of a PURCHASE on a bond that stores its count (owner, 2026-11-23): the
 * count does not follow the correction, the owner is reminded. `wasOrIsBuy`: the trade was a
 * purchase before the edit, or is one after it.
 */
export function describePremiumReminder(input: {
  op: 'create' | 'update' | 'delete';
  wasOrIsBuy: boolean;
  asset: { type: string; bondDetails?: PremiumFields | null };
}): string | null {
  if (input.op === 'create' || !input.wasOrIsBuy) return null;
  return premiumDetailsOf(input.asset)?.finalPremiumQuantity !== undefined ? PREMIUM_CHECK_REMINDER : null;
}
```

### 4.2 The type, the asset form, the maturity record

- `types/assets.ts`, `BondDetails`: `finalPremiumQuantity?: number; // Units the final premium is owed on (bought at
  issue, never sold); absent = everything held`.
- `lib/utils/bondDetailsForm.ts`: `BondDetailsFormInput` gains `bondFinalPremiumQuantity?: number`;
  `buildBondDetailsFromForm` adds, inside the branch that writes `finalPremiumRate`,
  `...(isFilledNumber(data.bondFinalPremiumQuantity) && data.bondFinalPremiumQuantity >= 0 ? { finalPremiumQuantity:
  data.bondFinalPremiumQuantity } : {})` — no count without a rate, and an emptied field stores none (choice a).
- `components/assets/AssetDialog.tsx`:
  - schema: `bondFinalPremiumQuantity: z.number().min(0).optional().or(z.nan())`; label map: `bondFinalPremiumQuantity:
    'Unità con diritto al premio'`; in the schema's `superRefine` (`:466`): when the field is a number above
    `data.quantity + 1e-9`, `ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bondFinalPremiumQuantity'], message:
    'Non può superare le unità possedute.' })` — the form's own quantity, right on the path where the quantity is
    still typed too;
  - reset, edit branch (beside `setValue('bondFinalPremiumRate', bd.finalPremiumRate)`):
    `setValue('bondFinalPremiumQuantity', asset.quantity > 0 ? Math.min(asset.quantity, bd.finalPremiumQuantity ??
    asset.quantity) : bd.finalPremiumQuantity)` — a bond that holds nothing keeps what it stores, absent included: a
    save of its form never writes a count of 0; new branch and the «clear the bond fields» handler: `undefined`;
  - the field, right after the «Premio finale a scadenza (%)» block, rendered only while editing an asset with
    `asset.quantity > 0` and the watched rate is above 0: label «Unità con diritto al premio», `type="number"`,
    `step="any"`, `min="0"`, help line «Le unità comprate all'emissione e mai vendute: il premio spetta solo a queste.
    Un acquisto successivo non le aumenta. Vuoto = tutte le unità possedute.». On a new asset the field is
    absent: the position that opens is entitled whole (choice a);
  - `FinalPremiumPreview` (`:756`) multiplies by the watched `bondFinalPremiumQuantity` when it is a number, by the
    quantity otherwise, and its text reads «… × {n} unità con diritto = …».
- `lib/services/couponScheduling.ts`, `scheduleFinalPremium` — client code: it cannot read or delete a record
  itself. After DATI-04's guard (`quantity <= 0` → `false`, before any request): `const entitled =
  premiumEntitledQuantity(quantity, bondDetails)`; the amounts use `premiumPerUnit(bondDetails)` and `entitled`, the
  record's `quantity` is `entitled`. When `entitled <= 0` it POSTs the same body with `quantity: 0` and the three
  amounts at 0 and returns `false`: the server (`createDividendWithOptionalExpense`,
  `lib/server/dividendUseCase.ts:82-87`) deletes the asset's pending automatic premium and creates nothing. A
  premium typed by hand is not touched.

### 4.3 The ledger and the pending record (server)

- `lib/utils/dividendEntitlement.ts` (DATI-04, contract C8 — its `AnnouncedDividend` already picks `dividendType`):
  `reconcileAnnouncedDividend(dividend, trades, asOfIso, premiumQuantity?: number)` gains its fourth, optional
  argument — after `const held = quantityHeldBefore(…)` and its `null` branch,
  `const owed = dividend.dividendType === 'finalPremium' && premiumQuantity !== undefined ? Math.min(held, Math.max(0, premiumQuantity)) : held;`
  and the three later uses — the delete test, the equality, the update — read `owed`. A coupon or a dividend is
  untouched; DATI-07's and DATI-18's additions stay as they are.
- `lib/server/dividendEntitlementService.ts` (DATI-04), `reconcileAnnouncedDividendsForAsset`: reads the asset once
  with the Admin SDK (`adminDb.collection('assets').doc(assetId).get()`) and passes
  `premiumDetailsOf(asset)?.finalPremiumQuantity` — the stored count, raw (choice h); `undefined` for anything that
  is not a premium bond or stores no count — as the fourth argument of every verdict. It runs after the commit,
  so the asset already holds the new count.
- `lib/server/dividendProcessor.ts`, `runExpenseCreation` (the payment-day verdict of DATI-04 § 4.4): for an
  automatic record whose `dividendType` is `'finalPremium'`, and for that type alone, it reads
  `assets/{assetId}` with the Admin SDK and passes the same fourth argument.
- `lib/server/assetTransactionUseCase.ts`, `commitTradeMutation`: before the asset write `w2`, inside the
  transaction's closure, from `assetSnap.data()` and `derived.quantity`:

  ```ts
  // The final premium follows the ledger (2026-11-23) — on a premium bond only: anything else writes what it wrote.
  const premiumDetails = premiumDetailsOf(assetBefore);
  let nextPremium: number | undefined;
  let premium: { entitled: number; lost: number } | undefined;
  if (premiumDetails) {
    const quantityBefore = assetBefore.quantity ?? 0;
    nextPremium = nextPremiumQuantity({
      details: premiumDetails,
      quantityBefore,
      quantityAfter: derived.quantity,
      isNewTrade: plan.op === 'set',
      tradeDayIso,
    });
    if (nextPremium !== undefined) {
      const lost = premiumEntitledQuantity(quantityBefore, premiumDetails) - nextPremium;
      if (lost > 1e-9) premium = { entitled: nextPremium, lost: stripFloatNoise(lost) };
    }
  }
  ```

  `tradeDayIso` is the Italian day (`getItalyDateIso`) of the trade the plan writes — the new date of a create or
  an edit, the stored date of a delete. `w2` gains `...(nextPremium !== undefined ? {
  'bondDetails.finalPremiumQuantity': nextPremium } : {})` (a dotted path: the other bond fields are not
  rewritten; without a premium bond `w2` has no `bondDetails` key at all). `CommitOutcome` and
  `TradeMutationResult` gain `premium?: { entitled: number; lost: number }`, present only when the entitled units
  fell. `deleteAllAssetTransactionsForAsset` is not touched.

### 4.4 The trade form — `components/assets/TransactionDialog.tsx`

- `lib/services/assetTransactionService.ts`: `AssetTransactionMutationResult` gains `premium?: { entitled: number;
  lost: number }`.
- `describePremiumWarning` (§ 4.1) is rendered under the quantity, after DATI-20's lot line, with the same element
  (`<p className="text-sm text-warning-foreground" role="status">`), from the watched `type`, `quantity` and
  `date`, the `heldQuantity` the dialog already reads, `asset` and `asset.currency`; in an edit the line is not
  shown (`transaction` set: the quantity held is already the one after the trade).
- After the save, following DATI-04's `toast.info` of the announced dividends: `toast.info(line)` with `line =
  describePremiumOutcome(result.premium) ?? describePremiumReminder({ op, wasOrIsBuy, asset })` when it is not null
  — `op` `'create'` or `'update'`, `wasOrIsBuy` true when the stored trade or the submitted one is a purchase. The
  success toast itself is unchanged.
- `components/assets/AssetMovementsDialog.tsx`: after a delete (`:142-143`), the same `toast.info` with `op:
  'delete'` and `wasOrIsBuy: transaction.type === 'buy'`.

### 4.5 The Consulente — facts, contract, reconcile

- `lib/utils/assistantPortfolioContext.ts`: `AssistantHoldingRow` gains
  `finalPremium?: { ratePct: number; units: number; grossEur?: number }`, set where the row gets `maturityIso`
  (`:357`, the `asset.type === 'bond' && asset.bondDetails` spread) when `premiumEntitledQuantity(asset.quantity,
  asset.bondDetails) > 0`: `units` is that quantity, `grossEur = stripFloatNoise(units × premiumPerUnit(bondDetails))`
  only when `asset.currency === 'EUR'`.
- `lib/utils/allocationAdviceBonds.ts`, `formatBondTermsBlock`: after the coupon parts and before the value, a
  single with `row.finalPremium` whose `maturityIso` is after `input.todayIso` pushes
  `` `premio finale ${formatNumberIt(ratePct, 2)}% a scadenza su ${units(row.finalPremium.units)} unità${grossEur !== undefined ? ` (${eurCents(grossEur)} lordi)` : ''}, perso sulle unità vendute prima, non dovuto su un nuovo acquisto` ``
  with two private formatters beside `eur` (`:65`, which prints whole euro): `eurCents` — `it-IT` currency EUR,
  at most 2 decimals — and `units` — `it-IT`, at most 6 decimals.
- `lib/utils/operatingPlan.ts`: `OperatingPlanFacts['held'][string]` gains `premium?: { units: number; perUnitEur:
  number }`; `OPERATING_PLAN_COPY` gains (with the file's own `formatQuantity`, `:112`, and `formatCurrency`
  imported from `lib/utils/formatters`)

  ```ts
  premiumLost: (name: string, units: number, lostEur: number) =>
    `Vendendo ${name} perdi il premio finale su ${formatQuantity(units)} quote: ${formatCurrency(lostEur, 'EUR')} lordi a scadenza.`,
  ```

  and step 6 of `reconcileOperatingPlan` is rewritten so that every exit that KEEPS the sale reaches one tail —
  today a sale with no quantity leaves the loop at `if (row.sellQuantity === undefined) continue;` (`:252`), and
  it is the sale that loses the most. The loop, whole, as it reads after DATI-20 and this spec:

  ```ts
  // 6. The quantities held.
  for (const row of rows) {
    if (row.action !== 'sell') continue;
    const heldQuantity = facts.held[row.ref]?.quantity ?? 0;
    if (heldQuantity <= 0) {
      removeSale(row);
      continue;
    }
    if (row.sellQuantity !== undefined) {
      const asked = Number.isFinite(row.sellQuantity) ? Math.floor(row.sellQuantity) : 0;
      if (asked <= 0) {
        removeSale(row);
        continue;
      }
      const lot = facts.instruments.find((instrument) => instrument.ref === row.ref)?.lot;
      if (asked >= heldQuantity) {
        delete row.sellQuantity;
        if (asked > heldQuantity) corrections.push(OPERATING_PLAN_COPY.tooMany(asked, nameOf(row.ref), heldQuantity));
      } else if (lot) {
        const whole = sellableUnits(asked, lot, heldQuantity);
        if (whole <= 0) {
          corrections.push(OPERATING_PLAN_COPY.belowLot(nameOf(row.ref)));
          removeSale(row);
          continue;
        }
        if (whole !== asked) corrections.push(OPERATING_PLAN_COPY.toLot(asked, nameOf(row.ref), whole));
        row.sellQuantity = whole;
      } else {
        row.sellQuantity = asked;
      }
    }
    // The sale stays (owner, 2026-11-23): what it gives up of a final premium, in euro. No quantity = everything.
    const premium = facts.held[row.ref]?.premium;
    if (premium) {
      const sold = row.sellQuantity ?? heldQuantity;
      const units = Math.min(premium.units, heldQuantity) - Math.max(0, heldQuantity - sold);
      if (units > 1e-9) corrections.push(OPERATING_PLAN_COPY.premiumLost(nameOf(row.ref), units, roundToCents(units * premium.perUnitEur)));
    }
  }
  ```

  A sale removed earlier (a kept instrument in step 5, nothing held, a quantity the lot does not allow) never
  reaches the tail. The click's reconcile writes the same sentence again and the build's notes drop the repeat.
- `lib/utils/operatingPlanFacts.ts`: BOTH held facts — `factOf` in `buildOperatingPlanFacts` (`:89`) and the
  literal in `refreshOperatingPlanFacts` (`:190-200`) — add, for an asset in EUR with `premiumDetailsOf(asset)`
  and `premiumEntitledQuantity(asset.quantity, details) > 0`, `premium: { units, perUnitEur:
  premiumPerUnit(details) }`.
- `lib/server/allocationAdvice/prompts.ts`:
  - `heldFactLine` pushes, after DATI-20's «taglio minimo» part and before «DA TENERE»,
    `` `premio finale ${euroCents(roundToCents(fact.premium.units * fact.premium.perUnitEur))} a scadenza su ${quantityFact(fact.premium.units)} quote, perso su quelle vendute prima` ``
    when `fact.premium` is set; DATI-19's « · peso voluto nella sotto-categoria …» stays the row's last part;
  - `PLAN_CONTRACT` gains one rule after DATI-20's lot rule:
    `"- Un'obbligazione con «premio finale» lo paga a scadenza solo sulle quote indicate nel blocco, comprate all'emissione e mai vendute: non venderle prima della scadenza se l'allocazione si raggiunge in altro modo; se le vendi, dillo in \"departures\" (l'importo perso lo scrive l'app). Le quote comprate ora non danno diritto al premio: non contarlo fra le ragioni per comprarne altre."`;
  - `STRATEGY_CONTRACT`: one sentence appended to the element that begins «Nella classe Obbligazioni ogni
    sotto-target dice nel testo quale orizzonte copre» (`:174`):
    `"Un titolo con «premio finale» lo perde sulle unità vendute prima della scadenza e non lo matura su un nuovo acquisto: tienine conto prima di ridurne il peso, e nomina il premio quando proponi di ridurlo."`.
  The system stays static: both rules are the same for every user, the premiums sit in the user content.

## 5. Constraints and traps

- **A sale cuts the entitled units last** (decision 70: «lowers it when the quantity falls below it»): here it means
  `premiumLostBySale` counts the units sold beyond the ones without a premium, never a proportional share.
- **`w2` never rewrites `bondDetails` whole** (the use case's comment on `removeUndefinedDeep` and
  `holdingStartDate`): here it means the count is written through the dotted path, and `undefined` leaves it alone.
- **A transaction retries its closure**: here it means `nextPremiumQuantity` is computed inside the closure from
  `assetSnap`, never in `prepareCreate`.
- **`commitTradeMutation` runs for every instrument**: `assetBefore.bondDetails` is undefined on a share, an ETF and
  a bond without details — nothing dereferences it outside `if (premiumDetails)`.
- **`bondDetails` survive a change of type** (`assetService.ts` does not delete them): every reader goes through
  `premiumDetailsOf`, never `hasFinalPremium` on the raw field.
- **`scheduleFinalPremium` is client code**: `dividendService` is server-only; the cleanup is the server's, asked
  with a POST at quantity 0.
- **The redemption is a sale in the ledger**: recorded on the maturity day it would cut the count to 0 and delete
  the premium the same day it is owed — choice (g).
- **The Firestore fake of the use case's tests writes a dotted key as a literal field**
  (`__tests__/assetTransactionWriteTx.test.ts:132-138`, `merged[field] = value`): the new file's copy applies a
  dotted key as a nested path, or S1 proves nothing.
- **A hand-entered or cashed record is never touched** (DATI-04 § 4.1): here it means a premium the owner typed by
  hand keeps its quantity; only the automatic, pending record follows the count.
- **The system prompt is static** (index § 8): here it means no figure, name or ISIN enters `PLAN_CONTRACT` or
  `STRATEGY_CONTRACT`.
- **No owner data in a tracked file** (WORKFLOW.md): here it means every bond in a test is invented — «BTP
  Prova 2032», rate 1 %, nominal 1, quantity 1.000.
- **A spec's label never enters the code**: comments say «2026-11-23», never «DATI-21».
- **Budgets** (index § 8 rule 7): `bondPremium.ts` enters the bundles of `/dashboard/assets` and
  `/dashboard/allocation`; a ceiling is raised only by the measure, with the register row in `doc/guide/velocita.md`.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | Asserts | Mutation that must turn it red |
| --- | --- | --- | --- |
| U1 | unit · `__tests__/bondPremium.test.ts` (new) | `premiumEntitledQuantity`: no rate → 0; rate, no count, 1.000 held → 1.000; count 600, 1.000 held → 600; count 600, 400 held → 400. `premiumDetailsOf`: a bond with a rate → its details; an ETF that still carries `bondDetails` with a rate → null | drop the `Math.min`; drop the type test |
| U2 | unit · same | `premiumPerUnit`: rate 1, nominal absent → 0,01; nominal 1.000 → 10 | read `nominalValue ?? 1000` |
| U3 | unit · same | `nextPremiumQuantity`, no count: new buy 1.000 → 1.500 gives 1.000; new sale 1.000 → 600 gives 600; new buy from 0 gives undefined; an edit (`isNewTrade: false`) gives undefined | drop the `isNewTrade` guard |
| U4 | unit · same | stored 600: after 400 → 400; after 900 → undefined; after 600 → undefined; after 599,9999999999 → undefined | return `after` when it is larger |
| U5 | unit · same | maturity on Mon 2032-03-15: a sale to 0 dated that day → undefined; one dated Thu 2032-03-11 (value date the 15th) → undefined; one dated Wed 2032-03-10 → 0 | compare the trade day, not its value date |
| U6 | unit · `__tests__/dividendEntitlement.test.ts` | a `finalPremium` record on 1.000, ledger 1.500, `premiumQuantity` 1.000 → keep; `premiumQuantity` 600 → update to 600 with the tax share kept; `premiumQuantity` 0 → delete; no fourth argument → follows the ledger (1.500); a `coupon` with `premiumQuantity` 600 follows the ledger | apply the cap to every type |
| U7 | unit · `__tests__/couponScheduling.test.ts` | `scheduleFinalPremium` with count 600 of 1.000 posts quantity 600 and gross 6; with count 0 of 1.000 → ONE POST with quantity 0 and amounts 0, and `false`; at quantity 0 no request (DATI-04's guard) | use `quantity`; skip the POST at count 0 |
| U8 | unit · `__tests__/bondPremium.test.ts` | `describePremiumOutcome({ entitled: 600, lost: 400 })` names 600 and 400; undefined → null. `describePremiumReminder`: an edit and a delete of a purchase on a bond with a stored count → the sentence; a create, a sale, a bond with no stored count, an ETF → null | swap the two figures; drop the `op` test |
| U9 | unit · same | `describePremiumWarning`: sale of 500 of 1.000 with count 600 → «su 100 unità» and the amount; sale of 300 → null; buy on a held bond → the purchase line with the count; buy with count 0 → the line without «spetta alle»; buy on an empty bond → null; no rate, an ETF with residual details, a trade dated on the maturity → null | count a proportional share |
| U10 | unit · `__tests__/allocationAdviceBonds.test.ts` | the single's line carries «premio finale 1,00% a scadenza su 1.000 unità (10,00 € lordi)»; 2,5 € prints its cents; a USD bond carries it without the amount; a bond with no rate, and one past its maturity, have no premium part | print it for every bond; `eur` (whole euro) for the amount |
| U11 | unit · `__tests__/operatingPlanFacts.test.ts` | `buildOperatingPlanFacts` AND `refreshOperatingPlanFacts` give `premium` to a EUR bond with entitled units; none to a USD bond, to a bond with count 0, to an ETF with residual `bondDetails` | drop the currency guard; patch one builder only |
| U12 | unit · `__tests__/operatingPlan.test.ts` | a sale of 500 of 1.000 (premium on 600) keeps `sellQuantity` 500 and adds the `premiumLost` sentence for 100 quote; a sale of 300 adds none; a row with NO `sellQuantity` adds the sentence for 600; a sale DATI-20's lot branch brings from 2500 to 2000 is counted on 2000 | keep the early `continue` of a sale with no quantity |
| P1 | unit · `__tests__/allocationAdvicePrompts.test.ts` | `PLAN_CONTRACT` and `STRATEGY_CONTRACT` contain «premio finale»; `formatOperatingPlanFacts` prints the part after «taglio minimo» and before «DA TENERE»; the system of two users is byte-identical | interpolate a figure into the contract |
| P2 | unit · `__tests__/dividendProcessor.test.ts` | payment day, an automatic premium record on 1.000, ledger 1.000, stored count 600 → the income is built on 600; a coupon of the same bond reads no asset | pass no fourth argument in `runExpenseCreation` |
| S1 | server · `__tests__/assetTransactionUseCase.premium.test.ts` (new; a copy of the write test's Firestore fake whose `update` applies a dotted key as a nested path, with a hook that runs before the transaction's closure) | a created buy on a bond holding 1.000 with a rate and no count writes `bondDetails.finalPremiumQuantity: 1000`, the other bond fields intact, no `premium` in the result; with the asset's quantity changed in the store between `prepareCreate` and the transaction (the hook), the count is the quantity the closure read | compute it in `prepareCreate` from stale data |
| S2 | server · same | a created sale of 400 writes 600 and returns `premium: { entitled: 600, lost: 400 }`; deleting that sale leaves 600 | raise the count on a delete |
| S3 | server · same | a sale of everything dated on the maturity day leaves the count and returns no `premium`; a purchase of a share returns today's result and `w2` has no `bondDetails` key; an ETF with a residual `finalPremiumRate` likewise | drop `if (premiumDetails)` (a TypeError on the share) |
| S4 | server · `__tests__/dividendEntitlementService.test.ts` (new; `firebase/admin`, `assetAdminRepository` and `dividendService` mocked) | a bond with 1.500 in the ledger, stored count 1.000, a pending automatic premium on 1.000 → no write (without the argument it would become 1.500); stored count 600 → updated to 600; a hand-entered premium untouched | pass no fourth argument |
| D1 | dom · `__tests__/assetDialogBondPremium.test.tsx` (new, on the harness of `assetDialogCreateEmpty.test.tsx`) | editing a held bond with a rate shows the field proposed at the quantity; a count above the quantity shows «Non può superare le unità possedute.» and does not submit; a new bond has no field; a bond at quantity 0 with no stored count, saved, sends no `finalPremiumQuantity` | render it on a new asset; reset the field to `premiumEntitledQuantity(…)` at quantity 0 |
| D2 | dom · `__tests__/transactionDialogPremium.test.tsx` (new, on the harness of DATI-04's `transactionDialog.announced.test.tsx`) | typing a sale that cuts the entitled units shows the warning with `role="status"` and «Registra operazione» stays enabled; a mutation resolving with `premium` → `toast.info` with the outcome line; an edit of a purchase on a bond with a stored count → `toast.info` with the reminder | disable the button; toast the reminder on a create |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome declared first. On the emulators (`npm run emulators`, `emulators:seed`, `dev:emulator`), with an
invented bond «BTP Prova 2032» (rate 1 %, nominal 1, quantity 1.000), phases B–E by a throwaway Playwright script
at 1440 and 390:

- A. The diff, read by the owner.
- B. Patrimonio › the bond's form: «Unità con diritto al premio» reads 1.000; typing 1.200 is refused.
- C. A purchase of 500: the line «Le unità comprate ora non danno diritto…»; after the save Dividendi shows the
  premium at maturity still on 1.000, and the form reads 1.000 of 1.500. That purchase edited to 400: the
  reminder's toast, the count still 1.000.
- D. A sale of 800: the warning names 300 unità and 3,00 €; the toast says «ora spetta su 700 unità (300 in meno)»;
  Dividendi shows the premium on 700. Decoy: «ETF fenicottero», an ETF planted with residual `bondDetails` and a
  rate — no line, no field, no premium.
- E. The Consulente without a model: the script reads the planted bond, prints `formatOperatingPlanFacts` (the
  row carries «premio finale») and runs `reconcileOperatingPlan` on a raw plan that sells 800 (the `premiumLost`
  sentence, the quantity kept). The plan stage is never run by an E2E stream.
- F. The owner, on his account after the merge to `main`: his bond's form shows the field at the quantity he holds,
  and the premium at maturity in Dividendi is unchanged. A run of the Consulente is a spend: it is done only after
  his yes (index § 8 rule 5).
- G. The planted bond, its trades and the decoy deleted by the app; the script deleted.

## 8. Putting it into service

No DDL, no index, no rule change (`assets` is already written by the owner and by the Admin SDK). No backfill: a
bond without the count keeps the premium it has (choice a). Measure: `npm run perf:budget` on `/dashboard/assets`
and `/dashboard/allocation`, inside their ceilings; a ceiling is raised by no more than 1 KB gz and only with the
register row (index § 8 rule 7). With phases A–E closed and the commit in `develop`, the owner opens the PR
`develop` → `main` (index § 8 rule 13); phase F follows it.

## 9. Documentation

- `doc/guide/cashflow-dividendi.md` — the final premium: owed on `finalPremiumQuantity`, the three writers of the
  count (the form, a created trade, a mutation that lowers it), the record deleted at 0, the redemption that
  leaves it alone; § Per-page blind spots: a deleted sale does not give units back; a missing count is stored
  only by a created trade; a stored count does not follow a correction of the purchase it came from (the
  reminder); a purchase at issue recorded AFTER a market purchase leaves the count at the market quantity until
  the owner corrects it; a premium typed by hand beside the automatic one is a second record, both shown.
- `doc/guide/registro-operazioni.md` — `w2` writes `bondDetails.finalPremiumQuantity` by dotted path;
  `TradeMutationResult.premium`; the two lines under the quantity and the two toasts.
- `doc/guide/consulente-piano.md` — the premium in the plan's facts, the contract's rule, the `premiumLost`
  sentence (a sale is kept, never removed); § Per-page blind spots: a bond past its maturity and still held
  keeps the premium in the plan's facts until its redemption is recorded.
- `doc/guide/consulente.md` (507 lines: past ~500, this session splits it by sub-topic when DATI-19 has not —
  decision 47) — one line in the bonds block: the premium fact and the strategy's sentence.
- `doc/guide/assistente.md` § Per-page blind spots — the chat's holdings do not print the final premium: the row
  carries it for the Consulente's block alone.
- `doc/guide/patrimonio.md` (or the guide DATI-05 moved the instruments' section to) — the form's field, one line.
- `doc/guide/velocita.md` § Registro — only if a ceiling was raised.
- AGENTS.md § 3 — the stubs of the guides touched are rewritten at equal or shorter length (decision 47).
- `README.md` — Dividendi's feature line: the final premium on the units bought at issue.
- CLAUDE.md — the Dividendi line rewritten at equal or shorter length with «the final premium on the units bought
  at issue»; the «Latest» entry REPLACED whole (decision 46: the date, this spec in one sentence, «Open: doc/dati/
  (README § 6), to retire», «Next: the retirement (doc/dati/PROMPT-RITIRO.md)»); under 20.000 characters, counted with `node`.
- `Draft Release Temp.md` — one entry prepended in `## ✨ New Features`, in the file's form: «**Obbligazioni — il
  premio finale** — The final premium of a bond bought at issue is owed only on the units entitled to it: a later
  purchase does not raise it, a sale lowers it, the trade form says what a sale gives up and the Consulente
  knows it.»
- `doc/dati/README.md` § 6 (the row of 21 to `implemented`).

## 10. Declared out of scope

- A checkbox «comprate all'emissione» on each purchase → not planned; the count on the bond is the one source
  (decision 70).
- The premium inside Rendimenti's yield or the bond's yield to maturity → not planned (choice f).
- A euro amount for a premium bond in a foreign currency → not planned (choice d); the fact is printed without it.
- The plan of accumulation's path refusing a purchase of a premium bond → not planned (choice e); the rule lives in
  the Consulente's contract.
- The Assistente's chat printing the premium → not planned; doc/guide/assistente.md § Per-page blind spots.
- The count following an edit of the purchase it came from → not planned (decision 94: a reminder);
  doc/guide/cashflow-dividendi.md § Per-page blind spots.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-21-premio-finale-obbligazioni.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi, regole della serie)
- Leggi doc/guide/cashflow-dividendi.md, doc/guide/registro-operazioni.md, doc/guide/consulente.md,
  doc/guide/consulente-piano.md, doc/guide/patrimonio.md, doc/guide/assistente.md,
  doc/guide/velocita.md, doc/guide/e2e-emulatori.md e doc/guide/e2e-playwright.md PRIMA di scrivere
  codice in quei domini
- Tocca la UI: leggi DESIGN.md e PRODUCT.md prima di disegnare
- Tocca l'API di Anthropic (i contratti del Consulente): usa la skill claude-api prima di toccare i
  prompt
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

Implementa la spec così com'è scritta, nell'ordine: lib/utils/bondPremium.ts (§ 4.1, il codice è già
scritto: copialo; U1–U5, U8, U9), il tipo, il modulo dello strumento e scheduleFinalPremium (§ 4.2;
D1, U7), il registro, il record a scadenza e il giorno di pagamento (§ 4.3; U6, S1–S4, P2), il modulo
dell'operazione e AssetMovementsDialog (§ 4.4; D2), il Consulente (§ 4.5; U10–U12, P1), perf:budget, i
documenti del § 9 e la riga 21 di doc/dati/README.md § 6 a `implemented`. OGNI test del § 6 va visto
rosso con la sua mutazione prima di tenerlo.

Fermati e chiedimi se: DATI-04, DATI-06, DATI-18 o DATI-20 non sono in develop come li descrivono le
loro spec (mancano lib/utils/dividendEntitlement.ts con settlementDayIso e reconcileAnnouncedDividend,
scheduleCouponsForOpenedPosition, il modulo unico, lib/utils/bondLot.ts); il passo 6 di
reconcileOperatingPlan non ha il ramo del taglio minimo di DATI-20; un prompt di sistema del
Consulente smette di essere identico tra due utenti; un tetto di perf:budget si alzerebbe di più di
1 KB gz.

Collaudo: § 7, fasi A–E e G in questa sessione sugli emulatori, senza modello; la fase F è mia, dopo
la PR develop → main. Una chiamata vera al modello si fa solo dopo il mio sì. Un branch, un commit, solo
dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa. A commit in develop, ricordami
la PR develop → main (regola 13 dell'indice).
```

Model: **Opus 5.5**, effort **medium** — the rule is written, the risk is the transaction's write and the reconcile
step shared with DATI-20. Estimated size: M (one new module, sixteen files touched, 20 tests).
