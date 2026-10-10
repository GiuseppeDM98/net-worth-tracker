# MOB-03 — Panoramica

> Stato: da fare · riletta in modo adversariale il 2026-10-10: 28 rilievi, 6 decisioni · Priorità: 2 (la pagina che si apre per prima, e la prima E2E del suo contenuto) · Sforzo: M ·
> Dipende da: MOB-01 (ritirata il 2026-10-10, in develop dal 2026-10-10, PR #448), MOB-02 (ritirata il 2026-10-10, in develop dal 2026-10-10, PR #450; PERF-03 e PERF-07 ritirate, in develop) · Sblocca: MOB-04..08, MOB-09

## 1. Il problema, misurato

Censimento 2026-09-26 (mirror). **390**: 4,41 schermate, 8 tessere (1 sopra la piega, 0 intere), 107 cifre (20 sopra la
piega); verdetto 315 px (un mese con una vendita tassata), Patrimonio 709 px. **768**: 2,39 schermate; **1024**: 3,11.
Righe del 2026-09-26, da riverificare:

- `app/dashboard/page.tsx:351-490`: il DOM è Patrimonio, Sintesi, Cashflow, Composizione, Costi e Obiettivo facoltative
  (`:409-433`), Spese ed Entrate solo con `expenseStats` (`:440-473`), Asset principali; sotto `desktop:` il telefono
  inverte Sintesi e Cashflow con `order-1`/`order-2` (`:408`, `:418`), che la decisione 1 di README § 9 vieta. Da 5 a 9
  tessere, da 4 a 8 righe (Cashflow c'è sempre, vuota senza `expenseStats`, `:395-399`; 7 righe sul mirror).
- **Le variazioni nascono sul server** (`lib/services/dashboardOverviewService.ts:384-401`): il mese contro l'ultimo
  snapshot prima di questo mese, l'anno contro dicembre o, senza, il primo snapshot dell'anno
  (`lib/services/snapshotService.ts:118-123`). La quota della tessera Cashflow è del mese intero (`page.tsx:134-139`),
  quella del verdetto «finora» (`resolveLivedCashflow`, `lib/utils/overviewNarrative.ts:86-99`; `page.tsx:184` ricade
  sul mese intero se è `null`).
- `components/dashboard/overview/PatrimonioTile.tsx`: chip e «Massimo storico» (`:133-156`), curva da 180 px con due
  etichette (`:169-175`; l'ultimo punto è `totalValue`, `dashboardOverviewService.ts:510-515`), digest «Mercato:»
  (`:185-198`). La usano anche Patrimonio e la landing. Non accetta un `id`.
- **La prima frase del verdetto è la striscia**: `buildOverviewVerdict` (`overviewNarrative.ts:291-367`) apre con «Il
  patrimonio vale 190.000,00 €: +3000,00 € (+1,60%) su agosto, +15,00% da inizio anno.» (euro a due decimali,
  `__tests__/overviewNarrative.test.ts:143`; lo zero firmato «+0,00 €», `:113`, `:122`). Restituisce `OverviewVerdict`
  (`:101-105`), letto anche dall'Assistente (`lib/utils/assistantNarrative.ts:316`, reso da
  `AssistantPageClient.tsx:534` senza `restCollapse`).
- **Clausole vincolanti**: le tasse (`describeSales`, `lib/utils/salesNarrative.ts:150-192`; la causa da
  `resolveDeclineCause`/`resolveTaxedGrowth`, `lib/utils/periodSales.ts:198-221`, `:246-254`), in coda salvo
  `taxIsTheStory` (`overviewNarrative.ts:332`, `:359-364`). Il calendario (`describeCalendarAside`, `:255-266`) sta solo
  nel verdetto: Spese ed Entrate della tessera Cashflow (`CashflowTile.tsx:58`, `:79`, `:86`), il «Risparmio» `net`
  (`:93-94`) e i totali delle due `CategoryTile` (`page.tsx:482`, `CategoryTile.tsx:62`) lo contengono senza dirlo.
- `SavingsRateBadge` (`page.tsx:556`, `fixed bottom-4 left-4 z-50`, `components/ui/SavingsRateBadge.tsx:114`) compare
  dal giorno 5 se la quota del mese prima è ≥ 30% (`lib/utils/savingsRateBadge.ts`): a 390 copre la pill e le celle.
- E2E: `e2e/panoramica.snapshot.spec.ts` (1440, «Crea snapshot»), `e2e/motion.layout.spec.ts` (1440: il periodo della
  curva senza spostamenti `:82-104`, la cascata delle celle via `closest('section').parentElement.parentElement`
  `:165-167`) e `e2e/motion.layout.mobile.spec.ts` (390, la pill); nulla sul contenuto a 390.

## 2. Obiettivo misurabile

- `mobile:budget` sul fixture `census@example.com` (README § 9, 6 e 10), `panoramica` a 390: `screens` da 3,56 (il fixture, README § 3.1; il mirror del 26/9 dava 4,41) a
  **≤ 1,6** (deroga «solo titolo», decisione 3); **`figuresOutsideVerdict` ≤ 5** (3 celle, l'eroe, l'etichetta sinistra
  della curva; l'euro del chip dell'anno passa nel seguito, 17); `firstClosedRowAbovePill: true`; `budget.json` stretto
  con `--tighten`.
- A 1440 la pagina di oggi, salvo TRE aggiunte dichiarate: la didascalia del calendario sotto le cifre che lo
  contengono (§ 4.4, decisione 14), l'euro dell'anno fra parentesi dopo la percentuale dell'anno nella frase (17), lo
  zero firmato senza segno (20); e le `order-*` tolte (già `desktop:order-none`).
- Playwright: striscia identica alla frase, tasse mai dietro un tap, memoria, ordine del DOM, nessuno sforamento.

## 3. Non-obiettivi

- B e C; il tablet a colonne (MOB-08); DESIGN.md (MOB-09); Patrimonio (MOB-06) e la landing: le prop nuove hanno
  default spenti; la landing ha `expensesScheduled: 0` e nessun `incomeScheduled` (`lib/utils/landingSampleData.ts:123`):
  niente didascalia.
- Il payload e `DASHBOARD_OVERVIEW_SOURCE_VERSION`: invariati. `expenseStats: null` (spese lette male OPPURE nessuna
  spesa) resta una riga chiusa con l'aside «nessun dato questo mese», come la tessera di oggi; il cieco si dichiara in
  `doc/guide/panoramica.md` § Per-page blind spots (distinguerli è un campo nuovo del payload, fuori da MOB-03).
- Lo skeleton resta quello di oggi; il salto skeleton → righe chiuse è dichiarato in § Composizione mobile.
- Il tipo `loan` (2026-10-10) non tocca la composizione: un prestito resta una riga di Asset principali con valore
  negativo e la striscia legge le variazioni del totale.

## 4. Design

### 4.1 La prima schermata

Sotto `desktop:`: titolo → striscia → «Il perché · {restLabel}» (`leadLength: 0`, deroga dichiarata: la prima frase
ristamperebbe l'euro del mese e la percentuale dell'anno della striscia, README § 9, 3 e 18) → **LA tessera
`panoramica-patrimonio`** (aperta, fuori dal controller, 21) → «Il resto della pagina» → le righe.
`useMobileSections({ route: 'panoramica', sections })` (chiave `mobile-sections:panoramica`), un `SectionSpec` per
tessera presente, nessun `failed` (un payload solo: se fallisce resta l'`ErrorNotice` di pagina, `page.tsx:282-299`),
nessun `defaultOpen`: alla prima visita tutte le righe e «Il perché» sono chiuse.
Id: `panoramica-{sintesi,cashflow,composizione,costi,obiettivo,spese,entrate,asset}`. **Ordine: il DOM di oggi** (README
§ 9, 1 e 11): Patrimonio, `PageRest`, Sintesi, Cashflow, Composizione, Costi, Obiettivo, Spese, Entrate, Asset principali;
`order-1`/`order-2` e `desktop:order-none` si tolgono; sul telefono Sintesi viene prima di Cashflow, dichiarato in
`doc/guide/panoramica.md` § Composizione mobile.

`asideWhenClosed` da una pura `describeOverviewAsides(overview): Record<SectionId, string>` (The Closed-Row Rule:
parole, mai importi), per ogni id la frase piena e quella vuota: sintesi «cosa è liquidabile»; cashflow «entrate, spese
e fine mese» / «nessun dato questo mese»; composizione «per asset class» / «nessun asset»; costi «stima annua»;
obiettivo «in corso» / «raggiunto»; spese «le prime del mese» / «nessuna spesa questo mese»; entrate «le prime del
mese» / «nessuna entrata questo mese»; asset «valore, peso, rendimento» / «nessun asset in portafoglio».

### 4.2 La striscia — `selectOverviewStrip(overview): StripFigure[]`

In `lib/utils/overviewSummary.ts` (nuovo: il modello della Panoramica è il payload), con `monthSavingsRate` e
`monthCoverageRatio` spostati da `page.tsx:163-175` (li legge la tessera; la striscia prende la quota del verdetto).

| label | value | format · `decimals` | opens | lifts.block | reason |
|---|---|---|---|---|---|
| Questo mese | `variations.monthly.value` | `signed-currency` · 2 | `VERDICT_REST_SECTION` | `monthly` | nessuno snapshot prima di questo mese |
| Da inizio anno | `variations.yearly.percentage` | `signed-percent` · 2 | `panoramica-patrimonio` | `yearly` | nessuno snapshot da cui contare l'anno |
| Messo da parte finora | `Math.round` della quota del verdetto (`resolveLivedCashflow(expenseStats)?.savingsRate`, altrimenti `monthSavingsRate`: la stessa di `overviewNarrative.ts:338`) | `percent` · 0 | `panoramica-cashflow` | — | «nessuna entrata finora» con `resolveLivedCashflow` non `null`, «nessuna entrata nel mese» senza |

**`StripFigure.decimals`** (`lib/utils/verdictStrip.ts`): il verdetto stampa l'euro e la percentuale a due decimali
(`overviewNarrative.ts:112-128`) e la quota intera (`Math.round`, `:338`): la cella porta il valore GIÀ arrotondato come la
frase, così `Intl` non arrotonda una seconda volta (−12,5 → «-12%» in entrambe; `Intl` da solo darebbe −13%). «Messo da
parte finora» è la quota del verdetto (README § 9, 26); la tessera Cashflow tiene il mese intero. Tutte `null` → `[]`,
niente `strip`. `validateStrip(strip, [...presenti, 'panoramica-patrimonio', ...(seguito ? ['perche'] : [])])` → `[]`.
La terza cella non contiene nulla in calendario: nessuna clausola.

**Che cosa apre** (`onOpen` della pagina): `perche` → `restCollapse.onOpenChange(true)` se il seguito c'è; senza seguito
(`splitVerdict(verdict).rest` vuoto: il taglio annullato dal `binding`, § 4.4) porta il focus sul paragrafo del verdetto,
già intero e visibile (`tabIndex={-1}`), e non apre nulla. `panoramica-cashflow` → `sections.reveal`.
`panoramica-patrimonio` → LA tessera non si apre, cambia finestra: il gestore imposta la curva su `'YTD'` e, dopo il
commit (`requestAnimationFrame`), scorre a `#panoramica-patrimonio-andamento` (`auto` con reduced motion) e mette il focus su
`[role="radiogroup"][aria-label="Periodo del grafico"] [role="radio"][aria-checked="true"]`; `PatrimonioTile` prende
`id?: string` (inoltrato a `Tile`) e mette `id={`${id}-andamento`}` sulla riga di «Andamento» (`:161`); nessuna modifica a
`SegmentedPill`. Senza curva (< 2 punti, `PatrimonioTile.tsx:122`) scorre alla tessera. La pagina passa a `VerdictStrip`
`eyebrows={{ ...sections.eyebrows, 'panoramica-patrimonio': "l'andamento da inizio anno" }}` (dal ritiro di MOB-02, 2026-10-10, gli
eyebrow delle righe vengono dal controller: senza, una cella annuncia la propria etichetta), così lo `sr-only` legge «, apre l'andamento da
inizio anno». La curva YTD parte da gennaio (`lib/utils/sparklinePeriod.ts:27-33`), la percentuale da dicembre:
l'etichetta sinistra non è la sua base; a gennaio la curva YTD ricade sugli ultimi due punti (`:30-32`) e le due celle
del mese e dell'anno possono riportare la stessa percentuale, ed è corretto.

### 4.3 Che cosa LA tessera non ripete (The Lifted-Figure Rule)

`PatrimonioTile` + `liftedFigures?: readonly PatrimonioLiftedBlock[]`, `PatrimonioLiftedBlock = 'monthly' | 'yearly' |
'movers' | 'curve-end'` e `isPatrimonioLiftedBlock(b: string): b is PatrimonioLiftedBlock` esportati da
`PatrimonioTile.tsx` (contratto di questa spec, che MOB-06 § 4.1 usa con gli stessi nomi); ogni blocco con
`LIFTED_FIGURE_CLASS` (anche il contenitore di `:134` se resta vuoto). La pagina passa
`[...liftedBlocks(strip, 'panoramica-patrimonio').filter(isPatrimonioLiftedBlock), 'curve-end', ...(verdictNamesMarket(input) ? ['movers'] : [])]`:

- le chip vanno nella striscia; «Massimo storico» resta. Il chip del mese ha due cifre: l'euro è la cella, la
  percentuale del mese resta nel seguito. **Il chip dell'anno si nasconde intero e l'euro dell'anno, che nessuno
  ristampa, entra nella frase** fra parentesi dopo la percentuale: «+15,00% da inizio anno (+25.000,00 €)»
  (`overviewNarrative.ts:305`; README § 9, 17: a 1440 è un'aggiunta dichiarata);
- **il digest «Mercato»** sta in «Il perché», in parole («dal mercato», la classe che ha spinto di più), ma il seguito
  nomina il mercato solo in alcuni rami: una pura `verdictNamesMarket(input): boolean` è vera se e solo se la frase del
  builder nomina il mercato (`/mercato/.test(narrativeToText(buildOverviewVerdict(input).sentence))`), e se è falsa il
  digest resta. Il caso che la distingue da `marketEffect !== null`: una vendita con plusvalenza netta ≤ 0 e
  `estimatedTax` > 0 (`saleCarriesSplit` vero, `describeMonthSplit` saltato, `describeSales` esce a `:158-165`): lì il
  verdetto non nomina il mercato e il digest resta. Le altre classi del digest si perdono sotto `tablet:` con il blocco;
  l'eroe di LA tessera è esente (24). Nessuno slot nuovo (il seguito è uno `span` in un `<div>`);
- `'curve-end'` è l'eroe in forma compatta.

Sotto `desktop:` la curva scende a `min-h-[120px]` (`max-desktop:min-h-[120px] desktop:min-h-[180px]` sul box di
`PatrimonioTile.tsx:169`): si accorcia la curva, mai la lettura (README § 9, 4).

### 4.4 Il verdetto breve e le clausole (The Binding-Clause Rule)

`sentence` resta intera (1440, Assistente: `PageVerdict` senza `restCollapse` ignora `leadLength`); `OverviewVerdict`
prende i due campi opzionali di `PageVerdictModel`:

- **`leadLength: 0`** (deroga «solo titolo», README § 9, 3): sotto `desktop:` il titolo, poi la striscia; la frase intera
  sta in «Il perché». **Con `taxIsTheStory` il taglio va DOPO la clausola della vendita** (acquisti compresi,
  `:326-332`): titolo + prima frase + tasse visibili, risparmio e mercato dietro «Il perché» (README § 9, 27).
- **Tasse**: in `describeSales` la cifra «pagato (circa) 2000 € di tasse» e il controfattuale «senza, il mese avrebbe
  fatto…» prendono `binding: true` ogni volta che sono stampati (anche con `estimatedTax === 0`, `salesNarrative.ts:174-178`);
  proventi, plusvalenza, minusvalenza e aliquota assente no. Negli altri mesi tassati (tasse sotto la crescita;
  `taxes-over-market`/`market-and-taxes`, che le nominano nel titolo ma lasciano la clausola in coda) `splitVerdict`
  annulla il taglio e il paragrafo è intero sul telefono (README § 9, 3): sul fixture del budget non ci sono vendite,
  quindi non sposta il budget. `salesNarrative.ts` è condiviso: l'email ignora il flag, Patrimonio lo eredita (MOB-06).
- **Calendario**: la clausola del verdetto accompagna la quota «finora», dietro il tap con lei; vincola le cifre che lo
  contengono: didascalia a ogni larghezza (README § 9, 14; The Scheduled-Is-Not-Spent Rule), pura
  `describeScheduledCaption(amount, daysInMonth)` in `overviewNarrative.ts` → «di cui 350 € già in calendario, entro il
  30» (le parole «già in calendario» di `scheduledSentence`, `cashflowNarrative.ts:241`; la forma breve è una didascalia
  sotto UNA cifra, senza verbo), assente sotto 1 € (la soglia di `:257-258`): sotto Entrate e Spese di `CashflowTile`
  (`:79`, `:86`) e sotto la lettura delle due `CategoryTile`, il cui totale (`CategoryTile.tsx:62`) contiene
  `expensesScheduled`/`incomeScheduled`; «Risparmio» (`net`) prende «di cui … di spese e … di entrate già in calendario»
  quando uno dei due è ≥ 1 €.
- **Lo zero**: `signedCurrency`/`signedPercent` (`overviewNarrative.ts:112-128`) stampano lo zero senza segno («0,00 €»,
  «0,00%», e «−0,004» è zero), la regola `isPrintedZero` di `lib/utils/verdictStrip.ts` (README § 9, 20).
- `restLabel` da `overviewRestLabel({ market, savings, sale })`: sempre «il patrimonio» seguito, nell'ordine, da «il
  risparmio», «il mercato», «la vendita», uniti da virgole e «e» finale, con «del mese» in coda: «il patrimonio, il
  risparmio e il mercato del mese»; con nessuno dei tre «il patrimonio del mese».

### 4.5 Conflitti con PERF e con MOB-06

- **PERF-03** (in develop dal 2026-09-30): «Aggiornato alle…» sta nel `PageHeader` — sul telefono al posto della
  descrizione (la data) finché dura — non fra la prima frase e la striscia (decisione del proprietario); età = la più
  vecchia fra `dataUpdatedAt` e `overview.freshness.updatedAt`, soglia il minuto dell'overview
  (`DASHBOARD_OVERVIEW_STALE_TIME_MS`). Le celle non hanno count-up: non saltano all'arrivo del fresco.
- **PERF-07** (in develop dal 2026-10-03): il ricalcolo non ha interfaccia propria, è il «sto rileggendo…» della stessa
  riga `status`; il payload non ha cambiato forma. Il riepilogo è fresco per il giorno italiano, quindi dopo la prima
  apertura del giorno la rilettura è una lettura sola (doc/guide/panoramica.md § The materialized summary).
- **PERF-14** (in develop dal 2026-10-08): il `layout="position"` della pagina è tolto (doc/guide/panoramica.md), non si rimette. **PERF-04**: qui niente recharts.
- **MOB-06**: `PatrimonioTile.liftedFigures` e `id`, la curva a 120 px sotto `desktop:`, `ComposizioneTile` con
  `collapse`/`asideWhenClosed` (la importano anche `assets/page.tsx:38` e la landing `app/page.tsx:47`) e i `binding` di
  `describeSales` sono di MOB-03 (README § 5, decisione 9): MOB-06 viene dopo e li usa con questi nomi.

### 4.6 Decisioni (README § 9)

Tutte le domande di questa spec sono chiuse: la deroga «solo titolo» (3), «Messo da parte finora» (26), la didascalia a
ogni larghezza (14), i mesi tassati non «storia» col paragrafo intero (3), il chip dell'anno nel seguito (17), il taglio
dopo la vendita con `taxIsTheStory` (27), la cella lunga su una riga intera (28), l'ordine del DOM (11).

## 5. File da toccare

- `lib/utils/overviewSummary.ts` (nuovo: `selectOverviewStrip`, `verdictNamesMarket`, `monthSavingsRate`,
  `monthCoverageRatio`); `lib/utils/overviewNarrative.ts` (`OverviewVerdict`, `leadLength`, `restLabel`,
  `overviewRestLabel`, `describeOverviewAsides`, `describeScheduledCaption`, l'euro dell'anno nella frase, lo zero
  senza segno); `lib/utils/salesNarrative.ts` (`binding`: di questa spec, MOB-06 lo eredita).
- `app/dashboard/page.tsx`; `components/dashboard/overview/{PatrimonioTile,CashflowTile,CategoryTile,OverviewVerdict}.tsx` e le tessere
  che inoltrano `collapse`/`asideWhenClosed` (`SintesiTile`, `ComposizioneTile`, `CostiTile`, `ObiettivoTile`,
  `CategoryTile`, `AssetPrincipaliTile`).
- Test di § 7; `e2e/overview.mobile.spec.ts`, `e2e/overview.spec.ts` (nuovi); `e2e/motion.layout{,.mobile}.spec.ts`
  (riletti); `doc/mobile/budget.json`.

## 6. Passi

1. Branch, guide, `mobile:census` PRIMA (fixture). 2. Pure e test, falsificati. 3. `salesNarrative` e
`buildOverviewVerdict` (le attese di testo esistenti cambiano solo per lo zero e l'euro dell'anno). 4. Tessere, pagina.
5. Playwright, lint, `tsc`, `perf:budget`. 6. `mobile:census`/`mobile:budget -- --tighten`, giro sul mirror, documentazione, commit proposto.

## 7. Test e falsificazione

- `__tests__/overviewSummary.test.ts`: tre celle, `reason` per ogni `null` (le due di «Messo da parte»), tutte `null` →
  `[]`, `validateStrip` vuoto con e senza seguito; **identità**: `narrativeToText([formatStripFigure(f)])` sta dentro
  `narrativeToText(verdict.sentence)` sullo stesso input, anche a quota −12,5 e a variazione zero. Falsificare con «Questo
  mese» senza `decimals`, e passando la quota non arrotondata. `verdictNamesMarket` confrontata con
  `/mercato/.test(narrativeToText(buildOverviewVerdict(input).sentence))` su: senza `marketEffect`, senza
  `monthlyVariation`, classe ignota senza split, vendita tassata con split, vendita con plusvalenza netta ≤ 0 e tasse > 0
  (attesa: falsa). Falsificare con `input.marketEffect !== null`: rosso sull'ultimo caso.
- `__tests__/narrative.test.ts`: `leadLength: 0` = `lead` vuoto lo prova già `__tests__/narrative.test.ts` (2026-10-10); qui si riesegue.
- `__tests__/overviewNarrative.test.ts`: `leadLength: 0`, o il taglio dopo la vendita con `taxIsTheStory` (falsificare
  spostandolo di un segmento); asides senza `/\d/` né «€» (falsificare con «giorno N di M»); `describeScheduledCaption` a
  0, 0,5 e 350 € e con «già in calendario» (falsificare con `> 0` e togliendo «già»); `overviewRestLabel` sulle 8
  combinazioni (falsificare togliendo «il patrimonio»); lo zero senza segno (falsificare con `value >= 0 ? '+'`); l'euro
  dell'anno fra parentesi.
- `__tests__/salesNarrative.test.ts`: `binding` solo su tasse e controfattuale, anche a tasse zero. Falsificare togliendolo: rosso qui e in (5).
- **`e2e/overview.mobile.spec.ts`**, progetto `mobile` (account base, `playwright.config.ts:187-200`): la risposta
  patchata con `page.route` + `route.fulfill` come `panoramica.snapshot.spec.ts:22-26`, cifre tonde, `incomeScheduled`
  presente, `previousMonth` con una quota sotto il 30% (così `SavingsRateBadge` non compare: la spec verifica che nessun
  `[class*="fixed bottom-4 left-4"]` sia visibile prima dei tap), `sparklineData` con dicembre dell'anno prima, gennaio e
  il mese corrente (la curva YTD esiste), `flags.hasTERTracking: true` (sette righe: MOB-08 § 7 la riusa), nessuna
  scrittura; tasse ≥ 10.000 € (il Chromium del container cloud raggruppa «1.100 €»: doc/guide/e2e-emulatori.md
  § Browser-Driven E2E). (1) Titolo senza `lead`, tre celle ≥ 44 px, eroe, né chip né «Mercato:» (con `marketEffect`),
  un trigger chiuso per tessera, pannelli `inert` e vuoti; prima riga sopra la pill. (2) «Questo mese» apre «Il perché»
  con «dal mercato» e «(+25.000,00 €)». (3) «Messo da parte finora» apre Cashflow, focus sul trigger; con
  `expensesScheduled: 350` la didascalia «già in calendario». (4) «Da inizio anno» → radio YTD `aria-checked`, focus
  sulla radio. (5) Δ −10.000, mercato +5000, tasse 20.000 (`taxes-despite-market`): le tasse visibili senza tap.
  (6) Δ +30.000, tasse 10.000 (non «la storia»): niente «Il perché», paragrafo intero, «Questo mese» porta il focus sul
  paragrafo. (7) Reload: due righe aperte, `mobile-sections:panoramica` = `["panoramica-cashflow","panoramica-sintesi"]`.
  (8) L'ordine di `y` delle celle della griglia è l'ordine del DOM (Patrimonio, PageRest, Sintesi, Cashflow, …), nessuna
  classe `order-*` (dalla `classList` con `/^(?:[a-z-]+:)*order-/`: `[class*="order-"]` prende ogni `border-*`, doc/guide/e2e-emulatori.md) nella griglia, nessun bottone «Il perché» fuori da `main`; nessuno sforamento (guardia di
  `e2e/fire.mobile.spec.ts:62-80`). Rossi falsificando: (1) contenuto montato da chiusa; (2) `onOpen('perche')` a
  vuoto; (3) `reveal` senza focus; (4) la cella che non cambia periodo; (5) `binding` tolto; (6) `splitVerdict` che
  ignora `binding`; (7) nessuna scrittura; (8) un `order-1` rimesso sulla cella di Cashflow.
- **`e2e/overview.spec.ts`** (`desktop`): nessun `[id$="-trigger"]` nella griglia, striscia e «Il resto» invisibili,
  chip e digest visibili, paragrafo intero, didascalia del calendario presente (falsificare ignorando `compact`).

## 8. Collaudo guidato

- A: `overview.spec.ts`, `panoramica.snapshot.spec.ts`, `motion.layout.spec.ts`, `motion.layout.mobile.spec.ts`,
  `shell.boot{,.mobile}.spec.ts`, `assets.sale-tax.spec.ts`, Vitest nei due fusi. C: § 7.
- F (mirror, DevTools a 390 sul portatile): 1) prima schermata; 2) le tre celle; 3) aprire, chiudere, reload; 4) tasse
  senza tap se il mese ne ha; 5) 1440 come prima, salvo le didascalie e l'euro dell'anno. G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Sul mirror un mese con una vendita tassata allunga il paragrafo (le tasse sono `binding`): lo si vede nel giro F, non
  sposta il budget, che è del fixture; l'invariante la tiene la E2E.
- «+3000,00 €» sono 10 caratteri in una cella di ~110 px: 18 px, e oltre 9 caratteri la cella prende una riga intera
  (`WIDE_CELL_CHARS` in `components/ui/verdict-strip.tsx`, README § 9, 28 — la prima prova della regola: MOB-02 non ne ha lasciata una); con sei cifre intere la guardia (8) e la E2E con Δ +123.456,78 €.
- Rollback per lettera: `liftedFigures` o `strip` non passati; `leadLength` assente = paragrafo intero. Mai togliere
  `binding` lasciando un taglio.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest» e § Current Status (i conteggi); `doc/guide/panoramica.md` § Composizione mobile (nuova: l'ordine
  del DOM sul telefono, la deroga «solo titolo» dichiarata, l'euro dell'anno nella frase, la chiave per dispositivo), la
  voce del bento in § Panoramica and Dashboard Data Isolation (`:47`: l'ordine del DOM è l'ordine di lettura, nessun
  `order-*`; una tessera nuova prende la sua posizione nel JSX) e § Per-page blind spots (la voce «The Cashflow tile keeps
  the WHOLE month» prende la striscia; la curva YTD da gennaio; `expenseStats: null` non distingue fallita e vuota);
  `doc/guide/e2e-emulatori.md` (la risposta patchata, il badge); `Draft Release Temp.md` (una riga, senza dati privati);
  `doc/mobile/README.md` § 6 e § 3.1.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-03-panoramica.md: la Panoramica sul telefono nella composizione
di MOB-02 — solo titolo sopra la striscia (questo mese, da inizio anno, messo da parte finora) da selectOverviewStrip,
Patrimonio totale lordo come LA tessera senza chip, l'euro dell'anno nella frase, digest «Mercato» in parole quando il
verdetto lo nomina, le righe chiuse nell'ordine del DOM (Sintesi prima di Cashflow, order-* tolte), le tasse di una
vendita mai dietro un tap (binding in salesNarrative; con taxIsTheStory il taglio dopo la vendita), il calendario come
didascalia «già in calendario» a ogni larghezza, lo zero senza segno, e la prima E2E della pagina a 390
(e2e/overview.mobile.spec.ts).

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § React Query and Derived State,
  § Motion, § Navigation, § Hierarchy, Density and Disclosure — l'ordine del DOM è quello di README § 9, 11, non la
  riga sugli order-* —, § Accessibility, § 3 Panoramica), CLAUDE.md
- Leggi doc/guide/panoramica.md per intero, doc/guide/stati.md, doc/guide/e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/mobile/README.md (§ 9: le decisioni 1–28), il codice di MOB-02 (ritirata il 2026-10-10: `lib/utils/{verdictStrip,mobileSections,narrative}.ts`, `lib/hooks/useMobileSections.ts`, `components/ui/{tile,page-verdict,verdict-strip,page-rest,error-notice}.tsx`; la pagina campione in doc/guide/hall-of-fame.md § Composizione mobile) e MOB-03 per intero; DESIGN.md § 5 (Page Verdict, Tile, Market Digest
  Line), § 6 e The Scheduled-Is-Not-Spent Rule (MAI rigenerarlo)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; nessuna domanda è aperta (README
§ 9): una scelta nuova che il codice ti impone me la chiedi con lo strumento interattivo prima di toccare
overviewNarrative; nessuna cifra del mirror in test, spec o documenti.
Chiusura: mobile:census e mobile:budget prima/dopo sul fixture, --tighten; tsc, lint 0, Vitest in Europe/Rome e sotto
TZ=UTC; le spec Playwright di § 7 con le falsificazioni viste rosse (dimmi quali); npm run perf:build e perf:budget --
--dist=.next-perf prima e dopo (da Git Bash; un tetto si alza solo con raisedBy e il mio OK); giro guidato di 5 punti
sul mirror, poi mirror:remove; la documentazione di § 10 in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort high.** Il lavoro sta nelle narrative: dove si taglia il verdetto, quali segmenti sono
vincolanti, l'identità fra striscia e frase. Un errore lì nasconde le tasse di una vendita dietro un tap.
