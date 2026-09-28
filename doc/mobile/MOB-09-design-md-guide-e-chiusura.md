# MOB-09 — DESIGN.md, guide e chiusura

> Stato: da fare · Priorità: 3 (chiude la serie; finché manca, DESIGN.md dice il contrario del codice) · Sforzo: M ·
> Dipende da: MOB-03..08 · Sblocca: —

## 1. Il problema, misurato

Righe del 2026-09-26 (MOB-02..08 possono spostarle: riverificare).

- `DESIGN.md:280` (§ 1 Key Characteristics) «desktop adds columns, never simplifies»; `:1394` (§ 6 Don't) «it does
  not simplify a desktop original»; `:681` (The Tile Grid Rule) «Below `desktop:` the grid collapses»; `:958` (pill
  di `PageTabBar`) «Tabs shrink to icon width», senza 44 px (`:866` è la `BottomNavigation`); `:1070` senza la riga chiusa.
- `.impeccable/design.json`: `narrative.keyCharacteristics[8]` e `donts[32]` ripetono verbatim le due frasi; `rules`
  ha 44 voci `{ name, body, section }` (la `[26]` è `:681`), nessuna delle quattro; `extensions.motion` senza
  `ease-spring`; `components[]` descrive Page Verdict, Tile ed Error Notice («role=alert») come oggi.
- `PRODUCT.md:9` «Mobile-first at 390px with desktop as an elevated variant». `CLAUDE.md:116-119`: la rail «measured
  at 1440», la pill «38×32»; 19.190 byte in LF il 2026-09-27 (da rimisurare alla chiusura) contro «well under 20.000».
- `grep -rn "Composizione mobile" doc/guide` → 0 oggi; MOB-02..08 ne scrivono una per pagina, ognuna a modo suo.
- `.impeccable/critique/`: 16 snapshot `closed: true` (2026-09-13 → 09-24) sulla composizione di PRIMA.
  `doc/mobile/README.md` § 6 tiene tutte le spec «da fare»: qui si chiude, una riga per spec con data e misura.

## 2. Obiettivo misurabile

- `grep -n "never simplif\|does not simplify\|elevated variant" DESIGN.md PRODUCT.md .impeccable/design.json` → 0.
- Le quattro regole in DESIGN.md e in `narrative.rules`, corpo identico: lo script di § 7 esce 0.
- `## Composizione mobile` nelle 20 guide di § 4.4, con le stesse otto voci; `tr -d '\r' < CLAUDE.md | wc -c` < 20.000.
- `npm run mobile:budget` verde su 19 superfici × 390/768/1024, colonna «obiettivo» «sì» salvo Impostazioni (non-obiettivo)
  e le eccezioni registrate con l'OK del proprietario da MOB-02..08 (annotate in `doc/mobile/README.md`, MOB-01 § 4).
- `npm run test:e2e` intero verde (anche `hof-`/`analisi-`/`centri-`/`split-mobile` e i tablet di MOB-08), salvo gli
  intermittenti di CLAUDE.md.

## 3. Non-obiettivi

- Codice dell'app: un difetto trovato qui va nel backlog (critica aperta, riga in README § 6). B e C; il desktop.
- DESIGN.md oltre i passi elencati (MAI rigenerarlo); lo `Switch` 36×20 e `--muted-foreground` (sessione `temi.md`).

## 4. Design

### 4.1 Il capitolo (testo proposto, in inglese come il file)

Sottosezione nuova di § 5 fra «Tile Grid (12-Column Bento)» e «Modal»: `### Small-Screen Composition (below
desktop:)` — lo schema (verdetto → striscia → LA tessera → «Il resto della pagina» → righe), le quote (riga 52 px,
celle 44 px, la barra di 1024 misurata da MOB-08) e le regole:

> **The First-Screen Rule** (Composizione mobile, <data>). Below `desktop:` a page never stacks its desktop grid into
> one column. Its first screen is the verdict's headline and first sentence, a strip of at most four figures read from
> the tiles' own summaries (`select<Page>Strip`, never recomputed), and ONE open tile — the one that answers the page's
> question; every other tile is a closed row under «Il resto della pagina», in the desktop's DOM order and the phone's
> `order-*`. The budget is measured, not felt: at most five figures outside the verdict above the fold, the first
> closed row above the pill (`npm run mobile:budget`). Two corollaries. **The small screen shows less, never something
> else**: the same tiles, tokens, narratives, routes and tabs; a strip cell opens the section that explains it. A chart
> may change its drawing below the width where it stops being legible — the Flusso's Sankey becomes a share bar and
> ranked rows under 640px — never its figures or where a row lands.
> **One composition serves 390, 768 and 1024**: two columns from `tablet:`, an open row across both; three at most in
> landscape, the open tile on two. `desktop:` stays the only switch.

> **The Lifted-Figure Rule** (Composizione mobile, <data>). A figure lifted into the strip is not printed again by its
> tile on a phone — the variations footer, the market digest, the TWR hero: the PAGE hides that block
> (`LIFTED_FIGURE_CLASS`, keyed by `liftedBlocks`) and the tile returns whole from `tablet:`. A cell that reads `null`
> hides nothing and prints its reason, never a zero.

> **The Closed-Row Rule** (Composizione mobile, <data>). A closed row is still the tile: its material, its `<h3>` holding
> the eyebrow as a 52px button with `aria-expanded`, an aside in words («per mese», «nessuna nota» — never an amount, never a
> count of figures), a chevron. The panel is in the DOM and EMPTY: the content mounts at the first open and stays, as an
> inactive `PageTabs` panel keeps its div and not its content — a closed row downloads no chart. It opens on CSS
> (`grid-template-rows` 0fr → 1fr on `ease-spring`, the 400/35 spring as `linear()`, 300 ms), never on Framer
> `layout`, and instantly under reduced motion. Open rows are remembered per page and per device, never synced.
> **A failed read is never closed by the page**: its tile opens itself on every visit; closed by the reader, its
> eyebrow turns `--destructive` beside a warning icon, and one live node names the failed sections.

> **The Binding-Clause Rule** (Composizione mobile, <data>). On a phone the verdict is its headline and first sentence;
> the rest waits behind «Il perché», named by what it holds. A clause that changes the meaning of a printed figure — the
> tax behind a falling month, Rendimenti's measured base, the scheduled amount inside a total (The Scheduled-Is-Not-Spent
> Rule) — is never behind a tap: the builder marks it `binding`, and a binding segment past the cut cancels the cut
> (`splitVerdict`), or the clause becomes the caption of the figure («di cui 180 € in calendario»). The headline is
> never truncated; a scope line («Base: …») sits outside every disclosure.

### 4.2 Le riscritture

- `:280` → «Mobile-first, composed: designed at 390px first; below `desktop:` a page shows less, never something else —
  the verdict, at most four figures, one open tile, the rest a tap away (The First-Screen Rule); desktop adds columns
  and opens every tile».
- `:1394` → «**Don't** squeeze the desktop into a column, nor give the small screen a second design (The First-Screen
  Rule). Mobile is the base and shows LESS — the same tiles, tokens and narratives, most of them closed rows — never
  something different: no mobile-only tile, figure, narrative or route. A chart may change its drawing below the width
  where it stops being legible, never its figures or where a row lands.» («narrative», non «wording»: il Flusso sotto i 640 px ha didascalie
  sue, che vengono da `analisiNarrative.ts` come ogni altra frase; proprietario, 2026-09-27.)
- `:681`: dopo «`order-*`» + «and composed (The First-Screen Rule): the first screen is chosen, not squeezed»; «not a
  rule» e `:1379` («no scroll») restano. `:958`: «Tabs shrink to icon width, never under a 44×44 target» (MOB-02
  § 4.6); `:866` resta. `:1070`: un rimando.
- Frontmatter: `components.tile-closed-row` (`{rounded.2xl}`, `height: "52px"`) solo se il proprietario lo vuole.

### 4.3 Il sidecar

Mai rigenerato né parafrasato: `keyCharacteristics[8]`, `donts[32]` e `rules[26].body` (`:681` cambia) verbatim dalle
righe nuove; quattro `{ name, body, section: "components" }` dopo «The Tile Grid Rule»; `components[]` Page Verdict,
Tile, Error Notice estese con le parole nuove di DESIGN.md; `extensions.motion` + `ease-spring` col `linear()` di
`app/globals.css` (la motion si legge dal CODICE) e il `purpose` di `spring-layout` («the `layout="position"` wrappers
of Panoramica and Patrimonio», che PERF-14 toglie) riletto con `grep -rn springLayoutTransition app components`; il
`purpose` di `breakpoints` desktop; `generatedAt`. Lo script di § 7 prima e dopo.

### 4.4 Guide e AGENTS.md

- **`## Composizione mobile`** (corpo inglese, prima di `## Per-page blind spots`) in `panoramica`, `patrimonio`,
  `cashflow-{tracciamento,budget,divisione,dividendi,analisi}`, `centri-di-costo`, `rendimenti`, `storico`,
  `hall-of-fame`, `allocazione`, `previdenza`, ogni tab di FIRE nella SUA guida (`fire` il Calcolatore, `fire-coast`,
  `fire-what-if`, `fire-monte-carlo`, `fire-obiettivi`: una guida per pagina o tab, CLAUDE.md); `impostazioni`,
  `assistente`: «nessuna composizione, perché». Otto voci: LA tessera · la striscia (etichetta → campo del `*Summary` →
  sezione aperta) · i blocchi sollevati · le righe e il loro aside · le clausole `binding` · le assenze · la chiave
  `mobile-sections:` · 768/1024 e le spec. MOB-09 le uniforma contro il codice, non le riscrive. In `cashflow-analisi`
  l'ultima voce nomina la soglia dei 640 px del Flusso, che la guida dichiara già dal 2026-09-27.
- **Stub di AGENTS § 3**: «the mobile composition» nella riga «Il resto —»; un punto nuovo solo per una trappola vera.
- **AGENTS § 4 Hierarchy, Density and Disclosure**: un punto con le quattro regole per nome e le trappole — il pannello
  chiuso è vuoto (una spec apre la riga prima di leggere), la memoria si scrive solo a un gesto, `order-*` letterali.
  Prima `grep` di § Motion, Navigation, Accessibility (MOB-02): si rimanda, non si duplica.

### 4.5 CLAUDE.md e PRODUCT.md

- Key Features, riga **Shell**: «below `desktop:` verdict · strip · one tile · «Il resto della pagina» (DESIGN → The
  First-Screen Rule)». Known Issues: la pill chiusa (se MOB-02 non l'ha fatto), resta lo `Switch`; la rail resta com'è
  (vive da `desktop:`; a 1024 c'è la barra in alto). Latest: MOB-03..08 fuse in UNA voce.
- PRODUCT.md § Platform: «Mobile-first at 390px, composed below `desktop:` — the same tiles and narratives, a first
  screen of verdict, at most four figures and one open tile (DESIGN.md → The First-Screen Rule); one composition for
  phone and tablet», il resto com'è.

### 4.6 Le critiche Impeccable

Skill `impeccable`, critique dual-agent come Hall of Fame (390/768/1024 + 1440 di controllo), sul mirror e dal **Mac**
(WORKFLOW § Where things are recorded: path e fingerprint sono della macchina; il CRLF di Windows non combacia).
Committate APERTE: si chiudono solo con `polish` (`critique-storage close <target> <snapshot-file>`, due argomenti; fa
fede `closed: true` nel file, non l'exit code), in una sessione successiva. Lo snapshot vecchio dello stesso slug si
cancella nello stesso commit.

### 4.7 README e Draft

`doc/mobile/README.md`: § 6 una riga per MOB-01..09 (data, misura); § 3 la tabella «dopo», solo numeri aggregati.
`Draft Release Temp.md`: le voci di MOB-03..08 riscritte nel loro stato finale in ✨ New Features (una o una per
pagina: § 4.9, 4) + una di 📚 Documentation; si ANTEPONE; se il file manca (tag tagliato) si ricrea dal modello di
WORKFLOW § Where things are recorded; cifre tonde inventate e nomi generici, mai del mirror.

### 4.8 Conflitti con PERF

- **PERF-14** scrive in DESIGN.md solo se il proprietario cambia lo stagger (§ 4 D, § 10) e non tocca il sidecar:
  MOB-09 rilegge dopo, aggiunge accanto, riallinea `spring-layout` (§ 4.3).
- **PERF-03**: se «Aggiornato alle…» ha un nome in DESIGN.md, The First-Screen Rule lo cita (sotto la prima frase).
- **PERF-04**: «a closed row downloads no chart» regge sul grafico dietro `dynamic` di modulo (AGENTS § Dynamic Imports
  and Module Hygiene, PERF-04 § 10): si rimanda lì, NON a «Deferred Chart Mount» (`:1277`, **Superseded (2026-09-06)**,
  parla del count-up). **`perf:serve`**: `mobile:budget` su :3200.

### 4.9 Domande al proprietario

1. Il testo delle quattro regole: così, ritoccato (risposta libera), o lo scrive lui?
2. Critiche: nuove per Panoramica, Tracciamento, Rendimenti, Hall of Fame e le altre dodici lasciate (proposta); tutte
   sedici; nessuna? (WORKFLOW § Where things are recorded: la critica di una superficie «since rebuilt» si cancella.)
3. `tile-closed-row` nel frontmatter? 4. Il Draft: una voce per la serie (proposta) o una per pagina? (Il modello
   dice «one entry per surface, rewritten to its final state», `Draft Release Temp.md:3`.)
5. L'ordine del DOM: la regola del brief (§ 3) sta in AGENTS § Hierarchy, Density and Disclosure (`AGENTS.md:686`, dentro
   il punto sulle tessere stirate), e `doc/guide/patrimonio.md:169` dice il contrario («DOM order is the reading order …
   never by a CSS `order` swap»). La decisione si prende PRIMA, in MOB-02 § 4.9, 8 (vale per ogni pagina): qui The
   First-Screen Rule scrive la risposta registrata in `doc/mobile/README.md`, con l'eventuale eccezione di Patrimonio.

## 5. File da toccare

- `DESIGN.md` (§ 1, § 5, § 6); `.impeccable/design.json`; `.impeccable/critique/*.md`.
- `doc/guide/*.md` di § 4.4; `AGENTS.md` (§ 3, § 4); `CLAUDE.md`; `PRODUCT.md`; `doc/mobile/README.md`;
  `Draft Release Temp.md`.

## 6. Passi

1. Branch; `git log` di MOB-03..08; le domande di § 4.9. 2. `mobile:census`/`mobile:budget` sul mirror.
3. Lo script di § 7 sul sidecar di oggi. 4. DESIGN.md dopo l'OK sul testo; il sidecar; lo script.
5. Guide, AGENTS.md, CLAUDE.md, PRODUCT.md. 6. Le critiche (Mac). 7. Playwright. 8. README, Draft; commit proposto.

## 7. Test e falsificazione

- **Script del sidecar** (usa-e-getta, nella scratchpad): ogni `body` di `narrative.rules` compare in DESIGN.md dopo
  `**<name>`; ogni `keyCharacteristics` e ogni `donts` compare. **A spazi normalizzati** (`/\s+/g` → « »): DESIGN.md è
  CRLF e sette corpi vanno a capo (Received-vs-Announced, Off-Axis…), e un `includes` letterale è rosso già oggi (7 su
  44, provato il 2026-09-26; normalizzato 0). Falsificare: un carattere cambiato nel corpo della First-Screen Rule nel
  sidecar → rosso; ripristino con l'edit inverso (mai `git checkout --`).
- **Le guide**: `grep -l "^## Composizione mobile" doc/guide/*.md | wc -l` = 20, ognuna prima di `## Per-page blind
  spots`; un titolo rinominato → 19, rosso.
- **`mobile:budget`**: una voce di `doc/mobile/budget.json` abbassata → exit 1; edit inverso.
- **Playwright**: nessuna spec nuova; un rosso si legge (`modal.origin`) prima di attribuirlo. `JSON.parse` del sidecar.

## 8. Collaudo guidato

- A: `desktop` verde. C: § 7. F (telefono vero, mirror): 1) tre pagine contro le quattro regole; 2) una riga in errore
  con l'eyebrow rosso; 3) la memoria dopo aver chiuso il browser; 4) una pagina a 1024 orizzontale; 5) PRODUCT.md
  § Platform letto. G: `npm run mirror:remove`, lo script cancellato.

## 9. Rischi e rollback

- DESIGN.md toccato senza OK: l'edit inverso. Sidecar e prosa divergenti: si riallinea il sidecar, mai la prosa.
- CLAUDE.md oltre 20.000: fatti spostati nelle guide. Critiche scritte da Windows: si riscrivono dal Mac.

## 10. Documentazione da aggiornare

È la spec: § 4.1–4.7 in UN diff, più CLAUDE.md «Latest» con i numeri aggregati di `mobile:budget`.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-09-design-md-guide-e-chiusura.md: chiudiamo la composizione
mobile nei documenti. Il capitolo «Small-Screen Composition» di DESIGN.md con le quattro regole (First-Screen,
Lifted-Figure, Closed-Row, Binding-Clause) e la riscrittura di «never simplifies», SOLO con il mio OK sul testo; il
sidecar .impeccable/design.json verbatim; «Composizione mobile» in ogni guida; AGENTS.md § 4; CLAUDE.md; PRODUCT.md
§ Platform; le critiche Impeccable; doc/mobile/README.md § 6; Draft Release Temp.md. Nessun codice dell'app.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md (§ 2 e § Where things are recorded), AGENTS.md (§ 0, § 3, § 4 Motion, Navigation, Hierarchy,
  Density and Disclosure, Accessibility), CLAUDE.md
- Leggi DESIGN.md § 1, § 2 Named Rules, § 5 Tile, Tile Grid, Navigation, Segmented Pill Control, § 6 — MAI rigenerarlo
- Leggi le guide di § 4.4, il git log di MOB-03..08, doc/perf/PERF-03 e PERF-14 (le loro righe in DESIGN.md)
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md
- Leggi doc/mobile/README.md, la spec MOB-09 per intero e MOB-02 § 4.1 (i nomi delle API)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; le domande di § 4.9 con lo
strumento interattivo prima di scrivere in DESIGN.md; nessuna cifra del mirror; file CRLF: Edit o apply.mjs.
Chiusura: mobile:census e mobile:budget (build :3200); lo script del sidecar (spazi normalizzati) verde e visto
rosso; npm run test:e2e intero (tutti i progetti, anche i *-mobile per fixture e i tablet); tsc, lint 0, Vitest in
Europe/Rome (nessun codice toccato: deve restare verde); critiche dal Mac; giro di 5 punti, mirror:remove; CLAUDE.md
«Latest» e Draft Release Temp.md senza dati privati; tutto in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Documentazione estesa e meccanica, ma scritta in DESIGN.md: serve il registro delle
regole esistenti e il verbatim fra prosa e sidecar, non un ragionamento di dominio nuovo.
