# Alias di visualizzazione strumenti (`displayTicker`) — Spec

> Status: **SPEC — port dal fork `Ciocc128`, adattata a post `asset-transactions`** (2026-07-22).
> Feature additiva, basso rischio. Riferimento fedele: `ciocc/main:lib/utils/assetDisplay.ts` + lo
> sweep in `SESSION_NOTES` del fork (FEATURE 2).

## Obiettivo

Il `ticker` deve restare in formato Yahoo ("CL2.MI") perché il retrieve prezzi funzioni, ma è
rumoroso da leggere. L'utente può impostare un **alias** (`displayTicker`, es. "CL2") mostrato al suo
posto in **tutta** l'app. `getAssetDisplayTicker` è l'**unica** sorgente del fallback alias→ticker.

## Decisioni fissate

1. Il `ticker` resta immutato (formato Yahoo, usato per i prezzi). L'alias è puramente di
   visualizzazione. Alias vuoto/whitespace → fallback al ticker.
2. Un solo helper (`getAssetDisplayTicker`) risolve il fallback ovunque — mai inlinare `?? ticker`.

## 1. Dati + helper

`types/assets.ts`: `Asset.displayTicker?: string | null`, `AssetFormData.displayTicker?: string | null`.

`lib/utils/assetDisplay.ts` (rif. fork, riportare integralmente):
```ts
export interface DisplayTickerSource { ticker: string; displayTicker?: string | null }
export function getAssetDisplayTicker(asset: DisplayTickerSource): string
// alias = displayTicker?.trim(); alias.length>0 ? alias : ticker
```

## 2. `AssetDialog`

- Campo "Alias visualizzato" (schema Zod `displayTicker?`), gated come il `ticker` (nascosto per
  `cash`/`realestate`/`pensionFund`). Reset in **entrambi** i rami (edit + new) — enumerare (gotcha
  Dialog Form Reset).
- `assetService.updateAsset`: `displayTicker` undefined → `deleteField()` (clearabile; l'unico
  chiamante reale è AssetDialog con formData completo → sicuro).

## 3. Interazione con `asset-transactions` (importante)

`asset-transactions` introduce `updateAssetMetadata` (`Omit<AssetFormData,'quantity'|'averageCost'>`)
per l'edit dei ledger type. `displayTicker` è un campo **metadata** → per i ledger type l'edit passa
da `updateAssetMetadata`, che **deve** gestire `displayTicker` come `updateAsset` (undefined →
`deleteField()`). Verificarlo esplicitamente (è incluso in `AssetMetadataFormData`).

Inoltre lo sweep (§4) deve coprire **anche le superfici nuove del registro operazioni**:
`TransactionDialog` (asset preselezionato), `AssetMovementsDialog` (header + righe), e la lista
per-asset di Rendimenti / posizioni chiuse che consuma `dividends/stats`.

## 4. Sweep (usare `getAssetDisplayTicker`)

Dal fork + adattamenti al branch:
`AssetCard`, `AssetManagementTab`, `AssetPriceHistoryTable` (+ `displayTicker` in
`AssetPriceHistoryRow`/builder), `TaxCalculatorModal`, `DividendDialog`, `GoalDetailCard`,
`AssetAssignmentDialog` (+ ricerca per alias), `GoalBasedInvestingTab`→`GoalsHero`
(`FreeAsset.ticker` = alias), PDF (`pdfDataService` `AssetRow`), `RebalancePanel`/`ContributionPanel`/
`WithdrawalPanel` (+ `displayTicker` in `InstrumentExposure`/`InstrumentTrade` — vedi
`leveraged-etf-allocation`), `MonthlyAssetBreakdownSection` (resolver `assetId→alias` dagli asset live).

**Nuove superfici (post-branch / post-asset-transactions)**: `TransactionDialog`,
`AssetMovementsDialog`, lista per-asset Rendimenti.

**Distribuzione per Asset**: il fork correggeva la pie label in
`chartService.prepareAssetDistributionData`. Il branch ha **rimosso le pie** (redesign
`CompositionList`/`CompositionBar`): applicare l'alias alla label della relativa
`CompositionList`/composizione asset (Panoramica), non a una pie inesistente.

**Lasciati grezzi (intenzionale)**: input di modifica ticker (`CreateManualSnapshotModal`), logging
scraping (`DividendTrackingTab`), costituenti benchmark (`BenchmarkComparisonSection`),
**`ExposureSection`** (look-through server-derived con cache 24h — plumbing rischioso; NOTA per il
futuro).

## 5. Test / verifica
- `npx tsc --noEmit` pulito.
- Unit su `getAssetDisplayTicker`: alias impostato → alias; alias vuoto/whitespace → ticker; assente → ticker.
- Manuale: imposta un alias su un asset → verifica che compaia in Patrimonio, Allocazione (lista
  trade), Dividendi, PDF, breakdown Storico, e nelle superfici del registro operazioni; il retrieve
  prezzi continua a funzionare (usa `ticker`).

## 6. Prompt di implementazione

> *Sonnet 5 alto.* Additiva, prescrittiva. Può girare in qualunque momento dopo `asset-transactions`.
```text
Implementa la feature "Alias di visualizzazione strumenti (displayTicker)". Prerequisito:
asset-transactions mergiata. Leggi: docs/specs/4-ticker-display-alias.md (INTEGRALE), AGENTS.md
(Dialog Form Reset, Firestore Optional Field Deletion, updateAssetMetadata di asset-transactions),
DESIGN.md. Riferimento: ciocc/main:lib/utils/assetDisplay.ts e lo sweep FEATURE 2 in
ciocc/main:SESSION_NOTES.md.
Scope ESATTO: Asset/AssetFormData += displayTicker; lib/utils/assetDisplay.ts (getAssetDisplayTicker);
AssetDialog campo alias (gated come ticker, reset entrambi i rami); updateAsset E updateAssetMetadata
gestiscono displayTicker (undefined→deleteField); lo sweep §4 (incluse le superfici del registro
operazioni e la CompositionList al posto della vecchia pie); test unit su getAssetDisplayTicker.
Non toccare le superfici "lasciate grezze" §4. Gate: npx tsc --noEmit + build. FERMATI, SESSION_NOTES,
COSA/COME testare, ATTENDI conferma. Branch: feature/ticker-display-alias; PR develop.
```
