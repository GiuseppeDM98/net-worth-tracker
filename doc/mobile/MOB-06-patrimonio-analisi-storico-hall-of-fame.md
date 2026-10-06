# MOB-06 — Patrimonio · Analisi · Storico · Hall of Fame

> Stato: da fare · Priorità: 3 (quattro pagine su un contratto già scritto) · Sforzo: L · Dipende da: MOB-02, PERF-11
> (e, attraverso MOB-02, MOB-01 e PERF-02/03/12/14); `PatrimonioTile` e `describeSales` con MOB-03 · Sblocca: MOB-08, MOB-09

## 1. Il problema, misurato

Censimento 2026-09-26 (`doc/mobile/README.md` § 3), 390 × 844:

| Superficie | schermate | tessere (sopra / intere) | cifre / sopra | controlli / sopra | grafici | 768 · 1024 |
|---|---|---|---|---|---|---|
| Patrimonio | 5,52 | 7 (1 / 0) | 221 / 17 | 124 / 8 | 13 | 3,46 · 4,60 |
| Analisi | 4,23 | 6 (1 / 0) | 56 / 12 | 32 / 6 | 2 | 2,89 · 3,87 |
| Storico | 5,05 | 5 (1 / 0) | 103 / 15 | 27 / 1 | 3 | 3,20 · 4,20 |
| Hall of Fame | 3,43 | 5 (1 / 0) | 49 / 17 | 11 / 2 | 1 | 2,17 · 2,85 |

Righe del 2026-09-26 (chi implementa le riverifica):

- **Patrimonio** `app/dashboard/assets/page.tsx:410-525`: sette celle aperte; `:168` legge il registro senza `isError`
  (fallita = «nessuna operazione»); `StrumentiTile.tsx:621` (lista) e `:645` (tabella): l'elenco due volte. Verdetto
  `patrimonioNarrative.ts:236-282`: una frase fino a «; sul mercato…» (`:257`), poi le vendite con la ritenuta (`:277`,
  `describeSales`, `salesNarrative.ts:150`, condiviso con la Panoramica).
- **Analisi** `components/cashflow/AnalisiTab.tsx:708-799`; la Scheda esiste solo con un focus (`:775`); si atterra da
  `handleEntitySelect` (`:525-542`) o dal restauro dell'URL, che è un EFFETTO (`:323-343`), via `scrollToScheda` (un
  `setTimeout`, `:288-296`); il calendario chiude il verdetto (`analisiNarrative.ts:334`).
- **Storico** `app/dashboard/history/page.tsx:424-483`, una sola lettura (`:139-147`, fallita `:157`); due chip di `EvoluzioneTile.tsx:151-170`
  ripetono la prima frase; il Driver è un ledger che torna all'euro (`storicoNarrative.ts:461`).
- **Hall of Fame**: composta da MOB-02 § 4.7; le azioni stanno sotto il verdetto (`hall-of-fame/page.tsx:424`).

## 2. Obiettivo misurabile

`npm run mobile:budget` a 390, `doc/mobile/budget.json` abbassato al misurato:

- Patrimonio, Analisi, Storico: schermate **≤ 2,5**; una tessera aperta; **≤ 5 cifre fuori dal verdetto** sopra la piega;
  la prima riga chiusa sopra la pill. Se non ci sta, l'ordine dei tagli è fisso: il grafico di LA tessera si accorcia
  sotto `tablet:` (in Patrimonio `min-h-[120px]`, la misura di MOB-03 § 4.3 per la tessera condivisa), poi la striscia
  perde l'ultima cella; mai la lettura né il valore. Patrimonio: vedi la domanda 4 (§ 4.6).
- Hall of Fame: il ≤ 2,0 di MOB-02. Patrimonio al mount a 390: 0 `AssetRow`, 0 `svg.recharts-surface` in `main`.
- A 1440 le pagine di oggi, salvo § 4.6. In Playwright: ordine del DOM, pannelli chiusi vuoti, memoria.

## 3. Non-obiettivi

B e C; le primitive (un campo nuovo solo additivo); il tablet (MOB-08); DESIGN.md (MOB-09); la Panoramica (MOB-03);
Plusvalenze (MOB-05); le sparkline e i dialog (PERF-11); la matematica; le azioni della navbar. Sono di altre spec, e qui
si usano: il contratto di `PatrimonioTile` (`liftedFigures`, la curva a 120 px) e i `binding` di `describeSales` (MOB-03
§ 4.3-4.4), il `binding` di `scheduledSentence` (MOB-04 § 4.5); se questa spec arriva prima li scrive con quei nomi.

## 4. Design

**Comune.** `useMobileSections({ route, sections })` (`route` = `assets`, `analisi`, `history`, `hall-of-fame`); ogni
riga `Tile` + `collapse` + `asideWhenClosed` (parole, mai un importo: The Closed-Row Rule; questa, Binding-Clause e
Lifted-Figure sono PROPOSTE, MOB-09); `PageRest` nella griglia; LA tessera fuori dal controller, `order-1`;
`PageVerdict` + `strip` (`VerdictStrip`, `onOpen`: `perche` → `restCollapse.onOpenChange(true)`, il resto →
`sections.reveal`, come MOB-03 § 4.2) + `restCollapse`; `LIFTED_FIGURE_CLASS` via `liftedBlocks`; `validateStrip` in un
test per pagina.

### 4.1 Patrimonio

- **LA tessera** = Patrimonio totale lordo (valore e curva).
- **Verdetto**: «Sul mercato ha spinto soprattutto un ETF (+900 €).» diventa una frase sua; `lead` = «Il portafoglio vale
  120.000 €: +1500 € (+1,27%) su agosto, 12 strumenti e 3 conti.»; `restLabel` «il mercato del mese». **Vincolante**: la
  ritenuta e il controfattuale di `describeSales` sono `binding` se `estimatedTax > 0` (The Binding-Clause Rule): quel
  mese il verdetto resta intero. Li marca MOB-03 § 4.4 (modulo condiviso): Patrimonio li eredita.
- **Striscia** `selectPatrimonioStrip({ gains, cash })` (`patrimonioSummary.ts`), senza `lifts`: «G/P non realizzato»
  (l'etichetta di `RendimentoTile.tsx:68`; `gains.gainLoss`, `signed-currency`, `decimals: 2` perché la tessera stampa i
  centesimi, `:75-76`, campo di MOB-02 § 4.1; apre `patrimonio-rendimento`; `null` con `gains.count === 0`, dove
  lo zero non è misurato); «Liquidità» (`cash.shareOfTotal`, `percent`, `decimals: 1`, apre `patrimonio-liquidita`).
  Overview non letta: niente `PageVerdict`, niente striscia.
- **Non si ripete** il chip «questo mese» (è nel `lead`): `liftedFigures={['monthly']}`; il digest «Mercato» resta.
  `PatrimonioTile` condivisa: `liftedFigures?: readonly ('monthly' | 'yearly' | 'movers' | 'curve-end')[]` e la curva a
  `min-h-[120px]` sotto `tablet:` sono di MOB-03 § 4.3; li aggiunge chi arriva prima, con questi nomi.
- **Il conteggio dell'hero** sotto `desktop:` chiama `sections.reveal('patrimonio-strumenti')`; a 1440 resta il link a
  `#strumenti` (`page.tsx:430`, `StrumentiTile.tsx:571`): se la `section` prende l'id della riga, l'`href` lo segue.
- **Righe**: `patrimonio-movimenti` (il mese) · `-liquidita` («3 conti») · `-classi` («per asset class») · `-rendimento`
  («vs PMC») · `-mutuo-<propertyId>` (il nome dell'immobile se più d'uno, se no «interessi e capitale») · `-strumenti`
  (`formatHoldingCounts(held, 0)`: la tabella di gestione, chiusa non monta nulla; il chip di classe composito di #403
  vive dentro le sue righe, con le quote `sr-only`: non tocca striscia né budget).
- **Stati**: `isError` del registro → Movimenti `failed` con `ErrorNotice collapse`; `mortgageError` → una riga
  `patrimonio-mutuo` `failed`; overview non letta (`:380`): l'ErrorNotice di oggi, `defaultOpen: ['patrimonio-movimenti']`.

### 4.2 Analisi

- **LA tessera** = Periodo. L'asse va dove dice MOB-02 § 4.9, 9 (oggi dopo il verdetto, `:712`); il `lead` nomina
  comunque il periodo («Nel 2026…»).
- **Verdetto**: il calendario sale SUBITO dopo il totale che qualifica e la prima frase si spezza a «; <categoria> pesa»:
  «Nel 2026 hai speso 30.000 €, −4,2% su gen–ago 2025. Nel totale ci sono ancora 2400 € di spese già in calendario da
  qui a fine anno. Casa pesa…». `lead` = le prime due, `restLabel` «categorie e fuori scala». `scheduledSentence`
  (`cashflowNarrative.ts:241`, condivisa: se MOB-04 § 4.5 l'ha già marcata, si eredita) è `binding` (The
  Scheduled-Is-Not-Spent Rule): nel `lead` il taglio regge, in coda lo annullerebbe quasi sempre. Due frasi di `lead`
  vanno oltre «titolo + prima frase» (brief, decisione 4): domanda 2.
- **Striscia** `selectAnalisiStrip(totals)` (`analisiSummary.ts`; `PeriodCashflowTotals`, `tracciamentoSummary.ts:25`):
  «Entrate» (`currency`, apre `analisi-entrate`), «Risparmio» (`totals.net`, `currency`: il `−` solo se negativo, come il
  trio `CashflowKpiTrio.tsx:74-75` e MOB-04 § 4.2; apre `analisi-flusso`, con il `lifts` sul blocco «Risparmio» del
  Flusso: sotto); solo «Entrate» porta `lifts: { section: 'analisi-periodo', block: 'trio' }`, che nasconde anche il
  Risparmio del trio; «Spese» è nel `lead`. `PeriodoTile` + `liftedFigures?: readonly 'trio'[]` nasconde il trio E la sua
  didascalia del confronto (`PeriodoTile.tsx:55-59`), che resterebbe orfana.
- **Righe**: `analisi-fuori-scala` (il mese) · `analisi-spese`, `analisi-entrate` («per categoria», non l'importo) ·
  `analisi-maggiori` («per importo») · `analisi-scheda` (il nome dell'entità) · `analisi-flusso` («per tipo»; «per ruolo»
  quando `spendingRolesEnabled` è acceso e quella è la vista scelta: la stessa sorgente che sceglie la vista).
- **Il Flusso sotto i 640 px** (dal 2026-09-27, #400 e #401) non è un Sankey: è una barra di quote (le spese per tipo, o i
  ruoli 50/30/20), le categorie come `RankedRows` e un blocco di chiusura «Risparmio». La soglia è del GRAFICO
  (`useMediaQuery('(max-width: 639px)')` in `AnalisiTab`, doc/mobile/README.md § 9): da 640 a 1439 la riga aperta disegna
  il Sankey. Tre conseguenze per questa spec:
  - **La cifra sollevata non si ristampa.** Il blocco «Risparmio» stampa l'avanzo, che è `totals.net` quando è positivo:
    la cella «Risparmio» della striscia porta `lifts: { section: 'analisi-flusso', block: 'risparmio' }` e `FlussoTile`
    prende `liftedFigures?: readonly 'risparmio'[]`, che nasconde il blocco «Risparmio» della vista per tipo
    (intestazione e nota stampano entrambe l'avanzo) e, nella vista per ruolo, la nota di «Risparmi» (`describeFlowSurplus` stampa l'avanzo sempre, «Più …» dopo le righe di risparmio) e,
    quando nessuna riga è classificata come risparmio, l'intero gruppo «Risparmi»: la sua intestazione vale allora
    `saved + surplus` = l'avanzo, la cifra sollevata. La barra resta intera: la legenda stampa quote, non euro. Il trio
    di `PeriodoTile` resta nascosto dal `lifts` della cella «Entrate». README § 9: «una tessera sul telefono non ripete ciò
    che striscia o verdetto hanno stampato».
  - **L'aside con controlli** sta fuori dal bottone, solo da aperta (MOB-02 § 4.2): sotto i 640 px è il solo «Per ruolo ·
    Per tipo», e solo con l'interruttore acceso; «Sottocategorie» e il conteggio dei nodi esistono da 640 in su. La vista
    scelta è stato della tessera: non entra in `mobile-sections:analisi` e riparte da «Per ruolo» a ogni montaggio.
  - **«Mostra tutte»** è una disclosure con `aria-expanded` e `aria-controls`: non è una riga chiusa (MOB-01 § 4).
- **La Scheda** è in `sections` solo con un focus. Sotto `desktop:` l'atterraggio (`handleEntitySelect`, restauro
  dall'URL) chiama `sections.reveal('analisi-scheda')` al posto di `scrollToScheda`, DENTRO lo stesso `setTimeout`: nel
  restauro è il callback asincrono dell'effetto che esiste già, mai un `setState` nel suo corpo
  (`react-hooks/set-state-in-effect`; lo schema di `history/page.tsx:164-172`). Il chevron
  chiude la riga, non il focus (l'URL lo tiene: un reload la riapre); «Chiudi» ed Escape come oggi. Nessuna riga `failed`.

### 4.3 Storico

- **LA tessera** = Evoluzione.
- **Verdetto**: `lead` = la prima frase, `restLabel` «l'ultimo anno»; «versamenti inclusi» (`storicoNarrative.ts:157`) è
  `binding` (è già nel `lead`: il flag ce lo tiene).
- **Striscia** `selectStoricoStrip({ pace, featured })` (`storicoSummary.ts`): «Ultimi 12 mesi» (`pace.trailingDelta`, `signed-currency`,
  `lifts: { section: 'storico-evoluzione', block: 'trailing' }`, apre `perche`); «Risparmio {anno}» e «Mercato {anno}»
  dalle righe di `buildDriverLedger(featured.row)` (`resolveFeaturedDriverYear`, `storicoSummary.ts:302`), aprono
  `storico-driver`. Con `isRunning` l'etichetta porta la finestra della riga del Driver (`describeRunningWindowShort`,
  `DriverTile.tsx:309`: «Risparmio 2026 · gen–set»), mai un anno intero che non c'è; `featured === null` → niente celle.
- **Il ledger non si solleva mai**: torna all'euro sotto gli occhi (DESIGN → Ranked Rows with Residual); una cella lo APRE.
  Un test vieta `lifts` su `storico-driver`; candidato per The Lifted-Figure Rule (MOB-09).
- **Non si ripete**: `EvoluzioneTile` + `liftedFigures?: readonly ('growth' | 'cagr' | 'trailing')[]`.
- **Righe**: `storico-raddoppi` · `storico-composizione` («per classe») · `storico-driver` · `storico-valore` («per
  strumento»). Nessuna riga `failed` (dal 2026-09-29 la pagina compone gli `isError` delle sue sei chiavi con `composeReadState`).

### 4.4 Hall of Fame

Nessun asse (The Ranking-Is-Not-An-Axis Rule). Sotto `desktop:` «Aggiungi una nota» e «Aggiorna i record» scendono dopo
il Dettaglio, come in Storico (`history/page.tsx:498-501`): gesti rari, ~56 px di prima schermata. Lo stato vuoto
(`hall-of-fame/page.tsx:384-395`) non cambia. MOB-02 § 3 lascia qui solo censimento e guida: domanda 5.

### 4.5 Conflitti con PERF

- **PERF-11, nessun conflitto**: la riga monta Strumenti all'apertura, poi UN elenco (B) e ogni `AssetRow` la sua
  sparkline solo aperta (A). Ritocco: il `useMediaQuery('(min-width: 1440px)')` di B diventa `!useCompactLayout()` (una
  sorgente), e il primo frame server passa dalla lista alla TABELLA: il commento che PERF-11 § 2 chiede si aggiorna. I
  dialog di C sono della pagina; il suo `assets.rows.mobile.spec.ts` apre prima «Strumenti». Lo stesso vale per la prova
  a 390 di `e2e/assets.composite-chip.spec.ts` (#403): gira nel progetto `desktop` con `setViewportSize`, ma
  `useCompactLayout` legge la larghezza, quindi a 390 Strumenti è chiusa e le `AssetRow` non esistono — il suo
  `openPatrimonio` apre la riga `patrimonio-strumenti` prima di aspettare il nome dello strumento.
- **PERF-14**: `layout="position"` (`assets/page.tsx:385`) è già tolto; nessun `layout` nuovo. **PERF-04** (in develop dal
  2026-09-30) ha reso pigri i grafici delle disclosure e della Scheda di Analisi e il Sankey del Flusso, che sotto i
  640 px non si scarica (doc/guide/cashflow-analisi.md); su Storico solo il PDF è pigro: Composizione, Valore ed
  Evoluzione portano recharts nel grafo iniziale e il Dettaglio resta statico (doc/guide/storico.md) — la riga chiusa
  risparmia il mount, non il download; un grafico di riga reso pigro (`lazyComponent`) riserva l'altezza (MOB-02 § 4.8). **PERF-03** (in develop dal 2026-09-30): «Aggiornato alle…» sta nel `PageHeader`, nella riga della
  descrizione: nessuna riga in più nel budget. **PERF-05/06**: la striscia legge i riassunti come sono. **PERF-12** (in develop dal 2026-10-06, AGENTS.md § Motion): `mounted` nel gestore, `reveal` in
  un `setTimeout`, mai nel corpo di un effetto (§ 4.2).

### 4.6 Domande al proprietario

1. Patrimonio: «Sul mercato ha spinto…» frase sua anche a 1440?
2. Analisi: calendario al secondo posto e prima frase spezzata anche a 1440? (Se no: verdetto intero con il calendario.)
   Due frasi di `lead` derogano alla decisione 4; l'alternativa del brief è la didascalia: `scope` = `scheduledSentence`
   come Tracciamento (MOB-04 § 4.2), `lead` = la prima frase. Con lo `scope` il builder non ripete `scheduledSentence` in
   coda: il suo `binding` annullerebbe il taglio.
3. Movimenti del mese in lettura fallita: `ErrorNotice` anche a 1440 (proposta: sì, come Plusvalenze)?
4. Patrimonio: ≤ 5 cifre non regge con la tessera di oggi (eroe, chip dell'anno a due cifre, due etichette della curva,
   più le celle; poi il digest). Sollevare anche `'yearly'` e `'curve-end'` come MOB-03 § 4.3, due celle, o nessuna
   striscia e il misurato come baseline?
5. Hall of Fame: le due azioni in fondo sotto `desktop:` (oltre il perimetro di MOB-02 § 3)?
6. Analisi: la didascalia della barra del Flusso («Quote delle spese (X €)») ristampa il totale del `lead`: sul telefono
   perde l'importo (proposta: sì, README § 9), o resta perché nomina la base della barra?

## 5. File da toccare

- `app/dashboard/assets/page.tsx`, `components/dashboard/overview/{PatrimonioTile,ComposizioneTile}.tsx`,
  `components/assets/StrumentiTile.tsx`, `components/assets/tiles/*.tsx`, `lib/utils/{patrimonioSummary,patrimonioNarrative}.ts` (`salesNarrative.ts` solo se MOB-03 non è chiusa).
- `components/cashflow/AnalisiTab.tsx`, `components/cashflow/analisi/tiles/*.tsx`,
  `components/cashflow/analisi/{FlowShareMobile,SpendingTypesMobileFlow,SpendingRolesMobileFlow}.tsx` (il blocco
  sollevato del Flusso), `lib/utils/{analisiSummary,analisiNarrative}.ts` (`cashflowNarrative.ts` solo se MOB-04 non è chiusa).
- `app/dashboard/history/page.tsx`, `components/history/tiles/*.tsx`, `lib/utils/{storicoSummary,storicoNarrative}.ts`.
- `app/dashboard/hall-of-fame/page.tsx`; i test di § 7; `doc/mobile/budget.json`.

## 6. Passi

1. Branch, guide, `mobile:census` PRIMA, domande di § 4.6. 2. Le pure e i test, falsificati. 3. Una pagina alla volta,
con la sua spec verde prima della successiva. 4. Spec esistenti, E2E completo, census e budget. 5. Giro, doc, commit.

## 7. Test e falsificazione

- `__tests__/{patrimonio,analisi,storico}Summary.test.ts`: il testo di ogni cella (`formatStripFigure`) è identico a
  quello della tessera (G/P con i centesimi, Risparmio senza «+», la finestra su un anno in corso); le `null`
  (`gains.count === 0`, `featured === null`); `validateStrip` vuoto; nessun `lifts` su `storico-driver`. Falsificare
  togliendo `decimals: 2` a G/P e mettendo `signed-currency` a Risparmio: l'identità diventa rossa.
- `{patrimonio,analisi,storico}Narrative.test.ts` (e `sales`/`cashflow` solo se MOB-03/MOB-04 non li hanno già): dove
  chiude il `lead`; con ritenuta `rest = []`
  (falsificare togliendo il `binding`).
- `e2e/mobile-composition.patrimonio.mobile.spec.ts` (`mobile`, seed base): prima schermata, `#patrimonio-strumenti-panel`
  `inert` e vuoto, 0 `AssetRow`; il conteggio apre Strumenti; memoria; nessuno sforamento; con l'overview interrotta
  (`page.route('**/api/dashboard/overview*', r => r.abort())`, come `e2e/settings.spec.ts:143`) l'`ErrorNotice`, nessuna
  striscia, Movimenti aperta. Rossi falsificando: `collapse` tolto a Strumenti (N `AssetRow`), nessuna scrittura della
  memoria (chiusa dopo il reload), `defaultOpen` ignorato.
- `e2e/mobile-composition.patrimonio.spec.ts` (`desktop`, 1440; `mobile` è `isMobile`): nessun `[id$="-trigger"]` nella
  griglia, striscia e «Il resto» invisibili; non «nessun `aria-expanded`», che `StrumentiTile.tsx:549` e
  `MovimentiTile.tsx:117` hanno già. Falsificare ignorando `compact`.
- `e2e/mobile-composition.analisi.mobile.spec.ts` (`analisi-mobile`): il deep link con una categoria di
  `scripts/seedAnalisiE2E.mts` apre `analisi-scheda`, focus sul trigger; chevron + reload → riaperta; «Chiudi» → focus
  all'opener. Falsificare togliendo il `reveal` dal restauro.
- `e2e/mobile-composition.history.mobile.spec.ts` (`mobile`): la cella `/^Risparmio \d{4}/` (l'anno scritto invecchia)
  apre il Driver e le righe sommano il totale, letto come `e2e/history.spec.ts:70-89` (falsificare sollevando una riga).
- `analisiSummary.test.ts`: il testo della cella «Risparmio» (`formatStripFigure`) è identico a quello dell'intestazione
  del blocco «Risparmio» del Flusso (`cachedFormatCurrencyEUR(breakdown.surplus, true)`; `surplus === totals.net` sul
  fixture). Falsificare stampando il blocco con i centesimi (`cachedFormatCurrencyEUR(v, false)`): l'identità diventa rossa.
- `analisi.mobile.spec.ts`, `history.mobile.spec.ts` e la prova a 390 di `assets.composite-chip.spec.ts` aprono le righe
  prima di leggere. In `analisi.mobile.spec.ts` le prove del Flusso di #400/#401 (la legenda «Quote del flusso», la riga
  che apre la Scheda, «Per tipo» nel blocco 50/30/20) aprono `analisi-flusso` PRIMA dell'ancora positiva: chiusa, la
  legenda non è nel DOM e l'assenza del grafico passerebbe a vuoto. Il blocco «Risparmio» (`:84`, oggi `toBeVisible`) e la nota sotto «Risparmi»
  (`:139`) cambiano verso: a 390 li nasconde il `lifts` della cella, quindi la cella «Risparmio» stampa l'avanzo e la
  regione «Risparmio» del Flusso non è visibile, con la legenda come ancora positiva (falsificare togliendo `liftedFigures`
  a `FlussoTile`: la regione torna visibile). `mobile-composition.hof.mobile.spec.ts`:
  «Aggiorna i record» sotto l'ultima riga (falsificare lasciandolo sotto il verdetto). L'eyebrow rosso di Movimenti e
  Mutuo resta a Vitest (`resolveOpenSections` con `failed`): registro e rate sono Firestore dal client (MOB-02 § 7).

## 8. Collaudo guidato

- A: le spec desktop di Patrimonio (`assets.*`, `assets.composite-chip` compresa, `cashflow.mortgage`), Analisi, Storico,
  Hall of Fame; Vitest nei due fusi.
  C: § 7. F (mirror, telefono vero se si può): 1) Patrimonio e il conteggio che porta a Strumenti; 2) Mutuo come riga;
  3) Analisi da un link di categoria copiato dal desktop; 4) «Risparmio» apre il Driver e il ledger torna; 5) reload,
  «Riduci movimento», le azioni di Hall of Fame in fondo. G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Patrimonio non entra nella prima schermata (hero ~700 px): i tagli di § 2, il numero nel commit.
- `PatrimonioTile` condivisa con MOB-03: chi arriva secondo rilegge il diff del primo.
- Rollback per lettera (A Patrimonio, B Analisi, C Storico, D Hall of Fame): nessun `collapse` = la pagina di oggi.

## 10. Documentazione da aggiornare

CLAUDE.md «Latest»; `doc/guide/{patrimonio,cashflow-analisi,storico,hall-of-fame}.md` § Composizione mobile;
`doc/guide/e2e-emulatori.md`; `Draft Release Temp.md` (una riga, senza dati privati); `doc/mobile/README.md` § 6 (con il
«ledger mai sollevato» per MOB-09) e § 3. AGENTS.md no.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-06-patrimonio-analisi-storico-hall-of-fame.md: Patrimonio,
Analisi e Storico sulle primitive di MOB-02 (LA tessera, select<Page>Strip, i blocchi non ripetuti, le righe
chiuse, i binding), la Scheda come riga che si apre da sola dall'URL, il ledger del Driver mai sollevato, Strumenti
chiusa sopra PERF-11, le azioni di Hall of Fame in fondo. I nomi sono quelli di MOB-02 § 4.1: non rinominarli.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § React Query and Derived State,
  § Motion, § Navigation, § Hierarchy, Density and Disclosure, § Accessibility), CLAUDE.md
- Leggi doc/guide/patrimonio.md, cashflow-analisi.md, storico.md, hall-of-fame.md, stati.md, e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/mobile/README.md, MOB-02 e questa spec per intero; DESIGN.md § 5, § 6 e il capitolo mobile se c'è (MAI
  rigenerarlo); doc/perf/PERF-11 (deve essere chiusa); MOB-03 § 4.2-4.4 e MOB-04 § 4.2 e § 4.5 (i nomi di
  PatrimonioTile, `decimals`, i binding di describeSales e scheduledSentence): se sono chiuse, il loro diff
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; le domande di § 4.6 con lo
strumento interattivo, prima di toccare i builder dei verdetti.
Chiusura: mobile:census e mobile:budget prima/dopo; tsc, lint 0, Vitest in Europe/Rome; le spec Playwright di § 7 con
le falsificazioni viste rosse e l'E2E completo; npm run perf:census -- --route=assets; giro guidato di 5 punti sul mirror, poi
mirror:remove; la documentazione di § 10 in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Quattro pagine sullo stesso contratto, lavoro esteso e meccanico; i tre punti di
dominio (ritenuta, calendario, ledger) sono scritti qui e chiusi da test falsificati.
