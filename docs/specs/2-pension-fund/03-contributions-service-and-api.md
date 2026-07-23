# 03 — Service contributi, effetto valore/transfer, hooks, rollup

Riferimento fedele: `ciocc/main:lib/services/pensionContributionService.ts`,
`ciocc/main:lib/utils/pensionContributions.ts`, `ciocc/main:lib/hooks/usePensionContributions.ts`.
Nessuna route Admin: si usa il **client SDK** (come `dividends`). L'atomicità conto↔fondo del
volontario è garantita da `reconcileTransferCreate`, non serve una transazione multi-doc server.

## 1. Service — `lib/services/pensionContributionService.ts`

### Lettura
```ts
export async function getPensionContributions(userId: string, assetId?: string): Promise<PensionContribution[]>
```
Query di spec 01 §3, `toDate()` al boundary. (Se si sceglie la via no-orderBy di spec 01 §5, ordinare
in memoria per `date` desc.)

### Scrittura contributo + effetto valore
```ts
export interface PensionContributionInput {
  assetId: string; source: ContributionSource; amount: number; date: Date;
  taxYear?: number; notes?: string; sourceCashAssetId?: string;   // richiesto se source==='voluntary'
}
export async function recordPensionContribution(userId: string, input: PensionContributionInput): Promise<string>
```

Regola (invariante #1/#2): OGNI contributo alza il valore del fondo di `amount`. Differiscono solo
sulla provenienza:

- **TFR / employer** (non transitano dal conto): `updateCashAssetBalance(assetId, +amount)` (il valore
  del fondo vive in `quantity`, prezzo 1) + `writePensionContribution(...)`. Nessun `Expense`.
- **Voluntary** (l'utente muove i propri soldi): modellato come **transfer** conto→fondo (spec §4.3
  del fork):
  1. `ensureTransferCategory(userId)`;
  2. `createExpense(userId, { type: 'transfer', … })` — voce di audit trail net-zero (esclusa da
     spesa/risparmio);
  3. `reconcileTransferCreate(...)` — conto −amount, fondo +amount, atomico
     (`updateCashAssetBalancesAtomic`);
  4. `writePensionContribution(userId, input, linkedExpenseId)` con `sourceCashAssetId` persistito.
  Precondizione: `sourceCashAssetId` presente (altrimenti `throw`).
  Il credito di destinazione del transfer **È** l'incremento di valore del fondo → mai doppio conteggio.

`writePensionContribution` (privata): `deductible = isDeductibleSource(source)`,
`taxYear = input.taxYear ?? date.getFullYear()`, `sourceCashAssetId` solo per voluntary,
`removeUndefinedDeep` prima dell'`addDoc`.

### Cancellazione con storno esatto (invariante #5)
```ts
export async function deletePensionContribution(contribution: PensionContribution): Promise<void>
```
- **TFR/employer**: `updateCashAssetBalance(assetId, −amount)`; `deleteDoc(contribution)`.
- **Voluntary**: `reconcileTransferDelete(...)` (conto +amount, fondo −amount) +
  `deleteExpense(linkedExpenseId)` + `deleteDoc(contribution)`. Serve `sourceCashAssetId` persistito.

> **Edit contributo**: fuori scope v1 (= elimina + reinserisci), come nel fork. Documentarlo.

### Estratto conto (NON gestito qui)
L'aggiornamento periodico del NAV (overwrite assoluto che cattura il rendimento) è un plain edit
dell'asset in Patrimonio (`updateAsset`), non un contributo. Intenzionale.

## 2. Rollup puro — `lib/utils/pensionContributions.ts`

```ts
/** Deducibili (voluntary+employer, TFR escluso) per anno — input a computePensionDeductionState. */
export function derivePensionDeductibleByYear(contributions: PensionContribution[]): Record<number, number>
/** Split completo per anno e natura (per le card "versato per natura"). */
export function derivePensionContributionsByYearAndNature(
  contributions: PensionContribution[]
): Record<number, Record<PensionContributionNature, number>>
```
Chiave = `taxYear`. Zero import Firebase. Test `__tests__/pensionContributions.test.ts`: TFR escluso
dai deducibili; split per natura; anni multipli; array vuoto → `{}`.

## 3. Hooks + query keys

`lib/query/queryKeys.ts`:
```ts
pensionContributions: {
  all:     (userId: string) => ['pension-contributions', userId] as const,
  byAsset: (userId: string, assetId: string) => ['pension-contributions', userId, assetId] as const,
},
```
`lib/hooks/usePensionContributions.ts`: `usePensionContributions(ownerId, assetId?)`
(`enabled: !!ownerId`) + mutation hooks. `onSuccess` invalida **`pensionContributions.all` +
`assets.all` + `dashboard.overview`** (il contributo muove il valore del fondo e — per il volontario
— il saldo del conto: la dual-invalidation diventa tripla, come per il registro operazioni).

Demo mode: mutation client-gated con `useDemoMode()`. Shared account: tutto owner-scoped
(`ownerId` da `useActiveAccount`); un delegato può registrare contributi.

## 4. Cache `PensionFundDetails` (opzionale, P3)

I campi `cumulative*` di `PensionFundDetails` sono cache: la fonte di verità è
`PensionContribution[]`. In v1 si possono **derivare a runtime** dai contributi (rollup §2) e NON
persistere le cache — più semplice e sempre coerente. Persisterle è un'ottimizzazione futura.
Raccomandazione: non persistere le cache in v1; documentarlo.

## 5. Test (gate P1)

- `__tests__/pensionContributions.test.ts` (rollup puro, §2).
- `__tests__/pensionContributionService.test.ts`: mockare `@/lib/firebase/config` e i service
  dipendenti (`updateCashAssetBalance`, `reconcileTransferCreate/Delete`, `createExpense`,
  `deleteExpense`, `ensureTransferCategory`) — pattern `fireService.test.ts`. Coprire: TFR accredita
  il fondo senza Expense; volontario crea transfer+reconcile+contributo con `linkedExpenseId`;
  volontario senza `sourceCashAssetId` → throw; delete TFR decrementa; delete volontario reverte
  transfer + cancella Expense.
- `npx tsc --noEmit`.

---

## 6. Prompt di implementazione — FASE P1

> **Modello: Opus 4.8, effort xhigh.** Effetti valore/transfer e storno: correttezza sui saldi.

```text
Implementa la FASE P1 della feature "Fondo Pensione".
Prerequisito: Fase P0 mergiata (types/pension.ts, AssetType 'pensionFund', lib/utils/pensionDeduction.ts
con test verdi). Se manca, fermati e dillo.

Contesto obbligatorio — leggi TUTTO:
- docs/specs/README.md; docs/specs/2-pension-fund/README.md (invarianti, in particolare #1,#2,#5)
- docs/specs/2-pension-fund/01-data-model-and-rules.md — §3-§6 (collection, rules, indici, validazione)
- docs/specs/2-pension-fund/03-contributions-service-and-api.md — INTEGRALE
- AGENTS.md: "Cash Balance Reconciliation / Transfers", "Firestore Optional Field Deletion",
  "Private Data Isolation", "React Query invalidation"
- COMMENTS.md, DEVELOPMENT_GUIDELINES.md APPLICATI.
Riferimento codice: ciocc/main:lib/services/pensionContributionService.ts,
ciocc/main:lib/utils/pensionContributions.ts, ciocc/main:lib/hooks/usePensionContributions.ts.

Scope ESATTO:
1. firestore.rules: blocco pensionContributions (spec 01 §4). firestore.indexes.json: o i 2 indici
   (spec 01 §5) o — RACCOMANDATO — via no-orderBy + sort in memoria, nessun indice (documenta la scelta).
2. lib/services/pensionContributionService.ts: getPensionContributions, recordPensionContribution
   (TFR/employer → updateCashAssetBalance; voluntary → transfer+reconcile+contributo con linkedExpenseId),
   deletePensionContribution (storno esatto). removeUndefinedDeep prima di ogni write.
3. lib/utils/pensionContributions.ts (rollup puro) + lib/hooks/usePensionContributions.ts +
   queryKeys.pensionContributions (invalidazione tripla: pensionContributions.all + assets.all + dashboard.overview).
4. Test: __tests__/pensionContributions.test.ts e __tests__/pensionContributionService.test.ts (spec 03 §5).

Gate: npx tsc --noEmit + le due suite + npx vitest run __tests__/updateCashAssetBalancesAtomic.test.ts
(regressione area transfer). A fine lavoro FERMATI, ricorda che le rules/indici richiedono
`firebase deploy --only firestore:rules,firestore:indexes`, riepiloga COSA/COME testare, ATTENDI conferma.
Branch: feature/pension-fund-p1; PR verso develop.
```
