# MOB-04 — Cashflow: le cinque tab

> Stato: da fare · Priorità: 2 (Tracciamento è la pagina del telefono: l'unica con il «+») · Sforzo: L · Dipende da:
> MOB-02, PERF-06 (e MOB-01 per la misura) · Sblocca: MOB-08 (`e2e/cashflow.tablet.spec.ts`), MOB-09

## 1. Il problema, misurato

Censimento 2026-09-26 a 390×844 (`doc/mobile/README.md` § 3), schermate / tessere / cifre sopra la piega: Tracciamento
4,34 / 5 / 16 (Movimenti alta 1587 px); Budget 3,27 / 5 / 15; Centri 1,92 / 3 / 10; Divisione 1,90 / 4 / 19;
Dividendi 3,77 / 6 / 8. Il codice di oggi (righe da riverificare):

- `app/dashboard/cashflow/page.tsx:93`: Tracciamento sempre montata, le altre alla prima visita (`mountedTabs`);
  `:379-501` cinque `TabsContent forceMount`, l'inattiva `display:none` (`components/ui/tabs.tsx:47`); una tab spenta
  ricade su Tracciamento (`:254-255`).
- `components/cashflow/ExpenseTrackingTab.tsx:272-279`: il FAB (`BottomNavigation.tsx:42`) apre il dialog e basta;
  `onSuccess` non dice cosa ha salvato (`components/expenses/ExpenseDialog.tsx:375`, `:2022`) benché gli id ci siano
  (`:1977-1987`); la riga del feed non porta il suo id (`TransactionFeed.tsx:480`).
- `ExpenseTrackingTab.tsx:1026-1044`: il trio (`tiles/CashflowKpiTrio.tsx:53-92`, via `CashflowPeriodoTile.tsx:69`)
  stampa i totali del PERIODO, calendario compreso; il verdetto (`lib/utils/cashflowNarrative.ts:385-418`) giudica la
  parte vissuta e col calendario chiude con `calendarSentence` (`:345-372`). `:800-806`: il secondo handle sul `period`.
- `ExpenseSplitTab.tsx:89`: Divisione ha un `period` SUO; `expenseSplitNarrative.ts:286` mette «Nel totale ci sono ancora
  X € … in calendario» (qualifica «In comune») dopo i residui. `BudgetTab.tsx:309`: il `role="status"` del salvataggio
  sta nell'aside di Per categoria. `DividendTrackingTab.tsx:211`: `/api/dividends/stats` è l'unica lettura PER TESSERA.

## 2. Obiettivo misurabile

- `npm run mobile:budget` a 390: Tracciamento, Budget, Dividendi **≤ 2,0** schermate, Centri e Divisione **≤ 1,5**; su
  tutte ≤ 5 cifre fuori dal verdetto (la striscia conta fuori dal verdetto: MOB-01 § 4) e `firstClosedRowAbovePill: true`;
  `budget.json` abbassato. MOB-01 misura il verdetto VISIBILE (`checkVisibility`): le tab nascoste non contano.
- A 1440 le cinque tab sono quelle di oggi (salvo § 4.8, 4, e il segno di Divisione, § 4.5). Prove qualitative: § 7.

## 3. Non-obiettivi

- B e C; il desktop; Analisi (MOB-06); le primitive (MOB-02: qui si USANO); il tablet (MOB-08); DESIGN.md (MOB-09); le
  finestre delle spese (`lib/utils/expenseWindows.ts`, doc/guide/cashflow.md § Expenses by window).
- Le disclosure fuori dalla griglia restano com'erano, dopo le righe e fuori da «Apri tutte»: Budget › Impostazioni
  (`BudgetTab.tsx:333`), Centri › Archiviati, Dividendi › Dettaglio.
- L'altezza di «Aggiungi» in orizzontale (`h-11 desktop:h-9`, `ExpenseTrackingTab.tsx:1017`) è di MOB-08 § 4.3: qui solo
  il suo `onSuccess`. Il `binding` di `scheduledSentence` invece è di questa spec (§ 4.5): MOB-06 lo eredita per Analisi.

## 4. Design

### 4.1 Le regole comuni

- **Una composizione per tab**: `useMobileSections({ route: 'cashflow', tab, sections })`, `tab` = il valore dell'URL
  (`tracking`, `budget`, `cost-centers`, `split`, `dividends`) → `mobileSectionsKey('cashflow', tab)`; il dettaglio di un
  centro usa `'cost-centers-center'` (memoria per pagina, mai per centro). Ogni tab ha il suo `PageRest`.
- **`forceMount` resta.** (1) La memoria regge il cambio di tab. (2) La riga chiusa monta solo il pannello:
  Tracciamento nascosta non tiene più il feed nel DOM. (3) **Id unici**: prefisso per tab (`trk-`, `bud-`, `cdc-`,
  `spl-`, `dvd-`), «Il perché» compreso: invece di `VERDICT_REST_SECTION` (cinque `perche-panel`) ogni
  tab passa `restId: '<prefisso>-perche'` a `useMobileSections` (MOB-02 § 4.1, § 4.3): il pannello è
  `sectionPanelId(restCollapse.id)`, fuori da «Apri tutte». (4) Un `role="alert"` sotto
  `display:none` non si sente: ogni tab riceve `active` e rende `<PageRest key={active ? 'attiva' : 'inattiva'}>`.
- **Ordine**: DOM desktop; sotto `desktop:` verdetto → barra d'azione/asse di oggi → LA tessera `order-1` → `PageRest`
  `order-2` → righe `order-3…` nell'ordine mobile di oggi. **L'asse** va dove dice MOB-02 § 4.9, 9 (la risposta è in
  `doc/mobile/README.md`): slot `axis` sotto il titolo, o fratello DOPO il verdetto com'è oggi.
- **La striscia** esce da `select<Page>Strip` nel modulo dei numeri della tab, testo identico a quello della tessera
  (§ 7); mai una cifra fuori dall'asse (**The Off-Axis Tile Rule**); tutta vuota o zero = nessuna striscia (**The
  Absence-Has-Three-Names Rule**). `'approx-currency'` («~1234 €», come `budget/tiles/TettoTile.tsx:110`)
  è nel contratto di MOB-02 § 4.1.

### 4.2 Tracciamento

- **LA tessera** = Cashflow del periodo (`trk-periodo`). Righe: `trk-spese` e `trk-entrate` («per categoria»),
  `trk-risparmio` («mese per mese»), `trk-movimenti` (`narrativeToText(describeMovementsCount(…))`: «12 di 24 voci» con un filtro).
- **Striscia** = `selectTracciamentoStrip({ totals })` in `tracciamentoSummary.ts`: Entrate (`currency`, `positive` se > 0,
  apre `trk-entrate`), Spese (`negative` se > 0, `trk-spese`), Risparmio (`currency`, il `−` solo se negativo come il
  trio, `trk-risparmio`), tutte `lifts: { section: 'trk-periodo', block: 'trio' }`: il trio sparisce sotto `tablet:`
  (delta, quota e copertura restano in frase e lettura). `[]` se
  entrate e spese sono zero. **Il brief diceva «spese avvenute»** (`settleTotals`, `tracciamentoSummary.ts:83`): domanda 7.
- **Il calendario** (The Scheduled-Is-Not-Spent Rule; The Binding-Clause Rule, proposta): le tre cifre includono il
  calendario. Con `scheduled` > 0 la `scope` di `PageVerdict` è `scheduledSentence(scheduled,
  describeScheduledHorizon(period, now))` (`cashflowNarrative.ts:241`, «Nel totale ci sono ancora …», senza lo spazio
  iniziale): la didascalia delle tre cifre, sempre visibile. `calendarSentence` resta nel seguito.
- **Il taglio**: `leadLength` = la prima frase (decisione 4, come MOB-03), `restLabel` «dove chiude il periodo». Col
  calendario la prima frase («A settembre finora …») è diversa dalla striscia; senza, la ripete: la deroga
  `leadLength: 0` (solo il titolo sopra la striscia) è la domanda 1, comune a MOB-03 e MOB-05.
- **Il FAB (e l'«Aggiungi» in orizzontale, `:1017`, stesso dialog) apre Movimenti sulla riga salvata.**
  `ExpenseDialog.onSuccess?: (saved: { id: string; row: Expense } | null) => void` (additivo; modifica → `expense.id`,
  creazione → `ids[0]`): un id non basta e la lista nel closure precede il refetch, quindi il gestore passa `row` per
  `filterExpensesByPeriod` e `applyListFilters` (`:387`, `:183`); se passa e `compact`, `reveal('trk-movimenti')` e
  `savedRowId` in stato. La finestra si allarga nel render (`max(mobileShowCount, indice + 1)`, `:649`); la riga porta
  `data-expense-id`, un effetto del feed la porta a fuoco quando arriva. Fuori periodo o filtri: il toast, periodo fermo.
- **Movimenti intera**: aperta è la tessera di oggi (toolbar, feed, «Carica altri»), senza altezza massima né scroll
  interno; il suo picker resta il secondo handle sullo stesso `period`. Se la prima riga chiusa cade sotto la pill,
  `FlowBarsChart` scende a 100 px sotto `tablet:` (oggi `minHeight` 150 inline, `FlowBarsChart.tsx:31`: una variabile
  CSS); mai la lettura (A-notes, rischio 5).

### 4.3 Budget (nessun asse)

- **LA tessera** = Tetto del mese; senza tetto Categorie a rischio; senza budget Per categoria col suo stato vuoto.
  Righe: `bud-rischio` («a fine mese», l'aside di oggi, `budgetNarrative.ts:380`: un budget fisso non segue il ritmo),
  `bud-avvisi` («soglie di quota» o «disattivati»; «superati» mentirebbe senza avvisi), `bud-annuali` («da gennaio»),
  `bud-categorie` («budget del mese»): gli aside di oggi hanno cifre (`:424`, `:480`), da chiusa parlano con
  `describeBudgetClosedAsides`.
- **Striscia** = `selectBudgetStrip(ceiling)` in `budgetSummary.ts`, due KPI sollevati dal Tetto (`TettoTile.tsx:104-137`):
  «Fine mese» (`approx-currency`, `negative` se oltre; `null` → `reason` «dal quarto giorno») apre `bud-rischio`;
  «Restano» apre `bud-categorie`, oppure «Oltre» (`negative`) apre `bud-avvisi`. **The Risk-vs-Fact Rule nella
  striscia**: una proiezione apre solo «Categorie a rischio», un fatto solo «Avvisi». «Al giorno» resta; senza tetto `[]`.
  Ma `exceeded` e `remaining` leggono `spent`, calendario COMPRESO (`budgetSummary.ts:84-88`): con `crossedOn` oltre oggi
  («Lo superi il 28…», `budgetNarrative.ts:108`) «Oltre» è un rischio e Avvisi non lo dà superato: domanda 8.
- **Verdetto**: una frase che nomina già il calendario (`budgetNarrative.ts:153-178`): `leadLength` = tutta; è lei a
  qualificare «Restano» (la didascalia «tolte le spese in calendario» sparisce col KPI sollevato).
- Il `role="status"` del salvataggio resta montato (`sr-only`) mentre `bud-categorie` è chiusa.

### 4.4 Centri di Costo (nessun asse, `?center=`)

- **Elenco**: LA tessera = Totale; righe `cdc-centri` («in ordine di costo»), `cdc-dormienti` («senza spese da tempo»),
  poi Archiviati. **Nessuna striscia**: le tre cifre di Totale nominano ognuna la sua finestra (**The Whole-Cost
  Corollary**) e non hanno tre sezioni distinte da aprire.
- **Dettaglio** (Back ritrova l'elenco con le sue righe): LA tessera = Costo; righe
  `cdc-centro-{categorie,ciclo,sottocategorie,movimenti}`.
- **Verdetto**: elenco e dettaglio sono UNA frase (`costCenterNarrative.ts:240`, `:345`): `leadLength` = tutta, e «con le
  spese già in calendario» (`:109`) resta visibile; la si marca `binding` per un taglio futuro.

### 4.5 Divisione (sul suo asse)

- **LA tessera** = In comune (`spl-comune`); righe `spl-quota` («dalle entrate», dal 2026-09-27) e una per persona
  (`spl-persona-<memberId>`, eyebrow = il nome, `asideWhenClosed` «quanto resta»: oggi senza aside), dentro UNA cella
  della griglia (`ExpenseSplitTab.tsx:245`): l'`order-*` va sul contenitore. **Dal 2026-09-27 LA tessera porta, sotto
  l'eroe, un `<dl>` di due righe («Entrate in comune −X €», «Da dividere Y €»; una terza «Avanzano Z €» sull'avanzo),
  presente solo con entrate lasciate in comune (`ExpenseSplitTab.tsx:189`): ~40 px a riga a 390, dentro il budget
  di 1,5 schermate di § 2 (l'eroe resta la spesa lorda, le righe non si chiudono).** Il `−` delle righe è già U+2212.
- **Striscia** = `selectSplitStrip(summary)` in `expenseSplitSummary.ts`: una cella per persona, etichetta = il nome,
  valore = `remainingBooked` (denaro MOSSO, `currency`, tono dal segno), apre la sua riga e solleva la cifra da 32 px
  della sua tessera; senza base `null` con `reason` «senza base»; oltre quattro persone `[]`. **Il segno**: la tessera
  stampa il `-` di Intl (`ExpenseSplitTab.tsx:275`), `currency` il `−` U+2212 del trio (`CashflowKpiTrio.tsx:74`): la
  tessera passa al `−` (The Comma Rule, `DESIGN.md:455`), anche a 1440, o l'identità di § 7 è rossa sul negativo.
- **Il taglio**: `leadLength` = la prima frase (totale in comune, **dal 2026-09-27 la clausola delle entrate in comune
  «meno X € di entrate in comune: Y € da dividere» o «coperte per intero…» — `poolClause`,
  `expenseSplitNarrative.ts:219` — e le quote**, tutto in UNA frase: a 390 la prima frase sale a ~4 righe con la
  clausola; il taglio resta alla prima frase perché le quote sono quote del NETTO e la clausola è ciò che lo dice).
  `scheduledSentence` qualifica «In comune», già stampato lì: i suoi segmenti sono **`binding`** e `splitVerdict` annulla
  il taglio (domanda 2). La funzione è condivisa con Analisi (`analisiNarrative.ts:298`, `:334`): MOB-06 eredita il
  marchio. `calendarClause` (dove il calendario porta il residuo) è un altro fatto: seguito.

### 4.6 Dividendi

- **LA tessera** = Incasso netto; righe nell'ordine mobile di oggi: `dvd-rendimento` (da chiusa «ultimi 12 mesi»: una
  finestra, non un importo), `dvd-pagatori`, `dvd-affidabilita`, `dvd-per-anno`, `dvd-pagamenti`; poi Dettaglio. Nulla
  registrato (`DividendTrackingTab.tsx:492`): la sola Pagamenti con la sua azione.
- **Striscia: nessuna** (proposta). Ricevuti e annunciati mai una cifra: due celle o nessuna, e le due stanno già in
  cima a LA tessera, sulla finestra del periodo, nel loro materiale (**The Received-vs-Announced Rule**). Il Rendimento
  non segue l'asse: mai in striscia. **Verdetto**: una frase (`dividendiNarrative.ts:262-299`): `leadLength` = tutta.
- **Lettura fallita**: `statsError` → `dvd-rendimento` `failed` (aperta a ogni visita, eyebrow rosso da chiusa); il
  Dettaglio in errore resta visibile con `live={!compact}`. È la prova nel browser dell'eyebrow rosso.

### 4.7 Conflitti con PERF

- **Le spese per finestra** (in develop dal 2026-09-30, `lib/utils/expenseWindows.ts`; doc/guide/cashflow.md
  § Expenses by window): la striscia legge i riassunti delle tessere, quindi la stessa finestra della tab; il FAB rivela
  solo righe del periodo, dopo il refetch per prefisso (`expenses.all`). Divisione legge la finestra del SUO periodo
  con una `useExpensesInRange` propria (`ExpenseSplitTab.tsx:85-91`, `trackingWindow(period)`): la stessa chiave di
  Tracciamento solo quando i due mostrano lo stesso periodo, mai un mese letto vuoto. Il periodo di Tracciamento vive in
  `app/dashboard/cashflow/page.tsx` (`period`/`onPeriodChange` sono prop della tab): la striscia lo riceve da lì.
- **Dal 2026-09-29** gli asset della tab vengono da `useAssets` (`page.tsx:104, 134`) e `loadOtherData` legge solo la
  route dei dividendi: `otherDataFailed || assetsError` è l'errore di TAB; il
  `failed` di `dvd-rendimento` è `statsError` di `useDividendStats`, già React Query. **PERF-04**: qui niente recharts
  (SVG a mano, `FlowBarsChart.tsx:27`): una riga chiusa risparmia DOM e render, non un chunk. **PERF-03** (in develop dal
  2026-09-30): «Aggiornato alle…» sta nel `PageHeader` della pagina (le quattro chiavi di `app/dashboard/cashflow/page.tsx`),
  non nel tab. **PERF-12**: niente `setState` in effetto. **PERF-14**: nessun `layout`; `tabPanelSwitch` resta.

### 4.8 Domande al proprietario

1. Tracciamento senza calendario: solo il titolo sopra la striscia (`leadLength: 0`), o anche la prima frase che ripete **Deciso il 2026-09-27 (doc/mobile/README.md § 9): deroga ammessa e dichiarata quando la prima frase ristamperebbe ≥ 2 cifre della striscia.**
   le tre cifre? (Comune a MOB-03 § 4.6, 1 e MOB-05 § 4.8, 1: una risposta per le tre.)
2. Divisione con spese in comune in calendario: paragrafo intero (proposta), o «di cui X € in calendario» sotto l'eroe di
   In comune e il taglio resta? (Allora «Con quelle, …», `expenseSplitNarrative.ts:339`, perde l'antecedente.)
3. Spesa salvata fuori dal periodo o dai filtri: nessuna apertura e periodo fermo (proposta)?
4. La didascalia del calendario anche a 1440 sul trio, come MOB-03 sulla Panoramica, o solo `scope` sotto `desktop:`?
5. Se Tracciamento resta sotto la pill con il grafico a 100 px: eccezione in `budget.json` o grafico più basso?
6. Dividendi e Centri senza striscia: va bene?
7. Il brief vuole la striscia di Tracciamento su «entrate, spese avvenute, risparmio»; la spec solleva il trio (totali
   col calendario, che la guida fa riconciliare alla seconda frase del verdetto, qui alla `scope`). Con le avvenute il
   trio non si solleva (cifre diverse) e la striscia ripete la prima frase («finora … entrate, spese»). Quale?
8. Budget, «Oltre» superato solo dal calendario: quale sezione apre? Avvisi valuta il tetto sullo speso a oggi
   (`budgetUtils.ts:782`), Categorie a rischio elenca categorie.

## 5. File da toccare

- `app/dashboard/cashflow/page.tsx` (`active`).
- `components/cashflow/{ExpenseTrackingTab,TransactionFeed,BudgetTab,CostCentersTab,CostCenterDetail,ExpenseSplitTab}.tsx`,
  `components/cashflow/tiles/*`, `budget/tiles/*`, `cost-centers/tiles/*`; `components/expenses/ExpenseDialog.tsx`;
  `components/dividends/DividendTrackingTab.tsx`, `dividends/tiles/*`.
- `lib/utils/{tracciamentoSummary,cashflowNarrative,budgetSummary,budgetNarrative,expenseSplitSummary,
  expenseSplitNarrative,costCenterNarrative,dividendiNarrative}.ts`; i test di § 7; `doc/mobile/budget.json`.

## 6. Passi

1. Branch; guide; `mobile:census` PRIMA; la finestra di Divisione com'è (§ 4.7); le domande di § 4.8. 2. Pure e
test, falsificati. 3. `page.tsx`, `PageVerdict`. 4. Tracciamento con il FAB, Budget, Dividendi, Divisione, Centri.
5. Spec Playwright. 6. `mobile:census`/`mobile:budget`, giro sul mirror, documentazione, commit proposto.

## 7. Test e falsificazione

- `__tests__/tracciamentoSummary.test.ts`: `selectTracciamentoStrip` (3 celle, `[]` a zero, `validateStrip` pulito);
  **identità**: `narrativeToText([formatStripFigure(f)])` = il valore del trio a positivo, negativo, zero (falsificare
  con l'euro non compatto). `cashflowNarrative.test.ts`: `leadLength` alla prima frase (0 senza calendario se la domanda 1 dà la deroga); con
  `scheduled` > 0 la `scope` esiste sempre (togliendola → rosso).
- `budgetSummary.test.ts`: «Restano» → `bud-categorie`, «Oltre» → `bud-avvisi`, «Fine mese» → `bud-rischio`, `null` →
  `reason` (falsificare scambiando `opens`). `budgetNarrative.test.ts`: aside chiusi senza cifre (falsificare
  restituendo `describeAlertsAside`).
- `expenseSplitSummary.test.ts`: una cella per persona, `null` senza base, `[]` oltre quattro; identità col testo della
  tessera anche sul negativo; +100 contabilizzati e −100 sul periodo → +100 `positive` (falsificare leggendo
  `remaining`). `expenseSplitNarrative.test.ts`: con `common.scheduled` > 0 `rest` è `[]` (falsificare togliendo
  `binding`). `dividendiNarrative`, `costCenterNarrative`: `rest` vuoto, aside chiusi (falsificare: `leadLength` a metà).
- **`e2e/mobile-composition.cashflow.mobile.spec.ts`** (progetto `mobile`, account base, `playwright.config.ts:187-200`):
  (1) Tracciamento: titolo, 3 celle ≥ 44 px col testo dei VALORI del trio nascosto, 4 trigger chiusi,
  `#trk-movimenti-panel` vuoto e `inert`; (2) FAB → spesa di oggi con nota esca (tolta via REST prima e dopo, come
  `cashflow.dividendi.mobile.spec.ts`) → Movimenti aperta, la riga a fuoco; (3) Budget: l'account base non ha tetto
  (`cashflow.budget.mobile.spec.ts:22`), il test lo scrive e lo toglie; «Fine mese» apre Categorie a rischio (anche
  `null`); (4) una riga di Budget aperta → Tracciamento → Budget → reload: aperta,
  `localStorage['mobile-sections:cashflow:budget']`; (5) tre tab VISITATE, nessun id duplicato; (6) l'account base non ha
  dividendi (niente Rendimento): cedola esca via REST, poi `page.route('**/api/dividends/stats**', r => r.abort())`
  (`e2e/settings.spec.ts:143`; `retry: 1`): Rendimento aperta, chiusa → eyebrow `text-destructive`; (7) `reducedMotion:
  'reduce'` → `transition-duration` 0s; (8) `main` senza sforamento. Falsificare (1), (2), (5), (6) rompendo il codice.
- `cashflow.split.mobile.spec.ts` (`split-mobile`, `:128-137`), su «Anno corrente» (il fixture vale sull'anno,
  `scripts/seedSplitE2E.mts:12-17`): celle per persona, una a 100 € `positive` (non −100), paragrafo intero con la
  riga in calendario. `cashflow.centri.mobile.spec.ts` (`centri-mobile`, `:140-149`): elenco e dettaglio, Back.
  Riscritte (aprono la riga prima di leggere): `cashflow{,.budget,.dividendi}.mobile.spec.ts`. A 1440: le desktop.

## 8. Collaudo guidato

- A: le spec desktop di Cashflow, Vitest nei due fusi. C: § 7.
- F (mirror; telefono vero se si può): 1) Tracciamento: striscia, «Nel totale…» se c'è calendario, prima riga sopra
  la pill; 2) il «+» → la spesa salvata davanti; 3) Budget: le due celle aprono la tessera giusta; 4) cambiare tab e
  ricaricare: righe ricordate; 5) Dividendi e Divisione, e 1440 come prima. G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Tracciamento sta sopra la pill per 16–36 px (A-notes): un titolo su tre righe la spinge sotto (§ 4.8, 5).
- Il focus di ritorno del dialog: la riga salvata prende il focus DOPO la chiusura e il refetch.
- Rollback: `collapse` sempre `undefined` riporta una tab a oggi; una striscia si toglie con `[]`; il `binding` di
  Divisione con una riga.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest»; le cinque guide di tab § Composizione mobile e § Per-page blind spots (il trio che sparisce a
  390, Dividendi senza striscia); `doc/guide/cashflow.md` (`forceMount`, memoria per tab); `doc/guide/e2e-emulatori.md`
  (la spec, l'abort); doc/guide/shell.md § Navigation (id prefissati, `active`); `Draft Release Temp.md` (una riga, senza dati privati); `doc/mobile/README.md` § 6.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-04-cashflow-cinque-tab.md: la composizione mobile delle cinque
tab di Cashflow con le primitive di MOB-02 (Tracciamento con il trio nella striscia e il calendario come riga d'ambito,
il «+» che apre Movimenti sulla riga salvata; Budget con la Risk-vs-Fact nella striscia; Centri, Divisione, Dividendi),
le tab forceMount con id prefissati e memoria per tab, e2e/mobile-composition.cashflow.mobile.spec.ts.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § React Query and Derived State,
  § Motion, § Navigation, § Hierarchy, Density and Disclosure, § Accessibility, § Browser-Driven E2E (Playwright)),
  CLAUDE.md
- Leggi doc/guide/cashflow.md, cashflow-tracciamento.md, cashflow-budget.md, centri-di-costo.md, cashflow-divisione.md,
  cashflow-dividendi.md, stati.md, e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/mobile/README.md, MOB-01 e MOB-02 per intero (chiuse; MOB-02 è il contratto: non rinominare nulla) e
  questa spec per intero; DESIGN.md § 5 e § 6 (MAI rigenerarlo); doc/perf/PERF-12, PERF-14 (PERF-03, PERF-05 e PERF-06
  sono ritirate: doc/guide/stati.md § The fourth reading, AGENTS.md § React Query and Derived State, doc/guide/cashflow.md
  § Expenses by window)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; le otto domande di § 4.8 con lo
strumento interattivo, prima di toccare le tab; cifre tonde inventate nei test, mai quelle del mirror.
Chiusura: mobile:census e mobile:budget prima/dopo; tsc, lint 0, Vitest in Europe/Rome; le spec Playwright di § 7 con
le falsificazioni viste rosse; giro guidato di 5 punti sul mirror, poi mirror:remove; la documentazione di § 10 in UN
diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort xhigh.** Cinque tab con regole di dominio dense (il calendario dentro i totali, ricevuti e
annunciati, rischio e fatto, il denaro mosso) che la composizione deve spostare senza cambiarne il senso.
