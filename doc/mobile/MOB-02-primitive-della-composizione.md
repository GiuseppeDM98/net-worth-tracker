# MOB-02 — Le primitive della composizione

> Stato: da fare · Priorità: 1 (sette spec ne citano le API) · Sforzo: L · Dipende da: MOB-01, PERF-12, PERF-14 (con PERF-02; PERF-03
> per `freshness`) · Sblocca: MOB-03..08

## 1. Il problema, misurato

Censimento 2026-09-26 a 390×844: ogni pagina con dati apre con il verdetto e l'inizio di UNA tessera, poi 2–5 schermate.
**Hall of Fame**: 3,43 schermate, 5 tessere (1 sopra la piega, 0 intere), 49 cifre (17 sopra la piega); 2,17 a 768, 2,85
a 1024. Le primitive di oggi (righe del 2026-09-26, da riverificare):

- `components/ui/tile.tsx:50-75`: `Tile` sempre aperta; eyebrow `<h3>` (`:66`); l'aside può essere un controllo
  (`components/hall-of-fame/tiles/NoteTile.tsx:31`).
- `components/ui/page-verdict.tsx:24-42` stampa tutta la `sentence`; `lib/utils/narrative.ts:22-26` non dice dove finisce
  la prima frase (e le cifre hanno punti).
- `components/ui/error-notice.tsx:43-44`: `role="alert"` per istanza, tre letture fallite = tre annunci.
- `components/layout/PageTabBar.tsx:94`: tab della pill 38×32 (CLAUDE.md § Known Issues).
- Radix `CollapsibleContent` (v1.1.12) mette `hidden: !isOpen` e smonta i figli da chiuso
  (`node_modules/@radix-ui/react-collapsible/dist/index.mjs:128`, `:136`): niente transizione di chiusura; il trigger
  stende le props dopo `aria-controls` (`:64`, `:69`).
- `lib/hooks/useMediaQuery.ts` è `useSyncExternalStore` dal 2026-09-28 (PERF-02): `false` sul server e durante
  l'idratazione, il valore vero subito dopo; un componente montato DOPO il login lo legge già al primo render.

## 2. Obiettivo misurabile

- `npm run mobile:budget`, `hall-of-fame` a 390: schermate da 3,43 a **≤ 2,0**, una tessera aperta, `budget.json`
  abbassato; le cifre fuori dal verdetto e `firstClosedRowAbovePill` registrati (§ 4.9, 1 e 6).
- Ogni tab della pill ≥ 44×44 sotto `desktop:`.
- A 1440 Hall of Fame è quella di oggi salvo la punteggiatura del verdetto (§ 4.7).
- In Playwright: DOM in ordine desktop, pannello chiuso vuoto, memoria dopo il reload, reduced motion senza transizioni.
- `npm run perf:census -- --route=hall-of-fame`: aprire una riga ri-renderizza quella sezione e `PageRest`, non le altre
  (il census di PERF-12 conta i commit per tasto: gli serve un'azione a clic).

## 3. Non-obiettivi

- B e C; il desktop oltre § 4.7; lo skeleton. Le altre pagine (MOB-03..07): Hall of Fame esce di qui già composta; MOB-06
  per lei fa censimento, guida e, se il proprietario lo vuole (MOB-06 § 4.6, 5), le due azioni in fondo. Il tablet a
  colonne: MOB-08. DESIGN.md: MOB-09 (qui le regole sono proposte).
- Dove sta l'asse di periodo sotto `desktop:` si decide QUI (§ 4.9, 9), una volta per tutte le pagine con un asse; la
  tecnica, se non è lo slot, la scrive MOB-05 (§ 4.1). I formati e i campi della striscia sono tutti qui (§ 4.1): nessuna
  spec di pagina tocca `verdictStrip.ts`.

## 4. Design

### 4.1 Le API (contratto: si può AGGIUNGERE un formato o un campo opzionale, mai rinominare)

| Dove | Nome | Firma |
|---|---|---|
| `lib/utils/narrative.ts` | `NarrativeSegment.binding` | `binding?: boolean` |
| idem | `PageVerdictModel` | `+ leadLength?: number` (segmenti della prima frase) `+ restLabel?: string` |
| idem | `splitVerdict` | `(m: PageVerdictModel) => { lead: Narrative; rest: Narrative; restLabel: string \| null }` |
| `lib/utils/verdictStrip.ts` | `StripFormat` | `'signed-currency' \| 'currency' \| 'approx-currency' \| 'signed-percent' \| 'percent' \| 'points' \| 'pp' \| 'ratio' \| 'rank'` |
| idem | `StripFigure` | `{ label: string; value: number \| null; format: StripFormat; tone?: 'positive' \| 'negative' \| 'neutral'; opens: string; reason?: string; lifts?: { section: string; block: string }; decimals?: number }` |
| idem | `MAX_STRIP_FIGURES`, `formatStripFigure` | `4`; `(f: StripFigure) => NarrativeSegment \| null` |
| idem | `validateStrip`, `liftedBlocks` | `(fs, sections: readonly string[]) => string[]` (errori); `(fs, section: string) => string[]` |
| `lib/utils/<page>Summary.ts` | `select<Page>Strip` | `(summary) => StripFigure[]` — qui `selectHallOfFameStrip` |
| `lib/utils/mobileSections.ts` | `mobileSectionsKey` | `(route: string, tab?: string) => string` → `mobile-sections:<route>[:<tab>]` |
| idem | `parseStoredSections`, `serializeSections` | `(raw: string \| null) => string[] \| null`; `(ids) => string` (JSON ordinato, unico) |
| idem | `resolveOpenSections` | `({ stored, known, defaults, failed, dismissed }) => Set<string>` |
| idem | `sectionTriggerId`, `sectionPanelId`, `VERDICT_REST_SECTION` | `` `${id}-trigger` ``, `` `${id}-panel` ``, `'perche'` |
| `lib/utils/statesNarrative.ts` | `describeFailedSections` | `(eyebrows: readonly string[]) => string \| null` |
| `lib/hooks/useCompactLayout.ts` | `useCompactLayout` | `() => boolean` — `useMediaQuery('(width < 1440px)')` |
| `lib/hooks/useMobileSections.ts` | `useMobileSections` | `({ route, tab?, sections: readonly SectionSpec[], defaultOpen?, restId? }) => MobileSections` |
| idem | `SectionSpec`, `MobileSections` | `{ id; eyebrow; failed? }`; `{ compact; collapse(id): TileCollapse \| undefined; reveal(id); allOpen; setAll(open); announcement: string \| null }` |
| `components/ui/tile.tsx` | `TileCollapse` | `{ id; open; mounted; failed; onOpenChange(open: boolean) }` |
| idem | `Tile` | `+ collapse?: TileCollapse; asideWhenClosed?: string`; `LIFTED_FIGURE_CLASS = 'max-tablet:hidden'` |
| `components/ui/page-verdict.tsx` | `PageVerdict` | `+ strip?: ReactNode; scope?: ReactNode; restCollapse?: TileCollapse` |
| `components/ui/verdict-strip.tsx` | `VerdictStrip` | `{ figures: readonly StripFigure[]; onOpen(section: string): void }` |
| `components/ui/page-rest.tsx` | `PageRest` | `{ sections: MobileSections; className?: string }` |
| `components/ui/error-notice.tsx` | `ErrorNotice` | `+ collapse?: TileCollapse; live?: boolean` (default `true`) |
| `app/globals.css` | `--ease-spring` | classe `ease-spring`, 300 ms (§ 4.2) |
| id di sezione | convenzione | `<pagina>-<slug>`: `hof-anni`; una tessera di pagina che solleva accetta `liftedFigures?: readonly K[]` |

**Precisazioni del contratto** (revisione di coerenza del 2026-09-26; valgono per MOB-03..08):

- `formatStripFigure` senza `decimals`: euro compatti (0 decimali, come `cachedFormatCurrencyEUR(v, true)`), percentuali
  a 1 decimale; `'approx-currency'` «~1234 €» (`TettoTile.tsx:110`, MOB-04), `'points'` «+1,2 pt» (`formatPoints`,
  `RendimentoTile.tsx:48-51`, MOB-05), `'pp'` «3,4 pp» (`allocazioneNarrative.ts:50-52`, MOB-07). Un selettore passa
  `decimals` quando la frase o la tessera che la cella ristampa ne usa altri (MOB-03, MOB-06, MOB-07; i decimali
  variabili di Monte Carlo li calcola il selettore): lo decide il test d'identità.
- `leadLength: 0` = `lead` vuoto (solo il titolo sopra la striscia); `undefined` = nessun taglio. Mai `if (!m.leadLength)`.
- `route` di `mobileSectionsKey` = il segmento sotto `/dashboard/` (`hall-of-fame`, `assets`, `performance`, `cashflow`,
  `analisi`, `history`, `allocation`, `pension`, `fire-simulations`); la Panoramica, che non ne ha, usa `panoramica`.

### 4.2 La riga chiusa (The Closed-Row Rule, proposta)

`useCompactLayout` = `useMediaQuery('(width < 1440px)')` (`lib/hooks/useMediaQuery.ts`, server `false` dal 2026-09-28), non un secondo store: è la query
di `max-desktop:` in Tailwind 4.3 (`max-width: 1439px` scoprirebbe le larghezze frazionarie dello zoom). Se `!compact`,
`collapse(id)` è `undefined`: la `Tile` di oggi. Con `collapse`: Radix `Collapsible` + `CollapsibleTrigger asChild`
(AGENTS § Motion), **non** `CollapsibleContent` (§ 1); `aria-controls` esplicito.

- `<section id aria-label>` → `<h3>` → `<button id={sectionTriggerId(id)} aria-expanded>` a tutta larghezza, `min-h-[52px]
  px-5 active:bg-muted`: eyebrow, `asideWhenClosed` da chiusa (parole: «per mese», «3 note»; mai un importo né un conteggio
  di cifre), chevron. L'`aside` con controlli sta fuori dal bottone, solo da aperta.
- Pannello `<div id={sectionPanelId(id)} role="region" aria-labelledby={sectionTriggerId(id)} data-state inert={!open}>`
  (il `role` è il contratto di MOB-01 per riconoscere la riga): `grid motion-safe:transition-[grid-template-rows]
  motion-safe:duration-300 motion-safe:ease-spring`, `grid-rows-[0fr]`↔`[1fr]`, figlio `min-h-0 overflow-hidden`
  (`components/history/tiles/DriverTile.tsx:161-162`), il padding su un NIPOTE (sul figlio resta visibile a `0fr`);
  il chevron con la stessa curva.
- **Il pannello c'è, il contenuto no** (come `PageTabs`, AGENTS § Navigation): `reading` e `children` montano con `mounted`
  (aperta ora o già in questa visita, scritto nel gestore) e restano alla chiusura. Il chunk di un grafico (PERF-04) aspetta.
  `collapse(id)` è lo STESSO oggetto finché la sua sezione non cambia (`onOpenChange` stabile): se no il compiler
  ri-renderizza ogni tessera a ogni tap.
- `failed`: eyebrow `text-destructive` + `AlertTriangle`, `sr-only` «, lettura fallita».
- `--ease-spring: linear(0, 0.093 8.3%, 0.280 16.7%, 0.476 25%, 0.643 33.3%, 0.771 41.7%, 0.861 50%, 0.922 58.3%, 0.960
  66.7%, 0.982 75%, 0.994 83.3%, 1)` in `@theme inline` — la molla 400/35 (ζ≈0,875) su 300 ms. Niente `layout` di Framer.

**Cifre sollevate** (The Lifted-Figure Rule): il blocco ripetuto dalla striscia prende `LIFTED_FIGURE_CLASS` con la chiave
da `liftedBlocks(strip, section)` (una cella `null` non nasconde nulla). Hall of Fame non solleva: la prima prova è MOB-03.

### 4.3 Il verdetto breve (The Binding-Clause Rule)

Additivo: `sentence` resta intera (70 riferimenti a `PageVerdictModel` in 29 file; email e PDF la leggono). Il builder mette
`leadLength` su un confine di frase e `restLabel`. `splitVerdict`: senza taglio `rest = []`; **un segmento `binding` oltre
il taglio annulla il taglio**.

Sotto `desktop:`: titolo → prima frase → `freshness` (PERF-03) → `strip` → `scope` (riga d'ambito, sempre visibile) →
«Il perché · {restLabel}» (`min-h-11`, `aria-expanded`) → seguito. Un solo DOM: il `<p>` ha `<span>` lead e `<span
id={sectionPanelId(restCollapse.id)}>` (`NarrativeSegments`, `components/ui/narrative-text.tsx:29`); striscia e bottone,
fratelli del `<p>`, stanno DENTRO la `section` (§ 4.9, 5); sotto `desktop:` il `<p>` è `max-desktop:contents` con
`order-*` sui figli, il seguito chiuso `max-desktop:hidden`. A 1440 il paragrafo è quello di oggi. «Il perché» sta nel
controller: `useMobileSections` lo tiene con id `restId` (default `VERDICT_REST_SECTION`; `<prefisso>-perche` dove più
verdetti convivono nel DOM, MOB-04 § 4.1); `collapse(restId)` è il `restCollapse` che la pagina passa a `PageVerdict` e
che una cella apre con `onOpenChange(true)`; `setAll` e `allOpen` lo saltano; la memoria lo ricorda come una riga.

### 4.4 La striscia

`<ul aria-label="Le cifre del verdetto" class="desktop:hidden grid">`: 1–3 celle in riga, 4 in 2×2 sotto `tablet:`. Cella = `<button min-h-11>`: etichetta `TILE_SUB_EYEBROW_CLASS`, valore mono 22 px (18 in una cella sotto
110 px, `@container`), `sr-only` «, apre {eyebrow}»; `null` stampa `reason`, mai uno zero. `reveal(id)`: apre,
`scrollIntoView` (`auto` con reduced motion; `scroll-mt-24`), focus sul trigger; mai LA tessera. **Mai ricalcolata**:
`select<Page>Strip` legge solo il `*Summary` delle tessere, e § 7 prova il testo identico.

### 4.5 Il resto, la memoria, gli errori

`PageRest`, figlio della griglia subito DOPO la cella di LA tessera nel DOM (su ogni pagina), `desktop:hidden col-span-full`: `<h2 className={TILE_EYEBROW_CLASS}>Il resto della
pagina</h2>` + «Apri tutte»/«Chiudi tutte» (44 px; non tocca «Il perché»); fuori dal wrapper nascosto, `<p role="alert"
className="sr-only">` con `announcement`. **Ordine**: DOM desktop (AGENTS § Hierarchy, Density and Disclosure); sotto
`desktop:` LA tessera `order-1`, `PageRest` `order-2`, le righe `order-3…` nell'ordine mobile di oggi, classi letterali.

**Memoria**: store a modulo come `contexts/ColorThemeContext.tsx:40-71`, `useSyncExternalStore(subscribe, () =>
localStorage.getItem(key), () => null)`: snapshot = stringa grezza, parse in `useMemo`, `try/catch`; qui la chiave è
`mobile-sections:hall-of-fame`. Si scrive solo a un gesto (`null` = mai toccata). `resolveOpenSections` =
`((stored ?? defaults) ∩ known) ∪ (failed − dismissed)`: una lettura fallita si apre a ogni visita; chiusa dal lettore
va in `dismissed` (non persistito). LA tessera non è nel controller.

**Errori** (da C): `failed` dall'`isError` della pagina; nel pannello `<ErrorNotice collapse live={!compact}>` al posto
della tessera. Sotto `desktop:` il solo nodo live degli errori è di `PageRest` (il `role="status"` di `freshness`,
PERF-03, resta): `describeFailedSections` → «Una sezione non è stata letta: Benchmark.» / «2 sezioni non sono state
lette: Benchmark, Contributi.» / `null`; `announcement` è `null` se `!compact`: a 1440 nulla cambia.

### 4.6 `PageTabBar`

Pill (`PageTabBar.tsx:83-107`): `min-h-11 min-w-11 justify-center` (la pill da ~40 a 52 px); `layout="size"` resta.

### 4.7 Hall of Fame, la pagina campione

LA tessera = **Record del patrimonio** (`app/dashboard/hall-of-fame/page.tsx:428`). Righe, nell'ordine mobile di oggi:
`hof-entrate` («per mese»), `hof-risparmio` («entrate − spese»), `hof-anni` («crescita del patrimonio»), `hof-note`
(`describeClosedNotesAside`: «nessuna nota» / «una nota» / «N note»); poi il «Dettaglio», com'è. `RecordBoardTile` e
`NoteTile` inoltrano `collapse` e `asideWhenClosed`. Verdetto (`lib/utils/hallOfFameNarrative.ts:162-184`): la prima
frase chiude dopo la cifra del record («in un mese» solo con la percentuale, `:163-165`), il seguito diventa frase
(«Il 2026 è finora…»; senza anno «Agosto è oggi…»), `restLabel` «l'anno e il mese in corso» (o uno dei due); nessun
`binding`; anche a 1440 «; il» → «. Il». `selectHallOfFameStrip`: «Quest'anno» (`annual:growth` `current.value`,
`signed-currency`, apre `hof-anni`, `reason` «fuori dalla classifica di crescita»: un anno in calo sta in
`annual:decline`; la cifra è quella del seguito del verdetto, `:172`, non di `describeYearRecords`; § 4.9, 7);
«Entrate record» (`monthly:income` `top.value`, `currency`, `hof-entrate`); «Risparmio record» (`monthly:savings`
`top.value`, `signed-currency`, `hof-risparmio`). Vuoto, caricamento, lettura fallita: come oggi.

### 4.8 Conflitti con PERF

- **PERF-12**: `useSyncExternalStore`, nessun ref restituito, `mounted` nel gestore. **PERF-14**: nessun `layout`; un
  grafico montato all'apertura legge `ChartColorsProvider`. **PERF-04**: un grafico lazy riserva la sua altezza (obbligo
  di MOB-03..07). **PERF-03**: `freshness` fuori da «Il perché». **PERF-02** (in develop dal 2026-09-29): server `false`, già così in `lib/hooks/useMediaQuery.ts`.
- **MOB-01**: le pagine a tab crescono di ~12 px: l'unica eccezione al ratchet, dichiarata nel commit.

### 4.9 Domande al proprietario

1. Il podio di LA tessera conta nel budget «≤ 5 cifre fuori dal verdetto»? (Proposta: sì, il misurato fa da baseline.)
2. LA tessera non si chiude mai: va bene? 3. Il verdetto di Hall of Fame in due frasi anche a 1440: va bene?
4. Si accetta il peggioramento di ~12 px delle pagine a tab nel budget di MOB-01?
5. (Chiusa: MOB-01 § 4 conta le cifre di `ul[aria-label="Le cifre del verdetto"]` FUORI dal verdetto, come i mock di A.)
6. LA tessera (grafico + podio) precede la prima riga: se `mobile:census` dà `firstClosedRowAbovePill` falso, si registra?
7. «Quest'anno» ristampa la cifra del seguito: aperto «Il perché» compare due volte (`doc/guide/hall-of-fame.md`:
   «never the same figure twice»). Va bene? (Lo stesso dubbio in MOB-07 § 4.6, 4: una risposta per le due.)
8. L'ordine del DOM, per tutte le pagine (spostata qui da MOB-09 § 4.9, 5): AGENTS § Hierarchy, Density and Disclosure
   (`AGENTS.md:686`) vuole il DOM in ordine desktop e il telefono riordinato con `order-*`; `doc/guide/patrimonio.md:169`
   dice il contrario («DOM order is the reading order … never by a CSS `order` swap»: lo screen reader leggeva
   Liquidità, l'occhio Movimenti). Con righe chiuse l'ordine di Tab e del lettore segue il DOM, non la colonna: vale la
   regola di AGENTS (proposta, con Patrimonio che tiene il suo DOM mobile) o quella di Patrimonio per tutti?
   **Deciso il 2026-09-27 (doc/mobile/README.md § 9): una sequenza sola — nessun riordino CSS, l'ordine del DOM è
   l'ordine di lettura su ogni dispositivo; dove LA tessera non è già la prima della griglia si sposta anche sul desktop.**

9. L'asse sotto `desktop:` (A-notes: «subito sotto il titolo, prima delle cifre che misura»): (a) slot `axis?: ReactNode`
   di `PageVerdict`, additivo, scritto qui e usato da MOB-04..07; (b) `max-desktop:contents` sulla `section` (MOB-05
   § 4.1: altezza 0, il criterio con cui MOB-01 scarta un verdetto nascosto, e niente box per `view-transition-name`);
   (c) l'asse resta DOPO il verdetto come oggi (MOB-04, MOB-06, MOB-07 fino a questa revisione).
   **Deciso il 2026-09-27 (doc/mobile/README.md § 9): (a), lo slot `axis` di `PageVerdict`, sotto il titolo e prima
   della striscia, nella stessa `section` del verdetto.**

## 5. File da toccare

- I file di § 4.1 (nuovi: `verdictStrip.ts`, `mobileSections.ts`, i due hook, `verdict-strip.tsx`, `page-rest.tsx`);
  `components/layout/PageTabBar.tsx`.
- `app/dashboard/hall-of-fame/page.tsx`, `components/hall-of-fame/tiles/{RecordBoardTile,NoteTile}.tsx`,
  `lib/utils/{hallOfFameSummary,hallOfFameNarrative}.ts`.
- I test di § 7; `doc/mobile/budget.json`.

## 6. Passi

1. Branch, guide, `mobile:census` PRIMA, le domande di § 4.9. 2. Le pure e i test, falsificati. 3. Hook e componenti.
4. Hall of Fame. 5. Playwright, lint, `perf:census`. 6. `mobile:census`/`mobile:budget`, giro, documentazione, commit.

## 7. Test e falsificazione

- `__tests__/narrative.test.ts`: `splitVerdict` senza taglio, a metà, oltre la fine, con `binding` oltre il taglio (tutto
  `lead`; falsificare togliendo quel ramo), con `leadLength: 0` (`lead` vuoto; falsificare con `if (!leadLength)`).
  `__tests__/mobileSections.test.ts`: chiave con/senza tab, JSON rotto → `null`,
  id ignoti scartati, `failed` aperta contro la memoria, `dismissed` (falsificare togliendo `∪ failed`).
  `restId` fuori da `setAll`. `__tests__/verdictStrip.test.ts`: segni, zero, `null`, i default e `decimals`,
  `'approx-currency'`, `'points'`, `'pp'`; `validateStrip` (5 figure, `opens` ignoto o doppio); `liftedBlocks`
  (falsificare con «0 €» per `null`).
- `hallOfFameSummary.test.ts` — per ogni cella, `narrativeToText([formatStripFigure(f)])` compare identico nella frase che
  la stampa (`describeIncomeRecords`, `describeSavingsRecords`; «Quest'anno» nel `sentence` del verdetto); falsificare con
  l'euro non compatto. `hallOfFameNarrative.test.ts` — attese di `:100-143` in due frasi (anche senza percentuale e senza
  anno), `lead` chiude con «.», `describeClosedNotesAside`; falsificare lasciando «; il». `statesNarrative.test.ts` —
  `describeFailedSections` a 0, 1, 2 (falsificare con il singolare fisso).
- **`e2e/mobile-composition.hof.mobile.spec.ts`**, progetto `hof-mobile`, fixture `hof` (il `.hof.` è obbligato: `mobile`
  ignora `/hof\./` e usa l'account base, `playwright.config.ts:199-200`; `hof-mobile` prende `/hof\.mobile\.spec\.ts/`,
  `:113`). `openPage` COPIATO da `e2e/hall-of-fame.hof.mobile.spec.ts:18-26` (non esportato; importare una spec ne
  registra i test). (1) Prima schermata: titolo, prima frase, 3 celle ≥ 44 px (non il valore di «Quest'anno»: dal 2027
  il fixture non ha l'anno in corso), la lettura di LA tessera, «Il resto della pagina», 4 trigger chiusi,
  `#hof-anni-panel` `inert` e senza elementi;
  (2) «Anni» apre e richiude (0 px dopo 300 ms); (3) reload con due righe aperte, `localStorage` =
  `["hof-anni","hof-entrate"]`; (4) «Quest'anno» apre `hof-anni`, nel viewport, focus sul trigger; (5) «Apri tutte», «Il
  perché»; (6) `reducedMotion: 'reduce'` → `transition-duration` 0s; (7) DOM in ordine desktop, `y` in ordine mobile;
  (8) nessuno sforamento di `main` (guardia di `e2e/fire.mobile.spec.ts`). Rossi falsificando: (1) contenuto montato da
  chiuso; (2) padding sul figlio; (3) nessuna scrittura; (4) `reveal` senza focus; (5) `setAll` che salta una riga;
  (6) `transition` senza `motion-safe:`; (7) DOM invertito; (8) una cella `min-w-[420px]`.
- `hall-of-fame.hof.mobile.spec.ts:94` apre «Anni» prima di misurare. `hall-of-fame.hof.spec.ts` (1440): nessun
  `[id$="-trigger"]` nella griglia (il «Dettaglio» ha il suo `aria-expanded`), striscia e «Il resto» invisibili,
  paragrafo intero (falsificare ignorando `compact`). `cashflow.mobile.spec.ts`: ogni `role="tab"` visibile ≥ 44×44
  (falsificare togliendo `min-h-11`).
- L'eyebrow rosso nel browser vuole una lettura per tessera via `/api/*` (`page.route` → `abort`,
  `e2e/settings.spec.ts:143`): Hall of Fame non ne ha; lo provano MOB-04 (Dividendi), MOB-07 (Esposizione) e, con la sua domanda 3, MOB-05.

## 8. Collaudo guidato

- A: `hall-of-fame.hof.spec.ts`, le spec delle pagine a tab, Vitest nei due fusi. C: § 7.
- F (mirror; telefono vero se si può, se no DevTools a 390): 1) la prima schermata dice il record e mostra le righe;
  2) aprire e chiudere, anche con «Riduci movimento»; 3) reload; 4) le tre celle; 5) le tab di Cashflow col pollice e
  Hall of Fame a 1440 come prima. G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Una spec che legge dentro una tessera chiusa a 390 non trova nulla: ogni MOB-03..07 rilegge le sue spec mobile.
- `max-desktop:contents` su un `<p>`: verificare l'albero ARIA. L'override di `aria-controls` dipende da Radix 1.1.12.
- Rollback: `collapse` sempre `undefined` spegne tutto; il resto per lettera.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest», § Known Issues (chiusa la metà `PageTabBar`, resta lo `Switch`), § Key Files.
- AGENTS.md § Motion (la riga e perché non `CollapsibleContent`), § Navigation, § Accessibility (un nodo live).
- `doc/guide/hall-of-fame.md` § Composizione mobile (con le otto voci di MOB-09 § 4.4, che MOB-03..08 copiano),
  `doc/guide/stati.md`, `doc/guide/e2e-emulatori.md`;
  `Draft Release Temp.md`; `doc/mobile/README.md` § stato. DESIGN.md no (MOB-09).

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-02-primitive-della-composizione.md: Tile chiusa/aperta (pannello
presente, contenuto montato all'apertura, grid-template-rows con la molla linear()), il verdetto breve con «Il
perché», VerdictStrip, PageRest con «Apri tutte», la memoria per pagina, ErrorNotice con un solo nodo live,
PageTabBar a 44 px — applicate a Hall of Fame, con i test Vitest delle pure e
e2e/mobile-composition.hof.mobile.spec.ts. La tabella di § 4.1 è un contratto per sette spec: non rinominare nulla.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § React Query and Derived State,
  § Motion, § Navigation, § Hierarchy, Density and Disclosure, § Accessibility), CLAUDE.md
- Leggi doc/guide/hall-of-fame.md, doc/guide/stati.md, doc/guide/e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/mobile/README.md e la spec MOB-02 per intero; DESIGN.md § 5 e § 6 (MAI rigenerarlo);
  doc/mobile/MOB-01 e doc/perf/PERF-03, PERF-12, PERF-14 (devono essere chiuse; PERF-02 lo è dal 2026-09-29)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; le domande di § 4.9 con lo
strumento interattivo, prima di toccare la pagina (l'8 e la 9 valgono per tutte le pagine: la risposta va in
doc/mobile/README.md, che MOB-03..07 leggono).
Chiusura: mobile:census e mobile:budget prima/dopo; tsc, lint 0, Vitest in Europe/Rome; le spec Playwright di § 7 con
le falsificazioni viste rosse; perf:census; giro guidato di 5 punti sul mirror, poi mirror:remove; la documentazione
di § 10 (Draft Release Temp.md senza dati privati) in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort xhigh.** È il contratto di sette spec e attraversa narrative, accessibilità, compiler e
memoria: un nome sbagliato qui si moltiplica per sette.
