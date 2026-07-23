# 01 — Data Model, AssetType, Collection, Rules, Validation

## 1. Domain types — new file `types/pension.ts`

Riferimento fedele: `ciocc/main:types/pension.ts`. Riportare integralmente (i commenti TEACHER/WHY
sono buona documentazione), con **una sola differenza**: dove il fork scrive `AssetType 'pension'`
usare `'pensionFund'` (D2).

```ts
/** Origine di un contributo. Solo voluntary+employer sono deducibili e consumano il tetto; TFR no. */
export type PensionContributionNature = 'tfr' | 'voluntary' | 'employer';
export type ContributionSource = PensionContributionNature;

export const DEDUCTIBLE_PENSION_NATURES: readonly PensionContributionNature[] = ['voluntary', 'employer'];
export function isDeductibleSource(source: ContributionSource): boolean;   // voluntary|employer

/** Evento datato per-fondo, collection dedicata `pensionContributions` (NON un Expense). */
export interface PensionContribution {
  id: string;
  userId: string;
  assetId: string;                 // il fondo (AssetType 'pensionFund')
  source: ContributionSource;
  amount: number;                  // magnitudine positiva EUR
  date: Date;
  taxYear: number;                 // anno di competenza (default: anno solare di date)
  deductible: boolean;             // derivato da source, persistito per query per-anno
  notes?: string;
  linkedExpenseId?: string;        // presente SOLO per volontario (transfer collegato)
  sourceCashAssetId?: string;      // conto di provenienza del volontario (per lo storno)
  createdAt: Date;
}

/** Blocco opzionale su Asset, popolato solo per i fondi. Come bondDetails estende i bond. */
export interface PensionFundDetails {
  provider: string;
  isin?: string;
  navFrequency?: 'monthly' | 'quarterly' | 'manual';
  // Date come stringhe ISO 'YYYY-MM-DD' (matchano l'input HTML date, round-trip Firestore pulito).
  enrollmentDate?: string;         // adesione alla previdenza complementare → anni di iscrizione
  firstEmploymentDate?: string;    // prima occupazione → finestra 5 anni extra-deducibilità
  isFirstEmploymentPost2007?: boolean;
  unlockDate?: string;             // data di sblocco capitale (FIRE lock-in)
  currentBenefitTaxRate?: number;  // aliquota di prestazione derivata, cache per FIRE
  cumulativeDeductibleContributions?: number;    // cache; fonte di verità = PensionContribution
  cumulativeNonDeductibleContributions?: number;
  cumulativeTfr?: number;
}

/** Input al calcolo deduzione/plafond per un singolo anno (vedi spec 02). */
export interface PensionDeductionInput {
  targetYear: number;
  enrollmentYear: number;
  isFirstJobPost2007: boolean;
  deductibleContribByYear: Record<number, number>;   // anno → contributi deducibili (voluntary+employer)
}

export interface PensionDeductionState { /* … vedi spec 02 §output … */ }
```

Checklist-comment su `PensionContributionNature` (stile COMMENTS.md): aggiungere una natura richiede
aggiornare `isDeductibleSource`, `DEDUCTIBLE_PENSION_NATURES`, il selettore in
`PensionContributionDialog` e il rollup in `lib/utils/pensionContributions.ts`.

## 2. `AssetType 'pensionFund'` — `types/assets.ts`

- Estendere la union: `AssetType = … | 'pensionFund'`. **Nessuna** aggiunta a `AssetClass` (D2).
- `Asset` guadagna `pensionFundDetails?: PensionFundDetails` (come `bondDetails`); `AssetFormData`
  guadagna `pensionFundDetails?`.
- `TYPE_TO_CLASS`: un fondo non ha una classe "propria" (la sua esposizione è la sua `composition`).
  Default `TYPE_TO_CLASS['pensionFund'] = 'equity'` come fallback quando `composition` è assente,
  ma la UI incoraggia sempre a compilare la composizione. Documentare la scelta con un Why-comment.
- **`allocationRole` default per i fondi**: alla creazione di un `pensionFund`, se l'utente non
  sceglie diversamente, `allocationRole = 'frozen'` (D1). Enunciare la regola nel form (spec 04 §1).
- **`asset-transactions`**: `pensionFund` NON va aggiunto a `LEDGER_ASSET_TYPES`. Verificare che
  `isLedgerAssetType('pensionFund') === false` — il ramo AssetDialog read-only qty/PMC e il trigger
  migrazione NON devono attivarsi per i fondi (restano sul path manuale come `realestate`).

### Union widening — gotcha `Record<AssetClass, …>`
La spec `3-leveraged-etf-allocation/01` aggiunge `trendFollowing`/`carry` ad `AssetClass` (D3). La
pensione **non** tocca `AssetClass`, quindi P0 pensione non ha il problema dei Record esaustivi; ma
se le due feature si sviluppano insieme, cercare tutti gli usi esaustivi (`settings/page.tsx`,
`defaultSubCategories.ts`, `goalTrajectory.ts`, `AllocationComparisonBar.tsx`, `colors.ts`,
`assetUtils.formatAssetClassName`) — vale per la spec leva, non per questa.

## 3. Firestore collection `pensionContributions` (nuova, flat)

- Top-level flat con campo `userId` — convenzione `expenses`/`dividends`.
- Doc IDs: auto-ID Firestore.
- Date come `Timestamp`; `toDate()` in lettura.
- Query: `where('userId','==',ownerId)` opzionalmente `+ where('assetId','==',assetId)` **+
  `orderBy('date','desc')`**. Questa combinazione richiede un indice composito → §5.

## 4. Firestore rules — `firestore.rules`

Clone del blocco `expenses` (scrittura client consentita al proprietario/membri — il service usa il
client SDK, come `dividends`; non serve Admin API perché non c'è replay atomico multi-doc come nel
registro operazioni — l'atomicità conto↔fondo del volontario è già garantita da
`reconcileTransferCreate`).

```
// Contributi al fondo pensione: leggibili e scrivibili da proprietario/membri (client SDK).
match /pensionContributions/{contributionId} {
  allow read:  if canAccess(resource.data.userId);
  allow create: if canAccess(request.resource.data.userId);
  allow update, delete: if canAccess(resource.data.userId);
}
```

**Deploy reminder**: `firebase deploy --only firestore:rules,firestore:indexes` (gotcha shared-account:
le rules sono inerti finché non deployate). Metterlo nel riepilogo di test della fase P1.

## 5. Indici — `firestore.indexes.json`

Due indici compositi (query di §3):

```json
{ "collectionGroup": "pensionContributions", "queryScope": "COLLECTION",
  "fields": [ { "fieldPath": "userId", "order": "ASCENDING" }, { "fieldPath": "date", "order": "DESCENDING" } ] },
{ "collectionGroup": "pensionContributions", "queryScope": "COLLECTION",
  "fields": [ { "fieldPath": "userId", "order": "ASCENDING" }, { "fieldPath": "assetId", "order": "ASCENDING" }, { "fieldPath": "date", "order": "DESCENDING" } ] }
```

> **Alternativa senza indici** (valutare in P1): come `getUserSnapshotsAdmin` e come la spec
> `1-asset-transactions/01 §2`, si può usare SOLO filtri di uguaglianza e ordinare in memoria
> (i volumi sono ~12–24 doc/anno). Se si sceglie questa via, rimuovere l'`orderBy` dalla query e
> NON aggiungere gli indici. **Raccomandazione**: no-orderBy + sort in memoria (meno superficie di
> deploy, coerente con la spec registro operazioni). Documentare la scelta.

## 6. Validazione

I contributi passano dal client SDK (non da una route), quindi la validazione è client-side nel
service/dialog: `amount > 0`; `source ∈ {tfr,voluntary,employer}`; volontario ⇒ `sourceCashAssetId`
presente e `assetClass === 'cash'`; `taxYear` intero plausibile (default anno di `date`). Nessuno
schema zod server (non c'è route). `removeUndefinedDeep` prima di ogni write.

## 7. Cosa NON cambia

- `MonthlySnapshot.byAsset` invariato: il fondo appare come qualunque asset (valore = `quantity`).
- `AssetClass` invariato da questa feature.
- Nessun impatto su `asset-transactions`: il fondo non entra nel registro.

---

## 8. Prompt di implementazione

Nessun prompt standalone: §1-2 (tipi + AssetType) sono in **P0** insieme al motore fiscale (prompt
in fondo a `02-tax-engine.md`); §3-6 (collection/rules/indici) sono in **P1** (prompt in fondo a
`03-contributions-service-and-api.md`).
