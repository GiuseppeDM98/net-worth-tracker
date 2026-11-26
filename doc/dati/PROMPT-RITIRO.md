# Il prompt di ritiro di una spec della serie `doc/dati/`

> Generato il 2026-11-24 da `08_CREA_RITIRO_SPEC`. Chi lo usa dopo un ritiro aggiorna i precedenti e le misure e
> lascia il corpo com'è; il ritiro dell'ultima spec porta via questo file con la cartella.
>
> Ritiri fatti: 01 (2026-11-24, solo documenti); 02 (2026-11-24: il cron lanciato a mano dal proprietario su Vercel come
> controllo in produzione, un commento corretto); 03 (2026-11-24: solo etichette riscritte, controllo del proprietario su Rendimenti, Previdenza e Panoramica); 04 (2026-11-24: controllo del proprietario in produzione; CORRETTO CODICE su sua decisione — Movimenti tiene modifica ed elimina mentre rilegge una copia restaurata, il 409 del rosso di `assets.trade-fee`, test visto rosso, Playwright intera; 22 etichette dei test della spec riscritte nella mutazione che li fa rossi — cinque provate a campione —, tre rimandi a sezioni nelle sorelle ripuntati al codice, C8 allineato, un angolo cieco e due suite nella guida); 05 (2026-11-25: controllo del proprietario in produzione; due commenti, una frase di guida e quattro rimandi nelle sorelle riscritti, la costante dell'orfano nominata nel suo modulo, nessun codice corretto); 06 (2026-11-25: controllo del proprietario in produzione; CORRETTO CODICE su sua decisione — lo scenario `asset` di `perf:census` ripuntato su «Fondo Pensione», perché un tipo del registro non ha più «Quantità» alla creazione —, tre commenti e tre frasi di guida con il numero di decisione riscritti, quattro commenti e due frasi rimaste sulla «Posizione iniziale» corretti, la frase della commissione nativa a 0 resa vera, la mutazione nell'intestazione di sette test, sette rimandi nelle sorelle ripuntati al codice e alle guide); 07 (2026-11-25: controllo del proprietario in produzione; solo testo, nessun codice corretto — 87 voci, 24 segnalate, 19 rette —: quattro date «prima del 2026-11-23» dove la regola vale dal deploy del 2026-11-25, tre sigle orfane nella guida («C2», due numeri di decisione), le mutazioni dei quattro test del dialog viste rosse dalla sessione e scritte nell'intestazione, quella della E2E dal commit d'implementazione, tre sigle di test incrociate tolte, la frase della proposta di ritenuta resa vera per un emittente estero, la quarta frase del cambio e `describeDividendFxRefusal` dichiarate nella guida, l'erede del rinvio sugli scaricati a 26% scritto fra gli angoli ciechi, la voce delle note di rilascio portata in testa, C8 con la nota «As built»); 08 (2026-11-26: controllo del proprietario in produzione; CORRETTO CODICE su sua decisione — tre classi `not-prose` morte tolte dalle schede dell'Assistente, fissate da `__tests__/markdownProseClasses.test.ts`, che legge le stringhe dei sorgenti perché il test del messaggio non vedeva le schede, visto rosso; la classe morta era il gancio di `e2e/assistant.register.question.spec.ts` (ora `data-question-block`) e un'attesa di `expenseProposalCard.test.tsx`, trovati dal Vitest intero: la regola in AGENTS.md § Audit habits; Playwright intera —; 125 voci, 31 segnalate, tutte di testo tranne quella: sei etichette «DATI-08» nel codice, nei test e nelle E2E e sette nelle guide e in DESIGN.md riscritte in data, le sigle di test della spec (P2, P3, R1 — che puntava al test sbagliato —, A1) e «C4» nella guida rese nomi di test, due commenti rimasti al tetto di Registra (`ASSISTANT_QUESTION_MAX_PER_MESSAGE`, l'intestazione di `AssistantQuestionBlock`) resi veri, la data «salvata prima del 2026-11-25» portata al deploy del 2026-11-26, le mutazioni del § 6 scritte nell'intestazione dei test unitari — tre provate a campione —, cinque rimandi nelle sorelle 09 e 16 ripuntati al codice e alla guida, C4 con la nota «As built»); le altre tredici sono `read`, nessuna implementata.
>
> Il prompt che il proprietario incolla per ritirare UNA spec di `doc/dati/` (`doc/dati/README.md` § 8 regola 12:
> implementazione → ritiro → implementazione). Ogni segnaposto del corpo è sostituito con ciò che il repo diceva il
> 2026-11-24 su `docs/prompt-ritiro-dati-2026-11-24` (da `develop` @ 1e48793a), e ogni conteggio è scritto come il
> COMANDO che lo misura accanto al valore di quel giorno: i valori invecchiano a ogni ritiro, i comandi no. Il file è
> in italiano perché è un prompt del proprietario, come il § 11 di ogni spec (WORKFLOW.md regola 4); le spec,
> l'indice e le guide restano in inglese. Il predecessore è il prompt della serie di novembre:
> `git show 9b1a937b^:doc/nove/PROMPT-RITIRO.md`.

```text
SPEC DA RITIRARE: doc/dati/DATI-NN-nome.md      <- l'unico punto da compilare

Ritira la spec scritta qui sopra. Nel resto di questo prompt <SPEC> è quel percorso, <NN>
il suo numero e <SLUG> il resto del nome senza «.md»: ricavali tu, non chiedermeli. Se il
file non esiste, FERMATI e dimmelo prima di fare qualsiasi cosa.

PREREQUISITO, da misurare e non da assumere: la spec è IN ESERCIZIO, cioè QUATTRO segnali,
tutti (proprietario, 2026-11-24: indice § 3 decisione 95, § 8 regole 12 e 13) — (1) la PR
della spec è MERGIATA IN `develop` e la sua riga di § 6 dell'indice dice `implemented`:
numero e data in `git log --first-parent develop --format="%h %ad %s" --date=short`; (2)
quel commit è su `main`, cioè in produzione — in questa serie `develop` va su `main` dopo
OGNI spec, con la PR che apre il proprietario (decisione 39; WORKFLOW.md § 3 «Where things
are recorded», paragrafo «Branches»): `git fetch origin`, poi `git merge-base --is-ancestor
<commit della spec> origin/main && echo su-main`; (3) la prova di chiusura che la spec
nomina è rifatta sul codice mergiato, PRIMA di qualsiasi modifica: la suite d'area (la riga
«Suites to run after a change here» del § Files della guida del dominio) e le E2E che la
spec elenca in § 6 verdi sugli emulatori, più le misure che il suo § 8 «Putting it into
service» scrive — `perf:budget` sulle rotte che nomina (02, 03, 05, 06, 08, 12–14, 16–21),
`mobile:census` + `mobile:budget` dove li nomina (03, 05, 12, 13, 14, 20), con la regola
dei due budget (indice § 8 regola 7: un tetto alzato di ≤ 1 KB gz ha `raisedBy` e la riga
in doc/guide/velocita.md § Registro; `mobile:budget` a confronto con `develop` lo stesso
giorno, stessa build); per 01, solo documenti, la prova sono i grep del suo § 2; (4) IL MIO
CONTROLLO IN PRODUZIONE è fatto e detto, quello che il § 8 della spec nomina sul mio
account vero, spec per spec: 01 — nessuno; 02 — la mattina dopo la prima corsa delle 18:00
UTC, una chiave sotto `days` per account, poi `npm run mirror:seed -- <email>` registra un
mese giornaliero copiato e `npm run mirror:remove` lo chiude; 03 — Rendimenti, Previdenza,
Panoramica; 11 — Vercel › Cron Jobs elenca quattro voci; 20 — aperta un'obbligazione, si
legge «Taglio minimo» 1.000; 21 — la fase F INTERA, che per questa spec segue il merge su
`main` (le fasi A–E prima); le altre (04–10, 12–19) — la novità della spec vista sul conto
vero dopo il merge (regola 13: «the checks on the owner's production account follow each
merge and precede the spec's retirement»). Sta scritto nella riga di § 6, nel «Latest» di
CLAUDE.md o nel messaggio del commit di implementazione; se non c'è me lo chiedi con
AskUserQuestion, e a «non ancora» ti FERMI. NON sono segnali: `develop` da solo; la preview
Vercel della PR (tiene il solo account demo, che blocca ogni funzione AI — WORKFLOW.md
§ 3); il giro F sul mirror della sessione di implementazione; e ciò che aspetta il
CALENDARIO, che è il caso reale — 10: il primo invio automatico, il 1° del mese dopo il
merge; 11: la prima «Revisione delle spese» (il 1° del mese seguente, o la sera stessa se
l'interruttore si accende nei primi tre giorni del mese); 13: la linea giornaliera, che
compare da sola al 20° giorno dopo che 02 è in produzione; 14: «Sui giorni», spento sotto i
60 rendimenti utili; 09 e 15: la riga di log `tools: N calls, R rounds, S s` «da leggere
nella prima settimana»; 04 e 07: i record ancora da pagare, corretti dal passaggio del
giorno di pagamento via via che scadono; 18: i ratei che digito sui miei acquisti passati.
Ciò che di questo resta da vedere al ritiro si scrive in UNA riga sotto la tabella di § 6
dell'indice (la riga della tabella esce col ritiro; il «Latest» di CLAUDE.md dice «Open:
doc/dati/ (README § 6)», regola 15) e, il giorno dell'ultima spec, in CLAUDE.md § Latest
«Open», perché a serie chiusa l'indice non c'è più. Il
caso reale NON è un prerequisito: dove è a portata di giorni lo si cerca e lo si scrive,
ma non lo si aspetta mai — ciò che l'uso vero insegnerà diventa feedback e poi una spec
nuova, e quando il caso arriva si annota nella riga di stato della spec ritirata, come
storia. Il collaudo della sessione di implementazione vale come prova della spec, non
come segnale. DDL: nessun DDL SQL e nessuna migrazione di dati (Firestore; ogni § 8 lo
dice, `grep -n -i -E "migrat|backfill" doc/dati/DATI-*.md` per rileggerlo); l'equivalente
sono le REGOLE e gli INDICI Firestore, pubblicati A MANO e mai da un merge (`grep -n "inert
until deployed" AGENTS.md`; i comandi: `grep -n "deploy --only firestore" SETUP.md`), e i
CRON di `vercel.json`, che invece viaggiano con il deploy di `main`. Chi ne porta, misurato
il 2026-11-24 con `grep -n -i -E "firestore:rules|firestore\.rules|firestore\.indexes|
vercel\.json" doc/dati/DATI-*.md`: 02 — il blocco `dailySnapshots` di `firestore.rules`
(ADDITIVO) e l'indice morto `price-history` tolto da `firestore.indexes.json`
(DISTRUTTIVO); 10 — il blocco `emailDeliveries`, chiuso al browser (ADDITIVO), e il terzo
cron, `/api/cron/periodic-emails` alle `0 19 * * *`; 11 — il quarto cron,
`/api/cron/spending-review` alle `0 20 * * *` (nessuna regola: è quella di 10). Le altre
diciotto non toccano né regole né indici né cron (13 e 14 nominano `firestore.rules` solo
per ricaricarle sull'emulatore nel collaudo). ORDINE: l'additivo PRIMA del deploy — le
regole prima o con il merge su `main` (02 § 8 passo 1, 10 § 8) —, il distruttivo DOPO il
deploy e DA SOLO (`npx firebase deploy --only firestore:indexes` offre di cancellare
`price-history`: sì); 10 va su `main` solo DAL 4 del mese (nei giorni 1–3 il cron vecchio
ha già spedito il mese chiuso, e il nuovo lo rispedirebbe). TUTTO è prerequisito del ritiro
(proprietario, 2026-11-24, decisione 96): il «when convenient» dell'indice finisce al
ritiro di 02. Si prova SPESO in due passi: `git diff <base>..<merge> -- firestore.rules
firestore.indexes.json vercel.json` mostra ciò che la spec scrive (per le altre diciotto
quel diff è VUOTO: se non lo è, FERMATI), E io ho visto l'esito del deploy («Deploy
complete!»; 10 § 8 lo chiama «rules released») di `npx firebase deploy --only
firestore:rules` (sempre `npx firebase`; il 401 su `serviceusage` di un login scaduto:
AGENTS.md § Commands) — sta scritto nella riga di § 6 o nel messaggio del commit di
implementazione, altrimenti me lo chiedi con AskUserQuestion; se non è pubblicato la
sessione lo pubblica SOLO su mio OK esplicito (il precedente: cd95dffc) e lo scrive. I
cron: `node -e "console.log(require('./vercel.json').crons.length)"` → 2 il 2026-11-24, 3
dopo 10, 4 dopo 11, e le voci che io vedo in Vercel › Cron Jobs. Dove una spec scrive
CAMPI o documenti nuovi senza regole nuove (06 `feesNative`, `settledTotalEur`, `fxRate`,
`fxSource`; 18 le due righe `accrued_{tradeId}`; 19 i tre campi opzionali dei target; 20
`minimumLot` e `lotStep`; 21 il conteggio delle unità con diritto al premio), il segnale è
il documento letto sull'emulatore nella fase D del collaudo, e un documento vecchio senza
il campo deve leggersi come prima. Se un criterio non regge, un segnale manca o uno script
non è stato
speso, FERMATI e dillo: una spec si ritira intera, mai a metà, e non si ritira una spec
la cui implementazione ha lasciato un «da decidere».

LETTURE OLTRE AL PROMPT STANDARD (WORKFLOW.md, AGENTS.md, CLAUDE.md, COMMENTS.md,
DEVELOPMENT_GUIDELINES.md, la guida del dominio): README § Documentazione · l'indice
della serie per intero · la spec INTERA, compresa l'intestazione con lo stato scritto
dalla sessione che l'ha implementata e le divergenze dichiarate lì · `git log
--format="%h %s" -- <SPEC>` · i precedenti da imitare: `git log -i --grep=ritir
--grep=retire --format="%h %ad %s" --date=short` li elenca tutti (quattordici PERF, nove
MOB, otto AI, ventisei NOVE); da leggere con `git show --stat --format="%h %ad %s%n%b"
<hash>`: a449e723 (2026-11-22, il primo giro del costume: l'ULTIMO CON LA SERIE ANCORA
VIVA, e ha corretto codice — la chiusura rifatta sul codice mergiato prima di ogni
modifica, un workflow in sola lettura di cinque `cercatore` e quattro `verificatore`, 126
voci, 14 segnalate e 10 rette; un difetto a runtime corretto su mia decisione con il test
visto rosso e la Playwright intera; la spec cancellata, l'indice allineato — riga di
stato, ordine, contratti, SPEC VIVE —, la sorella viva ripuntata dalle sezioni della spec
al codice, questo prompt aggiornato in loco, «i segnali da rifare dopo il deploy» in
CLAUDE.md) · 9b1a937b (2026-11-23, il secondo giro del costume: l'ULTIMO CHE HA CHIUSO UNA
SERIE con il suo indice E l'ultimo che ha corretto codice — la cartella `doc/nove/`
cancellata intera, ogni etichetta e decisione numerata rimasta in codice, test e guide
riscritta in regola + data (6 in codice e test, 15 nelle guide, 3 in CLAUDE.md), le regole
della serie nelle guide, DESIGN.md emendato a frasi e `.impeccable/design.json` rifatto da
uno script, il fix con il suo test visto rosso, Playwright intero. NON SI IMITA la storia
della serie che scrisse in README.md § Documentation: dal 2026-11-23 non se ne scrive
nessuna, decisione 2) · cd95dffc (2026-11-08, il colloquio: il modello per le REGOLE di 02
e di 10 — il commit della spec toccava `firestore.rules`, la regola non era pubblicata,
pubblicata dalla sessione su mia decisione e scritto) · 0edcece6 (2026-11-17, Accumulo:
le regole pubblicate da me PRIMA del ritiro e dette in sessione, `firestore.rules` con i
due blocchi della PR e `firestore.indexes.json` intatto, scritto fra i prerequisiti del
commit) · de8bafc9 (2026-10-17, la chiusura più grande: 753 rimandi riscritti in 175 file
con uno script di sostituzioni esatte e una revisione a campione, l'artefatto vivo
spostato con `git mv`: il modello per il giorno di DATI-21, con 96 decisioni, otto
contratti e sedici regole da riscrivere). Ogni riferimento
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
   codice, una spec viva per esteso, l'indice o CLAUDE.md § Not yet present.
   ⚠️ Nessuna attesa senza tempo massimo: ogni ciclo `until`/`while` che aspetta un log o un servizio ha un limite di tempo e un
   uscita se l'evento non arriva (un server chiuso non scrive più nulla), e a fine lavoro non resta nessuna shell in background.
   La verifica si fa CON UN WORKFLOW, in sola lettura: un agente `cercatore` per
   gruppo di criteri, uno per le decisioni e le scelte, uno per la documentazione e i
   rinvii, uno per i contratti condivisi; a ciascuno la lista e la richiesta di
   percorso:riga per ogni voce, mai una conferma; poi un agente `verificatore` per
   segnalazione. Nello script sono `agentType: 'cercatore'` e `agentType:
   'verificatore'`, senza `model`: il modello e l'effort stanno nella loro definizione
   in ~/.claude/agents/, non qui. Se una delle due non è fra gli agenti della sessione
   (per esempio in una sessione cloud), fermati e dimmelo: non sostituirla a occhio.
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
   con QUEL nome e quella firma? Se no, si aggiornano l'indice e OGNI spec viva che lo
   cita (testo e prompt in fondo).

2) MISURA I RIFERIMENTI, non stimarli: sempre con `--exclude-dir=node_modules
   --exclude-dir=.next --exclude-dir=.next-perf --exclude-dir=.next-e2e
   --exclude-dir=.next-e2e-build --exclude-dir=.git --exclude-dir=.mobile-census
   --exclude-dir=.emulator-data --exclude-dir=test-results --exclude-dir=playwright-report`,
   e ogni conteggio va nel riassunto finale, mai qui — (a) l'ETICHETTA: `grep -rn -E
   "DATI-<NN>" .`, per file `grep -rc -E "DATI-[0-9]{2}" . | grep -v ":0$"`: fuori da
   `doc/dati/` il 2026-11-24 NESSUN file (CLAUDE.md la prende con il «Latest» che scrive
   DATI-01: «Next: DATI-NN»); dentro, l'indice (63 righe con un'etichetta), le spec (da 5
   a 32 ciascuna), questo prompt. L'indice § 8 regola 2 vieta l'etichetta nel codice («no
   «DATI-07», no «C2» in a comment, a test name or a commit body's code reference»): UNA
   occorrenza in `scripts lib __tests__ e2e components app types contexts perf` (zero il
   2026-11-24) è un difetto della sessione di implementazione, da riscrivere ora in
   regola + data; (b) il PERCORSO: `grep -rn "doc/dati/<SPEC senza cartella>" .` e `grep
   -rln "doc/dati" . | grep -v "^./doc/dati/"` (il 2026-11-24: solo WORKFLOW.md, righe
   327–328; poi anche CLAUDE.md); (c) il TITOLO A PAROLE, in inglese e in italiano, con le
   parole del titolo di QUELLA spec e del suo slug (per 02 «daily archive», «archivio
   giornaliero»; per 06 «foreign currency», «valuta estera», «Controvalore»; per 18
   «accrued interest», «rateo»; per 20 «lot», «Taglio minimo»; per 21 «final premium»,
   «premio finale»): `grep -rn -i -E "<parole>" .`, letto riga per riga, perché un nome di
   funzione (`buildDailySnapshotDay`, `resolveTradeFx`) è codice e non un rimando; (d)
   gli ORFANI NUMERICI, cioè una decisione, una scelta, una regola, un contratto, una
   sezione o un criterio citati col numero o con la sigla senza il documento che li
   numera: `grep -rn -E "decision[s]? [0-9]+|decisione [0-9]+|README § ?[0-9]|DATI-[0-9]{2}
   § [0-9]+|criterion [0-9]+" scripts lib __tests__ e2e components app types contexts`
   (il 2026-11-24 due righe, entrambe di prima della serie —
   `lib/services/assetService.ts:938` e `components/assets/AssetDialog.tsx:2019` — da non
   toccare) e lo stesso su CLAUDE.md, AGENTS.md, WORKFLOW.md, DESIGN.md, README.md e
   doc/guide/ (una riga, `doc/guide/patrimonio.md:166`, di prima della serie); le scelte
   di § 4 con `grep -rn -E "adopted choice|choice \(?[a-z]\)|adopted \([a-z]\)" scripts
   lib __tests__ e2e components app types contexts doc/guide` (zero il 2026-11-24); le
   sigle dei contratti C1–C8 NON si cercano su tutto il repo (`grep -rn -E "\bC[1-8]\b"
   scripts lib __tests__ e2e components app types contexts | wc -l` → 42 il 2026-11-24,
   tutte di prima: i tracciati SVG di `lib/constants/themeCostume.ts` e i nomi dei casi di
   `fireService.test.ts`, `ringChart.dom.test.tsx`, `analisiSummary.test.ts`) ma nei soli
   file del commit della spec (`git show --stat --format= <commit>`). Contano solo le
   righe nate con la serie, riconoscibili dai file del commit della spec: un rimando a
   § 3, § 4, § 7 o § 8 dell'indice resta valido finché vive l'indice e si riscrive in
   regola + data il giorno dell'ultima; uno verso un § della spec che si ritira si
   riscrive ORA. I `file:riga` delle spec vive NON si rimappano: sono datati @ b0bf8276
   (20 e 21: @ 94101a1c) e l'àncora è il nome della funzione (indice § 8 regola 3). Le
   ETICHETTE DELLA SERIE che restano vive finché vive l'indice, da rileggere con `grep -rn
   -E "DATI-[0-9]{2}|doc/dati|DATI series" CLAUDE.md AGENTS.md WORKFLOW.md README.md
   DESIGN.md doc/guide perf "Draft Release Temp.md"`: «DATI-NN» nelle intestazioni delle
   spec e in § 3–§ 9 dell'indice; «Open: doc/dati/ (README § 6)» e «Next: DATI-NN» nel
   «Latest» di CLAUDE.md (regola 15); «the DATI series of 2026-11-23» con `doc/dati/README.md`
   § 8 in WORKFLOW.md § 3 «Branches» e, da DATI-01, la frase gemella di
   doc/guide/collaudo.md; «decision N», le scelte di § 4, C1–C8 e «rule N» DENTRO
   `doc/dati/` (l'ultimo numero di decisione: `awk '/^## 3\./,/^## 4\./'
   doc/dati/README.md | grep -o -E "^[0-9]+\. " | sort -n | tail -1` → 96 il 2026-11-24;
   una decisione presa in un ritiro prende il SUCCESSIVO, mai un numero usato); un
   rimando per percorso a una spec ANCORA VIVA resta fino al ritiro di QUELLA spec. Mai
   l'etichetta in `Draft Release Temp.md` né in un `raisedBy` dei due budget (`grep -c -i
   -E "dati-[0-9]|doc/dati|/dati-" perf/*.json` → 0 nei cinque file: senza `-i` il grep
   non vede il nome del branch, minuscolo). Tre categorie, tre trattamenti: CODICE,
   TEST e COMMENTI → riscritti in loco, veri e autosufficienti senza il documento, con
   le date; SPEC ANCORA VIVE → ripuntate al codice (percorso e nome verificati adesso),
   alla guida o alla regola dove la decisione ora vive; SPEC che la citano come
   appuntamento («dopo la NN») → lasciate.

3) TRAVASA ciò che è ancora operativo, prima di cancellare: il perché di una scelta,
   una decisione precedente RIBALTATA con la data, un limite dichiarato, una trappola
   misurata al collaudo. Un pezzo in UN posto solo: una regola che vale su tutto il repo
   → AGENTS.md, come RULE + DATE + WHERE IT IS PINNED (§ 0), nella sezione che già la
   ospita (§ Firestore Writes, § Firestore Queries and the Rules, § Caching, § Shared
   Constants and Fixed Hooks, § Hierarchy, Density and Disclosure, § Accessibility,
   § Commands, § Audit habits); uno stub di § 3 si riscrive a lunghezza uguale o minore,
   la frase nuova va nella guida (decisione 47, regola 16); una regola di UNA pagina → la
   sua guida `doc/guide/<tema>.md`, e le guide di una spec sono quelle che il suo § 9
   «Documentation» nomina: `awk '/^## 9\. /{p=1;next} /^## 10\. /{p=0} p' <SPEC> | grep -o
   -E "doc/guide/[a-z0-9-]+\.md" | sort -u` — le più scritte dalla serie, il 2026-11-24:
   `velocita.md` (nove spec: 12–14, 16–21), `registro-operazioni.md` (otto: 04–07, 16, 18,
   20, 21), `assistente.md` (otto: 08–10, 15, 16, 18, 19, 21), `patrimonio.md` (sette: 05,
   06, 12, 14, 17, 20, 21), `assistente-registra.md` (sei), `e2e-emulatori.md` (sei),
   `rendimenti.md`, `impostazioni.md`, `server.md` (cinque ciascuna), `cashflow-dividendi.md`
   (quattro: 04, 07, 18, 21), `consulente.md` (15, 19, 21) e `consulente-piano.md` (19, 20,
   21); due guide NASCONO con una spec e il 2026-11-25 non esistono (`patrimonio-strumenti.md` è nata con 05):
   (05), `assistente-strumenti.md` (09), `patrimonio-andamento.md` (12) — e, per ciò che
   sembra un bug e non lo è, i suoi § Per-page blind spots (`grep -ln "Per-page blind
   spots" doc/guide/*.md | wc -l` → 43 guide su 50); un RINVIO senza erede → una spec
   successiva per numero o i blind spots della guida nominata (regola 10: mai «later»),
   `velocita.md`, CLAUDE.md § Known Issues se attraversa le aree (CLAUDE.md qui NON ha un
   § «Not yet present» e non lo si crea: `grep -c "Not yet present" CLAUDE.md` → 0); le
   invarianti → il test che le fissa (`__tests__/<modulo>.test.ts`; componenti e hook in
   `.test.tsx` sul progetto `dom`), con l'intestazione che dice quale mutazione l'ha visto
   rosso (regola 8), e la riga «Suites to run after a change here» del § Files della guida
   (`grep -ln "Suites to run after a change here" doc/guide/*.md | wc -l` → 27); gli
   emendamenti a DESIGN.md → DESIGN.md stesso, a mano, prima / dopo, come la spec li porta
   (regola 9; lo nominano 03, 05, 08, 10, 12): mai rigenerarlo, e `.impeccable/design.json`
   si verifica con uno script prima di riscriverlo; il collaudo — account, fixture,
   trappole — → doc/guide/collaudo.md, doc/guide/e2e-emulatori.md, doc/guide/e2e-playwright.md,
   doc/guide/e2e-suite.md (i flake) e la tabella dei fixture di WORKFLOW.md § 3; le misure
   dei due budget → doc/guide/velocita.md § Registro e doc/guide/prima-schermata-misure.md;
   una regola di sessione → WORKFLOW.md § 3; lo stato del progetto → CLAUDE.md § Current
   Status «Latest», che si SOSTITUISCE per intero (decisione 46, regola 15: la data, il
   ritiro in una frase, «Open: doc/dati/ (README § 6)», «Next: DATI-NN»; i segnali nel
   messaggio di commit, mai lì — WORKFLOW.md § 2) e, per ciò che attraversa le aree,
   § Known Issues; ciò che l'utente vede → README.md (le funzioni) e `Draft Release
   Temp.md` (in testa alle quattro sezioni esistenti, una voce per superficie riscritta al
   suo stato finale, mai la parola «ritirata», nessuno strumento di sviluppo, nessun dato
   vero); la storia della serie → DA NESSUNA PARTE (decisione 2, regola 11: `git log --
   doc/dati/` e le PR); il perché di UNA riga → il commento a quella riga, in inglese, con
   la data e senza l'etichetta della spec (COMMENTS.md). Sostituire, mai accumulare.
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
   una regola di sessione nata nella serie → WORKFLOW.md; lo stato → CLAUDE.md; i
   contratti condivisi → le guide delle aree che li usano, per nome. NESSUNA storia
   della serie si scrive, né nel README né altrove: le date, i master e che cosa ha
   corretto ogni ritiro stanno in `git log -- doc/dati/`. Quel giorno le etichette della serie citate nel
   codice si riscrivono in loco con uno script di sostituzioni esatte che rispetta i
   fine riga per file, e una revisione a campione prima di fidarsi; `git log -- doc/dati/`
   resta l'archivio, e ogni rimando alla cartella nel repo si riscrive verso di lui.

5) AGGIORNA indici e stato — lo stato vive in PIÙ punti che possono divergere e si
   chiude con un grep, non con una riga: la cartella è `doc/dati/` (13 spec
   `DATI-NN-<slug>.md`, l'indice, questo prompt: `ls doc/dati/`); l'indice è
   `doc/dati/README.md` (624 righe al 2026-11-26, dopo il ritiro di 08; `grep -n "^## " doc/dati/README.md`: § 1 i quindici
   punti del proprietario, § 2 il codice di partenza, § 3 le decisioni 1–96, § 4 le scelte
   adottate, una riga per spec, § 5 l'ordine — il numero È l'ordine — e le dipendenze, § 6
   la tabella di stato, § 7 i contratti condivisi C1–C8 e gli altri nomi, § 8 le sedici
   regole, § 9 la riga SPEC VIVE, § 10 ciò che non si fa). LA RIGA DI STATO è l'ultima
   colonna della tabella di § 6 (`grep -n -E "^\| \[[0-9]{2}\]\(DATI-" doc/dati/README.md`
   → 13 righe dopo il ritiro di 08 (2026-11-26), tutte «read — riletta in modo adversariale il 2026-11-23: N
   rilievi, M decisioni»): i valori sono `written` → `read` → `implemented` (in `develop`,
   in attesa del ritiro), e il ritiro TOGLIE la riga (il paragrafo sotto la tabella,
   regola 12) — nell'indice non si scrive nessun «retired on»: il ritiro sta in `git log
   -- doc/dati/` e nel «Latest» di CLAUDE.md. Lo stato vive in SETTE punti, ciascuno da
   rileggere con `grep -n` e mai per numero di riga: (1) l'intestazione della spec, un
   blockquote in prosa («Series `doc/dati/` (index: README.md). Depends on: … Written on
   2026-11-23; every `file:line` is cited @ b0bf8276 …» — `grep -c "Written on"
   doc/dati/DATI-*.md`, una per spec), che per lo stato NON si modifica (regola 14): se la
   sessione di implementazione vi ha scritto qualcosa lo si allinea a § 6, e le divergenze
   dichiarate si cercano dove quella sessione le ha messe — la riga di § 6, il messaggio
   del suo commit, la spec; (2) l'indice: la riga di § 6, che esce; la riga di § 9 `SPEC
   VIVE: …`, da cui esce il numero; sotto la tabella di § 6 la riga di ciò che resta da
   vedere in produzione, se c'è; § 7, allineato al codice dove un contratto è nato diverso
   (e con lui ogni spec viva che lo legge); la riga di § 4 e i punti di § 5 RESTANO finché
   vive l'indice (la regola 12 nomina solo § 6 e § 9); (3) le sorelle: l'intestazione
   «Depends on: DATI-NN (…)» (`grep -c "Depends on:" doc/dati/DATI-*.md` → una per spec),
   la colonna «Depends on» di § 6 e i «created by DATI-NN», «Added by DATI-NN», «Changed
   by DATI-NN» di § 7 (`grep -c -E "created by DATI-|Added by DATI-|Changed by DATI-"
   doc/dati/README.md` → 14) restano come sono, da appuntamento; si ripunta al codice e
   alla guida ciò che in una spec viva — nel testo e nel suo § 11, il prompt in fondo
   (`grep -c "^## 11\. " doc/dati/DATI-*.md`, uno per spec) — manda a una SEZIONE della
   spec ritirata; (4) CLAUDE.md § Current Status «Latest» (`grep -n -E "DATI-|doc/dati"
   CLAUDE.md` → niente il 2026-11-24: lo scrive DATI-01), nella forma della regola 15; (5)
   README.md, che non nomina la serie e non la nominerà (`grep -c "doc/dati" README.md` →
   0: nessuna storia); (6) WORKFLOW.md § 3 «Branches» (`grep -n -E "DATI|doc/dati"
   WORKFLOW.md` → righe 327–328) e la frase gemella di doc/guide/collaudo.md § Where
   things are recorded, che restano fino all'ultima e quel giorno perdono il rimando alla
   cartella; (7) questo prompt: l'intestazione («Ritiri fatti»), i precedenti e le misure
   si aggiornano IN LOCO, il corpo resta. AGENTS.md, DESIGN.md e doc/guide/ non nominano
   la serie (`grep -rc -E "DATI-[0-9]|doc/dati" AGENTS.md DESIGN.md doc/guide | grep -v
   ":0$"` → niente). Se era l'ultima spec, dillo
   esplicitamente e chiudi la serie come l'ultimo precedente.
   `grep -rn -E "DATI-<NN>|<SLUG>" CLAUDE.md AGENTS.md WORKFLOW.md README.md DESIGN.md
   doc/dati/ doc/guide/ scripts lib __tests__ e2e components app types contexts perf`,
   poi `grep -n -E "^\| \[[0-9]{2}\]\(DATI-|SPEC VIVE|Status values" doc/dati/README.md`,
   poi `grep -n -E "DATI-|doc/dati" CLAUDE.md README.md WORKFLOW.md` — prima del ritiro:
   la riga di § 6 a `implemented`, il numero in `SPEC VIVE`, il «Latest» di CLAUDE.md con
   la spec implementata e «Next» sul suo ritiro o sulla successiva; dopo: nessuna riga
   <NN> in § 6, il numero fuori da `SPEC VIVE`, «DATI-<NN>» solo nelle sorelle e
   nell'indice come appuntamento, mai un percorso al file cancellato, il «Latest» di
   CLAUDE.md con la spec ritirata, «Open: doc/dati/ (README § 6)» e la prossima —
   deve dire la stessa cosa ovunque.

CANCELLI: nell'ordine, sull'albero finale — (0) `node ~/.claude/processi-collaudo.mjs` →
zero script di collaudo e servizi vivi (emulatori Firebase, server Next), o i cancelli non
partono (WORKFLOW.md § 2; 0 il 2026-11-24); (1) `node -v` → v24 (`package.json` `engines`
«24.x»; v24.18.0 il 2026-11-24); (2) `npx tsc --noEmit` pulito, rifatto DOPO aver scritto
i test; (3) `TZ=Europe/Rome npx vitest run` E `TZ=UTC npx vitest run` verdi, i due progetti
`node` e `dom` letti entrambi (427 file / 8318 test, 2 saltati, al ritiro di 08 del 2026-11-26;
400 / 8064 al ritiro del 2026-11-23, 9b1a937b), i totali nel messaggio di commit e mai in CLAUDE.md; (4) `npm run lint` a zero;
(5) `npm run build`, poi `npm run perf:budget` (17 rotte più il condiviso, 18 voci: `node
-e "console.log(require('./perf/budget.json').routes.length)"`) — REGOLA DEL BUILD DI
VERIFICA: lo script legge la build che la sua prima riga nomina, `.next` dopo `npm run
build`, `.next-perf` con `-- --dist=.next-perf` dopo `perf:build` (il 2026-10-05 senza
l'opzione lesse una `.next` vecchia di settimane); `perf:serve` si ferma per PID prima di
`perf:build`; un rosso senza codice nuovo sulla rotta si prova misurando il commit padre
(doc/guide/velocita.md); un tetto superato fino a 1 KB gz si alza con `raisedBy` e la riga
in § Registro senza chiedere, oltre ci si ferma con le due misure (doc/guide/velocita.md
§ Il ratchet e il tetto alzato; indice § 8 regola 7); (6) se il ritiro tocca ciò che una
pagina composta mostra per prima, `npm run mobile:census -- --email=census@example.com` e
`npm run mobile:budget` (60 misure al 2026-11-23) sulla STESSA build `.next-perf` servita
da `perf:serve` su :3200 (`localhost`, non 127.0.0.1), a confronto con `develop` lo stesso
giorno, mai accanto alla suite Playwright (un server per volta) e mai dal 1° al 4 del mese
né l'ultimo giorno (il fixture rifiuta: doc/guide/prima-schermata.md); (7) E2E: un difetto
di SOLO TESTO (una frase, un commento, una guida) si corregge nel ritiro con `tsc`, lint e
Vitest, senza Playwright (WORKFLOW.md § 3); un difetto a RUNTIME si corregge solo su mia
decisione — tutti i trovati in UNA domanda a scelta multipla —, con la suite d'area su
`next dev` (`npx playwright test e2e/<area>`) e `npm run test:e2e` INTERO sulla sua build
di produzione (Java ≥ 21, emulatori accesi, :3100–3103 libere — quattro worker dal
2026-11-26, un server per worker, nient'altro in esecuzione sulla macchina; 114 file `*.spec.ts`, 581 test — 580 passati, 1 saltato — al
2026-11-26 (2b35d65b); la rotta del modello sempre finta: un passo che spende me lo chiedi prima,
decisione 48; emulatori e server avviati staccati su Windows, WORKFLOW.md § 3; un rosso fra
i flake noti di doc/guide/e2e-suite.md si ripete da solo con `--repeat-each=3`, un secondo
rosso dello stesso test ferma), e si scrive in CLAUDE.md § Latest che i segnali vanno
rifatti dopo il deploy — qui il ritiro va su `main` come la spec (regola 13), e il mio
controllo in produzione si rifà su quel deploy. LA SUITE INTERA PARTE PER ULTIMA, quando
nessun file del repo resta da cambiare (WORKFLOW.md § 2, obbligo 4: documenti, CLAUDE.md e
la cancellazione di `SESSION_NOTES.md` compresi), e se un file cambia dopo si rifà. Mai
`npm audit fix`, mai un aggiornamento di dipendenze nel ritiro (indice § 10); l'audit di
inizio sessione si confronta con doc/guide/dipendenze.md (30 avvisi il 2026-11-24, 9 alti
e 21 moderati, invariati dal 2026-11-20). Nel messaggio di commit, con i segnali, la riga
«Model: … · effort …» è la STESSA coppia del commit di implementazione (WORKFLOW.md regola
10; la colonna «Model · effort» di § 6 finché la riga c'è).
LIMITI: tetti e comandi, con la misura del 2026-11-24 accanto — CLAUDE.md «well under
20.000 characters», contato in caratteri: `node -e
"console.log(require('fs').readFileSync('CLAUDE.md','utf8').length)"` → 18.165 (`wc -c` →
18.421: conta i byte) dopo il ritiro di 08, 76 righe: restano circa 1.800 caratteri, il «Latest» si SOSTITUISCE
e una riga d'area si riscrive a lunghezza uguale o minore; AGENTS.md ~1000 righe (§ 0):
`wc -l AGENTS.md` → 888 al 2026-11-26 (3d271323 ne ha spostate 127 nelle guide) — una regola nuova entra come RULE + DATE +
WHERE PINNED, uno stub di § 3 non cresce, una lezione di dominio va nella guida;
WORKFLOW.md (347 righe) solo lo standard e la sua traduzione locale; README.md 467 righe
(DATI-01 ne ha tolte 73); DESIGN.md (1481 righe) scritto a mano, senza tetto, mai
rigenerato; le guide ~500 righe ciascuna, 50 file (`ls doc/guide/*.md | wc -l`), le più
vicine al tetto con `wc -l doc/guide/*.md | sort -n | tail -10`: `consulente.md` 507 (GIÀ
OLTRE, e 15, 19 e 21 vi scrivono), `patrimonio.md` 493 (sette spec), `velocita.md` 492
(nove), `temi.md` 486, `prima-schermata-misure.md` 473 (12 e 13), `assistente.md` 458
(otto; la forma della risposta vive da DATI-08 in `assistente-risposta.md`, 102), `e2e-playwright.md` 428, `cashflow.md` 379, `panoramica.md` 361; le altre di
destinazione partono da `cashflow-dividendi.md` 415 (dopo 07), `accumulo.md` 307, `rendimenti.md`
273, `consulente-piano.md` 268, `allocazione.md` 227, `collaudo.md` 226, `impostazioni.md`
207, `email-pdf.md` 206, `registro-operazioni.md` 197, `assistente-registra.md` 147,
`storico.md` 171, `grafici.md` 103, `server.md` 57. In questa serie una guida che una SPEC
porta oltre ~500 righe si divide per sotto-tema nella sessione di quella spec (decisione
47, regola 16): al ritiro si controlla che sia stato fatto; una guida che il TRAVASO del
ritiro porta oltre NON si taglia in chiusura. Il giorno dell'ultima spec si misura PRIMA
del travaso quanto porta l'indice — `awk '/^## 7\./,/^## 8\./' doc/dati/README.md | wc -l`
→ 179 righe di contratti, lo stesso da `## 3.` a `## 5.` → 215 di decisioni e scelte, da
`## 8.` a `## 9.` → 48 di regole, `awk '/^## 10\./,0' doc/dati/README.md | wc -l` → 22 di
«non si fa» —, lo si somma alle guide di destinazione e lo si dichiara. Se sfori, NON
tagliare in chiusura: dimmelo e proponi lo scorporo
come sessione a parte.

⚠️ NON: riassumere una spec dentro un documento che resta · lasciare un rimando a un
file che non esiste più · cancellare date · ritirare senza i segnali (e senza il DDL
speso) · ritirare l'indice finché una spec vive · cominciare la spec successiva prima di
aver ritirato questa · lasciare un dubbio: ogni domanda si fa SUBITO con AskUserQuestion.

Alla fine: riassumi il diff; le occorrenze riscritte per categoria; che cosa hai
travasato e dove; che cosa ha trovato la verifica; l'esito del grep dello stato; qual è
la prossima spec e se i suoi prerequisiti sono in piedi. Se hai corretto codice,
scrivilo anche in CLAUDE.md § Latest: i segnali passati valgono per il codice di PRIMA,
e sul nuovo sono da rifare dopo il deploy. Poi chiedimi l'OK per il commit: sul branch di sessione,
aperto da quello attivo prima della prima modifica (WORKFLOW.md), un solo commit.
```
