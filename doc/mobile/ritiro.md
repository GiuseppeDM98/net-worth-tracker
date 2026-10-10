# Il prompt di ritiro di una spec MOB

> Il prompt che il proprietario incolla per ritirare UNA spec di questa serie dopo che il suo codice è in `develop`
> (WORKFLOW.md § 3 «Where things are recorded»: una spec si ritira in una sessione sua). Compilato il 2026-10-10 sulle
> misure di quel giorno — ogni segnaposto del corpo è stato sostituito con ciò che il repo diceva allora; chi lo usa
> dopo un cambiamento della serie rimisura i numeri (i grep, i limiti, i precedenti) e lascia il corpo com'è. Il
> ritiro dell'ULTIMA spec porta via la cartella intera, questo file compreso (passo 4). Le quattordici spec PERF non
> avevano un file così: i loro ritiri sono i commit citati in «precedenti», e la regola è in WORKFLOW.md.

```text
SPEC DA RITIRARE: doc/mobile/MOB-NN-nome.md      <- l'unico punto da compilare

Ritira la spec scritta qui sopra. Nel resto di questo prompt <SPEC> è quel percorso, <NN>
il suo numero e <SLUG> il resto del nome senza «.md»: ricavali tu, non chiedermeli. Se il
file non esiste, FERMATI e dimmelo prima di fare qualsiasi cosa.

PREREQUISITO, da misurare e non da assumere: la spec è IN ESERCIZIO, cioè la sua PR è
MERGIATA IN `develop`, il branch di integrazione della serie (WORKFLOW.md § 3 «Where things
are recorded», 2026-10-08: le spec `doc/mobile/` atterrano su `develop` una sessione per
volta; `develop` va su `main` solo dopo l'ultima MOB, con la PR del proprietario) — il numero
della PR e la data si leggono in `git log --first-parent develop --format="%h %ad %s"
--date=short`, e la riga di stato li scrive come le PERF («PR #NNN in develop dal <data>») —
E la MISURA DI CHIUSURA della spec è rifatta sul codice mergiato: `npm run mobile:census --
--email=census@example.com` e poi `npm run mobile:budget` verdi sulla build `perf:build`
servita da `perf:serve` su :3200 con gli emulatori accesi (doc/guide/prima-schermata.md;
doc/mobile/README.md § 8), dal 5 al penultimo giorno del
mese (README § 9, decisione 59), con la riga di README § 6 e la tabella § 3.1 aggiornate
dalla sessione che ha implementato (README § 7, ultimo punto: «ogni spec dichiara la sua
misura in § 2 (`mobile:budget`) e la riporta qui»). NON sono segnali: il deploy su `main` o
su Vercel (arriva dopo l'intera serie: la misura è su `develop`, non in produzione), l'uso
vero del proprietario dal telefono, il giro F sul mirror della sessione di implementazione.
Il caso reale NON è un prerequisito: dove è a portata di giorni lo si cerca e lo si scrive,
ma non lo si aspetta mai — ciò che l'uso vero insegnerà diventa feedback e poi una spec
nuova, e quando il caso arriva si annota nella riga di stato della spec ritirata, come
storia. Il collaudo della sessione di implementazione vale come prova della spec, non
come segnale. DDL: nessuno — la serie non tocca `firestore.rules` né `firestore.indexes.json`
(si deployano a mano, `firebase deploy --only firestore:rules` / `firestore:indexes`,
SETUP.md:80-98) e non scrive migrazioni dati (le one-shot del repo girano alla prima visita
di una pagina, `lib/services/loanMigration.ts` e `app/dashboard/assets/page.tsx`, e sono
del 2026-10-10, fuori serie: il censimento le attraversa nel giro di riscaldamento,
doc/guide/prima-schermata.md § La corsa); l'unica persistenza nuova della serie è `localStorage` per dispositivo
(`mobile-sections:<route>[:<tab>]`, MOB-02; README § 9), che non si deploya e non si migra.
Lo si prova con `git diff <base>..<merge> -- firestore.rules firestore.indexes.json` vuoto
e con `grep -n -i -E "firestore\.rules|indexes|migrazion" doc/mobile/*.md` (il 2026-10-10:
nessuna voce di DDL, solo le due migrazioni citate come trappola nella guida della prima
schermata e in MOB-06 § 4); se la spec ne porta uno, la clausola non vale: FERMATI e chiedi. Se un criterio non
regge, un segnale manca o uno script non è stato
speso, FERMATI e dillo: una spec si ritira intera, mai a metà, e non si ritira una spec
la cui implementazione ha lasciato un «da decidere».

LETTURE OLTRE AL PROMPT STANDARD (WORKFLOW.md, AGENTS.md, CLAUDE.md, COMMENTS.md,
DEVELOPMENT_GUIDELINES.md, la guida del dominio): README.md § Documentation · l'indice
della serie per intero · la spec INTERA, compresa l'intestazione con lo stato scritto
dalla sessione che l'ha implementata e le divergenze dichiarate lì · `git log
--format="%h %s" -- <SPEC>` · i precedenti da imitare: ec7aa1e (2026-10-08, PERF-13:
l'ultimo ritiro con la serie ancora viva — una spec sola cancellata, l'indice resta con la
riga di § 6 trasformata in testo, tre difetti di solo testo corretti, dodici commenti che
perdono il nome della spec e tengono il perché, tsc + lint + Vitest senza Playwright) ·
f2d4ec3 (2026-10-08, PERF-14: l'ultimo che ha chiuso una serie con il suo indice — la
cartella doc/perf/ cancellata, perf/README.md → doc/guide/velocita.md con `git mv` e gli
stessi nomi di sezione, le lezioni del dossier in AGENTS.md § React Query, WORKFLOW.md e
SETUP.md, la riga di README.md § Documentation riscritta, le spec sorelle al presente) ·
0f69692 (2026-10-06, PERF-12: l'ultimo che ha corretto codice a runtime nel ritiro — un
salto di layout trovato rileggendo le 49 riscritture una per una, fissato da
`e2e/lazyTabLanding.ts` visto rosso, su decisione del proprietario, con Playwright 168/168
e `perf:budget` verde) · c25ee02 (2026-10-05, PERF-10: una deroga a «un ritiro non
implementa» decisa dal proprietario, due letture doppie tolte, Playwright 165/165) ·
e8a5227 (2026-09-28, PERF-01: il gemello di MOB-01, lo strumento di misura — `reference/`
cancellata e lo script che vive in `scripts/`, un difetto nel messaggio rosso dello script
corretto, i puntatori in codice, test, SETUP e spec sorelle riscritti al file o alla data) ·
74196cf (2026-09-28, PERF-00: il primo — una lacuna colmata con un test d'identità visto
rosso, i non-obiettivi portati nei blind spots della guida). Ogni riferimento
nel codice a un documento ritirato si riscrive in loco perché il perché resti in piedi
da solo, tenendo le date.

ORDINE DI LAVORO

1) VERIFICA CRITERIO PER CRITERIO, prima di cancellare qualsiasi cosa: per ogni criterio
   di accettazione, esiste nel codice? e la prova è quella che il criterio nomina (il test
   con la sua prova di portanza, la misura del collaudo)? Le decisioni sono state
   rispettate una per una, e le scelte «ribaltabili» sono rimaste com'erano o il
   ribaltamento è scritto? Le divergenze dichiarate sono ancora vere? La documentazione
   della spec è stata fatta (guide, README, CLAUDE.md, i totali rimisurati)? E ogni
   RINVIO («la spec successiva lo eredita», «fuori ambito, dichiarato») ha un erede: il
   codice, una spec viva per esteso, l'indice o CLAUDE.md § Known Issues (Active).
   ⚠️ La verifica si fa CON UN WORKFLOW, in sola lettura e tutto Opus: un agente per
   gruppo di criteri, uno per le decisioni e le scelte, uno per la documentazione e i
   rinvii, uno per i contratti condivisi; a ciascuno la lista e la richiesta di
   percorso:riga per ogni voce, mai una conferma; poi un verificatore per segnalazione.
   Sotto i dieci agenti, nessuno scrive file. I punti che reggono li rileggi in proprio
   prima di correggere; correzione, travaso e tutto ciò che segue li fai tu.
   ⚠️ Una divergenza si CORREGGE o si SCRIVE, mai si accetta in silenzio: è l'ultima
   occasione, dopo il testo sparisce.
   ⚠️ Un difetto trovato: prima la sua CLASSE con un grep su tutto il repo; ogni fix
   vuole il test che lo fissa, provato portante rimettendo il difetto.
   ⚠️ I CONTRATTI CONDIVISI: ciò che questa spec doveva creare per le successive esiste
   con QUEL nome e quella firma? Se no, si aggiornano l'indice e OGNI spec viva che lo
   cita (testo e prompt in fondo).

2) MISURA I RIFERIMENTI, non stimarli: sempre con `--exclude-dir=node_modules
   --exclude-dir=.next --exclude-dir=.next-perf --exclude-dir=.next-e2e --exclude-dir=.git
   --exclude-dir=.mobile-census` — (a) il numero: `grep -rn "MOB-<NN>" .` (al ritiro di
   MOB-01, il 2026-10-10, contava 79 occorrenze: 11 fuori dalla cartella in 8 file tracciati —
   `scripts/mobileCensus.mjs` 2, `scripts/seedCensusE2E.mts`, `lib/utils/mobileBudget.ts`,
   `doc/guide/prima-schermata.md` 2 (fino allo scorporo del 2026-10-10: `velocita.md`), CLAUDE.md 2, AGENTS.md,
   WORKFLOW.md, README.md — 25 in README, 28 nelle otto spec sorelle, 1 in `reference/mobile-census.mjs`,
   11 in questo prompt e 3 nella spec stessa; dopo il ritiro ne restano solo le etichette); (b) il percorso: `grep -rn "doc/mobile/<SPEC senza cartella>" .`
   e `grep -rn "doc/mobile" .` (il 2026-10-10: 19 righe in 7 file di codice e test —
   `scripts/mobileBudget.mts` 4, `scripts/mobileCensus.mjs` 3, `scripts/seedCensusE2E.mts`
   2, `lib/utils/mobileBudget.ts` 4, `__tests__/mobileSurfaces.test.ts` 4,
   `__tests__/mobileCensusFigures.test.ts` 1, `e2e/allocation.mobile.spec.ts` 1 — oltre a
   CLAUDE.md, AGENTS.md, WORKFLOW.md e `doc/guide/prima-schermata.md`); (c) il titolo a parole,
   in italiano e in inglese: `grep -rn -i -E "<le parole del titolo>|<la loro resa
   inglese>" .` (per MOB-01: «censimento in repo», «budget della prima schermata»,
   «first-screen census», «first-screen budget» → il 2026-10-10 14 file, indice, spec e
   SESSION_NOTES compresi, fra cui i tre test, `.gitignore`, AGENTS.md, CLAUDE.md,
   WORKFLOW.md, `doc/guide/prima-schermata.md` e `doc/guide/e2e-emulatori.md`); (d) gli ORFANI
   NUMERICI, cioè una decisione, una
   sezione o una tabella citate col numero senza il documento che le numera: `grep -rn -E
   "README § ?9|§ 9|decision[ei]? [0-9]+|decisions? [0-9]+|§ 3\.1|§ 4\.[0-9]" scripts
   lib __tests__ e2e components app` e lo stesso su CLAUDE.md, AGENTS.md, WORKFLOW.md e
   doc/guide/ (il 2026-10-10: `scripts/mobileCensus.mjs` 2 righe, `scripts/seedCensusE2E.mts`
   3, `lib/utils/mobileBudget.ts` 7, `__tests__/mobileCensusFigures.test.ts` 1,
   `scripts/mobileBudget.mts` 1 — tutte verso README § 9, § 3.1 o un § di MOB-01 —,
   CLAUDE.md «Latest» «decisions 58–59»; in codice le cifre di `README § 9, 13` e simili
   restano valide finché vive l'indice e si riscrivono in regola + data nel ritiro della
   spec che le ha generate, o il giorno dell'ultima); (e) `doc/mobile/budget.json` NON è
   documentazione ma un artefatto vivo: lo leggono `scripts/mobileBudget.mts` (`BUDGET_PATH`,
   riga 31, e `git show HEAD:doc/mobile/budget.json`, riga 45 — righe del 2026-10-10, da
   rileggere con `grep -n`), `scripts/mobileCensus.mjs` (`BUDGET_PATH`: le superfici),
   `__tests__/mobileSurfaces.test.ts` (riga 15) —
   `grep -rn "doc/mobile/budget.json" .` il 2026-10-10: 20 occorrenze in 8 file fuori dalla
   serie e 18 in 9 file dentro; finché vive l'indice resta dov'è. Le ETICHETTE DELLA SERIE
   che restano vive finché vive l'indice: `MOB-NN` nelle intestazioni e in § 5/§ 6/§ 9
   dell'indice, `raisedBy: "MOB-NN: perché"` dentro `budget.json` e nei suoi tre lettori
   (README § 9, decisioni 19 e 22: una voce allargata porta la spec che l'ha allargata — è un
   dato, non un rimando), «(MOB-01)» nella riga del fixture di WORKFLOW.md § 3 e di AGENTS.md
   § Performance tooling, «MOB-02's ARIA shape» in CLAUDE.md «Latest», `doc/mobile/MOB-07
   § 4.2` in `e2e/allocation.mobile.spec.ts:6`. Tre categorie, tre trattamenti: CODICE,
   TEST e COMMENTI → riscritti in loco, veri e autosufficienti senza il documento, con
   le date; SPEC ANCORA VIVE → ripuntate al codice (percorso e nome verificati adesso),
   alla guida o alla regola dove la decisione ora vive; SPEC che la citano come
   appuntamento («dopo la NN») → lasciate.

3) TRAVASA ciò che è ancora operativo, prima di cancellare: il perché di una scelta,
   una decisione precedente RIBALTATA con la data, un limite dichiarato, una trappola
   misurata al collaudo. Un pezzo in UN posto solo: una regola che vale su tutto il repo
   → AGENTS.md, come RULE + DATE + WHERE IT IS PINNED (§ 0; per la serie: § Tailwind
   Breakpoints and Responsive Layout, § Navigation, § Hierarchy, Density and Disclosure,
   § Accessibility, § Performance tooling, § Commands); una regola di UNA pagina → la sua
   guida `doc/guide/<tema>.md`, nella sezione «## Composizione mobile» che MOB-09
   uniforma e che la spec della pagina crea (README § 9, decisione 11: ogni guida dichiara
   l'ordine in § Composizione mobile; il 2026-10-10 nessuna guida l'ha ancora) e, per ciò
   che sembra un bug e non lo è, nei suoi § Per-page blind spots; lo strumento di misura, le
   colonne, il ratchet e il fixture → doc/guide/prima-schermata.md (§ Il censimento e
   § Files); gli account e le trappole del collaudo → doc/guide/e2e-emulatori.md
   e la tabella dei fixture di WORKFLOW.md § 3; le invarianti → il test che le pinna
   (`__tests__/<modulo>.test.ts`, con l'intestazione che dice quale falsificazione l'ha
   vista rossa) e la riga «Suites to run after a change here» del § Files della guida; le
   quattro regole nominate e i token → DESIGN.md e `.impeccable/design.json`, SOLO per mano
   di MOB-09 e dopo l'OK del proprietario sul testo (README § 9, 52 e 54: mai rigenerare
   DESIGN.md); lo stato del progetto → CLAUDE.md «Latest» e § Testing; ciò che l'utente vede
   → README.md (le funzioni) e la riga di README.md § Documentation (la storia della serie,
   il giorno dell'ultima); il perché di UNA riga → il commento a quella riga, in inglese,
   con la data e senza il nome della spec (COMMENTS.md). Il giorno dell'ULTIMA spec, il
   contenuto ancora operativo di README.md della serie va ciascuno in UNA casa: la tabella
   del mirror del 2026-09-26 (§ 3) e la tabella del fixture (§ 3.1, quella che le spec
   aggiornano) → doc/guide/prima-schermata.md (come la baseline PERF del 2026-09-26 è
   § Baseline storica di velocita.md, f2d4ec3); le decisioni di § 9 che
   vincolano ancora il codice → AGENTS.md (regola + data) o la guida della pagina; la
   tabella dei moduli condivisi di § 5 → le guide delle aree che li usano, per nome; § 8
   «Come si rimisura» → prima-schermata.md (oggi già lì: si verifica che non manchi nulla); § 4 le
   tre direzioni e la scelta → README.md § Documentation come storia, con le date;
   `doc/mobile/budget.json` SI SPOSTA e non si cancella mai: la casa proposta, imitando la
   serie PERF (`perf/budget.json` e `perf/routes.json` stanno in `perf/`, fuori da `doc/`),
   è `perf/mobile-budget.json`, con `BUDGET_PATH` e il `git show HEAD:` di
   `scripts/mobileBudget.mts`, `BUDGET_PATH` di `scripts/mobileCensus.mjs`, il `resolve`
   di `__tests__/mobileSurfaces.test.ts` (`grep -n "doc/mobile/budget.json"` dà le righe) e ogni frase di CLAUDE.md, AGENTS.md,
   prima-schermata.md e dei commenti che lo nomina mossi NELLO STESSO commit, `git mv` per tenere
   la storia, e `grep -rn "doc/mobile/budget.json" .` a zero prima del commit;
   `doc/mobile/reference/mobile-census.mjs` (lo script usa-e-getta della baseline) se ne va
   con la cartella, `git log -- doc/mobile/reference/` è il suo archivio, e
   l'intestazione di `scripts/mobileCensus.mjs`, che il 2026-10-10 lo cita per percorso, passa a citarlo
   per data (2026-09-26) e per `git log`. Sostituire, mai
   accumulare. Il prompt, il modello e l'effort in fondo alla spec NON si travasano.

4) CANCELLA la spec (`git rm <SPEC>`): testo, criteri, stato e divergenze restano in
   `git log`, che si cita come archivio. L'indice RESTA finché vive un'altra spec della
   serie.
   ⚠️ SE È L'ULTIMA SPEC DELLA SERIE, si ritira la CARTELLA INTERA — l'indice, il README,
   i file di riferimento, questo stesso prompt — e PRIMA di cancellarla tutto ciò che vi
   vive ancora operativo si travasa nella documentazione del repo con le regole del
   passo 3 e del prompt di fine sessione: le decisioni e le regole della serie che
   valgono ancora → AGENTS.md (regola + data + dove è fissata) o la guida del dominio;
   una regola di sessione nata nella serie → WORKFLOW.md; lo stato → CLAUDE.md; la
   storia della serie, con le date, i master e che cosa ha corretto ogni ritiro → README.md
   § Documentation (come per le serie precedenti); i contratti condivisi → le guide
   delle aree che li usano, per nome. Quel giorno le etichette della serie citate nel
   codice si riscrivono in loco con uno script di sostituzioni esatte che rispetta i
   fine riga per file, e una revisione a campione prima di fidarsi; `git log -- doc/mobile/`
   resta l'archivio, e ogni rimando alla cartella nel repo si riscrive verso di lui.

5) AGGIORNA indici e stato — lo stato vive in PIÙ punti che possono divergere e si
   chiude con un grep, non con una riga: la cartella è `doc/mobile/`; l'indice è
   `doc/mobile/README.md` (§ 6 la tabella di stato, § 3.1 la tabella del fixture, § 5 i
   moduli condivisi con la spec proprietaria, § 8 come si rimisura, § 9 le decisioni
   numerate 1–59, § 10 le domande, e il preambolo che dice quali spec sono fatte); la riga
   di stato ha due forme: nell'intestazione della spec `> Stato: fatta il <data> (README
   § 3.1, decisioni …) · riletta in modo adversariale il 2026-10-10: N rilievi, N decisioni
   · Priorità … · Sforzo … · Dipende da … · Sblocca …` e in § 6 `| [MOB-NN](file) | titolo
   | … | fatta il <data> (…) |`; al ritiro la riga di § 6 perde il link e diventa testo,
   «**ritirata il <data>** — PR #NNN in develop dal <data>; N divergenze: …; la misura di
   chiusura resta: …», la forma delle quattordici righe PERF (`git show
   f2d4ec3^:doc/perf/README.md`, § 6). Lo stato vive in SETTE punti: (1) l'intestazione
   della spec; (2) README § 6 e il preambolo («MOB-01 è fatta (2026-10-10)», riga 13);
   (3) le intestazioni delle spec sorelle «Dipende da: MOB-NN» — dopo il ritiro «MOB-NN
   ritirata il <data>, in develop dal <data>, PR #NNN», come oggi scrivono le PERF — e la
   colonna «Proprietaria» di § 5; (4) CLAUDE.md «Latest» (riga 17) e § Testing («Mobile
   composition», riga 56); (5) AGENTS.md § Commands («While `doc/mobile/` is open») e
   § Performance tooling («2026-10-10, MOB-01») — le righe si rileggono con `grep -n`;
   (6) WORKFLOW.md § 3 (la riga del fixture `census@example.com` «(MOB-01)»; «Where things
   are recorded», il paragrafo «Branches», che dal ritiro di MOB-01 data ogni ritiro);
   (7) README.md § Documentation (la riga `doc/mobile/` della tabella dei file di guida, dal
   2026-10-10, che l'ultimo ritiro riscrive con la storia della serie, come f2d4ec3 fece
   per `perf/`). Se era l'ultima spec, dillo
   esplicitamente e chiudi la serie come l'ultimo precedente.
   `grep -rn -E "MOB-<NN>|<SLUG>" CLAUDE.md AGENTS.md WORKFLOW.md README.md doc/mobile/
   doc/guide/ scripts lib __tests__ e2e` seguito da `grep -rn -E "fatta il|da fare|ritirata
   il|in develop dal|Stato:" doc/mobile/` e da `grep -n -E "MOB-|doc/mobile" CLAUDE.md`
   (prima del ritiro di MOB-01 il suo stato stava in: `doc/mobile/MOB-01-…md:3` «Stato: fatta il
   2026-10-10», README riga 13 «MOB-01 è fatta (2026-10-10)» e riga 281 «fatta il
   2026-10-10 (…)», CLAUDE.md riga 17 «Latest (2026-10-10): MOB-01, the first-screen census
   and its budget» — tre file, quattro righe, una data; dopo: «ritirata il 2026-10-10» nel
   preambolo e in § 6, «ritirata» nelle intestazioni delle sorelle, CLAUDE.md «Latest»)
   deve dire la stessa cosa ovunque.

CANCELLI: nell'ordine — `npx tsc --noEmit` pulito; `npm run lint` a zero; `TZ=Europe/Rome
npx vitest run` E `TZ=UTC npx vitest run` verdi (il 2026-10-10: 228 file / 5076 test;
ogni fixture di data a mezzogiorno, quelle a ridosso della mezzanotte nominate con l'ora
italiana — AGENTS.md § Commands); `npm run perf:budget -- --dist=.next-perf` invariato
dopo `npm run perf:build` (REGOLA DEL BUILD DI VERIFICA: lo script legge la build che la
sua prima riga nomina — `.next` dopo `npm run build`, `.next-perf` con `--dist` dopo
`perf:build`; il 2026-10-05 senza l'opzione lesse una `.next` del 15/08 — e un tetto si
alza solo con `raisedBy` nello stesso commit); la misura di chiusura della serie rifatta
sul codice del ritiro se ha toccato un file dell'app: `npm run mobile:census --
--email=census@example.com` e `npm run mobile:budget` sulla STESSA build `.next-perf`
servita da `perf:serve` su :3200, mai sul dev server (la baseline § 3 è dev, il fixture
§ 3.1 è build: non si confrontano) e mai accanto alla suite Playwright (un server per
volta, WORKFLOW.md § 3); E2E: un ritiro di solo testo e commenti NON gira Playwright
(WORKFLOW.md § 3, quattordici volte così); un difetto a runtime si corregge solo su
decisione del proprietario, con la suite d'area (la riga «Suites to run after a change
here» del § Files della guida) e `npm run test:e2e` INTERO (Java ≥ 21, emulatori accesi,
app su :3100 con `dev:e2e`; il 2026-10-10: 50 spec, 189 test con i 6 setup), e si scrive
in CLAUDE.md § Latest che i segnali vanno rifatti dopo il deploy.
LIMITI: CLAUDE.md «well under 20.000 characters» (CLAUDE.md:10; il 2026-10-10 12.466
caratteri, 75 righe, misurati con `len()` di Python, non con `wc -c` che conta i byte);
AGENTS.md senza tetto scritto, ma tenuto all'indice — il 2026-09-30 (8bfa2d8) è stato
snellito a 103.2k senza perdere una regola, il 2026-10-10 è a 109.801 caratteri e 967
righe: una lezione di dominio NON va lì ma nella sua guida (§ 0), e uno stub di § 3 che
supera i 3–4 punti è una guida che rientra (2700–2970 caratteri furono il segnale,
AGENTS.md:31); WORKFLOW.md 24.393 caratteri e 306 righe, solo lo standard e la sua
traduzione locale (§ 3 in coda: «Do not duplicate project conventions here»); le guide
con il tetto indicativo di ~500 righe ciascuna (oltre si divide per sotto-tema, in una sessione: così il 2026-10-10
`prima-schermata.md` è uscita da `velocita.md`, 514 righe), le più grandi il 2026-10-10 — patrimonio.md 42.090
caratteri / 344 righe, allocazione.md 41.168 / 189, velocita.md 40.033 / 443, e2e-emulatori.md 40.713 / 361,
cashflow.md 38.127 / 322; `prima-schermata.md` 8.439 / 88 —: ciò che l'ultimo ritiro le travasa (README § 3 con § 3.1
e le tabelle dei mock, 9.166 caratteri; § 8, 872) la porta verso i 18.500, e si dichiara. Se sfori, NON tagliare in
chiusura: dimmelo e proponi lo scorporo
come sessione a parte.

⚠️ NON: riassumere una spec dentro un documento che resta · lasciare un rimando a un
file che non esiste più · cancellare date · ritirare senza i segnali (e senza il DDL
speso) · ritirare l'indice finché una spec vive · cominciare la spec successiva prima di
aver ritirato questa · lasciare un dubbio: ogni domanda si fa SUBITO con AskUserQuestion.

Alla fine: riassumi il diff; le occorrenze riscritte per categoria; che cosa hai
travasato e dove; che cosa ha trovato la verifica; l'esito del grep dello stato; qual è
la prossima spec e se i suoi prerequisiti sono in piedi. Se hai corretto codice,
scrivilo anche in CLAUDE.md § Latest: i segnali passati valgono per il codice di PRIMA,
e sul nuovo sono da rifare dopo il deploy. Poi chiedimi l'OK per il commit: un branch
dal branch di integrazione, un solo commit.
```
