# MOB-03 — Panoramica

> Stato: da fare · Priorità: 2 (la pagina che si apre per prima, e la prima E2E del suo contenuto) · Sforzo: M ·
> Dipende da: MOB-02, PERF-03, PERF-07 · Sblocca: MOB-08, MOB-09

## 1. Il problema, misurato

Censimento 2026-09-26 (mirror). **390**: 4,41 schermate, 8 tessere (1 sopra la piega, 0 intere), 107 cifre (20 sopra la
piega); verdetto 315 px (un mese con una vendita tassata), Patrimonio 709 px. **768**: 2,39 schermate; **1024**: 3,11.
Righe del 2026-09-26, da riverificare:

- `app/dashboard/page.tsx:351-490`: sotto `desktop:` Patrimonio (senza order), Cashflow `order-1` (`:384`), Sintesi
  `order-2`, Composizione `order-3`, Costi e Obiettivo facoltative (`:409-433`), Spese ed Entrate solo con
  `expenseStats` (`:440-473`), Asset principali `order-8`. Da 5 a 9 tessere, da 4 a 8 righe (Cashflow c'è sempre,
  vuota senza `expenseStats`, `:395-399`; 7 righe sul mirror).
- **Le variazioni nascono sul server** (`lib/services/dashboardOverviewService.ts:384-401`): il mese contro l'ultimo
  snapshot prima di questo mese, l'anno contro dicembre o, senza, il primo snapshot dell'anno
  (`lib/services/snapshotService.ts:118-123`). La quota della tessera Cashflow è del mese intero (`page.tsx:134-139`),
  quella del verdetto «finora» (`resolveLivedCashflow`, `lib/utils/overviewNarrative.ts:86-99`; `page.tsx:184` ricade
  sul mese intero se è `null`).
- `components/dashboard/overview/PatrimonioTile.tsx`: chip e «Massimo storico» (`:133-156`), curva da 180 px con due
  etichette (`:169-175`; l'ultimo punto è `totalValue`, `dashboardOverviewService.ts:510-515`), digest «Mercato:»
  (`:185-198`). La usano anche Patrimonio e la landing.
- **La prima frase del verdetto è la striscia**: `buildOverviewVerdict` (`overviewNarrative.ts:291-367`) apre con «Il
  patrimonio vale 190.000,00 €: +3000,00 € (+1,60%) su agosto, +15,00% da inizio anno.» (euro a due decimali,
  `__tests__/overviewNarrative.test.ts:143`). Restituisce `OverviewVerdict` (`:101-105`), letto anche dall'Assistente
  (`lib/utils/assistantNarrative.ts:316`).
- **Clausole vincolanti**: le tasse (`describeSales`, `lib/utils/salesNarrative.ts:150-192`; la causa da
  `resolveDeclineCause`/`resolveTaxedGrowth`, `lib/utils/periodSales.ts:198-221`, `:246-254`), in coda salvo
  `taxIsTheStory` (`overviewNarrative.ts:332`, `:359-364`). Il calendario (`describeCalendarAside`, `:255-266`) sta solo
  nel verdetto: Spese ed Entrate della tessera Cashflow lo contengono senza dirlo (`CashflowTile.tsx:58`, `:79`, `:86`).
- E2E: solo `e2e/panoramica.snapshot.spec.ts` (desktop, «Crea snapshot»); nulla a 390, nulla sul contenuto.

## 2. Obiettivo misurabile

- `mobile:budget`, `panoramica` a 390: `screens` da 4,41 a **≤ 1,8** a righe chiuse (≤ 1,6 con «solo titolo», domanda
  1); **`figuresOutsideVerdict` ≤ 5** (3 celle, l'eroe, l'etichetta sinistra della curva); `firstClosedRowAbovePill:
  true` senza vendita tassata con «solo titolo» (con la prima frase i 16–36 px sopra la pill di A-notes, rischio 5, non
  bastano: si registra il misurato); `budget.json` abbassato.
- A 1440 la pagina di oggi, salvo UNA aggiunta dichiarata: la didascalia del calendario sotto Spese ed Entrate (§ 4.4).
- Playwright: striscia identica alla frase, tasse mai dietro un tap, memoria, ordine del DOM, nessuno sforamento.

## 3. Non-obiettivi

- B e C; il tablet a colonne (MOB-08); DESIGN.md (MOB-09); Patrimonio (MOB-06) e la landing: le prop nuove hanno
  default spenti.
- Il payload e `DASHBOARD_OVERVIEW_SOURCE_VERSION`: invariati. `expenseStats: null` confonde oggi fallita e vuota: è di
  `doc/guide/stati.md`, non di qui.

## 4. Design

### 4.1 La prima schermata

Sotto `desktop:`: titolo → prima frase (decisione 4; domanda 1) → striscia → «Il perché ·
{restLabel}» → **LA tessera `panoramica-patrimonio`** (aperta, fuori dal controller) → «Il resto della pagina» → le
righe. `useMobileSections({ route: 'panoramica', sections })` (chiave `mobile-sections:panoramica`), un `SectionSpec` per
tessera presente, nessun `failed` (un payload solo: se fallisce resta l'`ErrorNotice` di pagina, `page.tsx:282-299`).
Id: `panoramica-{cashflow,sintesi,composizione,costi,obiettivo,spese,entrate,asset}`. Ordine: Patrimonio `order-1`,
`PageRest` `order-2`, poi `order-3…10` nell'ordine mobile di oggi; `desktop:order-none` resta, DOM in ordine desktop
(AGENTS § Hierarchy, Density and Disclosure).

`asideWhenClosed` da una pura `describeOverviewAsides(overview)` (The Closed-Row Rule: parole, mai importi): «entrate,
spese e fine mese», «cosa è liquidabile», «per asset class», «stima annua», «in corso», «le prime del mese», «valore,
peso, rendimento»; una tessera vuota porta la sua frase («nessuna spesa questo mese»).

### 4.2 La striscia — `selectOverviewStrip(overview): StripFigure[]`

In `lib/utils/overviewSummary.ts` (nuovo: il modello della Panoramica è il payload), con `monthSavingsRate` e
`monthCoverageRatio` spostati da `page.tsx:134-146` (li legge la tessera; la striscia prende la quota del verdetto).

| label | value | format · `decimals` | opens | lifts.block | reason |
|---|---|---|---|---|---|
| Questo mese | `variations.monthly.value` | `signed-currency` · 2 | `VERDICT_REST_SECTION` | `monthly` | nessuno snapshot prima di questo mese |
| Da inizio anno | `variations.yearly.percentage` | `signed-percent` · 2 | `panoramica-patrimonio` | `yearly` | nessuno snapshot da cui contare l'anno |
| Messo da parte finora | la quota del verdetto (`page.tsx:184`) | `percent` · 0 | `panoramica-cashflow` | — | nessuna entrata nel mese |

**`StripFigure.decimals`** (MOB-02 § 4.1, precisazioni; default: euro a 0 decimali): il verdetto stampa l'euro e la
percentuale a due decimali (`overviewNarrative.ts:112-128`) e la quota intera (`Math.round`, `:338`); senza il campo
l'identità di § 7 non tiene. Senza `resolveLivedCashflow` la terza cella cade sul mese intero come il verdetto, senza
«finora». Tutte `null` → `[]`, niente `strip`. `validateStrip(strip, [...presenti, 'perche', 'panoramica-patrimonio'])`
→ `[]`. La terza cella non contiene nulla in calendario: nessuna clausola.

**Che cosa apre** (`onOpen` della pagina): `perche` → `restCollapse.onOpenChange(true)` (`sections.collapse(VERDICT_REST_SECTION)`,
MOB-02 § 4.3); `panoramica-cashflow` → `sections.reveal`; `panoramica-patrimonio` → curva su
`'YTD'`, scroll ad «Andamento», focus sulla radio YTD (`PeriodSelector.tsx:30`): LA tessera non si apre, cambia
finestra; senza curva (< 2 punti, `PatrimonioTile.tsx:122`) scorre alla tessera. La curva YTD parte da gennaio
(`lib/utils/sparklinePeriod.ts:27-33`), la percentuale da dicembre: l'etichetta sinistra non è la sua base.

### 4.3 Che cosa LA tessera non ripete (The Lifted-Figure Rule)

`PatrimonioTile` + `liftedFigures?: readonly ('monthly' | 'yearly' | 'movers' | 'curve-end')[]` (i nomi di MOB-06 § 4.1
più `'curve-end'`); ogni blocco con `LIFTED_FIGURE_CLASS` (anche il contenitore di `:134` se resta
vuoto). La pagina passa `[...liftedBlocks(strip, 'panoramica-patrimonio'), 'curve-end']`, e `'movers'` alla condizione
sotto:

- le chip vanno nella striscia; «Massimo storico» resta. Ogni chip ha due cifre: la percentuale del mese resta nel
  seguito, **l'euro dell'anno non lo stampa nessuno** (domanda 5);
- **il digest «Mercato»** sta in «Il perché», in parole («dal mercato», la classe che ha spinto di più), ma il seguito
  nomina il mercato solo con `marketEffect !== null` (`overviewNarrative.ts:317-324`, `:346-347`): una pura
  `verdictNamesMarket(input)` decide, e se è falsa il digest resta. Le altre classi si perdono sotto `tablet:`. Nessuno
  slot nuovo (il seguito è uno `span` in un `<p>`);
- `'curve-end'` è l'eroe in forma compatta.

Sotto `tablet:` la curva scende a `min-h-[120px]`: si accorcia la curva, mai la lettura (A-notes, rischio 5).

### 4.4 Il verdetto breve e le clausole (The Binding-Clause Rule)

`sentence` resta intera (1440, Assistente); `OverviewVerdict` prende i due campi opzionali di `PageVerdictModel`:

- **`leadLength` = fine della prima frase** (decisione 4: il `'.'` di `:310`); la domanda 1 propone `0` (solo titolo).
- **Tasse**: in `describeSales` la cifra «pagato (circa) 2000 € di tasse» e il controfattuale «senza, il mese avrebbe
  fatto…» prendono `binding: true`; proventi, plusvalenza, minusvalenza e aliquota assente no. Con `taxIsTheStory` il
  taglio va DOPO la clausola della vendita (acquisti compresi, `:326-332`). Negli altri mesi tassati (tasse sotto la
  crescita; `taxes-over-market`/`market-and-taxes`, che le nominano nel titolo ma lasciano la clausola in coda)
  `splitVerdict` annulla il taglio e il paragrafo è intero. `salesNarrative.ts` è condiviso: l'email ignora il flag,
  Patrimonio lo eredita (MOB-06).
- **Calendario**: la clausola del verdetto accompagna la quota «finora», dietro il tap con lei; vincola le cifre che lo
  contengono, Spese ed Entrate: didascalia sotto ciascuna a ogni larghezza (The Scheduled-Is-Not-Spent Rule), «di cui
  350 € in calendario, entro il 30», pura `describeScheduledCaption(amount, daysInMonth)` su `expensesScheduled` e
  `incomeScheduled`, assente sotto 1 € (la soglia di `:257-258`).
- `restLabel` da `overviewRestLabel({ market, savings, sale })`: «mercato e risparmio del mese», «la vendita del mese».

### 4.5 Conflitti con PERF e con MOB-06

- **PERF-03** (in develop dal 2026-09-30): «Aggiornato alle…» sta nel `PageHeader` — sul telefono al posto della
  descrizione (la data) finché dura — non fra la prima frase e la striscia (decisione del proprietario); età = la più
  vecchia fra `dataUpdatedAt` e `overview.freshness.updatedAt`, soglia il minuto dell'overview
  (`DASHBOARD_OVERVIEW_STALE_TIME_MS`). Le celle non hanno count-up: non saltano all'arrivo del fresco.
- **PERF-07** (in develop dal 2026-10-03): il ricalcolo non ha interfaccia propria, è il «sto rileggendo…» della stessa
  riga `status`; il payload non ha cambiato forma. Il riepilogo è fresco per il giorno italiano, quindi dopo la prima
  apertura del giorno la rilettura è una lettura sola (doc/guide/panoramica.md § The materialized summary).
- **PERF-14** (in develop dal 2026-10-08): il `layout="position"` della pagina è tolto (doc/guide/panoramica.md), non si rimette. **PERF-04**: qui niente recharts.
- **MOB-06**: `PatrimonioTile.liftedFigures`, la curva a 120 px sotto `tablet:` e i `binding` di `describeSales` sono di
  MOB-03 (MOB-06 § 3 lo dice); se MOB-06 arriva prima li scrive con questi nomi, e chi arriva secondo rilegge il diff del
  primo.

### 4.6 Domande al proprietario

1. La decisione 4 (titolo + prima frase) ristampa eroe e striscia e costa ~50 px: la prima riga chiusa finisce sotto la
   pill. Deroga a `leadLength: 0` (solo titolo; la percentuale del mese resta nel seguito)? È la stessa domanda di **Deciso il 2026-09-27 (doc/mobile/README.md § 9): deroga ammessa e dichiarata quando la prima frase ristamperebbe ≥ 2 cifre della striscia.**
   MOB-04 § 4.8, 1 e MOB-05 § 4.8, 1: una risposta per le tre, registrata in `doc/mobile/README.md`.
2. «Messo da parte» nella striscia: «finora» (come il verdetto) o mese intero (come la tessera Cashflow)?
3. La didascalia del calendario sotto Spese ed Entrate anche a 1440?
4. Mese con una vendita tassata che non è «la storia» (`taxIsTheStory` falso): paragrafo intero sul telefono, prima riga
   sotto la pill. Va bene?
5. Sotto `tablet:` la chip dell'anno sparisce con il suo euro, che nessuno ristampa (la decisione 5 nasconde ciò che è
   GIÀ stampato): si nasconde lo stesso, o quella chip resta?

## 5. File da toccare

- `lib/utils/overviewSummary.ts` (nuovo: `selectOverviewStrip`, `verdictNamesMarket`); `lib/utils/overviewNarrative.ts`
  (`OverviewVerdict`, `leadLength`, `restLabel`, `overviewRestLabel`, `describeOverviewAsides`,
  `describeScheduledCaption`); `lib/utils/salesNarrative.ts` (`binding`: di questa spec, MOB-06 lo eredita).
- `app/dashboard/page.tsx`; `components/dashboard/overview/{PatrimonioTile,CashflowTile,OverviewVerdict}.tsx` e le tessere
  che inoltrano `collapse`/`asideWhenClosed` (`SintesiTile`, `ComposizioneTile`, `CostiTile`, `ObiettivoTile`,
  `CategoryTile`, `AssetPrincipaliTile`).
- Test di § 7; `e2e/overview.mobile.spec.ts`, `e2e/overview.spec.ts` (nuovi); `doc/mobile/budget.json`.

## 6. Passi

1. Branch, guide, `mobile:census` PRIMA, le domande di § 4.6. 2. Pure e test, falsificati. 3. `salesNarrative` e
`buildOverviewVerdict` (le attese di testo esistenti non cambiano). 4. Tessere, pagina. 5. Playwright, lint, `tsc`.
6. `mobile:census`/`mobile:budget`, giro sul mirror, documentazione, commit proposto.

## 7. Test e falsificazione

- `__tests__/overviewSummary.test.ts`: tre celle, `reason` per ogni `null`, tutte `null` → `[]`, `validateStrip` vuoto;
  **identità**: `narrativeToText([formatStripFigure(f)])` sta dentro `narrativeToText(verdict.sentence)` sullo stesso
  input, anche a quota −12,5 (`Math.round` e `Intl` arrotondano diverso). Falsificare con «Questo mese» senza
  `decimals`. `verdictNamesMarket` con e senza `marketEffect` (falsificare con `true` fisso).
- `__tests__/narrative.test.ts`: `leadLength: 0` = `lead` vuoto lo prova MOB-02 § 7; qui si riesegue.
- `__tests__/overviewNarrative.test.ts`: il taglio (fine della prima frase, o dopo la vendita con `taxIsTheStory`;
  falsificare spostandolo di un segmento); asides senza `/\d/` né «€» (falsificare con «giorno N di M»);
  `describeScheduledCaption` a 0, 0,5 e 350 € (falsificare con `> 0`); `restLabel`.
- `__tests__/salesNarrative.test.ts`: `binding` solo su tasse e controfattuale. Falsificare togliendolo: rosso qui e in (5).
- **`e2e/overview.mobile.spec.ts`**, progetto `mobile` (account base, `playwright.config.ts:187-200`): la risposta
  patchata con `page.route` + `route.fulfill` come `panoramica.snapshot.spec.ts:22-26`, cifre tonde, `incomeScheduled`
  presente, nessuna scrittura; tasse ≥ 10.000 € (il Chromium del container raggruppa «1.100 €», CLAUDE.md § Known Issues).
  (1) Titolo e `lead`, tre celle ≥ 44 px, eroe, né chip né «Mercato:» (con `marketEffect`), un trigger chiuso per
  tessera, pannelli `inert` e vuoti; prima riga sopra la pill solo con «solo titolo». (2) «Questo mese» apre «Il
  perché» con «dal mercato». (3) «Messo da parte finora» apre Cashflow, focus sul trigger; con `expensesScheduled: 350`
  la didascalia. (4) «Da inizio anno» → radio YTD `aria-checked`. (5) Δ −10.000, mercato +5000, tasse 20.000
  (`taxes-despite-market`): le tasse visibili senza tap. (6) Δ +30.000, tasse 10.000: niente «Il perché», paragrafo
  intero. (7) Reload: due righe aperte, `mobile-sections:panoramica` = `["panoramica-cashflow","panoramica-sintesi"]`.
  (8) DOM in ordine desktop, `y` in ordine mobile, nessuno sforamento (guardia di `e2e/fire.mobile.spec.ts:62-80`).
  Rossi falsificando: (1) contenuto montato da chiusa; (2) `onOpen('perche')` a vuoto; (3) `reveal` senza focus; (4)
  la cella che non cambia periodo; (5) `binding` tolto; (6) `splitVerdict` che ignora `binding`; (7) nessuna
  scrittura; (8) DOM invertito.
- **`e2e/overview.spec.ts`** (`desktop`): nessun `[id$="-trigger"]` nella griglia, striscia e «Il resto» invisibili,
  chip e digest visibili, paragrafo intero (falsificare ignorando `compact`).

## 8. Collaudo guidato

- A: `overview.spec.ts`, `panoramica.snapshot.spec.ts`, `assets.sale-tax.spec.ts`, Vitest nei due fusi. C: § 7.
- F (mirror, telefono vero se si può): 1) prima schermata; 2) le tre celle; 3) aprire, chiudere, reload; 4) tasse senza
  tap se il mese ne ha; 5) 1440 come prima, salvo le didascalie. G: `npm run mirror:remove`.

## 9. Rischi e rollback

- La misura sul mirror dipende dal mese (vendita tassata → verdetto lungo): annotarlo; l'invariante la tiene la E2E.
- «+3000,00 €» sono 10 caratteri in una cella di ~110 px: 18 px (MOB-02 § 4.4); con sei cifre intere, la guardia (8).
- Rollback per lettera: `liftedFigures` o `strip` non passati; `leadLength` assente = paragrafo intero. Mai togliere
  `binding` lasciando un taglio.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest» e § Current Status; `doc/guide/panoramica.md` § Composizione mobile (nuova) e § Per-page blind
  spots (la voce «The Cashflow tile keeps the WHOLE month» prende la striscia; la curva YTD da gennaio);
  `doc/guide/e2e-emulatori.md` (la risposta patchata); `Draft Release Temp.md` (una riga, senza dati privati);
  `doc/mobile/README.md` § 6.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-03-panoramica.md: la Panoramica sul telefono nella composizione
di MOB-02 — verdetto breve, striscia (questo mese, da inizio anno, messo da parte finora) da selectOverviewStrip,
Patrimonio totale lordo come LA tessera senza chip, digest e fine curva ripetuti, le righe chiuse nell'ordine di oggi,
le tasse di una vendita mai dietro un tap (binding in salesNarrative), il calendario come didascalia di Spese ed
Entrate, e la prima E2E della pagina a 390 (e2e/overview.mobile.spec.ts).

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § React Query and Derived State,
  § Motion, § Navigation, § Hierarchy, Density and Disclosure, § Accessibility, § 3 Panoramica), CLAUDE.md
- Leggi doc/guide/panoramica.md per intero, doc/guide/stati.md, doc/guide/e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/mobile/README.md, doc/mobile/MOB-02-primitive-della-composizione.md (§ 4, il contratto) e MOB-03 per
  intero; DESIGN.md § 5 (Page Verdict, Tile, Market Digest Line), § 6 e The Scheduled-Is-Not-Spent Rule (MAI
  rigenerarlo); PERF-07 e PERF-03 sono chiuse (2026-10-03: doc/guide/panoramica.md § The materialized summary; 2026-09-30: doc/guide/stati.md § The fourth reading); se MOB-06 è chiusa, il suo diff su PatrimonioTile
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; le cinque domande di § 4.6 con lo
strumento interattivo prima di toccare overviewNarrative; nessuna cifra del mirror in test, spec o documenti.
Chiusura: mobile:census e mobile:budget prima/dopo, budget.json abbassato; tsc, lint 0, Vitest in Europe/Rome; le spec
Playwright di § 7 con le falsificazioni viste rosse (dimmi quali); giro guidato di 5 punti sul mirror, poi
mirror:remove; la documentazione di § 10 in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort high.** Il lavoro sta nelle narrative: dove si taglia il verdetto, quali segmenti sono
vincolanti, l'identità fra striscia e frase. Un errore lì nasconde le tasse di una vendita dietro un tap.
