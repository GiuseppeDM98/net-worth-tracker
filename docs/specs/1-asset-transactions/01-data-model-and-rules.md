# 01 — Data Model, Collections, Rules, Validation, Currency

## 1. TypeScript types — new file `types/assetTransactions.ts`

```ts
import type { AssetType } from './assets';

/**
 * Asset types that are managed through the trade ledger.
 * cash (balance-as-quantity) and realestate (estimated value) are deliberately
 * excluded: their "quantity" is not the result of trading operations.
 */
export const LEDGER_ASSET_TYPES = ['stock', 'etf', 'bond', 'crypto', 'commodity'] as const satisfies readonly AssetType[];

export function isLedgerAssetType(type: AssetType): boolean;

export type AssetTransactionType = 'buy' | 'sell' | 'adjustment';

/**
 * One trade in the asset ledger.
 *
 * Semantics by type:
 * - buy:        quantity = units bought (> 0); pricePerUnit = paid price per unit.
 * - sell:       quantity = units sold (> 0);  pricePerUnit = sale price per unit.
 * - adjustment: ABSOLUTE RESET — quantity = new total quantity (>= 0),
 *               pricePerUnit = new PMC. No realized P&L, no cash settlement.
 *
 * Currency convention: pricePerUnit follows the SAME unit basis as Asset.averageCost
 * today (native currency; for Borsa Italiana bonds the already-converted EUR-per-unit
 * value, see §5). priceEur is the per-unit EUR value at trade date (== pricePerUnit
 * for EUR-denominated assets).
 */
export interface AssetTransaction {
  id: string;
  userId: string;            // data owner (ownerId), same scoping as every data collection
  assetId: string;
  type: AssetTransactionType;
  date: Date;                // execution date; baselineDate <= date <= today (Italy)
  quantity: number;
  pricePerUnit: number;      // native currency per unit (>= 0)
  priceEur: number;          // EUR per unit at trade date (>= 0); == pricePerUnit for EUR assets
  fees?: number;             // total EUR commissions (>= 0). buy: added to EUR cost basis;
                             // sell: subtracted from proceeds; adjustment: not allowed
  linkedCashAssetId?: string; // optional settlement cash asset (buy debits, sell credits)
  isBaseline?: boolean;      // migration-created opening position; always type 'buy'
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Create/update payload (client → API). System fields are stamped server-side. */
export interface AssetTransactionFormData {
  assetId: string;
  type: AssetTransactionType;
  date: Date;
  quantity: number;
  pricePerUnit: number;
  fees?: number;
  linkedCashAssetId?: string;
  note?: string;
  // priceEur is NOT part of the form: the server resolves it (see §6) so the client
  // can never write an inconsistent FX value.
}

/** Per-user ledger metadata (doc id == userId). */
export interface AssetTransactionsMeta {
  userId: string;
  migratedAt: Date;
  baselineDate: Date;        // start-of-day (Italy) of migration day; global floor for trade dates
  migratedAssetCount: number;
  createdAt: Date;
  updatedAt: Date;
}
```

Checklist comment to add on `AssetTransactionType` (COMMENTS.md "checklist comment" type):
adding a new type requires updating the replay switch in `assetTransactionUtils.ts`, the zod schema
in `lib/server/validation.ts`, and the type chips/labels in `TransactionDialog.tsx`.

## 2. Firestore collections

### `assetTransactions` (new, flat)
- Flat top-level collection with a `userId` field — same convention as `expenses`/`costCenters`
  (see the design comment at the top of `lib/services/costCenterService.ts`).
- Doc IDs: Firestore auto-IDs for user-created trades. **Baseline docs use the deterministic ID
  `baseline-${assetId}`** so the migration is idempotent per asset (a re-run overwrites instead of
  duplicating) and the baseline is directly addressable.
- Dates are stored as Firestore `Timestamp`s; convert with `toDate()` from
  `lib/utils/dateHelpers.ts` on read (existing repo convention).

### `assetTransactionsMeta` (new, doc-id-keyed singleton)
- One doc per user, doc id == userId — same pattern as `budgets`/`goalBasedInvesting`.

### Query/index note
The only client query is `where('userId', '==', ownerId)` optionally plus
`where('assetId', '==', assetId)` — **equality filters only, no `orderBy` in the query**; sort by
date in memory. This avoids a composite index entirely (same reasoning as `getUserSnapshotsAdmin`
in `lib/server/assetAdminRepository.ts`, which skips `orderBy` for exactly this reason).

## 3. Firestore rules — add to `firestore.rules`

Both collections are **server-owned for writes**: every mutation goes through the Admin API
(atomicity + replay validation, see spec 03), so client write access is denied — the same
"write:false, mutate via Admin API" posture as `account-access`. Reads stay client-side (the
movements list and the metrics read trades with the client SDK).

```
// Asset trade ledger: readable by owner/members, writable ONLY via the Admin API
// (trade writes must atomically rewrite derived asset fields — see docs/specs/1-asset-transactions).
match /assetTransactions/{transactionId} {
  allow read: if canAccess(resource.data.userId);
  allow create, update, delete: if false;
}

match /assetTransactionsMeta/{userId} {
  allow read: if canAccess(userId);
  allow write: if false;
}
```

**Deploy reminder** (known gotcha from the shared-account rollout): rules changes are inert until
`firebase deploy --only firestore:rules` is run. Phase B is not "done" without it — put it in the
phase's manual-test summary for the user.

## 4. Server-side validation — extend `lib/server/validation.ts`

Follow the existing `parseOr400` + schema pattern (SEC-3). New schemas:

```ts
export const assetTransactionTypeSchema = z.enum(['buy', 'sell', 'adjustment']);

export const assetTransactionDataSchema = z.object({
  assetId: z.string().min(1),
  type: assetTransactionTypeSchema,
  date: z.coerce.date(),                       // JSON bodies serialize dates as ISO strings
  quantity: z.number().finite().min(0),
  pricePerUnit: z.number().finite().min(0),
  fees: z.number().finite().min(0).optional(),
  linkedCashAssetId: z.string().min(1).optional(),
  note: z.string().max(500).optional(),
}).superRefine((data, ctx) => {
  // buy/sell need a strictly positive quantity; adjustment allows 0 (position close correction)
  if (data.type !== 'adjustment' && data.quantity <= 0) ctx.addIssue(...);
  // fees make no sense on an absolute reset
  if (data.type === 'adjustment' && data.fees !== undefined) ctx.addIssue(...);
  if (data.type === 'adjustment' && data.linkedCashAssetId !== undefined) ctx.addIssue(...);
});

export const assetTransactionUpdateSchema = assetTransactionDataSchema.partial()
  .omit({ assetId: true });   // a trade can never be moved to another asset
```

Semantic checks that need Firestore data (asset exists and is a ledger type, date >= baselineDate,
date <= end of today via `getItalyDayBoundsUtc()`, linked asset is `assetClass === 'cash'`,
no-negative-position replay) live in the route/use-case layer, not in zod — see spec 03.

## 5. Currency & price conventions (per asset type)

`pricePerUnit` must mean exactly what `Asset.averageCost` means today, per type — this is what
keeps every existing consumer working unchanged:

| Asset situation | `pricePerUnit` meaning | Form input |
| --- | --- | --- |
| EUR-denominated (most ETFs, EUR stocks) | EUR per unit | direct |
| Non-EUR ticker (USD stock, …) | NATIVE currency per unit (USD, …) | direct, native |
| **GBp (London listing)** | GBP per unit (pence already ÷ 100) | the dialog must normalize pence input the same way price updates do — never store pence (100× inflation gotcha, AGENTS.md *FX Conversion*) |
| **Bond with Borsa Italiana quote** | EUR per unit after `resolveBondPrice` (`rawPrice × nominalValue / 100`, passthrough when `nominalValue <= 1`) — identical to today's "Prezzo di Carico (quotazione Borsa Italiana)" semantics in AssetDialog | form accepts the raw %-of-par quote and converts with the SAME `resolveBondPrice` helper (reuse it, do not re-implement) |
| Crypto | EUR (or native fiat) per coin; fractional quantities are normal | direct |

## 6. `priceEur` resolution (server-side only)

New server helper (Phase B, e.g. `lib/server/tradeFxService.ts` or colocated with the route's
use case):

```ts
/** Resolve the per-unit EUR price of a trade at its execution date. */
async function resolveTradePriceEur(
  currency: string,          // Asset.currency
  pricePerUnit: number,      // native, already GBp-normalized / bond-resolved
  date: Date
): Promise<number>
```

- `currency === 'EUR'` → return `pricePerUnit` unchanged (also covers bonds, which store EUR).
- Otherwise call Frankfurter **historical** endpoint for the trade date
  (`https://api.frankfurter.dev/v1/{YYYY-MM-DD}?base={currency}&symbols=EUR`); the benchmark
  pipeline already consumes Frankfurter historical monthly data, so the dependency exists.
  For `date` == today use the `latest` endpoint (same as current price updates).
- Fallback chain on failure: 24h-cached rate (the existing FX cache fallback) → if nothing is
  available, **fail the request** with 503 and Italian message
  `"Impossibile recuperare il cambio per la valuta {currency}. Riprova più tardi."` — a trade
  stored without a trustworthy `priceEur` would silently corrupt every EUR metric.
- Frankfurter is server-side only (browser calls are silently blocked by Next headers —
  AGENTS.md *FX Conversion*). This is one of the reasons trade writes are Admin-API-only.

**Baseline `priceEur`** (migration, spec 03 §4): historical FX for the original purchases is
unknowable, so approximate with the asset's own current conversion ratio:
`priceEur = averageCost × (currentPriceEur / currentPrice)` when both are present; else fetch the
current rate; else `priceEur = averageCost` (EUR assets / last resort — the pre-migration FX
mismatch already documented in `calculateUnrealizedGains` persists for that asset, no worse than
today). Document the chosen branch in a Why-comment.

## 7. What does NOT change in `types/assets.ts`

- `Asset` keeps `quantity`, `averageCost`, `holdingStartDate` exactly as-is — they become
  replay-derived for ledger assets but their shape and meaning are unchanged for every consumer.
- `MonthlySnapshot.byAsset` is untouched in v1 (adding `averageCost` per asset is a possible v2,
  deliberately out of scope).
- Add ONE thing: a pointer comment on `Asset.quantity`/`Asset.averageCost` noting that for
  `LEDGER_ASSET_TYPES` these fields are derived from `assetTransactions` and must not be written
  directly (checklist-comment style, referencing `assetTransactionUtils.ts`).

---

## 8. Implementation prompt

This file has **no standalone prompt**: its contents are split across two implementation phases,
because types without the engine and rules without the routes are not independently testable.

| Section | Implemented in | Prompt |
| --- | --- | --- |
| §1 types, §7 pointer comments | **Fase A** | end of `02-derivation-engine.md` (Opus 4.8, effort xhigh) |
| §2-§3 collections/rules, §4 zod, §5-§6 currency/FX | **Fase B** | end of `03-service-and-api.md` (Opus 4.8, effort xhigh) |
