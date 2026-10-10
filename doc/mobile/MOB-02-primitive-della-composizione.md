# MOB-02 — Le primitive della composizione

> Stato: da fare · riletta in modo adversariale il 2026-10-10: 30 rilievi, 11 decisioni · Priorità: 1 (sette spec ne citano le API) · Sforzo: L · Dipende da: MOB-01 (ritirata il 2026-10-10, in develop dal 2026-10-10, PR #448; PERF-12, PERF-14, PERF-02 e PERF-03
> sono in develop e ritirate) · Sblocca: MOB-03..08

## 1. Il problema, misurato

Censimento 2026-09-26 a 390×844: ogni pagina con dati apre con il verdetto e l'inizio di UNA tessera, poi 2–5 schermate.
**Hall of Fame**: 3,43 schermate, 5 tessere (1 sopra la piega, 0 intere), 49 cifre (17 sopra la piega); 2,17 a 768, 2,85
a 1024 (il mirror; il valore di partenza del budget è quello di `doc/mobile/budget.json` sul fixture `census@example.com`, README § 3.1). Le primitive di oggi (righe del 2026-09-26, da riverificare):

- `components/ui/tile.tsx:50-75`: `Tile` sempre aperta; eyebrow `<h3>` (`:66`); l'aside può essere un controllo
  (`components/hall-of-fame/tiles/NoteTile.tsx:31`); `TILE_CELL_CLASS = 'flex min-w-0 [&>section]:flex-1'` (`:42`) stira
  la tessera sulla sua traccia.
- `components/ui/page-verdict.tsx:24-42` stampa tutta la `sentence`; `lib/utils/narrative.ts:22-26` non dice dove finisce
  la prima frase (e le cifre hanno punti).
- `components/ui/error-notice.tsx:43-44`: `role="alert"` per istanza, tre letture fallite = tre annunci; ha già una prop
  `compact` (toglie la rassicurazione), da non confondere con `sections.compact`.
- `components/layout/PageTabBar.tsx:94`: tab della pill 38×32 (CLAUDE.md § Known Issues).
- Radix `CollapsibleContent` (v1.1.12) mette `hidden: !isOpen` e smonta i figli da chiuso
  (`node_modules/@radix-ui/react-collapsible/dist/index.mjs:128`, `:136`): niente transizione di chiusura; il trigger
  stende le props dopo `aria-controls` (`:64`, `:69`).
- `lib/hooks/useMediaQuery.ts` è `useSyncExternalStore` dal 2026-09-28 (PERF-02): `false` sul server e durante
  l'idratazione, il valore vero subito dopo; un componente montato DOPO il login lo legge già al primo render.
- Le pagine riordinano il telefono con `order-*` (`app/dashboard/hall-of-fame/page.tsx:420-507`, `order-1…5
  desktop:order-none`, qui già nell'ordine del DOM): README § 9, decisioni 1 e 11, lo vietano: l'ordine del DOM è
  l'ordine di lettura su ogni larghezza.

## 2. Obiettivo misurabile

- `npm run mobile:budget`, `hall-of-fame` a 390: `screens` dal valore che `doc/mobile/budget.json` registra dal 2026-10-10
  (fixture `census@example.com`, README § 3.1 e § 9, 6 e 10) a **≤ 2,0**, una tessera aperta, `budget.json` stretto con
  `mobile:budget -- --tighten` nello stesso commit; `figuresOutsideVerdict` registrato (LA tessera compresa, 16) e
  `firstClosedRowAbovePill: true` (README § 9, 4 e 25: cede il grafico, poi le azioni in fondo; se non basta `raisedBy`, 19).
- Ogni tab della pill ≥ 44×44 sotto `desktop:` (22: le pagine a tab crescono di ~12 px, `raisedBy: "MOB-02: pill a 44 px"`).
- A 1440 Hall of Fame è quella di oggi salvo la punteggiatura del verdetto (§ 4.7) e le `order-*` tolte (che a 1440
  erano già `desktop:order-none`).
- In Playwright: ordine del DOM = ordine verticale, pannello chiuso vuoto, memoria dopo il reload, reduced motion senza transizioni.
- `npm run perf:census -- --mobile --scenario=hall-of-fame`: aprire una riga ri-renderizza quella sezione, `PageRest` e
  `HallOfFamePage` (che tiene il controller), nessun'altra tessera né `PageVerdict` né `VerdictStrip`.
  `scripts/perfRenderCensus.mjs` ha oggi `settings`, `allocation`, `expense`, `tabs`, `asset`, `mount` e `nav`
  (`--route=` serve solo a `mount`, `--mobile` porta il viewport a 390×844, doc/guide/velocita.md § Il census): questa
  spec aggiunge `hall-of-fame`, un tap su un trigger chiuso sul modello di `tabs`, e lo documenta nell'intestazione dello
  script e in velocita.md.

## 3. Non-obiettivi

- B e C; il desktop oltre § 4.7; lo skeleton. Le altre pagine (MOB-03..07): Hall of Fame esce di qui già composta, azioni
  in fondo comprese (README § 9, 25); MOB-06 per lei fa solo censimento e guida. Il tablet a colonne: MOB-08. DESIGN.md:
  MOB-09 (qui le regole sono proposte).
- Dove sta l'asse sotto `desktop:` è deciso (README § 9, 2 e 12): lo slot `axis` di `PageVerdict`, scritto qui (§ 4.1,
  § 4.3) e usato da MOB-04..07. I formati e i campi della striscia sono tutti qui (§ 4.1): nessuna spec di pagina tocca
  `verdictStrip.ts`.

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
| idem | `parseStoredSections`, `serializeSections` | `(raw: string \| null) => string[] \| null` (`null` per tutto ciò che non è un array di stringhe); `(ids) => string` (JSON ordinato, unico) |
| idem | `resolveOpenSections` | `({ stored, known, defaults, failed, dismissed }) => Set<string>` |
| idem | `nextSectionsForAll` | `(current: ReadonlySet<string>, known: readonly string[], open: boolean, restId: string) => string[]` (ciò che `setAll` scrive: `restId` resta com'era) |
| idem | `sectionTriggerId`, `sectionPanelId`, `VERDICT_REST_SECTION` | `` `${id}-trigger` ``, `` `${id}-panel` ``, `'perche'` |
| `lib/utils/statesNarrative.ts` | `describeFailedSections` | `(eyebrows: readonly string[]) => string \| null` |
| `lib/hooks/useCompactLayout.ts` | `useCompactLayout` | `() => boolean` — `useMediaQuery('(width < 1440px)')` |
| `lib/hooks/useMobileSections.ts` | `useMobileSections` | `({ route, tab?, sections: readonly SectionSpec[], defaultOpen?, restId? }) => MobileSections` |
| idem | `SectionSpec`, `MobileSections` | `{ id; eyebrow; failed? }`; `{ compact; collapse(id): TileCollapse \| undefined; reveal(id); allOpen; setAll(open); announcement: string \| null }` |
| `components/ui/tile.tsx` | `TileCollapse` | `{ id; open; mounted; failed; onOpenChange(open: boolean) }` |
| idem | `Tile` | `+ collapse?: TileCollapse; asideWhenClosed?: string` (con `collapse` l'id della `section` è `collapse.id`: passare anche `id` è un errore di tipo, union discriminata); `LIFTED_FIGURE_CLASS = 'max-tablet:hidden'` |
| `components/ui/page-verdict.tsx` | `PageVerdict` | `+ axis?: ReactNode; strip?: ReactNode; scope?: ReactNode; restCollapse?: TileCollapse` |
| `components/ui/verdict-strip.tsx` | `VerdictStrip` | `{ figures: readonly StripFigure[]; onOpen(section: string): void; eyebrows?: Readonly<Record<string, string>> }` |
| `components/ui/page-rest.tsx` | `PageRest` | `{ sections: MobileSections; className?: string }` |
| `components/ui/error-notice.tsx` | `ErrorNotice` | `+ collapse?: TileCollapse; live?: boolean` (default `true`) |
| `app/globals.css` | `--ease-spring` | classe `ease-spring`, 300 ms (§ 4.2) |
| id di sezione | convenzione | `<pagina>-<slug>`: `hof-anni`; una tessera di pagina che solleva accetta `liftedFigures?: readonly K[]` ed esporta `isXLiftedBlock(b: string): b is K` per filtrare `liftedBlocks` |
| LA tessera | convenzione | sotto `desktop:` il suo grafico è alto 120 px (`max-desktop:min-h-[120px]`, o una variabile CSS dove l'altezza è inline), sempre, non condizionato; a 1440 l'altezza di oggi (README § 9, 4); l'eroe di LA tessera non si solleva mai (24) |

**Precisazioni del contratto** (revisione di coerenza del 2026-09-26, rilettura del 2026-10-10; valgono per MOB-03..08):

- `formatStripFigure` senza `decimals`: euro compatti (0 decimali, come `cachedFormatCurrencyEUR(v, true)`), percentuali
  a 1 decimale; `'approx-currency'` «~1234 €» (`TettoTile.tsx:110`, MOB-04), `'points'` «+1,2 pt» (`formatPoints`,
  `RendimentoTile.tsx:48-51`, MOB-05), `'pp'` «3,4 pp» (`allocazioneNarrative.ts:50-52`, MOB-07), `'ratio'` due decimali
  con la virgola senza unità («1,67»), `'rank'` ordinale con «°» («3°», come `ordinal` di `hallOfFameNarrative.ts`). Un
  selettore passa `decimals` quando la frase o la tessera che la cella ristampa ne usa altri (MOB-03, MOB-06, MOB-07; i
  decimali variabili di Monte Carlo li calcola il selettore): lo decide il test d'identità.
- **Il segno**: `'currency'` e `'approx-currency'` stampano un negativo con «−» U+2212 davanti all'importo assoluto (The
  Comma Rule, DESIGN.md), mai il `-` di Intl (`cachedFormatCurrencyEUR(-83, true)` dà «-83 €», U+002D); `'signed-*'`
  usano «+»/«−». **Lo zero è senza segno** («0 €», «0,0%», la regola `isPrintedZero` di `hallOfFameNarrative.ts:41-46`):
  README § 9, 20; MOB-03 e MOB-06 allineano `overviewNarrative` e `patrimonioNarrative`, che oggi stampano «+0,00 €».
- `leadLength: 0` = `lead` vuoto (solo il titolo sopra la striscia); `undefined` = nessun taglio. Mai `if (!m.leadLength)`.
  Con `rest` vuoto `restLabel` è `null`, `PageVerdict` non rende «Il perché» e la prima frase è tutto il paragrafo: un
  builder mette `leadLength` solo se il seguito ha almeno un segmento.
- `route` di `mobileSectionsKey` = il segmento sotto `/dashboard/` (`hall-of-fame`, `assets`, `performance`, `cashflow`,
  `analisi`, `history`, `allocation`, `pension`, `fire-simulations`); la Panoramica, che non ne ha, usa `panoramica`.
- Nelle chiamate il valore della larghezza si scrive `sections.compact` per intero (`live={!sections.compact}`), mai una
  variabile locale `compact`: `ErrorNotice.compact` esiste già e toglie la rassicurazione.
- `opens` nomina una riga del controller, `VERDICT_REST_SECTION`, oppure LA tessera: in quest'ultimo caso la pagina
  gestisce l'id nel suo `onOpen` senza `reveal` (MOB-03: cambia la finestra della curva) e passa l'id di LA tessera
  nell'elenco di `validateStrip`; `reveal` resta solo per le righe del controller. `validateStrip` rifiuta cinque celle,
  un `opens` ignoto o doppio, e una cella `null` senza `reason`.

### 4.2 La riga chiusa (The Closed-Row Rule, proposta)

`useCompactLayout` = `useMediaQuery('(width < 1440px)')` (`lib/hooks/useMediaQuery.ts`, server `false` dal 2026-09-28), non un secondo store: è la query
di `max-desktop:` in Tailwind 4.3 (`max-width: 1439px` scoprirebbe le larghezze frazionarie dello zoom). Se `!compact`,
`collapse(id)` è `undefined`: la `Tile` di oggi. Con `collapse`: Radix `Collapsible` + `CollapsibleTrigger asChild`
(AGENTS § Motion), **non** `CollapsibleContent` (§ 1); `aria-controls` esplicito.

- `<section id={collapse.id} aria-label>` → `<h3>` → `<button id={sectionTriggerId(id)} aria-expanded aria-controls={sectionPanelId(id)}>`
  (scritto DOPO lo spread di Radix, che altrimenti mette il suo `contentId`) a tutta larghezza, `min-h-[52px] px-5 active:bg-muted`:
  eyebrow, `asideWhenClosed` da chiusa (parole: «per mese», «3 note»; mai un importo né un conteggio di cifre), chevron.
  Da aperta l'`aside` (testo o controllo) sta fuori dal bottone, come la Tile di oggi. È la forma che il censimento riconosce (`isClosedRow` in `scripts/mobileCensus.mjs`):
  `section.rounded-2xl[id]` → `h3 > button[aria-expanded][aria-controls=<id>-panel]`.
- Pannello `<div id={sectionPanelId(id)} data-state inert={!open}>`, senza `role` (la `section` ha già `aria-label`,
  `tile.tsx:52-54`: è lei la region; un `role="region"` per pannello raddoppierebbe le landmark, fino a 16 sulla
  Panoramica): `grid motion-safe:transition-[grid-template-rows] motion-safe:duration-300 motion-safe:ease-spring`,
  `grid-rows-[0fr]`↔`[1fr]`, figlio `min-h-0 overflow-hidden` (`DriverTile.tsx:161-162` ha solo `overflow-hidden`: qui
  serve anche `min-h-0`, perché il figlio di una griglia a `0fr` con contenuto alto non si comprime sotto il suo
  min-content), il padding su un NIPOTE (sul figlio resta visibile a `0fr`); il chevron con la stessa curva.
- **Il pannello c'è, il contenuto no** (come `PageTabs`, AGENTS § Navigation): `reading` e `children` montano con `mounted`
  (aperta ora o già in questa visita, scritto nel gestore) e restano alla chiusura. Il chunk di un grafico pigro (`lazyComponent`, `components/ui/lazy-component.tsx`) aspetta.
  Se il focus è dentro un pannello che si chiude (dal trigger o da «Chiudi tutte»), torna sul suo trigger
  (`focus({ preventScroll: true })`).
- `collapse(id)` è lo STESSO oggetto finché la sua sezione non cambia, o il compiler ri-renderizza ogni tessera a ogni
  tap. **Come**: la cache per id sta in uno stato del hook (`useState<Map<string, TileCollapse>>`) e si aggiorna DURANTE il
  render col pattern (3) di AGENTS § Motion: si calcola la mappa nuova riusando l'oggetto di ogni id i cui
  `open`/`mounted`/`failed` non sono cambiati e, se differisce, `setCache(next)` prima di ogni return; gli `onOpenChange`
  nascono una volta per id nell'inizializzatore pigro e chiamano solo setter stabili. Mai una cache in `useRef` letta nel
  render (`react-hooks/refs`). Lo prova `perf:census -- --mobile --scenario=hall-of-fame` (§ 2).
- `failed`: eyebrow `text-destructive` + `AlertTriangle`, `sr-only` «, lettura fallita» (solo su una `Tile` con
  `collapse.failed`; non su un `ErrorNotice`, il cui eyebrow lo dice già, § 4.5).
- **Sotto `desktop:` la cella di una riga prende `max-desktop:self-start`**: a 768 due righe stanno affiancate
  (`page.tsx:437`, `:457`) e `TILE_CELL_CLASS` stirerebbe una chiusa accanto a una aperta fino a farne una card vuota; così
  una riga chiusa resta alta quanto il trigger più i 2 px di bordo. MOB-08 decide poi le colonne del tablet.
- `--ease-spring: linear(0, 0.093 8.3%, 0.280 16.7%, 0.476 25%, 0.643 33.3%, 0.771 41.7%, 0.861 50%, 0.922 58.3%, 0.960
  66.7%, 0.982 75%, 0.994 83.3%, 1)` in `@theme inline` — la molla 400/35 (ζ≈0,875) su 300 ms. Niente `layout` di Framer.

**Cifre sollevate** (The Lifted-Figure Rule): il blocco ripetuto dalla striscia prende `LIFTED_FIGURE_CLASS` con la chiave
da `liftedBlocks(strip, section)` (una cella `null` non nasconde nulla). Si nasconde solo la cifra ripetuta, l'altra parte
del blocco resta; quando la cifra non ripetuta farebbe sforare il 5, il blocco si nasconde intero e la cifra passa nel
seguito di «Il perché» (README § 9, 17). Una lettura, una riga di classifica o un ledger non si sollevano mai (15).
Hall of Fame non solleva: le sue celle ripetono letture e righe di classifica, che restano intere; la prima prova dei
blocchi è MOB-03.

### 4.3 Il verdetto breve (The Binding-Clause Rule)

Additivo: `sentence` resta intera (70 riferimenti a `PageVerdictModel` in 29 file; email e PDF la leggono). Il builder mette
`leadLength` su un confine di frase e `restLabel`. `splitVerdict`: senza taglio `rest = []`; **un segmento `binding` oltre
il taglio annulla il taglio**. Un `PageVerdict` senza `restCollapse` (l'Assistente, `AssistantPageClient.tsx:534`, legge
lo stesso modello della Panoramica) stampa il paragrafo intero a ogni larghezza e ignora `leadLength` e `restLabel`.

**Un solo DOM in ordine di lettura, senza `order-*` né `max-desktop:contents`** (README § 9, 1 e 12):
`<h2>` → `axis` (sotto `desktop:`, `desktop:hidden`; a 1440 la pagina monta una seconda istanza dello stesso controllo al
posto di oggi, `hidden desktop:flex`, con la stessa prop di stato, come le `actions` di `PageHeader`) → `<div>` del
paragrafo (non `<p>`: contiene blocchi) con `<span>` della prima frase · `<ul>` della striscia (`desktop:hidden`) · `scope`
(reso a ogni larghezza quando passato: sotto `desktop:` dopo la striscia, a 1440 sotto il paragrafo; la pagina che lo
vuole solo sotto `desktop:` lo passa con `sections.compact`, README § 9, 13) · bottone «Il perché · {restLabel}»
(`min-h-11`, `aria-expanded`, `desktop:hidden`) · `<span id={sectionPanelId(restCollapse.id)}>` del seguito
(`NarrativeSegments`, `components/ui/narrative-text.tsx:29`; `max-desktop:hidden` da chiuso). A 1440 prima frase e seguito
sono due inline nello stesso blocco: il paragrafo di oggi, e lo spec a 1440 verifica che si leggano come un paragrafo.
«Il perché» sta nel controller: `useMobileSections` lo tiene con id `restId` (default `VERDICT_REST_SECTION`;
`<prefisso>-perche` dove più verdetti convivono nel DOM, MOB-04 § 4.1); `known` = gli id di `sections` più `restId`, così
la memoria lo ricorda come una riga; `collapse(restId)` è il `restCollapse` che la pagina passa a `PageVerdict` e che una
cella apre con `onOpenChange(true)`; `setAll` e `allOpen` lo saltano (`nextSectionsForAll`).

### 4.4 La striscia

`<ul aria-label="Le cifre del verdetto" class="desktop:hidden grid">`: 1–3 celle in riga, 4 in 2×2 sotto `tablet:`; una
cella il cui testo supera 9 caratteri prende una riga intera e le altre scendono (README § 9, 28). Cella = `<button
min-h-11>`: etichetta `TILE_SUB_EYEBROW_CLASS`, valore mono 22 px (18 in una cella sotto 110 px, `@container`), `sr-only`
«, apre {eyebrow}» (l'eyebrow della sezione, o quello che la pagina passa in `eyebrows[opens]` quando la cella non apre una
riga: MOB-03 «l'andamento da inizio anno»); `null` stampa `reason`, mai uno zero. `reveal(id)`: apre, `scrollIntoView`
(`auto` con reduced motion; `scroll-mt-24`), poi `focus({ preventScroll: true })` sul trigger; mai LA tessera. **Mai
ricalcolata**: `select<Page>Strip` legge solo il `*Summary` delle tessere, e § 7 prova il testo identico.

### 4.5 Il resto, la memoria, gli errori

`PageRest`, figlio della griglia subito DOPO la cella di LA tessera nel DOM (su ogni pagina), `desktop:hidden col-span-full`: `<h2 className={TILE_EYEBROW_CLASS}>Il resto della
pagina</h2>` + «Apri tutte»/«Chiudi tutte» (44 px; non tocca «Il perché»); fuori dal wrapper nascosto, `<p role="alert"
className="sr-only">` con `announcement`. **Ordine: una sequenza sola** (README § 9, 1 e 11). L'ordine del DOM è l'ordine
di lettura su ogni larghezza e nessuna classe `order-*` resta nella griglia: LA tessera è la prima cella, `PageRest` la
segue, poi le righe nel DOM di oggi; su Hall of Fame si tolgono `order-1…5` e `desktop:order-none`. Una pagina con zero
righe non rende `PageRest`.

**Memoria**: store a modulo come `contexts/ColorThemeContext.tsx:40-71`, `useSyncExternalStore(subscribe, () =>
localStorage.getItem(key), () => null)`: snapshot = stringa grezza, parse in `useMemo`; qui la chiave è
`mobile-sections:hall-of-fame`. Lettura e scrittura dentro `try/catch`: lo snapshot che lancia vale `null`; la scrittura
fallita (quota piena, Safari privato, storage bloccato) aggiorna una `Map` in memoria del modulo, letta dallo snapshot
prima di localStorage, e notifica comunque gli iscritti: la riga si apre, la memoria si perde al reload
(`StrumentiTile.tsx:116-130` è il precedente). Si scrive solo a un gesto (`null` = mai toccata). `resolveOpenSections` =
`((stored ?? defaults) ∩ known) ∪ (failed − dismissed)`: una lettura fallita si apre a ogni visita; chiusa dal lettore
va in `dismissed` (non persistito). LA tessera non è nel controller e non si chiude (21). Hall of Fame: `defaultOpen`
vuoto, tutte e quattro le righe chiuse alla prima visita. La chiave è per dispositivo, non per utente né per owner
(README § 9): un co-titolare o la demo sullo stesso browser ereditano le righe aperte, voluto.

**Errori** (da C): `failed` dall'`isError` della pagina. **Con `collapse`, `ErrorNotice` È la riga**, con la stessa struttura
della Tile (`<section id rounded-2xl>` → `<h3>` → trigger con `aria-controls`): il trigger stampa `notice.eyebrow`
(«Benchmark · lettura fallita», `statesNarrative.ts:94`) in `text-destructive` con `AlertTriangle`, senza `sr-only`
aggiuntivo; messaggio, rassicurazione e «Riprova» stanno nel pannello. Sotto `desktop:` il solo nodo live degli errori è
di `PageRest` (`live={!sections.compact}`; il `role="status"` di `freshness` nel `PageHeader` resta):
`describeFailedSections` → «Una sezione non è stata letta: Benchmark.» / «2 sezioni non sono state lette: Benchmark,
Contributi.» / `null`; `announcement` è `null` se `!compact`: a 1440 nulla cambia. Hall of Fame ha un solo payload: con la
lettura fallita non rende né `PageRest` né `announcement`, come oggi.

### 4.6 `PageTabBar`

Pill (`PageTabBar.tsx:83-107`): `min-h-11 min-w-11 justify-center` (la pill da ~40 a 52 px); `layout="size"` resta.
`budget.json` si allarga a mano per le sole metriche mosse delle pagine a tab, con `raisedBy: "MOB-02: pill a 44 px"` e
una riga in README § 3.1 (README § 9, 22).

### 4.7 Hall of Fame, la pagina campione

LA tessera = **Record del patrimonio** (`app/dashboard/hall-of-fame/page.tsx:428`): sotto `desktop:` il grafico
(`components/hall-of-fame/RecordBars.tsx:36`, `minHeight = 130`; in `RecordPatrimonioTile.tsx:79-83` con `max-h-[300px]
flex-1`) scende a 120 px, il podio resta a cinque righe. Le due azioni «Aggiungi una nota» e «Aggiorna i record»
(`page.tsx:416`, `grid grid-cols-2 gap-2 desktop:hidden`) scendono dopo il «Dettaglio» sotto `desktop:` (README § 9, 25);
se la prima riga chiusa resta sotto la pill, `firstClosedRowAbovePill` si registra `false` con `raisedBy` (19). Righe,
nell'ordine del DOM di oggi (che coincide con l'ordine mobile): `hof-entrate` («per mese»), `hof-risparmio`
(«entrate − spese»), `hof-anni` («crescita del patrimonio»), `hof-note` (`describeClosedNotesAside(summary: NotesSummary)
=> string`, che conta `summary.total`: «nessuna nota» / «una nota» / «N note»); poi il «Dettaglio», com'è.
`RecordBoardTile` e `NoteTile` inoltrano `collapse` e `asideWhenClosed`. Verdetto (`lib/utils/hallOfFameNarrative.ts:162-184`):
la prima frase chiude dopo la cifra del record («in un mese» solo con la percentuale, `:163-165`), il seguito diventa frase
(«Il 2026 è finora…»; senza anno «Agosto è oggi…»), `restLabel` «l'anno e il mese in corso» (o uno dei due); senza anno
né mese in corso il seguito è vuoto e `leadLength` resta `undefined`; nessun `binding`; anche a 1440 «; il» → «. Il»
(README § 9, 5). `selectHallOfFameStrip`: «Quest'anno» (`annual:growth` `current.value`, `signed-currency`, apre
`hof-anni`; `null` con `reason` «in calo quest'anno» se l'anno in corso sta in `annual:decline`, «non ancora misurato»
altrimenti — a gennaio senza snapshot, o senza classifica; la cifra è quella del seguito del verdetto, `:172`, non di
`describeYearRecords`, e può ricomparire nel paragrafo aperto, README § 9, 8); «Entrate record» (`monthly:income`
`top.value`, `currency`, `hof-entrate`; `null` con `reason` «nessuna entrata registrata»); «Risparmio record»
(`monthly:savings` `top.value`, `signed-currency`, `hof-risparmio`; `null` con `reason` «arriva con il prossimo
aggiornamento» se la classifica manca, documenti precedenti al 2026-08-25, o «nessun mese con entrate»). Le tre celle
ripetono la lettura delle righe e la prima riga della loro classifica, che restano intere (15). Vuoto, caricamento,
lettura fallita: come oggi. Il tipo `loan` (2026-10-10) non tocca la pagina: legge classifiche già scritte.

### 4.8 Conflitti con PERF

- **PERF-12** (in develop dal 2026-10-06, AGENTS.md § Motion): `useSyncExternalStore`, nessun ref restituito, `mounted` nel gestore. **PERF-14** (in develop dal 2026-10-08, AGENTS.md § Motion, doc/guide/temi.md): nessun `layout`; un
  grafico montato all'apertura legge `ChartColorsProvider`. **PERF-04** (in develop dal 2026-09-30): un grafico lazy riserva la sua altezza, il `fallback` di `lazyComponent` (obbligo
  di MOB-03..07). **PERF-03** (in develop dal 2026-09-30): «Aggiornato alle…» NON è uno slot della composizione — sta nel
  `PageHeader` (desktop: dopo la descrizione; sotto `desktop:` al posto della descrizione, `[data-freshness]`,
  decisione del proprietario), quindi nessuna riga da riservare fra la prima frase e la striscia (doc/guide/stati.md § The
  fourth reading). **PERF-02** (in develop dal 2026-09-29): server `false`, già così in `lib/hooks/useMediaQuery.ts`.
- **Il budget della prima schermata** (`doc/mobile/budget.json`, doc/guide/prima-schermata.md): le pagine a tab crescono di ~12 px: `raisedBy` sulle voci mosse (§ 4.6). `Tile`, `PageVerdict` ed
  `ErrorNotice` entrano in ogni route e nella landing (`app/page.tsx:42-44`): `perf:budget` prima e dopo (§ 11).

### 4.9 Decisioni (README § 9)

Tutte le domande di questa spec sono chiuse: (1) il podio conta nel ≤ 5, LA tessera compresa (16); (2) LA tessera non si
chiude mai (21); (3) il verdetto in due frasi anche a 1440 (5); (4) +12 px con `raisedBy` (22); (5) le cifre della striscia
contano fuori dal verdetto (`figuresOutsideVerdict`, doc/guide/prima-schermata.md); (6) cede il grafico, poi le azioni in fondo, poi `raisedBy` (4, 19, 25);
(7) «Quest'anno» può ricomparire in «Il perché» (8); (8) una sequenza sola, il DOM di oggi (1, 11); (9) lo slot `axis`
subito sotto il titolo, due istanze a 1440 (2, 12); le celle possono ripetere letture e classifiche (15); lo zero senza
segno (20).

## 5. File da toccare

- I file di § 4.1 (nuovi: `verdictStrip.ts`, `mobileSections.ts`, i due hook, `verdict-strip.tsx`, `page-rest.tsx`;
  estesi: `narrative.ts`, `statesNarrative.ts`, `tile.tsx`, `page-verdict.tsx`, `error-notice.tsx`, `globals.css`);
  `components/layout/PageTabBar.tsx`.
- `app/dashboard/hall-of-fame/page.tsx`, `components/hall-of-fame/tiles/{RecordBoardTile,NoteTile,RecordPatrimonioTile}.tsx`,
  `components/hall-of-fame/RecordBars.tsx`, `lib/utils/{hallOfFameSummary,hallOfFameNarrative}.ts`.
- `scripts/perfRenderCensus.mjs` (scenario `hall-of-fame`); `perf/budget.json` solo se un tetto sale.
- `e2e/mobile-composition.hof.mobile.spec.ts` (nuova), `e2e/{hall-of-fame.hof.mobile,hall-of-fame.hof,cashflow.mobile}.spec.ts`;
  `__tests__/{narrative,mobileSections,verdictStrip}.test.ts` (nuovi) e `__tests__/{hallOfFameSummary,hallOfFameNarrative,statesNarrative}.test.ts`;
  `doc/mobile/budget.json`.

## 6. Passi

1. Branch, guide, `mobile:census` PRIMA (fixture). 2. Le pure e i test, falsificati. 3. Hook e componenti.
4. Hall of Fame. 5. Playwright, lint, `perf:census`, `perf:budget`. 6. `mobile:census`/`mobile:budget -- --tighten`, giro, documentazione, commit.

## 7. Test e falsificazione

- `__tests__/narrative.test.ts`: `splitVerdict` senza taglio, a metà, oltre la fine, con `binding` oltre il taglio (tutto
  `lead`; falsificare togliendo quel ramo), con `leadLength: 0` (`lead` vuoto; falsificare con `if (!leadLength)`), con
  `rest` vuoto (`restLabel` `null`, «senza seguito, niente bottone»).
  `__tests__/mobileSections.test.ts`: chiave con/senza tab, JSON rotto, `'{}'` e `'[1]'` → `null`, id ignoti scartati,
  `restId` in `known`, `failed` aperta contro la memoria, `dismissed` (falsificare togliendo `∪ failed`);
  `nextSectionsForAll` lascia `restId` com'era (falsificare includendolo); uno storage che lancia → snapshot `null` e
  scrittura in memoria. `__tests__/verdictStrip.test.ts`: tutti e nove i formati, segni (−83 → «−83 €» U+2212;
  falsificare con `cachedFormatCurrencyEUR(v, true)` diretto), zero senza segno, `null`, i default e `decimals`;
  `validateStrip` (5 figure, `opens` ignoto o doppio, `null` senza `reason`); `liftedBlocks` (una cella `null` non
  solleva: falsificare togliendo il filtro sul `null`); `formatStripFigure` con `value: null` → `null` (falsificare
  restituendo «0 €»).
- `hallOfFameSummary.test.ts` — per ogni cella, `narrativeToText([formatStripFigure(f)])` compare identico nella frase che
  la stampa (`describeIncomeRecords`, `describeSavingsRecords`; «Quest'anno» nel `sentence` del verdetto); le tre `reason`;
  falsificare con l'euro non compatto. `hallOfFameNarrative.test.ts` — attese di `:100-143` in due frasi (anche senza
  percentuale e senza anno), `lead` chiude con «.», `leadLength` assente senza seguito, `describeClosedNotesAside`;
  falsificare lasciando «; il». `statesNarrative.test.ts` — `describeFailedSections` a 0, 1, 2 (falsificare con il
  singolare fisso).
- **`e2e/mobile-composition.hof.mobile.spec.ts`**, progetto `hof-mobile`, fixture `hof` (il `.hof.` è obbligato: `mobile`
  ignora `/hof\./` e usa l'account base, `playwright.config.ts:199-200`; `hof-mobile` prende `/hof\.mobile\.spec\.ts/`,
  `:113`). `openPage` COPIATO da `e2e/hall-of-fame.hof.mobile.spec.ts:18-26` (non esportato; importare una spec ne
  registra i test), con `page.getByRole('heading', { level: 2 }).first()`: `PageRest` aggiunge un secondo `h2` sotto
  `desktop:` (lo spec di oggi si corregge allo stesso modo). Lo spec fissa l'orologio del browser al fixture
  (`await page.clock.setFixedTime(new Date('2026-09-15T12:00:00+02:00'))` prima di `page.goto`: `summarizeHallOfFame`
  legge «oggi» sul client, quindi settembre 2026 e il 2026 restano in corso anche dopo il 2026; se l'auth del client non
  regge l'orologio fisso, (5) si sposta in Vitest e la riga dice perché). (1) Prima schermata (sopra la pill): titolo,
  prima frase, le 3 celle ≥ 44 px (non il valore di «Quest'anno»), la lettura di LA tessera; nel DOM «Il resto della
  pagina», i 4 trigger `[id$="-trigger"]` (`hof-entrate`, `hof-risparmio`, `hof-anni`, `hof-note`) `aria-expanded="false"`
  («Il perché» non ha id `-trigger`), `#hof-anni-panel` `inert` e senza figli elemento, le due azioni dopo il Dettaglio;
  (2) «Anni» apre e richiude (0 px dopo 300 ms); (3) reload con due righe aperte, `localStorage` =
  `["hof-anni","hof-entrate"]`; (4) «Quest'anno» apre `hof-anni`, nel viewport, focus sul trigger; (5) «Apri tutte», «Il
  perché» resta `aria-expanded="false"`; (6) `reducedMotion: 'reduce'` → `transition-duration` 0s; (7) l'ordine del DOM
  delle sezioni coincide con l'ordine delle loro `y` a 390 e a 1440, nessun `[class*="order-"]` nella griglia; (8) nessuno
  sforamento di `main` (guardia di `e2e/fire.mobile.spec.ts`). Rossi falsificando: (1) contenuto montato da chiuso;
  (2) padding sul figlio; (3) nessuna scrittura; (4) `reveal` senza focus; (5) `setAll` che include `restId`;
  (6) `transition` senza `motion-safe:`; (7) un `order-1` rimesso su una riga; (8) una cella `min-w-[420px]`.
- `hall-of-fame.hof.mobile.spec.ts:94` apre «Anni» prima di misurare e usa `.first()` sull'`h2`. `hall-of-fame.hof.spec.ts`
  (1440): nessun `[id$="-trigger"]` nella griglia (il «Dettaglio» ha il suo `aria-expanded`), striscia e «Il resto»
  invisibili, paragrafo intero letto come un paragrafo, uno `scope` passato è visibile (falsificare ignorando `compact`).
  `cashflow.mobile.spec.ts`: ogni `role="tab"` visibile ≥ 44×44 (falsificare togliendo `min-h-11`).
- L'eyebrow rosso nel browser vuole una lettura per tessera via `/api/*` (`page.route` → `abort`,
  `e2e/settings.spec.ts:143`): Hall of Fame non ne ha; lo provano MOB-04 (Dividendi), MOB-05 (Benchmark) e MOB-07 (Esposizione).

## 8. Collaudo guidato

- A: `hall-of-fame.hof.spec.ts`, le spec delle pagine a tab, Vitest nei due fusi. C: § 7.
- F (mirror; DevTools a 390 sul portatile, README § 9, 56): 1) la prima schermata dice il record e mostra le righe;
  2) aprire e chiudere, anche con «Riduci movimento»; 3) reload; 4) le tre celle; 5) le tab di Cashflow col pollice e
  Hall of Fame a 1440 come prima. G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Una spec che legge dentro una tessera chiusa a 390 non trova nulla: ogni MOB-03..07 rilegge le sue spec mobile.
- Il `<div>` del verdetto non è più un `<p>`: lo spec a 1440 verifica che prima frase e seguito siano letti come un
  paragrafo. L'override di `aria-controls` dipende da Radix 1.1.12.
- Rollback: `collapse` sempre `undefined` spegne tutto; il resto per lettera.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest» e § Current Status (i conteggi); § Known Issues: la voce del `PageTabBar` si toglie intera (lo
  `Switch` è chiuso dal 2026-10-08); § Key Files.
- AGENTS.md § Motion (la riga e perché non `CollapsibleContent`), § Accessibility (un nodo live), § Hierarchy, Density and
  Disclosure (`:733`: «Keep the DOM in the desktop order so Tab follows the eye; the phone re-orders with `order-*`» diventa
  «Keep ONE sequence: the DOM order is the reading order on every device; the desktop places cells with
  `desktop:col-start-*`/`row-start-*`, never with an `order` swap (2026-09-27, doc/mobile/README.md § 9)»); doc/guide/shell.md § Navigation.
- `doc/guide/hall-of-fame.md` § Composizione mobile (con le otto voci di MOB-09 § 4.4, che MOB-03..08 copiano) e
  § Playwright locators (sotto `desktop:` i livelli 2 sono il verdetto e «Il resto della pagina»: il verdetto si cerca
  per nome), `doc/guide/stati.md`, `doc/guide/e2e-emulatori.md`, `doc/guide/velocita.md` (§ Il census: lo scenario
  `hall-of-fame`; § Registro, se un tetto sale); `Draft Release Temp.md`; `doc/mobile/README.md` § 6 e § 3.1 (la riga
  `raisedBy` della pill). DESIGN.md no (MOB-09).

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-02-primitive-della-composizione.md: Tile chiusa/aperta (pannello
presente senza role, contenuto montato all'apertura, grid-template-rows con la molla linear()), il verdetto breve con
«Il perché» e gli slot axis/strip/scope in UN DOM senza order-* né contents, VerdictStrip, PageRest con «Apri tutte»,
la memoria per pagina, ErrorNotice come riga con un solo nodo live, PageTabBar a 44 px — applicate a Hall of Fame
(grafico a 120 px, azioni in fondo, order-* tolte), con i test Vitest delle pure e
e2e/mobile-composition.hof.mobile.spec.ts. La tabella di § 4.1 è un contratto per sette spec: non rinominare nulla.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § React Query and Derived State,
  § Motion, § Navigation, § Hierarchy, Density and Disclosure — la riga sugli order-* è superata da README § 9, 1 e 11,
  e la riscrivi tu in § 10 —, § Accessibility, § Performance tooling), CLAUDE.md
- Leggi doc/guide/hall-of-fame.md, doc/guide/stati.md, doc/guide/e2e-emulatori.md, doc/guide/velocita.md § Il census
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/mobile/README.md (§ 9 per intero: le decisioni 1–25 sono il contratto) e la spec MOB-02 per intero;
  DESIGN.md § 5 e § 6 (MAI rigenerarlo); doc/guide/prima-schermata.md (MOB-01 è ritirata: mobile:census, budget.json e il
  fixture census@example.com esistono)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; nessuna domanda è aperta (README
§ 9): se il codice ti mette davanti a una scelta nuova, chiedimela con lo strumento interattivo prima di toccare la pagina.
Chiusura: mobile:census e mobile:budget prima/dopo, --tighten sul fixture, raisedBy per la pill; tsc, lint 0, Vitest
in Europe/Rome e sotto TZ=UTC; le spec Playwright di § 7 con le falsificazioni viste rosse; npm run perf:census --
--mobile --scenario=hall-of-fame; npm run perf:build e npm run perf:budget -- --dist=.next-perf prima e dopo (da Git
Bash; un tetto superato si alza solo con raisedBy e una riga in doc/guide/velocita.md § Registro, con il mio OK); giro
guidato di 5 punti sul mirror, poi mirror:remove; la documentazione di § 10 (Draft Release Temp.md senza dati
privati) in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort xhigh.** È il contratto di sette spec e attraversa narrative, accessibilità, compiler e
memoria: un nome sbagliato qui si moltiplica per sette.
