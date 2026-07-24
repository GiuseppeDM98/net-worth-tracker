# 05 — Impatti, testing, rollout

## 1. Tabella impatti

Proprietà portante: **il fondo è un asset a valutazione manuale come `realestate`**; il suo valore
vive in `quantity` e ogni consumer del valore continua a leggerlo senza modifiche. I contributi non
creano `Expense` di consumo → cashflow intatto.

### Intatti per costruzione (verificare, non modificare)

| Superficie | Perché è safe |
| --- | --- |
| Cashflow / budget / Analisi / overview / email | i contributi non sono Expense di consumo; il transfer del volontario è net-zero già escluso |
| `asset-transactions` — fondo creato **come** `pensionFund` | non è ledger type → nessuna interazione |
| Patrimonio (tabella, Δ, G/P), PDF, stamp duty | leggono il valore dell'asset (quantity), invariato |
| Panoramica net worth | il valore del fondo è nel patrimonio come qualunque asset |
| YOC / dividendi | il fondo non paga dividendi tracciati; nessun impatto |

### Toccati (lista completa — oltre a questo è scope creep)

| File | Cambio | Fase |
| --- | --- | --- |
| `types/pension.ts` | nuovo | P0 |
| `types/assets.ts` | `AssetType 'pensionFund'`, `pensionFundDetails?`, `TYPE_TO_CLASS` | P0 |
| `lib/utils/pensionDeduction.ts` | nuovo motore puro | P0 |
| `firestore.rules`, `firestore.indexes.json` | +blocco/indici `pensionContributions` | P1 |
| `lib/services/pensionContributionService.ts` | nuovo | P1 |
| `lib/utils/pensionContributions.ts` | nuovo rollup | P1 |
| `lib/hooks/usePensionContributions.ts`, `lib/query/queryKeys.ts` | nuovo / +key | P1 |
| `components/assets/AssetDialog.tsx`, `AssetCard.tsx`, `AssetManagementTab.tsx` | tipo pensionFund + link | P2 |
| `components/pension/PensionContributionDialog.tsx` | nuovo | P2 |
| `app/dashboard/pension/page.tsx` + `PensionTab`/overview | nuovo | P2 |
| `lib/constants/navigation.ts` | +voce Previdenza | P2 |
| `app/dashboard/settings/page.tsx`, `lib/services/assetAllocationService.ts` | RAL + flag (2 write-path) | P2 |
| `components/allocation/PensionAllocationCards.tsx` + pagina Allocazione | card look-through | P3 |
| `lib/services/chartService.ts` + pagina Storico | segmento Previdenza type-based | P3 |
| `lib/utils/performanceBase.ts` + pagina Rendimenti + `getAllPerformanceData` | base portafoglio esclude fondi | P3 |
| `lib/utils/pensionFire.ts` + `FireCalculatorTab.tsx` + settings | lock-in FIRE | P3 |
| `components/fire-simulations/page.tsx` | rimozione eventuale tab Previdenza | P2 |
| `assetTransactions` dei fondi **convertiti** | cleanup baseline orfano **oppure** filtro per tipo nei consumer (04 §1.1) | P2 |

> ⚠️ **La riga "nessuna interazione" qui sopra vale solo per un fondo creato da zero.** Un fondo
> **convertito** da `etf`/`stock` conserva il BUY baseline della migrazione del registro: le azioni
> riga spariscono da sole, ma `computeInvestedCapital` somma tutti i trade senza filtrare per tipo,
> quindi il "Capitale investito" di Rendimenti includerebbe il fondo mentre P3 lo esclude dalla base.
> Procedura completa e le due opzioni di fix in `04-ui-and-views.md` §1.1.

## 2. Checklist di regressione (dopo P1, P2, P3)

1. `npx tsc --noEmit` pulito.
2. Suite: `pensionDeduction`, `pensionContributions`, `pensionContributionService`, `performanceBase`
   (P3), + aree: `updateCashAssetBalancesAtomic`, `dashboardOverviewService`, `allocationUtils`.
3. **Cashflow invariato**: registra un volontario da un conto → savings-rate, budget, Analisi,
   overview identici prima/dopo (solo il saldo conto cala e il valore fondo sale, net-zero).
4. **Valore fondo**: TFR → valore fondo +importo, nessun movimento conto. Volontario → conto −importo,
   fondo +importo. Delete → tutto ristornato.
5. **Allocazione**: il fondo NON compare in Ribilancia/Versa/Preleva; pesa nel denominatore e nelle %;
   card look-through mostrano equity/bonds del fondo solo lì.
6. **Storico**: banda "Previdenza" distinta, nessun doppio conteggio con equity/bonds.
7. **Rendimenti**: TWR/Sharpe/… escludono i fondi; con e senza fondo le metriche di portafoglio
   coincidono se il fondo è l'unica differenza.
8. **FIRE**: toggle lock-in on → `currentNetWorth` cala del valore dei fondi bloccati; patrimonio
   totale invariato.
9. **Fiscale**: recap con RAL nota → risparmio = `tax(RAL) − tax(RAL − dedotto)`; plafond coerente
   col fold (confrontare con un calcolo a mano su un profilo prima-occupazione-post-2007).
10. Shared account: delegato registra/elimina contributi. Demo: viste visibili, mutazioni disabilitate.
11. **Conversione (04 §1.1)**: convertito un `etf` in `pensionFund`, il valore resta identico, lo
    storico per-asset non si spezza (Δ Inizio e "Valore per Strumento" continuano dai mesi
    precedenti), le azioni riga del registro spariscono, e il "Capitale investito" di Rendimenti
    **non** conta più il fondo.

## 3. Script di test manuale (fine P2 e P3)

**P2**: crea un `pensionFund` (provider + composizione 70/30 + date + prima-occupazione-post-2007) →
registra TFR (valore sale) → registra volontario da un conto (conto scende, valore sale, transfer in
Cashflow net-zero) → registra datoriale → imposta RAL in Settings → verifica recap "Beneficio fiscale"
e "Plafond" → elimina il volontario (conto ristornato, transfer sparito).

**P2 — conversione di un fondo preesistente** (percorso reale dell'utente, 04 §1.1): apri in modifica
un fondo oggi modellato come `etf` → cambia "Tipo" in Fondo Pensione → salva. Verifica: valore
invariato senza reinserirlo; `allocationRole` da portare a `frozen` e `stampDutyExempt` da attivare a
mano; compila provider/composizione/date; le icone ⇄ e 📋 del registro spariscono dalla riga; in
Rendimenti il "Capitale investito" non include più il fondo; in Storico la serie dell'asset non si
interrompe nel mese della conversione.

**P3**: Allocazione — il fondo non è nei piani, card look-through corrette → Storico — banda Previdenza
→ Rendimenti — TWR invariato con/senza fondo → FIRE — toggle lock-in sposta il currentNetWorth.

## 4. Rollout
P0 (puro, invisibile) → P1 (collection + service; deploy rules/indici) → P2 (feature visibile:
attenzione ad AssetDialog) → P3 (integrazioni). Ogni fase: STOP + test manuale utente + go-ahead
prima del commit; PR verso `develop`.

## 5. Rituale documentazione (pre-merge)
- `CLAUDE.md`: Current Status → Latest; Key Features (voce Fondo Pensione); Key Files (limite 40k, EN).
- `AGENTS.md`: nuova sezione *Fondo Pensione* con almeno: `pensionFund` non-ledger, contributi in
  collection dedicata (mai Expense), volontario = transfer con storno, `allocationRole:'frozen'`,
  segmento Storico e base Rendimenti type-based (non class-based), motore fiscale con `taxOf` iniettato.
- `README.md` feature list; `Draft Release Temp.md` release note. Rimozione `SESSION_NOTES.md` nello
  stesso commit pre-merge.
