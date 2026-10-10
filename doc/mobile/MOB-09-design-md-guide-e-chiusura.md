# MOB-09 — DESIGN.md, guide e chiusura

> Stato: da fare · riletta in modo adversariale il 2026-10-10: 27 rilievi, 6 decisioni · Priorità: 3 (chiude la serie; finché manca, DESIGN.md dice il contrario del codice) · Sforzo: M ·
> Dipende da: MOB-02..08 · Sblocca: —

## 1. Il problema, misurato

Righe del 2026-10-10 (MOB-02..08 possono spostarle: riverificare).

- `DESIGN.md:280` (§ 1 Key Characteristics) «desktop adds columns, never simplifies»; `:1397` (§ 6 Don't) «it does
  not simplify a desktop original»; `:684` (The Tile Grid Rule) «Below `desktop:` the grid collapses and the reading
  order is set explicitly with `order-*`», lo snippet `:528-532` porta `order-2 desktop:order-none` (README § 9, 1 e 11
  lo vietano); `:961` (pill di `PageTabBar`) «Tabs shrink to icon width», senza 44 px (`:866` è la `BottomNavigation`);
  `:496` (Page Verdict) «moves it under the verdict below that width» (README § 9, 2 e 12: lo slot `axis`); `:1071`
  (Collapsible with Framer Motion Height, Superseded) senza la riga chiusa.
- `.impeccable/design.json`: `narrative.keyCharacteristics[8]` e `donts[32]` ripetono verbatim le due frasi; `rules`
  ha 44 voci `{ name, body, section }` (la `[26]` è `:684`), nessuna delle quattro; `extensions.motion` senza
  `ease-spring` e con `spring-layout`, la cui molla non esiste più (`lib/utils/motionVariants.ts` non esporta
  `springLayoutTransition`; l'unica occorrenza del grep è il commento di `app/dashboard/page.tsx:271`); `components[]`
  descrive Page Verdict, Tile ed Error Notice («role=alert») come oggi; `extensions.breakpoints[1].purpose` dice
  «iPad Mini landscape (1024px) gets the mobile layout by design - never use lg:».
- `PRODUCT.md:9` «Mobile-first at 390px with desktop as an elevated variant». `CLAUDE.md` § Known Issues: la voce della pill
  «38×32» tolta da MOB-02 il 2026-10-10 (lo `Switch` chiuso dal 2026-10-08); 13.133 byte in LF il 2026-10-10 (da rimisurare alla chiusura) contro
  «well under 20.000»; `CLAUDE.md` § Current Status: «50 Playwright spec files (189 tests incl. 6 auth setups)»: MOB-02..08
  aggiungono 11 file e tre progetti. `README.md` utente: `:58` «tiles stack in one column» (Rendimenti), `:107` «tab
  navigation uses a dropdown on small screens» (FIRE), `:114` «at 390px the tiles stack with the plan last» (Monte Carlo).
- `AGENTS.md:733` «Keep the DOM in the desktop order so Tab follows the eye; the phone re-orders with `order-*` (Storico
  and Rendimenti are the worked examples)» (riscritta da MOB-02 il 2026-10-10: «Keep ONE sequence…» con l'elenco delle pagine che portano ancora `order-*`; qui si verifica che l'elenco sia vuoto).
- `grep -rn "Composizione mobile" doc/guide` → 0 oggi; MOB-02..08 ne scrivono una per pagina, ognuna a modo suo.
- `.impeccable/critique/`: 16 snapshot `closed: true` (2026-09-13 → 09-24) sulla composizione di PRIMA.
  `doc/mobile/README.md` § 6 tiene tutte le spec «da fare»: qui si chiude, una riga per spec con data e misura.
- `lib/firebase/config.ts:61-62` collega l'app degli emulatori a `127.0.0.1`: un telefono vero non entra (README § 9, 56).

## 2. Obiettivo misurabile

- `grep -n "never simplif\|does not simplify\|elevated variant\|re-orders with\|set explicitly with" DESIGN.md PRODUCT.md AGENTS.md .impeccable/design.json` → 0.
- Le quattro regole in DESIGN.md e in `narrative.rules`, corpo identico nei due versi: lo script di § 7 esce 0.
- `## Composizione mobile` nelle 20 guide di § 4.4, prima di `## Per-page blind spots`: le 18 guide di pagina con le
  stesse otto voci in grassetto, `impostazioni` e `assistente` con una frase «nessuna composizione, perché»;
  `tr -d '\r' < CLAUDE.md | wc -c` < 20.000.
- `npm run mobile:budget` verde su 19 superfici × 390/768/1024 sul fixture `census@example.com`, colonna «obiettivo» «sì»
  a 390 salvo Impostazioni (`target: false`) e le voci con `raisedBy` (README § 9, 19 e 22, elencate in README § 3.1);
  a 768/1024 l'obiettivo è il misurato di MOB-08 (16). Nessun'altra eccezione.
- `npm run test:e2e` intero verde (anche `hof-`/`analisi-`/`centri-`/`split-mobile`, `degraded-mobile` e i tablet di
  MOB-08), salvo `e2e/modal.origin.spec.ts` su un dev server freddo (doc/guide/dialog.md), che si rilancia da solo
  prima di attribuirlo.

## 3. Non-obiettivi

- Codice dell'app: un difetto trovato qui va nel backlog (critica aperta, riga in README § 6). B e C; il desktop.
- DESIGN.md oltre i passi elencati (MAI rigenerarlo).

## 4. Design

### 4.1 Il capitolo (testo da applicare verbatim, in inglese come il file; README § 9, 52)

Sottosezione nuova di § 5 fra «Tile Grid (12-Column Bento)» e «Modal»: `### Small-Screen Composition (below
desktop:)` — lo schema (verdetto → asse → striscia → scope → LA tessera → «Il resto della pagina» → righe), le quote
(riga 52 px, celle 44 px, la barra di 1024 a 53 px misurata da MOB-08) e le regole. `<data>` = la data del commit di
MOB-09, la stessa nelle quattro regole e nel sidecar:

> **The First-Screen Rule** (Composizione mobile, <data>). Below `desktop:` a page never stacks its desktop grid into
> one column. Its first screen is the verdict's headline — its first sentence too, unless that sentence would reprint
> two or more of the strip's cells (The Binding-Clause Rule) —, the page's axis right under the headline, a strip of at
> most four figures read from the tiles' own summaries (`select<Page>Strip`, never recomputed), and ONE open tile — the
> one that answers the page's question, always open, never a row; every other tile is a closed row under «Il resto della
> pagina», in ONE sequence: the DOM order is the reading order on every device, never a CSS `order` swap, and THE tile
> comes first in the DOM on the desktop too, where the grid places it with `desktop:col-start-*`/`row-start-*`
> (Patrimonio's Movimenti is the worked example). A page with nothing recorded keeps its empty state as on the desktop:
> no strip, no «Il resto della pagina» (The Absence-Has-Three-Names Rule); a «Dettaglio» disclosure stays below the
> rows as on the desktop. The budget is measured, not felt: at most five figures (€ and %) outside the verdict above
> the pill — the strip's cells included, at most four of them; the scope line counts as verdict —, and the first closed
> row above the pill (`npm run mobile:budget`, on the deterministic fixture, zero tolerance); when THE tile is tall its
> chart yields (120px below `desktop:`), never its reading, and a tile with no chart to yield declares its exception
> with `raisedBy`. Two corollaries. **The small screen shows less, never something else**: the same tiles, tokens,
> narratives, routes and tabs; a strip cell opens the section that explains it. A chart may change its drawing below
> the width where it stops being legible — the Flusso's Sankey becomes a share bar and ranked rows under 640px — never
> its figures or where a row lands. **One composition serves 390, 768 and 1024**: two columns from `tablet:`, an open
> row across both; three at most where the content is 960px wide or more (1024 landscape, a 12.9" iPad upright;
> `COMPACT_GRID_CLASS`, a container query under `max-desktop:`), THE tile on two and beside it only the closed rows that
> precede the first open one. `desktop:` stays the only switch.

> **The Lifted-Figure Rule** (Composizione mobile, <data>). A figure the phone has already printed — lifted into the
> strip, or in the verdict's first sentence — is not printed again by its tile on a phone: the PAGE hides that figure
> (`LIFTED_FIGURE_CLASS`, keyed by `liftedBlocks`), only that figure, and the rest of its block stays («… € da spostare»
> keeps its caption); when the figure left behind would push the first screen past five, the whole block hides and the
> figure joins the verdict's «Il perché» as a clause. The tile returns whole from `tablet:`. A reading, a ranking row and
> a ledger that adds up to the euro are never lifted, and THE tile's hero never is: a cell may repeat them. A cell that
> reads `null` hides nothing and prints its reason, never a zero; a signed zero prints bare («0 €»).

> **The Closed-Row Rule** (Composizione mobile, <data>). A closed row is still the tile: its material, its `<h3>` holding
> the eyebrow as a 52px button with `aria-expanded` and `aria-controls`, an aside in words («per mese», «nessuna nota» —
> never an amount, never a count of figures), a chevron. The panel is in the DOM, EMPTY and `inert`: the content mounts
> at the first open and stays, as an inactive `PageTabs` panel keeps its div and not its content — a closed row
> downloads no chart. It opens on CSS (`grid-template-rows` 0fr → 1fr on `ease-spring`, the 400/35 spring as `linear()`,
> 300 ms), never on Framer `layout`, and instantly under reduced motion; a strip cell opens its row, scrolls it into
> view and moves the focus to its trigger (`reveal`). Open rows are remembered per page and per tab, per device and
> browser (`mobile-sections:`), never synced and never per account; absent or unreadable storage means the page's
> defaults. **A failed read is never closed by the page**: its tile opens itself on every visit; closed by the reader,
> its eyebrow turns `--destructive` beside a warning icon, and one live node names the failed sections.

> **The Binding-Clause Rule** (Composizione mobile, <data>). On a phone the verdict is its headline and first sentence —
> or its headline alone, declared by the builder (`leadLength: 0`), when the first sentence would reprint two or more of
> the strip's cells (a cell in points or pp counts) —; the rest waits behind «Il perché», named by what it holds. A
> clause that changes the meaning of a printed figure — the tax behind a falling month, Rendimenti's measured base, the
> scheduled amount inside a total (The Scheduled-Is-Not-Spent Rule), the pension lock behind a FIRE number — is never
> behind a tap: the builder marks it `binding`, and a binding segment past the cut cancels the cut (`splitVerdict`) or
> moves the cut after it; or the clause becomes the scope line under the strip (`scope`, rendered at every width) or the
> caption of the figure («di cui 180 € già in calendario»), at every width. The headline is never truncated; the scope
> line sits outside every disclosure.

### 4.2 Le riscritture

- `:280` → «Mobile-first, composed: designed at 390px first; below `desktop:` a page shows less, never something else —
  the verdict, at most four figures, one open tile, the rest a tap away (The First-Screen Rule); desktop adds columns
  and opens every tile».
- `:1397` → «**Don't** squeeze the desktop into a column, nor give the small screen a second design (The First-Screen
  Rule). Mobile is the base and shows LESS — the same tiles, tokens and narratives, most of them closed rows — never
  something different: no mobile-only tile, figure, narrative or route. A chart may change its drawing below the width
  where it stops being legible, never its figures or where a row lands.» («narrative», non «wording»: il Flusso sotto i 640 px ha didascalie
  sue, che vengono da `analisiNarrative.ts` come ogni altra frase; proprietario, 2026-09-27.)
- `:684`: «Below `desktop:` the grid collapses and the reading order is set explicitly with `order-*` (the month's
  cashflow before the wealth split on a phone).» → «Below `desktop:` the grid collapses in DOM order, which is the
  reading order on every device — never a CSS `order` swap (one sequence, 2026-09-27) — and is composed (The
  First-Screen Rule): the first screen is chosen, not squeezed.»; lo snippet di `:528-532` perde `order-2
  desktop:order-none`; le classi della griglia nella regola e nello snippet diventano quelle di `COMPACT_GRID_CLASS`
  lette dal codice; «not a rule» e `:1379` («no scroll») restano. `:961`: «Tabs shrink to icon width, never under a
  44×44 target (`min-h-11 min-w-11`, `components/layout/PageTabBar.tsx`; `e2e/cashflow.mobile.spec.ts`).»; `:866` resta.
- Page Verdict, `:496` «and moves it under the verdict below that width» → «and below that width renders it in the
  verdict's `axis` slot, right under the headline and before the strip, inside the verdict's `section`, as a second
  instance of the same control (2026-09-27)», più un punto «Below `desktop:` the verdict is composed (The Binding-Clause
  Rule): headline · `axis` · first sentence · `strip` (`VerdictStrip`, at most four cells, a long cell on a row of its
  own) · `scope` · «Il perché · {restLabel}»; one DOM, no `order-*`, the paragraph whole at 1440 and the scope line under
  it.» Tile: un punto «Below `desktop:` a tile other than THE tile is a closed row (`collapse`, `asideWhenClosed`; The
  Closed-Row Rule), and a figure lifted into the strip wears `LIFTED_FIGURE_CLASS` (The Lifted-Figure Rule).» Error
  Notice, dopo «`role="alert"`»: «— on the desktop; below it the notice IS its closed row (`collapse`, `live={false}`),
  and the page's ONE live node (`PageRest`) names the failed sections.»
- `:1071`, in coda al paragrafo **Superseded (2026-09-06)**: «A tile's closed row below `desktop:` is NOT this pattern:
  it opens on CSS `grid-template-rows` with `ease-spring`, its chevron on the same curve and duration (see
  **Small-Screen Composition**, The Closed-Row Rule).»
- The Input Tile Rule: la frase «the desktop keeps the dominant chart tile on the left» diventa «on What If the input
  tile (Evento) is THE tile and comes first in the DOM on the desktop too (2026-10-10)» (README § 9, 43).
- Frontmatter: `components.tile-closed-row` (README § 9, 54): `backgroundColor`/`textColor` di `tile-default`,
  `rounded: "{rounded.2xl}"`, `height: "52px"`, `padding: "0 20px"`.

### 4.3 Il sidecar

Mai rigenerato né parafrasato: `keyCharacteristics[8]`, `donts[32]` e `rules[26].body` (`:684` cambia) verbatim dalle
righe nuove; quattro `{ name, body, section: "components" }` dopo «The Tile Grid Rule» (48 voci in tutto);
`components[]` Page Verdict, Tile, Error Notice: le `description` estese con le frasi nuove di § 4.2, gli `html` invariati
(mostrano la forma da `desktop:`); `extensions.motion` + `ease-spring` col `linear()` di `app/globals.css` (la motion si
legge dal CODICE) e la voce `spring-layout` TOLTA (la molla non esiste più); `extensions.breakpoints[1].purpose` → «The
only layout switch: below it every page uses the one small-screen composition (The First-Screen Rule) at 390, 768 and
1024 — iPad Mini landscape included; never use lg:.»; `generatedAt`. Lo script di § 7 prima e dopo, nei due versi.

### 4.4 Guide e AGENTS.md

- **`## Composizione mobile`** (corpo inglese, prima di `## Per-page blind spots`) in `panoramica`, `patrimonio`,
  `cashflow-{tracciamento,budget,divisione,dividendi,analisi}`, `centri-di-costo`, `rendimenti`, `storico`,
  `hall-of-fame`, `allocazione`, `previdenza`, ogni tab di FIRE nella SUA guida (`fire` il Calcolatore, `fire-coast`,
  `fire-what-if`, `fire-monte-carlo`, `fire-obiettivi`: una guida per pagina o tab, CLAUDE.md); `impostazioni`,
  `assistente`: una frase «nessuna composizione, perché». Otto voci in grassetto: LA tessera · la striscia (etichetta →
  campo del `*Summary` → sezione aperta) · i blocchi sollevati · le righe e il loro aside (nell'ordine del DOM) · le
  clausole `binding` e lo `scope` · le assenze · la chiave `mobile-sections:` (per device and browser, not per account;
  absent or unreadable → the page's defaults) · 768/1024 e le spec. MOB-09 le uniforma contro il codice, non le
  riscrive. In `cashflow-analisi` l'ultima voce nomina la soglia dei 640 px del Flusso, che la guida dichiara già dal
  2026-09-27; in `patrimonio` le righe per prestito (`patrimonio-mutuo-<loanId>`, un id cancellato cade da `known`).
- **Stub di AGENTS § 3**: «the mobile composition» nella riga «Il resto —» dei 14 stub di pagina (Panoramica, Patrimonio,
  Tracciamento, Analisi, Budget, Centri di Costo, Divisione, Dividendi, Storico, Hall of Fame, Rendimenti, Allocazione,
  Previdenza, FIRE); nessun punto nuovo negli stub, che restano di 3–4 voci (AGENTS § 0).
- **AGENTS § 4 Hierarchy, Density and Disclosure**: una riga di rimando a DESIGN.md → Small-Screen Composition (le quattro
  regole per nome, senza il testo: AGENTS non duplica DESIGN) e le tre trappole di codice, con la data di MOB-09 e
  `e2e/mobile-composition.hof.mobile.spec.ts` come test che le tiene: il pannello chiuso è vuoto (una spec apre la riga
  prima di leggere), la memoria si scrive solo a un gesto, nessun `order-*` (l'ordine del DOM è l'ordine di lettura;
  MOB-02 ha riscritto `:733`: qui si verifica). Prima `grep` di § Motion, § Accessibility e di doc/guide/shell.md
  § Navigation (MOB-02): si rimanda, non si duplica.

### 4.5 CLAUDE.md, PRODUCT.md e README.md

- Key Features, riga **Shell**: «below `desktop:` verdict · axis · strip · one tile · «Il resto della pagina» (DESIGN → The
  First-Screen Rule)». Known Issues: la voce «The `PageTabBar` pill stays below 44px on touch below 1440» si cancella
  intera — già tolta da MOB-02 il 2026-10-10 (la pill a 44×44, lo `Switch` dal 2026-10-08): nulla da fare.
  Latest: MOB-02..08 fuse in UNA voce. § Current Status: i conteggi Vitest e Playwright (file, test, progetti) riletti da
  `ls e2e/*.spec.ts` e dalla corsa intera.
- PRODUCT.md § Platform: «Mobile-first at 390px, composed below `desktop:` — the same tiles and narratives, a first
  screen of verdict, at most four figures and one open tile (DESIGN.md → The First-Screen Rule); one composition for
  phone and tablet», il resto com'è.
- README.md (Key Features): ogni riga «fully responsive … tiles stack in one column / at 390px the tiles stack / tab
  navigation uses a dropdown» (oggi `:58`, `:107`, `:114`; `grep -n -i "stack\|responsive\|dropdown" README.md`) diventa
  «below 1440px the page opens on its verdict, up to four figures and its main tile; the other tiles are a tap away»,
  con le parole di pagina della sua guida § Composizione mobile.

### 4.6 Le critiche Impeccable

Skill `impeccable`, critique dual-agent come Hall of Fame (390/768/1024 + 1440 di controllo), sul mirror e dal **Mac**
(README § 9, 57; WORKFLOW § Where things are recorded: path e fingerprint sono della macchina; il CRLF di Windows non
combacia), in un passo finale della stessa sessione. Nuove per Panoramica, Tracciamento, Rendimenti e Hall of Fame; le
altre dodici cancellate nello stesso commit (WORKFLOW: la critica di una superficie «since rebuilt» si cancella), rifatte da
`polish` in sessioni successive (README § 9, 53). Committate APERTE: si chiudono solo con `polish` (`critique-storage close
<target> <snapshot-file>`, due argomenti; fa fede `closed: true` nel file, non l'exit code), in una sessione successiva.

### 4.7 README e Draft

`doc/mobile/README.md`: § 6 una riga per MOB-01..09 (data, misura); § 3.1 la tabella del fixture nello stato finale; § 3
la tabella «dopo» del mirror accanto a quella del 2026-09-26, solo numeri aggregati.
`Draft Release Temp.md`: le voci di MOB-02..08 (Hall of Fame di MOB-02 compresa; MOB-01 non ne ha: il draft porta
solo cambiamenti visibili all'utente, WORKFLOW.md § Where things are recorded, 2026-10-10) riscritte nel loro stato
finale in ✨ New Features, una per pagina (README § 9, 55: Panoramica, Patrimonio,
ogni tab di Cashflow e di FIRE…), più una di 📚 Documentation; si ANTEPONE; se il file manca (tag tagliato) si ricrea dal
modello di WORKFLOW § Where things are recorded; cifre tonde inventate e nomi generici, mai del mirror.

### 4.8 Conflitti con PERF

- **PERF-14** (in develop dal 2026-10-08) ha scritto in DESIGN.md la riga «The cascade plays once per session» (→ Tile Grid)
  e ha tolto `springLayoutTransition` dalla frase delle molle (`:954`); il sidecar non l'ha toccato: MOB-09 rilegge,
  aggiunge accanto, toglie `spring-layout` (§ 4.3).
- **PERF-03** (in develop dal 2026-09-30, ritirata): DESIGN.md non nomina «Aggiornato alle…» (grep vuoto il 2026-10-10),
  quindi The First-Screen Rule non lo cita; la riga sta nel `PageHeader` (doc/guide/stati.md § The fourth reading) e il
  census aspetta che `[data-freshness]` sia vuoto (`readSettleState` in `scripts/mobileCensus.mjs`).
- **PERF-04**: «a closed row downloads no chart» regge sul grafico pigro di modulo, `lazyComponent` (AGENTS § Dynamic Imports
  and Module Hygiene): si rimanda lì, NON a «Deferred Chart Mount» (`:1277`, **Superseded (2026-09-06)**,
  parla del count-up). **`perf:serve`**: `mobile:budget` su :3200.

### 4.9 Decisioni (README § 9)

Tutte le domande di questa spec sono chiuse: il testo lo applica Claude verbatim dopo l'OK (52); quattro critiche nuove e
dodici cancellate (53); `tile-closed-row` nel frontmatter (54); una voce per pagina nel Draft (55); l'ordine del DOM è
deciso dal 2026-09-27 (1, 11) e la regola lo scrive; il giro F con DevTools (56); le critiche dal Mac (57); il budget
senza eccezioni oltre `raisedBy` (16, 19, 22).

## 5. File da toccare

- `DESIGN.md` (§ 1, § 5 Page Verdict/Tile/Error Notice/Tile Grid/Navigation/Collapsible, § 6, The Input Tile Rule, il
  frontmatter); `.impeccable/design.json`; `.impeccable/critique/*.md`.
- `doc/guide/*.md` di § 4.4; `AGENTS.md` (§ 3, § 4); `CLAUDE.md`; `PRODUCT.md`; `README.md`; `doc/mobile/README.md`;
  `Draft Release Temp.md`.

## 6. Passi

1. Branch; `git log` di MOB-02..08. 2. `mobile:census`/`mobile:budget` sul fixture `census@example.com` (`perf:build` +
`perf:serve`, :3200); sul mirror solo il census che dà i numeri aggregati della tabella «dopo» di README § 3 e il giro F.
3. Lo script di § 7 sul sidecar di oggi. 4. DESIGN.md dopo l'OK sul testo; il sidecar; lo script.
5. Guide, AGENTS.md, CLAUDE.md, PRODUCT.md, README.md. 6. Playwright intero. 7. README, Draft. 8. Le critiche (Mac); commit proposto.

## 7. Test e falsificazione

- **Script del sidecar** (usa-e-getta, nella scratchpad), nei due versi: ogni `body` di `narrative.rules` compare in
  DESIGN.md dopo `**<name>`; ogni `keyCharacteristics` e ogni `donts` compare; `narrative.rules` ha 48 voci e i quattro
  nomi «The First-Screen Rule», «The Lifted-Figure Rule», «The Closed-Row Rule», «The Binding-Clause Rule» stanno subito
  dopo «The Tile Grid Rule» con `section: "components"`. **A spazi normalizzati** (`/\s+/g` → « »): DESIGN.md è CRLF e
  sette corpi vanno a capo (Received-vs-Announced, Off-Axis…), e un `includes` letterale è rosso già oggi (7 su 44,
  provato il 2026-10-10; normalizzato 0). Falsificare: un carattere cambiato nel corpo della First-Screen Rule nel
  sidecar → rosso; una delle quattro voci tolta dal sidecar → rosso; ripristino con l'edit inverso (mai `git checkout --`).
- **Le guide**: `for f in $(grep -l '^## Composizione mobile' doc/guide/*.md); do awk '/^## Composizione mobile/{c=NR}
  /^## Per-page blind spots/{b=NR} END{exit !(c&&b&&c<b)}' $f || echo $f; done` → vuoto, e `grep -l … | wc -l` = 20; per
  le 18 guide di pagina ognuna delle otto etichette compare una volta nella sezione. Falsificare spostando la sezione dopo
  i blind spots in una guida: compare il suo nome.
- **`mobile:budget`**: il tetto `screens` di una superficie a 390 portato a `misurato − 1` → exit 1 con superficie e
  metrica; edit inverso.
- **Playwright**: nessuna spec nuova; un rosso si legge (`modal.origin`, doc/guide/dialog.md) prima di attribuirlo.
  `JSON.parse` del sidecar.

## 8. Collaudo guidato

- A: `npm run test:e2e` intero verde. C: § 7. F (mirror; DevTools sul portatile a 390 e 1024×768, README § 9, 56): 1) tre
  pagine contro le quattro regole; 2) una riga in errore con l'eyebrow rosso, provocata da uno script Playwright
  usa-e-getta che fa abortire una lettura; 3) la memoria dopo aver chiuso il browser; 4) una pagina a 1024 orizzontale;
  5) PRODUCT.md § Platform letto. G: `npm run mirror:remove`, lo script cancellato.

## 9. Rischi e rollback

- DESIGN.md toccato senza OK: l'edit inverso. Sidecar e prosa divergenti: si riallinea il sidecar, mai la prosa.
- CLAUDE.md oltre 20.000: fatti spostati nelle guide. Critiche scritte da Windows: si riscrivono dal Mac.

## 10. Documentazione da aggiornare

È la spec: § 4.1–4.7 in UN diff, più CLAUDE.md «Latest» con i numeri aggregati di `mobile:budget` e § Current Status
con i conteggi.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-09-design-md-guide-e-chiusura.md: chiudiamo la composizione
mobile nei documenti. Il capitolo «Small-Screen Composition» di DESIGN.md con le quattro regole (First-Screen,
Lifted-Figure, Closed-Row, Binding-Clause) nel testo di § 4.1, le riscritture di § 4.2 (never simplifies, order-*,
Page Verdict, Tile, Error Notice, Input Tile Rule, tile-closed-row nel frontmatter), SOLO con il mio OK sul testo, e
poi applicate da te verbatim; il sidecar .impeccable/design.json verbatim nei due versi; «Composizione mobile» in
ogni guida; AGENTS.md § 3 e § 4; CLAUDE.md; PRODUCT.md § Platform; README.md utente; le critiche Impeccable (quattro
nuove, dodici cancellate); doc/mobile/README.md § 6, § 3 e § 3.1; Draft Release Temp.md (una voce per pagina). Nessun
codice dell'app.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md (§ 2 e § Where things are recorded), AGENTS.md (§ 0, § 3, § 4 Motion, Navigation, Hierarchy,
  Density and Disclosure, Accessibility), CLAUDE.md
- Leggi DESIGN.md § 1, § 2 Named Rules, § 5 Page Verdict, Tile, Tile Grid, Navigation, Segmented Pill Control, Error
  Notice, Collapsible with Framer Motion Height, The Input Tile Rule, § 6 — MAI rigenerarlo
- Leggi le guide di § 4.4, il git log di MOB-02..08, doc/guide/stati.md § The fourth reading e le righe di PERF-14 in
  DESIGN.md (→ Tile Grid «The cascade plays once per session», la frase delle molle senza springLayoutTransition)
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md
- Leggi doc/mobile/README.md (§ 9: le decisioni 1–57), la spec MOB-09 per intero e i nomi delle API di MOB-02 nel codice (ritirata il 2026-10-10: `lib/hooks/useMobileSections.ts`, `lib/utils/{verdictStrip,mobileSections}.ts`, `components/ui/{tile,page-verdict,verdict-strip,page-rest,error-notice}.tsx`)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; nessuna domanda è aperta (README
§ 9): il testo di § 4.1 me lo mostri con lo strumento interattivo per l'OK prima di scrivere in DESIGN.md; nessuna
cifra del mirror; file CRLF: Edit o apply.mjs.
Chiusura: mobile:census e mobile:budget sul fixture (build :3200) e il census del mirror per la tabella «dopo»; lo
script del sidecar (spazi normalizzati, due versi) verde e visto rosso; npm run test:e2e intero (tutti i progetti,
anche i *-mobile per fixture, degraded-mobile e i tablet); tsc, lint 0, Vitest in Europe/Rome e sotto TZ=UTC (nessun
codice toccato: deve restare verde); critiche dal Mac; giro di 5 punti con DevTools, mirror:remove; CLAUDE.md «Latest»
e Draft Release Temp.md senza dati privati; tutto in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Documentazione estesa e meccanica, ma scritta in DESIGN.md: serve il registro delle
regole esistenti e il verbatim fra prosa e sidecar, non un ragionamento di dominio nuovo.
