# Specifiche — indice generale

> Status: **SPEC**. Le feature qui descritte sono progettate, non ancora implementate.
> Le quattro spec `2-pension-fund` / `3-leveraged-etf-allocation` / `4-ticker-display-alias` /
> `5-expense-csv-import` sono un **port riprogettato** delle feature del fork
> `Ciocc128/net-worth-tracker` (autore: **Giorgio Trentadue**,
> [@Ciocc128](https://github.com/Ciocc128)), riscritte per il branch attuale e per il
> mondo **post `asset-transactions`**. Scritte 2026-07-22.

## Attribuzione / Crediti

Le quattro feature specificate in questi documenti — **fondo pensione**, **allocazione a leva
(ETF a leva)**, **alias di visualizzazione ticker**, **import CSV storico** — sono state **ideate e
implementate originariamente da [Giorgio Trentadue (@Ciocc128)](https://github.com/Ciocc128)** nel suo
fork [`Ciocc128/net-worth-tracker`](https://github.com/Ciocc128/net-worth-tracker). Il design fiscale
del fondo pensione, il modello market/nozionale a leva e i relativi motori sono suo lavoro.

Questi file sono un **port riprogettato** di quel lavoro: le stesse feature, riadattate al branch
attuale (`allocationRole`, `CompositionBar`/`List`, planner Preleva) e al mondo post
`asset-transactions`, con le decisioni di riconciliazione D1–D5. Il **codice di riferimento** resta il
suo (`git show ciocc/main:<path>`); le fasi di implementazione lo accreditano con `Co-authored-by`,
e dove opportuno preservano i suoi commit originali.

## Le spec

| Spec | Cos'è | Complessità |
| --- | --- | --- |
| [`1-asset-transactions/`](1-asset-transactions/README.md) | Registro operazioni (trade ledger): BUY/SELL/ADJUSTMENT espliciti, `quantity`/`averageCost` derivati, P&L realizzato, XIRR, capitale investito. **Prerequisito di tutto il resto.** | Alta |
| [`2-pension-fund/`](2-pension-fund/README.md) | Fondo pensione: asset a valutazione manuale, collection contributi dedicata, motore fiscale deducibilità/plafond, vista Previdenza, FIRE capitale bloccato. | Alta |
| [`3-leveraged-etf-allocation/`](3-leveraged-etf-allocation/README.md) | ETF a leva: dualità market/nozionale, target che sommano a >100% (= leva), planner Versa/Ribilancia/Preleva instrument-aware **con il bug del solver risolto**. | Alta |
| [`4-ticker-display-alias.md`](4-ticker-display-alias.md) | Alias di visualizzazione (`displayTicker`): il `ticker` resta Yahoo per i prezzi, l'alias è ciò che l'utente vede ovunque. | Bassa |
| [`5-expense-csv-import.md`](5-expense-csv-import.md) | Import CSV storico di entrate/spese, con anteprima e undo per batch. | Media |

## Ordine di implementazione (vincolante)

```
1-asset-transactions (Fasi A→D)   ← PRIMA. Le altre spec la presuppongono già mergiata.
        │
        ├─ 4-ticker-display-alias      ← indipendente, basso rischio; in qualunque momento dopo A/B
        ├─ 5-expense-csv-import        ← indipendente (tocca solo Cashflow); in qualunque momento
        │
        ├─ 2-pension-fund              ← dopo asset-transactions (condivide AssetDialog, Rendimenti)
        └─ 3-leveraged-etf-allocation  ← dopo pension-fund (condividono Allocazione e allocationRole)
```

`2-pension-fund` e `3-leveraged-etf-allocation` toccano entrambe la pagina Allocazione e l'`allocationRole`:
farle in quest'ordine (prima pensione, poi leva) tiene i conflitti su un solo asse per volta —
la pensione introduce il ruolo `frozen` per un asset, la leva riscrive il motore dei piani.

## Decisioni di riconciliazione condivise (fissate 2026-07-22 — NON rilitigare)

Queste decisioni derivano dal fatto che il branch attuale è **più avanti** del fork su Allocazione
(ha già `Asset.allocationRole`, il redesign `CompositionList`/`CompositionBar`, il planner Preleva)
e sta per ricevere `asset-transactions`. Dove il fork risolveva un problema in modo più vecchio, qui
si adotta il primitivo già presente nel branch.

### D1 — Modello di esclusione dall'allocazione: **`allocationRole` per-asset** (unico)

Il branch ha già `Asset.allocationRole: 'tradable' | 'frozen' | 'excluded'`
(`resolveAllocationRole` / `partitionByAllocationRole` in `lib/utils/allocationUtils.ts`), con
denominatore = `tradable + frozen` e i piani che vendono solo il `tradable`. **Non** si porta il
modello del fork (classe fantasma `pension` sempre esclusa + toggle globali
`excludeCash/RealEstateFromAllocation`). Conseguenze:

- **Fondo pensione → ruolo `frozen`**: resta nel denominatore e nelle percentuali (è capitale
  investito reale) ma non compare MAI nei piani Ribilancia/Versa/Preleva. È l'esempio di `frozen`
  già citato nel CLAUDE.md. (Spec `2-pension-fund/04`.)
- **Liquidità/immobili fuori dal portafoglio → ruolo `excluded` per-asset**: nessun toggle globale
  per-classe. L'utente marca i singoli conti/immobili come `excluded`. (Spec `3-leveraged-etf-allocation/03`.)
- I due flag `excludeCashFromAllocation` / `excludeRealEstateFromAllocation` del fork **non**
  vengono introdotti; `getExcludedClasses` **non** viene aggiunto.

### D2 — Niente `AssetClass 'pension'`: il fondo è un **AssetType**, non una classe

Il fork ha una `AssetClass 'pension'` (le sue stesse note la marcano come "unico punto di
non-compliance, da rendere type-based"). Qui si fa la cosa pulita da subito:

- Nuovo **`AssetType: 'pensionFund'`** (valutazione manuale come `realestate`); **nessuna** nuova
  `AssetClass 'pension'`. La composizione sottostante del fondo (equity/bonds/…) vive in
  `Asset.composition`, che il branch supporta già.
- Il **segmento "Previdenza" nello Storico** (§8.2 del fork) si rende **per AssetType `pensionFund`**,
  non tramite una classe fantasma. (Spec `2-pension-fund/04`.)
- `pensionFund` **NON** è un ledger type di `asset-transactions` (come `cash`/`realestate`): niente
  registro operazioni, valore editato direttamente (estratto conto) e incrementato dai contributi.

### D3 — Nuove `AssetClass`: **`trendFollowing` + `carry`** aggiunte

Confermato: si introducono le due classi del fork (managed futures / carry). Ogni
`Record<AssetClass, …>` esaustivo va esteso (vedi la gotcha "union widening" sotto). (Spec
`3-leveraged-etf-allocation/01`.)

### D4 — Nessun nuovo `AssetType 'leveragedEtf'`: solo il campo `leverageRatio`

Il fork ha aggiunto sia il tipo `leveragedEtf` sia il campo `leverageRatio`. Qui **solo il campo**:
`Asset.leverageRatio?: number` su un normale `etf`, mostrato in `AssetDialog` per il tipo `etf`. La
matematica dell'esposizione dipende SOLO da `leverageRatio` + `composition`, mai dal tipo. Evitare
un nuovo tipo tiene invariati `LEDGER_ASSET_TYPES`, la migrazione e `TYPE_TO_CLASS`.
→ *Da confermare in `3-leveraged-etf-allocation/01` se preferisci comunque il tipo dedicato.*

### D5 — Il bug del solver a leva va **risolto** in reimplementazione

Il fork ha un bug noto e non risolto (documentato nelle sue note): in `solve()` il termine di classe
usa `currentNotionalTotal` invece della base market. Fix in `3-leveraged-etf-allocation/02` §"Bug fix".

## Interazioni con `asset-transactions` (che qui si assume già mergiata)

Ogni spec ha una sezione "Interazione con asset-transactions". In sintesi:

- **Alias** `displayTicker` è un campo *metadata* → per i ledger type passa da `updateAssetMetadata`
  (non `updateAsset`); lo sweep dell'alias deve coprire ANCHE le superfici nuove del registro
  (`TransactionDialog`, `AssetMovementsDialog`, lista per-asset di Rendimenti).
- **Pensione**: `pensionFund` è non-ledger → resta su `updateAsset` (come `realestate`); i contributi
  incrementano il valore via `updateCashAssetBalance` / transfer, mai via il registro operazioni.
- **Leva**: ortogonale al registro. `leverageRatio` moltiplica l'esposizione *nozionale*; il
  `pricePerUnit`/PMC del registro è per-quota e indipendente. Nessun conflitto di calcolo.
- **CSV import**: tocca solo Cashflow (Expense/income), zero interazione col registro asset.

## Convenzioni comuni (valgono per tutte le spec)

Identiche a `1-asset-transactions/README.md` → *Binding instructions*: leggere `AGENTS.md`,
`CLAUDE.md`, `COMMENTS.md`, `DEVELOPMENT_GUIDELINES.md`, e `DESIGN.md` per la UI **prima** di
scrivere codice. Logica pura e testata in `lib/utils`, tempo iniettato (`now: Date`), zero import
Firebase nei moduli puri. A fine di ogni fase: `npx tsc --noEmit` + suite della fase, **STOP**,
riepilogo + istruzioni di test manuale, attesa conferma esplicita dell'utente prima di ogni commit.
PR verso `develop`, mai `main`. Conventional commits. `SESSION_NOTES.md` durante il lavoro, rituale
documentazione pre-merge.
