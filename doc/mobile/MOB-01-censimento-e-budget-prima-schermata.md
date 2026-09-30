# MOB-01 — Il censimento in repo e il budget della prima schermata

> Stato: da fare · Priorità: 1 (le altre MOB si chiudono con i suoi numeri) · Sforzo: M · Dipende da: PERF-01 (PERF-00 è chiusa dal 2026-09-28: la nuova Esposizione e `instrument-profile-cache` nel seed ci sono) · Sblocca: MOB-02..MOB-08

## 1. Il problema, misurato

Il 2026-09-26 uno script usa-e-getta (`doc/mobile/reference/mobile-census.mjs`, le righe `:N` sotto sono sue) ha
misurato sul mirror, dev server, 19 superfici (11 route; Cashflow e FIRE per tab) × 390×844, 768×1024, 1024×768:

- **390**: su ogni superficie con dati UNA tessera inizia nella prima schermata e nessuna ci sta intera (eccezioni:
  Centri, Allocazione, Impostazioni 2/1; FIRE › Obiettivi vuoto 1/1). Schermate: mediana 3,84, Patrimonio 5,52,
  Allocazione 5,25, Storico e Monte Carlo 5,05. Cifre sopra la piega 7–27, quasi tutte nel verdetto.
- **768**: mediana 2,39 schermate, 3 tessere sopra la piega. **1024**: mediana 3,11, 1 tessera. **Overflow X**: mai.

La tabella intera (soli numeri) è `doc/mobile/README.md` § 3, «la baseline» qui sotto; il budget parte dalla prima
corsa sulla build, confrontata con essa.

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

- `npm run mobile:census -- --email=mirror@example.com` gira sulla build di produzione (:3200) e in meno di 10 minuti
  scrive `.mobile-census/last-run.json` (gitignored, senza testi) e due screenshot per superficie × viewport.
- `npm run mobile:budget` confronta con `doc/mobile/budget.json`, esce 1 al primo sforamento e stampa anche la colonna
  «obiettivo» di The First-Screen Rule (≤ 5 cifre fuori dal verdetto, prima riga chiusa sopra la pill): oggi «non ancora».
- Verde sul mirror, confrontato con la baseline più le metriche nuove; i test di § 7 visti rossi.

## 3. Non-obiettivi

- Nessun codice dell'app (MOB-02..07), niente tempi (`perf:bench`), niente CI, nessuna spec Playwright (MOB-02..08).
- Le metriche nuove a 768 e 1024 si registrano; vincolanti con MOB-08. Fuori: Assistente e login; B e C.

## 4. Design

**Due script**, come `perf:bench` e `perf:budget` (`perf/README.md`). `scripts/mobileCensus.mjs` misura (emulatori, mirror, build servita); resta `.mjs` perché
passa funzioni a `page.evaluate` (un sorgente passato da `tsx` può portarsi dietro l'helper `__name`).
`scripts/mobileBudget.mts` (con `tsx`, come i seed) confronta, chiamando la pura `lib/utils/mobileBudget.ts`.

**Le misure** per superficie × viewport. «Pill» = bordo alto di `nav[aria-label="Navigazione principale"]` se visibile,
altrimenti il fondo di `main`.

| Metrica | Definizione | Verso |
|---|---|---|
| `screens` | `main.scrollHeight / main.clientHeight` (baseline) | tetto |
| `tilesAboveFold` · `tilesFullyAboveFold` | `section.rounded-2xl` (`components/ui/tile.tsx:52-56`; una riga chiusa lo è ancora) che iniziano / stanno entro `main.clientHeight` (baseline) | pavimento |
| `figuresAboveFold` | cifre sullo schermo sopra `main.clientHeight`, verdetto compreso (baseline) | tetto |
| `figuresOutsideVerdict` | cifre in `main`, sullo schermo, sopra la pill, NON discendenti della `section` visibile con `view-transition-name: page-verdict` (`components/ui/page-verdict.tsx:30`), salvo la striscia, che conta; senza verdetto (Impostazioni) = tutte | tetto, obiettivo 5 |
| `firstClosedRowAbovePill` | la prima riga chiusa finisce sopra la pill; `null` finché non ce n'è | `true` resta `true` |
| `overflowX` | `main.scrollWidth > main.clientWidth` | sempre `false` |

Diagnostica non vincolante: `mainTop` (la barra a 1024), `pillTop`, `headerHeight`, `charts`, tessere per indice.

- **Cifra** = il pattern dello script (`:93`), `\d[\d.,]*\s?(?:€|%)` (`\s` copre lo spazio non separabile di `Intl`),
  esportato come stringa e passato a `page.evaluate`. `NarrativeText` stampa ogni cifra in un solo `span`
  (`components/ui/narrative-text.tsx:36-50`): si conta per nodo di testo.
- **Sullo schermo** = `checkVisibility({ visibilityProperty: true, opacityProperty: true })`, nessun antenato `[inert]`
  o `.sr-only`, area non nulla dentro ogni antenato con `overflow` non `visible`. `aria-hidden` NON esclude: quella cifra
  è sull'occhio (`components/history/tiles/RaddoppiTile.tsx:90-92`) e la baseline la contava.
- **Il verdetto** è la `section` con quel nome sullo schermo (lo skeleton ne ha uno su un `div`,
  `components/ui/tile-grid-skeleton.tsx:50`). MOB-02 rende `strip` DENTRO la `section` (prop di `PageVerdict`, § 4.1,
  § 4.3): le cifre di `ul[aria-label="Le cifre del verdetto"]` (§ 4.4) contano fuori, come nei mock di A.
- **La riga chiusa** (MOB-02 § 4.2): una `section.rounded-2xl[id]` il cui `h3 > button[aria-expanded="false"]` ha
  `aria-controls` = `<id>-panel`. Un `button[aria-expanded][aria-controls]` qualunque non basta: oggi l'hanno le righe
  di `DriverTile.tsx:139`, `AssetRow.tsx:274` (Patrimonio), `PerCategoriaTile.tsx:241` (Budget) e, dal 2026-09-27, «Mostra
  tutte» del Flusso sul telefono (`FlowShareMobile.tsx`).
- **Le superfici** stanno in `budget.json` → `surfaces` (chiave, `path`, `tab` = `aria-label` della tab, come FIRE a
  `:46-51`). Il tab attivo visibile (`aria-selected="true"`) deve combaciare, se no la superficie è `missing` (rosso).
  Parità dei `path` senza `?tab=` con `lib/constants/navigation.ts` (`primaryNav` `:22`, `analysisNav` `:29`,
  `planningNav` `:39`, `secondaryHrefs` `:55`), meno `assistantNavItem` (`:48`). Una superficie con un'opzione (Centri,
  Divisione e, da #400, i ruoli 50/30/20 del Flusso) si misura nello stato che il fixture dichiara:
  `spendingRolesEnabled` spento, il default. La vista per ruolo non è nel budget; sul mirror il report stampa lo stato
  dell'interruttore, perché il Flusso a 390 cambia forma con lui.
- **Il settle**: `h1`, nessun `[data-slot="skeleton"]` visibile (`components/ui/skeleton.tsx:20`), una cifra o 8 s, nessun
  `[data-freshness]` con testo nel `PageHeader` (la riga di freschezza, `components/layout/PageHeader.tsx`, in develop dal 2026-09-30; gli altri `role="status"` di `main`
  no: `components/fire-simulations/coast/CoastIpotesi.tsx:276` resta pieno), poi 500 ms; oltre 60 s `unsettled` (rosso).
  Contesto `reducedMotion: 'reduce'`, uno per viewport, nessun `mobile-sections:*`, nessuna riga aperta.
- **Privacy e opzioni**: uscita in `.mobile-census/` (gitignored), testi solo con `--texts`; sempre dopo `--`: `--email`,
  `--password` (default `MIRROR_PASSWORD`, citato in un commento), `--base` (default :3200), `--viewports`, `--surfaces`.

**Il budget**: `{ "baseline": "2026-09-26", "tolerance": { "screens": 0.5, "figuresAboveFold": 3 }, "surfaces": {…},
"budget": { "panoramica": { "390": { "screens": 4.41, "tilesAboveFold": 1, … "overflowX": false } } } }`. La tolleranza
vale solo per le due metriche che seguono i dati (Movimenti è lunga il 28 e corta il 2); le altre sono strette.
`lib/utils/mobileBudget.ts` esporta `compareCensusToBudget(measured, budget)` → `{ ok, violations, targets }` e
`tightenBudget(budget, measured)`, che muove un valore solo nel verso buono (`mobile:budget -- --tighten`, MOB-03..08
nello stesso commit). Allargare: a mano, con l'OK del proprietario, annotato in `doc/mobile/README.md`.

**API di MOB-02 usate**: la `section` di `PageVerdict`; l'`ul` di `VerdictStrip` dentro di essa; la riga chiusa di
`Tile` (`sectionTriggerId` → `sectionPanelId` vuoto); la chiave `mobile-sections:<route>[:<tab>]` (per non ereditarla).

**Conflitti con PERF**: `perf/` è la base (`perf:build`, `perf:serve` su :3200, il `--`, la pura + `.mts` di
`perfBudget`); PERF-12 ha `perf:census`: nomi
distinti; PERF-02 (in develop dal 2026-09-29) → nessuno spinner: l'attesa dell'auth è lo skeleton «Verifica dell'accesso»
in `main` (`app/dashboard/layout.tsx`), `[data-slot="skeleton"]` come ogni altro; PERF-03 (in develop dal 2026-09-30) → la riga di stato vuota, `[data-freshness]`; PERF-04 → il settle aspetta lo
`Skeleton` dei grafici pigri (a riga chiusa `charts` scende: voluto).

**Decisioni per il proprietario**: (1) budget sul mirror con tolleranza, o su un fixture deterministico (stabile ma
piccolo)? (2) La cifra resta «€ e %» come la baseline, o conta anche «pt» e i rapporti (i mock di A contano «+2,4 pt» e
«1,67»; `RendimentoTile.tsx:48-51` stampa «pt»)? (3) Tolleranze +0,5 schermate e +3 cifre (e `figuresOutsideVerdict`,
che segue anch'essa i dati)? (4) `--tighten` sul mirror: Movimenti vale ~1,9 schermate a 390 (1587 px); stretto il 2
del mese, Tracciamento è rosso il 28 a codice fermo: si stringe a `misurato + tolleranza`, o mai sul mirror?
**Decise il 2026-09-27 (doc/mobile/README.md § 9): (1) fixture deterministico per il budget, il mirror per il giro
guidato; (2) una cifra è solo «€ e %», come la baseline. Restano (3) e (4), da porre sul fixture.**

## 5. File da toccare

- `scripts/mobileCensus.mjs` — nuovo; esporta il pattern, il `main` gira solo se lanciato direttamente.
- `scripts/mobileBudget.mts` — nuovo: `last-run.json` contro `budget.json`, `--tighten`.
- `lib/utils/mobileBudget.ts` — nuovo: `compareCensusToBudget`, `tightenBudget`, i tipi.
- `doc/mobile/budget.json` — nuovo: superfici e limiti.
- `__tests__/mobileBudget.test.ts`, `__tests__/mobileSurfaces.test.ts`, `__tests__/mobileCensusFigures.test.ts` — nuovi.
- `package.json` — `mobile:census` (`node scripts/mobileCensus.mjs`), `mobile:budget` (`tsx scripts/mobileBudget.mts`).
- `.gitignore` — `/.mobile-census/`. `.tmp-mobile-measure.mjs` cancellato se ancora nella radice.

## 6. Passi

1. Branch; SESSION_NOTES.md; `perf/README.md`, `scripts/perfBudget.mts` e `doc/guide/e2e-emulatori.md`.
2. `lib/utils/mobileBudget.ts` + i tre test, visti rossi e poi verdi.
3. `scripts/mobileCensus.mjs`, una correzione di § 1 alla volta; `scripts/mobileBudget.mts`; `package.json`.
4. Emulatori, `npm run mirror:seed -- <email>`, `perf:build`, `perf:serve`, `mobile:census`; uno scarto dalla baseline
   oltre la tolleranza si annota e si chiede, non si assorbe.
5. `budget.json` = la prima corsa + `figuresOutsideVerdict` misurata; `mobile:budget` verde; le falsificazioni di § 7.
6. Documentazione in un diff; `mirror:remove`; commit proposto.

## 7. Test e falsificazione

- `__tests__/mobileBudget.test.ts`: tetto superato, pavimento mancato, `overflowX: true`, `firstClosedRowAbovePill` da
  `true` a `false`, superficie `missing` o `unsettled` → `ok: false` con superficie e metrica; dentro la tolleranza →
  verde; `tightenBudget` non allarga mai. Falsificare invertendo un verso: rosso.
- `__tests__/mobileCensusFigures.test.ts`: conta «1.234,56 €», «−0,81 %», non «11 strumenti». Falsificare togliendo `\s?`.
- `__tests__/mobileSurfaces.test.ts`: i `path` di `budget.json` senza `?tab=` = href di `navigation.ts` meno
  l'Assistente. Falsificare aggiungendo `/dashboard/dividends` (non esiste).
- Il censimento: su un account senza Divisione `--surfaces=cashflow-divisione` → `missing`, budget rosso. Sulla build di
  oggi `firstClosedRowAbovePill` è `null` su tutte le 19: falsificare riducendo il riconoscimento a
  `button[aria-expanded="false"][aria-controls]` → Storico, Patrimonio, Budget e, a 390 con più di cinque categorie in un gruppo, Analisi («Mostra tutte» del Flusso)
  diventano non-`null`.
- Suite: `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`.

## 8. Collaudo guidato

- A: nessun file dell'app nel diff. C: census sulle 19 × 3; budget verde, rosso con le falsificazioni.
- F (mirror): 1) la tabella si legge; 2) gli screenshot a 390 di Panoramica e Cashflow › Budget mostrano la pagina
  giusta; 3) `last-run.json` senza nomi né testi; 4) il comando parte anche dal Mac.
- G: `mirror:remove`; `.mobile-census/` e `.next-perf` cancellate; nessun `.tmp-*`.

## 9. Rischi e rollback

- **Dati che si muovono**: la tolleranza assorbe qualche giorno, non un mese (§ 4, domanda 4); davanti a un rosso su
  `screens` o `figuresAboveFold` si guarda prima la data. **Dev contro build**: uno scarto forte dalla baseline (dev) si
  annota in SESSION_NOTES; il budget resta la prima corsa sulla build.
- **Contratto con MOB-02**: senza l'ARIA di § 4 `firstClosedRowAbovePill` resta `null`. Rollback: tutto additivo.
- **Yahoo nel fixture**: l'Esposizione chiede i profili a `/api/portfolio/instrument-profiles`, che chiama Yahoo solo a
  `instrument-profile-cache` vuota o scaduta; `emulators:seed` la precompila per i ticker della fixture (`VWCE.DE`,
  `AAPL`, `FONDOPENSIONE` vuoto) e il global setup di Playwright la ristampa a ogni corsa
  (`scripts/instrumentProfileFixtures.ts`, `npm run e2e:seed:profiles`): il budget di Allocazione non tocca la rete. Un ticker non seminato va a Yahoo (senza rete è «non
  letto» e la tessera è più corta): la diagnostica registra il `source` del `Server-Timing` della route (da PERF-10), e un
  `source=yahoo` sul fixture si corregge nel seed prima di prendere il budget, non si assorbe.

## 10. Documentazione da aggiornare

CLAUDE.md «Latest» e § Testing (una riga accanto a `perf:*`); `doc/mobile/README.md` § stato; `doc/guide/e2e-emulatori.md`
(:3200 condivisa, `.mobile-census/`); `Draft Release Temp.md` (una riga «dev», senza dati privati). AGENTS.md: nulla.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-01-censimento-e-budget-prima-schermata.md: il censimento della
prima schermata in repo (scripts/mobileCensus.mjs, porting di doc/mobile/reference/mobile-census.mjs), il budget per
superficie × viewport che può solo migliorare (lib/utils/mobileBudget.ts + scripts/mobileBudget.mts +
doc/mobile/budget.json), npm run mobile:census e mobile:budget.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md (regole di sessione, collaudo guidato, § 3 per questo repo)
- Leggi AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § Navigation, § Accessibility, § Commands,
  § Browser-Driven E2E), CLAUDE.md (§ Testing, § Known Issues), doc/guide/e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALI mentre scrivi codice
- Leggi doc/mobile/README.md (§ 3 è la baseline) e la spec MOB-01 per intero; doc/mobile/MOB-02 § 4.1-4.4 (il contratto
  che il censimento riconosce); perf/README.md e scripts/perfBudget.mts (perf:build,
  perf:serve, porta :3200: il censimento gira sulla stessa build); DESIGN.md § mobile se MOB-09 l'ha già scritta
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; le quattro domande di § 4 (mirror o
fixture, cosa è una cifra, tolleranze, --tighten sul mirror) chiedimele con lo strumento interattivo prima di scrivere
budget.json.
Vincoli: le sette correzioni di § 1; il censimento resta .mjs; opzioni dopo «--»; uscita gitignored; budget.json solo
numeri aggregati, mai testi di verdetto o eyebrow del mirror.
Chiusura: mobile:census sul mirror e il confronto con la baseline in SESSION_NOTES; mobile:budget verde e ROSSO con le
falsificazioni di § 7 (dimmi cosa hai rotto e cosa ha stampato); tsc, lint 0, Vitest in Europe/Rome; la documentazione
di § 10 in UN diff; mirror:remove; proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Più di un porting, nessuna regola di dominio: tooling con trappole note, come PERF-01.
