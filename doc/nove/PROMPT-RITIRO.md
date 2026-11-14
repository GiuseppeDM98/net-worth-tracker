# Il prompt di ritiro di una spec della serie `doc/nove/`

> Generato il 2026-11-12 da `08_CREA_RITIRO_SPEC`. Chi lo usa dopo un ritiro aggiorna i precedenti e le misure e
> lascia il corpo com'è; il ritiro dell'ultima spec porta via questo file con la cartella.
>
> Ritiri fatti: NOVE-04 (2026-11-14, PR #528: i nove criteri retti sul codice mergiato, un workflow di cinque `cercatore` e tre `verificatore` — 51 voci, 3 segnalate, 2 rette, tutte di testo; chiusura rifatta con le quattro suite `realEstateOperation*` 67/67, `e2e/assets.compravendita.spec.ts` 7/7 e `perf:budget` 595,3 KB gz; otto rimandi a riga di NOVE-20 ripuntati sul codice spostato; il campo «% del prezzo» di «Mutuo» scritto come divergenza); NOVE-03 (2026-11-14, PR #526: i dodici criteri retti sul codice mergiato, un workflow di cinque `cercatore` e quattro `verificatore` — 75 voci, 13 segnalate, 10 rette, tutte di testo; il confronto `mobile:budget` che l'implementazione non aveva scritto speso nel ritiro — 3fdf11a1 contro `develop`, 57 voci uguali, Patrimonio 1024 a 11 o 12 sulla stessa build —; due etichette della serie tolte dalle guide, i rinvii senza erede in registro-operazioni.md); NOVE-02 (2026-11-13, PR #524: nessuna divergenza nel codice, due sviluppi della spec nel suo testo — il passo del primo rosso e l'àncora di e2e-playwright.md —, la suite d'area rifatta sugli emulatori, 49 verdi); NOVE-01 (2026-11-13, PR #522: nessuna divergenza nel testo, il criterio 4 rimisurato con una sonda usa e getta, le tre mutazioni del test rivedute rosse; Vitest 295 file / 6391 test al commit di implementazione).
>
> Il prompt che il proprietario incolla per ritirare UNA spec di `doc/nove/` dopo che il suo codice è in `develop`
> (WORKFLOW.md § 3 «Where things are recorded»; `doc/nove/README.md` § 8: implementazione → ritiro →
> implementazione). Ogni segnaposto del corpo è sostituito con ciò che il repo diceva il 2026-11-12 su
> `docs/nove-prompt-ritiro` (da `develop` @ c2545376), e ogni conteggio è scritto come il COMANDO che lo misura
> accanto al valore di quel giorno: i valori invecchiano a ogni ritiro, i comandi no. Il file è in italiano perché è
> un prompt del proprietario, come il § 11 di ogni spec (WORKFLOW.md regola 4); le spec, l'indice e le guide restano
> in inglese. Il predecessore è il prompt della serie AI: `git show a792a944^:doc/ai/PROMPT-RITIRO.md`.

```text
SPEC DA RITIRARE: doc/nove/NOVE-NN-nome.md      <- l'unico punto da compilare

Ritira la spec scritta qui sopra. Nel resto di questo prompt <SPEC> è quel percorso, <NN>
il suo numero e <SLUG> il resto del nome senza «.md»: ricavali tu, non chiedermeli. Se il
file non esiste, FERMATI e dimmelo prima di fare qualsiasi cosa.

PREREQUISITO, da misurare e non da assumere: la spec è IN ESERCIZIO, cioè la sua PR è
MERGIATA IN `develop`, il branch di integrazione della serie (WORKFLOW.md § 3 «Where
things are recorded», paragrafo «Branches»: una serie atterra su `develop` una sessione
alla volta e raggiunge `main` insieme, dopo il ritiro dell'ultima, con la PR del
proprietario; indice § 3 decisione 62 e § 8: `develop` va su `main` solo a serie
implementata e ritirata) — il numero della PR e la data si leggono in `git log
--first-parent develop --format="%h %ad %s" --date=short`, e la riga di § 6 dell'indice li
porta come «implemented on <data>, PR #NNN in develop since <data>» — E la prova di
chiusura che la spec nomina è rifatta sul codice mergiato, PRIMA di qualsiasi modifica:
la suite d'area (la riga «Suites to run after a change here» del § Files della guida del
dominio) e le E2E che la spec elenca in § 6 verdi sugli emulatori, più ciò che il suo § 8
«Putting it into service» scrive, spec per spec: 01–06, 08, 09 — nient'altro (i loro § 8:
una PR, nessun dato, nessuna regola); 07 — il commit della spec finisce con «Supersedes
#489.» e con il credito del contributore (sotto), e `DASHBOARD_OVERVIEW_SOURCE_VERSION`
è a 26; 10 — le chiavi `analisi` di `perf/mobile-budget.json` a 390 / 768 / 1024
ri-registrate con `raisedBy` e la riga prima/dopo in doc/guide/prima-schermata-misure.md,
`/dashboard/analisi` in `perf:budget` entro 654 KB gz; 11 — le voci di `mobile:budget`
mosse dal font ri-registrate con `raisedBy` «Geist Sans applied», nessun'altra mossa; 12,
13, 19, 20 — `e2e/themeNeutral.ts` verde (l'identità dei temi a sola palette) e
`__tests__/themeCostumeContrast.test.ts`; 14, 15, 21 — la rotta del modello SEMPRE finta
(`page.route` con una risposta SSE finta, o una spia sullo `stream` dell'SDK: indice § 8,
«A probe never opens a control that SPENDS»); 16, 17 — le regole Firestore pubblicate
(sotto, DDL) e la PR del contributore chiusa; 18 — la PR #488 chiusa. Per OGNI spec
valgono i due budget della serie (indice § 8, decisioni 33 e 34): `perf:budget` misurato
prima e dopo sulla stessa macchina, un tetto alzato di ≤ 1 KB gz ha `raisedBy` e la riga
in doc/guide/velocita.md § Registro; `mobile:census` + `mobile:budget` su `develop` e sul
branch lo stesso giorno, stessa build, e ogni voce che la spec non nomina legge uguale
(dodici voci di altre superfici sono rosse dal 2026-11-11 e restano come sono). IL
CONTRIBUTORE (07, 16, 17, 18; indice § 7 in fondo e § 8): il commit della spec porta il
trailer `Co-authored-by: Giorgio Trentadue <148712309+Ciocc128@users.noreply.github.com>`
(`git log -1 --format=%B <commit> | grep -c "Co-authored-by: Giorgio Trentadue"` → 1) e
la PR d'origine (#489, #486, #487, #488: tutte e quattro aperte il 2026-11-12, `gh pr
list --state open --json number,title`) è chiusa dal proprietario con il link al merge
(`gh pr view <N> --json state,closedAt,comments`); trailer assente → FERMATI; PR ancora
aperta → chiedimi di chiuderla, prima del commit. NON sono segnali: `main` o la
produzione (arrivano dopo l'INTERA serie, decisione 62: ciò che una spec dichiara «until
NOVE-NN» vive solo su `develop`); la preview Vercel della PR (tiene il solo account demo,
che blocca ogni funzione AI — WORKFLOW.md § 3); il giro F sul mirror della sessione di
implementazione; l'uso vero del proprietario — per 21 la verifica dei prompt UNA volta
in produzione con la sua chiave dopo il deploy (il suo § 8), per 14 e 15 la run vera del
router, per 07 la categoria delle commissioni scelta in Impostazioni › Spese sul suo
account: ciò che resta da fare dopo il deploy si scrive in CLAUDE.md § Latest «Open» e
vive lì, perché a serie chiusa l'indice non c'è più. Il
caso reale NON è un prerequisito: dove è a portata di giorni lo si cerca e lo si scrive,
ma non lo si aspetta mai — ciò che l'uso vero insegnerà diventa feedback e poi una spec
nuova, e quando il caso arriva si annota nella riga di stato della spec ritirata, come
storia. Il collaudo della sessione di implementazione vale come prova della spec, non
come segnale. DDL: nessun DDL SQL, nessuna migrazione di dati e nessun indice (`grep -n
-i -E "firestore\.indexes|firestore:indexes" doc/nove/*.md` → una riga il 2026-11-12,
NOVE-03 `:353`, che diceva che `firestore.indexes.json` non si tocca; zero dal suo ritiro, 2026-11-14); l'equivalente sono
le REGOLE Firestore di NOVE-16 (`accumulationPlans`, `accumulationPlanLocks`) e NOVE-17
(`modelPortfolios`): `grep -n "firestore:rules" doc/nove/*.md` → NOVE-16 `:563`, NOVE-17
`:613`. Una regola è inerte finché non è pubblicata, a mano, mai da un merge (AGENTS.md
§ Demo Mode · Shared Account, `grep -n "inert until deployed" AGENTS.md`), e queste sono
ADDITIVE (collezioni nuove): si pubblicano PRIMA che il codice arrivi in produzione, e
qui PRIMA del ritiro (proprietario, 2026-11-12: la pubblicazione è un prerequisito del
ritiro di 16 e di 17, non si rinvia alla PR verso `main`); nessuna spec della serie
porta una regola distruttiva (se una lo facesse: dopo il deploy, e da sola). Si prova
SPESA in due passi: `git diff <base>..<merge> -- firestore.rules` mostra il blocco che
la spec scrive (per le altre diciannove spec quel diff è VUOTO, e così quello di
`firestore.indexes.json` per tutte), E il proprietario ha visto «Deploy complete!» di
`npx firebase deploy --only firestore:rules` (sempre `npx firebase`; il 401 su
`serviceusage` di un login scaduto: AGENTS.md § Commands) — sta scritto nella riga di
§ 6 o nel messaggio del commit di implementazione, altrimenti me lo chiedi con
AskUserQuestion; se non è stata pubblicata la sessione la pubblica SOLO su mio OK
esplicito (il precedente: cd95dffc) e lo scrive. Dove una spec scrive CAMPI o documenti
nuovi senza regole nuove (07 `Asset.fiscalAverageCostEur` e la riga di spesa della
commissione, 14 `AssistantMessage.routeReading`, 16 `Asset.createdEmpty`), il segnale
è il documento letto sull'emulatore nella fase D del collaudo, e un documento vecchio
senza il campo deve leggersi come prima. Se un criterio non regge, un segnale manca o uno
script non è stato
speso, FERMATI e dillo: una spec si ritira intera, mai a metà, e non si ritira una spec
la cui implementazione ha lasciato un «da decidere».

LETTURE OLTRE AL PROMPT STANDARD (WORKFLOW.md, AGENTS.md, CLAUDE.md, COMMENTS.md,
DEVELOPMENT_GUIDELINES.md, la guida del dominio): README § Documentazione · l'indice
della serie per intero · la spec INTERA, compresa l'intestazione con lo stato scritto
dalla sessione che l'ha implementata e le divergenze dichiarate lì · `git log
--format="%h %s" -- <SPEC>` · i precedenti da imitare: `git log -i --grep=ritir
--grep=retire --format="%h %ad %s" --date=short` li elenca tutti (quattordici PERF, nove
MOB, otto AI); da leggere con `git show --stat --format="%h %ad %s%n%b" <hash>`: 04778f29
(2026-11-11, il ritiro dei dettagli di Registra: l'ULTIMO CON LA SERIE ANCORA VIVA — la
chiusura rifatta sul codice mergiato prima dei fix, un workflow in sola lettura di nove
agenti, 436 voci, 66 segnalate e 65 rette; un difetto a runtime corretto su mia
decisione, le prove mancanti fissate con 14 mutazioni viste rosse, § 7 dell'indice
allineato al codice, la decisione nuova numerata, Playwright intero) · a792a944
(2026-11-12, il report come libro: l'ULTIMO CHE HA CHIUSO UNA SERIE con il suo indice E
l'ultimo che ha corretto codice — la cartella `doc/ai/` cancellata intera, 58 sostituzioni
in codice e test e 32 in guide, AGENTS.md, WORKFLOW.md e CLAUDE.md da etichetta e
decisione numerata a regola + data, i «non si fa» dell'indice nei blind spots delle guide,
la storia in README.md § Documentation, la deroga di `.impeccable/config.json` sui file
cancellati tolta nello stesso commit; il fix con il suo test visto rosso sul codice
vecchio, tre prove fissate, Playwright intero due volte, «i segnali da rifare dopo il
deploy» scritto; il primo con `cercatore` + `verificatore`) · cd95dffc (2026-11-08, il
colloquio: il modello per le REGOLE di 16 e 17 — il commit della spec toccava
`firestore.rules`, la regola non era pubblicata, pubblicata dalla sessione su mia
decisione e scritto nel blind spot della guida) · de8bafc9 (2026-10-17, MOB-09: la
chiusura più grande — 753 rimandi riscritti in 175 file con uno script di sostituzioni
esatte e una revisione a campione, l'artefatto vivo spostato con `git mv`, nessun
Playwright perché nessun comportamento cambiava: il modello per il giorno di NOVE-20, con
63 decisioni e 24 scelte da riscrivere) · 17b92183 (2026-09-27: una PR del contributore
integrata «with changes» in un commit con il `Co-authored-by` — la forma del credito da
ritrovare in 07, 16, 17, 18). Ogni riferimento
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
   ⚠️ La verifica si fa CON UN WORKFLOW, in sola lettura: un agente `cercatore` per
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
   --exclude-dir=.next --exclude-dir=.next-perf --exclude-dir=.next-e2e --exclude-dir=.git
   --exclude-dir=.mobile-census --exclude-dir=.emulator-data --exclude-dir=test-results`,
   e ogni conteggio va nel riassunto finale, mai qui — (a) l'ETICHETTA: `grep -rn -E
   "NOVE-<NN>" .`, per file `grep -rc -E "NOVE-[0-9]{2}" . | grep -v ":0$"`: fuori da
   `doc/nove/` il 2026-11-12 c'era solo CLAUDE.md (una riga, il «Latest»); dentro,
   l'indice (145 righe con un'etichetta), le spec sorelle (da 4 a 61 ciascuna), questo
   prompt e la spec stessa. L'indice § 8 vieta l'etichetta nel codice («no `NOVE-05` in a
   file, function or test name, nor in a comment»): UNA occorrenza in `scripts lib
   __tests__ e2e components app types contexts perf` è un difetto della sessione di
   implementazione, da riscrivere ora in regola + data; (b) il PERCORSO: `grep -rn
   "doc/nove/<SPEC senza cartella>" .` e `grep -rln "doc/nove" . | grep -v "^./doc/nove/"`
   (il 2026-11-12: solo CLAUDE.md); (c) il TITOLO A PAROLE, in inglese e in italiano, con
   le parole del titolo di QUELLA spec e del suo slug (per 05 «savings rate», «tasso di
   risparmio»; per 08 «the ring», «anello»; per 16 «Accumulo», «PAC», «accumulation
   plan»; per 11 «costume»): `grep -rn -i -E "<parole>" .`, letto riga per riga, perché
   un nome di funzione (`readSavings`, `RingChart`) è codice e non un rimando; (d) gli
   ORFANI NUMERICI, cioè una decisione, una scelta, una sezione o un criterio citati col
   numero o con la lettera senza il documento che li numera: `grep -rn -E "decision[s]?
   [0-9]+|decisione [0-9]+|README § ?[0-9]|NOVE-[0-9]{2} § [0-9]+|criterion [0-9]+"
   scripts lib __tests__ e2e components app types contexts` (il 2026-11-12 due righe,
   entrambe di prima della serie — `lib/services/assetService.ts:925` e
   `components/assets/AssetDialog.tsx:1962` — da non toccare) e lo stesso su CLAUDE.md,
   AGENTS.md, WORKFLOW.md, DESIGN.md, README.md e doc/guide/ (una riga, in
   `doc/guide/patrimonio.md`, di prima della serie); le scelte a–x di § 4 con `grep -rn
   -E "adopted choice|choice \(?[a-x]\)" scripts lib __tests__ e2e components app types
   contexts doc/guide` (zero il 2026-11-12). Contano solo le righe nate con la serie,
   riconoscibili dai file del commit della spec: un rimando a § 3, § 4, § 7 o § 8
   dell'indice resta valido finché vive l'indice e si riscrive in regola + data il giorno
   dell'ultima; uno verso un § della spec che si ritira si riscrive ORA. Le ETICHETTE
   DELLA SERIE che restano vive finché vive l'indice, da rileggere con `grep -rn -E
   "NOVE-[0-9]{2}" CLAUDE.md AGENTS.md WORKFLOW.md README.md DESIGN.md doc/guide perf
   "Draft Release Temp.md"`: «NOVE-NN» nelle intestazioni delle spec e in § 3–§ 9
   dell'indice; l'etichetta nel «Latest» di CLAUDE.md, che dice quale spec è in `develop`
   e quale è la prossima; «decision N» e le scelte a–x DENTRO `doc/nove/` (l'ultimo
   numero: `grep -o -E "^[0-9]+\. " doc/nove/README.md | sort -n | tail -1` → 63 il
   2026-11-12, 62 voci perché il 32 non è mai stato assegnato; una decisione presa in un
   ritiro prende il SUCCESSIVO, mai un numero usato); i ref locali `refs/tmp/pr486…489`
   (`git for-each-ref refs/tmp`) che le spec 07, 16, 17, 18, 20 e 21 citano come
   `prNNN:file:line`, da tenere finché vive l'ultima spec che li cita; un rimando per
   percorso a una spec ANCORA VIVA resta fino al ritiro di QUELLA spec. Mai l'etichetta
   in `Draft Release Temp.md` né in un `raisedBy` dei due budget (`grep -c "NOVE-"
   perf/*.json` → 0). Tre categorie, tre trattamenti: CODICE,
   TEST e COMMENTI → riscritti in loco, veri e autosufficienti senza il documento, con
   le date; SPEC ANCORA VIVE → ripuntate al codice (percorso e nome verificati adesso),
   alla guida o alla regola dove la decisione ora vive; SPEC che la citano come
   appuntamento («dopo la NN») → lasciate.

3) TRAVASA ciò che è ancora operativo, prima di cancellare: il perché di una scelta,
   una decisione precedente RIBALTATA con la data, un limite dichiarato, una trappola
   misurata al collaudo. Un pezzo in UN posto solo: una regola che vale su tutto il repo
   → AGENTS.md, come RULE + DATE + WHERE IT IS PINNED (§ 0), nella sezione che già la
   ospita (§ Firestore Writes, § Firestore Queries and the Rules, § Shared Constants,
   § Hierarchy, Density and Disclosure, § Accessibility, § Commands, § Audit habits); gli
   stub di § 3 restano a 3–4 punti, oltre è una guida che rientra; una regola di UNA
   pagina → la sua guida `doc/guide/<tema>.md`, per la serie: 01 `landing.md` e
   `accesso-registrazione.md`; 02, 16, 17, 18 `allocazione.md`; 03, 07
   `registro-operazioni.md` (07 anche `cashflow.md`, `cashflow-divisione.md`,
   `rendimenti.md`); 04 `compravendita.md`; 05 `panoramica.md` e `cashflow.md`; 06
   `storico.md`; 08, 09 `grafici.md` e la guida di ogni pagina che riceve un anello; 10
   `cashflow-analisi.md`; 11, 12, 13, 19, 20 `temi.md`; 14, 15 `assistente.md`; 21
   `consulente.md` — e, per ciò che sembra un bug e non lo è, i suoi § Per-page blind
   spots (`grep -ln "Per-page blind spots" doc/guide/*.md | wc -l` → 38 guide su 42 il
   2026-11-12); un RINVIO senza erede → dove vive il suo tema: i blind spots della guida,
   `velocita.md`, CLAUDE.md § Known Issues se attraversa le aree (CLAUDE.md qui NON ha un
   § «Not yet present» e non lo si crea: `grep -c "Not yet present" CLAUDE.md` → 0); le
   invarianti → il test che le fissa (`__tests__/<modulo>.test.ts`; componenti e hook in
   `.test.tsx` sul progetto `dom`), con l'intestazione che dice quale falsificazione l'ha
   visto rosso, e la riga «Suites to run after a change here» del § Files della guida
   (`grep -ln "Suites to run after a change here" doc/guide/*.md | wc -l` → 23); gli
   emendamenti a DESIGN.md → DESIGN.md stesso, SOLO come frasi prima / dopo che la spec
   porta, applicate alla lettera e approvate nel diff dell'implementazione (decisione 16;
   The Ring Rule di 08 estesa da 09 e 10, il costume di 11, The Lifted-Figure Rule di 10,
   The Two-Font Rule di 11): mai rigenerarlo, e `.impeccable/design.json` si verifica con
   uno script prima di riscriverlo; il collaudo — account, fixture, trappole —
   → doc/guide/e2e-emulatori.md, doc/guide/e2e-playwright.md e la tabella dei fixture di
   WORKFLOW.md § 3; le misure dei due budget → doc/guide/velocita.md § Registro e
   doc/guide/prima-schermata-misure.md; lo stato del progetto → CLAUDE.md § Current
   Status «Latest» (UNA voce, che sostituisce la precedente: che cosa, dove è
   documentato, che cosa resta aperto, che cosa viene dopo; i segnali nel messaggio di
   commit, mai lì — WORKFLOW.md § 2) e, per ciò che attraversa le aree, § Known Issues
   (Geist Sans esce da lì con il ritiro di 11); ciò che l'utente vede → README.md (le
   funzioni) e `Draft Release Temp.md` (in testa alle sezioni esistenti, una voce per
   superficie riscritta al suo stato finale, mai la parola «ritirata», nessuno strumento
   di sviluppo, nessun dato vero); la storia della serie → README.md § Documentation, il
   giorno dell'ultima; il perché di UNA riga → il commento a quella riga, in inglese, con
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
   una regola di sessione nata nella serie → WORKFLOW.md; lo stato → CLAUDE.md; la
   storia della serie, con le date, i master e che cosa ha corretto ogni ritiro → README
   § Documentazione (come per le serie precedenti); i contratti condivisi → le guide
   delle aree che li usano, per nome. Quel giorno le etichette della serie citate nel
   codice si riscrivono in loco con uno script di sostituzioni esatte che rispetta i
   fine riga per file, e una revisione a campione prima di fidarsi; `git log -- doc/nove/`
   resta l'archivio, e ogni rimando alla cartella nel repo si riscrive verso di lui.

5) AGGIORNA indici e stato — lo stato vive in PIÙ punti che possono divergere e si
   chiude con un grep, non con una riga: la cartella è `doc/nove/` (21 spec
   `NOVE-NN-<slug>.md`, l'indice, questo prompt: `ls doc/nove/`); l'indice è
   `doc/nove/README.md` (481 righe; `grep -n "^## " doc/nove/README.md`: § 1 i punti del
   proprietario, § 2 il codice di partenza, § 3 le decisioni 1–64, § 4 le scelte a–x,
   § 5 l'ordine — 01 02 03 04 05 06 07 08 09 10 14 15 16 17 18 21 11 12 13 19 20 — e le
   dipendenze, § 6 la tabella di stato, § 7 i contratti condivisi, § 8 le regole, § 9 la
   riga SPEC VIVE, § 10 ciò che non si fa). LA RIGA DI STATO è l'ultima colonna della
   tabella di § 6: il 2026-11-12 tutte e 21 dicevano «written on 2026-11-12; read
   adversarially on 2026-11-12: N findings, M owner decisions» (`grep -c "read
   adversarially on 2026-11-12" doc/nove/README.md` → 21); la sessione di implementazione
   vi accoda «; implemented on <data>, PR #NNN in develop since <data>», il ritiro «;
   **retired on <data>**» e una riga di esito (divergenze, difetti corretti, dove sono
   andate le lezioni) — la forma dell'indice AI, `git show a792a944^:doc/ai/README.md`.
   Lo stato vive in SEI punti, ciascuno da rileggere con `grep -n` e mai per numero di
   riga: (1) l'intestazione della spec, un blockquote in prosa («Series `doc/nove/`
   (README.md § 5): **depends on …** … Written on 2026-11-12; every `file:line` is cited
   on `develop` @ b841cbd7. Executes …» — `grep -c "Written on" doc/nove/NOVE-*.md`, una
   per spec; in NOVE-13 la data va a capo; la lettura adversariale NON vi è scritta; la
   sessione di implementazione può avervi aggiunto «Implemented on» o averla lasciata
   indietro: si allinea a § 6); (2) l'indice: la riga di § 6 e il paragrafo sotto la
   tabella, il preambolo («No spec is implemented yet: the next is NOVE-NN»), § 5 e la
   riga di § 9 `SPEC VIVE: …`, da cui il numero ritirato esce; (3) le sorelle: le
   intestazioni «**depends on NOVE-NN**» / «**NOVE-NN … implemented after it**» (`grep -o
   -E "\*\*[^*]*(depends on|implemented after)[^*]*\*\*" doc/nove/NOVE-*.md | wc -l` → 27
   il 2026-11-12), la colonna «Depends on» di § 6, i punti di § 5 e i «defined by
   NOVE-NN, read by NOVE-NN» di § 7 (`grep -c "defined by NOVE-" doc/nove/README.md` →
   12) — dopo il ritiro «NOVE-NN (retired on <data>, PR #NNN)»; (4) CLAUDE.md § Current
   Status «Latest» (`grep -n -E "NOVE-|doc/nove" CLAUDE.md` → una riga); (5) README.md
   § Documentation, che il 2026-11-12 NON nominava la serie (`grep -c "doc/nove"
   README.md` → 0): il ritiro dell'ultima vi scrive la storia come il paragrafo «The AI
   series» (`grep -n "The AI series" README.md`); (6) questo prompt: l'intestazione, i
   precedenti e le misure si aggiornano IN LOCO, il corpo resta. WORKFLOW.md, AGENTS.md,
   DESIGN.md e doc/guide/ non nominano la serie (`grep -rc -E "NOVE-|doc/nove"
   WORKFLOW.md AGENTS.md DESIGN.md doc/guide | grep -v ":0$"` → niente): il paragrafo
   «Branches» di WORKFLOW.md rimanda alla tabella di § 6 per sapere quale spec è in
   `develop`. Se era l'ultima spec, dillo
   esplicitamente e chiudi la serie come l'ultimo precedente.
   `grep -rn -E "NOVE-<NN>|<SLUG>" CLAUDE.md AGENTS.md WORKFLOW.md README.md DESIGN.md
   doc/nove/ doc/guide/ scripts lib __tests__ e2e components app types contexts perf`,
   poi `grep -rn -E "written on|Written on|read adversarially|implemented on|Implemented
   on|retired on|Retired on|in develop since|is implemented yet|SPEC VIVE" doc/nove/`
   (nell'indice 23 righe sulle prime otto frasi il 2026-11-12), poi `grep -n -E
   "NOVE-|doc/nove" CLAUDE.md README.md` — prima del ritiro: «implemented on … in develop
   since» in § 6 e il «Latest» di CLAUDE.md; dopo: «retired on <data>» in § 6, nelle
   intestazioni delle sorelle che la nominavano e nei «defined by» di § 7, il numero
   fuori da `SPEC VIVE` e dal preambolo, CLAUDE.md «Latest» con la spec ritirata e la
   prossima — deve dire la stessa cosa ovunque.

CANCELLI: nell'ordine, sull'albero finale — (0) `node ~/.claude/processi-collaudo.mjs` →
zero alberi di collaudo vivi, o i cancelli non partono (WORKFLOW.md § 2); (1) `node -v`
→ v24 (`package.json` `engines` «24.x»; v24.18.0 il 2026-11-12); (2) `npx tsc --noEmit`
pulito, rifatto DOPO aver scritto i test; (3) `TZ=Europe/Rome npx vitest run` E `TZ=UTC
npx vitest run` verdi, i due progetti `node` e `dom` letti entrambi (294 file / 6380
test al ritiro del 2026-11-12, a792a944), i totali nel messaggio di commit e mai in
CLAUDE.md; (4) `npm run lint` a zero; (5) `npm run build`, poi `npm run perf:budget`
(16 rotte in `perf/budget.json`) — REGOLA DEL BUILD DI VERIFICA: lo script legge la
build che la sua prima riga nomina, `.next` dopo `npm run build`, `.next-perf` con `--
--dist=.next-perf` dopo `perf:build` (il 2026-10-05 senza l'opzione lesse una `.next`
vecchia di settimane); `perf:serve` si ferma per PID prima di `perf:build`; un rosso
senza codice nuovo sulla rotta si prova misurando il commit padre (doc/guide/velocita.md);
un tetto si alza con la regola unica della serie — fino a 1 KB gz `raisedBy` e la riga
in § Registro senza chiedere, oltre ci si ferma con le due misure (decisione 34); (6) se
il ritiro tocca ciò che una pagina composta mostra per prima, `npm run mobile:census --
--email=census@example.com` e `npm run mobile:budget` sulla STESSA build `.next-perf`
servita da `perf:serve` su :3200, a confronto con `develop` lo stesso giorno (decisione
33: ci si ferma solo su una voce NON nominata che si muove), mai accanto alla suite
Playwright (un server per volta) e mai dal 1° al 4 del mese né l'ultimo giorno; (7) E2E:
un difetto di SOLO TESTO (una frase, un commento, una guida) si corregge nel ritiro con
`tsc`, lint e Vitest, senza Playwright (WORKFLOW.md § 3, indice § 8); un difetto a
RUNTIME si corregge solo su mia decisione — tutti i trovati in UNA domanda a scelta
multipla —, con la suite d'area e `npm run test:e2e` INTERO (Java ≥ 21, emulatori
accesi, :3100 libera o tenuta dal `dev:e2e` di questo repo, `workers: 1`; la rotta del
modello sempre finta, mai una spesa; emulatori e server avviati staccati su Windows,
WORKFLOW.md § 3; un rosso fra i flake noti di doc/guide/e2e-playwright.md si ripete da
solo con `--repeat-each=3`, un secondo rosso dello stesso test ferma), e si scrive in
CLAUDE.md § Latest che i segnali vanno rifatti dopo il deploy. Mai `npm audit fix`, mai
un aggiornamento di dipendenze nel ritiro (indice § 10); l'audit di inizio sessione si
confronta con doc/guide/dipendenze.md (30 avvisi il 2026-11-12, invariati).
LIMITI: tetti e comandi, con la misura del 2026-11-12 accanto — CLAUDE.md «well under
20.000 characters», contato in caratteri: `node -e
'console.log([...require("fs").readFileSync("CLAUDE.md","utf8")].length)'` → 17.768
(`wc -c` → 17.988: conta i byte), 77 righe: restano circa 2.200 caratteri, il «Latest»
si SOSTITUISCE; AGENTS.md ~1000 righe (§ 0): `wc -l AGENTS.md` → 974, ventisei sotto il
tetto — una regola nuova entra come RULE + DATE + WHERE PINNED, una lezione di dominio
va nella guida; WORKFLOW.md (419 righe) solo lo standard e la sua traduzione locale;
DESIGN.md (1481 righe) scritto a mano, senza tetto, mai rigenerato; le guide ~500 righe
ciascuna, 42 file (`ls doc/guide/*.md | wc -l`), le più vicine al tetto con `wc -l
doc/guide/*.md | sort -n | tail -9`: `consulente.md` 483, `assistente.md` 480,
`velocita.md` 479, `patrimonio.md` 455, `prima-schermata-misure.md` 412,
`e2e-playwright.md` 389, `cashflow.md` 368, `panoramica.md` 333 — e sono proprio quelle
che 14, 15 e 21 (assistente, consulente), i due budget (velocita, prima-schermata-misure)
e 08–09 (patrimonio, panoramica) ingrossano; le altre di destinazione partono da
`cashflow-analisi.md` 262, `allocazione.md` 226 (tre spec vi scrivono: 16, 17, 18),
`temi.md` 193 (cinque: 11, 12, 13, 19, 20), `cashflow-divisione.md` 170,
`compravendita.md` 160, `storico.md` 136, `registro-operazioni.md` 110, `grafici.md` 51.
Una guida che il travaso porta oltre ~500 righe NON si taglia in chiusura: si divide per
sotto-tema in una sessione sua (AGENTS.md § 0). Il giorno dell'ultima spec si misura
PRIMA del travaso quanto porta l'indice — `awk '/^## 7\./,/^## 8\./' doc/nove/README.md |
wc -l` → 168 righe di contratti, lo stesso da `## 3.` a `## 5.` → 144 di decisioni e
scelte, da `## 8.` a `## 9.` → 47 di regole —, lo si somma alle guide di destinazione e
lo si dichiara. Se sfori, NON tagliare in chiusura: dimmelo e proponi lo scorporo
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
