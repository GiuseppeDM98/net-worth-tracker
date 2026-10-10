# MOB-01 — Il censimento in repo e il budget della prima schermata

> Stato: fatta il 2026-10-10 (README § 3.1, decisioni 58 e 59) · riletta in modo adversariale il 2026-10-10: 25 rilievi, 5 decisioni · Priorità: 1 (le altre MOB si chiudono con i suoi numeri) · Sforzo: M · Dipende da: — (PERF-01 in develop dal 2026-09-28, PR #409: `perf:build`, `perf:serve`, `perf:budget`; PERF-00 chiusa il 2026-09-28: la nuova Esposizione e `instrument-profile-cache` nel seed ci sono) · Sblocca: MOB-02..MOB-08

## 1. Il problema, misurato

Il 2026-09-26 uno script usa-e-getta (`doc/mobile/reference/mobile-census.mjs`, le righe `:N` sotto sono sue) ha
misurato sul mirror, dev server, 19 superfici (11 route; Cashflow e FIRE per tab) × 390×844, 768×1024, 1024×768:

- **390**: su ogni superficie con dati UNA tessera inizia nella prima schermata e nessuna ci sta intera (eccezioni:
  Centri, Allocazione, Impostazioni 2/1; FIRE › Obiettivi vuoto 1/1). Schermate: mediana 3,84, Patrimonio 5,52,
  Allocazione 5,25, Storico e Monte Carlo 5,05. Cifre sopra la piega 7–27, quasi tutte nel verdetto.
- **768**: mediana 2,39 schermate, 3 tessere sopra la piega. **1024**: mediana 3,11, 1 tessera. **Overflow X**: mai.

La tabella intera (soli numeri) è `doc/mobile/README.md` § 3, «la baseline» qui sotto: è del mirror e resta un
riferimento storico. Il budget nasce dalla prima corsa sulla build sul FIXTURE (README § 9, decisioni 6 e 10) e va in
README § 3.1; la corsa sul mirror si confronta con la baseline solo in SESSION_NOTES.

**La baseline precede i contributi del 2026-09-27.** Da #401 il Flusso di Analisi sotto i 640 px non è più un Sankey ma
una barra e le righe: a 390 `charts` scende da 2 a 1 (il Sankey era un `svg[role="img"]`), cifre e controlli salgono, le
schermate sono da rimisurare; a 768 e 1024 nulla cambia. Dal 2026-09-28 l'Esposizione di Allocazione è cambiata (la base e la riga
di copertura, `components/allocation/tiles/EsposizioneTile.tsx`). #400 a interruttore spento e #403 non muovono righe (le quote del chip sono `sr-only`). Uno scarto su
Analisi a 390 o su Allocazione si attribuisce a quei contributi, non al censimento.

Lo script non può diventare un budget così com'è (righe del 2026-09-26, chi implementa le riverifica):

1. **La piega.** `fold = main.clientHeight` (`:90`) vale 844 a 390, ma la pill è `fixed` sopra `main`
   (`components/layout/BottomNavigation.tsx:73`; gli 88 px di `app/dashboard/layout.tsx:74` sono padding in fondo allo
   scroll): la prima schermata vera finisce al bordo alto della pill (~768). A 1024 la pill è nascosta e `main` è alto
   719: 49 px di barra (`layout.tsx:37`).
2. **Il verdetto sbagliato.** `:101` prende la PRIMA `section` con `view-transition-name: page-verdict`; Cashflow monta
   sempre Tracciamento (`app/dashboard/cashflow/page.tsx:93`, `forceMount` a `:381`): su Budget, Centri, Divisione e
   Dividendi trova il suo verdetto nascosto (altezza 0).
3. **Cifre indistinte.** `:106-120` contano tutto `main`: The First-Screen Rule (proposta, MOB-09) parla di cifre FUORI
   dal verdetto, e oggi nessuno sa quante sono.
4. **Visibile ≠ sullo schermo.** `visible` (`:92`) non vede i ritagli: un testo sotto `grid-template-rows: 0fr` +
   `overflow-hidden` viene contato — già oggi il Ledger chiuso di `components/history/tiles/DriverTile.tsx:161-165`,
   domani la riga chiusa di MOB-02 dopo la prima apertura.
5. **Tab spenta.** Senza Centri o Divisione Cashflow ricade su Tracciamento (`page.tsx:255`): misura muta, nome sbagliato.
6. **Privacy.** Il JSON registra `h1` (il saluto con il nome, `:126`), verdetto (`:102`) ed eyebrow (`:97`); uscita non
   in `.gitignore`; password a mano (`:23` = `scripts/mirrorProdAccount.mts:27`); base :3000 (`:24`).
7. **Attese a tempo**: 3 s per i count-up (`:78`); con reduced motion atterrano subito (`lib/utils/useCountUp.ts:86`).

## 2. Obiettivo misurabile

- `npm run mobile:census -- --email=census@example.com` (da Git Bash: PowerShell 5.1 mangia il `--`) gira sulla build di
  produzione (:3200), risemina il fixture, e scrive `.mobile-census/last-run.json` (gitignored, senza testi), due
  screenshot per superficie × viewport e in coda la durata della corsa (§ 8 C la legge: meno di 10 minuti per 19 × 3).
- `npm run mobile:budget` confronta con `doc/mobile/budget.json`, stampa ogni sforamento ed esce 1 se ce n'è almeno uno,
  e stampa la colonna «obiettivo» di The First-Screen Rule su tutte e tre le viewport (≤ 5 cifre fuori dal verdetto e prima
  riga chiusa sopra la pill a 390; a 768/1024 l'obiettivo è il misurato di MOB-08, README § 9, 16): oggi «non ancora».
- Verde sul fixture; i test di § 7 visti rossi. La corsa sul mirror (`--email=mirror@example.com`) si confronta con la
  baseline di README § 3 in SESSION_NOTES e nel giro guidato, mai in `budget.json`.

## 3. Non-obiettivi

- Nessun codice dell'app (MOB-02..07), niente tempi (`perf:bench`), niente CI, nessuna spec Playwright (MOB-02..08).
- Le metriche nuove a 768 e 1024 (`figuresOutsideVerdict`, `firstClosedRowAbovePill`) si registrano come informative
  (`informational` in `budget.json`, § 4); diventano vincolanti con MOB-08, che svuota la lista. Fuori: Assistente e login; B e C.

## 4. Design

**Due script**, come `perf:bench` e `perf:budget` (`doc/guide/velocita.md`). `scripts/mobileCensus.mjs` misura (emulatori, fixture o mirror, build servita); resta `.mjs` perché
passa funzioni a `page.evaluate` (un sorgente passato da `tsx` può portarsi dietro l'helper `__name`).
`scripts/mobileBudget.mts` (con `tsx`, come i seed) confronta, chiamando la pura `lib/utils/mobileBudget.ts`.

**Il fixture del budget** (README § 9, decisione 10): l'account `census@example.com` / `test1234` (uid `census-user`),
seminato da `scripts/seedCensusE2E.mts` (`npm run e2e:seed:census`, sul modello di `scripts/seedEmulator.ts`): Centri di
Costo e Divisione accesi con i dati dei seed `centri` e `split`, una cedola, una spesa a fine mese in calendario, i 47
snapshot del seed `hof`, un tetto di Budget, un fondo pensione, i profili strumento precompilati, e la quota di risparmio
del mese precedente sotto il 30% (così `SavingsRateBadge` non compare: è `fixed` sopra la pill, `components/ui/SavingsRateBadge.tsx:114`).
Ogni data è relativa al giorno della corsa (il 5 del mese corrente, il mese scorso intero), così ogni superficie mostra
gli stessi conteggi in qualunque giorno del mese. `mobile:census` lo risemina prima di misurare quando `--email` è il suo,
e lancia `npm run e2e:seed:profiles` (la cache dei profili vuoti vive 24 h, `scripts/instrumentProfileFixtures.ts:8-10`:
il global setup di Playwright, che la ristampa, qui non gira).

**Il giro di riscaldamento**: prima della prima viewport il censimento fa una `goto` per route senza misura, così le
migrazioni della prima visita (il registro operazioni, `app/dashboard/assets/page.tsx:144`; i debiti degli immobili in
`loan`, `:185-189`, dal 2026-10-10) sono già scritte quando si misura, e il numero di tessere non cambia fra le viewport.

**Le misure** per superficie × viewport. «Pill» = bordo alto di `nav[aria-label="Navigazione principale"]` se visibile,
altrimenti il fondo di `main`. Una cifra o una riga «sta sopra la pill» se il suo nodo FINISCE sopra il bordo alto della
pill (`bottom ≤ pillTop`).

| Metrica | Definizione | Verso |
|---|---|---|
| `screens` | `main.scrollHeight / main.clientHeight` (baseline) | tetto |
| `tilesAboveFold` · `tilesFullyAboveFold` | `section.rounded-2xl` (`components/ui/tile.tsx:52-56`; una riga chiusa lo è ancora; un `ErrorNotice` lo è, senza id) che iniziano / stanno entro `main.clientHeight` (baseline) | pavimento |
| `figuresAboveFold` | cifre sullo schermo (la definizione sotto, più stretta di quella della baseline: `[inert]`, opacità 0 e ritagli esclusi; lo scarto dovuto alla definizione si annota in SESSION_NOTES) sopra `main.clientHeight`, verdetto compreso | tetto |
| `figuresOutsideVerdict` | cifre in `main`, sullo schermo, sopra la pill, NON discendenti della `section` visibile con `view-transition-name: page-verdict` (`components/ui/page-verdict.tsx:30`) — lo `scope` e l'`axis` di MOB-02 contano DENTRO (README § 9, 13) — salvo la striscia (`ul[aria-label="Le cifre del verdetto"]`), che conta fuori; LA tessera aperta conta (16); senza verdetto (Impostazioni) = tutte | tetto, obiettivo 5 a 390 |
| `firstClosedRowAbovePill` | la prima riga chiusa finisce sopra la pill; `null` finché non ce n'è | budget `null` accetta solo `null`: un misurato non-`null` dove il budget è `null` è uno sforamento («riga chiusa non registrata») finché `--tighten` non registra `true`; `false` si registra solo con `raisedBy` (README § 9, 19); `true` resta `true` |
| `overflowX` | `main.scrollWidth > main.clientWidth` | sempre `false` |

Diagnostica non vincolante: `mainTop` (la barra a 1024), `pillTop`, `headerHeight`, `charts` (un fallback senza
`data-slot="skeleton"` non si aspetta; uno Skeleton che resta oltre 60 s dà `unsettled`), tessere per indice, se il
`SavingsRateBadge` era visibile, il `source` del `Server-Timing` di `/api/portfolio/instrument-profiles`.

- **Cifra** = il pattern dello script (`:93`), `\d[\d.,]*\s?(?:€|%)` (`\s` copre lo spazio non separabile di `Intl`),
  esportato come stringa (`FIGURE_PATTERN`) e passato a `page.evaluate`. `NarrativeText` stampa ogni cifra in un solo `span`
  (`components/ui/narrative-text.tsx:36-50`): si conta per nodo di testo.
- **Sullo schermo** = `checkVisibility({ visibilityProperty: true, opacityProperty: true })`, nessun antenato `[inert]`
  o `.sr-only`, nessun antenato `position: fixed` diverso dalla pill (il `SavingsRateBadge` non è composizione: non conta),
  area non nulla dentro ogni antenato con `overflow` non `visible`. `aria-hidden` NON esclude: quella cifra
  è sull'occhio (`components/history/tiles/RaddoppiTile.tsx:90-92`) e la baseline la contava.
- **Il verdetto** è la `section` con quel nome sullo schermo (lo skeleton ne ha uno su un `div`,
  `components/ui/tile-grid-skeleton.tsx:50`). MOB-02 rende `strip` DENTRO la `section` (prop di `PageVerdict`, § 4.1,
  § 4.3): le cifre di `ul[aria-label="Le cifre del verdetto"]` (§ 4.4) contano fuori, come nei mock di A.
- **La riga chiusa** (MOB-02 § 4.2): una `section.rounded-2xl[id]` il cui `h3 > button[aria-expanded="false"]` ha
  `aria-controls` = `<id>-panel` (il pannello non ha `role`: la `section` è già la region della tessera). Un
  `button[aria-expanded][aria-controls]` qualunque non basta: oggi l'hanno i trigger Radix di ogni «Dettaglio»
  (`CollapsibleTrigger` stampa `aria-controls` da sé, `node_modules/@radix-ui/react-collapsible/dist/index.mjs:64`), le
  righe di `DriverTile.tsx:139`, `AssetRow.tsx:274` (Patrimonio), `PerCategoriaTile.tsx:241` (Budget), la Scheda di Analisi
  (`EntityDossier.tsx:255`) e, dal 2026-09-27, «Mostra tutte» del Flusso sul telefono (`FlowShareMobile.tsx`).
- **Le superfici** stanno in `budget.json` → `surfaces` (chiave, `path`, `tab`, `target`). Ogni superficie a tab ha `tab`
  (l'`aria-label` atteso, `PageTabBar.tsx` `aria-label={tabName(label)}`), FIRE come a `:46-51`. Il censimento clicca
  la tab visibile con quel nome solo se il `path` non porta `?tab=`; poi verifica che la tab visibile con
  `aria-selected="true"` abbia quel nome. Una tab che manca o non combacia dà `missing` (rosso), mai un'eccezione.
  Parità dei `path` senza `?tab=` con `lib/constants/navigation.ts` (`primaryNav` `:22`, `analysisNav` `:29`,
  `planningNav` `:39`, `secondaryHrefs` `:55`), meno `assistantNavItem` (`:48`). Una superficie con un'opzione (Centri,
  Divisione e, da #400, i ruoli 50/30/20 del Flusso) si misura nello stato che il fixture dichiara: Centri e Divisione
  accesi, `spendingRolesEnabled` spento, il default. La vista per ruolo non è nel budget; sul mirror il report stampa lo stato
  dell'interruttore, perché il Flusso a 390 cambia forma con lui. `target: false` vale solo per `impostazioni` (nessun
  verdetto): la colonna «obiettivo» stampa «—».
- **Il settle**: `h1`, nessun `[data-slot="skeleton"]` visibile (`components/ui/skeleton.tsx:20`), una cifra o 8 s, nessun
  `[data-freshness]` con testo nel `PageHeader` (la riga di freschezza, `components/layout/PageHeader.tsx`, in develop dal 2026-09-30; gli altri `role="status"` di `main`
  no: `components/fire-simulations/coast/CoastIpotesi.tsx:276` resta pieno), poi 500 ms; oltre 60 s `unsettled` (rosso).
  Contesto `reducedMotion: 'reduce'`, uno per viewport, nessun `mobile-sections:*` e nessun clic su una riga: si misura lo
  stato di default della pagina (le `defaultOpen` e le letture fallite aperte, MOB-02 § 4.5).
- **Privacy e opzioni**: uscita in `.mobile-census/` (gitignored), testi solo con `--texts`; sempre dopo `--`: `--email`,
  `--password` (default `'test1234'`, la password che ogni account degli emulatori condivide: `MIRROR_PASSWORD` di
  `scripts/mirrorProdAccount.mts:27` e `TEST_PASSWORD` di `scripts/seedEmulator.ts:35`, citate in un commento), `--base`
  (default :3200), `--viewports`, `--surfaces`, `--selftest`. La prima riga stampata da `mobile:census` e da
  `mobile:budget` ripete le opzioni lette (email, base, viewport, superfici, file di budget): da Windows si lanciano da
  Git Bash, perché PowerShell 5.1 mangia il `--` (doc/guide/velocita.md).
- **`--selftest`**: il censimento monta con `page.setContent` un frammento noto — una pill
  `nav[aria-label="Navigazione principale"]` fissa, due `section` con `view-transition-name: page-verdict`, una nascosta e
  una visibile, una cifra sotto `grid-rows-[0fr] overflow-hidden`, un `SavingsRateBadge` finto `fixed`, e una riga chiusa
  con la forma di MOB-02 § 4.2 — e attende `figuresOutsideVerdict`, il verdetto scelto e `firstClosedRowAbovePill: true`
  esatti: è la prova nel browser delle correzioni 1, 2 e 4 di § 1 e del riconoscimento POSITIVO della riga chiusa, che
  MOB-02 creerà dopo.

**Il budget**: `{ "measuredAt": "<data della prima corsa>", "account": "census@example.com", "tolerance": {},
"informational": { "768": ["figuresOutsideVerdict", "firstClosedRowAbovePill"], "1024": [...] }, "surfaces": { "<chiave>":
{ "path", "tab", "target" } }, "budget": { "panoramica": { "390": { "screens": <misurato>, "tilesAboveFold": …,
"overflowX": false, "raisedBy"?: "MOB-NN: perché" } } } }`. **Tolleranza zero** su ogni metrica (README § 9, 23: il fixture è
deterministico). Le voci in `informational` si stampano e non fanno uscire 1; MOB-08 svuota la lista.
`lib/utils/mobileBudget.ts` esporta `compareCensusToBudget(measured, budget)` → `{ ok, violations, targets }` (tutte le
violazioni, con superficie e metrica) e `tightenBudget(measured, budget)` (lo stesso ordine di `compareCensusToBudget` e di
`perfBudget.tightenBudget`, `lib/utils/perfBudget.ts:206`), che muove un valore solo nel verso buono e scrive il misurato
esatto; `mobile:budget -- --tighten` si rifiuta se `last-run.json` non è di `census@example.com` o se una superficie è
`missing` o `unsettled`, ed esce 1. **Allargare**: a mano, con l'OK del proprietario, con `"raisedBy": "MOB-NN: perché"`
sulla voce (superficie × viewport) e una riga in README § 3.1; `scripts/mobileBudget.mts` confronta con `git show
HEAD:doc/mobile/budget.json` come `perfBudget` (`scripts/perfBudget.mts:6-8`), e un valore allargato senza `raisedBy`
nuovo è rosso. Le eccezioni che la serie già conosce: la pill a 44 px (MOB-02, `"MOB-02: pill a 44 px"`), le LA tessere
senza curva (`firstClosedRowAbovePill: false`, README § 9, 19).

**API di MOB-02 usate**: la `section` di `PageVerdict` (con `axis` e `scope` dentro); l'`ul` di `VerdictStrip` dentro di
essa; la riga chiusa di `Tile` (`sectionTriggerId` → `sectionPanelId` vuoto); la chiave `mobile-sections:<route>[:<tab>]`
(per non ereditarla).

**Conflitti con PERF**: `perf/` è la base (`perf:build`, `perf:serve` su :3200, il `--`, la pura + `.mts` di
`perfBudget`); `perf:census` esiste (`scripts/perfRenderCensus.mjs`, in develop dal 2026-10-06): nomi
distinti; PERF-02 (in develop dal 2026-09-29) → nessuno spinner: l'attesa dell'auth è lo skeleton «Verifica dell'accesso»
in `main` (`app/dashboard/layout.tsx`), `[data-slot="skeleton"]` come ogni altro; PERF-03 (in develop dal 2026-09-30) → la riga di stato vuota, `[data-freshness]`; PERF-04 (in develop dal 2026-09-30, `components/ui/lazy-component.tsx`) → il settle aspetta lo
`Skeleton` dei grafici pigri (a riga chiusa `charts` scende: voluto).

**Decise dal proprietario** (README § 9): fixture `census@example.com` e non il mirror (6, 10); una cifra è solo «€ e %»
(7); tolleranza zero e `--tighten` al misurato esatto (23); lo `scope` conta dentro il verdetto (13); LA tessera conta
nel ≤ 5, obiettivo 5 a 390 e il misurato a 768/1024 (16); le eccezioni solo con `raisedBy` (19, 22). Nessuna domanda resta.

## 5. File da toccare

- `scripts/mobileCensus.mjs` — nuovo; esporta `FIGURE_PATTERN`, il `main` gira solo se lanciato direttamente.
- `scripts/mobileBudget.mts` — nuovo: `last-run.json` contro `budget.json`, `--tighten`, il confronto con `git show HEAD:`.
- `lib/utils/mobileBudget.ts` — nuovo: `compareCensusToBudget`, `tightenBudget`, i tipi.
- `scripts/seedCensusE2E.mts` — nuovo: l'account `census@example.com` (§ 4). `package.json`: `e2e:seed:census`.
- `doc/mobile/budget.json` — nuovo: superfici e limiti.
- `__tests__/mobileBudget.test.ts`, `__tests__/mobileSurfaces.test.ts`, `__tests__/mobileCensusFigures.test.ts` — nuovi.
- `package.json` — `mobile:census` (`node scripts/mobileCensus.mjs`), `mobile:budget` (`tsx scripts/mobileBudget.mts`).
- `.gitignore` — `/.mobile-census/`. (`.tmp-mobile-measure.mjs` è assente dalla radice, verificato il 2026-10-10.)

## 6. Passi

1. Branch; SESSION_NOTES.md; `doc/guide/velocita.md`, `scripts/perfBudget.mts`, `scripts/seedEmulator.ts` e `doc/guide/e2e-emulatori.md`.
2. `lib/utils/mobileBudget.ts` + i tre test, visti rossi e poi verdi.
3. `scripts/seedCensusE2E.mts`; `scripts/mobileCensus.mjs`, una correzione di § 1 alla volta, poi `--selftest`;
   `scripts/mobileBudget.mts`; `package.json`.
4. Emulatori, `perf:build`, `perf:serve`, `mobile:census -- --email=census@example.com` (che risemina); poi
   `npm run mirror:seed -- <email>` e `mobile:census -- --email=mirror@example.com`: uno scarto del mirror dalla baseline
   di README § 3 si annota in SESSION_NOTES e si chiede, non si assorbe; il budget è del fixture.
5. `budget.json` = la prima corsa sul FIXTURE + `figuresOutsideVerdict` misurata; `mobile:budget` verde; le
   falsificazioni di § 7; la tabella README § 3.1.
6. Documentazione in un diff; `mirror:remove`; commit proposto.

## 7. Test e falsificazione

- `__tests__/mobileBudget.test.ts`: tetto superato, pavimento mancato, `overflowX: true`, `firstClosedRowAbovePill` da
  `true` a `false`, misurato non-`null` contro budget `null` («riga chiusa non registrata»), superficie `missing` o
  `unsettled` → `ok: false` con superficie e metrica; voce `informational` → stampata, non in `violations`; `raisedBy`
  nuovo accettato, valore allargato senza `raisedBy` nuovo → rosso; `tightenBudget` non allarga mai e scrive il misurato
  esatto. Falsificare invertendo un verso: rosso.
- `__tests__/mobileCensusFigures.test.ts`: conta «1.234,56 €», «−0,81 %», non «11 strumenti». Falsificare togliendo `\s?`.
- `__tests__/mobileSurfaces.test.ts`: l'INSIEME dei `path` di `surfaces` senza `?tab=` = `primaryNav` ∪ `secondaryHrefs`
  meno `assistantNavItem.href`; ogni chiave di `surfaces` ha in `budget` le viewport 390, 768, 1024, e nessuna voce di
  `budget` manca in `surfaces`. Falsificare aggiungendo `/dashboard/dividends` (non esiste) e togliendo una voce di `budget`.
- Il censimento: `--selftest` verde, e rosso falsificando `fold = main.clientHeight`, la prima `section` e il controllo
  del ritaglio, una cosa alla volta. Con `--email=test@example.com` (senza Divisione) `--surfaces=cashflow-divisione` →
  `missing`, budget rosso. Sulla build di oggi `firstClosedRowAbovePill` è `null` su tutte le 19: falsificare riducendo il
  riconoscimento a `button[aria-expanded="false"][aria-controls]` → diventano non-`null` almeno Storico (Driver e
  Dettaglio), Patrimonio (`AssetRow`) e Budget (`PerCategoriaTile`), e con loro ogni superficie con un «Dettaglio» chiuso;
  l'elenco stampato va in SESSION_NOTES e `mobile:budget` è rosso («riga chiusa non registrata»).
- Suite: `npx tsc --noEmit`, `npm run lint`, Vitest con `TZ=Europe/Rome` e con `TZ=UTC`; `npm run perf:budget --
  --dist=.next-perf` invariato (nessun file dell'app).

## 8. Collaudo guidato

- A: nessun file dell'app nel diff. C: `--selftest`; census sulle 19 × 3 sul fixture (durata < 10 minuti); budget verde,
  rosso con le falsificazioni di § 7.
- F (mirror, DevTools): 1) la tabella si legge; 2) gli screenshot a 390 di Panoramica e Cashflow › Budget mostrano la pagina
  giusta; 3) `last-run.json` senza nomi né testi; 4) il comando parte anche dal Mac.
- G: `mirror:remove`; `.mobile-census/` e `.next-perf` cancellate; nessun `.tmp-*`.

## 9. Rischi e rollback

- **Il fixture**: deterministico per costruzione (date relative, riseminato a ogni corsa); una deriva su `screens` o
  `figuresAboveFold` sul fixture è un difetto del seed o dell'app, mai da assorbire. **Dev contro build**: lo scarto del
  mirror dalla baseline (dev) si annota in SESSION_NOTES; il budget resta la prima corsa sulla build sul fixture.
- **Contratto con MOB-02**: senza l'ARIA di § 4 `firstClosedRowAbovePill` resta `null`; il `--selftest` ne tiene la forma.
  Rollback: tutto additivo.
- **Yahoo nel fixture**: l'Esposizione chiede i profili a `/api/portfolio/instrument-profiles`, che chiama Yahoo solo a
  `instrument-profile-cache` vuota o scaduta (24 h per un profilo vuoto); `mobile:census` lancia `npm run
  e2e:seed:profiles` prima di misurare (`scripts/instrumentProfileFixtures.ts`: `VWCE.DE`, `AAPL`, `FONDOPENSIONE` vuoto).
  Un ticker non seminato va a Yahoo (senza rete è «non letto» e la tessera è più corta): la diagnostica registra il
  `source` del `Server-Timing` della route (`app/api/portfolio/instrument-profiles/route.ts`, dal 2026-10-05), e un
  `source=yahoo` sul fixture ferma la presa del budget: si corregge nel seed, non si assorbe.

## 10. Documentazione da aggiornare

CLAUDE.md «Latest» e § Testing (una riga accanto a `perf:*`) e § Current Status (i conteggi Vitest riletti dalla corsa);
`doc/mobile/README.md` § 6, § 3.1 (la tabella del fixture, la prima corsa) e § 3 (le righe Analisi a 390 e Allocazione
del mirror rimisurate, solo numeri aggregati, con la data), § 8 riscritta al presente; `doc/guide/e2e-emulatori.md`
(:3200 condivisa, `.mobile-census/`, l'account `census@example.com` nella tabella dei fixture); `doc/guide/velocita.md`
(nella tabella § Files le righe dei due script, del seed e di `doc/mobile/budget.json`; una sezione «Il censimento della
prima schermata»: comandi, colonne, il ratchet con `raisedBy`); AGENTS.md § Performance tooling (una riga:
`mobile:census`/`mobile:budget` sulla stessa :3200, budget in `doc/mobile/budget.json`) e § Commands (`mobileBudget`,
`mobileSurfaces` accanto a `perfRoutes`); WORKFLOW.md § 3 (la tabella dei fixture: `census@example.com`); `Draft Release
Temp.md` (una riga «dev» in 🔧 Improvements, senza dati privati).

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-01-censimento-e-budget-prima-schermata.md: il censimento della
prima schermata in repo (scripts/mobileCensus.mjs, porting di doc/mobile/reference/mobile-census.mjs, con --selftest),
il fixture deterministico census@example.com (scripts/seedCensusE2E.mts, npm run e2e:seed:census), il budget per
superficie × viewport che può solo migliorare (lib/utils/mobileBudget.ts + scripts/mobileBudget.mts +
doc/mobile/budget.json, tolleranza zero, raisedBy per allargare), npm run mobile:census e mobile:budget.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md (regole di sessione, collaudo guidato, § 3 per questo repo)
- Leggi AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § Navigation, § Accessibility, § Commands,
  § Browser-Driven E2E, § Performance tooling), CLAUDE.md (§ Testing, § Known Issues), doc/guide/e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALI mentre scrivi codice
- Leggi doc/mobile/README.md (§ 3 è la baseline del mirror, § 9 le decisioni 6, 7, 10, 13, 16, 19, 22, 23) e la spec
  MOB-01 per intero; doc/mobile/MOB-02 § 4.1-4.4 (il contratto che il censimento riconosce); doc/guide/velocita.md e
  scripts/perfBudget.mts (perf:build, perf:serve, porta :3200: il censimento gira sulla stessa build);
  scripts/seedEmulator.ts, seedCostCentersE2E.mts, seedSplitE2E.mts, seedHallOfFameE2E.mts (i pezzi del seed census)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; nessuna domanda è aperta (tutte
decise in README § 9): se il codice ti mette davanti a una scelta nuova, chiedimela con lo strumento interattivo prima
di scrivere budget.json.
Vincoli: le sette correzioni di § 1; il censimento resta .mjs; opzioni dopo «--» da Git Bash; uscita gitignored;
budget.json solo numeri aggregati, mai testi di verdetto o eyebrow; il budget nasce dal fixture, mai dal mirror.
Chiusura: --selftest verde e visto rosso; mobile:census sul fixture e poi sul mirror, il confronto del mirror con la
baseline in SESSION_NOTES; mobile:budget verde e ROSSO con le falsificazioni di § 7 (dimmi cosa hai rotto e cosa ha
stampato); tsc, lint 0, Vitest in Europe/Rome e sotto TZ=UTC; perf:budget invariato; la documentazione di § 10 in UN
diff (README § 3.1 compresa); mirror:remove; proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Più di un porting, nessuna regola di dominio: tooling con trappole note, come PERF-01.
