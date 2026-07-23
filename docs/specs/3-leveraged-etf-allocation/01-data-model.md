# 01 — Data model: leverageRatio, classi, esposizione, settings

## 1. `Asset.leverageRatio` — `types/assets.ts` (D4: campo, niente tipo)

```ts
// Su Asset e AssetFormData:
/** Per ETF a leva: 2 = 2x, 3 = 3x, 1 = normale. Assente ⇒ trattato come 1 (nessuna leva). */
leverageRatio?: number;
```

- **Nessun `AssetType 'leveragedEtf'`**: la matematica dell'esposizione dipende SOLO da
  `leverageRatio` + `composition`. Il campo si mostra in `AssetDialog` per il tipo `etf` (spec 03 §4).
- Un ETF a leva resta un ledger type `etf` di `asset-transactions`: `leverageRatio` è indipendente
  da `quantity`/`averageCost`/`pricePerUnit` (quelli sono per-quota; la leva moltiplica il nozionale).
  → *Se preferisci un tipo dedicato `leveragedEtf`, va aggiunto a `LEDGER_ASSET_TYPES`, `TYPE_TO_CLASS`
  e alla migrazione: più superficie. Raccomandazione: solo il campo.*

## 2. Nuove `AssetClass 'trendFollowing'` e `'carry'` (D3) — `types/assets.ts`

```ts
export type AssetClass = 'equity' | 'bonds' | 'crypto' | 'realestate' | 'cash' | 'commodity'
                       | 'trendFollowing' | 'carry';
```

### Union widening — patchare TUTTI i `Record<AssetClass,…>` esaustivi
Aggiungere una chiave a `AssetClass` fa fallire `tsc` in ogni Record esaustivo. Cercare e completare
(lista dal fork + dal branch attuale):
- `lib/utils/allocationUtils.ts`: `ASSET_CLASS_LABELS`, `ASSET_CLASS_CHART_INDEX`.
- `lib/constants/colors.ts`: `getAssetClassCssVar` / mappa colori-classe (aggiungere `--chart-*`).
- `lib/utils/assetUtils.ts`: `formatAssetClassName`.
- `app/dashboard/settings/page.tsx`: griglia target per-classe (input + default).
- `lib/constants/defaultSubCategories.ts`: sotto-categorie di default per le nuove classi.
- `lib/utils/goalTrajectory.ts`: eventuale mappa per-classe.
- `components/goals/AllocationComparisonBar.tsx`: mappa per-classe.
- Qualunque altro `Record<AssetClass, …>` / `switch(assetClass)` esaustivo (`grep` prima di iniziare).

Label italiane suggerite: `trendFollowing → "Trend Following"`, `carry → "Carry"`.

## 3. Modello di esposizione — `ExposureComponent`

```ts
export interface ExposureComponent {
  assetClass: string;
  subCategory?: string;
  marketValue: number;
  notionalValue: number;   // marketValue × leverageRatio (single) o per-leg (composito)
}
```

Definito in `lib/utils/assetExposureUtils.ts` (spec 02 §1). Nessun campo su Firestore: è un derivato.

## 4. Arricchimento `AllocationResult` — `types/assets.ts`

Il risultato di `compareAllocations` (o l'equivalente del branch) porta i metadati leva per la UI:

```ts
// aggiungere all'AllocationResult / snapshot corrente:
marketValue: number;            // totale market della base investibile
leverageRatio: number;          // notionalTotal / marketTotal (base investibile)
hasLeveragedExposure: boolean;  // leverageRatio > 1 + epsilon
// currentPercentage per classe = notional_classe / market_totale  (somma a leva×100)
```

**Nessun** `excludedClasses`/`AllocationExclusions` del fork (D1: le esclusioni sono per-asset via
`allocationRole`, non per-classe).

> **Nota compatibilità con `applyRebalanceBand`**: il branch ha già `applyRebalanceBand`. Deve
> **preservare** i nuovi campi `marketValue`/`leverageRatio` nel risultato bandizzato (altrimenti
> l'hero perde la leva dopo l'applicazione della banda — bug noto nel fork, evitarlo).

## 5. Settings — target `>= 100` e leva derivata — `AssetAllocationSettings`

- **Rimuovere il concetto di target che somma esattamente a 100**: validazione `>= 100`
  (100 = no leva; >100 = leva). Rimuovere il cap `max=100` sugli input classe (una singola classe a
  leva può superare 100).
- **`targetLeverageRatio` = derivato**, read-only: `deriveTargetLeverageRatio(targets) = Σtarget/100`.
  Smettere di persistere il valore manuale del fork; in load, derivarlo. Il payload di salvataggio
  può comunque scrivere `targetLeverageRatio = total/100` come cache (coerente con l'optimizer).
- **Nessun** `excludeCashFromAllocation`/`excludeRealEstateFromAllocation` (D1). La card "Base di
  Allocazione" del fork (2 toggle esclusione) **non** si porta; le esclusioni si fanno per-asset in
  AssetDialog (`allocationRole`).
- Le classi con target impostato entrano nel confronto; una classe senza target resta fuori dal 100%
  come oggi.

## 6. Cosa NON cambia

- `computeBalanceScore` (invariante #4): firma e logica invariate.
- `asset-transactions`: nessun impatto sui tipi del registro.
- La logica `allocationRole` (`resolveAllocationRole`/`partitionByAllocationRole`) resta la sorgente
  unica di esclusione — questa feature la **usa**, non la duplica.

---

## 7. Prompt — vedi fasi
§1-§2 (campo + classi + Record widening) e §3 (ExposureComponent) sono in **L0** (prompt in fondo a
`02-exposure-and-planning-engine.md`). §4-§5 (AllocationResult + settings) sono in **L1** (stesso
file, prompt L1).
