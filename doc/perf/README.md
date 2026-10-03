# Velocità dell'app — analisi, misure e specifiche

> Sessione del 2026-09-26, a partire da «How we made claude.ai faster» (Anthropic, agosto 2026). Questa cartella tiene UNA
> specifica per implementazione (`PERF-NN-*.md`, tutte sullo stesso template, ognuna con il prompt e il modello in coda) e
> questo indice: le domande di partenza con le risposte, come è stata misurata l'app, la baseline, l'ordine consigliato e lo
> stato. Una spec che si chiude aggiorna la tabella in § 6 e, se ha rimisurato, la baseline in § 3.

## 1. Le tre domande e le risposte

**Firebase è il limite?** No, non oggi. Con Firestore emulato (round trip ~1 ms) Cashflow impiega 2,1 s a mostrare un
numero, Storico 2,3 s, Analisi 1,7 s: il tempo è CPU del browser (deserializzare 1533 documenti, ridurli, montare la pagina)
e catena d'avvio (HTML vuoto → JS → Firebase Auth → query). In produzione ogni round trip vale 50–150 ms, quindi contano i
round trip IN SERIE: Rendimenti ne fa 4–5 con 17 chiamate API; la Panoramica ricalcola il riepilogo quasi a ogni apertura
in sei stadi sequenziali, con le funzioni Vercel a Washington e Firestore in Europa.

**Serve migrare?** No. Postgres/Supabase, Convex o simili = riscrivere ~40 servizi, le rules in RLS, l'harness emulatori,
l'Admin SDK: mesi di lavoro che non toccano le cause misurate. Le due leve lato Firebase che valgono: la regione delle
funzioni allineata a Firestore (PERF-08, una riga) e i riassunti materializzati per pagina, il pattern GIÀ in uso per la
Panoramica e `performance-cache` (PERF-07, PERF-09).

**Lato codice** sta quasi tutto: la shell che non esiste finché Auth non risolve (PERF-02), la cache che muore al reload
(PERF-03), 460 KB gz di JS su ogni pagina con recharts quattro volte e il PDF nel grafo di Storico (PERF-04), le stesse
collezioni lette con meccanismi diversi (PERF-05), le spese intere per mostrare un mese (PERF-06), N grafici montati al
buio su Patrimonio (PERF-11), il React Compiler mai acceso e 70 stati in un componente (PERF-12, PERF-13), il lavoro di
layout e colori a ogni mount (PERF-14).

## 2. Come è stata misurata

- **Build di produzione isolata** (`NEXT_DIST_DIR=.next-perf`, Turbopack, le `NEXT_PUBLIC_*` degli emulatori cotte nel
  bundle), servita dallo standalone con gli emulatori (Auth :9099, Firestore :8080). Il 2026-09-26 è stata servita su :3100
  a suite Playwright ferma; da PERF-01 il server di misura ha la SUA porta, :3200, perché :3100 è del server Playwright
  (WORKFLOW.md § 3).
- **Dati reali**: il mirror del proprietario (`npm run mirror:seed -- <email>`): 25 asset, 1533 spese, 45 snapshot,
  31 operazioni, 7 dividendi, 3 centri. Rimosso a fine sessione.
- **Uno script Playwright usa-e-getta** (Chromium headless 1440×900): per ogni route, cold = contesto nuovo, login vero,
  reload della route; warm = un contesto, i link della sidebar uno dopo l'altro. `PerformanceObserver` (LCP, CLS, long
  task, FCP) + `MutationObserver` per i traguardi: `auth` (spinner via), `h1`, `data` (prima cifra in euro in `main`),
  `skeleton`. Rete classificata (Firestore, API, JS). 3 run cold, 2 warm, mediane. Lo script è diventato
  `scripts/perfBenchmark.mjs` (`perf/README.md`); i dati grezzi restano in git
  (`git show d8d3d98:doc/perf/reference/baseline-2026-09-26-cold.log`, e `…-warm.json`).
- **La macchina**: il laptop Windows del 2026-09-26. Il proprietario lavora dal Mac (WORKFLOW.md § 3): i TEMPI non sono
  confrontabili fra le due macchine, i CONTEGGI (richieste, chiamate, KB, chunk) sì. Un budget di tempo si confronta solo
  prima/dopo nella stessa sessione, sulla stessa macchina.
- **Due audit di codice** (strato dati; rendering e bundle) con file:riga, verificati a campione sui punti che le spec
  usano. Le righe citate nelle spec sono del 2026-09-26: chi implementa le riverifica.
- **La build**: chunk iniziali per route dall'HTML prerenderizzato, gzip calcolato su disco, contenuto dei chunk
  identificato per firma (`CartesianGrid`, `@firebase/firestore`, `pdfkit`, …).

## 3. Baseline (2026-09-26, laptop Windows, mirror, nessun throttling CPU)

> **Superata il 2026-09-28 da PERF-01**: la baseline in vigore — misurata con `npm run perf:bench` e `npm run perf:budget`
> sulla build che contiene #400, #401, #403 e #407 — sta in `perf/README.md`, con i comandi e il registro dei tetti
> alzati. Quella qui sotto resta come storia e come «prima» delle spec già scritte. Una correzione vale anche per lei:
> i «46 caratteri di testo» dell'HTML erano il `<title>`, il `body` ne ha 0.

> Misurata su `develop` PRIMA dei contributi del 2026-09-27 (#400 e #401: il Flusso per ruolo e sul telefono; #403: il
> chip composito di Strumenti) e di PERF-00 (la nuova Esposizione, chiusa il 2026-09-28). PERF-01 rimisura sulla build
> che li contiene (§ 5): le tabelle qui sotto restano come storia, e la nota «Esposizione → Yahoo ogni volta» è il
> «prima» di PERF-00 — il «dopo» è una route che risponde dalla cache per ticker (0 chiamate a Yahoo a regime, il test
> della route lo pinna) e una pesatura nel browser, quindi la colonna API di Allocazione resta 1 ma senza Yahoo dietro.

**Cold** — reload della route dopo il login (ms; mediane di 3):

| Pagina | primo numero | LCP | long task | Firestore | API | note |
|---|---|---|---|---|---|---|
| Panoramica | 150 | 680 | 93 | 3 | 1 | un payload materializzato |
| Patrimonio | 790 | 1230 | 270 | 8 | 1 | N sparkline montate; waterfall mutuo e ledger |
| Cashflow › Tracciamento | 2110 | 2200 | 400 | 3 | 0 | tutta E (1533 doc) |
| Analisi | 1690 | 1710 | 565 | 3 | 0 | tutta E |
| Rendimenti | 1110 (1000–2070) | 1140 | 144–377 | 10–14 | 17 | 5 collezioni lette due volte + 10 route yield |
| Storico | 2285 | 2300 | 670 | 3 | 0 | tutta E; PDF nel bundle |
| Allocazione | 590 | 610 | 165 | 4 | 1 | Esposizione → Yahoo ogni volta |
| Previdenza | 584 | 600 | 96 | 4 | 0 | il modello: tutto su React Query |
| FIRE | 2040 | 2050 | 300 | 7–8 | 0–1 | catena a 3 |
| Hall of Fame | 510 | 530 | 88 | 3 | 0 | un documento |
| Impostazioni | 527 | 548 | 93 | 5 | 0 | 71 `useState` |

Lo spinner di `ProtectedRoute` (Firebase Auth) se ne va fra 86 e 228 ms dal `navigationStart`; l'HTML prerenderizzato di
ogni route dashboard contiene 46 caratteri di testo (lo spinner).

**Warm** — navigazione client dalla sidebar, stessa sessione (ms dal click; mediane di 2):

| Pagina | skeleton mostrato | primo numero | long task | Firestore | API |
|---|---|---|---|---|---|
| Panoramica | no | 141 | 0 | 5 | 0 |
| Patrimonio | sì | 314 | 83 | 11 | 0 |
| Cashflow | sì | 1226 | 124 | 4 | 0 |
| Analisi (spese già in cache) | **no** | **242** | 153 | 2 | 0 |
| Rendimenti | sì | 574 | 0 | 13 | 17 |
| Storico | sì | 1250 | 255 | 8 | 0 |
| Allocazione | sì | 606 | 55 | 4 | 1 |
| Previdenza | sì | 131 | 0 | 2 | 0 |
| FIRE | sì | 1757 | 75 | 6 | 0 |
| Hall of Fame | sì | 127 | 0 | 2 | 0 |

Analisi con le spese già in cache (242 ms, nessuno skeleton) contro Analisi a freddo (1690 ms) è la misura che giustifica
PERF-03 e PERF-05: la stessa pagina, con lo stesso dato già in memoria, è sette volte più veloce. PERF-06 va nella
direzione opposta su un punto — finestre diverse per pagina significa che Tracciamento e Analisi NON condividono più la
stessa voce di cache — e lo compensa leggendo un quarto dei documenti; la sua misura di chiusura è il cold, non il warm.

**Bundle** (gzip, chunk iniziali per route): condivisi da ogni pagina 460 KB (21 chunk; 136 KB firebase, 69 react-dom, 43
framer-motion) · login 415 · Panoramica 535 · Patrimonio 717 · Cashflow 726 · Analisi 734 · Rendimenti 681 · **Storico 1192**
· Allocazione 510 · Previdenza 589 · FIRE 743 · Hall of Fame 534 · Impostazioni 610 · Assistente 657. recharts in QUATTRO
chunk da 350 KB raw (uno per pagina); lucide-react intero (575 KB raw / 143 KB gz) alla prima icona di categoria; 93 chunk
su disco, 9,0 MB raw.

## 4. Cosa prendere dal post, tradotto per questo repo

| Nel post | Qui |
|---|---|
| Quattro viaggi misurati su RUM, poi benchmark deterministici, poi il ratchet in CI | PERF-01: il benchmark in repo, il budget per route che può solo scendere |
| Il composer statico prima di React | PERF-02: la shell nell'HTML prima di Firebase Auth |
| La sessione prefetchata al hover; la cache che non si clona due volte al minuto | PERF-03: l'ultimo dato noto subito, la cache che sopravvive al reload |
| Il census di 6.900 hook nel percorso di digitazione; −90% re-render della sidebar | PERF-12: il compiler; PERF-13: Impostazioni per tab; PERF-11: i dialog |
| Il lookup megamorfico risolto tre volte → una | PERF-05, PERF-09, PERF-10: ogni collezione letta una volta |
| Il renderer che tocca solo ciò che cambia; `:root:has()` da 24 ms | PERF-14: niente `layout` sui wrapper di pagina, colori letti una volta (nessun `:has` globale: verificato) |
| Feature flag brevi, rollout graduale, un thread = un benchmark | ogni spec: una misura di chiusura, un rollback per lettera, il ratchet abbassato nello stesso commit |

## 5. Ordine consigliato e dipendenze

Gli archi (A → B = «B dipende da A»), gli stessi dell'intestazione di ogni spec:

| Da | A |
|---|---|
| #400, #401, #403 (integrate il 2026-09-27), PERF-00 | 01 |
| PERF-00 | 10 (§ A) |
| PERF-01 | 02, 04, 05, 07, 12 |
| PERF-02 | 03 |
| PERF-04 | 11 |
| PERF-05 | 03, 06, 09, 11, 13 |
| PERF-07 | 08, 09, 10 |
| PERF-12 | 11, 13, 14 (il census in `scripts/`) |

**PERF-00 è entrata prima di tutto, PERF-01 compresa** (proprietario, 2026-09-27; PR #407 in develop dal 2026-09-28, la
spec ritirata lo stesso giorno): non era una spec di sola velocità — era la proposta #402, la nuova Esposizione — ma
chiude il difetto misurato di PERF-10 § A e cambia ciò che la baseline di Allocazione misura, quindi è entrata prima che
il benchmark fissasse i suoi numeri.

Quattro sessioni indipendenti potevano partire subito dopo PERF-01: **PERF-05** (dati, fatta il 2026-09-29), **PERF-04**
(bundle), **PERF-07 → PERF-08 / PERF-10** (server), **PERF-12** (compiler). PERF-02 (in develop dal 2026-09-29) e PERF-03
(in develop dal 2026-09-30, dopo PERF-05) sono le due che il proprietario SENTE di più. Due spec che toccano lo stesso punto se lo sono spartito: il
`layout="position"` delle pagine è di PERF-14 sola; il `getDoc` bloccante di `AuthContext` è già andato (2026-09-28,
`contexts/AuthContext.tsx`); la lettura delle impostazioni di `AssetDialog` chiuso è di PERF-05 sola; il secondo
`MotionConfig` del layout dashboard è già andato (2026-09-28); la cache dell'Esposizione è già in repo
(`lib/server/exposure/instrumentProfileService.ts`; PERF-10 vi aggiunge il `Server-Timing`); il Sankey del Flusso caricato pigramente è di PERF-04 sola (fatto il 2026-09-30).

**Contributi esterni e funzioni nuove (proprietario, 2026-09-27).** Le tre PR di Ciocc128 sono entrate PRIMA di PERF-01,
con le correzioni della revisione; la proposta #402 l'abbiamo implementata noi (PR #407, 2026-09-28), anche lei prima di
PERF-01. Così baseline e budget nascono sull'app che li contiene. Una PR che arriva DOPO PERF-01 segue il protocollo di
AGENTS.md § Commands: trial merge, matrice contro le spec aperte, emendamenti nello stesso commit, e il tetto del
budget alzato con la misura se la route cresce (perf/README.md § Il ratchet e il tetto alzato).

## 6. Stato

| Spec | Titolo | Priorità | Sforzo | Dipende da | Modello · effort | Stato |
|---|---|---|---|---|---|---|
| PERF-00 | Esposizione: leva, copertura, base di Allocazione, cache per ticker (issue #402) | 1 | L | — (#400/#401/#403 già integrate) | Fable 5.1 · xhigh | **ritirata il 2026-09-28** — PR #407 in develop dal 2026-09-28; 14 divergenze: nove lezioni già a casa (doc/guide/allocazione.md § Esposizione: le parole della copertura riviste sul mirror, l'ETC che chiede `fund`, la firma vuota che non è lo stato vuoto, `LEG_DESTINY` come fonte), quattro lacune colmate in sessione (il test che lega i quattro destini a `compareAllocations`, due falsificazioni viste rosse, la riga del seed dei profili in SETUP.md, una frase falsa nella guida), una decisione (i non-obiettivi) portata nei blind spots della guida; la misura di chiusura resta: 0 chiamate a Yahoo alla seconda apertura (`__tests__/instrumentProfilesRoute.test.ts`) |
| PERF-01 | Il benchmark in repo e il budget che può solo scendere | 1 | M | 00 | Opus 5.5 · high | **ritirata il 2026-09-28** — PR #409 in develop dal 2026-09-28; 20 divergenze: sedici dove il codice aveva ragione e la lezione era già a casa (commenti alla riga degli script, `perf/README.md`, SETUP, WORKFLOW, AGENTS), un difetto corretto in sessione (il messaggio rosso di `perf:budget` mandava il registro dei tetti a questo README invece che a `perf/README.md`), tre rimandi voluti (`libraryCopies` a PERF-04; niente CI e niente RUM, per scelta non scritti); `reference/` cancellata, lo script vive in `scripts/perfBenchmark.mjs`; la misura di chiusura resta la baseline di `perf/README.md` |
| PERF-02 | La shell prima dell'autenticazione | 2 | M | 01 | Fable 5.1 · xhigh | **ritirata il 2026-09-29** — PR #411 in develop dal 2026-09-29; 15 divergenze: dodici dove il codice aveva ragione e la lezione era già a casa (il marcatore `auth` in `main`, «testo» 265 e non «> 300» → `perf/README.md` e i commenti di `scripts/perfBenchmark.mjs` e `lib/utils/perfBudget.ts`; la silhouette del `PageHeader` nel fallback e l'etichetta «Verifica dell'accesso» → doc/guide/stati.md; il `pageerror` di React 19, i sei setup sull'email a 1440 e l'helper `e2e/shellBoot.ts` → doc/guide/e2e-emulatori.md; il tema al primo rAF e il tipo `ColorTheme` derivato dalla lista → doc/guide/temi.md; il `getDoc` dopo il cancello e l'eccezione del demo → doc/guide/accesso-registrazione.md), due difetti corretti nel secondo commit della PR, su decisione del proprietario (due `MotionConfig` annidati sotto il root `MotionProvider` — `app/page.tsx`, `components/auth/AuthShell.tsx` — tolti, così «the ONE» di `template.tsx` e AGENTS.md § Motion è vero dal 2026-09-29; cinque commenti che chiamavano `hidden desktop:flex` una sidebar fissa che è `desktop:block`, corretti), un rimando voluto (il frame di chrome vuoto prima di /login, accettato nei blind spots di accesso-registrazione.md); la misura di chiusura resta: «testo» 265, lo skeleton della shell nel DOM a 23–31 ms, CLS 0 (`perf/README.md` § Baseline) |
| PERF-03 | L'ultimo dato noto subito, il fresco appena arriva | 2 | M | 02, 05 | Fable 5.1 · xhigh | **ritirata il 2026-09-30** — PR #415 in develop dal 2026-09-30; 24 divergenze: quattordici dove il codice aveva ragione (le decisioni sotto, la lezione già a casa salvo due portate ora: come le tre asserzioni di `e2e/freshness.spec.ts` sono state viste rosse, nella sua intestazione; il uid subito dopo il prefisso per ogni chiave persistita, in testa a `lib/query/queryKeys.ts`), quattro difetti corretti nel ritiro, su decisione del proprietario (la chiave morta `queryKeys.assets.byId`, che sotto un prefisso persistito metteva un id di asset dove il persister legge il proprietario — tolta, e `__tests__/persistCache.test.ts` pinna ora ogni costruttore di chiave sotto un prefisso, visto rosso nei due modi; l'export senza lettori `PERSIST_QUERIES_ENV`; il flag assente da `.env.local.example`; `@tanstack/react-query` a `^5.90.12` sotto il peer `^5.104.0` del persist-client), sei rimandi voluti (Storico a 385 ms contro l'obiettivo di 300, e il record che in una sessione vera contiene TUTTE le chiavi → `perf/README.md` § Revisit e PERF-06 § 1; Rendimenti senza riga e con lo skeleton al reload → PERF-09 § 1; Impostazioni → PERF-13 § 1; il demo mai visto in un browser → i blind spots di doc/guide/account-condiviso-demo.md; il flag di rollback resta finché la release non ha girato in produzione → AGENTS.md § Caching; la voce della riga in DESIGN.md → MOB-09 § 4). Misura di chiusura (`perf:bench -- --revisit`, prima/dopo nella stessa sessione, `perf/README.md` § Revisit): Cashflow 1208 → 179 ms, Analisi 1150 → 259, Storico 1455 → 385, FIRE 1199 → 181, Patrimonio 437 → 144, Previdenza 355 → 122, Hall of Fame 235 → 113, Allocazione 344 → 106, Panoramica 148 → 115; nessuno skeleton di pagina su nove route; Rendimenti (`fetchQuery`, PERF-09) e Impostazioni (`staleTime: 0`, PERF-13) invariati. Le decisioni prese implementando: la riga «Aggiornato alle…» nell'HEADER e non sotto il verdetto (proprietario); il ripristino INVALIDA ciò che ripristina (ogni caricamento rilegge — senza, F5 entro 5 min non rileggeva più: trovato dalla suite completa); l'etichetta segna un dato letto PRIMA di questo caricamento, o più vecchio dello `staleTime` della sua query; `gcTime` 24 h per prefisso con `setQueryDefaults`, non hook per hook; serializzazione per valore (tag), non per elenco di campi; `ProtectedRoute` attende anche `useIsRestoring()`; lo svuotamento al logout nel provider, sulla transizione utente→null; la meta del registro nella allowlist (Patrimonio); i setup Playwright tolgono il DB dal file di `storageState` invece di `deleteDatabase`; `--revisit` aspetta il record persistito. Il costo nuovo: il ripristino (0,3–1,5 MB di JSON sul mirror) dentro l'attesa dell'auth, 60–220 ms — PERF-06 per le pagine a finestra, non per Storico. Lezioni a casa: AGENTS.md § Caching e doc/guide/cache-persistita.md, doc/guide/{stati,e2e-emulatori,account-condiviso-demo,panoramica,patrimonio,cashflow-tracciamento,impostazioni}.md, `perf/README.md` § Revisit |
| PERF-04 | recharts una volta, il PDF, le icone e il Sankey quando servono | 2 | M | 01 | Opus 5.5 · high | **ritirata il 2026-09-30** — PR #418 in develop dal 2026-09-30; 24 divergenze: quattordici dove il codice aveva ragione e la lezione era già a casa (la causa delle quattro copie e il barrel con `export const` → l'intestazione di `components/ui/charts/recharts.ts` e AGENTS.md § Dynamic Imports; la firma `recharts-wrapper` → `perf/README.md`; il dialog del PDF statico, il motore al click e l'attesa nel «Generazione...» di «Genera PDF» → doc/guide/email-pdf.md e storico.md; `lazyComponent` senza Suspense e il precarico dopo i dati → AGENTS.md, la decisione in § 9; il Dettaglio di Storico statico → storico.md; la Scheda in più e il Sankey precaricato alla valutazione del modulo → cashflow-analisi.md; i 121 loader al posto di `dynamicIconImports` → cashflow.md; il chunk del PDF riconosciuto dal percorso `node_modules/@react-pdf/` e non da `pdfkit` → `e2e/chunkProbe.ts`; il JS per navigazione sostituito dal prefetch dei link della shell → `perf/README.md`; i file nuovi nel § Files delle guide; un commit solo e non uno per parte, per WORKFLOW § 1), cinque difetti corretti nel ritiro, su decisione del proprietario (le intestazioni di `e2e/bundle.lazy{,.mobile}.spec.ts` — un rimando al SESSION_NOTES della sessione e un «`next/dynamic`» falso; il puntatore del prefetch in AGENTS.md verso questo README invece di `perf/README.md`; «nessuna route cresce» con Patrimonio a +7,4; il JSDoc di `PDFExportDialog` staccato dal componente), cinque rimandi (Patrimonio +7,4 → PERF-11 § 1; il `layout-shift` tenuto da una spec solo per il Sankey e Rendimenti → doc/guide/e2e-emulatori.md; il picker delle icone mai cronometrato → doc/guide/cashflow.md; `radix-ui`, `date-fns/locale` e papaparse mai verificati, e il modulo Firestore su `/login` → `perf/README.md` § Il budget). Dalla chiusura: perché quattro copie: NON import profondi diversi (il grafo dei moduli aveva recharts una volta) ma il chunking — Turbopack batcha una libreria per punto d'ingresso; un barrel di sole ri-esportazioni è trasparente (build identica al byte), uno con `export const` dà UN chunk tenendo il tree-shaking (AGENTS.md § Dynamic Imports). Il PDF arriva al click (`loadPDFGenerator`, il dialog resta statico); i grafici chiusi di Rendimenti, Analisi (disclosure e Scheda) e le 4 tab non di default di FIRE dietro `lazyComponent` (`components/ui/lazy-component.tsx`, NON `next/dynamic`: la sua Suspense teneva il segnaposto ~300 ms a ogni prima apertura anche col chunk in memoria — decisione del proprietario, 2026-09-30), precaricati a riposo DOPO i dati della pagina, con segnaposto della stessa altezza (`layout-shift` 0 su tutte, 1440 e 390; un'apertura disegna in 3–37 ms); il Sankey pigro e mai sul telefono, precaricato da 640 px; le icone una per chunk da una mappa curata di 121 loader (`dynamicIconImports` di lucide misurato e scartato: +49 KB gz su Cashflow e Impostazioni). Storico › Dettaglio lasciato statico (recharts già iniziale, ~2 KB gz). Misura di chiusura: Storico 1200,9 → 684,0 KB gz, Analisi 744,9 → 564,6, Rendimenti 686,0 → 566,3, FIRE 749,9 → 653,7, Patrimonio +7,4 (l'unione dei moduli recharts → PERF-11); `libraryCopies: { recharts: 1 }`; condivisi alzato 470 → 483 senza crescita di route (`perf/README.md` § Registro). Cold sul mirror, stessa sessione, mediane di 5 (develop di 3): Storico primo numero 2424 → 2177 ms e long task 727 → 597, Analisi 1650 → 1466 e 514 → 318, Patrimonio 756 → 601; warm Analisi 1430 → 1343; JS a freddo (prefetch compreso) 2057 → ~1030 KB |
| PERF-05 | Un solo binario per i dati (hook React Query) | 1 | L | 01 | Fable 5.1 · high | **ritirata il 2026-09-29** — PR #413 in develop dal 2026-09-29; 12 divergenze: otto dove il codice aveva ragione (sotto), due difetti corretti nel ritiro (quattro commenti che citavano ancora `getFIREData`/`getAnnualCashflowData`; la baseline warm di `perf/README.md` non trascritta dalla chiusura), due rimandi voluti (l'avviso di Analisi sulla lettura fallita delle impostazioni, nel blind spot di doc/guide/cashflow-analisi.md; il cold di FIRE che legge tutta E fino a PERF-06, in doc/guide/fire.md); la misura di chiusura: warm sul mirror Storico 1165 → 261 ms e 6 → 0 richieste Firestore, FIRE 1556 → 114 e 6 → 0, Patrimonio 2 → 0, Allocazione 4 → 2, Impostazioni 6 → 0, Rendimenti 13 → 12 (gli stadi 2-5 sono PERF-09); invarianza provata con due dump prima e due dopo su 18 superfici (~4900 cifre), nessun valore perso; `grep` di chiusura = solo hook e servizi. Le decisioni della sessione di implementazione: FIRE a profondità **1** in memoria (`buildFIREData`/`computeAnnualCashflowData`/`computeLastYearExpenses` su `useExpenses` + `useSnapshots`) invece della profondità 2 della spec, `getFIREData` e `getAnnualCashflowData` ritirati; Rendimenti stadio 1 resta imperativo ma legge le sei collezioni con `queryClient.fetchQuery` sulle `…QueryOptions` esportate dagli hook (invalidate prima su «Aggiorna»); Cashflow › Dividendi prende gli asset dalla `useAssets` che la pagina già aveva, niente `fetchQuery`; Impostazioni legge il doc con `fetchQuery(settingsQueryOptions)` (il corrente, `staleTime: 0`, su «Annulla» e sul pre-read di «Salva»), categorie e conti dagli hook — i 71 stati sono PERF-13; il grep allargato a `getAllCategories(` ha trovato CINQUE chiamanti non citati (i tre dialog di categoria e l'import CSV ×2) e `['goalData']` anche in `GoalProposalCard`, tutti sulla chiave; la chiave `costCenters.expenses` è andata (il detail riceve le righe dalla lista, nessuno skeleton proprio); Analisi: la lettura fallita resta non fatale e NON mostrata (un avviso nuovo non è un refactor; blind spot riscritto); il ledger di Patrimonio resta gated sulla meta (un account non migrato non legge un ledger che non ha); `AssetDialog`: i target sono `settings.targets` dello stesso hook, letto solo da aperto. Lezioni a casa: AGENTS.md § React Query and Derived State (la regola e la lista degli hook, `composeReadState`), doc/guide/{storico,patrimonio,centri-di-costo,fire,fire-coast,cashflow,cashflow-analisi,impostazioni,stati}.md |
| PERF-06 | Le spese per finestra | 2 | L | 05 | Fable 5.1 · high | **ritirata il 2026-10-01** — PR #421 in develop dal 2026-10-01; 21 divergenze: diciannove dove il codice aveva ragione e la lezione era già a casa (i bordi nei DUE calendari, `trackingWindow` a fine mese, `budgetWindow` a fine anno e da ottobre a marzo, il suggerimento del dialog Budget su anni interi, le due finestre di FIRE con `recent` chiusa a dicembre, Divisione sul SUO periodo, il periodo di Tracciamento nella page, `useExpenseBounds` e gli anni contigui, nessun `placeholderData`, l'invalidazione mancante dei centri, i dump a tre istanti congelati → `lib/utils/expenseWindows.ts`, AGENTS.md § React Query, doc/guide/{cashflow,cashflow-tracciamento,cashflow-budget,cashflow-divisione,cashflow-analisi,centri-di-costo,fire,cache-persistita,e2e-emulatori}.md, i commenti alle righe), nessun difetto, due rimandi già scritti (gli obiettivi di § 2 mancati — 1072 e 1291 contro < 900 e < 1000, sulla premessa sbagliata di ~350 righe: `perf/README.md`; l'Andamento di Analisi sulle rate future: cashflow-analisi.md § blind spots), una lezione portata nel ritiro (nessun flag di rollback per una finestra: il rollback è il revert → doc/guide/cashflow.md § Expenses by window). Dalla chiusura del 2026-09-30: **la premessa di § 1 non regge sul mirror**: le 1547 righe non sono distribuite su 57 mesi — 1299 stanno nel 2025–2026 — quindi Tracciamento a 13 mesi legge 838 righe (non ~350), Budget 675, FIRE 1299 + 48, e una finestra per Analisi (dal floor 2025 in poi, senza limite superiore perché l'Andamento classifica anche le rate future) ne avrebbe tolte 48. **Decisione del proprietario**: Analisi resta sull'intera collezione, condivisa con Storico e Centri. Misure cold sul mirror (prima/dopo nella stessa sessione, mediane di 5, primo numero): Cashflow 1898 → 1072 ms (long task 210 → 217), FIRE 1737 → 1291 (283 → 153), Analisi 1398 → 1480 (codice invariato); revisit Cashflow 192 → 164, FIRE 213 → 161; nessun obiettivo di § 2 raggiunto (< 900 / < 1000), Cashflow al 56%. Il prezzo: la prima apertura in sessione di Analisi (188 → 1403 warm) e FIRE (114 → 1137) non parte più dalla lista di Cashflow; il record persistito dopo un giro (Tracciamento, Budget, Divisione, FIRE, Storico) tiene 6 chiavi `expenses.*`, 4407 righe, 2,2 MB contro una chiave di 1547 righe, e l'auth della Panoramica con quel record sale a ~165 ms (`doc/guide/cache-persistita.md`). Invarianza: dump a orologio congelato su 33 superfici a tre istanti (30/09, 15/03, 10/01/2027), rumore zero, 0 valori persi; 36 casi unitari di bordi e invarianza in sei fusi, dieci falsificazioni viste rosse, la spec E2E della seconda finestra rossa in due modi. Divergenze dalla spec, decise implementando: bordi in ENTRAMBI i calendari (locale e italiano — con il solo locale un browser a ovest dell'Italia perdeva le righe del 1° dai bucket di Budget); `trackingWindow` chiude a fine MESE dell'intervallo (i grafici disegnano intero l'ultimo mese); `budgetWindow` chiude a fine ANNO (i budget annuali contano il calendario) e a marzo parte da ottobre; il suggerimento del dialog Budget legge anni interi da una finestra sua; FIRE in due finestre (recente per tutte le tab, più vecchia solo per il Dettaglio, che aspetta con uno skeleton); `useExpenseBounds` per gli anni del picker (contigui) e l'account vuoto; nessun flag di rollback (i lettori filtrano in memoria: il rollback è il revert). Trovati per strada: eliminare/rinominare un centro non invalidava le righe riscritte (corretto); l'Andamento di Analisi classifica le categorie sulle rate future (dichiarato in cashflow-analisi.md, non cambiato) |
| PERF-07 | Overview: ricalcolo parallelo, scrittura dopo, `Server-Timing` | 2 | S | 01 | Opus 5.5 · high | **ritirata il 2026-10-03** — PR #423 in develop dal 2026-10-03; 14 divergenze: nove dove il codice aveva ragione e la lezione era già a casa (la pensione che NON degrada per chi ha un fondo — degradare stamperebbe i versamenti come rendimento; la scrittura in `after()` sotto precondizione, `lastUpdateTime` / `create`, perché con un riepilogo fresco per il giorno un'invalidazione arrivata durante il ricalcolo sarebbe stata cancellata per ore; la voce `auth` nel header; il recorder passato al servizio invece dei tempi restituiti; `now` iniettato lungo il ricalcolo; i cinque scrittori senza invalidazione — le cascate di categoria, il dividendo non accreditato, gli obiettivi, il predicato delle impostazioni a 3 campi su 5, il contributo pensione — chiusi nello stesso commit con un test ciascuno; il seed base che deriva di mese → doc/guide/panoramica.md § The materialized summary, AGENTS.md § Caching, doc/guide/e2e-emulatori.md, i commenti alle righe), un difetto corretto nel ritiro, su decisione del proprietario (`buildLiveOverviewPayload` leggeva il mese dal proprio orologio mentre il resto del ricalcolo usa il `now` iniettato — millisecondi in produzione, un payload su due mesi solo per una richiesta a cavallo della mezzanotte di fine mese; ora riceve `now`, e `__tests__/dashboardOverviewService.test.ts` asserisce sull'ARGOMENTO di `getItalyMonthYear`, che in quel file è mockato: visto rosso), quattro rimandi (i tre scrittori minori senza invalidazione, già nei blind spots di panoramica.md; il cold della Panoramica non rimisurato con `perf:bench` — nessun file client toccato, la baseline di `perf/README.md` resta in vigore; il giro in produzione, in sola lettura, che aspetta la release → PERF-08 § 8; le decisioni della sessione → § 9). Misura di chiusura sull'emulatore (mirror, `dev:emulator`, stessa chiamata `GET /api/dashboard/overview` prima/dopo, 15 × invalidazione → GET, mediane di due giri): ricalcolo **105 / 97 → 58 / 57 ms**, lettura fresca 16 → 16 ms; `Server-Timing` in ricalcolo `db` ~45 · `compute` ~2 · `total` ~50, fresco `total` ~7; payload identico al byte prima/dopo (`source` e `freshness` escluse, rumore zero fra due giri dello stesso codice) e identico fra il servizio di `develop` e il nuovo su tre fixture unitarie. Il «prima/dopo» di produzione lo legge il proprietario dalle DevTools. Il «prima/dopo» di produzione lo legge il proprietario dalle DevTools, dopo la release.
| [PERF-08](PERF-08-regione-vercel-europa.md) | Le funzioni Vercel nella regione di Firestore | 3 | S | 07 | Sonnet 5 · medium | da fare |
| [PERF-09](PERF-09-rendimenti-una-lettura.md) | Rendimenti: ogni collezione una volta, una route per i rendimenti | 2 | M | 05, 07 | Fable 5.1 · xhigh | da fare |
| [PERF-10](PERF-10-route-server-leggere-una-volta.md) | Route server: statistiche dividendi, assistente, `Server-Timing` sui profili | 2 | S/M | 07, PERF-00 | Opus 5.5 · high | da fare |
| [PERF-11](PERF-11-patrimonio-righe-leggere.md) | Patrimonio: sparkline all'apertura, un elenco, dialog montati da aperti | 3 | M | 04, 05, 12 | Opus 5.5 · high | da fare |
| [PERF-12](PERF-12-react-compiler.md) | Il React Compiler acceso, con il census | 2 | M | 01 | Opus 5.5 · high | da fare |
| [PERF-13](PERF-13-impostazioni-per-tab.md) | Impostazioni: sei tab, sei viste, una bozza sola | 3 | L | 05, 12 | Fable 5.1 · high | da fare |
| [PERF-14](PERF-14-motion-e-colori-senza-lavoro-al-mount.md) | Motion e colori senza lavoro al mount | 3 | S/M | 12 | Opus 5.5 · high | da fare |

Effort = il livello di ragionamento di Claude Code (`low` · `medium` · `high` · `xhigh` · `max`). Fable 5.1 dove il refactor
attraversa regole di dominio dense (Rendimenti, le finestre delle spese, la shell, la cache onesta); Opus 5.5 dove il lavoro
è meccanico ma esteso; Sonnet 5 per la riga di configurazione.

## 7. Cosa NON fare (deciso il 2026-09-26)

- Migrare il database. Non è la causa.
- `onSnapshot`/realtime: il repo è query + invalidazione (AGENTS.md § React Query) e resta.
- `LazyMotion`/`m` al posto di `motion` in 33 file: poco risparmio, `layout` e `AnimatePresence` vogliono `domMax`.
- Accorciare lo stagger o cambiare un'estetica senza il proprietario: DESIGN.md è suo e non si rigenera.
- Chiudere una spec «a sensazione»: ogni spec dichiara la sua misura in § 2 e la riporta qui.

## 8. Come si rimisura

`npm run perf:build`, `npm run perf:serve` (terminali del proprietario, con gli emulatori e il mirror, porta :3200),
`npm run perf:bench -- --email=mirror@example.com` e `npm run perf:budget` (il manuale è `perf/README.md`; fino al 2026-09-28 si copiava nella radice uno script usa-e-getta) — il `--` è obbligatorio: senza, npm si tiene le
opzioni come `npm_config_*` e lo script non le vede. Una spec o una PR che fa crescere una route alza il suo tetto nello
stesso commit, con la misura, il `raisedBy` e la riga nel registro di `perf/README.md` (§ Il ratchet e il tetto alzato). Firestore emulato risponde in ~1 ms: i waterfall sono più corti che
in produzione, e i tempi delle route server si leggono dal `Server-Timing` (`lib/server/serverTiming.ts`; oggi su `/api/dashboard/overview`) nelle DevTools, in produzione.

## 9. Decisioni del proprietario (2026-09-26)

- Firestore di produzione è in Europa → PERF-08 vale.
- Telefono e desktop alla pari → ordine per rapporto impatto/sforzo.
- Sì all'ultimo dato noto subito, ovunque, con l'etichetta «Aggiornato alle…» → PERF-03.
- Sì al React Compiler con collaudo completo → PERF-12.

**2026-09-27** (integrazione dei contributi esterni):
- Le PR #400, #401 e #403 entrano prima di PERF-01, con le correzioni applicate da noi.
- La proposta #402 la scriviamo noi (PERF-00) ed entra prima di PERF-01; PERF-10 perde § A.
- Una funzione nuova può alzare un tetto del budget nello stesso commit, con la misura prima/dopo → PERF-01 § 9 (oggi `perf/README.md` § Il ratchet e il tetto alzato).

**2026-09-29** (chiudendo PERF-03):
- La riga «Aggiornato alle…» sta nell'header della pagina, non sotto il verdetto → doc/guide/stati.md § The fourth reading.
- Impostazioni non prende uno skeleton più fedele: la vista si semina dal documento in cache e la rilettura arriva dietro → PERF-13 § 1.

**2026-09-30** (ritirando PERF-03):
- I quattro difetti trovati nel confronto si correggono nel ritiro, senza Playwright (nessun effetto a runtime: `tsc`, lint, Vitest).
- Rendimenti al reload si annota in PERF-09 § 1; il demo mai visto in un browser va nei blind spots della sua guida.

**2026-09-30** (implementando PERF-04):
- Un grafico pigro non passa da Suspense: `lazyComponent` (`components/ui/lazy-component.tsx`) al posto di
  `next/dynamic`, che teneva il segnaposto ~300 ms a ogni prima apertura anche con il chunk in memoria → AGENTS.md
  § Dynamic Imports and Module Hygiene.

**2026-09-30** (ritirando PERF-04):
- I cinque difetti del confronto (commenti e rimandi) si correggono nel ritiro; i quattro rimandi mai scritti vanno
  dove vive il loro tema (doc/guide/e2e-emulatori.md, doc/guide/cashflow.md, `perf/README.md` § Il budget).

**2026-09-30** (implementando PERF-06):
- Analisi resta sull'intera collezione delle spese: sul mirror una finestra le toglierebbe 48 righe su 1547 e
  costerebbe una chiave in più nel record e la condivisione con Storico e Centri → doc/guide/cashflow-analisi.md,
  AGENTS.md § React Query. Prima di dare una finestra a una pagina si misura quante righe le toglie.

**2026-10-01** (ritirando PERF-06):
- Una finestra delle spese non ha un flag di rollback: nessun dato scritto cambia forma e ogni lettore filtra in
  memoria, quindi il rollback è il revert → doc/guide/cashflow.md § Expenses by window. Le altre diciannove lezioni
  erano già a casa; i due rimandi (gli obiettivi di § 2 mancati, l'Andamento di Analisi) restano dove la chiusura li
  aveva scritti.

**2026-10-03** (implementando e ritirando PERF-07):
- La lettura dei versamenti pensione NON degrada per chi ha un fondo: fallita, la route rigetta come prima →
  doc/guide/panoramica.md § The materialized summary.
- Il `Server-Timing` porta una voce `auth` oltre a `db`, `compute`, `total` e `source`.
- I cinque scrittori senza invalidazione trovati dal grep si chiudono nello stesso commit; i tre minori restano nei
  blind spots della guida.
- Il difetto trovato nel ritiro (il mese letto dal proprio orologio in `buildLiveOverviewPayload`) si corregge nel
  ritiro, con il suo test visto rosso; senza Playwright (in produzione i due orologi distano millisecondi).
- Deroga a «tutto su main alla fine»: develop va su main PRIMA di PERF-08 e di nuovo dopo, perché il suo «prima» si
  legge in produzione con il header già deployato e le funzioni ancora nella vecchia regione → WORKFLOW.md § 3,
  PERF-08 § 8 (che porta anche il giro di produzione di PERF-07).
