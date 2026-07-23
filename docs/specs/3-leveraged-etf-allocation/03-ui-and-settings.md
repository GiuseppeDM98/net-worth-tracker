# 03 — UI e Settings — L2

Leggi **DESIGN.md**. Copy italiano, commenti inglese. `font-mono` per i numeri. Segno via token.
Riferimento: `ciocc/main:components/allocation/{AllocationHero,AllocationCompositionBar,ActionPlanner,
RebalancePanel,ContributionPanel}.tsx`, `app/dashboard/settings/page.tsx`, `components/assets/AssetDialog.tsx`.
**Attenzione**: il fork usa componenti Allocazione **pre-redesign**; il branch ha `CompositionBar`/
`CompositionList` (`components/ui/composition-*`) e i planner `PlanRow`/`PlanNode`. Scrivere sopra i
primitivi del branch, non reintrodurre quelli del fork.

## 1. `AllocationHero` — dualità market/nozionale

- **`hasLeveragedExposure === false`** → hero **identico a oggi** (un solo numero, invariante #1).
- **Con leva** → **due numeri paritari**:
  - "Patrimonio investito" (market, `marketValue`)
  - "Esposizione nozionale" (`notionalValue`)
  - chip **`Leva X.XX×`** tra i due (corrente · target quando differiscono).
  - **Mobile**: impilare i due numeri — `grid-cols-1 tablet:grid-cols-2` (il fork aveva un bug di
    sovrapposizione su ~390px risolto proprio così; non reintrodurlo).
- Quando ci sono `excluded`, la label market è "Patrimonio investito" (base investibile, non l'intero
  patrimonio) + striscia/nota "Esclusi dall'allocazione" già presente nel branch (dal lavoro
  `allocationRole`) — riusarla, non duplicarla.

## 2. `AllocationCompositionBar`

- Larghezze = share **nozionale** (mix); etichette = **% a leva** (`currentPercentage`, somma a
  leva×100); caption "su capitale investito · leva X×" **quando leva>1**.
- Senza leva: comportamento e caption identici a oggi. Costruire sopra `components/ui/composition-bar.tsx`.

## 3. Settings (`app/dashboard/settings/page.tsx`)

- **Validazione `>= 100`** (non `== 100`): 100 = no leva, >100 = leva. `isValidTotal` aggiornato.
- Rimuovere il cap `max=100` sugli input classe (una singola classe a leva può superare 100).
- **Leva target derivata read-only**: mostrare `derivedTargetLeverage = total/100` (es. "Leva target
  1,50×"); rimuovere l'input manuale della leva del fork.
- **`calculateTotal`** salta le classi senza target; le nuove classi `trendFollowing`/`carry` hanno il
  loro input nella griglia (spec 01 §2 union widening).
- **NIENTE** card "Base di Allocazione" con i 2 toggle esclusione del fork (D1). Le esclusioni
  liquidità/immobili si fanno **per-asset** in AssetDialog via `allocationRole: 'excluded'` (già nel
  branch). Se serve, aggiungere solo una nota informativa che rimanda al ruolo per-asset.
- Payload: scrive `targetLeverageRatio = total/100` (cache) + i target per-classe.

## 4. `AssetDialog` — campo `leverageRatio`

- Per il tipo `etf`: input opzionale "Leva" (numero ≥ 1, default vuoto = 1). Schema zod, reset
  edit+new (enumerare — gotcha reset), assemblaggio submit in `leverageRatio`. Suffisso "×".
- `assetService.updateAsset`: `leverageRatio` undefined → `deleteField()` (clearabile) — verificare
  che il campo non venga cancellato dagli edit metadata del registro operazioni: `leverageRatio` è un
  campo metadata, quindi per i ledger type passa da `updateAssetMetadata` (asset-transactions) — deve
  essere incluso in `AssetMetadataFormData` (`Omit<AssetFormData,'quantity'|'averageCost'>` lo
  mantiene). Confermare che `updateAssetMetadata` gestisca `leverageRatio` come gli altri metadata.
- Gated come il ticker (nascosto per cash/realestate/pensionFund).

## 5. `ActionPlanner` / `PlanRow` — integrazione motore a leva

- `ActionPlanner` resta il segmentato **Ribilancia/Versa/Preleva** del branch. Quando
  `hasLeveragedExposure`, alimenta i pannelli col motore instrument-aware (spec 02 §4):
  `RebalancePanel`/`ContributionPanel`/`WithdrawalPanel` renderizzano gli `InstrumentTrade[]`
  adattati a `PlanRow` (spec 02 §4 "Rendering"). Senza leva, i pannelli usano i `PlanNode` pro-rata
  di oggi. Colori azione via `useActionColors`.
- La lista trade mostra l'**alias** (`displayTicker`) via `getAssetDisplayTicker` (integra
  `ticker-display-alias`).

## 6. Demo & shared account
Owner-scoped; mutazioni (target in Settings, `leverageRatio` in AssetDialog) demo-gated.

---

## 7. Prompt — FASE L2

> *Sonnet 5 alto* (Opus se l'integrazione ActionPlanner risulta delicata).
```text
Implementa la FASE L2 (UI+Settings) di "Allocazione a Leva". Prerequisiti: L0+L1 mergiate.
Leggi: docs/specs/3-leveraged-etf-allocation/03-ui-and-settings.md, DESIGN.md, AGENTS.md (Layout Tokens,
Dialog Reset, useWatch, breakpoint tablet). Riferimento fork:
ciocc/main:components/allocation/*, app/dashboard/settings/page.tsx — MA scrivi sopra i primitivi del
branch (composition-bar/list, PlanRow), non reintrodurre i componenti pre-redesign del fork.
Scope: AllocationHero due numeri + chip leva (mobile grid-cols-1 tablet:grid-cols-2, single-number
identico senza leva); AllocationCompositionBar leveraged; Settings validazione >=100 + leva derivata
read-only + niente toggle esclusione (D1); AssetDialog input leverageRatio per etf (metadata, coerente
con updateAssetMetadata); ActionPlanner/Panels alimentano il motore a leva con resa via PlanRow + alias.
Gate: npx tsc --noEmit. FERMATI, SESSION_NOTES, COSA/COME testare (flusso Versa/Ribilancia/Preleva a
leva + hero mobile), ATTENDI conferma. Branch: feature/leverage-l2; PR develop.
```
