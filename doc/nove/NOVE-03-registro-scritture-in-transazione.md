# NOVE-03 — Registro operazioni: every write decides inside its transaction

> Series `doc/nove/` (README.md § 5): **depends on nothing**; **NOVE-07 (the fee as a spending row, PR #489) is
> implemented after it** and builds on the contract `assertTradeUnchanged` (README.md § 7). Written on 2026-11-12;
> every `file:line` is cited on `develop` @ b841cbd7. Executes the owner's point 3 and decision 13 (README.md § 3).

## 1. The problem today (evidence on the code)

The external report (Perch Scan) says: two tabs initialise the ledger, the second one stalls, the owner corrects a
baseline in the first, and the delayed migration overwrites the correction. **Verdict: it holds in part** — it needs
an account never migrated, at least one ledger asset with quantity > 0, two callers (two tabs, or the owner and a
co-owner) and a stall of the second one; an account already migrated is immune. It is unlikely and it is real, and
the same shape (a decision read OUTSIDE the transaction that writes) is in four other writes of the same file.

`lib/server/assetTransactionUseCase.ts`:

1. **`migrateAssetLedger` (`:603-664`)**. The «done» signal is read with a plain `metaRef.get()` (`:605`), outside
   any transaction; the assets are a plain query (`:610`); `resolveBaselinePriceEur` (`:623`) is a network call inside
   the loop (the stall); each baseline is a blind `batch.set` on the deterministic id `baseline-${asset.id}`
   (`:624-641`); the meta is a `metaRef.set` without merge (`:652`), which also erases `averageCostEurBackfilledAt`.
   Caller B, having read «no meta» before A finished, rewrites every baseline with the quantity it read earlier.
   Two variants: (i) B lands after a BUY recorded through A → the baseline is reset and the BUY stays: the quantity
   is counted twice at the next replay; (ii) an asset created after A gets a baseline dated today AFTER its opening
   trade → `BASELINE_NOT_FIRST` on every later mutation of that asset.
2. **`prepareDelete` (`:374-393`) + `commitTradeMutation` (`:399-505`)**. The trade is read outside
   (`getOwnedTradeOrThrow`, `:375`) and its cash reversal is computed from that copy (`:381`); the transaction then
   deletes the ref whatever it holds (`:461`). Two concurrent deletes of the same SELL both reverse its settlement:
   the cash account is debited twice.
3. **`prepareEdit` (`:293-372`)**. The merge («an absent key keeps the old value», `:304-328`) and the reversal
   (`:357`) stand on the copy read outside (`:298`). Two concurrent edits: the second one silently restores the
   fields the first changed and reverses a settlement that is no longer the stored one.
4. **`backfillAverageCostEur` (`:696-736`)**. Per asset: a plain query of the trades (`:710-714`), then a plain
   `update` of `averageCostEur` (`:720`). A trade mutation committed in between writes the fresh value and the
   backfill overwrites it with the stale one.
5. **`deleteAllAssetTransactionsForAsset` (`:572-590`)**. Plain query, then a batch delete: a trade created in
   between survives as the orphan the function exists to remove.
6. **`commitTradeMutation` never re-checks the asset's type** inside the transaction (`getLedgerAssetCurrencyOrThrow`
   runs outside, `:157-167`): a trade prepared while the asset was an ETF commits after its conversion to
   `pensionFund`.

Client side:

7. **`components/assets/AssetDialog.tsx:1526`** — `ledgerCreateFlow = !asset && isLedgerAssetType(data.type) &&
   ledgerMeta != null`. The meta query is persisted to IndexedDB (`lib/constants/persistCache.ts:81`,
   `['asset-transactions-meta']`), `null` included: a restored `null` on an account migrated from another device
   makes a new ETF take the non-ledger path — its quantity is typed on the asset with no opening trade, and the first
   later trade replays the asset from zero.
8. **`app/dashboard/assets/page.tsx:220-234`** fires the migration whenever the (possibly restored) meta is `null`.
   With (1) cured this is harmless; it stays as it is.

The route tests (`__tests__/assetTransactionsRoutes.test.ts`) run the real use case over an in-memory `adminDb`
(`:45-125`) and cover no interleaving; the E2E specs plant the meta before the page loads.

## 2. Goal and acceptance criteria

No ledger write acts on a trade, a meta document, a baseline, an asset TYPE or a settlement account it read outside
its own transaction; a second, late caller changes nothing. The asset's CURRENCY stays read in prepare (declared,
§ 10).

1. A migration that resolves after another one completed writes nothing: a baseline corrected in between keeps the
   corrected quantity and the late caller's answer is `{ alreadyMigrated: true }`. **Proof**: test M1.
2. A migration never overwrites an existing baseline, even with no meta document (the state a crashed run of the old
   batch could leave). **Proof**: test M2.
3. The meta document is created once and a second migration never rewrites it: `averageCostEurBackfilledAt` survives.
   **Proof**: test M3.
4. A ledger asset that appears between the price pre-read and the transaction is still migrated (the migration
   retries, at most three times). **Proof**: test M4.
5. Two deletes of the same trade settle the cash account once: the second answers 404 «Operazione non trovata.» and
   the account's balance is the one after the first. **Proof**: test D1.
6. An edit prepared on a version of the trade that is no longer the stored one answers 409 «L'operazione è cambiata
   nel frattempo: riapri e riprova.» and writes nothing. **Proof**: test E1.
7. The backfill never lowers a fresher `averageCostEur`: per asset, trades and asset are read in ONE transaction.
   **Proof**: test B1.
8. `deleteAllAssetTransactionsForAsset` deletes in one transaction that also reads the asset document. **Proof**: test A1.
9. A trade on an asset that is no longer a ledger type at commit answers 422 «Questo tipo di asset non usa il
   registro operazioni.» **Proof**: test T1.
10. A new ledger asset created while the cached meta is `null` asks the server once before choosing its path; with a
    meta on the server it takes the ledger path. **Proof**: test C1 (`__tests__/ledgerMetaFreshness.test.ts`) for the
    read, test C2 (`e2e/assets.ledger-meta.spec.ts`) for the dialog.
11. Every existing test of `assetTransactionsRoutes.test.ts` and of
    `assetTransactionAverageCostEurBackfill.test.ts` stays green with unchanged assertions (their fakes and seeding
    extended as § 6 says); `tsc`, lint, Vitest in the three zones, `npx playwright test e2e/assets` green;
    `npm run perf:budget` green on `/dashboard/assets` (737 KB gz, 736,2 measured: `AssetDialog` is in the route's
    first load).
12. A settlement account that is no longer a cash account when the trade commits answers 422 «Il conto di regolamento
    selezionato non è valido.» and writes nothing. **Proof**: test S1.

## 3. Decisions

- **Owner 13 (2026-11-12)**: the migration AND the other writes with the same defect, in one spec.
- **Adopted, reversible**:
  - an edit on a changed trade is REFUSED (409), never merged: the owner sees the fresh row and repeats the edit;
- **Owner 39 (2026-11-12)**: the version an edit or a delete is checked against is the one the FORM or the BUTTON was
  drawn from, not only the server's own read: both requests carry `expectedUpdatedAt`, so a form left open in a
  second tab on an older version is refused with the same 409.
- **Adopted, reversible (continued)**:
  - a delete of a trade already deleted is 404, the answer of today's `getOwnedTradeOrThrow`;
  - the migration writes at most 450 baselines: a self-imposed guard that keeps the one transaction small (the old
    batch wrote ≤ 400); beyond that it answers 422 «Troppi strumenti per inizializzare il registro in una volta:
    contatta il supporto.» — no account of this app is near that figure;
  - a trade document without `updatedAt` is not a case: every writer stores it (`buildTradeSetDocData`, the
    migration, the e2e seeds), and a test fixture that edits or deletes a trade sets it (`toDate(undefined)` is
    «now», which the guard would read as a changed trade);
  - `deleteAllAssetTransactionsForAsset` does not refuse a still-ledger asset: its one caller flips the type first,
    and its in-transaction read of the asset only locks it against a trade commit;
  - the alternative «`batch.create()` instead of `batch.set()`» was rejected: it cures the overwrite and leaves the
    meta rewrite and variant (ii).
- No earlier decision is overturned.

## 4. Solution

### `lib/server/assetAdminRepository.ts` — the document mapper, extracted

```ts
/** A stored asset doc in the domain shape (Timestamp → Date at the boundary). */
export function mapAssetDoc(id: string, data: DocumentData): Asset {
  return {
    id,
    ...data,
    lastPriceUpdate: data.lastPriceUpdate?.toDate() || new Date(),
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    holdingStartDate: data.holdingStartDate?.toDate(),
  } as Asset;
}
```

`getUserAssetsAdmin` maps through it (`querySnapshot.docs.map((doc) => mapAssetDoc(doc.id, doc.data()))`), behaviour
unchanged.

### `lib/server/assetTransactionUseCase.ts`

**The shared guard** (README.md § 7, contract `assertTradeUnchanged`):

```ts
/**
 * The trade a plan was prepared on must still be the stored one when the transaction commits.
 * `existing` is the in-transaction read of the asset's trades, so the comparison is on locked
 * data. A missing row is a 404 (deleted meanwhile); a different `updatedAt` is a 409.
 */
function assertTradeUnchanged(existing: AssetTransaction[], plan: PreparedMutation): void {
  if (plan.op === 'set') return;
  const stored = existing.find((t) => t.id === plan.targetTransactionId);
  if (!stored) throw new TradeUseCaseError(404, 'Operazione non trovata.');
  if (stored.updatedAt.getTime() !== plan.preparedOnUpdatedAt) {
    throw new TradeUseCaseError(409, "L'operazione è cambiata nel frattempo: riapri e riprova.");
  }
}
```

- `PreparedMutation` gains `preparedOnUpdatedAt?: number` («`updatedAt` of the trade the plan was prepared on, in
  ms; absent for create»). `prepareEdit` and `prepareDelete` set it to `(expectedUpdatedAt ?? oldTrade.updatedAt).getTime()`.
- **The client's version** (decision 39). `lib/services/assetTransactionService.ts`:
  `updateAssetTransaction(ownerId, transactionId, updates, expectedUpdatedAt: Date)` adds
  `expectedUpdatedAt: expectedUpdatedAt.toISOString()` to the PUT body beside `updates`;
  `deleteAssetTransaction(ownerId, transactionId, expectedUpdatedAt: Date)` adds
  `&expectedUpdatedAt=<ISO, URI-encoded>` to the DELETE query. Their callers (`lib/hooks/useAssetTransactions.ts`'s
  two mutations, fed by `TransactionDialog`'s submit and by the row's delete) pass the `updatedAt` of the
  `AssetTransaction` the form or the button was rendered from. `app/api/asset-transactions/[transactionId]/route.ts`
  reads the field in PUT and DELETE: absent → `undefined` (an older client: the server's read is the version, as
  before); present and not a valid ISO date → 400, as the route's other malformed input; else a `Date` passed as
  the last argument of the use case's `updateAssetTransaction(ownerId, transactionId, updates, expectedUpdatedAt?)` /
  `deleteAssetTransaction(ownerId, transactionId, expectedUpdatedAt?)`, which hand it to `prepareEdit` /
  `prepareDelete`. On a 409 the dialog shows the server's message and refetches the asset's trades (the hook's
  `onError` invalidates the list), so the reopened form is drawn from the fresh row.
- `commitTradeMutation`: COMPUTE opens, in this order, with `const existing = …` (a pure map),
  `assertTradeUnchanged(existing, plan);`, then:

```ts
if (!assetSnap.exists) throw new TradeUseCaseError(404, 'Asset non trovato.');
if (!isLedgerAssetType(assetSnap.data()?.type as AssetType)) {
  throw new TradeUseCaseError(422, 'Questo tipo di asset non usa il registro operazioni.');
}
```

  The three checks sit ABOVE `buildNewSequence` (a 404/409/422 must win over a replay error on a stale sequence).
- In the cash-settlement loop of `commitTradeMutation` (the `cashReads` it already holds), an account with a
  non-zero delta that exists and is no longer `assetClass === 'cash' && type === 'cash'` throws
  `new TradeUseCaseError(422, 'Il conto di regolamento selezionato non è valido.')` — the sentence of
  `assertCashSettlementAsset`; a missing account keeps today's skip-and-warn.

**`migrateAssetLedger`**, rewritten:

```ts
const MIGRATION_MAX_ATTEMPTS = 3;
const MIGRATION_MAX_BASELINES = 450;

/** Thrown inside the migration's transaction when the assets moved since the price pre-read. */
class MigrationInputsChangedError extends Error {}

const baselineInputOf = (asset: Asset) => `${asset.currency ?? 'EUR'}|${asset.averageCost ?? asset.currentPrice}`;

export async function migrateAssetLedger(ownerId: string): Promise<MigrationResult> {
  const metaRef = adminDb.collection(ASSET_TRANSACTIONS_META_COLLECTION).doc(ownerId);
  // Fast path, outside any transaction: the common case costs one read.
  if ((await metaRef.get()).exists) return { alreadyMigrated: true };

  for (let attempt = 1; attempt <= MIGRATION_MAX_ATTEMPTS; attempt++) {
    // Network BEFORE the transaction: one EUR price per ledger asset, keyed by what it was resolved from.
    const preRead = (await getUserAssetsAdmin(ownerId)).filter((a) => isLedgerAssetType(a.type) && a.quantity > 0);
    if (preRead.length > MIGRATION_MAX_BASELINES) {
      throw new TradeUseCaseError(422, 'Troppi strumenti per inizializzare il registro in una volta: contatta il supporto.');
    }
    const priceEurByAsset = new Map<string, { input: string; priceEur: number }>();
    for (const asset of preRead) {
      priceEurByAsset.set(asset.id, { input: baselineInputOf(asset), priceEur: await resolveBaselinePriceEur(asset) });
    }

    const { start: baselineDate } = getItalyDayBoundsUtc();
    const now = new Date();
    try {
      return await adminDb.runTransaction(async (tx: Transaction): Promise<MigrationResult> => {
        // ── READS ──
        if ((await tx.get(metaRef)).exists) return { alreadyMigrated: true };
        const assetsSnap = await tx.get(adminDb.collection(ASSETS_COLLECTION).where('userId', '==', ownerId));
        const baselinesSnap = await tx.get(
          adminDb.collection(ASSET_TRANSACTIONS_COLLECTION).where('userId', '==', ownerId).where('isBaseline', '==', true)
        );
        // ── COMPUTE ──
        const alreadyBaselined = new Set(baselinesSnap.docs.map((d) => d.data().assetId as string));
        const ledgerAssets = assetsSnap.docs
          .map((d) => mapAssetDoc(d.id, d.data()))
          .filter((a) => isLedgerAssetType(a.type) && a.quantity > 0 && !alreadyBaselined.has(a.id));
        for (const asset of ledgerAssets) {
          if (priceEurByAsset.get(asset.id)?.input !== baselineInputOf(asset)) throw new MigrationInputsChangedError();
        }
        // ── WRITES ──
        for (const asset of ledgerAssets) {
          tx.create(
            adminDb.collection(ASSET_TRANSACTIONS_COLLECTION).doc(`baseline-${asset.id}`),
            removeUndefinedDeep({
              userId: ownerId,
              assetId: asset.id,
              type: 'buy' as const,
              isBaseline: true,
              date: baselineDate,
              quantity: asset.quantity,
              // No PMC → the position starts at market; returns are then measured from today (user decision).
              pricePerUnit: asset.averageCost ?? asset.currentPrice,
              priceEur: priceEurByAsset.get(asset.id)!.priceEur,
              note: 'Posizione iniziale (migrazione registro operazioni)',
              createdAt: now,
              updatedAt: now,
            })
          );
        }
        // The meta LAST and created, never set: its presence is the «done» signal and nobody rewrites it.
        tx.create(
          metaRef,
          removeUndefinedDeep({ userId: ownerId, migratedAt: now, baselineDate, migratedAssetCount: ledgerAssets.length, createdAt: now, updatedAt: now })
        );
        return { migratedAssetCount: ledgerAssets.length, baselineDate };
      });
    } catch (error) {
      if (!(error instanceof MigrationInputsChangedError) || attempt === MIGRATION_MAX_ATTEMPTS) throw error;
    }
  }
  throw new Error('Ledger migration did not complete'); // unreachable: the loop returns or throws
}
```

The function's docstring is rewritten: «Idempotent — the meta doc is read INSIDE the transaction that writes it; a
baseline that exists is never rewritten (2026-11-12)». A `MigrationInputsChangedError` on the third attempt reaches
the route as a 500 (the page's trigger logs it and the next visit retries).

**`backfillAverageCostEur`** — the per-asset body becomes one transaction (the `try/catch` and the counters stay):

```ts
const assetRef = adminDb.collection(ASSETS_COLLECTION).doc(asset.id);
const wrote = await adminDb.runTransaction(async (tx: Transaction) => {
  const tradesSnap = await tx.get(
    adminDb.collection(ASSET_TRANSACTIONS_COLLECTION).where('userId', '==', ownerId).where('assetId', '==', asset.id)
  );
  const assetSnap = await tx.get(assetRef);
  if (tradesSnap.empty || !assetSnap.exists) return false;
  const trades = tradesSnap.docs.map((d) => docToAssetTransaction(d.id, d.data() as DocumentData));
  const { averageCostEur } = buildDerivedAssetFields(replayTransactions(trades));
  if (averageCostEur === undefined) return false; // a closed position: nothing to stand a G/P on
  tx.update(assetRef, { averageCostEur, updatedAt: new Date() });
  return true;
});
if (wrote) recomputedAssetCount += 1;
```

**`deleteAllAssetTransactionsForAsset`** — one transaction:

```ts
return adminDb.runTransaction(async (tx: Transaction) => {
  const snap = await tx.get(
    adminDb.collection(ASSET_TRANSACTIONS_COLLECTION).where('userId', '==', ownerId).where('assetId', '==', assetId)
  );
  // Reading the asset locks it against a trade commit, which reads and writes the same doc.
  await tx.get(adminDb.collection(ASSETS_COLLECTION).doc(assetId));
  for (const doc of snap.docs) tx.delete(doc.ref);
  return snap.docs.length;
});
```

Its docstring's «Batched delete, well under Firestore's 500-op cap» becomes «One transaction (an asset's history is
well under Firestore's 500-write cap)».

### `lib/hooks/useAssetTransactions.ts` — a fresh meta on demand

```ts
/** The ledger meta as the SERVER holds it now — for a decision a restored `null` must not take. */
export function fetchFreshLedgerMeta(queryClient: QueryClient, ownerId: string) {
  return queryClient.fetchQuery({
    queryKey: queryKeys.assetTransactions.meta(ownerId),
    queryFn: () => getAssetLedgerMeta(ownerId),
    staleTime: 0,
  });
}
```

### `components/assets/AssetDialog.tsx` (`:1526`)

```ts
// A cached `null` may be a restored one (IndexedDB) on an account migrated elsewhere: ask once.
const metaNow = !asset && isLedgerAssetType(data.type) && ledgerMeta == null && ownerId
  ? await fetchFreshLedgerMeta(queryClient, ownerId)
  : ledgerMeta;
const ledgerCreateFlow = !asset && isLedgerAssetType(data.type) && metaNow != null;
```

`ledgerCreateReady` (`:1028`) is not touched: it gates only the hint «Il registro operazioni si sta inizializzando:
la posizione viene salvata comunque.» (`:2256`). The opening-trade fields are drawn for every ledger create
(`isLedgerCreate`, `:2176`), so a fresh meta found at submit takes the ledger path with the values typed: no toast,
no early close, `returnFocusTo` unchanged. The fetched meta lands in the query cache and the hint disappears on the
next render. A rejected fresh read reaches `onSubmit`'s catch like any other failed step: nothing is created.

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **«ALL reads before ANY writes» inside `runTransaction`** (AGENTS.md § Firestore Writes, the `runTransaction`
  bullet, and the section comment above `commitTradeMutation`): here
  it means the three reads of the migration come first and a query inside a transaction goes through `tx.get(query)`,
  Admin SDK only.
- **No network inside a transaction**: `resolveBaselinePriceEur` stays outside; the transaction only checks that the
  price was resolved from the same currency and unit price (`baselineInputOf`).
- **A Firestore transaction retries its closure**: the closure must be pure of side effects — it returns its result,
  never assigns to outer state that a retry would double (the pattern `outcome = …` of `commitTradeMutation` is
  safe because it is overwritten, not accumulated).
- **`removeUndefinedDeep` on every payload**; `holdingStartDate` is never written by the migration (invariant #4).
- **`tx.create` on an existing document fails the commit with `ALREADY_EXISTS`**, which the Admin SDK does not
  retry (`isRetryableTransactionError`). The only other writer of `baseline-<id>` is another migration, and the two
  serialize on the meta document both read: the losing one is ABORTED, retried, and returns
  `{ alreadyMigrated: true }`. If `ALREADY_EXISTS` ever surfaces it reaches the route as a 500 and the next visit
  retries; it is not caught.
- **The test fakes**: `__tests__/assetTransactionsRoutes.test.ts:45-125` has no `tx.create`, returns nothing from
  `runTransaction`, runs two transactions interleaved and mocks `assetAdminRepository` whole;
  `__tests__/assetTransactionAverageCostEurBackfill.test.ts` has no `runTransaction` at all. § 6 extends both (it
  is test code; keep it small).
- **The equality-only query `userId == … AND isBaseline == true`** needs no composite index (two equalities merge
  single-field indexes); `firestore.indexes.json` is not touched.
- **Dates**: `getItalyDayBoundsUtc` as today; no `setHours`.
- **NOVE-07 will add the fee row's reads and writes to `commitTradeMutation`**: keep `assertTradeUnchanged` the
  first check of COMPUTE (right after the `existing` map) so every later decision (the fee plan included) stands on
  a checked trade.

## 6. Tests per level (with the mutation that proves each)

Harness changes in `__tests__/assetTransactionsRoutes.test.ts`: `tx.create` (throws `new Error('ALREADY_EXISTS')`
when the key is in the store or already pending); `runTransaction` returns the closure's value and SERIALIZES —
every call joins a module-level promise chain (`mocks.txQueue`), so one closure runs AND applies its pending writes
before the next closure starts (the fake's model of Firestore's serializable isolation: without it two released
closures read the same pre-write store and D1/E1 cannot tell the fix from the bug); query results carry
`ref: makeDocRef(collection, id)`, so `tx.delete(doc.ref)` resolves; the
`assetAdminRepository` mock keeps the real `mapAssetDoc` (`vi.mock(…, async (orig) => ({ ...(await orig()),
getUserAssetsAdmin: mocks.getUserAssetsAdmin }))`); a helper `seedAsset(id, data)` writes the asset into the store
AND into the `getUserAssetsAdmin` mock's answer, so pre-read and in-transaction read agree; `resolveBaselinePriceEur`
can be made deferred (`mocks.fx.gate`, a promise the test resolves). The existing test «migrates once, then reports
alreadyMigrated on a second call» (`:472`) seeds its two assets through `seedAsset`; its assertions do not change
(the transaction now reads the store: the new contract, not a regression). Every fixture trade that a test edits
or deletes carries an `updatedAt`.

`__tests__/assetTransactionAverageCostEurBackfill.test.ts` gains a `runTransaction` in its fake: `tx.get` on a doc
ref or on a query object, `tx.update` queued and applied after the closure returns, the closure's value returned.
Its header sentence «get/update only — no transaction needed here» becomes «get/update and a per-asset
transaction». Its nine tests stay green unchanged.

| # | Test (Vitest, node) | Mutation that turns it red |
| --- | --- | --- |
| M1 | A migrates; baseline of `asset-1` edited to quantity 12 via PUT; B (started before A, FX deferred) resolves → B's body `{ alreadyMigrated: true }`, baseline quantity 12; then a BUY of 1 → asset quantity 13 | remove the in-transaction `tx.get(metaRef)` check |
| M2 | store holds `baseline-asset-1` (quantity 7) and no meta → migrate → quantity still 7, meta created, `migratedAssetCount` 0 | drop `!alreadyBaselined.has(a.id)` |
| M3 | migration B starts with no meta and its FX pre-read deferred (`mocks.fx.gate`); while it waits the test plants the baselines and a meta holding `averageCostEurBackfilledAt` (A's run plus its backfill), then releases the gate → the meta still holds the field and B answers `{ alreadyMigrated: true }` | replace `tx.create(metaRef…)` with `tx.set` and remove the in-tx meta check |
| M4 | `asset-2` is added to the store after the first pre-read (the mock's second answer includes it) → both baselines exist, `migratedAssetCount` 2 | catch-and-return instead of retrying on `MigrationInputsChangedError` |
| M5 | the pre-read returns 451 ledger assets → 422 with the Italian message; no baseline and no meta in the store | remove the `MIGRATION_MAX_BASELINES` check |
| D1 | a SELL of 2 at 100 settled on `cash-1`; two DELETE requests whose `prepareDelete` both ran before either commit (calls 1 and 2 gated, released together) → statuses 200 and 404, `cash-1` moved once | remove `assertTradeUnchanged` |
| E1 | two PUTs prepared on the same version (quantity 3; note «x») → 200 then 409 with the Italian message; the stored trade is the first edit | compare nothing when `op === 'update'` |
| E2 | a trade edited once (its `updatedAt` moves); a PUT whose `expectedUpdatedAt` is the `updatedAt` of BEFORE that edit → 409 with the Italian message, the stored trade is the first edit; the same PUT without the field → 200 | ignore `expectedUpdatedAt` in `prepareEdit` |
| D2 | the same stale `expectedUpdatedAt` on DELETE → 409, the trade and its settlement still there; `expectedUpdatedAt=not-a-date` → 400 | ignore the field in `prepareDelete` |
| B1 | backfill with its transaction held (call 1 gated); a BUY of 1 commits in full; release → the asset's `averageCostEur` is the replay WITH the BUY | read the trades with a plain `.get()` outside the transaction |
| A1 | `deleteAllAssetTransactionsForAsset` (imported from the use case) on three trades → returns 3, store has none, and the asset doc was read through `tx.get` (spy on the fake) | delete the `tx.get(assetRef)` line |
| T1 | the asset's `type` flips to `pensionFund` after `prepareCreate` (call 1 gated) → 422 with the Italian message, no trade written | remove the in-transaction type check |
| S1 | a BUY settled on `cash-1`; after `prepareCreate` (call 1 gated) `cash-1`'s `type` becomes `etf` → 422 «Il conto di regolamento selezionato non è valido.», no trade written, `cash-1` untouched | remove the in-transaction account check |
| C1 | `__tests__/ledgerMetaFreshness.test.ts`: a `QueryClient` whose cache holds `null` for the meta key and a `getAssetLedgerMeta` mock returning a meta → `fetchFreshLedgerMeta` resolves the meta and calls the service once | `staleTime: Infinity` |

The gate for D1/E1/B1/T1/S1: `mocks.txGate = { calls: number[], release }` holds only the listed
`runTransaction` calls (counted by a `mocks.prepared` counter the fake increments on entry), the others pass; a
held call awaits the gate BEFORE joining the queue. D1/E1 gate calls 1 and 2: the test starts both requests,
awaits `mocks.prepared === 2` (`await Promise.resolve()` twice is not enough), then releases them together. T1 and
S1 gate call 1, change the document, release. B1 gates call 1 (the backfill's transaction), runs the BUY to
completion, then releases.

One E2E, for the dialog half of criterion 10 — **C2**, `e2e/assets.ledger-meta.spec.ts` (`desktop` project, the
base account), on the pattern of `e2e/assets.bond.spec.ts` «a bond with ONE coupon at maturity»: the test reads
`assetTransactionsMeta/<uid>` with the Admin SDK and deletes it (it RESTORES what it read in `finally`, or deletes
the planted one when there was none); `page.route('**/api/asset-transactions/migrate', (r) => r.abort())`; opens
`/dashboard/assets` (the page reads `null`, the migration is held off); plants the meta with the Admin SDK (the
shape of `assets.bond.spec.ts:197-201`); «Aggiungi asset» → «Obbligazione», ticker `ORNITORINCO-META`, name «BTP
Ornitorinco Meta», quantity 1000, average cost 100 → «Crea strumento»; then, by Admin SDK: the new asset has ONE
`assetTransactions` document, `type: 'buy'`, quantity 1000 (the ledger path), and the asset's quantity is 1000. The
asset and its trade are deleted by Admin SDK in `finally`. Mutation: `ledgerMeta != null` in place of
`metaNow != null` → no trade document, the test is red. The races themselves cannot be driven from a browser;
`e2e/assets*.spec.ts` prove nothing regressed.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on a fresh emulator account with one ETF (quantity 10), two tabs opened together
on Patrimonio end with ONE baseline of 10; after correcting it to 12 in one tab, reloading the other leaves 12.
Phases C–E prove that nothing regressed on a real Firestore (today's code passes them too); the races themselves
are proven only by M1–S1 (§ 6).

- **A**: `tsc`, lint, Vitest (three zones), `npx playwright test e2e/assets`, `npm run perf:budget`.
- **B**: emulators + a throwaway script (`scripts/*.tmp.mts`, deleted in G) that creates a fresh account
  `ornitorinco@example.com` with ONE ETF «Ornitorinco ETF» (quantity 10, PMC 100 EUR), a cash account «Conto
  Fenicottero» (1000), no trades and no `assetTransactionsMeta` document.
- **C (browser, the session)**: two tabs on `/dashboard/assets`; the Firestore emulator shows one meta, one baseline
  per ledger asset. Edit the baseline to 12; `curl` the migrate route again with the tab's token → `alreadyMigrated`.
- **D (data)**: in the emulator, `assetTransactionsMeta/<uid>` keeps `averageCostEurBackfilledAt` after the second call.
- **E (failure)**: delete a trade in tab 1, then press delete on the same row in tab 2 (stale list) → the toast shows
  «Operazione non trovata.», the cash account's balance did not move twice.
- **F (owner)**: nothing to do on production data — his account is migrated; a look at Patrimonio after the deploy.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): stop the emulators, remove the throwaway account.

## 8. Putting it into service

One PR to `develop`. No migration of data, no index, no rule. The routes' contracts gain two answers (409 on a stale
edit, 404 on a repeated delete) that the client already shows through the mutation's error toast.

## 9. Documentation

- `doc/guide/server.md` and `doc/guide/registro-operazioni.md` § Concurrency: «an edit and a delete carry
  `expectedUpdatedAt`, the version the form or the button was drawn from; an older one is the 409» (decision 39).
- `doc/guide/registro-operazioni.md`: a section «## Concurrency» — the four rules (the migration decides inside its
  transaction and never rewrites a baseline; an edit or delete stands on `assertTradeUnchanged`; the asset's type
  and the settlement account are checked at commit; the currency is read in prepare) with the date. The bullet
  «**Migration is idempotent**…» (`:88`) is rewritten: «**Migration is idempotent and decides in ONE transaction**
  (2026-11-12): the meta doc is read inside it and `tx.create`d last; an existing baseline is never rewritten; at
  most 450 baselines (422 beyond); prices are resolved before it, re-checked by currency and unit price, three
  attempts». The guide has no blind-spot section: a new closing «## Per-page blind spots» opens with «a restored
  `null` meta asks the server before a ledger asset is created (`fetchFreshLedgerMeta`)».
- `AGENTS.md` § Firestore Writes, the `runTransaction` bullet: one sentence, RULE + DATE + WHERE PINNED — «a
  decision read outside a transaction is re-checked inside it (2026-11-12; `assetTransactionsRoutes.test.ts` M1,
  D1, E1)».
- `doc/guide/server.md`: the new answers of the trade routes (409 on a changed trade, 404 on a repeated delete,
  422 on a non-ledger asset or a non-cash settlement account at commit).
- `doc/guide/e2e-playwright.md`: `e2e/assets.ledger-meta.spec.ts` in the Patrimonio inventory.
- `CLAUDE.md` › «Latest»; `Draft Release Temp.md`, prepended to `## 🐛 Bug Fixes`: «- **Patrimonio — registro
  operazioni** — Two tabs open at once can no longer overwrite a correction of the ledger: every write decides
  inside its transaction, and a trade changed or deleted in the meantime is refused with a message.»;
  `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **The fee row's own concurrency** (two saves creating two fee rows): heir NOVE-07, which plans the fee inside the
  transaction on top of `assertTradeUnchanged`.
- **The Compravendita executor and the expense transactions** (`realEstateOperationService.ts`, `expenseService.ts`):
  not ledger writes; NOVE-04 touches the first and keeps its single transaction. No heir for the second: no report,
  no finding.
- **The asset's currency changed between prepare and commit**: `priceEur` is resolved from the currency read in
  prepare; a currency change on a held instrument is a deliberate act with a window of a few hundred milliseconds.
  No heir (declared).
- **Frankfurter's fetch without a timeout** (`tradeFxService`): it only lengthens a request now that the decision is
  in the transaction; no heir in this series (declared).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-03-registro-scritture-in-transazione.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-03-registro-scritture-in-transazione.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/registro-operazioni.md, doc/guide/server.md, doc/guide/cache-persistita.md e
  doc/guide/e2e-playwright.md PRIMA di scrivere codice in quel dominio
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

Implementa la spec così com'è scritta: mapAssetDoc estratto, assertTradeUnchanged e il
controllo del tipo dentro commitTradeMutation, migrateAssetLedger in transazione con il
pre-read dei prezzi e i tre tentativi, il backfill e la cancellazione totale in transazione,
il conto di regolamento ricontrollato al commit, fetchFreshLedgerMeta e il suo uso in
AssetDialog (nessun toast, nessuna chiusura anticipata: § 4). I test PRIMA del codice, uno
per riga della § 6, ciascuno visto rosso con la sua mutazione; i due finti adminDb si
estendono come dice la § 6 (la coda che serializza, il cancello per chiamata, runTransaction
nel finto del backfill). Fermati e chiedimi se: un test esistente dei due file diventa rosso
con le SUE asserzioni cambiate (il seeding e i finti estesi della § 6 non contano);
perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro). Collaudo: § 7. Un branch, un commit, solo dopo il mio OK con il
riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec on a shared contract (the ledger's transaction, concurrency of
money writes). Estimated size: 1 session, ~4 h; ~160 lines of use case, ~15 of client, ~420 of tests and harness, one E2E.
