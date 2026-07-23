# 04 — Impatti, testing, rollout

## 1. Tabella impatti

### Intatti per costruzione (verificare, non modificare)

| Superficie | Perché è safe |
| --- | --- |
| Patrimonio net worth / Panoramica | il net worth è **market** (valore reale); la leva è solo esposizione, non aumenta il patrimonio |
| Snapshot / Storico / TWR / Rendimenti | leggono valori market; il nozionale non entra negli snapshot |
| `asset-transactions` | `leverageRatio` è ortogonale a quantity/PMC/pricePerUnit |
| Cashflow / budget | nessun impatto |
| `computeBalanceScore` | invariato (invariante #4) |
| Fondo pensione | `expandAssetExposure` lo gestisce come composito; `frozen` fuori dai piani |

### Toccati (lista completa)

| File | Cambio | Fase |
| --- | --- | --- |
| `types/assets.ts` | `leverageRatio?`, `AssetClass` += trendFollowing/carry, `AllocationResult` arricchito | L0/L1 |
| Record<AssetClass> esaustivi (colors, allocationUtils label/chartIndex, assetUtils, settings, defaultSubCategories, goalTrajectory, AllocationComparisonBar) | +2 chiavi | L0 |
| `lib/utils/assetExposureUtils.ts` | nuovo (pure) | L0 |
| `lib/services/assetAllocationService.ts` | base nozionale, target %-market, leva derivata, esclusioni via allocationRole | L1 |
| `lib/utils/leverageAwareAllocationUtils.ts` | nuovo planner + **bug fix** + Preleva | L1 |
| `lib/utils/allocationUtils.ts` | `applyRebalanceBand` preserva metadata leva; `compareAllocations` firma | L1 |
| `app/dashboard/allocation/page.tsx` | passa metadata leva all'hero, sceglie motore | L1/L2 |
| `components/allocation/{AllocationHero,AllocationCompositionBar,ActionPlanner,RebalancePanel,ContributionPanel,WithdrawalPanel}.tsx` | UI leva + resa InstrumentTrade | L2 |
| `app/dashboard/settings/page.tsx` | validazione >=100, leva derivata, niente toggle esclusione | L2 |
| `components/assets/AssetDialog.tsx` | input `leverageRatio` per etf | L2 |

## 2. Checklist di regressione

1. `npx tsc --noEmit` pulito (attenzione: la union widening rompe `tsc` finché tutti i Record non sono completati).
2. Suite: `assetExposure`, `compareAllocations`, `leverageAwareAllocationUtils`, `allocationUtils`.
3. **Leva = 1 → nessuna regressione**: un portafoglio senza `leverageRatio` mostra hero a numero
   singolo, composition bar e piani identici a prima (invariante #1).
4. **Dualità**: con un ETF 2x, hero mostra market + nozionale + chip leva corretti; net worth Panoramica
   invariato (è market).
5. **Bug fix verificato**: con leva corrente ≠ target, Ribilancia porta il nozionale di classe verso
   `target% × market` (non × nozionale). Confronto numerico su un caso a mano.
6. **Esclusioni**: un conto/immobile marcato `excluded` esce da num+denom e dalla leva; un `frozen`
   (pensione) resta nel denominatore ma non nei trade.
7. **Preleva a leva**: `planInstrumentWithdrawal` vende verso il target senza acquisti, Σ = −importo.
8. **Balance score** invariato.
9. Demo/shared account: target e `leverageRatio` demo-gated; owner-scoped.

## 3. Script di test manuale (fine L2)
Crea un ETF `etf` con `leverageRatio=2` → osserva hero due numeri + chip leva → imposta target che
sommano a 150 in Settings (validazione >=100, leva target 1,5×) → Ribilancia (i trade chiudono il gap
nozionale market-based) → Versa 1.000€ (nessun sell) → Preleva 1.000€ (nessun buy) → marca un conto
`excluded` (esce dalla base e dalla leva) → verifica su mobile che i due numeri dell'hero non si
sovrappongano.

## 4. Rollout
L0 (tipi + esposizione, invisibile salvo union widening) → L1 (base nozionale + planner + bug fix) →
L2 (UI visibile) → L3 (docs). Ogni fase: STOP + test manuale + go-ahead; PR verso `develop`.

## 5. Rituale documentazione (pre-merge)
- `CLAUDE.md`: Current Status → Latest; Key Features (Allocazione: dualità market/nozionale, leva);
  Key Files (`assetExposureUtils`, `leverageAwareAllocationUtils`).
- `AGENTS.md`: sezione *Allocazione a Leva* con: `leverageRatio` non è un tipo, base = tradable+frozen,
  current% su base market (somma a leva×100), **il bug fix del solver** (classConst market-based),
  Preleva a leva, esclusioni via `allocationRole` (non toggle per-classe), classi trendFollowing/carry.
- `README.md`; `Draft Release Temp.md`. Rimozione `SESSION_NOTES.md` nel commit pre-merge.
