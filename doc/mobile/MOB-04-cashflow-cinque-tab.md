# MOB-04 — Cashflow: le cinque tab

> Stato: da fare · riletta in modo adversariale il 2026-10-10: 34 rilievi, 9 decisioni · Priorità: 2 (Tracciamento è la pagina del telefono: l'unica con il «+») · Sforzo: L · Dipende da:
> MOB-01, MOB-02, MOB-03 (sequenza, README § 9, 9; PERF-06 ritirata, in develop) · Sblocca: MOB-05..08 (`e2e/cashflow.tablet.spec.ts`), MOB-09

## 1. Il problema, misurato

Censimento 2026-09-26 a 390×844 (`doc/mobile/README.md` § 3), schermate / tessere / cifre sopra la piega: Tracciamento
4,34 / 5 / 16 (Movimenti alta 1587 px); Budget 3,27 / 5 / 15; Centri 1,92 / 3 / 10; Divisione 1,90 / 4 / 19;
Dividendi 3,77 / 6 / 8. Il codice di oggi (righe da riverificare):

- `app/dashboard/cashflow/page.tsx:93`: Tracciamento sempre montata, le altre alla prima visita (`mountedTabs`);
  `:379-501` cinque `TabsContent forceMount`, l'inattiva `display:none` (`components/ui/tabs.tsx:47`); una tab spenta
  ricade su Tracciamento (`:254-255`).
- `components/cashflow/ExpenseTrackingTab.tsx:272-279`: il FAB (`BottomNavigation.tsx:42`) apre il dialog e basta;
  `onSuccess?: () => void` (`components/expenses/ExpenseDialog.tsx:381`, chiamato a `:2078` senza argomenti) benché gli id
  ci siano (`:2034`: dal 2026-10-10 `ids` elenca prima i genitori e poi le commissioni, `parentCount`); la riga del feed non
  porta il suo id (`TransactionFeed.tsx:480`, un `<div key>` non focalizzabile). `ResponsiveModal` rimette il focus
  sull'opener alla fine dell'uscita (`responsive-modal.tsx:162-185`), cioè sul FAB.
- `ExpenseTrackingTab.tsx:1026-1044`: il trio (`tiles/CashflowKpiTrio.tsx:53-92`, via `CashflowPeriodoTile.tsx:69`)
  stampa i totali del PERIODO, calendario compreso; il verdetto (`lib/utils/cashflowNarrative.ts:385-418`) giudica la
  parte vissuta e col calendario chiude con `calendarSentence` (`:345-372`). `:800-806`: il secondo handle sul `period`.
  In attesa o in errore i selettori restano «the same elements, so the one that asked for the new period keeps its focus»
  (`:776-781`), mentre `PageVerdict` non è montato.
- `ExpenseSplitTab.tsx:89`: Divisione ha un `period` SUO; `expenseSplitNarrative.ts:273` mette `scheduledSentence` («Nel
  totale ci sono ancora X € … in calendario», qualifica «In comune») dopo i residui. `BudgetTab.tsx:304-312`: il
  `role="status"` del salvataggio sta nell'aside di Per categoria. `DividendTrackingTab.tsx:211`: `/api/dividends/stats` è
  l'unica lettura PER TESSERA — e, dal 2026-10-05, l'unica richiesta della tab: la stessa risposta porta la lista
  (`useDividendRegistry`, nella pagina). Dividendi ha un asse (`SegmentedPill` «Periodo», `:570-600`) con il «+» 44×44
  accanto sotto `desktop:`, e un DOM (Incasso netto, Affidabilità, Rendimento, Pagatori, Per anno, Pagamenti,
  `:644-698`) riordinato sul telefono con `order-1/4/2/3/5/6`, che README § 9, 1 vieta.

## 2. Obiettivo misurabile

- `npm run mobile:budget` sul fixture `census@example.com` (Centri e Divisione accesi, una cedola, una riga in
  calendario: README § 9, 10) a 390: Tracciamento, Budget, Dividendi **≤ 2,0** schermate, Centri e Divisione **≤ 1,5**; su
  tutte ≤ 5 cifre fuori dal verdetto (la striscia conta fuori, lo `scope` dentro: MOB-01 § 4) e `firstClosedRowAbovePill:
  true` (Budget senza curva: `raisedBy` se non ci sta, README § 9, 19); `budget.json` stretto con `--tighten`. MOB-01
  misura il verdetto VISIBILE (`checkVisibility`): le tab nascoste non contano.
- A 1440 le cinque tab sono quelle di oggi, salvo quattro aggiunte dichiarate: il «−» U+2212 di Divisione (§ 4.5,
  README § 9, 32), la riga d'ambito del calendario sotto il paragrafo di Divisione (14), la didascalia del calendario
  sotto il trio di Tracciamento (14), e le `order-*` tolte (già `desktop:order-none`). Prove qualitative: § 7.

## 3. Non-obiettivi

- B e C; il desktop; Analisi (MOB-06); le primitive (MOB-02: qui si USANO); il tablet (MOB-08); DESIGN.md (MOB-09); le
  finestre delle spese (`lib/utils/expenseWindows.ts`, doc/guide/cashflow.md § Expenses by window).
- Le disclosure fuori dalla griglia restano com'erano, dopo le righe e fuori da «Apri tutte»: Budget › Impostazioni
  (`BudgetTab.tsx:333`), Centri › Archiviati, Dividendi › Dettaglio.
- L'altezza di «Aggiungi» in orizzontale (oggi `h-9`, in un contenitore `desktop:hidden`, `ExpenseTrackingTab.tsx`) è di
  MOB-08 § 4.3: qui solo il suo `onSuccess`. `describeTrackingScope` (§ 4.2) è di questa spec: MOB-06 lo riusa per Analisi.
- Il trasferimento verso un immobile e la spunta «Estinzione anticipata» (2026-10-10) non cambiano né la striscia né le
  sezioni; le commissioni entrano in `ids` dopo i genitori (§ 1).

## 4. Design

### 4.1 Le regole comuni

- **Una composizione per tab**: `useMobileSections({ route: 'cashflow', tab, sections })`, `tab` = il valore dell'URL
  (`tracking`, `budget`, `cost-centers`, `split`, `dividends`) → `mobileSectionsKey('cashflow', tab)`; il dettaglio di un
  centro usa `'cost-centers-center'` (memoria per pagina, mai per centro). Ogni tab ha il suo `PageRest`; `defaultOpen`
  vuoto su ogni tab (tutte chiuse alla prima visita, salvo le `failed`). Una tab in errore di tab (`dividendsError ||
  assetsError`, `expensesError`) è il suo `ErrorNotice` come oggi: nessuna striscia, nessun `PageRest`, nessuna scrittura in memoria.
- **`forceMount` resta.** (1) La memoria regge il cambio di tab. (2) La riga chiusa monta solo il pannello:
  Tracciamento nascosta non tiene più il feed nel DOM. (3) **Id unici**: prefisso per tab (`trk-`, `bud-`, `cdc-`,
  `spl-`, `dvd-`), «Il perché» compreso: invece di `VERDICT_REST_SECTION` (cinque `perche-panel`) ogni
  tab passa `restId: '<prefisso>-perche'` a `useMobileSections` (MOB-02 § 4.1, § 4.3): il pannello è
  `sectionPanelId(restCollapse.id)`, fuori da «Apri tutte». (4) Un `role="alert"` sotto
  `display:none` non si sente: ogni tab riceve `active` e rende `<PageRest key={active ? 'attiva' : 'inattiva'}>`;
  all'attivazione l'alert annuncia solo se `announcement` non è `null`.
- **Ordine: una sequenza sola, il DOM di oggi** (README § 9, 1 e 11): verdetto (con l'asse nello slot `axis`) → LA
  tessera → `PageRest` (subito dopo la cella di LA tessera, `desktop:hidden`) → le righe nell'ordine del DOM. Si tolgono
  gli `order-*` di Budget (`BudgetTab.tsx:253-300`), Centri (`CostCentersTab.tsx:290-313`) e del Dettaglio
  (`CostCenterDetail.tsx:335-371`), che oggi ricalcano già il DOM, e quelli di Dividendi, le cui righe seguono il DOM
  desktop anche sul telefono (§ 4.6). Divisione e Tracciamento non ne hanno.
- **L'asse** sotto `desktop:` è lo slot `axis` di `PageVerdict` (README § 9, 2 e 12): subito sotto il titolo, prima della
  prima frase. Ci vanno il `PeriodPicker` di Tracciamento (con l'«Aggiungi» in orizzontale), quello di Divisione e il
  `SegmentedPill` «Periodo» di Dividendi con il suo «+» 44×44; a 1440 una seconda istanza dello stesso controllo resta
  accanto al verdetto com'è oggi (`hidden desktop:flex`, stessa prop di stato). Budget e Centri non hanno asse: la barra
  d'azione resta fratella dopo il verdetto. **In attesa e in errore** (`ExpenseTrackingTab.tsx:757-781`,
  `ExpenseSplitTab.tsx:112-120`) il wrapper del verdetto resta montato e rende lo slot `axis` attorno a `VerdictSkeleton`
  e all'`ErrorNotice`: il selettore è lo stesso elemento in tutti e tre gli stati e tiene il focus (README § 9, 35). I
  fallback di Dividendi e Divisione (`components/cashflow/CashflowTabSkeletons.tsx`, misurati da `e2e/lazyTabLanding.ts`)
  seguono il nuovo posto dell'asse.
- **La striscia** esce da `select<Page>Strip` nel modulo dei numeri della tab, testo identico a quello della tessera
  (§ 7); mai una cifra fuori dall'asse (**The Off-Axis Tile Rule**); tutta vuota o zero = nessuna striscia (**The
  Absence-Has-Three-Names Rule**). `'approx-currency'` («~1234 €», come `budget/tiles/TettoTile.tsx:110`) e il «−» U+2212
  di `'currency'` sono nel contratto di MOB-02 § 4.1. Una lettura fallita per tessera: `<ErrorNotice
  collapse={collapse(id)} live={!sections.compact}>` nel posto della tessera (MOB-02 § 4.5).
- **Id di LA tessera**: `trk-periodo`, `bud-tetto`, `cdc-totale`, `cdc-centro-costo`, `spl-comune`, `dvd-incasso`.

### 4.2 Tracciamento

- **LA tessera** = Cashflow del periodo (`trk-periodo`). Righe nell'ordine del DOM: `trk-spese` e `trk-entrate` («per
  categoria»), `trk-risparmio` («mese per mese»), `trk-movimenti` (`narrativeToText(describeMovementsCount(…))`: «12 di 24 voci» con un filtro).
- **Striscia** = `selectTracciamentoStrip({ totals })` in `tracciamentoSummary.ts`: Entrate (`currency`, `positive` se > 0,
  apre `trk-entrate`), Spese (`negative` se > 0, `trk-spese`), Risparmio (`currency`, il `−` solo se negativo come il
  trio, `trk-risparmio`), tutte `lifts: { section: 'trk-periodo', block: 'trio' }` (README § 9, 31: il trio sollevato,
  non le spese avvenute). `CashflowPeriodoTile` prende `liftedFigures?: readonly 'trio'[]`: sotto `tablet:` nel trio
  (`CashflowKpiTrio`) si nascondono solo le tre cifre ripetute; quota di risparmio, copertura e delta restano (17). `[]`
  se entrate e spese sono zero. Il blocco «Spese a fine mese» di LA tessera (~X € e il mese scorso) sta dopo il grafico e
  la lettura, sotto la pill.
- **Il calendario** (The Scheduled-Is-Not-Spent Rule; The Binding-Clause Rule, proposta): le tre cifre includono il
  calendario. La riga d'ambito esce da `describeTrackingScope(period: Period, now: Date, scheduled: ScheduledSlice):
  Narrative | null` (nuova, `lib/utils/cashflowNarrative.ts`): `scheduledSentence(scheduled, describeScheduledHorizon(period,
  now))` senza lo spazio iniziale, `null` senza calendario; la pagina la passa come `scope` di `PageVerdict` a ogni
  larghezza (README § 9, 14: a 1440 sta sotto il paragrafo, sopra il trio). `calendarSentence` resta nel seguito.
- **Il taglio**: con calendario e parte vissuta, `leadLength` = la prima frase («A settembre finora …»), che differisce
  dalla striscia nei lati che hanno righe in calendario (uno solo può coincidere: una cifra, sotto la soglia della
  deroga), `restLabel` «dove chiude il periodo». Senza calendario, oppure con il solo calendario (nulla ancora vissuto:
  il verdetto è la sola `calendarSentence`, ramo «Nothing lived yet»), `leadLength: 0`: la prima frase ristamperebbe ≥ 2
  cifre della striscia (README § 9, 3), deroga dichiarata in doc/guide/cashflow-tracciamento.md, `restLabel` «le cifre
  del periodo».
- **Il FAB (e l'«Aggiungi» in orizzontale, stesso dialog) apre Movimenti sulla riga salvata.**
  `ExpenseDialog.onSuccess?: (saved: { id: string; row: Expense } | null) => void` (additivo; oggi `() => void`,
  `:381`, `:2078`): in creazione `createExpenseSettledOnDate` (`lib/services/expenseService.ts:213`) restituisce anche
  `parents: Expense[]`, le righe genitrici come scritte (additivo), e il dialog passa `{ id: ids[0], row: parents[0] }`;
  in modifica `{ id: expense.id, row: { ...expense, ...updatesWithLink, categoryName, subCategoryName, amount: <firmato
  come lo scrive updateExpense> } }` (un id non basta: la lista nel closure precede il refetch, e il gestore passa `row`
  a `filterExpensesByPeriod` e `applyListFilters`, `:387`, `:183`). Se passa e `sections.compact`,
  `reveal('trk-movimenti')` (`behavior: 'auto'` con reduced motion) e `savedRowId` in stato, azzerato nei gestori del
  gesto successivo (cambio di periodo, filtro, «Carica altri», nuovo salvataggio), mai in un effetto. `TransactionFeed`
  riceve `focusRowId?: string | null`; la finestra si allarga nel render (`max(mobileShowCount, indice + 1)`, l'indice in
  `mobileSortedExpenses`); la riga porta `data-expense-id={expense.id}` e l'effetto del feed mette a fuoco il bottone di
  `CompactExpenseRow` quando `focusRowId` compare in `sliced`. **Il focus passa per il modale**: `ExpenseDialog` inoltra
  `returnFocusTo?: RefObject<HTMLElement | null>` a `ResponsiveModal` (additivo); la tab passa un ref che il feed
  aggancia al bottone della riga `savedRowId`, così alla fine dell'uscita il modale non lo riporta sul FAB; se la riga
  non è ancora arrivata, la porta a fuoco l'effetto del feed. Fuori periodo o filtri: nessuna apertura, periodo e filtri
  fermi, solo il toast di successo che esiste (README § 9, 29). In demo `onSuccess` non scatta.
- **Movimenti intera**: aperta è la tessera di oggi (toolbar, feed, «Carica altri»), senza altezza massima né scroll
  interno; il suo picker resta il secondo handle sullo stesso `period`. **La curva cede** (README § 9, 4): sotto
  `desktop:` `FlowBarsChart` ha un'altezza minima di 120 px da una variabile CSS che sostituisce il `minHeight` inline
  (150 a 1440, `FlowBarsChart.tsx:31`), sempre, non solo se la prima riga cade sotto la pill; mai la lettura.

### 4.3 Budget (nessun asse)

- **LA tessera** = Tetto del mese (`bud-tetto`); le righe sono le sezioni meno LA tessera: con tetto `bud-rischio`
  («a fine mese», `budgetNarrative.ts:380`: un budget fisso non segue il ritmo), `bud-avvisi` («soglie di quota» o
  «disattivati»; «superati» mentirebbe senza avvisi), `bud-annuali` («da gennaio», solo con budget annuali,
  `BudgetTab.tsx:285`), `bud-categorie` («budget del mese»); senza tetto LA tessera è `bud-rischio` e le righe sono
  `bud-avvisi`, `bud-annuali`, `bud-categorie`; senza budget LA tessera è `bud-categorie` col suo stato vuoto, senza righe
  e senza `PageRest`. Gli aside di oggi hanno cifre (`describeAnnualAside` «anno al 64%», `:480`; `describeAlertsAside`
  «soglie di quota 90 · 100», `:424`): da chiusa parlano con `describeBudgetClosedAsides`, i testi esatti sopra.
- **Striscia** = `selectBudgetStrip(ceiling)` in `budgetSummary.ts`, due KPI sollevati dal Tetto (`TettoTile.tsx:104-137`;
  `TettoTile` prende `liftedFigures?: readonly ('fine-mese' | 'restano' | 'oltre')[]`, un KPI per blocco, «Al giorno»
  resta): «Fine mese» (`approx-currency`, `negative` se oltre; `null` → `reason` «dal quarto giorno») apre `bud-rischio`;
  «Restano» apre `bud-categorie`; oppure, oltre il tetto, **«Oltre»** (`negative`) apre `bud-avvisi` quando il
  superamento è già avvenuto, e si chiama **«Supererai»** e apre `bud-rischio` quando `crossedOn` è dopo oggi («Lo
  superi il 28…», `budgetNarrative.ts:108`: `exceeded` e `remaining` leggono `spent`, calendario COMPRESO,
  `budgetSummary.ts:84-88`, mentre Avvisi valuta sullo speso a oggi, `budgetUtils.ts:782`) — **The Risk-vs-Fact Rule nella
  striscia** (README § 9, 34). Senza tetto `[]`.
- **Verdetto**: una frase che nomina già il calendario (`budgetNarrative.ts:153-178`): `leadLength` non impostato, nessun
  taglio, anche oltre il tetto dove la frase ristampa le due celle («X € oltre», «chiudi a Y €»: la ripetizione è nel
  verdetto, non nella tessera, README § 9, 33); è lei a qualificare «Restano» (la didascalia «tolte le spese in calendario»
  sparisce col KPI sollevato).
- Lo span `role="status"` del salvataggio (`BudgetTab.tsx:304-312`) esce dall'aside di Per categoria (che da chiusa non si
  rende): è fratello della `section` nella stessa cella, visibile accanto all'aside da aperta o a 1440 e `sr-only` con la
  riga chiusa; resta lo stesso nodo in entrambi gli stati.

### 4.4 Centri di Costo (nessun asse, `?center=`)

- **Elenco**: LA tessera = Totale (`cdc-totale`); righe `cdc-centri` («in ordine di costo»), `cdc-dormienti` («senza spese da tempo»),
  poi Archiviati. **Nessuna striscia** (README § 9, 30): le tre cifre di Totale nominano ognuna la sua finestra (**The
  Whole-Cost Corollary**) e non hanno tre sezioni distinte da aprire.
- **Dettaglio** (Back ritrova l'elenco con le sue righe): LA tessera = Costo (`cdc-centro-costo`); righe
  `cdc-centro-{categorie,ciclo,sottocategorie,movimenti}`.
- **Verdetto**: elenco e dettaglio non si tagliano (`leadLength` non impostato, `rest` = `[]`), anche dove il verdetto ha
  due frasi (elenco senza spese, `HOW_TO_LINK`, `costCenterNarrative.ts:190-196`); «con le spese già in calendario»
  (`:109`) resta visibile perché non c'è taglio; nessun `binding` in `costCenterNarrative.ts` (lo aggiungerà la spec che
  introdurrà un taglio, con il suo test).

### 4.5 Divisione (sul suo asse)

- **LA tessera** = In comune (`spl-comune`); righe `spl-quota` («dalle entrate», dal 2026-09-27) e una per persona
  (`spl-persona-<memberId>`, eyebrow = il nome, `asideWhenClosed` «quanto resta»: oggi senza aside), dentro UNA cella
  della griglia (`ExpenseSplitTab.tsx:245`; MOB-08 la rende `contents` sotto `desktop:`). **Dal 2026-09-27 LA tessera
  porta, sotto l'eroe, un `<dl>` di due righe («Entrate in comune −X €», «Da dividere Y €»; una terza «Avanzano Z €»
  sull'avanzo), presente solo con entrate lasciate in comune (`ExpenseSplitTab.tsx:189`): ~40 px a riga a 390, dentro il
  budget di 1,5 schermate di § 2 (l'eroe resta la spesa lorda, le righe non si chiudono).** Il `−` delle righe è già U+2212.
- **Striscia** = `selectSplitStrip(summary)` in `expenseSplitSummary.ts`: una cella per persona, etichetta = il nome,
  valore = `remainingBooked` (denaro MOSSO, `currency`, tono dal segno), apre la sua riga e solleva la cifra da 32 px
  della sua tessera (`LIFTED_FIGURE_CLASS` in `ExpenseSplitTab`); `[]` quando nessuna persona ha `remainingBooked`
  (base assente, `expenseSplitNarrative.ts:247`: la ragione è già nel verdetto, `describeMissingBasis`) o oltre quattro
  persone; una cella `null` «senza base» compare solo accanto ad almeno un residuo misurato. **Il segno**: la tessera
  stampa il `-` di Intl (`ExpenseSplitTab.tsx:275`), `currency` il `−` U+2212 del trio (`CashflowKpiTrio.tsx:74`): la
  tessera passa al `−` (The Comma Rule, `DESIGN.md:456`) anche a 1440 (README § 9, 32).
- **Il taglio**: `leadLength` = la prima frase (totale in comune, **dal 2026-09-27 la clausola delle entrate in comune
  «meno X € di entrate in comune: Y € da dividere» o «coperte per intero…» — `poolClause`,
  `expenseSplitNarrative.ts:219` — e le quote**, tutto in UNA frase: a 390 la prima frase sale a ~4 righe con la
  clausola; il taglio resta alla prima frase perché le quote sono quote del NETTO e la clausola è ciò che lo dice).
  **`scheduledSentence` esce dalla `sentence` e diventa lo `scope`** (README § 9, 14): `describeSplitScope(summary,
  period, now): Narrative | null` (nuova, `expenseSplitNarrative.ts`) = `scheduledSentence(summary.common.scheduled,
  describeScheduledHorizon(period, now))` senza lo spazio iniziale; la pagina la passa come `scope` a ogni larghezza
  (a 1440 sotto il paragrafo); nessun `binding`. «Con quelle, a fine periodo …» (`:321`) diventa «Con le spese in
  calendario, a fine periodo …», che non ha più l'antecedente nella frase. `calendarClause` (dove il calendario porta il
  residuo) resta nel seguito. MOB-06 fa lo stesso per Analisi.

### 4.6 Dividendi (sul suo asse)

- **LA tessera** = Incasso netto (`dvd-incasso`); righe nell'ordine del DOM di oggi (README § 9, 11: il desktop resta
  identico): `dvd-affidabilita`, `dvd-rendimento` (da chiusa «ultimi 12 mesi»: una finestra, non un importo),
  `dvd-pagatori`, `dvd-per-anno`, `dvd-pagamenti`; poi Dettaglio; gli `order-*` si tolgono. Sotto `desktop:` il
  `SegmentedPill` «Periodo» e il «+» stanno nello slot `axis`. **Nulla registrato** (`DividendTrackingTab.tsx:492`): né
  asse né striscia; LA tessera è Pagamenti con la sua azione, senza `PageRest` e senza scrittura in memoria. Con cedole
  BTP Italia/BTP€i provvisorie (`ProvisionalCouponBanner`, un'azione richiesta, dentro Pagamenti) `dvd-pagamenti` è fra i
  `defaultOpen`.
- **Striscia: nessuna** (README § 9, 30). Ricevuti e annunciati mai una cifra: due celle o nessuna, e le due stanno già in
  cima a LA tessera, sulla finestra del periodo, nel loro materiale (**The Received-vs-Announced Rule**). Il Rendimento
  non segue l'asse: mai in striscia. **Verdetto**: una frase (`dividendiNarrative.ts:262-299`): `leadLength` non
  impostato, nessun taglio.
- **Lettura fallita**: `statsError` → `dvd-rendimento` `failed` (aperta a ogni visita, eyebrow rosso da chiusa): sotto
  `desktop:` il pannello è `<ErrorNotice collapse={collapse('dvd-rendimento')} live={false}>` al posto di
  `RendimentoTile` (il ramo `isError` di `RendimentoTile.tsx:68-71`, col suo `role="alert"`, resta solo a 1440); il
  Dettaglio in errore resta visibile con `live={!sections.compact}`. È la prova nel browser dell'eyebrow rosso.

### 4.7 Conflitti con PERF

- **Le spese per finestra** (in develop dal 2026-09-30, `lib/utils/expenseWindows.ts`; doc/guide/cashflow.md
  § Expenses by window): la striscia legge i riassunti delle tessere, quindi la stessa finestra della tab; il FAB rivela
  solo righe del periodo, dopo il refetch per prefisso (`expenses.all`). Divisione legge la finestra del SUO periodo
  con una `useExpensesInRange` propria (`ExpenseSplitTab.tsx:85-91`, `trackingWindow(period)`): la stessa chiave di
  Tracciamento solo quando i due mostrano lo stesso periodo, mai un mese letto vuoto. Il periodo di Tracciamento vive in
  `app/dashboard/cashflow/page.tsx` (`period`/`onPeriodChange` sono prop della tab): la striscia lo riceve da lì.
- **Dal 2026-09-29** gli asset della tab vengono da `useAssets` (`page.tsx:104, 134`) e, dal 2026-10-05, la lista viene da
  `useDividendRegistry` (`lib/hooks/useDividendStats.ts`, la stessa richiesta delle misure): `dividendsError ||
  assetsError` è l'errore di TAB; il `failed` di `dvd-rendimento` è `statsError` di `useDividendStats`, vero anche
  quando la risposta arriva con la lista e `stats: null`. **PERF-04**: qui niente recharts
  (SVG a mano, `FlowBarsChart.tsx:27`): una riga chiusa risparmia DOM e render, non un chunk; `e2e/bundle.lazy.mobile.spec.ts`
  (`:17` Analisi, `:29` Dividendi) ed `e2e/lazyTabLanding.ts` si rilanciano dopo lo spostamento dell'asse. **PERF-03** (in develop dal
  2026-09-30): «Aggiornato alle…» sta nel `PageHeader` della pagina (le quattro chiavi di `app/dashboard/cashflow/page.tsx`),
  non nel tab; la striscia legge le stesse cifre vecchie delle tessere. **PERF-12** (in develop dal 2026-10-06, AGENTS.md § Motion): niente `setState` in effetto. **PERF-14** (in develop dal 2026-10-08, AGENTS.md § Motion): nessun `layout`; `tabPanelSwitch` resta.
- **Da `tablet:` a 1439** il trio torna intero accanto alla striscia (README § 9 «torna intera dal tablet»), righe chiuse.

### 4.8 Decisioni (README § 9)

Tutte le domande di questa spec sono chiuse: la deroga `leadLength: 0` senza calendario (3); Divisione con lo `scope`
(14); la spesa fuori periodo (29); la didascalia a ogni larghezza (14); la curva a 120 px sotto `desktop:` (4); Dividendi
e Centri senza striscia (30); il trio sollevato (31); «Supererai»/«Oltre» (34); il «−» di Divisione a 1440 (32); Budget
oltre il tetto con la frase intera (33); l'ordine di Dividendi = DOM (11); l'asse in attesa ed errore (35).

## 5. File da toccare

- `app/dashboard/cashflow/page.tsx` (`active`).
- `components/cashflow/{ExpenseTrackingTab,TransactionFeed,BudgetTab,CostCentersTab,CostCenterDetail,ExpenseSplitTab,CashflowTabSkeletons}.tsx`,
  `components/cashflow/tiles/*` (`CashflowPeriodoTile`, `CashflowKpiTrio`, `FlowBarsChart`), `budget/tiles/*` (`TettoTile`), `cost-centers/tiles/*`;
  `components/expenses/ExpenseDialog.tsx` (`onSuccess`, `returnFocusTo`); `lib/services/expenseService.ts` (`parents`);
  `components/dividends/DividendTrackingTab.tsx`, `dividends/tiles/*`.
- `lib/utils/{tracciamentoSummary,cashflowNarrative,budgetSummary,budgetNarrative,expenseSplitSummary,
  expenseSplitNarrative,costCenterNarrative,dividendiNarrative}.ts`; i test di § 7 e `__tests__/expenseService*.test.ts`;
  `e2e/mobile-composition.cashflow.mobile.spec.ts` e `e2e/mobile-composition.cashflow.split.mobile.spec.ts` (nuove);
  `doc/mobile/budget.json`.

## 6. Passi

1. Branch; guide; `mobile:census` PRIMA (fixture); la finestra di Divisione com'è (§ 4.7). 2. Pure e test, falsificati.
3. `page.tsx`, gli slot di `PageVerdict`. 4. Tracciamento con il FAB, Budget, Dividendi, Divisione, Centri.
5. Spec Playwright, `bundle.lazy.mobile` e `lazyTabLanding`. 6. `mobile:census`/`mobile:budget -- --tighten`, `perf:budget`, giro sul mirror, documentazione, commit proposto.

## 7. Test e falsificazione

- `__tests__/tracciamentoSummary.test.ts`: `selectTracciamentoStrip` (3 celle, `[]` a zero, `validateStrip` pulito);
  **identità**: `narrativeToText([formatStripFigure(f)])` = il valore del trio a positivo, negativo (U+2212), zero (senza
  segno) (falsificare con l'euro non compatto). `cashflowNarrative.test.ts`: `leadLength` 0 senza calendario e con il solo
  calendario, alla prima frase con calendario e parte vissuta (falsificare con `leadLength` sempre alla prima frase);
  `describeTrackingScope` non nulla con `scheduled` > 0, nulla a zero, testo senza spazio iniziale (falsificare
  restituendo `null`); i due `restLabel`.
- `budgetSummary.test.ts`: «Restano» → `bud-categorie`, «Oltre» → `bud-avvisi` con `crossedOn` ≤ oggi, «Supererai» →
  `bud-rischio` con `crossedOn` dopo oggi, «Fine mese» → `bud-rischio`, `null` → `reason` (falsificare scambiando
  `opens`). `budgetNarrative.test.ts`: `describeBudgetClosedAsides` restituisce i testi esatti «a fine mese», «soglie di
  quota» / «disattivati», «da gennaio», «budget del mese», nessuno con `\d`; falsificare restituendo `describeAnnualAside`
  («64%») e `describeAlertsAside` («90 · 100»); `leadLength` assente anche oltre il tetto.
- `expenseSplitSummary.test.ts`: una cella per persona, `[]` senza base e oltre quattro, `null` «senza base» accanto a un
  residuo; identità col testo della tessera anche sul negativo (U+2212); +100 contabilizzati e −100 sul periodo → +100
  `positive` (falsificare leggendo `remaining`). `expenseSplitNarrative.test.ts`: la `sentence` non contiene più
  `scheduledSentence`, `describeSplitScope` non nulla con `common.scheduled` > 0, «Con le spese in calendario»
  (falsificare lasciando la frase nella `sentence`). `dividendiNarrative`, `costCenterNarrative`: `leadLength` assente,
  `rest` vuoto, aside chiusi (falsificare: `leadLength` a metà).
- `__tests__/expenseService*.test.ts`: `createExpenseSettledOnDate` restituisce `parents` con le righe genitrici, le
  commissioni escluse (falsificare includendole).
- **`e2e/mobile-composition.cashflow.mobile.spec.ts`** (progetto `mobile`, account base, `playwright.config.ts:187-200`):
  (1) Tracciamento: titolo, 3 celle ≥ 44 px col testo dei VALORI del trio nascosto (quota e copertura visibili), 4
  trigger chiusi, `#trk-movimenti-panel` vuoto e `inert`; una spesa a fine mese con la nota esca piantata via REST (tolta
  prima e dopo) rende visibile lo `scope` «Nel totale …»; (2) FAB → spesa di oggi con nota esca (tolta via REST prima e
  dopo, come `cashflow.dividendi.mobile.spec.ts`) → Movimenti aperta, `document.activeElement` sul bottone della riga
  dopo 1 s dalla chiusura; (3) Budget: l'account base non ha tetto (`cashflow.budget.mobile.spec.ts:22`), il test lo
  scrive e lo toglie; «Fine mese» apre Categorie a rischio (anche `null`); (4) una riga di Budget aperta → Tracciamento →
  Budget → reload: aperta, `localStorage['mobile-sections:cashflow:budget']`; (5) l'ordine delle `y` delle righe di
  Dividendi è l'ordine del DOM (Affidabilità prima di Rendimento), nessun `[class*="order-"]`; (6) l'account base non ha
  dividendi (niente Rendimento): cedola esca via REST, poi la risposta di `/api/dividends/stats` riscritta con `stats:
  null` (`page.route` + `route.fetch()` + `route.fulfill({ response, json })`, come `e2e/panoramica.snapshot.spec.ts` —
  NON `r.abort()`: dal 2026-10-05 quella richiesta porta anche la lista, e abortirla è l'errore di TAB): Rendimento
  aperta, chiusa → eyebrow `text-destructive`, un solo `role="alert"`; (7) `reducedMotion: 'reduce'` →
  `transition-duration` 0s; (8) `main` senza sforamento. Rossi falsificando: (1) il trio senza `LIFTED_FIGURE_CLASS`;
  (2) `handleSuccess` senza `reveal` (Movimenti chiusa) e senza `returnFocusTo` (focus sul FAB); (5) un `order-2`
  rimesso su Rendimento; (6) `failed` letto da `dividendsError` invece che da `statsError`.
- **`e2e/mobile-composition.cashflow.split.mobile.spec.ts`** (progetto `split-mobile`, account split, `:128-137`), su
  «Anno corrente» (il fixture vale sull'anno, `scripts/seedSplitE2E.mts:12-27`): due celle, Ghiandaia «2200 €» e Tarsio
  «500 €» `positive` (non «−100 €», il residuo del periodo; falsificare leggendo `remaining`); lo `scope` del calendario
  visibile sotto il paragrafo a 390 (e, in `cashflow.split.spec.ts`, a 1440); Tracciamento e Divisione visitate, entrambe
  con «Il perché», nessun `id` duplicato in `main` (falsificare passando a entrambe il `restId` di default: due
  `perche-panel`). `cashflow.centri.mobile.spec.ts` (`centri-mobile`, `:140-149`): elenco e dettaglio, Back. Riscritte
  (aprono la riga prima di leggere): `cashflow{,.budget,.dividendi}.mobile.spec.ts`; rilanciate verdi:
  `bundle.lazy.mobile.spec.ts`, `cashflow.split{,.mobile}.spec.ts` (`expectDividendsTabLandsInPlace`,
  `expectSplitTabLandsInPlace`). A 1440: le desktop.

## 8. Collaudo guidato

- A: le spec desktop di Cashflow, Vitest nei due fusi. C: § 7.
- F (mirror; DevTools a 390 sul portatile): 1) Tracciamento: striscia, «Nel totale…» se c'è calendario, prima riga sopra
  la pill; 2) il «+» → la spesa salvata davanti; 3) Budget: le due celle aprono la tessera giusta; 4) cambiare tab e
  ricaricare: righe ricordate; 5) Dividendi e Divisione, e 1440 come prima. G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Tracciamento sta sopra la pill per 16–36 px (A-notes): un titolo su tre righe la spinge sotto; cede la curva (120 px),
  mai la lettura; Budget (senza curva) registra `firstClosedRowAbovePill: false` con `raisedBy` quando il census lo
  misura sotto la pill (README § 9, 19).
- Rollback: `collapse` sempre `undefined` riporta una tab a oggi; una striscia si toglie con `[]`; lo `scope` di
  Divisione si rimette nella `sentence` per lettera.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest» e § Current Status; le cinque guide di tab § Composizione mobile e § Per-page blind spots (il trio che
  perde le tre cifre a 390, Dividendi senza striscia, la deroga «solo titolo» di Tracciamento dichiarata); `doc/guide/cashflow.md`
  (`forceMount`, memoria per tab); `doc/guide/e2e-emulatori.md` (le spec; la risposta di `/api/dividends/stats` riscritta
  con `stats: null` via `route.fetch()` + `route.fulfill`, mai `abort`, che è l'errore di tab); doc/guide/shell.md
  § Navigation (id prefissati, `active`); doc/guide/dialog.md (`returnFocusTo` di `ExpenseDialog`); `Draft Release
  Temp.md` (una riga per tab, senza dati privati); `doc/mobile/README.md` § 6 e § 3.1.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-04-cashflow-cinque-tab.md: la composizione mobile delle cinque
tab di Cashflow con le primitive di MOB-02 (Tracciamento con il trio nella striscia e il calendario come riga d'ambito
describeTrackingScope, il «+» che apre Movimenti sulla riga salvata con onSuccess(saved) e returnFocusTo; Budget con
la Risk-vs-Fact nella striscia, «Supererai»/«Oltre»; Centri e Dividendi senza striscia; Divisione con scheduledSentence
come scope e il «−» U+2212), l'asse nello slot axis anche in attesa ed errore, le tab forceMount con id prefissati e
memoria per tab, le order-* tolte, e2e/mobile-composition.cashflow.mobile.spec.ts e
e2e/mobile-composition.cashflow.split.mobile.spec.ts.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § React Query and Derived State,
  § Motion, § Navigation, § Hierarchy, Density and Disclosure — l'ordine del DOM è README § 9, 11 —, § Accessibility,
  § Browser-Driven E2E (Playwright), § Performance tooling), CLAUDE.md
- Leggi doc/guide/cashflow.md, cashflow-tracciamento.md, cashflow-budget.md, centri-di-costo.md, cashflow-divisione.md,
  cashflow-dividendi.md, stati.md, dialog.md, e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/mobile/README.md (§ 9: le decisioni 1–35), MOB-01, MOB-02 e MOB-03 (chiuse; MOB-02 è il contratto: non
  rinominare nulla; MOB-03 ha scritto describeScheduledCaption e il binding di salesNarrative) e questa spec per
  intero; DESIGN.md § 5 e § 6 (MAI rigenerarlo); riverifica le righe di ExpenseDialog.tsx (onSuccess :381/:2078, ids
  :2034 con le commissioni dopo i genitori, dal 2026-10-10)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; nessuna domanda è aperta (README
§ 9): una scelta nuova che il codice ti impone me la chiedi con lo strumento interattivo prima di toccare le tab; cifre
tonde inventate nei test, mai quelle del mirror.
Chiusura: mobile:census e mobile:budget prima/dopo sul fixture, --tighten; tsc, lint 0, Vitest in Europe/Rome e sotto
TZ=UTC; le spec Playwright di § 7 con le falsificazioni viste rosse (dimmi quali); npm run perf:build e perf:budget --
--dist=.next-perf prima e dopo (da Git Bash; /dashboard/cashflow ha un tetto: si alza solo con raisedBy e il mio OK);
giro guidato di 5 punti sul mirror, poi mirror:remove; la documentazione di § 10 in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort xhigh.** Cinque tab con regole di dominio dense (il calendario dentro i totali, ricevuti e
annunciati, rischio e fatto, il denaro mosso) che la composizione deve spostare senza cambiarne il senso.
