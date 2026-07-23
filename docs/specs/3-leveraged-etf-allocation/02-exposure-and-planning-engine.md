# 02 — Motore esposizione + base nozionale + planner instrument-aware (col bug fix)

Riferimento fedele: `ciocc/main:lib/utils/assetExposureUtils.ts`,
`ciocc/main:lib/utils/leverageAwareAllocationUtils.ts`, `ciocc/main:lib/services/assetAllocationService.ts`.
Moduli puri: **zero import Firebase** (l'esposizione importa solo `calculateAssetValue`, che è pura).

## 1. `lib/utils/assetExposureUtils.ts` (pure) — L0

```ts
export interface ExposureComponent { assetClass: string; subCategory?: string; marketValue: number; notionalValue: number }

/** Espande un asset in componenti per-classe con market e nozionale. */
export function expandAssetExposure(asset: Asset): ExposureComponent[]
export function calculatePortfolioLeverage(assets: Asset[]): number   // Σnotional / Σmarket (1 se market=0)
```

`expandAssetExposure` (rif. fork, MA **senza special-case pensione** — D5/§pensione):
- **Composito** (`composition.length > 0`, incluso il `pensionFund` con composizione): una componente
  per leg → `marketValue = market × pct/100`, `notionalValue = market × pct/100 × leverage`.
- **Single-class** (no composition): un'unica componente in `asset.assetClass` →
  `notionalValue = market × leverage` (leveraged ETF), `market` se `leverageRatio` assente/1.
- **`pensionFund`**: nessun ramo dedicato. Se ha `composition` → look-through (come composito); se no
  → single-class in `TYPE_TO_CLASS['pensionFund']`. Il `frozen` lo tiene fuori dai PIANI (spec 02 §3),
  non dall'esposizione: pesa nel denominatore con le sue classi reali (vedi `2-pension-fund/04` §5).

Test `__tests__/assetExposure.test.ts`: leveraged ETF single-class (notional = market×leva);
composito con leva per-leg; asset normale (notional = market); portfolio leverage aggregato;
`pensionFund` con composizione 70/30 (look-through) e senza (single-class fallback).

## 2. Base nozionale in `assetAllocationService.ts` — L1

- **Base investibile = `tradable + frozen`** (invariante #5): gli `excluded` (via `allocationRole`)
  non entrano. Partizionare con `partitionByAllocationRole` PRIMA di calcolare lo snapshot.
- `calculateCurrentAllocationSnapshot`: per ogni classe accumula `marketValue` e `notionalValue`
  (sommando le `ExposureComponent`), più metadata `{ marketValue, notionalValue, leverageRatio,
  hasLeveragedExposure }`.
- `toLegacyAllocationResult` (base **%-market leverage-aware**):
  - `currentPercentage[c] = notionalValue[c] / marketTotal × 100` (somma a leva×100, NON
    `/ notionalTotal`). `marketTotal` = market della base investibile.
  - `targetPercentage[c]` = as-is (le % target sono già % market).
  - popola `marketValue`, `leverageRatio = notionalTotal / marketTotal`, `hasLeveragedExposure`.
  - il fixed-amount del cash si applica solo se il cash è incluso (non `excluded`).
- `deriveTargetLeverageRatio(targets) = Σtarget / 100` (read-only, spec 01 §5).
- `compareAllocations(assets, targets)` — firma **senza** parametro esclusioni (D1: le esclusioni
  sono già nell'`allocationRole` degli asset; la funzione partiziona internamente).

Test `__tests__/compareAllocations.test.ts`: current% su base market (non notional-total); target
che somma a 150 → leva 1.5; classe `excluded` fuori da num+denom; classe `frozen` nel denominatore
ma con delta che non genera trade a valle.

## 3. Planner instrument-aware — `lib/utils/leverageAwareAllocationUtils.ts` — L1

Rif. fork (riportare quasi integralmente: `InstrumentExposure`, `buildInstrumentExposures`,
`InstrumentTrade`, `LeverageAwarePlan`, `projectOntoBudgetBox`, `solve`, `planInstrument*`,
`buildPlanResult`, `LEVERAGE_TIEBREAKER_WEIGHT`). Modifiche rispetto al fork:

### 3a. Candidati di trade = solo `tradable`
- `buildInstrumentExposures(tradableAssets)` costruisce i candidati (solo `tradable`).
- Le grandezze correnti passate a `solve` (`currentNotionalByAssetClass`, `currentNotionalTotal`,
  `currentMarketTotal`) si calcolano sulla base investibile **`tradable + frozen`** (§2): così il
  contributo nozionale dei `frozen` entra come costante nei residui e i trade lo compensano senza
  toccarlo. `currentMarketTotal` = market di `tradable + frozen`.
- `alias`: `displayTicker` già presente in `InstrumentExposure`/`InstrumentTrade` (rif. fork) →
  la lista trade mostra l'alias (integra con la spec `ticker-display-alias`).

### 3b. 🔴 BUG FIX (D5) — termine di classe su base market
Nel `solve` del fork:
```ts
// BUG: usa il totale NOZIONALE come base del target di classe
classConst[assetClass] = (currentNotionalByAssetClass[assetClass] ?? 0)
                       - targetFraction[assetClass] * currentNotionalTotal;   // ❌
```
`targetFraction[c] = target%/100` somma alla **leva** (es. 1.5), ed è % del **market**. Il target
nozionale di classe deve essere `targetFraction[c] × marketAfterTrade`, non `× currentNotionalTotal`
(che riscala per la leva *corrente* → sbagliato ogni volta che leva_corrente ≠ leva_target, e
comunque doppia la leva). **Fix**:
```ts
const marketAfterTrade = currentMarketTotal + budget;   // budget=0 Ribilancia, +amount Versa, −amount Preleva
classConst[assetClass] = (currentNotionalByAssetClass[assetClass] ?? 0)
                       - targetFraction[assetClass] * marketAfterTrade;        // ✅
```
Ora il termine di classe è coerente col termine di leva (che già usa `marketAfterTrade`):
`Σ_c targetFraction[c] × marketAfterTrade = targetLeverageRatio × marketAfterTrade`. Spostare il
calcolo di `marketAfterTrade` **prima** del loop dei `classConst`.

### 3c. Nuovo: `planInstrumentWithdrawal` (Preleva a leva)
Il fork ha solo Versa/Ribilancia; il branch ha anche **Preleva**. Aggiungere:
```ts
export function planInstrumentWithdrawal(
  assets, currentNotionalByAssetClass, currentNotionalTotal, currentMarketTotal,
  targetPercentageByAssetClass, amount, targetLeverageRatio?
): LeverageAwarePlan
```
Come `planInstrumentRebalance` ma `budget = −amount`, `lowerBounds = −marketValue` (si può vendere),
`upperBounds = 0` (nessun acquisto): vende verso il target mentre preleva. Riusa `solve`/`buildPlanResult`.

## 4. Integrazione con i planner esistenti + `allocationRole`

`ActionPlanner` (segmentato **Ribilancia/Versa/Preleva**) sceglie il motore in base a
`hasLeveragedExposure`:
- **Con leva** → `planInstrumentRebalance` / `planInstrumentContribution` / `planInstrumentWithdrawal`.
- **Senza leva** → i planner esistenti pro-rata del branch (`buildRebalancePlan` /
  `buildContributionPlan` / `buildWithdrawalPlan`, `PlanNode`). Comportamento identico a oggi
  (invariante #1).
- Gli strumenti passati al planner a leva = solo `tradable` (§3a); i `frozen` mai venduti (invariante
  #5) — coerente col `tradableByClass` che già cappa i sell nei planner pro-rata.

**Rendering** (`PlanRow`): il planner a leva restituisce `InstrumentTrade[]` piatto (livello
strumento), mentre i planner pro-rata producono `PlanNode` (classe→sotto→strumento). Per coerenza
visiva, adattare `InstrumentTrade[]` alla presentazione `PlanRow` — o come righe-strumento piatte
sotto un nodo "Operazioni consigliate", o raggruppate per classe dominante dello strumento
(`exposurePerEuro`). Scegliere UNA resa e documentarla; riusare `PlanRow`/il colore azione
(`useActionColors`) invece di un componente nuovo.

## 5. Test (gate L1)
- `__tests__/assetExposure.test.ts` (§1).
- `__tests__/compareAllocations.test.ts` (§2): base market, leva>1, frozen/excluded.
- `__tests__/leverageAwareAllocationUtils.test.ts`: **il caso del bug** — target che somma a 150 con
  leva corrente diversa dalla target → i trade portano il nozionale di classe al target market-based
  (verificare che con il fix il gap si chiude, col vecchio termine no); Ribilancia net-zero (Σx≈0);
  Versa Σx=amount, nessun sell; Preleva Σx=−amount, nessun buy; frozen mai nei candidati; convergenza
  del solver su una sequenza multi-strumento; tie-breaker leva a parità di fit.

---

## 6. Prompt di implementazione

**L0** (campi + classi + esposizione pura) — *Sonnet 5 alto*:
```text
Implementa la FASE L0 di "Allocazione a Leva". Prerequisiti: asset-transactions e pension-fund mergiate.
Leggi: docs/specs/README.md (D1-D5), docs/specs/3-leveraged-etf-allocation/README.md,
01-data-model.md §1-§3, 02-...engine.md §1. Riferimento: ciocc/main:lib/utils/assetExposureUtils.ts.
Scope: Asset.leverageRatio? (niente nuovo AssetType), AssetClass += trendFollowing/carry con TUTTI i
Record<AssetClass> esaustivi completati (grep prima), lib/utils/assetExposureUtils.ts pure
(expandAssetExposure SENZA special-case pensione; pensionFund composito/single-class),
__tests__/assetExposure.test.ts. Gate: npx tsc --noEmit + vitest assetExposure. FERMATI, SESSION_NOTES,
COSA/COME testare, ATTENDI conferma. Branch: feature/leverage-l0; PR develop.
```

**L1** (base nozionale + planner + BUG FIX) — *Opus 4.8 xhigh*:
```text
Implementa la FASE L1 di "Allocazione a Leva". Prerequisito: L0 mergiata.
Leggi: docs/specs/3-leveraged-etf-allocation/01-data-model.md §4-§5, 02-...engine.md §2-§5, AGENTS.md
(allocationRole, Cross-Component Metric Consistency). Riferimento:
ciocc/main:lib/services/assetAllocationService.ts, ciocc/main:lib/utils/leverageAwareAllocationUtils.ts.
Scope: (2) assetAllocationService base nozionale su tradable+frozen, toLegacyAllocationResult %-market
leverage-aware, deriveTargetLeverageRatio, compareAllocations senza param esclusioni, applyRebalanceBand
preserva marketValue/leverageRatio; (3) leverageAwareAllocationUtils.ts col BUG FIX §3b (classConst usa
marketAfterTrade), candidati solo tradable §3a, nuovo planInstrumentWithdrawal §3c; (4) ActionPlanner
sceglie motore per hasLeveragedExposure, resa InstrumentTrade[] via PlanRow.
IL BUG FIX §3b È OBBLIGATORIO E VERIFICATO DAL TEST del "caso del bug". Gate: npx tsc --noEmit +
compareAllocations + leverageAwareAllocationUtils + assetExposure. FERMATI, SESSION_NOTES, COSA/COME
testare, ATTENDI conferma. Branch: feature/leverage-l1; PR develop.
```
