# Prompt di redesign — una sessione per sezione

> Raccolta dei prompt per propagare a tutta l'app lo stile fissato dalla Panoramica il 2026-08-22
> (**«Verdict over Tiles»**, DESIGN.md → §1 e §5). Ogni prompt è autonomo e già completo del
> preambolo comune: copia il blocco della sezione e basta. Una sezione per sessione, una sessione per branch, un commit.
>
> Ordine consigliato: 00 Shell → 01 Patrimonio → 02 Tracciamento → 08 Rendimenti → 09 Storico →
> 10 Allocazione → 11-15 FIRE → 16 Previdenza → 03-07 resto del Cashflow → 17 Assistente →
> 18 Impostazioni → 19 Auth → 20 Landing → 21 Dialog trasversali → 22 Stati → 23 Email/PDF.
> Patrimonio per primo perché oggi è la pagina che stona di più (ha ancora l'hero gemello vecchio).
>
> Una sezione già propagata porta una riga **Stato** subito sotto il titolo, prima di «Superfici»:
> ``**Stato**: ✅ fatto il YYYY-MM-DD (`branch`) — scostamenti dal prompt. Il prompt resta come riferimento di metodo.``
> Sta lì e non in fondo perché chi scorre i titoli deve vedere se la sezione è chiusa senza attraversare il prompt.

## Modello ed effort — come leggere i suggerimenti

Ogni sezione indica **modello + effort** consigliati (`/model`, `/effort`). Criterio: più regole
di dominio da rispettare (AGENTS.md lungo, calcoli, cache) → più capacità; più superficie
visiva da giudicare → il canvas conta più del modello.

- **Fable 5 · ultracode** (xhigh + workflow multi-agente): pagine con molte regole e molti
  numeri, dove conviene una mappa dei fatti in parallelo e una verifica avversaria del layer
  puro prima di scrivere. Costa di più; usalo dove un errore di calcolo è plausibile.
- **Fable 5 · xhigh**: pagine con regole medie, una sola persona può tenerle tutte in testa.
- **Opus 5 · high**: restyle a logica invariata, form, stati, superfici fuori DOM.
- **Sonnet 5 · high**: solo per ritocchi dopo che il pattern è consolidato (mai per la prima
  propagazione di una pagina).
- In ogni caso: la parte «canvas» va bene anche a effort più basso; alza l'effort quando si
  passa al codice se la sessione è unica.

---

## 00 · Shell e navigazione

**Stato**: ✅ fatto il 2026-08-22 (`feature/shell-redesign`) — compact default + `legacy`, tab sotto l'header con `aria-label`, `PageContainer width="wide"`, sidebar/rail/drawer, `TileGridSkeleton`, primitive in `components/ui/`. Le sezioni successive trovano già le primitive lì: importare `Tile`/`NarrativeText`/`RankedRows` da `components/ui/`, non dalla Panoramica.

**Superfici**: `components/layout/{Sidebar,BottomNavigation,SecondaryMenuDrawer,PageHeader,PageTabBar,PageTabs,PageContainer,ThemePicker,AssistenteBanner,LogoutDialog}.tsx`, `components/ui/sidebar.tsx`, `app/dashboard/layout.tsx`, `lib/constants/navigation.ts`.

**Modello/effort**: Fable 5 · xhigh — tocca ogni pagina, poche regole ma zero margine per regressioni (verifica a tre viewport).

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Shell e navigazione» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Obiettivo: la cornice di tutte le pagine deve sparire quanto basta perché il verdetto sia la
prima cosa letta. Non cambiamo l'architettura (sidebar desktop a 1440+, pill in basso in
portrait, drawer «Altro», nessuna barra in portrait) ma la portiamo al nuovo registro.

Da fare:
- PageHeader: variant="compact" diventa il default per le pagine ridisegnate; verifica che la
  variante default resti identica per le pagine non ancora propagate. Il PageTabBar (Cashflow,
  FIRE, Impostazioni) deve convivere con l'header compatto: tab sotto l'header, stessa riga di
  eyebrow, niente doppio titolo. Fix del KNOWN GAP: aria-label sulle tab inattive sotto 1440.
- PageContainer: max-w resta 1600 per le pagine vecchie; le pagine ridisegnate usano 1920 dal
  proprio root. Valuta se spostare il 1920 in PageContainer con una prop, senza toccare le pagine
  non propagate.
- Sidebar: footer account (avatar, nome, switcher account condiviso, tema, esci) e banner
  Assistente: ridurre il chrome (il banner viola è l'unico colore non-dato nella chrome:
  decidi sul canvas se resta, con motivazione). Stato attivo = --sidebar-accent, nessun altro
  colore. Collassata a icona: verifica i 44px di tocco.
- Pill mobile e drawer «Altro»: stesse 3 rotte primarie + Altro; il drawer elenca Analisi e
  Pianificazione con etichette di sezione; il FAB «+» su Cashflow resta. Tipografia a ramp
  (11px label pill, 13/14px drawer).
- Skeleton di pagina: un solo componente di skeleton «a tessere» riusabile (griglia + blocchi
  muted) al posto dei cinque skeleton per pagina, da adottare man mano.

Canvas: Main desktop con sidebar espansa E collassata (due artboard), MainMobile con pill e
drawer aperto (terzo artboard). Nessuna pagina dentro: usa la Panoramica come contenuto.

Verifica: Playwright a 1440 (sidebar) e 390 portrait (pill + drawer), più 1024 landscape
(nessuna pill, barra con trigger). Nessun overflow.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 01 · Patrimonio

**Stato**: ✅ fatto il 2026-08-22 (`feature/patrimonio-redesign`) — slot di riga 2 = «Rendimento»; Movimenti mostra 5 righe con «Mostra tutte» (non 3); in più la correzione del motore Δ (`assetPerformanceDeltas.ts`). Il prompt resta come riferimento di metodo.

**Superfici**: `app/dashboard/assets/page.tsx`, `components/assets/{StrumentiTile,AssetRow,CashAccountDialog,AssetSparkline,AssetDialog,TransactionDialog,AssetMovementsDialog,TaxCalculatorModal}.tsx`, `components/assets/tiles/*`.

**Modello/effort**: Fable 5 · ultracode — ledger, prezzi manuali, effetto prezzo per strumento, invalidazioni doppie.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Patrimonio» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda della pagina: «Cosa possiedo, e cosa si è mosso?»

Verdetto (lib/utils/patrimonioNarrative.ts): «Il portafoglio vale X: +Δ (+p%) su {mese prec.},
{N} strumenti; {lo strumento che ha pesato di più} ha fatto il grosso (+€).» Il driver è per
STRUMENTO (non per classe come in Panoramica): usa lo stesso effetto prezzo
(attributeSelectedChange su byAsset, immobili al lordo del mutuo, fondi pensione al netto dei
versamenti). Se lo snapshot precedente non ha byAsset, la clausola sparisce.

Tessere (12 col):
- Patrimonio (5 col, 2 righe): numero, chip raggruppati, sparkline; footer «Mercato:» per
  strumento (top 3) — NON duplicare il digest per classe della Panoramica.
- Liquidità (3): i conti cash, uno per riga, con il saldo; lettura «Il X% del patrimonio è
  sul conto; Y € su {conto principale}».
- Movimenti del mese (4): acquisti/vendite del registro operazioni nel mese (assetTransactions):
  lettura «Hai comprato X € e venduto Y €»; 3 righe; link a AssetMovementsDialog.
- Classi (3): CompositionBar + righe, come in Panoramica ma con il link ad Allocazione.
- Strumenti (9, riga 3, tutta larghezza): la tabella. Resta una tabella (è la pagina di
  gestione), ma con la cadenza delle tessere: eyebrow + lettura («19 strumenti, 2 valutati a
  mano») + la tabella flat divide-y; colonne ordinabili; Δ dietro «Andamento» come oggi; tinta
  --chart-3 per i prezzi manuali; 2-click delete invariato.

Cosa sparisce: l'hero gemello della Panoramica (44/54px, chip 15px a colonne, toFixed con il
punto) — è il debito segnato in CLAUDE.md Known Issues. Cosa resta: AssetDialog 2-step,
TransactionDialog, TaxCalculatorModal (solo restyle a ramp, nessuna logica).

Vincoli: mutazioni invalidano assets.all + dashboard.overview (AGENTS); regola dell'asset cash
picker; requiresManualPricing è l'unica fonte. Rendimenti per strumento: da topAssets o dal
registro, mai ricalcolati nel componente.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 02 · Cashflow · Tracciamento

**Stato**: ✅ fatto il 2026-08-22 (`feature/cashflow-tracciamento-redesign`) — la tessera «Trasferimenti» è stata scartata su richiesta: riga 2 = «Risparmio nel tempo» da solo (7 colonne); i filtri della toolbar restringono solo i Movimenti; la catena legacy (`CashflowHero`, `CashflowTrackingMobile`, `cashflow-kpi/*`, `CategoryBreakdownList`, `trackingSummary`) è stata eliminata. Il prompt resta come riferimento di metodo.

**Superfici**: `app/dashboard/cashflow/page.tsx` (tab Tracciamento), `components/cashflow/{ExpenseTrackingTab,TransactionFeed,CompactExpenseRow,MobileFiltersDrawer}.tsx`, `components/cashflow/tiles/*`, `components/expenses/{ExpenseDialog,ExpenseTable}.tsx`.

**Modello/effort**: Fable 5 · ultracode — segno per type, transfer net-zero, riconciliazioni a due conti, molti componenti.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Cashflow · Tracciamento» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Come sta andando il mese (o il periodo scelto)?»

Verdetto (cashflowNarrative.ts): riusa e generalizza describeCashflow della Panoramica: «Ad
agosto hai messo da parte il 40% (1.940 €): entrate 4.850 €, spese 2.910 €, in calo del 6,4% su
luglio.» Toni: ≥20% positivo, 0-20 neutro, <0 negativo («Speso più di quanto è entrato»).
Un solo asse periodo (quello di CashflowHero oggi) che governa verdetto E tessere.

Tessere:
- Cashflow del periodo (5, 2 righe): i tre KPI (22px), «Spese a fine mese» al ritmo attuale +
  mese precedente (riusa projectMonthEndSpending), e un grafico a barre entrate/spese degli
  ultimi 6 mesi che riempie l'altezza (pattern SVG absolute).
- Spese per categoria (4) con residuo; Entrate per categoria (3) — riusa CategoryTile.
- Trasferimenti (2): totale e conteggio, net-zero dichiarato in lettura.
- Risparmio nel tempo (3): tasso di risparmio ultimi 12 mesi (cashflowTimeSeries), lettura
  «media 31%, miglior mese aprile».
- Movimenti (12, riga 3): il TransactionFeed resta (è l'inventario), con header a cadenza
  tessera e la toolbar filtri; su mobile CashflowTrackingMobile + drawer filtri invariati.

Vincoli (AGENTS): classificazione SEMPRE per type; transfer net-zero; Risparmio € e Rapporto
sono due numeri diversi di proposito; delete dal feed = drawer-confirm e branch transfer;
ExpenseDialog 2-step su create, single-step su edit, cambio tipo con avvisi. Il FAB mobile
resta l'unica azione «aggiungi» in portrait.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 03 · Cashflow · Dividendi

**Stato**: ✅ fatto il 2026-08-23 (`feature/cashflow-dividendi-redesign`) — slot di riga 2 = «Per anno»; i due blocchi tabellari server vivono in un collapsible «Dettaglio» sotto la griglia. Scostamenti dal prompt, tutti deliberati: `DividendStats` NON è rimasto intoccato (si è spaccato in `useDividendStats`, una query senza date, più `DividendiDettaglio`) e la route `/api/dividends/stats` ha guadagnato i rendimenti netti che il motore già calcolava; la tessera «Rendimento» non segue l'asse del periodo e lo dichiara; il cross-filtro `focusedDate` del calendario è stato ritirato. Il prompt resta come riferimento di metodo.

**Superfici**: `components/dividends/*`, tab Dividendi.

**Modello/effort**: Fable 5 · xhigh — il coupon cron è intoccato; il lavoro è di lettura e cadenza (DividendStats, invece, è stato ristrutturato).

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Cashflow · Dividendi» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Quanto rendono i miei flussi?»

Verdetto (dividendiNarrative.ts): «Nel 2026 hai incassato X € netti (+y% sul 2025) da N
strumenti; il prossimo stacco è {strumento} il {data}.» Se DividendStats non è calcolabile,
la clausola YOC sparisce, non stampa N/D.

Tessere:
- Incasso netto del periodo (5, 2 righe): hero, chip vs periodo precedente, grafico mensile
  incassi che riempie l'altezza; footer «Prossimi 3 pagamenti».
- Affidabilità (3): il blocco reliability esistente come lettura + righe.
- Rendimento (4): YOC lordo/netto, Current Yield, DPS growth — da DividendStats (server), con la
  lettura che dice la base (holdingStartDate).
- Chi paga di più (4): leaderboard payer (RankedRows).
- Calendario / Tabella (12, riga 3): SegmentedPill Tabella|Calendario invariato; calendario con
  gli ARIA rows; BTP Italia provvisori col banner.

Vincoli: received = paymentDate; tasse = taxRate dell'asset; il coupon cron è l'unica fonte
delle spese cedola; DividendDialog/DividendDetailsDialog restyle a ramp, logica invariata.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: docs/screenshots/dividend-calendar.png.
```

## 04 · Cashflow · Budget

**Stato**: ✅ fatto il 2026-08-23 (`feature/cashflow-budget-redesign`) — riga 2 = «Budget annuali» (7); impostazioni sotto la piega in una disclosure; la proiezione è stata allineata a quella di Tracciamento (decisione in sessione) e una categoria fissa non segue il ritmo; rischio (proiezione) e fatto (soglia superata) in due tessere distinte. La matita → dialog è rimasta (niente editing inline dell'importo, deciso in sessione).

**Superfici**: `components/cashflow/BudgetTab.tsx`, `components/cashflow/budget/*`, `lib/utils/budgetUtils.ts`.

**Modello/effort**: Fable 5 · xhigh — budgetUtils ha regole precise ma contenute; niente cache.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Cashflow · Budget» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Sto rispettando il budget?»

Verdetto (budgetNarrative.ts): «A 9 giorni dalla fine del mese hai usato il 71% del tetto
(2.910 € su 4.100 €): al ritmo attuale chiudi a 4.120 €, 20 € oltre.» Toni: sotto/oltre
proiezione. Orizzonte SEMPRE nominato (mensile vs annuale = YTD, AGENTS → Budget).

Tessere:
- Tetto del mese (5, 2 righe): speso/tetto, barra 3px, proiezione a fine mese, giorni
  rimanenti; footer «Entrate previste vs registrate».
- Categorie a rischio (4): le categorie con proiezione > budget (Insights), lettura «3 su 12 a
  rischio».
- Alert (3): gli alert attivi come righe, con soglia; se disattivati, la tessera dice perché.
- Per categoria (12, riga 3): la lista budget/speso/proiezione per categoria, editabile inline
  come oggi; l'auto-save resta in pausa quando l'allocazione non torna.

Vincoli: opt-in; mai riconciliare con categories vuote; l'overall è un tetto su TUTTE le spese,
il validatore somma solo le categorie mensili; copy con orizzonte e scope.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 05 · Cashflow · Centri di Costo

**Stato**: ✅ fatto il 2026-08-23 (`feature/cashflow-centri-di-costo-redesign`) — l'asse del periodo è stato TOLTO su richiesta (ogni cifra «in totale», le finestre diverse si nominano: «Whole-Cost Corollary» in DESIGN.md); riga 2 della lista = «Dormienti» (7), gli archiviati in una disclosure sotto la griglia; nel dettaglio «Per categoria» (4) accanto a «Ciclo di vita» (3) e «Per sottocategoria» a 7; la proiezione annua è passata alla regola unica dell'app (`projectWindowEndWithScheduled`, ritirato il modello misto); il grafico a linee Recharts è diventato barre impilate per centro nella tessera Totale; le azioni del dettaglio stanno accanto al verdetto. Il prompt resta come riferimento di metodo.

**Superfici**: `components/cashflow/{CostCentersTab,CostCenterDetail,CostCenterDialog,CostCenterErrorNotice}.tsx`, `costCenterStyles.ts`.

**Modello/effort**: Fable 5 · xhigh — nessun test sui componenti: l'effort va nell'estrarre e testare il layer puro.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Cashflow · Centri di Costo» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Quanto sta costando il progetto?»

Verdetto per la lista: «4 centri attivi, 12.400 € nel periodo; {centro} è il più caro (5.200 €)
e {centro} è fermo da 120 giorni.» Verdetto per il dettaglio: «{Centro}: 5.200 € su 8.000 €
di budget, al ritmo attuale lo chiudi a {data/importo}.»

Tessere lista: Totale del periodo (5), Centri (lista ordinata con budget/proiezione/lifecycle,
7), Dormienti (righe con ultima attività UNSCOPED, AGENTS).
Tessere dettaglio: Speso vs budget (5, 2 righe, grafico che riempie), Per sottocategoria (4,
con esclusioni di sessione), Ciclo di vita (3: creato, ultima attività, stato), Movimenti
collegati (12).

Vincoli: un asse periodo posseduto dalla lista e reso in ENTRAMBE le viste (layoutId distinti);
budget/proiezione/grafico nominano la propria finestra; delete = unlink con conteggio dalla
stessa query; colori = slot chart-1..8 via resolveCostCenterColor. Questi tre componenti non
hanno test: scrivi almeno i test del layer puro che estrai.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 06 · Analisi

**Stato**: ✅ fatto il 2026-08-25 (`feature/cashflow-analisi-redesign`) — l'asse a tre modi è rimasto (Anno corrente | Anno | Storico + mese) accanto al verdetto, «Vai a categoria…» nelle azioni dell'header compatto; riga 2 = «Spese per categoria» (4) + «Entrate per categoria» (3), liste complete cliccabili; «Fuori scala» (3) esiste solo su un mese e lo nomina (in Storico e in un anno passato senza mese «Spese maggiori» prende 7); la scheda dell'entità è una tessera a 12 colonne sotto le liste (proposta A del canvas, scelta in sessione), non più in-card; «Confronto annuale» e «Dettaglio» sono disclosure sotto la griglia; la card «Spese per tipo» è stata ritirata (il Sankey e la lettura di Flusso dicono già fisse/variabili/debiti); `AnomalieBlock` eliminato. Il prompt resta come riferimento di metodo.

**Superfici**: `app/dashboard/analisi/page.tsx`, `components/cashflow/{AnalisiTab,EntityDossier,EntitySearch,ConfrontoAnnualeSection,CashflowSankeyChart,AnomalieBlock,SavingsRateTrendSection,AndamentoStoricoSection}.tsx`.

**Modello/effort**: Fable 5 · ultracode — Sankey con identità per id, drill-down a un solo landing path, pacing YoY con null onesti.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Analisi» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Dove vanno i soldi, e cosa è cambiato?»

Verdetto (analisiNarrative.ts): «Nel 2026 (8 mesi) hai speso 31.200 €, +4,2% sullo stesso
periodo 2025; Casa pesa un terzo e Vacanze è la categoria cresciuta di più (+1.100 €).» Le
anomalie entrano nella frase solo se esistono («2 spese fuori scala questo mese»).

Tessere:
- Periodo (5, 2 righe): KPI trio con pacing YoY (comparisonDeltas, prevYearValue null =
  buco, mai zero), lettura, grafico trend che riempie.
- Anomalie (3): i chip anomalia come righe.
- Spese maggiori (4): RankedRows top 5.
- Flusso (12, riga 3): il Sankey resta (è l'unico Sankey dell'app) dentro una tessera larga,
  colori hex intoccati (react-spring); i drill-down ai livelli 2/3 aprono l'EntityDossier
  come oggi, con focus in URL.
- Confronto annuale e Dettaglio: collassabili sotto, cadenza tessera.

Vincoli: un solo landing path (handleEntitySelect); chiavi per id mai per nome; focus
sopravvive al cambio periodo; cashflowHistoryStartYear condiviso.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: docs/screenshots/cashflow-sankey.png, docs/screenshots/cashflow-drilldown.png.
```

## 07 · Rendimenti

**Stato**: ✅ fatto il 2026-08-25 (`feature/rendimenti-redesign`) — proposta A del canvas: riga 3 = «Plusvalenze realizzate» (5) + «Capitale e mercato» (7, l'Evoluzione di prima in una tessera; 12 senza vendite); benchmark sempre in EUR (lo switch USD è ritirato, il 60/40 resta il riferimento fisso del verdetto); il gap vs benchmark è sulla stessa base del numero (de-annualizzato sotto i 6 mesi); il drawdown del verdetto viene da un helper puro su `findMaxDrawdown` (mesi di calendario), non dalle stringhe del payload; Sortino e growth-of-100 sono usciti da `BenchmarkComparisonChart` in util puri; la heatmap usa i token di segno. Scoperto e corretto un bug di `patrimonioNarrative`: «diciotto» non è vocalico («l'18%»). Il prompt resta come riferimento di metodo.

**Superfici**: `app/dashboard/performance/page.tsx`, `components/performance/*`.

**Modello/effort**: Fable 5 · ultracode — finestra di misura, base configurabile, cache con CACHE_MATH_VERSION: la pagina più facile da rompere in silenzio.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Rendimenti» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Quanto rende il portafoglio, e rispetto a cosa?»

Verdetto: PerformanceHero ha già verdetto + toni (TONE_TEXT): portalo nella forma Page Verdict
(punto colorato, frase con cifre mono) e in un util puro performanceNarrative.ts con test.
«Nell'anno il portafoglio rende +6,4% (TWR), 1,2 punti sopra il 60/40; max drawdown −4,1% a
marzo, recuperato.» Sotto 6 mesi: rendimento di periodo, non annualizzato (resolveHeroReturn).
La base di misura (fondi/esclusi) resta nominata sotto il verdetto.

Tessere:
- Rendimento (5, 2 righe): TWR, chip periodo/benchmark, grafico growth-of-100 che riempie.
- Rischio (3): volatilità, Sharpe, Sortino, max DD — righe; lettura con il floor dei 3 mesi.
- Consistenza (4): la strip mesi positivi/negativi + heatmap compatta (MonthlyReturnsHeatmap:
  sostituisci i bg-red/green raw con i token di segno — è nei Known Issues).
- Contributi (3): Capitale investito vs Contributi netti, due numeri diversi di proposito, con
  i due popover.
- Benchmark (4): tabella 6 portafogli modello, ultimo mese proprio per ciascuno.
- Plusvalenze realizzate (5): per anno fiscale, NON scoped al periodo.
- Dettaglio: le MetricSection collassabili sotto, a cadenza tessera.

Vincoli: il periodo non si ri-deriva mai da new Date() (metrics.nominalPeriodStart); cache
performance-cache + CACHE_MATH_VERSION se cambi un calcolo; selettore periodo con Custom come
chip, non slot; Rendimenti ha la «base configurabile» in Impostazioni → nominala.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: docs/screenshots/performance-metrics.png, docs/screenshots/monthly-heatmap.png.
```

## 08 · Storico

**Stato**: ✅ fatto il 2026-08-25 (`feature/storico-redesign`) — griglia Evoluzione 8×2 · Raddoppi 4×2 (su due righe per chiudere la riga, non una) / Composizione 8 · Driver 4 / Valore per strumento 12; il «ritmo attuale» è l'aumento medio mensile in € degli ultimi 12 mesi, UNA base per la headline («accelera/rallenta») e per il prossimo raddoppio, lineare; Driver parte da `cashflowHistoryStartYear`; l'attribuzione prezzo/quantità è per strumento (`buildMonthAssetBreakdown`); Note, YoY, mensile e «Lavoro e investimenti» sono la disclosure «Dettaglio»; `HeroMetricBlock`/`MetricCard` eliminati, `AsideToggle` promosso a `components/ui`. Il prompt resta come riferimento di metodo.

**Superfici**: `app/dashboard/history/page.tsx`, `components/history/*`, `lib/utils/historyComposition.ts`.

**Modello/effort**: Fable 5 · ultracode — composizione 100% con residuo, pensionSource, attribuzione prezzo/quantità: matematica da non toccare e da non far regredire.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Storico» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Come sono arrivato qui?»

Verdetto (storicoNarrative.ts): «Dal primo snapshot ({mese anno}) il patrimonio è cresciuto
di X € (+y%, z%/anno); il mese migliore è stato {mese} (+€), l'ultimo raddoppio {data}.»
CAGR di Storico = crescita della ricchezza, NON il CAGR di Rendimenti: la frase non li confonde.

Tessere:
- Evoluzione (8, 2 righe): il grafico principale che riempie, con tooltip; lettura.
- Raddoppi (4): timeline dei raddoppi + «prossimo raddoppio al ritmo attuale».
- Composizione (8): la card 100%-stacked esistente (pill Asset class|Liquidità, banda
  Previdenza con pensionSource) riportata a cadenza tessera — NON cambiare la matematica.
- Driver (4): i driver del mese/anno come RankedRows.
- Valore per strumento (12): la lettura per mese da byAsset con attribuzione prezzo/quantità,
  picker mese sui soli mesi con byAsset.

Vincoli: snapshot = fotografia congelata; byAsset.totalValue mai ricalcolato; stack 100%
pre-normalizzato senza stackOffset; slot 5-9 non theme-aware (Known Issues — non peggiorare);
Recharts: tick CHART_TICK_STYLE, tre stili tooltip, role="img" sul chart.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: docs/screenshots/history-networth.png.
```

## 09 · Hall of Fame

**Stato**: ✅ fatto il 2026-08-25 (`feature/hall-of-fame-redesign`) — griglia Record del patrimonio 5×2 · Entrate 3 · Risparmio record 4 / Anni 7 / Note 12: Anni e Note hanno preso tutta la larghezza su richiesta, e così si è chiuso un buco di 3 colonne che il prompt non poteva vedere (il Record spanna due righe, quindi nella seconda ne restano 7, non 12). Tre scostamenti dal prompt, tutti decisi in sessione. **Lo switcher periodo+categoria NON è rimasto sopra la griglia**: le tessere SONO già le categorie, quindi un controllo sopra di loro risponde due volte alla stessa domanda — è sceso nella disclosure «Dettaglio», come aside della tessera con la classifica completa (20 mesi / 10 anni, colonna Nota), dove governa una cosa sola e non perde nessuna classifica («The Ranking-Is-Not-An-Axis Rule» in DESIGN.md). **«Spese minori» è diventata «Risparmio record»** (entrate − spese): la classifica per spesa più bassa premia sistematicamente il mese con meno *dati*, non il più parsimonioso — serviva un ranking nuovo nel documento (`bestMonthsBySavings`/`bestYearsBySavings` + un blocco `stats`, tutti opzionali, perché i documenti vecchi non li hanno e la tessera lo dichiara invece di stampare uno zero). **La «sparkline dei top 12» è diventata un grafico CRONOLOGICO** e il podio mostra cinque posizioni: il podio classifica, il grafico data — un grafico che ridisegna il podio sarebbe la One-Tile-One-Question rotta dentro una tessera sola. In più: il mese peggiore vive nel footer della tessera Patrimonio e mai nel verdetto, e `hallOfFameRecords.ts` ha assorbito la costruzione dei ranking (`buildHallOfFameRankings`) perché il writer client ne aveva una copia. Il prompt resta come riferimento di metodo.

**Superfici**: `app/dashboard/hall-of-fame/page.tsx`, `components/hall-of-fame/*`, `lib/utils/hallOfFameRecords.ts`.

**Modello/effort**: Opus 5 · high — record già definiti in un util condiviso; è quasi solo cadenza e lettura.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Hall of Fame» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Quali sono stati i mesi e gli anni migliori?»

Verdetto: «Il tuo mese migliore è {mese anno} (+X € di patrimonio); il 2026 è finora il
secondo anno migliore.» Se il mese corrente è in classifica, la frase lo dice («agosto è oggi
al 3° posto»).

Tessere: Record del patrimonio (5, 2 righe: podio mesi + sparkline dei top 12), Entrate
(3), Spese minori (4), Anni (4), Note (8: le note sui record con i dialog esistenti).
Lo switcher periodo+categoria resta, come SegmentedPill sopra la griglia.
Stessa definizione di record dell'email (hallOfFameRecords.ts): non reimplementare.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: docs/screenshots/hall-of-fame.png.
```

## 10 · Allocazione

**Stato**: ✅ fatto il 2026-08-25 (`feature/allocazione-redesign`) — proposta del canvas con l'**alternativa A** scelta in sessione: la soglia NON sta accanto al verdetto ma nell'aside di Bilanciamento, perché riclassifica le chip senza spostare lo score (uno scopo, non un asse — «The Scope-Is-Not-An-Axis Rule» in DESIGN.md); il verdetto legge sempre la risposta Versa all'importo del Piano (1000 € di default, stato della pagina), la tessera legge la modalità scelta. Griglia Bilanciamento 5 · Piano 7 / Per classe 6 · Esposizione 6 / Previdenza 12 (nessuna tessera a due righe: 5+7 chiudono la riga) e «Dettaglio» con Non negoziabili 7 · Esclusi 5; il pill del Piano è un `AsideToggle`, non un `SegmentedPill`. Scoperti e corretti in sessione: un Σdrift negativo senza leva veniva letto come «sotto il target di leva» (ora «in classi senza target»), una gamba di un fondo composito contava come un asset a sé, `CompositionList` stampava `42.4%`, e il target cash «fisso €» (segnalato da Giuseppe al collaudo) entrava nel target di leva e lasciava gli altri target sulla base ridotta. Undici componenti legacy eliminati. Il prompt resta come riferimento di metodo.

**Superfici**: `app/dashboard/allocation/page.tsx`, `components/allocation/*`.

**Modello/effort**: Fable 5 · ultracode — allocationRole, leva, QP per strumento, target orfani: la sezione con più invarianti.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Allocazione» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Sono allineato al piano, e cosa faccio con i prossimi soldi?»

Verdetto (allocazioneNarrative.ts): «Allineato al {score}%: le azioni sono 3 punti sopra
target, le obbligazioni 2 sotto; con 1.000 € in più compreresti obbligazioni.» Se c'è leva:
«leva 1,3× contro target 1,5×». Se c'è un target orfano, la frase lo dichiara.

Tessere:
- Bilanciamento (5, 2 righe): score gauge + verdetto + CompositionBar corrente vs target.
- Piano (7): Ribilancia|Versa|Preleva (SegmentedPill) + importo + le righe del piano — è la
  zona decisione, resta sopra la piega.
- Per classe (6): AllocationBreakdown come righe con TargetTick.
- Esposizione (6): look-through geografico/settoriale (exposure-cache).
- Previdenza (12, condizionale): le due card look-through dei fondi.

Vincoli (AGENTS): allocationRole partizionato PRIMA di compareAllocations; il totale è più
piccolo del patrimonio e la lettura lo dice; i piani non nominano mai un frozen; score
band-independent; ActionChip via useActionColors, mai token di segno.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: docs/screenshots/asset-allocation.png.
```

## 11 · FIRE · Calcolatore

**Stato**: ✅ fatto il 2026-08-25 (`feature/fire-redesign`) — proposta del canvas scelta su tutte e tre le alternative: numero FIRE come hero del Traguardo (non l'anello), switch «Fondo pensione bloccato» DENTRO Base di calcolo e salvato al tap (non in Parametri con Salva), clausola del reddito passivo mantenuta ma resa inequivocabile — «da allora il 4% del patrimonio copre le tue spese: 2300 € al mese di oggi, 2667 € del 2032 con l'inflazione al 2,5%» — perché il revisore del canvas aveva letto il nominale come «più delle mie spese». Griglia Traguardo 5×2 · Base di calcolo 3×2 · Reddito passivo 4 / Scenari 4; «Parametri» (Impostazioni 6 · Scenari 6, parametri come Muted Sub-tile Variant B) e «Dettaglio» (Runway 6 · Cashflow 6 / Come funziona 12; la tabella anno per anno è stata tolta su richiesta, la ridondavano il grafico e la tessera Scenari). Scoperto e corretto al collaudo Playwright: il numero FIRE leggeva le spese dell'ANNO PIENO (`getFIREData`) mentre la proiezione quelle annualizzate (`getAnnualCashflowData`) — su un account senza anno pieno il numero era «non calcolabile» accanto a una proiezione disegnata; ora una sola base, dichiarata nell'aside (Same-Basis). `FIREProjectionSection` eliminato; `FireCalculatorSkeleton` resta per Coast. Il prompt resta come riferimento di metodo.

**Superfici**: `components/fire-simulations/{FireCalculatorTab,FireParametri,FireDettaglio,FIREProjectionChart,FireFanChart}.tsx` + `tiles/*`.

**Modello/effort**: Fable 5 · ultracode — bridge pensione, Ventaglio coerente con la camminata deterministica, memoizzazione del fan.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «FIRE · Calcolatore» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Quando?»

Verdetto: l'hero dice già «FIRE proiettato nel {anno}, a {età}»: portalo a Page Verdict con
frase «Ti mancano X € al numero FIRE (Y €); al ritmo di Z €/mese ci arrivi nel {anno}, a {età},
con {reddito passivo}/mese.» Se respectPensionLockInFire è attivo, la frase nomina il capitale
bloccato e l'anno di sblocco (pensionUnlock è l'unica fonte).

Tessere: Traguardo (5, 2 righe: numero FIRE, progresso, Proiezione Scenari|Ventaglio che
riempie), Base di calcolo (3: patrimonio usato, spese, SWR — con il toggle sul capitale
bloccato), Reddito passivo (4), Scenari (4: i tre scenari come righe), Parametri (collassabile,
tile Variant B), Dettaglio storico (collassabile).

Vincoli: What If = perturbazione, niente eventi a metà proiezione; il Ventaglio mirrora la
camminata deterministica (test di coerenza); memoizza ogni input del fan; config-first
collapse con useRef seeded.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: docs/screenshots/fire-calculator.png.
```

## 12 · FIRE · Coast FIRE

**Stato**: ✅ fatto il 2026-08-25 (`feature/coast-fire-redesign`) — proposta del canvas scelta: Traguardo 5×2 (gap come hero, chip «% del numero Coast» + traccia, proiezione che riempie) · Afflussi 7 · Scenari 7 (righe, non card); wording «numero Coast FIRE di oggi» in parallelo a «numero FIRE»; «Ipotesi» come quattro tessere (Profilo 5 · Pensioni statali 7 / Scaglioni IRPEF 5 · Modello 7) con UN solo «Salva ipotesi»; «Dettaglio» (Fasi 6 · Al target e a regime 6 / Impatto 12 / Come leggere 12). Il verdetto e le letture vivono in `coastFireView.ts` (numeri E parole, nessun modulo nuovo). Scoperto preparando i numeri del canvas e corretto in `fireService`: la linea tratteggiata del grafico era al NETTO del fondo che rientra mentre le serie lo aggiungevano allo sblocco — ora `fireNumberTarget` fa lo stesso gradino (The Stepped-Line Rule). Scoperto al collaudo 390: la tabella «Impatto delle pensioni» sforava, sotto `desktop:` è una lista piatta. `FireCalculatorSkeleton` e i cinque componenti `coast/*` precedenti eliminati. Il prompt resta come riferimento di metodo.

**Superfici**: `components/fire-simulations/CoastFireTab.tsx`, `coast/*`, `CoastFireProjectionChart.tsx`, `lib/utils/coastFireView.ts`.

**Modello/effort**: Fable 5 · xhigh — il tab non calcola: il rischio è far calcolare qualcosa alla UI.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «FIRE · Coast FIRE» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Posso smettere di versare?»

Verdetto: «Ti mancano X € al Coast number di oggi (Y €): smettendo di versare a {età}
arriveresti a {capitale} a {età pensione}, con {pensioni} a coprire Z €/mese.» Il tab NON
calcola nulla (coastFireView.ts sceglie cosa mostrare di fireService): il verdetto nasce in
coastFireView, non in un nuovo modulo.

Tessere: Shortfall (5, 2 righe: numero + proiezione che riempie), Timeline degli afflussi (7:
sblocco fondo + pensioni statali, A VALORE DI OGGI), Ipotesi (collassabile, il form draft).

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 13 · FIRE · What If

**Stato**: ✅ fatto il 2026-08-25 (`feature/what-if-redesign`) — proposta del canvas scelta sulle due alternative (niente hero nella tessera Prima e dopo: l'anno sta nel Delta; Prima e dopo a sinistra, non l'Evento). Griglia Prima e dopo 5 · Delta 3 · Evento 4 / Sensibilità 12 (una riga sola, nessuna tessera a due righe), nessuna disclosure: il form dell'evento È una tessera e sul telefono viene per primo («The Input Tile Rule» in DESIGN.md). Il layer puro è sdoppiato come altrove (`whatIfSummary.ts` numeri · `whatIfNarrative.ts` parole) e resta category-agnostic: la frase dice «31.800 € l'anno di entrate (il 64% del reddito)», mai la categoria; la scomposizione del colpo (mancati risparmi / spese dal portafoglio) è uscita dal componente. Uno scostamento deciso in sessione: **il ponte pensionistico passa anche nel What If** (`WhatIfBaseline.pensionBridge`, stesso `calculateFireBridgeNumber` e stesso gradino del Calcolatore), così l'anno «prima» coincide con quello del Calcolatore. La Sensibilità gira sul piano di oggi e lo dichiara nell'aside; le tinte sono i token di segno al 15% invece degli slot chart. `WhatIfAnalysisSkeleton` e `WhatIfSensitivitySection` eliminati. Il prompt resta come riferimento di metodo.

**Superfici**: `components/fire-simulations/WhatIfAnalysisTab.tsx`, `components/fire-simulations/whatif/*`, `lib/utils/{whatIfSummary,whatIfNarrative}.ts`, `lib/services/whatIfService.ts`.

**Modello/effort**: Fable 5 · xhigh — perturbazione + diff, layer puro category-agnostic.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «FIRE · What If» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Cosa cambia se…?»

Verdetto: «Con {evento} il FIRE slitta di {n} anni (dal {a} al {b}) e il reddito passivo scende
di X €/mese.» Segno e tono dal delta.

Tessere: Prima/Dopo (5, 2 righe: due proiezioni sovrapposte), Delta (3: anno, capitale,
reddito come righe con segno), Evento (4: il form dell'evento, perturbazione anno 0),
Sensibilità (12: la sezione esistente a cadenza tessera).
Vincolo: la selezione delle fonti di reddito perse vive nella UI, il layer puro resta
category-agnostic.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 14 · FIRE · Monte Carlo

**Stato**: ✅ fatto il 2026-08-26 (`feature/monte-carlo-redesign`) — proposta del canvas scelta: Probabilità 5 · Distribuzione 4 · Scenari a confronto 3 in UNA riga e Parametri a 12 sotto (l'alternativa con la Probabilità a due righe e Parametri a 7 accanto allungava il ventaglio a ~1000 px). Tre decisioni prese prima del canvas: il toggle «Simulazione singola | Confronto scenari» è sparito (una esecuzione = tre scenari, il Base è il riferimento, i «parametri di mercato avanzati» del form SONO lo scenario Base); auto-run all'apertura e poi «Esegui», con il footer di Parametri che dichiara i risultati «dell'ultima esecuzione» finché non si ricalcola («The Stale-Run Rule» in DESIGN.md); «Dettaglio» sotto la griglia (Traiettorie a confronto 6 · Percentili 6 / Come funziona 12). Il layer puro è sdoppiato (`monteCarloSummary.ts` numeri · `monteCarloNarrative.ts` parole); la mediana letta è quella di TUTTE le simulazioni (l'ultima riga dei percentili), non delle sole riuscite; `createDistribution` chiude le classi al 95° percentile con l'ultima che raccoglie la coda (scoperto dallo screenshot: nove classi vuote sotto un outlier) e porta `from`/`to`; scoperta e corretta l'elisione «nell'10,6%» (`startsWithVowel`). Sei componenti eliminati (`MonteCarloSkeleton`, `SimulationChart`, `DistributionChart`, `ParametersForm`, `ScenarioParameterCards`, `ScenarioComparisonResults`). Il prompt resta come riferimento di metodo.

**Superfici**: `components/fire-simulations/MonteCarloTab.tsx`, `components/monte-carlo/*`.

**Modello/effort**: Fable 5 · xhigh — un solo normalizzatore, ordine dei passi, parametri in tile.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «FIRE · Monte Carlo» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Quanto è probabile?»

Verdetto: «Nel {p}% delle simulazioni il capitale regge fino a {età}; nel caso mediano chiudi
con X €, nel peggiore 10% finisci i soldi a {età}.» L'hero probabilità esistente diventa la
tessera dominante.

Tessere: Probabilità (5, 2 righe: numero + SimulationChart che riempie), Distribuzione (4),
Scenari a confronto (3), Parametri (12: ParametersForm / ScenarioParameterCards a tile
Variant B, con la riga read-only degli afflussi pensione a valore di oggi).
Vincolo: deriveMonteCarloAllocation è l'unico normalizzatore; ordine inflow → return →
withdrawal.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: docs/screenshots/monte-carlo.png.
```

## 15 · FIRE · Obiettivi (Goal-Based Investing)

**Stato**: ✅ fatto il 2026-08-26 (`feature/goals-redesign`) — griglia Obiettivi 5×2 · Traiettoria 7 / Milestone 4 · Allocazione derivata 3 / Assegnazioni 12 (Milestone prende 7 senza allocazione goal-driven) e «Dettaglio» con Prossimo versamento 12 · Come funziona 12. Il verdetto giudica i soli obiettivi datati e dà a ogni obiettivo la sua clausola (i ritardatari con il ritmo IN PIÙ che la scadenza chiede). Tre decisioni prese in sessione: **la riga dell'obiettivo seleziona la Traiettoria** («The Selected-Row Rule» in DESIGN.md — nessun controllo sopra la griglia, le azioni Modifica/Elimina nell'aside della tessera sorella), **la Milestone non mostra mai una scadenza come arrivo** («15 mesi dopo la scadenza», «mai, al ritmo attuale»), **la quota libera chiude Assegnazioni** («Non assegnato» come residuo). Il colore dell'obiettivo è identità (stesso hex in ogni tessera e in Panoramica), le classi prendono lo slot dell'app; `AllocationComparisonBar` eliminato. Numeri in `goalsSummary.ts`, parole in `goalsNarrative.ts`; le date sono `{ year, month }` letti dalla stringa ISO. Il prompt resta come riferimento di metodo.

**Superfici**: `components/fire-simulations/GoalBasedInvestingTab.tsx`, `components/goals/*`, `lib/utils/{goalTrajectory,goalMath}.ts`.

**Modello/effort**: Fable 5 · xhigh — goalMath SDK-free e allowlist di persistenza; il doc goal si riscrive intero.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «FIRE · Obiettivi» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Sono in rotta?»

Verdetto: «{n} obiettivi in corso: {obiettivo} è in rotta per {data}; {obiettivo} richiede
X €/mese in più per arrivare a {data}.» Verdetto per obiettivo = confronto del valore proiettato
alla scadenza con il target (tolleranza 1%), mai contributo ≥ requiredMonthly.

Tessere: la tessera Obiettivi della Panoramica diventa la lista dominante (5, 2 righe: tutti
gli obiettivi, il primo grande), Traiettoria (7: GoalProjectionChart dell'obiettivo selezionato
che riempie), Milestone (4), Allocazione derivata (4: AllocationComparisonBar quando
goalDrivenAllocationEnabled), Assegnazioni (12: asset per obiettivo con AssetAssignmentDialog).
Vincoli: goalMath SDK-free; serializeGoalForFirestore è l'allowlist; il doc goal si riscrive
intero in transazione.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 16 · Previdenza

**Stato**: ✅ fatto il 2026-08-26 (`feature/previdenza-redesign`) — proposta del canvas scelta su entrambe le alternative: l'anno fiscale è l'ASSE della pagina, accanto al verdetto (non uno scopo nell'aside di Anno fiscale), e governa le due clausole annuali del verdetto («nel 2026 il datore ha aggiunto 134 € e il fisco restituisce circa 275 €»), Anno fiscale, Versato e Versamenti; «Il fondo oggi» e «Rendimento» sono fuori asse e nominano la propria finestra. Griglia Il fondo oggi 5×2 · Rendimento 3 · Anno fiscale 4 / **Versato nel {anno} 7** / Versamenti 12 — le quattro tessere del prompt lasciavano sette colonne vuote in riga 2 (la trappola di Hall of Fame), la quinta le chiude — e «Dettaglio» con Da dove viene la crescita 6 · Come aggiornare il valore 6 (12 senza una misura). Tre scostamenti dal prompt, decisi in sessione: **il rendimento è calcolato PER CONTRIBUENTE** (stesse funzioni pure, fondi e versamenti del membro) così verdetto e tessera stampano lo stesso TWR; **«il fisco restituisce» senza «ti»** (un household può tracciare il fondo del coniuge); **«Registra versamento» resta nell'header compatto** (precedente «Crea snapshot»). Il layer puro è sdoppiato (`pensionSummary.ts` numeri · `pensionNarrative.ts` parole) con `calculateAssetValue` e l'IRPEF iniettati; l'eliminazione a due click ha perso il timer da 3 s (`useArmedDelete`); un fetch fallito degrada per tessera e il verdetto dice cosa non si è caricato; `PageHeader` ha perso la variante `legacy` (era l'ultima pagina a usarla). Le tre spec Playwright sono state riscritte sul nuovo DOM. Il prompt resta come riferimento di metodo.

**Superfici**: `app/dashboard/pension/page.tsx`, `components/pension/*`, `lib/utils/pension*.ts`.

**Modello/effort**: Fable 5 · ultracode — tre cause di crescita, plafond per contribuente, valore a prezzo 1, misurabilità: la pagina più delicata sul piano fiscale.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Previdenza» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Domanda: «Il fondo sta lavorando?»

Verdetto (pensionNarrative.ts, per membro): «Il fondo di Giuseppe vale X €: nell'ultimo anno il
mercato ha reso +y% (TWR), il datore ha aggiunto Z €, il fisco ti restituisce W €.» Tre cause,
tre numeri, mai una percentuale unica. Se isPensionReturnMeasurable è falso la frase lo dice
al posto del numero («il rendimento non è misurabile: mancano versamenti»).

Tessere (asse anno solo sui capitoli 2-3): Il fondo oggi (5, 2 righe: valore, serie LIVE
overlay, lettura), Rendimento (3: TWR / ritorno personale / datoriale), Anno fiscale {Y} (4:
plafond, deducibile, risparmio IRPEF per membro), Storico {Y} (12: versamenti per natura come
righe, con PensionContributionDialog). Chip riga Previdenza coerente con il digest Panoramica.

Vincoli: valore in quantity a prezzo 1 (assertFundValueLivesInQuantity); contribuzione
attribuita al mese del createdAt; ceiling per contribuente non per conto; ogni capitolo
degrada a PensionErrorNotice, mai a zeri.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 17 · Assistente AI

**Stato**: ✅ fatto il 2026-08-27 (`feature/assistant-redesign`) — il verdetto è il contesto (bundle → `assistantNarrative.ts` con i tempi del periodo; «Libera» senza contesto → `buildOverviewVerdict` tale e quale); scostamenti dal prompt: nessuna tessera Allocazione nel companion (le variazioni di classe sono acquisti + prezzo, non un rendimento), la guida è una disclosure «Come funziona» sotto la griglia, i pallini-conteggio sulle icone dell'header restano (la descrizione li ripete in parole); i follow-up sono righe come le domande iniziali. Il prompt resta come riferimento di metodo.

**Superfici**: `app/dashboard/assistant/page.tsx`, `components/assistant/*`.

**Modello/effort**: Fable 5 · xhigh — streaming, memoria, Popover vs Dropdown; riuso del verdetto della Panoramica, non duplicazione.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Assistente AI» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Qui il verdetto è il contesto: la companion card «Patrimonio oggi» e la context card
diventano tessere a cadenza Panoramica (eyebrow, lettura generata dalle stesse regole di
overviewNarrative — riusa buildOverviewVerdict, non duplicarlo), in colonna sticky accanto alla
conversazione (self-start!). L'hero [2fr_1fr] conversazione|companion è l'unico layout
asimmetrico che resta legittimo qui: la conversazione È il contenuto.

Da fare: AssistantHeader compatto; AssistantEmptyState con i prompt chip come righe flat;
GoalProposalCard e SuggestionsBanner a ramp; MemoryPanel con le tessere Obiettivi (stato,
ultima verifica, «Ignora» durevole) e fatti; thread sheet mobile invariata.
Vincoli: MARKDOWN_COMPONENTS module-level; Popover non DropdownMenu per pannelli con
Select/Switch; aria-live sul flusso; bloccato in demo.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 18 · Impostazioni

**Superfici**: `app/dashboard/settings/page.tsx` (tab Preferenze, Spese, Allocazione, Dividendi, Condivisione, Aspetto), `components/settings/*`, `components/expenses/CategoryManagementDialog.tsx`, `components/layout/ThemePicker.tsx`.

**Modello/effort**: Fable 5 · xhigh — le cinque (sei) sedi per setting sono la trappola; il restyle in sé è semplice.

**Stato**: ✅ fatto il 2026-08-29 (`feature/settings-redesign`) — **la pagina NON ha un verdetto**, ed è l'unica propagazione così: un form non misura niente, quindi non c'è una domanda che i numeri pongano e inventarne una sarebbe decorazione. Resta tutta la cadenza (header compatto + `PageTabBar`, ogni gruppo una tessera con eyebrow, UNA riga di lettura e i controlli sotto), e `settingsNarrative.ts` esporta 22 `describe*` senza `build*Verdict` — «The Declaration-Tile Rule» in DESIGN.md. Griglie: Preferenze 4·4·4 / 4·4·4 / 5·7 / 12; Allocazione 5·7 / 12 + disclosure Note; Spese 5·7 / 12; Dividendi 7·5; Condivisione 7·5; Aspetto 4·8. Scostamenti dal prompt, tutti decisi in sessione. **Le tessere FIRE e Assistente sono di SOLA LETTURA** (il prompt le voleva editabili): dichiarano lo stato e linkano la sede di modifica, perché un campo con due posti che lo salvano è una seconda via di scrittura — e per l'Assistente è strutturale, il mirror nel settings doc perde in lettura contro il documento memoria, quindi una modifica fatta da qui sarebbe stata sovrascritta in silenzio. **Il Salva del tab Dividendi è stato eliminato** (`handleSave` già persisteva quei campi). **Età e risk-free sono passati da Allocazione a Preferenze → Profilo** (con la loro chiave dirty da `allocationSnapshotKey` a `generalSnapshotKey`) e i conti di default a Spese; **Aspetto ha guadagnato Chiaro/Scuro/Sistema**, che prima esisteva solo nel menu account. `ExpenseImportSection` e `AccountSharingSection` rendono la propria `Tile`. **In coda, su domanda del proprietario, un collaudo col hard refresh ha scoperto e corretto un bug PRE-ESISTENTE**: svuotare un campo non si salvava — `userAge`, `riskFreeRate` e le due categorie dividendi non avevano la clear-guard `'x' in settings`, quindi il ramo `setDoc` li riportava indietro da `...existingData`; corretto in entrambe le catene di scrittura, con 16 casi in `settingsRoundTrip` (8 visti rossi contro il servizio pre-fix). Il prompt resta come riferimento di metodo.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Impostazioni» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Nessun verdetto qui (è un form), ma la cadenza sì: header compatto + PageTabBar, e ogni
gruppo di impostazioni è una tessera (eyebrow = il gruppo, lettura = UNA riga che dice lo
stato attuale in parole: «Base rendimenti: fondi e asset esclusi fuori», «Bollo 0,2% attivo»,
«Condiviso con Marcella (co-proprietaria)»), controlli sotto, un solo Save per pagina che
valida tutto (targets = 100).

Per tab:
- Preferenze: profilo, Calcolo dei rendimenti (base + «calcolabile da»), FIRE (SWR, spese, età
  INPS, RITA), Famiglia (membri, RAL), Email periodiche (toggle + «invia ora»), Assistente
  (stile, memoria, web). Ogni tessera dichiara in lettura l'effetto a valle.
- Spese: categorie (CategoryManagementDialog a ramp), conti di default, Import CSV
  (ExpenseImportSection: anteprima obbligatoria come tessera con le tre liste: importa/salta/
  crea; undo per importBatchId).
- Allocazione: target per classe e sotto-categoria, leva target dichiarata, auto-target
  Equity/Bonds (equityBondsAutoTargets: arrotonda uno e sottrai).
- Dividendi: categoria entrate dividendi, BTP Italia FOI.
- Condivisione: AccountSharingSection — whitelist, inviti, ruolo; la tessera dice chi vede cosa.
- Aspetto: tema chiaro/scuro/sistema (view transition) + 6 temi come swatch (aria «Colore i
  di n» + aria-pressed), densità NO (non esiste).

Vincoli: le CINQUE (+ sesta server) sedi di ogni setting; booleani espliciti; dirty-snapshot
solo di campi persistiti; invalidate ['settings', ownerId].

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 19 · Login e Registrazione

**Superfici**: `app/login/page.tsx`, `app/register/page.tsx`, `components/ProtectedRoute.tsx`.

**Modello/effort**: Opus 5 · high — due form, nessuna logica nuova; il valore è nel canvas (3 varianti di frase).

**Stato**: ✅ fatto il 2026-08-30 (`feature/auth-redesign`) — la propagazione con **UNA sola tessera e nessuna griglia**: una colonna da 420, l'eyebrow «PORTFOLIO TRACKER», il verdetto e il form. Una griglia di una cella è una griglia che finge, quindi non c'è. È anche l'unica pagina in cui **il verdetto è la promessa del prodotto** e non la lettura di un dato («Il tuo patrimonio, spiegato prima che misurato.») — generato però dallo STATO, non scritto a mano: quattro casi in `authNarrative.ts` (accesso · registrazione aperta · su invito · chiusa), 49 test. Tre scostamenti/scoperte, tutti sostanziali e non cosmetici. **La lettura della tessera È la status line del form** (idle · invio · riuscito · errore) in un unico `role="status"` stabile al posto del paragrafo sotto il bottone: lo stato si leggeva in due punti insieme, e il ruolo non diventa mai `alert` in errore perché un nodo che cambia ruolo è un nodo nuovo per l'albero di accessibilità — sono le parole a portare la gravità («The Status-Is-The-Reading Rule» in DESIGN.md). **Nessuna stringa grezza di Firebase arriva a schermo**: «Firebase: Error (auth/invalid-credential).» è una riga di log, non una frase — `describeAuthError` mappa 14 codici e a un codice ignoto dà una frase che non afferma la causa; per tenerlo onesto il codice deve sopravvivere, quindi il 403 di `check-registration` porta `code: 'registration/not-allowed'` e `AuthContext` lo riattacca con `withCode()` invece di riavvolgere l'Error e perderlo. **I requisiti password sono righe che si spuntano**, le DUE regole davvero imposte e dallo stesso predicato del submit, così la checklist non può promettere un vincolo che la validazione non applica; una riga soddisfatta prende `text-foreground`, mai `text-positive` (i token di segno significano guadagnato e perso). In più: `resolveRegistrationAccess` **rispecchia** `isRegistrationAllowed` deroga inclusa — con la whitelist accesa un'email autorizzata si registra anche con `REGISTRATIONS_ENABLED=false`, che è il meccanismo su cui SETUP.md Step 5b conta per l'ospite dell'account condiviso — quindi la pagina dichiara la regola dell'invito invece di promettere una porta che il server lascia socchiusa (la policy server non è stata toccata); i campi sono passati allo stile form dell'app (label 12px su input 36px con l'anello di focus) invece di un pannello bordato per input, che era una card dentro una card e costava all'input il suo anello; Google e la demo mantengono esattamente il gating che avevano. Collaudato sugli emulatori a 1440 e 390 con spec usa-e-getta (cancellate): 20/20 su struttura, altezze dei controlli e zero overflow orizzontale, più la coppia positiva/negativa della whitelist asserita contro l'emulatore Auth e non contro la pagina; tre guardie falsificate di proposito e viste rosse prima di essere ripristinate. Il prompt resta come riferimento di metodo.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Login e Registrazione» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Due pagine, un solo layout: sfondo --background, una tessera centrata (max-w 420, p-5→p-6 qui
è legittimo: è un form), eyebrow «Portfolio Tracker», il verdetto è la frase di prodotto («Il
tuo patrimonio, spiegato prima che misurato.» — proponi 3 varianti sul canvas), poi il form.
Input a 36px, ring soft, errori con il token di segno (text-destructive, mai text-red-500);
bottone primario pieno; link secondario «Non hai un account? Registrati» / «Accedi».
Registrazione: whitelist (REGISTRATION_WHITELIST, senza NEXT_PUBLIC) — l'errore «email non
abilitata» in parole; password: requisiti come righe che si spuntano, non paragrafo.
Mobile 390 prima: la tessera prende tutta la larghezza meno 16px.
Niente logica nuova; ProtectedRoute invariato; nessun dato reale sul canvas.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 20 · Landing pubblica e Demo

**Superfici**: `app/page.tsx` (+ `SavingsRingChart` preview), banner demo in `app/dashboard/layout.tsx`.

**Modello/effort**: Opus 5 · high — copy e tessere con dati d'esempio; niente calcoli.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Landing pubblica e Demo» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

La landing È la Panoramica raccontata a chi non ha ancora dati: verdetto di prodotto in testa
(una frase, una CTA «Prova la demo» + «Accedi»), poi una griglia di tessere che mostrano —
con dati d'esempio dichiarati tali — le stesse tessere della Panoramica (Patrimonio con
sparkline, Cashflow, Composizione, Obiettivi) e tre tessere-promessa (Rendimenti, FIRE,
Previdenza) ciascuna con UNA riga di lettura vera (niente marketing vuoto: la riga dice cosa
calcola). Footer minimo. Nessun pie/donut: sostituisci SavingsRingChart con le righe piatte.
Demo: il banner giallo in dashboard resta ma a ramp (warning tokens); la CTA demo è nascosta
se mancano le NEXT_PUBLIC_DEMO_*.
Copy italiano, specifico; nessun lorem; prezzi/claim inventati = zero.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 21 · Dialog e form trasversali

**Superfici**: `components/ui/responsive-modal.tsx`, `components/{CreateManualSnapshotModal,CreateDummySnapshotModal,DeleteDummyDataDialog}.tsx`, `components/expenses/{ExpenseDialog,CategoryManagementDialog,CategoryMoveDialog,CategoryDeleteConfirmDialog,IconPickerPopover}.tsx`, `components/assets/{AssetDialog,TransactionDialog,AssetMovementsDialog,TaxCalculatorModal}.tsx`, `components/dividends/*Dialog.tsx`, `components/pension/PensionContributionDialog.tsx`, `components/goals/{GoalFormDialog,AssetAssignmentDialog}.tsx`, `components/performance/{CustomDateRangeDialog,AIAnalysisDialog}.tsx`, `components/history/SnapshotSearchDialog.tsx`, `components/layout/LogoutDialog.tsx`.

**Modello/effort**: Opus 5 · high — vocabolario unico applicato per analogia; attenzione solo ai 2-click e alle descrizioni obbligatorie.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Dialog e form trasversali» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Un solo vocabolario per ogni modale: eyebrow (contesto: «Snapshot mensile»), titolo (Headline
20px), descrizione (Body muted, SEMPRE presente — sr-only se non deve vedersi), corpo, footer
con Annulla outline + azione primaria; ResponsiveModal (Drawer ≤768, Dialog sopra) come
convergenza; i 2-step (AssetDialog, ExpenseDialog) restano 2-step. Le conferme distruttive:
2-click senza timer, con pointerdown guard ed Escape; l'azione nomina il conteggio dalla
stessa query.
Stati del form: errori con token di segno; zod message sul TYPE check; useWatch per render.
AssetMovementsDialog: la tabella movimenti a cadenza tessera (eyebrow + lettura «3 acquisti,
1 vendita, PMC 162,86 €»). AIAnalysisDialog: il report come verdetto + tessere di lettura.
Lavora su un canvas di 6 artboard (i sei dialog più usati) prima del codice; poi applica il
vocabolario agli altri per analogia, senza toccare la logica.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 22 · Stati: skeleton, vuoto, errore, notifiche

**Superfici**: `*Skeleton.tsx` (Allocation, FireCalculator, Goals, MonteCarlo, WhatIf, Performance, History, HallOfFame, Assistant), `components/ui/EmptyState*`, `components/ui/SavingsRateBadge.tsx`, toasts (sonner), `PensionErrorNotice`, `CostCenterErrorNotice`.

**Modello/effort**: Opus 5 · high (Sonnet 5 · high per i soli skeleton) — componenti piccoli, regole poche e note.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Stati: skeleton, vuoto, errore, notifiche» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

- Skeleton: UN componente TileGridSkeleton (griglia + tessere muted con le stesse proporzioni
  della pagina) parametrizzato dagli span; le pagine ridisegnate lo usano, gli altri skeleton
  si cancellano man mano (non ora).
- Vuoto: un EmptyState a cadenza tessera (eyebrow + UNA frase + UNA azione), mai illustrazione.
  Distinzione obbligatoria: «nessun dato» ≠ «0» ≠ «errore» (AGENTS: expenseStats null ≠ 0; un
  fetch fallito va in role="alert").
- Errore: notice con token warning/destructive, la frase dice cosa manca e cosa fare.
- Notifiche: SavingsRateBadge (una volta al mese, già fatto) e i toast: stessa tipografia,
  niente emoji salvo il ✦ già in uso (decidi sul canvas se tenerlo).
- Riduci motion: useReducedMotion rispettato ovunque; count-up solo nei leaf.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

## 23 · Superfici fuori DOM: email e PDF

**Superfici**: `lib/server/{monthlyEmailService,weeklyBudgetEmailService}.ts`, `components/pdf/*`, `lib/utils/pdfGenerator.tsx`.

**Modello/effort**: Opus 5 · high — modulo hex condiviso + template HTML; verifica con render in file.

```
Ciao Claude, in questa sessione ridisegniamo la sezione «Email e PDF» dell'app portandola sullo
stile della Panoramica: «Verdict over Tiles» (DESIGN.md §1 «The 2026-08-22 turn» e §5: Page
Verdict, Tile, Tile Grid, Compact Page Header; regole Verdict-First, Narrative Honesty, Comma,
One-Tile-One-Question, Tile Grid, Grouped Chip). La Panoramica (app/dashboard/page.tsx +
components/dashboard/overview/*) è il riferimento di implementazione: stesse primitive
(OverviewTile, NarrativeText, RankedRows, PageHeader variant="compact"), stessa cadenza
(verdetto → griglia 12 colonne → dettaglio sotto la piega), stesso rigore sui numeri.

Contesto, da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi CLAUDE.md (stato corrente, Known Issues), AGENTS.md (pattern, gotcha — in particolare
  «Panoramica and Dashboard Data Isolation» e la sezione della pagina che tocchiamo), WORKFLOW.md
  (regole di sessione e collaudo guidato), DESIGN.md (normativo: il nuovo stile È lì),
  COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice.
- Crea il branch PRIMA di editare. Crea SESSION_NOTES.md per tracciare il lavoro.

Metodo, in quest'ordine:
1. DESIGN PRIMA DEL CODICE. Con la skill nativa /design prepara un canvas con Main (desktop 1440,
   sidebar fedele) e MainMobile (390) della pagina ridisegnata, con i token REALI di
   app/globals.css e dati d'esempio coerenti e plausibili (mai i miei dati reali nel canvas).
   Se una scelta di direzione è davvero aperta, metti 2-3 alternative ACCANTO alla proposta,
   non al posto. Fermati e aspetta il mio OK sul canvas prima di scrivere codice.
2. LAYER PURO E TESTATO. La frase-verdetto e le righe di lettura delle tessere vivono in
   lib/utils/{pagina}Narrative.ts (pure, test in __tests__/, formattazione it-IT via
   chartService.formatPercentage, nbsp prima di €, meno tipografico). Regola Narrative Honesty:
   la frase non afferma mai ciò che i dati non reggono; un input mancante fa sparire la sua
   clausola, mai un placeholder.
3. TESSERE. Una tessera = una domanda (eyebrow) + una riga di lettura + i numeri; nessuna riga
   ripetuta in due tessere; griglia 12 colonne con span espliciti, ordine mobile esplicito,
   root max-w-[1920px]; scroll ammesso. Riusa OverviewTile/NarrativeText/RankedRows — se questa è
   la prima propagazione, spostali in components/ui/ (tile.tsx, narrative-text.tsx,
   ranked-rows.tsx) con un re-export dalla Panoramica, e segnalo.
4. NIENTE NUOVI CALCOLI NASCOSTI NEI COMPONENTI: un numero nuovo nasce in un util puro con test
   (visti rossi prima), e se serve nel payload server si aggiunge lì (versione cache bump).
5. COLLAUDO come da WORKFLOW.md: npx tsc --noEmit, TZ=Europe/Rome npx vitest run, eslint sui
   file toccati, e una spec Playwright usa-e-getta sugli emulatori a 1440 e 390 che verifichi
   verdetto/tessere/zero overflow (main.scrollWidth === clientWidth). Cancella la spec, esporta e
   spegni gli emulatori.
6. DOC: CLAUDE.md (Latest + Known Issues + Key Files), AGENTS.md (sezione della pagina),
   DESIGN.md (marca «superseded» i pattern che la pagina abbandona; aggiungi al ramp solo misure
   davvero usate) e .impeccable/design.json (narrative specchio verbatim). Draft Release Temp.md.
7. Nessun commit senza il mio OK esplicito. Rispondi in italiano; codice e commenti in inglese.

Se hai domande che cambiano davvero il lavoro, falle PRIMA del canvas.

Le email e il PDF non vedono i token CSS (Known Issues): prima di ogni restyle crea UN modulo
condiviso di hex per i colori di segno e per i grigi (lib/constants/printTokens.ts o simile)
che rispecchi i valori di default di globals.css, e fai leggere i 9 file da lì. Poi porta le
email alla cadenza «verdetto → tessere»: il commento AI in testa (è già un verdetto), poi i
blocchi come tessere HTML (tabelle, non flex), numeri it-IT, orizzonte in ogni didascalia (la
budget email è mensile/YTD, mai «settimana»). PDF: 7 sezioni come tessere per pagina, stessa
tipografia, filtro Totale/Annuale/Mensile invariato, floor cashflowHistoryStartYear sul
Cashflow.
Verifica: render delle email in un file HTML e del PDF via script usa-e-getta, confronto
visivo sul canvas; nessun invio reale.

SCREENSHOT PER IL README. Se in docs/screenshots/ esiste uno screenshot della superficie che
abbiamo ridisegnato, va rifatto a fine sessione (il README lo referenzia): account SINTETICO
sull'emulatore (mai i miei dati — seed usa-e-getta con displayName «Mario», numeri plausibili
e coerenti tra loro), viewport 1690×940 a deviceScaleFactor 2, tema scuro di default
(localStorage theme=dark, nessun data-theme), spec Playwright usa-e-getta con login via form,
stesso nome file; poi cancella le fixture dall'emulatore, esporta, spegni, elimina seed e spec,
e annota in PRODUCT.md → Evidence on Hand quali screenshot sono della nuova generazione.
Qui: oggi nessuno screenshot di questa superficie esiste in docs/screenshots/ — non crearne uno
nuovo a meno che non te lo chieda.
```

---

## Checklist di chiusura (ogni sessione)

- [ ] Canvas approvato prima del codice
- [ ] Layer puro `*Narrative.ts` con test visti rossi
- [ ] Nessuna riga ripetuta tra tessere; residuo nelle liste «per categoria»
- [ ] `tsc`, Vitest (TZ=Europe/Rome), eslint sui file toccati
- [ ] Playwright usa-e-getta a 1440 e 390: verdetto, tessere, zero overflow — poi cancellata
- [ ] Emulatori esportati (`/_admin/export`) e spenti
- [ ] CLAUDE.md / AGENTS.md / DESIGN.md (+ sidecar) / Draft Release Temp.md aggiornati; pattern abbandonati marcati «superseded»
- [ ] Screenshot in docs/screenshots/ rifatto se la superficie ne ha uno (account sintetico, 1690×940 @2×, tema scuro)
- [ ] SESSION_NOTES.md cancellato al commit; un commit, su OK esplicito
