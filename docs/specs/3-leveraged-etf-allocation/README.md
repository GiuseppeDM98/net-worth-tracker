# Allocazione a Leva (ETF a leva) — Specification Index

> Status: **IMPLEMENTATA (L0→L2, 2026-07-24)** — riprogettata dal fork `Ciocc128`, adattata al
> branch attuale (allocationRole, CompositionBar/List, planner Preleva) e a post `asset-transactions`
> (spec scritta 2026-07-22). Vedi CLAUDE.md → Current Status e AGENTS.md → *Allocazione a Leva —
> Fasi L0/L1/L2*. Il **bug fix D5** è più profondo della prima stesura (`classConst` **e**
> `classCoeff`) — vedi `02-…engine.md §3b`.
> Deliverable: supportare portafogli con esposizione nozionale > patrimonio market (ETF a leva /
> compositi), con dualità market/nozionale in UI, target che sommano a >100% (= leva target), e un
> motore Versa/Ribilancia/Preleva **instrument-aware** — col bug del solver del fork **risolto**.

## Perché esiste

Con ETF a leva o compositi, l'esposizione nozionale (rischio) supera il valore market. Oggi l'app
non mostra la leva, etichetta il totale nozionale come "market", e i piani assumono acquisti 1x
(chiudere un gap nozionale con € market funziona 1:1 solo su strumenti non a leva). Questa feature
separa market da nozionale end-to-end e ragiona sugli strumenti reali.

## Decisioni fissate (concordate con l'utente — NON rilitigare)

Vedi anche `docs/specs/README.md` → *Decisioni di riconciliazione condivise*.

1. **Solo il campo `Asset.leverageRatio?`, nessun `AssetType 'leveragedEtf'`** (D4). La matematica
   dipende da `leverageRatio` + `composition`, mai dal tipo. Il campo si mostra in AssetDialog per il
   tipo `etf`. → *Da confermare se preferisci comunque un tipo dedicato.*
2. **Nuove `AssetClass 'trendFollowing'` e `'carry'`** (D3). Ogni `Record<AssetClass,…>` esaustivo va
   esteso (vedi spec 01 §"Union widening").
3. **Esclusione liquidità/immobili dalla base = `allocationRole: 'excluded'` per-asset** (D1).
   **Nessun** toggle globale `excludeCash/RealEstateFromAllocation`, **nessun** `getExcludedClasses`.
4. **Modello target riformulato**: le % target sono **% del capitale investito (market)** e
   rappresentano l'esposizione nozionale desiderata per classe. Possono sommare a >100%; la somma
   **È** la leva target. Validazione **`>= 100`** (100 = no leva). `targetLeverageRatio` = derivato
   (`somma target / 100`), read-only.
5. **Fondo pensione**: guardato attraverso la `composition` in `expandAssetExposure` (come un
   composito), ma `frozen` → mai in un piano (vedi `2-pension-fund/04` §5). Nessun special-case tipo.
6. **Bug del solver risolto** (D5): il termine di classe usa la base **market** (`currentMarketTotal
   + budget`), non `currentNotionalTotal`. Spec 02 §"Bug fix".
7. **Base della leva = capitale investibile** (`tradable + frozen`, esclusi gli `excluded`): cash a
   leva 1 diluirebbe la leva verso 1 e nasconderebbe la vera leva degli strumenti.

## Glossario

| Termine | Significato |
| --- | --- |
| **Market value** | Valore di mercato dell'asset (`calculateAssetValue`). |
| **Notional value** | Esposizione nozionale = `marketValue × leverageRatio` (single-class) o per-leg (composito). |
| **Leva** | `notionalTotal / marketTotal` sulla base investibile. |
| **Target %** | % del capitale market; per classe = esposizione nozionale desiderata. Somma = leva target × 100. |
| **Instrument-aware** | Il planner ragiona sugli strumenti reali (vettore di esposizione per €), non sulla classe astratta. |

## File della spec

| File | Contenuti |
| --- | --- |
| [`01-data-model.md`](01-data-model.md) | `Asset.leverageRatio`, classi `trendFollowing`/`carry`, `ExposureComponent`, arricchimento `AllocationResult`, settings target `>=100` / leva derivata, esclusioni via `allocationRole`. |
| [`02-exposure-and-planning-engine.md`](02-exposure-and-planning-engine.md) | `assetExposureUtils.ts` (pure), `assetAllocationService` base nozionale, planner instrument-aware `leverageAwareAllocationUtils.ts` (Versa/Ribilancia/**Preleva**) **col bug fix**, integrazione con i planner esistenti e `allocationRole`. |
| [`03-ui-and-settings.md`](03-ui-and-settings.md) | Hero due numeri + chip leva, CompositionBar leveraged, Settings validazione `>=100` + leva derivata, AssetDialog `leverageRatio`, integrazione ActionPlanner/`PlanRow`. |
| [`04-impacts-testing-rollout.md`](04-impacts-testing-rollout.md) | Impatti, test, rollout, docs. |

## Invarianti di sistema

1. **Leva = 1 → UI e numeri identici a oggi.** Il ramo a numero singolo dell'hero, la composition bar
   e i piani restano invariati quando `hasLeveragedExposure === false`.
2. **`expandAssetExposure` è l'unica sorgente di market/notional.** Single-class leveraged ETF:
   `notional = market × leverage`; composito: leva per-leg; asset normale: `notional = market`.
3. **`compareAllocations` gira su base nozionale.** Current% = `notional_classe / market_totale`
   (somma a leva×100); target as-is; delta in p.p. → COMPRA/VENDI/OK come oggi.
4. **`computeBalanceScore` invariato** (Σ|drift|/2). Il gap di leva confluisce già nel Σ|drift|; la
   leva corrente vs target è mostrata a parte come informazione, non altera lo score.
5. **I piani non vendono mai `frozen` né toccano `excluded`.** Il planner instrument-aware riceve gli
   strumenti `tradable` come candidati di trade; la base nozionale (denominatore) include
   `tradable + frozen`; gli `excluded` non entrano affatto.
6. **Il solver è deterministico e convergente.** QP convessa (proiezione budget-box + gradiente
   proiettato con backtracking); il termine di classe è market-based (bug fix), coerente col termine
   di leva.

## Fasatura

| Fase | Scope | Gate | Stato |
| --- | --- | --- | --- |
| **L0** | `leverageRatio`, classi `trendFollowing`/`carry` (+ Record widening), `assetExposureUtils.ts` pure + test (spec 01 + spec 02 §1) | `tsc` + `vitest run __tests__/assetExposure.test.ts` | ✅ fatto |
| **L1** | `assetAllocationService` base nozionale + target `>=100` + leva derivata; planner instrument-aware **col bug fix** + Preleva; test (spec 02 §2-4) | `tsc` + `compareAllocations`/`leverageAwareAllocationUtils` verdi | ✅ fatto (bug fix D5 completo: `classConst`+`classCoeff`) |
| **L2** | UI: hero due numeri, CompositionBar, Settings, AssetDialog `leverageRatio`, integrazione ActionPlanner/`InstrumentTradeList` (spec 03) | `tsc` + test manuale (incluso il flusso Versa/Ribilancia/Preleva a leva) | ✅ fatto |
| **L3** | Impatti, regressione, docs (spec 04) | `tsc` + suite aree | ✅ regressione (69 file/1215 test) + docs in questa sessione |

**Modello consigliato**: **Opus 4.8** per L1 (base nozionale + QP + bug fix — correttezza). Sonnet 5
per L0/L2/L3.

## Interazione con `asset-transactions` e con `pension-fund`

- **asset-transactions**: ortogonale. `leverageRatio` moltiplica il nozionale; il `pricePerUnit`/PMC
  del registro è per-quota e indipendente. Un ETF a leva resta un ledger type (`etf`) normale.
- **pension-fund**: fare la leva **dopo** la pensione. `expandAssetExposure` gestisce il `pensionFund`
  come composito (look-through) senza special-case; il `frozen` lo tiene fuori dai piani. La base
  investibile dei calcoli leva = `tradable + frozen` (il fondo pesa nel denominatore, non nei trade).
