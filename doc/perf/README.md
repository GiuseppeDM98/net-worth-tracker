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

Quattro sessioni indipendenti possono partire subito dopo PERF-01: **PERF-05** (dati), **PERF-04** (bundle), **PERF-07 →
PERF-08 / PERF-10** (server), **PERF-12** (compiler). PERF-02 (in develop dal 2026-09-29) e PERF-03 sono le due che il
proprietario SENTE di più; PERF-03 vuole PERF-05 prima. Due spec che toccano lo stesso punto se lo sono spartito: il
`layout="position"` delle pagine è di PERF-14 sola; il `getDoc` bloccante di `AuthContext` è già andato (2026-09-28,
`contexts/AuthContext.tsx`); la lettura delle impostazioni di `AssetDialog` chiuso è di PERF-05 sola; il secondo
`MotionConfig` del layout dashboard è già andato (2026-09-28); la cache dell'Esposizione è già in repo
(`lib/server/exposure/instrumentProfileService.ts`; PERF-10 vi aggiunge il `Server-Timing`); il Sankey del Flusso dietro `next/dynamic` è di PERF-04 sola.

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
| PERF-02 | La shell prima dell'autenticazione | 2 | M | 01 | Fable 5.1 · xhigh | **ritirata il 2026-09-29** — PR #411 in develop dal 2026-09-29; 15 divergenze: dodici dove il codice aveva ragione e la lezione era già a casa (il marcatore `auth` in `main`, «testo» 265 e non «> 300» → `perf/README.md` e i commenti di `scripts/perfBenchmark.mjs` e `lib/utils/perfBudget.ts`; la silhouette del `PageHeader` nel fallback e l'etichetta «Verifica dell'accesso» → doc/guide/stati.md; il `pageerror` di React 19, i sei setup sull'email a 1440 e l'helper `e2e/shellBoot.ts` → doc/guide/e2e-emulatori.md; il tema al primo rAF e il tipo `ColorTheme` derivato dalla lista → doc/guide/temi.md; il `getDoc` dopo il cancello e l'eccezione del demo → doc/guide/accesso-registrazione.md), due difetti elencati e NON corretti (due `MotionConfig` ancora annidati sotto il root `MotionProvider` — `app/page.tsx`, `components/auth/AuthShell.tsx` — mentre `template.tsx` e AGENTS.md § Motion lo chiamano «the ONE»; cinque commenti chiamano `hidden desktop:flex` una sidebar fissa che è `desktop:block`), un rimando voluto (il frame di chrome vuoto prima di /login, accettato nei blind spots di accesso-registrazione.md); la misura di chiusura resta: «testo» 265, lo skeleton della shell nel DOM a 23–31 ms, CLS 0 (`perf/README.md` § Baseline) |
| [PERF-03](PERF-03-ultimo-dato-noto-subito.md) | L'ultimo dato noto subito, il fresco appena arriva | 2 | M | 02, 05 | Fable 5.1 · xhigh | da fare |
| [PERF-04](PERF-04-bundle-recharts-pdf-lucide.md) | recharts una volta, il PDF, le icone e il Sankey quando servono | 2 | M | 01 | Opus 5.5 · high | da fare |
| [PERF-05](PERF-05-un-solo-binario-react-query.md) | Un solo binario per i dati (hook React Query) | 1 | L | 01 | Fable 5.1 · high | da fare |
| [PERF-06](PERF-06-spese-per-finestra.md) | Le spese per finestra | 2 | L | 05 | Fable 5.1 · high | da fare |
| [PERF-07](PERF-07-overview-ricalcolo-parallelo.md) | Overview: ricalcolo parallelo, scrittura dopo, `Server-Timing` | 2 | S | 01 | Opus 5.5 · high | da fare |
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
in produzione, e i tempi delle route server si leggono dal `Server-Timing` (PERF-07) nelle DevTools, in produzione.

## 9. Decisioni del proprietario (2026-09-26)

- Firestore di produzione è in Europa → PERF-08 vale.
- Telefono e desktop alla pari → ordine per rapporto impatto/sforzo.
- Sì all'ultimo dato noto subito, ovunque, con l'etichetta «Aggiornato alle…» → PERF-03.
- Sì al React Compiler con collaudo completo → PERF-12.

**2026-09-27** (integrazione dei contributi esterni):
- Le PR #400, #401 e #403 entrano prima di PERF-01, con le correzioni applicate da noi.
- La proposta #402 la scriviamo noi (PERF-00) ed entra prima di PERF-01; PERF-10 perde § A.
- Una funzione nuova può alzare un tetto del budget nello stesso commit, con la misura prima/dopo → PERF-01 § 9 (oggi `perf/README.md` § Il ratchet e il tetto alzato).
