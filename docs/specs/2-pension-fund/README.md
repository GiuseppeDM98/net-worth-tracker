# Fondo Pensione — Specification Index

> Status: **IN CORSO — P0+P1+P2 ✅ implementate (2026-07-24); P3 da fare (prossima sessione).** Spec riprogettata dal fork
> `Ciocc128`, adattata al branch attuale e a post `asset-transactions` (scritta 2026-07-22).
> Deliverable: tracciare il fondo pensione complementare come asset a valutazione manuale, con
> contributi in collection dedicata, motore fiscale (deducibilità ordinaria + extra-deducibilità),
> vista Previdenza dedicata, e integrazione con Allocazione / Storico / Rendimenti / FIRE.

## Perché esiste

Un fondo pensione non è "solo un altro asset": è un **contenitore illiquido** con una allocazione
interna (comparto), contributi di natura mista (TFR / volontari / datoriali) con trattamento fiscale
diverso, tassazione agevolata in uscita (15%→9%), e capitale bloccato fino alla pensione. Nessuna
delle proprietà attuali dell'app lo cattura. Questa feature lo modella end-to-end senza inquinare le
metriche di cashflow.

## Decisioni fissate (concordate con l'utente — NON rilitigare)

Vedi anche `docs/specs/README.md` → *Decisioni di riconciliazione condivise*.

1. **`AssetType: 'pensionFund'`** — valutazione manuale come `realestate` (nessuna API prezzi,
   label "Valore attuale", illiquido di default). **NON** è un ledger type di `asset-transactions`.
   **NON** esiste una `AssetClass 'pension'` (D2): la composizione sottostante vive in
   `Asset.composition`, e il segmento Storico si rende per AssetType.
2. **Contributi in collection dedicata `pensionContributions`** (pattern `dividends`), MAI come
   `Expense` taggata: i contributi non devono toccare savings-rate / budget.
3. **Natura contributo**: `tfr | voluntary | employer`. Solo `voluntary`+`employer` sono deducibili
   e consumano il tetto; il TFR è escluso dalla deduzione.
4. **Effetto sul valore del fondo**: ogni contributo alza immediatamente il valore del fondo
   (`quantity` con prezzo 1, come un saldo cash). Il volontario è un **transfer** conto→fondo
   (riusa `reconcileTransferCreate`); TFR/datoriale accreditano il fondo standalone (non transitano
   dal conto dell'utente). L'estratto conto periodico = edit manuale del valore (overwrite assoluto).
5. **Allocazione**: il fondo ha `allocationRole: 'frozen'` (D1) — nel denominatore e nelle
   percentuali, mai nei piani. Le card look-through alla composizione stanno SOLO nella vista
   Previdenza dedicata.
6. **Motore fiscale**: deducibilità ordinaria (tetto per-anno: 5.164,57 ≤2025, 5.300 ≥2026) +
   extra-deducibilità come fold pluriennale (accumulo primi 5 anni / drawdown anni 6–25 / scadenza).
   Beneficio IRPEF via `tax(RAL) − tax(RAL − dedotto)`, riusando gli scaglioni Coast FIRE con `taxOf`
   iniettato. Campo **RAL** in Impostazioni.
   - **D-P0.2 (fissata 2026-07-24)**: i contributi **storici non si tracciano** — si registra da ora
     in poi. La deduzione ordinaria resta corretta (è per-anno); il fold invece legge gli anni
     mancanti come *0 versato*, quindi **`isFirstEmploymentPost2007` va tenuto OFF** finché non
     esiste uno storico, altrimenti il plafond risulta gonfiato. Niente UI di import storico in
     P1/P2. Un eventuale ripensamento passa da un "plafond iniziale" da estratto conto (cambia la
     firma di `PensionDeductionInput`) → **da decidere prima di P1**.
7. **Casa della feature**: **vista dedicata `/dashboard/pension`** in `planningNav`, con link dalla
   card asset in Patrimonio. NON un tab in `fire-simulations`.
8. **FIRE**: toggle `respectPensionLockInFire` — quando on, il valore dei fondi bloccati
   (`unlockDate` futura) esce dal `currentNetWorth` del calcolo FIRE (resta nel patrimonio totale).
   Coast FIRE terza gamba e withdrawal netto asset-aware = **fuori scope v1** (fase 2).
9. **D-P0.1 (fissata 2026-07-24) — i fondi già a portafoglio si CONVERTONO, non si ricreano**: chi
   tracciava già il fondo lo ha come `etf`/`stock` con il valore in `quantity` a prezzo 1, cioè la
   forma esatta di destinazione. Si cambia il tipo dall'edit di `AssetDialog`; eliminare e ricreare
   perde lo storico (`MonthlySnapshot.byAsset` è keyed by `assetId`). Attenzione al **BUY baseline
   orfano** del registro operazioni, che `computeInvestedCapital` conterebbe ancora. Procedura,
   conseguenze e le due opzioni di fix in `04-ui-and-views.md` §1.1 (scope P2, non opzionale).

## Glossario

| Termine | Significato |
| --- | --- |
| **Natura / source** | Origine del contributo: `tfr`, `voluntary`, `employer`. Determina deducibilità. |
| **Tetto ordinario** | Deducibilità annua massima ordinaria: 5.164,57 € ≤2025, 5.300 € ≥2026. |
| **Extra-deducibilità** | Recupero del plafond inutilizzato nei primi 5 anni, usabile negli anni 6–25 (solo prima occupazione post-2007), cap annuo = metà tetto (2.650 € dal 2026). |
| **Plafond / bank** | Deduzione futura accumulata (creata − usata), con scadenza al 25° anno. |
| **RAL** | Reddito Annuo Lordo, base per calcolare l'aliquota marginale del beneficio. |
| **Aliquota di prestazione** | Tassazione agevolata in uscita: 15% fino a 15 anni, −0,30 p.p./anno, floor 9% a 35 anni. |
| **Look-through** | Guardare la composizione interna del fondo (equity/bonds/…). Fatto SOLO nella vista Previdenza. |

## File della spec (leggere in ordine)

| File | Contenuti |
| --- | --- |
| [`01-data-model-and-rules.md`](01-data-model-and-rules.md) | Tipi `PensionContribution` / `PensionFundDetails`, `AssetType 'pensionFund'`, collection `pensionContributions`, Firestore rules + indici, zod. |
| [`02-tax-engine.md`](02-tax-engine.md) | Motore puro `pensionDeduction.ts`: deducibilità ordinaria, fold extra-deducibilità, beneficio IRPEF, aliquota di prestazione. Formule + matrice di test. |
| [`03-contributions-service-and-api.md`](03-contributions-service-and-api.md) | Service contributi (collection dedicata + effetto valore/transfer + storno su delete), hooks, query keys, rollup per anno/natura. |
| [`04-ui-and-views.md`](04-ui-and-views.md) | AssetDialog `pensionFund`, `PensionContributionDialog`, vista `/dashboard/pension`, card look-through in Allocazione (`frozen`), segmento Storico, base Rendimenti, FIRE lock-in. |
| [`05-impacts-testing-rollout.md`](05-impacts-testing-rollout.md) | Tabella impatti, checklist regressione, rollout, rituale documentazione. |

## Invarianti di sistema (ogni fase deve preservarli)

1. **I contributi non toccano MAI le metriche di cashflow.** Nessun `Expense` di consumo è creato;
   il transfer del volontario è net-zero (già escluso da spesa/risparmio). Savings-rate, budget,
   Analisi, overview, email invariati.
2. **Il valore del fondo è la fonte per il patrimonio.** Vive in `quantity` (prezzo 1). Ogni
   contributo lo incrementa; l'estratto conto lo sovrascrive. Nessun consumer del valore cambia.
3. **`pensionFund` è fuori dai piani di allocazione** (ruolo `frozen`) ma dentro denominatore e
   percentuali. Il look-through alla composizione avviene in UN SOLO punto: le card della vista
   Previdenza. Ovunque altrove il fondo è intero.
4. **Il motore fiscale è puro e testato.** `lib/utils/pensionDeduction.ts` senza import Firebase,
   `taxOf` iniettato, tetti come funzione-soglia per-anno (mai magic number ai call site).
5. **Storno esatto su delete.** Eliminare un contributo ristorna l'effetto: TFR/datoriale
   decrementano il fondo; volontario reverte il transfer (conto +importo, fondo −importo) e cancella
   l'`Expense` transfer collegato.

## Fasatura (una fase per sessione, ognuna spedibile)

| Fase | Scope | Gate |
| --- | --- | --- |
| **P0** ✅ | Tipi (`types/pension.ts`, `AssetType 'pensionFund'`, `Asset.pensionFundDetails`) + motore fiscale puro + test (spec 01 §1-2 + spec 02) — **fatta 2026-07-24**, 19 test verdi, `tsc` pulito | `tsc` + `vitest run __tests__/pensionDeduction.test.ts` |
| **P1** ✅ | Collection `pensionContributions` + rules + indici + service (effetto valore/transfer + storno) + hooks + rollup puro + test (spec 01 §3-5 + spec 03) — **fatta 2026-07-24**, 33 test verdi, `tsc` pulito | `tsc` + suite contributi + rules/indexes deploy note |
| **P2** ✅ | UI base: AssetDialog `pensionFund` (+ composition, conversione asset ledger esistente), `PensionContributionDialog`, vista `/dashboard/pension` con contributi + recap fiscale (spec 04 §1-4) — **fatta 2026-07-24**, nessun test automatico nuovo (fase UI), `tsc` pulito, suite pensione P0/P1 52/52 + suite completa 1169 test verdi, 8/8 test manuali verificati su emulatore | `tsc` + script test manuale |
| **P3** | Integrazioni: Allocazione `frozen` + card look-through, segmento Storico, base Rendimenti, FIRE lock-in (spec 04 §5-8) + docs (spec 05) — **prossima sessione** | `tsc` + suite aree + test manuale |

**Modello consigliato**: **Opus 4.8** per P0 (motore fiscale, correttezza) e P1 (scritture
atomiche/transfer). Sonnet 5 accettabile per P2/P3.

## Interazione con `asset-transactions` (già mergiata)

- `pensionFund` è **non-ledger** (come `cash`/`realestate`): `isLedgerAssetType('pensionFund') === false`.
  Nessun registro operazioni; l'edit del valore passa da `updateAsset` (non `updateAssetMetadata`).
- Il volontario resta modellato come `transfer` (reconcileTransferCreate + `Expense` di tipo
  transfer per l'audit trail), **non** come cash-settlement del registro (che vale solo per i ledger
  type). Coerente col fatto che il fondo non ha un ledger.
- L'alias `displayTicker` non si applica al fondo (nessun ticker: campo gated come per cash/realestate).

## Prompt di implementazione

Ogni file di fase termina con un prompt copia-incolla (una fase = una sessione fresca, in ordine,
ognuna sul suo branch, PR verso `develop`). Prerequisito globale: **`asset-transactions` mergiata**.
