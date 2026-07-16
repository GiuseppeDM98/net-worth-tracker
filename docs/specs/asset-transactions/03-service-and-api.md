# 03 — Service Layer, Admin API, Migration, Hooks

## 0. Why writes are Admin-API-only (design decision, keep it)

A trade mutation must atomically: (1) write/update/delete the trade doc, (2) rewrite the derived
fields on `assets/{assetId}` from a **full replay of all the asset's trades**, (3) optionally move
a cash asset's balance. Step (2) depends on a *query* (all trades of the asset) — the Firestore
**client** SDK cannot run queries inside a transaction; the **Admin** SDK can
(`tx.get(query)`). Doing the query outside a client transaction would rewrite derived fields from
a potentially stale read. Since correctness is the whole point of this feature, all writes go
through Admin routes. Bonus: server-side zod validation (SEC-3), server-resolved `priceEur`
(Frankfurter is server-only), and one place to invalidate the overview summary.

Layer separation (AGENTS.md *Server-Side Layer Separation*): route handler = auth → validate →
delegate; the orchestration lives in a new use case **`lib/server/assetTransactionUseCase.ts`**
(the `dividendUseCase.ts` precedent), which imports the pure engine from
`lib/utils/assetTransactionUtils.ts`.

## 1. Routes

All routes: `requireFirebaseAuth(request)` → resolve `ownerId` (query param `userId` or body
field) → `await assertCanAccessAccount(decodedToken, ownerId)` (delegation-aware — a shared-account
member can register trades; never `assertSameUser`). Bodies validated with `parseOr400` +
schemas from spec 01 §4. Error mapping via `getApiAuthErrorResponse`.

| Route | Method | Purpose |
| --- | --- | --- |
| `app/api/asset-transactions/route.ts` | POST | create one trade (body: `{ userId, transaction: AssetTransactionFormData }`) |
| `app/api/asset-transactions/[transactionId]/route.ts` | PUT | edit (body: `{ userId, updates }`) |
| `app/api/asset-transactions/[transactionId]/route.ts` | DELETE | delete (`?userId=`) |
| `app/api/asset-transactions/migrate/route.ts` | POST | idempotent one-shot migration (body: `{ userId }`) |

Reads do NOT get a route: the client SDK reads `assetTransactions`/`assetTransactionsMeta`
directly (rules allow it, spec 01 §3).

### Semantic validation in the use case (422 with Italian message)
- meta doc must exist → else 409 `"Registro operazioni non ancora inizializzato."` (the UI
  triggers migration before ever showing trade affordances, so this is a safety net);
- target asset exists, belongs to `ownerId`, and `isLedgerAssetType(asset.type)`;
- `meta.baselineDate <= date <= end of today` (Italy day bounds via `getItalyDayBoundsUtc()` —
  never `setHours(0,0,0,0)` on Vercel);
- `linkedCashAssetId` (when present) exists, belongs to `ownerId`, `assetClass === 'cash'`;
- baseline protection: PUT on `isBaseline` doc may change only
  `quantity`/`pricePerUnit`/`note` (date/type/linkedCashAssetId locked); DELETE on it → 400
  `"La posizione iniziale non può essere eliminata."`;
- replay of the prospective sequence throws `LedgerValidationError` → 422 with its `userMessage`.

## 2. Write transaction algorithm (create; edit/delete are variants)

Inside ONE `adminDb.runTransaction`, respecting **ALL reads before ANY writes** (AGENTS.md
*Firestore runTransaction* — and test against a fake tx that enforces it, see §6):

```
READS
  r1. tx.get(query: assetTransactions where userId==ownerId and assetId==X)
  r2. tx.get(assets/{assetId})
  r3. tx.get(cash asset docs)   // every linkedCashAssetId touched by old+new versions,
                                // deltas aggregated per docId BEFORE reading (self-edit nets)
COMPUTE (pure)
  seq  = existing trades  ±  {old version removed} ∪ {new version}
  state = replayTransactions(sortTransactionsForReplay(seq))     // throws → abort, 422
  derived = buildDerivedAssetFields(state)
  cashDeltas = aggregate per docId of −computeCashDelta(old) and +computeCashDelta(new)
WRITES
  w1. trade doc (set/update/delete). priceEur resolved BEFORE the transaction via
      resolveTradePriceEur (spec 01 §6) — network calls never go inside a Firestore transaction.
  w2. tx.update(assets/{assetId}, { quantity, averageCost, updatedAt,
        ...(derived.holdingStartDate !== undefined ? { holdingStartDate } : {}) })
      // NEVER deleteField() holdingStartDate — undefined means "leave untouched" (spec 02 §2d).
      // Do not route this through updateAsset(): its undefined→deleteField() translation for
      // averageCost is exactly the trap we are avoiding. Write the fields directly in-tx.
  w3. tx.update(each cash asset, { quantity: current + delta, updatedAt })  // skip zero deltas
AFTER COMMIT
  invalidate the dashboard overview summary for ownerId (server-side: reuse the logic behind
  POST /api/dashboard/overview/invalidate — extract a shared server helper if it is currently
  inline in that route; reason strings: 'asset_transaction_created' | ..._updated | ..._deleted).
```

All payloads pass through `removeUndefinedDeep` before writing. Timestamps: `createdAt`/`updatedAt`
stamped server-side.

Response shape (200): `{ transactionId, derived: { quantity, averageCost }, realizedPnlEur? }` —
the realized figure lets the UI toast a sell result without refetching.

## 3. `updateAssetMetadata` — closing the `deleteField()` trap

`updateAsset(assetId, updates)` translates an ABSENT `averageCost`/`taxRate` into `deleteField()`
(assetService.ts:270-271; the same trap already documented for `bondDetails` in AGENTS.md). Once
AssetDialog stops sending `quantity`/`averageCost` for ledger assets, calling `updateAsset` with
the remaining fields would **wipe the PMC on every metadata edit**.

Fix (Phase B): add to `lib/services/assetService.ts`:

```ts
/** AssetFormData minus the ledger-derived fields (quantity, averageCost) — see types/assetTransactions.ts. */
export type AssetMetadataFormData = Omit<AssetFormData, 'quantity' | 'averageCost'>;

/**
 * Update an asset WITHOUT touching the ledger-derived fields.
 * Same undefined→deleteField() handling as updateAsset for taxRate only;
 * quantity/averageCost/holdingStartDate are structurally absent from the payload type.
 */
export async function updateAssetMetadata(assetId: string, updates: Partial<AssetMetadataFormData>): Promise<void>
```

AssetDialog (edit mode, ledger asset types) switches to this function — spec 04 §3. `updateAsset`
survives unchanged for cash/realestate (and its 0→>0 `holdingStartDate` stamping keeps covering
those non-ledger paths).

## 4. Migration — `POST /api/asset-transactions/migrate`

Idempotent, per-user, server-side:

1. Auth as above (delegates may trigger it for the owner — `canAccess` semantics; the demo user's
   data gets migrated too so the demo UI renders coherently).
2. `assetTransactionsMeta/{ownerId}` exists → 200 `{ alreadyMigrated: true }`.
3. Read assets via `getUserAssetsAdmin(ownerId)` (existing repo function); select
   `isLedgerAssetType(type) && quantity > 0`.
4. For each selected asset, one baseline doc, **deterministic id `baseline-${assetId}`**:
   ```
   type: 'buy', isBaseline: true,
   date: baselineDate,                 // start-of-day Italy of migration day (getItalyDayBoundsUtc)
   quantity: asset.quantity,
   pricePerUnit: asset.averageCost ?? asset.currentPrice,   // no PMC → position starts at market,
                                                            // returns measured from today (user decision)
   priceEur: per spec 01 §6 baseline formula,
   note: 'Posizione iniziale (migrazione registro operazioni)'
   ```
5. Batched writes, ≤ 400 docs per batch (`costCenterService` precedent); meta doc written LAST —
   its presence is the "migration complete" signal, so a crashed run simply re-runs
   (deterministic ids make re-runs overwrite, not duplicate).
6. **Do NOT touch the asset docs at all** — quantity/PMC are identical by construction
   (baseline-only replay invariant, spec 02 test 7) and `holdingStartDate` must not move
   (invariant #4).
7. Response: `{ migratedAssetCount, baselineDate }`.

Assets at `quantity === 0` ("Azzerato") get NO baseline: their first future buy opens the ledger
(replay from empty state; the 0→>0 rule stamps `holdingStartDate` — matching what `updateAsset`
does today for rebuys).

### Trigger
Patrimonio page (`app/dashboard/assets/page.tsx`): a `useAssetLedgerMeta(ownerId)` query reads the
meta doc (client SDK); when it resolves to "absent", fire the migrate route ONCE (a `useRef` guard;
`authenticatedFetch`), then invalidate the meta + assets queries. Silent — no modal, no toast on
success; `console.error` + non-blocking UI on failure (trade affordances stay hidden while meta is
absent, so a failed migration degrades to today's behavior instead of breaking the page).

## 5. Client service + React Query

**`lib/services/assetTransactionService.ts`** (client SDK reads + `authenticatedFetch` writes):
- `getAssetTransactions(ownerId, assetId?)` — equality-only query, in-memory sort (spec 01 §3),
  `toDate()` normalization at the boundary;
- `getAssetLedgerMeta(ownerId)`;
- `createAssetTransaction(ownerId, data)` / `updateAssetTransaction(ownerId, id, updates)` /
  `deleteAssetTransaction(ownerId, id)` → POST/PUT/DELETE via `authenticatedFetch`;
- `migrateAssetLedger(ownerId)`.

**`lib/query/queryKeys.ts`** — new group:
```ts
assetTransactions: {
  all:     (userId: string) => ['asset-transactions', userId] as const,
  byAsset: (userId: string, assetId: string) => ['asset-transactions', userId, assetId] as const,
  meta:    (userId: string) => ['asset-transactions-meta', userId] as const,
},
```
`all` is a prefix of `byAsset` → invalidating `all` refreshes any open movements list (the
`costCenters` prefix-invalidation precedent).

**`lib/hooks/useAssetTransactions.ts`**: `useAssetTransactions(ownerId, assetId?)` (list;
`enabled: !!ownerId`; for the movements dialog gate with `enabled: !!ownerId && isOpen` — the
lazy-load precedent), `useAssetLedgerMeta`, and mutation hooks whose `onSuccess` invalidates
**`assetTransactions.all` + `assets.all` + `dashboard.overview`** (the dual-invalidation rule is
now a triple for trade mutations — the hero total and the asset table both change when a
settlement moves cash).

Demo mode: mutations are client-gated with `useDemoMode()` exactly like every other mutation
(spec 04); no server-side demo check (consistent with the rest of the app).

## 6. Tests (Phase B gate)

- **`__tests__/assetTransactionsRoutes.test.ts`** — mirror `apiAuthRoutes`/`assistantRoutes`
  patterns: 401 without token, 403 for non-member on another owner's data, 200 for owner AND for a
  member (delegation), 400 on schema violations (negative qty, fees on adjustment), 422 on
  over-sell, 409 before migration, baseline PUT/DELETE protection, migrate idempotency (second
  call → `alreadyMigrated`). Mock `adminDb` with the ≤3 `.where()` chain-depth limit in mind
  (post-fetch filters beyond that, AGENTS.md *Firestore Query Chain Depth*); `vi.mock('server-only', () => ({}))` where needed.
- **`__tests__/assetTransactionWriteTx.test.ts`** — the use case's transaction body run against a
  **fake `runTransaction` whose `tx.get` throws after the first write** (template:
  `__tests__/updateCashAssetBalancesAtomic.test.ts`). Cover: create with settlement, edit that
  moves the settlement to a different cash account (two aggregated deltas), delete reversing cash,
  derived-fields write including the `holdingStartDate: undefined` → field-untouched rule.
- Type check: `npx tsc --noEmit`.

---

## 7. Implementation prompt — FASE B

> **Modello consigliato: Opus 4.8, effort massimo (xhigh).** Scritture atomiche multi-documento,
> migrazione idempotente e sicurezza delle route: seconda fase a correttezza critica.

Prompt da incollare in una nuova sessione (prerequisito: Fase A già mergiata):

```text
Implementa la FASE B della feature "Registro operazioni asset" di questo repo.
Prerequisito verificabile: esistono types/assetTransactions.ts e lib/utils/assetTransactionUtils.ts
con la suite __tests__/assetTransactionUtils.test.ts verde (Fase A). Se mancano, fermati e dillo.

Contesto obbligatorio — leggi TUTTO prima di scrivere codice:
- docs/specs/asset-transactions/README.md (decisioni, invarianti, istruzioni vincolanti)
- docs/specs/asset-transactions/01-data-model-and-rules.md — §2-§6 (collections, rules, zod, FX)
- docs/specs/asset-transactions/03-service-and-api.md — INTEGRALE, è la spec di questa fase
- AGENTS.md, in particolare: "Firestore runTransaction — All Reads Before All Writes",
  "Private API Authorization", "Server-side Input Validation (SEC-3)", "Firestore Optional Field
  Deletion", "Firestore Query Chain Depth in Tests"
- COMMENTS.md e DEVELOPMENT_GUIDELINES.md vanno APPLICATI mentre scrivi.

Scope ESATTO:
1. firestore.rules: i 2 blocchi di spec 01 §3 (scrittura client negata su entrambe le collection).
2. lib/server/validation.ts: schemi zod di spec 01 §4.
3. Helper server resolveTradePriceEur (spec 01 §6) — Frankfurter storico, fallback cache, 503 con
   messaggio italiano in caso di indisponibilità.
4. lib/server/assetTransactionUseCase.ts + le 3 route di spec 03 §1 con l'algoritmo transazionale
   di §2 (all-reads-before-writes, delta cassa aggregati per docId, holdingStartDate undefined =
   campo NON toccato, mai deleteField) + migrazione idempotente di §4 (id deterministici
   baseline-${assetId}, meta doc scritto per ultimo, NESSUNA scrittura sugli asset doc).
5. updateAssetMetadata in lib/services/assetService.ts (spec 03 §3). NON modificare updateAsset.
6. lib/services/assetTransactionService.ts + lib/hooks/useAssetTransactions.ts + gruppo
   queryKeys.assetTransactions (spec 03 §5) + trigger migrazione in app/dashboard/assets/page.tsx
   (spec 03 §4: useRef guard, silenzioso, degrade-to-today su errore).
7. Test: __tests__/assetTransactionsRoutes.test.ts e __tests__/assetTransactionWriteTx.test.ts
   come da spec 03 §6 (transazione REALE contro un fake runTransaction che vieta get-dopo-write;
   template __tests__/updateCashAssetBalancesAtomic.test.ts).

Gate di uscita: npx tsc --noEmit + le due suite nuove verdi + npx vitest run
__tests__/updateCashAssetBalancesAtomic.test.ts (regressione area).

A fine lavoro: FERMATI. Aggiorna SESSION_NOTES.md, riepiloga cosa hai costruito e dimmi
esplicitamente COSA e COME testare riguardo a quanto fatto durante questa sessione — ricordando
che le rules richiedono `firebase deploy --only firestore:rules` — poi ATTENDI la conferma
esplicita dell'utente prima di qualsiasi commit.
Branch: feature/asset-transactions-fase-b; PR verso develop, mai main.
```
