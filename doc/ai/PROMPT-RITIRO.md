# Il prompt di ritiro di una spec della serie AI

> Generato il 2026-11-02 da `08_CREA_RITIRO_SPEC`. Chi lo usa dopo un ritiro aggiorna i precedenti e le misure e
> lascia il corpo com'è; il ritiro dell'ultima spec porta via questo file con la cartella.
>
> Il prompt che il proprietario incolla per ritirare UNA spec di `doc/ai/` dopo che il suo codice è in `develop`
> (WORKFLOW.md § 3 «Where things are recorded»: una spec si ritira in una sessione sua, e solo la sessione dopo
> implementa la successiva — `doc/ai/README.md` § 8). Ogni segnaposto del corpo è sostituito con ciò che il repo
> diceva il 2026-11-02, e ogni conteggio è scritto come il COMANDO che lo misura (`grep`, `wc`) accanto al valore di
> quel giorno: i valori invecchiano a ogni ritiro, i comandi no. Questo file è in italiano perché è un prompt del
> proprietario (decisione 34, indice § 3), come il § 11 di ogni spec; le spec, l'indice e le guide restano in inglese
> (WORKFLOW.md regola 4). Il predecessore è il prompt della serie MOB, `git show de8bafc9^:doc/mobile/ritiro.md`; le
> quattordici PERF non ne avevano uno e i loro ritiri sono in `git log -i --grep=retire`.

```text
SPEC DA RITIRARE: doc/ai/AI-NN-nome.md      <- l'unico punto da compilare

Ritira la spec scritta qui sopra. Nel resto di questo prompt <SPEC> è quel percorso, <NN>
il suo numero e <SLUG> il resto del nome senza «.md»: ricavali tu, non chiedermeli. Se il
file non esiste, FERMATI e dimmelo prima di fare qualsiasi cosa.

PREREQUISITO, da misurare e non da assumere: la spec è IN ESERCIZIO, cioè la sua PR è
MERGIATA IN `develop`, il branch di integrazione della serie (WORKFLOW.md § 3 «Where things
are recorded», paragrafo «Branches»: una serie di spec atterra su `develop` una sessione
alla volta e raggiunge `main` insieme dopo il ritiro dell'ultima, con la PR del
proprietario) — il numero della PR e la data si leggono in `git log --first-parent develop
--format="%h %ad %s" --date=short`, e la riga di § 6 dell'indice li scrive «implemented on
<data>, PR #NNN in develop since <data>» — E la prova di chiusura che la spec nomina in § 6
e § 8 è rifatta sul codice mergiato, spec per spec: AI-00 (solo dipendenze, nessuna
funzione nuova) — il gate delle dipendenze di § 6 verde su `develop` dopo il merge, su Node
24 (`node -v` → v24; decisione 33: un gate su Node 22 non è un gate; `package.json`
`engines` chiede «24.x», e il Mac del 2026-11-02 dava v22.14.0, quindi prima `nvm use 24`),
il filtro di accettazione di § 4 muto e `npm audit --json | jq -c '.metadata.vulnerabilities'`
uguale al conteggio scritto in `doc/guide/dipendenze.md` § Status, E il deploy di develop
sano (criterio 8: sulla preview Vercel, autenticati, `/dashboard/assistant` carica,
`/api/dashboard/overview` risponde 200, `/api/prices/bond-quote?isin=…` aperto senza token
risponde 401 e mai 500); AI-01 (solo direzione visiva, «No app code changes») — la sezione
«AI Surfaces» di DESIGN.md committata in `develop` (`grep -c '^### AI Surfaces\|^\*\*The
AI-Accent Rule\*\*\|^\*\*The Question-Card Rule\*\*\|^\*\*The Path-Scene Rule\*\*' DESIGN.md`
→ 4, criterio 8) E la decisione 74 scritta nell'indice (`grep -c '^| 74 |' doc/ai/README.md`
→ 1, con il concetto per superficie, il link del canvas e le critiche, criterio 6) E, se la
scelta non è B, le spec riscritte in quel commit e i «to be reread» di § 6 chiusi da una
rilettura mirata (criterio 7, decisione 37; `grep -c "to be reread" doc/ai/README.md` → 0
prima di ritirare); AI-02..06 — la suite d'area della guida (la riga «Suites to run after a
change here» di doc/guide/consulente.md, assistente.md, cashflow-tracciamento.md) e le E2E
che la spec elenca in § 6 verdi sugli emulatori dal codice mergiato, con la rotta del
modello sempre finta (`page.route`, decisione 39) e il documento dell'emulatore letto in
fase D. NON sono segnali: il deploy su `main` o in produzione (arriva dopo l'intera serie),
l'uso vero del proprietario (una run reale del Consulente con il colloquio, una spesa
registrata davvero dalla chat), il giro F sul mirror della sessione di implementazione, una
preview Vercel che non chiama ciò che spende (la preview non chiama mai
`/api/allocation-advice/run` né un'analisi). Il
caso reale NON è un prerequisito: dove è a portata di giorni lo si cerca e lo si scrive,
ma non lo si aspetta mai — ciò che l'uso vero insegnerà diventa feedback e poi una spec
nuova, e quando il caso arriva si annota nella riga di stato della spec ritirata, come
storia. Il collaudo della sessione di implementazione vale come prova della spec, non
come segnale. DDL: Firestore, nessuna migrazione e nessuna regola o indice nuovo — le spec
non toccano `firestore.rules` né `firestore.indexes.json` (si deployano a mano, `firebase
deploy --only firestore:rules` / `firestore:indexes`, SETUP.md: `grep -n
"firestore:rules\|firestore:indexes" SETUP.md`) e non scrivono script di migrazione:
`grep -n -i -E "firestore\.rules|firestore\.indexes|migrat" doc/ai/*.md` dava il 2026-11-02
una sola riga, AI-05:335, sulla card degli obiettivi che «migra» al meccanismo nuovo — non
è DDL. Lo si prova con `git diff <base>..<merge> -- firestore.rules firestore.indexes.json`
vuoto. Dove una spec scrive CAMPI NUOVI su documenti esistenti — AI-04 `interview` e
`revisionInterview` su `allocationAdvice/{uid}`, AI-05 `proposals` sul messaggio del
thread, AI-06 le regole di categorizzazione come item `preference` della memoria (la
vecchia `archived`) — il segnale non è un DDL ma il documento scritto dall'emulatore nel
collaudo (la fase D della spec: il test usa-e-getta `__tests__/zz-emulator-*.test.ts` con
`FIRESTORE_EMULATOR_HOST`, o la lettura Admin dei documenti dell'E2E), citato nel messaggio
di commit o in `SESSION_NOTES.md`; un documento vecchio senza il campo deve mappare a
`null` (AI-04 criterio 6). Se una spec porta una regola, un indice o una migrazione, la
clausola non vale: FERMATI e chiedi. Se un criterio non regge, un segnale manca o uno
script non è stato speso, FERMATI e dillo: una spec si ritira intera, mai a metà, e non si
ritira una spec la cui implementazione ha lasciato un «da decidere».

LETTURE OLTRE AL PROMPT STANDARD (WORKFLOW.md, AGENTS.md, CLAUDE.md, COMMENTS.md,
DEVELOPMENT_GUIDELINES.md, la guida del dominio): README.md § Documentation · l'indice
della serie per intero · la spec INTERA, compresa l'intestazione con lo stato scritto
dalla sessione che l'ha implementata e le divergenze dichiarate lì · `git log
--format="%h %s" -- <SPEC>` · i precedenti da imitare (`git log -i --grep=ritir
--grep=retire --format="%h %ad %s" --date=short` li elenca tutti, le quattordici PERF e le
nove MOB): bdef4fed (2026-10-16, MOB-08: l'ultimo ritiro con la serie ancora viva E
l'ultimo che ha corretto codice — un workflow in sola lettura su 269 criteri, sei lettori
e tre scettici tutto Opus; sei difetti a runtime corretti su decisione del proprietario,
tre della spec e tre più vecchi trovati dalla lettura, ciascuno visto rosso prima del fix;
le E2E riscritte e sei falsificazioni una per volta; la spec successiva ripuntata;
Playwright intero e i budget rifatti; scritto che i segnali passati valgono per il codice
di PRIMA) · de8bafc9 (2026-10-17, MOB-09: l'ultimo che ha chiuso una serie con il suo
indice — la cartella `doc/mobile/` cancellata, l'artefatto vivo spostato con `git mv`, 753
rimandi a decisioni numerate, sezioni dell'indice ed etichette riscritti in 175 file come
regola + data + casa con uno script di sostituzioni esatte e una revisione a campione, la
storia in README.md § Documentation, `git log -- doc/mobile/` dichiarato archivio, nessun
Playwright perché nessun comportamento era cambiato) · 9d39c104 (2026-10-10, MOB-01: il
ritiro di una spec che non toccava l'app — quattro difetti degli script, i rinvii scritti
nelle spec eredi, nessun Playwright — il modello per AI-00, solo dipendenze, e AI-01, solo
direzione visiva) · f2d4ec36 (2026-10-08, PERF-14: la chiusura precedente di una cartella,
`perf/README.md` → `doc/guide/velocita.md` con `git mv` e gli stessi nomi di sezione, le
lezioni del dossier in AGENTS.md, WORKFLOW.md e SETUP.md). Ogni riferimento
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
   codice, una spec viva per esteso o l'indice, e basta (decisione 22: «CLAUDE.md § Not
   yet present» non esiste in questo repo e non si crea; un § 10 elenca solo ciò che non
   si fa, con la sua decisione, o ciò che un'altra spec della serie fa).
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
   ⚠️ I COMMENTI CHE CONTANO: una spec che AGGIUNGE un ramo lascia indietro i conti e gli
   elenchi chiusi scritti accanto ai nomi che tocca («le due scritture», «i quattro
   gesti», «solo i certificati»), nei commenti e nelle frasi delle guide; nessun cancello
   li legge. Si cercano lì, nei file del commit della spec, e si riscrivono nella forma
   aperta (COMMENTS.md § Keep Comments Updated; nell'Hub, 2026-10-26, quattro commenti e
   una frase di guida in un ritiro solo).
   ⚠️ I CONTRATTI CONDIVISI: ciò che questa spec doveva creare per le successive esiste
   con QUEL nome e quella firma? La lista è `doc/ai/README.md` § 7, riga per riga: la
   colonna «Owner» dice quale spec crea il modulo, «Later users» chi lo usa IDENTICO; si
   leggono le righe con Owner = la spec che si ritira, e per ciascun simbolo si cerca il
   nome nel codice (`grep -rn "<simbolo>" lib components types app __tests__ e2e`). Se
   manca o la firma è un'altra, si aggiornano l'indice e OGNI spec viva che lo cita
   (testo e prompt in fondo).

2) MISURA I RIFERIMENTI, non stimarli: sempre con `--exclude-dir=node_modules
   --exclude-dir=.next --exclude-dir=.next-perf --exclude-dir=.next-e2e --exclude-dir=.git
   --exclude-dir=.mobile-census`, e ogni conteggio va nel riassunto finale, mai qui — (a)
   l'etichetta: `grep -rn -E "AI-<NN>" .`, per file `grep -rc -E "AI-<NN>" . | grep -v
   ":0$"`: fuori da `doc/ai/` il 2026-11-02 erano solo CLAUDE.md (una riga, il «Latest») e
   `doc/guide/dipendenze.md` (12 righe, tutte AI-00); dentro sono l'indice (106 righe con
   un'etichetta), le spec sorelle (da 14 a 66 ciascuna), questo prompt e la spec stessa;
   l'indice § 8 vieta l'etichetta nel codice («no AI-04 in a file, function or test name,
   nor in a comment»), quindi UNA sola occorrenza in `scripts lib __tests__ e2e components
   app types` è un difetto della sessione di implementazione, da riscrivere ora in regola +
   data; (b) il percorso: `grep -rn "doc/ai/<SPEC senza cartella>" .` e `grep -rln "doc/ai"
   . | grep -v "^./doc/ai/"` (il 2026-11-02: CLAUDE.md e dipendenze.md); (c) il titolo a
   parole, in inglese e in italiano, con le parole del titolo di QUELLA spec (per AI-04
   «the interview», «critical friend», «colloquio»; per AI-05 «Registra»,
   «expense-proposal»; per AI-02 «cashflow block», «blocco cashflow»): `grep -rn -i -E
   "<parole>" .`, letto riga per riga, perché un nome di funzione (`buildCashflowBlock`) è
   codice e non un rimando; (d) gli ORFANI NUMERICI, cioè una decisione, una scelta A-N,
   una sezione o un criterio citati col numero senza il documento che li numera: `grep -rn
   -E "decision[s]? [0-9]+|decisione [0-9]+|README § ?[0-9]|AI-0[0-9] § [0-9]+|criterion
   [0-9]+" scripts lib __tests__ e2e components app types` e lo stesso su CLAUDE.md,
   AGENTS.md, WORKFLOW.md, DESIGN.md e doc/guide/ (il 2026-11-02 due righe nel codice,
   entrambe di prima della serie — `lib/services/assetService.ts:925` e
   `components/assets/AssetDialog.tsx:1962` — da non toccare); le scelte A1–A23 di § 4 con
   `grep -rn -E "\(A[0-9]{1,2}\)|choice A[0-9]+" scripts lib __tests__ e2e components app
   types`, che il 2026-11-02 stampava 15 righe tutte di dossier precedenti
   (`costCenterUtils.ts`, `costCenters.ts`, `performanceBaseline.test.ts`,
   `performanceService.test.ts`), da lasciare: contano solo le righe nate con la serie,
   riconoscibili dal file del commit della spec: quelli verso README § 3,
   § 4 o § 7 restano validi finché vive l'indice e si riscrivono in regola + data il
   giorno dell'ultima; quelli verso un § della spec che si ritira si riscrivono ORA. Le
   ETICHETTE DELLA SERIE che restano vive finché vive l'indice, da rileggere con `grep -rn
   -E "AI-[0-9]{2}" CLAUDE.md AGENTS.md WORKFLOW.md README.md DESIGN.md doc/guide scripts lib
   __tests__ e2e components app types`: «AI-NN» nelle intestazioni e in § 5/§ 6/§ 7
   dell'indice; la spec fra parentesi accanto a una data in una guida o nel «Latest» di
   CLAUDE.md, che dice quando e da quale spec, non rimanda a un testo; le righe di
   `doc/guide/dipendenze.md` § Registro → Moves che AI-00 crea (data · pacchetto · da → a ·
   avviso curato · PR) e la riga che AI-03 vi aggiunge per `jsdom` e `@testing-library/*`
   (decisione 21): sono dati, e al ritiro di quella spec l'etichetta diventa la PR e la
   data; le righe di DESIGN.md § 5 «AI Surfaces» che nominassero la spec che le implementa
   (il 2026-11-02 `grep -c -E "AI-0[0-6]" DESIGN.md` → 0: AI-01 scrive la sezione, AI-03..06
   la implementano — il grep qui sopra le copre); un rimando per percorso a una spec
   ANCORA VIVA (`grep -rn "doc/ai/AI-" CLAUDE.md doc/guide`) resta fino al ritiro di QUELLA
   spec. Tre categorie, tre trattamenti: CODICE,
   TEST e COMMENTI → riscritti in loco, veri e autosufficienti senza il documento, con
   le date; SPEC ANCORA VIVE → ripuntate al codice (percorso e nome verificati adesso),
   alla guida o alla regola dove la decisione ora vive; SPEC che la citano come
   appuntamento («dopo la NN») → lasciate.

3) TRAVASA ciò che è ancora operativo, prima di cancellare: il perché di una scelta,
   una decisione precedente RIBALTATA con la data, un limite dichiarato, una trappola
   misurata al collaudo. Un pezzo in UN posto solo: una regola che vale su tutto il repo
   → AGENTS.md, come RULE + DATE + WHERE IT IS PINNED (§ 0; per la serie: § Firestore
   Writes per le scritture dalla card, § Server Layer and API Authorization → server.md
   per il PATCH e lo stream, doc/guide/motion.md per le varianti di scena, § Accessibility,
   § Commands per il gate delle dipendenze e il progetto `dom` di Vitest, § Browser-Driven
   E2E per la rotta finta; gli stub di § 3 «Allocazione › Consulente», «Assistant ·
   Assistente» e «Cashflow › Tracciamento» restano a 3–4 punti, oltre è una guida che
   rientra); una regola di UNA pagina → la sua guida `doc/guide/<tema>.md` (`consulente.md`
   § The path, § The run, § The report and «Applica» e il § The visual direction che AI-01
   crea; `assistente.md`; `cashflow-tracciamento.md` per il ponte; `cashflow.md` per le
   meccaniche condivise di una riga; `dipendenze.md` per l'audit e il registro; `temi.md`
   per l'accento sotto AA) e, per ciò che sembra un bug e non lo è, nei suoi § Per-page
   blind spots (`grep -ln "Per-page blind spots" doc/guide/*.md | wc -l`: 37 guide su 40 il
   2026-11-02); gli account, i fixture e le trappole del collaudo → doc/guide/e2e-emulatori.md
   (la rotta finta e la chiave reale di `.env.local`, decisione 39, che AI-03 vi scrive) e
   la tabella dei fixture di WORKFLOW.md § 3; le invarianti → il test che le pinna
   (`__tests__/<modulo>.test.ts`; i componenti e gli hook in `.test.tsx` sul progetto `dom`,
   decisione 21, con l'intestazione che dice quale falsificazione l'ha vista rossa) e la
   riga «Suites to run after a change here» del § Files della guida (`grep -ln "Suites to
   run after a change here" doc/guide/*.md | wc -l`: 23 il 2026-11-02); le tre regole
   nominate, i token e la tabella del moto → DESIGN.md § 5 «AI Surfaces» e
   `.impeccable/design.json` `extensions.motion`, SOLO per mano di AI-01 (ritirata il 2026-11-06:
   da allora le spec eredi vi aggiungono solo la riga «Implemented on» del loro § 9) e dopo l'OK del
   proprietario sul testo (mai rigenerare DESIGN.md; il sidecar si verifica con uno script
   prima di riscriverlo); lo stato del progetto → CLAUDE.md «Latest» (una riga: la domanda
   e il rimando, il dettaglio nella guida) e § Known Issues (il primo punto, `npm audit`,
   che AI-00 riscrive); ciò che l'utente vede → `Draft Release Temp.md` (una voce per
   superficie, riscritta al suo stato finale; mai la parola «ritirata») e README.md (le
   funzioni), e la storia della serie → README.md § Documentation il giorno dell'ultima;
   il perché di UNA riga → il commento a quella riga, in inglese, con la data e senza il
   nome della spec (COMMENTS.md). Il giorno dell'ULTIMA spec, il contenuto ancora
   operativo di `doc/ai/README.md` va ciascuno in UNA casa: § 1 le parole del proprietario
   e § 2 l'analisi di partenza → storia, in README.md § Documentation; § 3 le decisioni e
   § 4 le scelte che vincolano ancora il codice → AGENTS.md (regola + data) o la guida
   dell'area, e ogni «decision N» o «A-N» citata in codice, test e guide riscritta come
   regola datata; § 7 i contratti condivisi → le guide delle aree che li usano, per nome
   (`consulente.md`, `assistente.md`, `cashflow-tracciamento.md`, `dialog.md` per
   `ChoiceList` e `QuestionCard`, `e2e-emulatori.md` per il harness `dom`); § 8 le regole
   della serie che valgono oltre la serie → AGENTS.md o la guida se non vi sono già (il
   system prompt identico per ogni utente è già in `assistente.md`, `grep -n
   "byte-identical" doc/guide/assistente.md`; «una sonda non apre un controllo che
   spende» è già in WORKFLOW.md § 3, `grep -n "SPENDS" WORKFLOW.md`); § 10 ciò che non si
   fa → i blind spots della guida interessata; `doc/ai/reference/` (i concept HTML e
   `sample.json` di AI-01) se ne va con la cartella, `git log -- doc/ai/reference/` è il
   suo archivio, e fuori da `doc/ai/` nessuno lo cita per percorso (la prova di AI-01, 2026-11-06:
   `grep -rn "doc/ai/reference" DESIGN.md doc/guide` → 0; se una frase lo cita, passa alla
   data e a `git log`). Sostituire, mai accumulare.
   In CLAUDE.md una riga di modulo resta la domanda e il rimando: la data, il tipo nuovo,
   il dettaglio vanno nella guida, mai in coda alla riga (nell'Hub, 2026-10-12 → 2026-10-17,
   così CLAUDE.md è tornato da 20k a 27k caratteri).
   Il prompt, il modello e l'effort in fondo alla spec NON si travasano.

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
   fine riga per file, e una revisione a campione prima di fidarsi; `git log -- doc/ai/`
   resta l'archivio, e ogni rimando alla cartella nel repo si riscrive verso di lui.

5) AGGIORNA indici e stato — lo stato vive in PIÙ punti che possono divergere e si
   chiude con un grep, non con una riga: la cartella è `doc/ai/`; l'indice è
   `doc/ai/README.md` (`grep -n "^## " doc/ai/README.md` dà le sezioni: § 3 le decisioni
   numerate — l'ultimo numero con `grep -o -E "^\| \*?\*?[0-9]+" doc/ai/README.md | grep -o
   -E "[0-9]+" | sort -n | tail -1`, 74 il 2026-11-02, e una decisione presa nel ritiro
   prende il SUCCESSIVO, mai un numero già usato —, § 4 le scelte adottate A1–A23 con la
   spec che le usa, § 5 l'ordine e le dipendenze, § 6 la tabella di stato, § 7 i contratti
   condivisi con la colonna Owner, § 8 le regole della serie, § 9 la riga per il prompt 08,
   § 10 ciò che non si fa; e il preambolo, che dice quando la serie è stata letta e da
   che cosa parte). La riga di stato ha la forma scritta sotto § 6 («How the status is
   marked»): «written on …» → «read on … (adversarial reading, N findings, decisions N–M
   in § 3)» → «implemented on …, PR #… in develop since …» → «**retired on …**» con una riga
   di esito (divergenze, difetti, dove sono andate le lezioni); il 2026-11-02 tutte e
   sette dicevano «read on 2026-11-01 (…)» (`grep -c "read on 2026-11-01" doc/ai/README.md`
   → 7). Al ritiro la riga di § 6 perde il link e diventa testo, la forma delle righe già
   ritirate (`grep -n "retired on" doc/ai/README.md`). Lo stato vive in SEI punti, ciascuno
   da rileggere con `grep -n` e mai per numero di riga: (1) l'intestazione della spec, un
   blockquote in prosa (`sed -n 3,12p <SPEC>`: «Written on 2026-11-01 from `develop` @
   b9411a4d … Read adversarially on 2026-11-01: N findings applied»; in AI-04 «Read
   adversarially on» e la data stanno su due righe, quindi si cerca `grep -c "Read
   adversarially" doc/ai/AI-0*.md`, non la frase intera; la sessione di implementazione
   vi aggiunge «Implemented on <data>, PR #NNN» e può averla lasciata indietro mentre § 6
   dice «implemented» — si allinea qui); (2) README § 6 e il preambolo (`grep -n -E "read
   on|implemented on|retired on" doc/ai/README.md`); (3) le intestazioni delle spec sorelle
   «**depends on AI-NN**» / «**AI-NN depends on it**» (`grep -n -o -E "\*\*depends on
   [^*]*\*\*|\*\*AI-0[0-9][^*]*depend[^*]*\*\*" doc/ai/AI-0*.md`, dieci occorrenze il
   2026-11-02), la colonna «Depends on» di § 6, le righe di § 5 e la colonna «Owner» di § 7
   — dopo il ritiro «AI-NN (retired on <data>, in develop since <data>, PR #NNN)»; (4)
   CLAUDE.md «Latest» (`grep -n -E "AI-0|doc/ai" CLAUDE.md`, una riga il 2026-11-02) e, per
   AI-00, il primo punto di § Known Issues (`grep -n "npm audit" CLAUDE.md`); (5)
   `doc/guide/dipendenze.md` — § Status «Next step», la colonna della tabella e il titolo
   «How an upgrade is done (the contract of AI-00)» (`grep -n "AI-0" doc/guide/dipendenze.md`,
   12 righe il 2026-11-02; dopo AI-00 diventano date, regole e righe di § Registro → Moves);
   (6) README.md § Documentation, che il 2026-11-02 NON nominava la serie (`grep -c "doc/ai"
   README.md` → 0): l'ultimo ritiro vi scrive la storia come il paragrafo «The
   mobile-composition series» (`grep -n "mobile-composition series" README.md`).
   WORKFLOW.md § 3 non nomina la serie (`grep -c "doc/ai" WORKFLOW.md` → 0): il suo
   paragrafo «Branches» rimanda alla tabella di § 6 per sapere quale spec è in `develop`.
   Se era l'ultima spec, dillo esplicitamente e chiudi la serie come l'ultimo precedente.
   `grep -rn -E "AI-<NN>|<SLUG>" CLAUDE.md AGENTS.md WORKFLOW.md README.md DESIGN.md doc/ai/
   doc/guide/ scripts lib __tests__ e2e components app types` seguito da `grep -rn -E
   "written on|read on 2026|Read adversarially|implemented on|Implemented on|retired
   on|Retired on|in develop since|to be reread" doc/ai/` e da `grep -n -E "AI-0|doc/ai"
   CLAUDE.md doc/guide/dipendenze.md` (prima del ritiro: «implemented on» in § 6,
   «Implemented on» nell'intestazione della spec e il «Latest» di CLAUDE.md; dopo: «retired
   on <data>» nel preambolo e in § 6, «retired on» nelle intestazioni delle sorelle che la
   nominavano e nella colonna Owner di § 7, CLAUDE.md «Latest», e per AI-00 `dipendenze.md`
   senza un «Next step» verso la spec) deve dire la stessa cosa ovunque.

CANCELLI: nell'ordine di WORKFLOW.md § 3 «The commands that exist», e PRIMA di tutto
`node -v` → v24 (decisione 33: un gate su Node 22 non è un gate; `package.json` `engines`
«24.x»; il Mac del 2026-11-02 dava v22.14.0, quindi `nvm use 24` prima) — `npx tsc
--noEmit` pulito; `TZ=Europe/Rome npx vitest run` E `TZ=UTC npx vitest run` verdi (ogni
fixture di data a mezzogiorno, quelle a ridosso della mezzanotte nominate con l'ora
italiana — AGENTS.md § Commands; da AI-03 in poi la suite ha due progetti, `node` per
`.test.ts` e `dom` per `.test.tsx`, decisione 21, e si leggono entrambi i totali), con i
totali nel messaggio di commit e mai in CLAUDE.md (WORKFLOW.md § 2, «The outcome is one
line, the signals are not»); `npm run lint` a zero; `npm run perf:budget` invariato dopo
`npm run build` (REGOLA DEL BUILD DI VERIFICA: lo script legge la build che la sua prima
riga nomina — `.next` dopo `npm run build`, `.next-perf` con `-- --dist=.next-perf` dopo
`perf:build`; il 2026-10-05 senza l'opzione lesse una `.next` del 15/08 — e un tetto si
alza solo con `raisedBy` e una riga in doc/guide/velocita.md § Registro dei tetti alzati
nello stesso commit); per AI-00 anche il gate delle dipendenze intero di § 6 (il filtro di
accettazione, le righe di `npm ls`, Storybook costruito fuori dal repo); se il ritiro
tocca ciò che una pagina composta mostra per prima (una scena del Consulente a 390, un
riquadro di Allocazione), `npm run mobile:census -- --email=census@example.com` e `npm run
mobile:budget` sulla STESSA build `.next-perf` servita da `perf:serve` su :3200, mai
accanto alla suite Playwright (un server per volta, WORKFLOW.md § 3) — l'Assistente non è
fra le superfici del budget (`perf/mobile-budget.json` = `navigation.ts` meno l'assistant,
AGENTS.md § Commands); E2E: un ritiro di solo testo e commenti NON gira Playwright
(WORKFLOW.md § 3; così le quattordici PERF, MOB-01 e MOB-09); un difetto a runtime si
corregge solo su decisione del proprietario, con la suite d'area (la riga «Suites to run
after a change here» del § Files della guida) e `npm run test:e2e` INTERO (Java ≥ 21,
emulatori accesi, :3100 libera o tenuta dal `dev:e2e` di questo repo — un'altra app lì
viene riusata da Playwright e la ferma il proprietario, doc/guide/e2e-emulatori.md; la
rotta del modello sempre finta con `page.route`, mai una spesa, decisione 39; un rosso fra
i flake noti della guida si ripete da solo con `--repeat-each=3`, un secondo rosso dello
stesso test ferma), e si scrive in CLAUDE.md § Latest che i segnali vanno rifatti dopo il
deploy.
LIMITI: tetti e comandi, con la misura del 2026-11-02 accanto — CLAUDE.md «well under
20.000 characters» (lo dice di sé in § Project Overview), contato in caratteri: `node -e
'console.log([...require("fs").readFileSync("CLAUDE.md","utf8")].length)'` → 15.562
(`wc -c CLAUDE.md` → 15.768: conta i byte, e «», € e — ne valgono due o tre); AGENTS.md
~1000 righe (AGENTS.md § 0, proprietario 2026-10-10: `wc -l AGENTS.md` → 991, nove righe
sotto il tetto: una regola nuova della serie entra solo se una vecchia esce o si accorcia,
una lezione di dominio NON va lì ma nella sua guida, e uno stub di § 3 che supera i 3–4
punti è una guida che rientra); WORKFLOW.md solo lo standard e la sua traduzione locale
(§ 3 in coda: «Do not duplicate project conventions here»); le guide ~500 righe ciascuna
(AGENTS.md § 0; oltre si divide per sotto-tema in una sessione sua, come
`prima-schermata.md` uscì da `velocita.md` il 2026-10-10), le più vicine al tetto con `wc
-l doc/guide/*.md | sort -n | tail -6`: il 2026-11-02 `e2e-emulatori.md` 479, `velocita.md`
464, `patrimonio.md` 453, `prima-schermata-misure.md` 402, `cashflow.md` 354,
`panoramica.md` 333; quelle che la serie ingrossa partivano da `assistente.md` 296,
`cashflow-tracciamento.md` 250, `consulente.md` 205, `temi.md` 186, `dipendenze.md` 75
(AI-00 § 9: «stays under 100»), ed `e2e-emulatori.md` a 479 è quella che la decisione 39 e
i fixture nuovi portano oltre il tetto per prima; il giorno dell'ultima spec si misura
PRIMA del travaso quanto porta l'indice (`awk '/^## 7\./,/^## 8\./' doc/ai/README.md | wc
-l` per i contratti, lo stesso da `## 3.` a `## 5.` per le decisioni e le scelte), lo si
somma alle righe delle guide di destinazione e si dichiara. Se sfori, NON tagliare in
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
e sul nuovo sono da rifare dopo il deploy. Poi chiedimi l'OK per il commit: sul branch di
sessione, aperto da quello attivo prima della prima modifica (WORKFLOW.md), un solo commit.
```
