# 04 — UI e viste (P2: base · P3: integrazioni)

Leggi **DESIGN.md** prima di ogni scelta visiva. Copy italiano, commenti inglese. Segno solo via
token `text-positive`/`text-destructive`. Form: `useWatch()`/`getValues()`, mai `watch()`. Ogni
controllo mutante: `disabled={isDemo}` + `aria-label`. Ogni dialog: `description`. Dialog reset con
`open` in deps + `if(!open) return` + enumerazione completa dei campi.

Riferimento codice fork: `ciocc/main:components/fire-simulations/PensionTab.tsx`,
`components/pension/PensionContributionDialog.tsx`, `components/allocation/PensionAllocationCards.tsx`,
`components/assets/AssetDialog.tsx`, `lib/utils/pensionFire.ts`, `lib/utils/performanceBase.ts`.

---

# PARTE P2 — UI base (§1-§4)

## 1. `AssetDialog` — tipo `pensionFund`

- **Type picker**: nuova card "Fondo Pensione" (icona `PiggyBank`). Il tipo si comporta come
  `realestate`: no ticker / no auto-update / no cost-basis; label valore "Valore attuale"; illiquido
  di default; `shouldUpdatePrice=false`. Aggiornare lo zod enum e `tickerRequired`.
- **`PensionFundDetails`** (nuova sezione): `provider` (testo), `enrollmentDate`, `firstEmploymentDate`,
  `unlockDate` (input `date`, stringhe ISO — niente Timestamp), `isFirstEmploymentPost2007` (switch).
  Schema zod, reset in edit (enumerare i campi — gotcha reset), assemblaggio submit in
  `pensionFundDetails`. `AssetFormData += pensionFundDetails`.
- **Composizione sottostante**: abilitare l'editor "Asset Composto" (`composition`) per il tipo
  `pensionFund` (il branch ha già `AssetComposition`; il commento su `Asset.composition` cita proprio
  i fondi). Righe classe+% che sommano a 100 (validazione esistente). La composizione è usata SOLO
  nel look-through delle card Previdenza (§5) — mai altrove (invariante #3).
- **`allocationRole` (già esistente — RIUSARE, non ricreare)**: `AssetDialog` ha già il selettore a
  tre stati con copy dominio-specifica (righe ~378-395): *Ribilanciabile* (`tradable`) / *Non
  negoziabile* (`frozen`) / *Escluso dall'allocazione* (`excluded`) — e la descrizione di `frozen`
  **nomina già "fondo pensione vincolato"**. C'è pure un `useEffect` (righe ~527-534) che **suggerisce**
  il ruolo come default di form per classe/sotto-categoria (`realestate → excluded`,
  `Private Equity → frozen`, altrimenti `tradable`), visibile prima del salvataggio e a un click dal
  cambiarlo, che smette di guidare appena l'utente sceglie a mano (`allocationRoleTouched`) e non è mai
  un fallback in lettura (non cambia asset esistenti).
  - **Unica modifica**: aggiungere il ramo `selectedType === 'pensionFund' ? 'frozen'` a quel
    `useEffect` (e `selectedType` alle deps), così un fondo nuovo nasce **`frozen`** ("Non negoziabile").
    Nessuna nuova UI, nessuna nuova copy, nessun toggle globale.
  - **La scelta resta all'utente** (§5): chi preferisce il modello "previdenza fuori dall'allocazione"
    (quello del fork) cambia il fondo in **`excluded`** con un click, per-fondo. `frozen` e `excluded`
    sono entrambi supportati dalla macchina `allocationRole`; Storico e base Rendimenti sono type-based
    e indifferenti alla scelta.
- **`asset-transactions`**: `pensionFund` è non-ledger → NON entra nel ramo read-only qty/PMC di
  AssetDialog né nel trigger migrazione; resta sul path manuale `updateAsset` (come `realestate`).
  ⚠️ Vale per un fondo creato come tale; per uno **convertito** vedi §1.1 (il branch di submit legge
  `asset.type`, cioè il tipo PRIMA della modifica).
- Link "Vai a Previdenza" dalla card asset in Patrimonio (`AssetCard`/`AssetManagementTab`) per i
  fondi → `/dashboard/pension`.

### 1.1 Conversione dei fondi già a portafoglio (scope P2, NON opzionale)

Un utente che tracciava già il fondo prima della feature lo ha quasi certamente modellato come
**ledger type** (`etf`/`stock`, `assetClass 'equity'`, valore in `quantity`, prezzo 1) — che è già
la forma esatta prevista dall'invariante #2. La conversione è quindi una **modifica di tipo**, non
una ricreazione, e la spec deve dirlo esplicitamente perché la strada sbagliata è quella intuitiva.

- **Mai eliminare e ricreare.** `MonthlySnapshot.byAsset` è keyed by `assetId`: un asset nuovo perde
  Δ Inizio, "Valore per Strumento" e la continuità storica nei grafici. La Select **"Tipo \*"**
  dell'edit di `AssetDialog` (già esistente, visibile solo in `isEdit`) è la via corretta — basta
  che `assetTypes` includa `pensionFund`.
- **Il valore si conserva da solo.** Il branch di submit è
  `ledgerEditFlow = !!asset && isLedgerAssetType(asset.type)` e legge il tipo **memorizzato**, non
  quello scelto nel form: l'edit di conversione passa quindi da `updateAssetMetadata`, che include
  `type` ma **non tocca `quantity`**. Nessun reinserimento del valore. (Da qui in poi l'asset è
  non-ledger e ogni edit successivo va su `updateAsset`, come dice §1.)
- **Ledger orfano — è il punto che produce un numero sbagliato, non solo un residuo.** L'asset
  conserva il BUY baseline scritto dalla migrazione del registro. Le azioni riga spariscono da sole
  (gate `isLedgerAssetType`), ma `computeInvestedCapital` (Rendimenti) somma **tutti** i trade senza
  filtrare per tipo asset: il "Capitale investito" continuerebbe a includere il fondo **proprio
  mentre P3 lo esclude dalla base Rendimenti** → pagina internamente incoerente. Risolvere in P2 con
  una delle due (decidere in fase, documentare la scelta):
  1. cancellare i doc `assetTransactions` dell'asset alla conversione (irreversibile, ma il fondo
     non avrà mai un registro), oppure
  2. filtrare i trade per `isLedgerAssetType(asset.type)` nei consumer (`computeInvestedCapital`,
     `aggregateRealizedByYear`, `totalReturnAssets`) — più difensivo, copre anche conversioni future.
- **Campi da sistemare a mano dopo la conversione** (nessuno ha un default retroattivo, per la regola
  "nessun ruolo è mai inferito in lettura"): `allocationRole → frozen` (il default `frozen` del
  `useEffect` vale solo per i fondi NUOVI), `stampDutyExempt → true` (esenzione bollo), più
  `pensionFundDetails` e `composition`.
- **Copy**: l'edit di un asset appena convertito deve rendere evidente che i contributi si registrano
  da `/dashboard/pension` e che il valore attuale resta il saldo da estratto conto.

## 2. `components/pension/PensionContributionDialog.tsx` (nuovo)

`ResponsiveModal` + react-hook-form + zod. Campi:
- **Fondo** — Select sui fondi dell'utente (`useAssets`, `type==='pensionFund'`); sentinel `__none__`
  se necessario.
- **Natura** — segmented/select `TFR / Volontario / Datoriale` con micro-education inline
  ("Volontari e datoriali sono deducibili; il TFR conferito no").
- **Importo (€)** — > 0.
- **Data** — default oggi.
- **Anno fiscale** — default anno della data (editabile: un versamento di gennaio può competere
  all'anno prima).
- **Conto di provenienza** — Select sui conti cash (`assetClass==='cash'`), **visibile SOLO se
  natura = Volontario** (§4.3: è l'unica natura che lascia il conto). Sentinel `__none__`.
- **Note** — opzionale.

Submit → `recordPensionContribution`. Toast solo dopo la risposta. Invalidazione via il mutation hook
(tripla). Reset con `open` in deps.

## 3. Vista dedicata `/dashboard/pension` (D7)

- Nuova pagina `app/dashboard/pension/page.tsx`; voce in `planningNav`
  (`{ name: 'Previdenza', href: '/dashboard/pension', icon: PiggyBank }`) in
  `lib/constants/navigation.ts` (aggiornare anche l'elenco href protetti). **Rimuovere** l'eventuale
  tab Previdenza da `fire-simulations` (il fork lo aveva lì; qui è pagina dedicata).
- Contenuto (riusa un componente `PensionTab`/`PensionOverview`):
  - **Header**: valore totale dei fondi + versato totale.
  - **Versato per natura/anno**: dal rollup `derivePensionContributionsByYearAndNature`.
  - **Bottone "Registra versamento"** → `PensionContributionDialog`.
  - **Storico versamenti**: lista dei contributi (data · natura chip · importo · fondo) con **delete
    2-click auto-disarm 3s** (precedente `AssetManagementTab`) → `deletePensionContribution` (storno).
    Il label di conferma per il volontario ricorda: "Conferma? Il saldo del conto verrà ristornato."
  - **Recap fiscale** → §4.

## 4. RAL, recap fiscale, plafond (§3 del fork)

- **Impostazioni** (`app/dashboard/settings/page.tsx`): tre nuovi campi in
  `AssetAllocationSettings` (o dove vivono le settings persistite via `assetAllocationService`
  `getSettings`/`setSettings` — ricordare i **2 write-path**):
  `grossAnnualIncome?` (RAL), `isFirstEmploymentPost2007?`, `firstEmploymentYear?`. Editabili anche
  inline dalla vista Previdenza.
- **Card "Beneficio fiscale {anno}"**: input a `computePensionTaxRecap(input, RAL, taxOf)` dove
  `input = { targetYear, enrollmentYear: firstEmploymentYear ?? enrollmentYear, isFirstJobPost2007,
  deductibleContribByYear: derivePensionDeductibleByYear(contributi) }` e
  `taxOf = (income) => calculateProgressiveTax(income, brackets)` (brackets = quelli di Coast FIRE).
  Mostra: risparmio IRPEF dell'anno (`taxSaving`), dedotto/tetto effettivo, TFR escluso (nota).
- **Card "Plafond deducibilità"** (solo se `isFirstEmploymentPost2007`): `plafondCreatedThisYear`
  (creato quest'anno), `accruedPlafondResidual` (bank residuo), `extraAvailableThisYear`. Nota UX:
  nei primi 5 anni risparmio corrente più basso ⇄ plafond futuro costruito (trade-off esplicito).
- Se RAL assente → mostrare stato deduzione/plafond ma "risparmio non calcolabile: imposta la RAL".

---

# PARTE P3 — Integrazioni (§5-§8)

## 5. Allocazione — ruolo `frozen` + card look-through (D1)

- **Nessun codice di esclusione nuovo**: il fondo ha `allocationRole:'frozen'`, quindi
  `partitionByAllocationRole` lo mette in `frozen` → nel denominatore e nelle percentuali, MAI nei
  piani (`buildRebalancePlan`/`buildContributionPlan`/`buildWithdrawalPlan` operano sul `tradable`;
  `tradableByClass` esclude già il frozen dai sell). Verificare che il fondo NON compaia in nessun
  piano e che la sua classe (dalla composizione/`TYPE_TO_CLASS`) pesi nel denominatore.
- **Attribuzione alle classi nel denominatore**: il fondo `frozen` concorre al denominatore e alle
  percentuali attraverso la sua `composition` (look-through, esattamente come un ETF composito) —
  gestito da `expandAssetExposure` senza special-case pensione (vedi
  `3-leveraged-etf-allocation/02` §"Fondo pensione nel motore"). Le sue classi equity/bonds compaiono
  quindi nella composition-bar principale come esposizione reale; ciò che il fondo NON fa è comparire
  in un piano (è `frozen`, fuori dal `tradable`). Le **action chip** restano intoccate.
  → Refine dell'invariante #3: "intero, non guardato attraverso" vale per il **segmento Storico** e
  la **base Rendimenti** (aggregati type-based, §6-§7); il **denominatore Allocazione** guarda
  attraverso; le **card Previdenza** danno lo split esplicito con/senza previdenza.
- **`components/allocation/PensionAllocationCards.tsx`** (dopo il divider "Dettaglio"): toggle
  "Mostra previdenza complementare" → **Card A** (sottostante del fondo) + **Card B** (portafoglio +
  previdenza), come vista didattica esplicita che isola il contributo della previdenza.
  - Riferimento: `ciocc/main:components/allocation/PensionAllocationCards.tsx`. Adattare a
    `type==='pensionFund'` e ai primitivi `CompositionBar`/`CompositionList` del branch (il fork usa
    componenti pre-redesign — riscrivere sopra `components/ui/composition-*`).

## 6. Storico — segmento "Previdenza" per AssetType (conseguenza di D2)

Il fork otteneva il segmento gratis da `AssetClass 'pension'`. Senza quella classe (D2), il segmento
va calcolato **per AssetType**:
- In `chartService.prepareAssetClassHistoryData` (o un helper affiancato), aggiungere una serie
  sintetica "Previdenza" = somma dei valori dei fondi per mese, presa da `MonthlySnapshot.byAsset`
  filtrato agli `assetId` di tipo `pensionFund`. Serve un resolver `assetId → type` dagli asset live
  passati dalla pagina Storico (come già fa `MonthlyAssetBreakdownSection` per gli alias).
- Le due viste Composizione (Line % + Area) mostrano "Previdenza" come banda distinta. Il resto
  della composizione per-classe resta invariato (il fondo NON è spalmato su equity/bonds negli
  aggregati — invariante #3: intero come previdenza).
- **Caveat snapshot**: dipende da come lo snapshot aggrega i fondi. Se oggi un `pensionFund` finisce
  in `byAssetClass` sotto `TYPE_TO_CLASS`, sottrarlo da quella classe e riattribuirlo alla serie
  Previdenza (evitare doppio conteggio). Verificare `dummySnapshotGenerator`/`snapshotService` e
  documentare l'attribuzione scelta con un Why-comment.

## 7. Rendimenti — base portafoglio esclude i fondi (conseguenza di D2)

Il fondo è capitale illiquido non ribilanciabile: escluderlo dalle metriche di portafoglio
(TWR/Sharpe/vol/MaxDD/ROI/CAGR) evita che i suoi versamenti figurino come rendimento.
- Helper puro **`lib/utils/performanceBase.ts`** (rif. fork), ma **type-based** anziché class-based:
  `toPerformanceBaseSnapshots(snapshots, pensionAssetIds)` sottrae il valore dei fondi da ogni
  snapshot (da `byAsset`), dove `pensionAssetIds = assets.filter(a => a.type==='pensionFund').map(id)`.
  `enum PerformanceBase { Portfolio, NetWorth }` estendibile. Test `__tests__/performanceBase.test.ts`.
- Applicato in `getAllPerformanceData` (fetch interno) e nella pagina Rendimenti (`cachedSnapshots`).
  Unico consumer = Rendimenti; nessun impatto altrove. Limite noto (documentare nell'helper): il
  volontario è un outflow di portafoglio non neutralizzato nel TWR; TFR/datoriale non toccano il
  portafoglio quindi nessun effetto.

## 8. FIRE — capitale bloccato (§5.3 del fork, MVP)

- Setting `respectPensionLockInFire?: boolean` (persistito con gli altri) + toggle nel Calcolatore
  FIRE ("Considera il fondo pensione come capitale bloccato fino allo sblocco").
- Helper puro **`lib/utils/pensionFire.ts::calculatePensionLockedValue(assets, now, valueOf)`** —
  somma il valore dei `pensionFund` con `unlockDate` futura; `valueOf` iniettato (rif. fork) + test.
- `FireCalculatorTab`: quando on, `currentNetWorth = fireNetWorth − calculatePensionLockedValue(...)`
  (il valore resta nel patrimonio totale, esce solo dal FIRE spendibile).
- **Fuori scope v1** (fase 2, come da fork): Coast FIRE terza gamba distinta da INPS; withdrawal
  netto asset-aware con aliquota 15→9% in Monte Carlo. Solo annotarli.

## 9. Demo & shared account
Tutto owner-scoped (`ownerId` da `useActiveAccount`); un delegato può registrare contributi e vedere
la vista. Demo: viste visibili, ogni mutazione disabilitata.

---

## 10. Prompt di implementazione — FASI P2 e P3

**P2** (UI base §1-§4) — *Sonnet 5 alto* (Opus se AssetDialog delicato):
```text
Implementa la FASE P2 (UI base) della feature "Fondo Pensione". Prerequisiti: P0+P1 mergiate.
Leggi: docs/specs/README.md, docs/specs/2-pension-fund/README.md, docs/specs/2-pension-fund/04-ui-and-views.md
§1-§4 (le §5-§8 sono P3: NON toccarle), DESIGN.md, AGENTS.md (Dialog Reset, useWatch, ResponsiveModal,
Layout Tokens, apostrofi curvi TS1127). Riferimento: ciocc/main:components/pension/*,
components/fire-simulations/PensionTab.tsx.
Scope: AssetDialog tipo pensionFund (+composition, allocationRole frozen di default, non-ledger),
PensionContributionDialog, vista /dashboard/pension in planningNav (rimuovi il tab da fire-simulations),
storico versamenti con delete-storno, RAL+recap fiscale+plafond in Settings/vista.
Vietato: Allocazione, Storico, Rendimenti, FIRE (sono P3). Gate: npx tsc --noEmit. Poi FERMATI,
SESSION_NOTES, COSA/COME testare, ATTENDI conferma. Branch: feature/pension-fund-p2; PR develop.
```

**P3** (integrazioni §5-§8 + docs) — *Sonnet 5 alto*:
```text
Implementa la FASE P3 (integrazioni) della feature "Fondo Pensione". Prerequisiti: P0+P1+P2 mergiate.
Leggi: docs/specs/2-pension-fund/04-ui-and-views.md §5-§8 e 05-impacts-testing-rollout.md, DESIGN.md,
AGENTS.md (Cross-Component Metric Consistency, Performance Page, useChartColors). Riferimento:
ciocc/main:components/allocation/PensionAllocationCards.tsx, lib/utils/{performanceBase,pensionFire}.ts.
Scope: (5) PensionAllocationCards look-through sopra CompositionBar/List, verifica frozen fuori dai
piani; (6) segmento Storico "Previdenza" TYPE-based (per assetId pensionFund, non per classe); (7)
performanceBase.ts type-based + applicazione in Rendimenti; (8) respectPensionLockInFire + pensionFire.ts
+ FireCalculatorTab. Poi il rituale documentazione (spec 05 §5). Gate: npx tsc --noEmit + suite aree
(performanceBase, allocationUtils, chartService se toccato). FERMATI, riepilogo, ATTENDI conferma.
Branch: feature/pension-fund-p3; PR develop.
```
