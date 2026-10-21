# Allocazione › Consulente

> **Quando aprire questa guida** — chi tocca `app/dashboard/allocation/consulente/*`,
> `components/allocation/consulente/*`, `lib/server/allocationAdvice/*`, `app/api/allocation-advice/*`,
> `lib/utils/allocationAdvice{Proposal,Draft,Apply,Narrative,Document}.ts`, `lib/hooks/useAllocationAdvice.ts`,
> `lib/services/allocationAdviceService.ts`, `types/allocationAdvice.ts`. In `AGENTS.md` resta lo stub con
> l'essenziale; qui c'è la regola completa. Nato il 2026-10-20 (owner's decision: «io sinceramente farei tutto
> adesso in questa sessione»).

## Files

- **Pagina**: `app/dashboard/allocation/consulente/page.tsx` (il gate sul flag `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`, come
  l'Assistente, e `configured` = la chiave letta sul server), `components/allocation/consulente/ConsulenteClient.tsx`
  (le tre viste: percorso · corsa · report), `ConsulenteWizard.tsx` (le otto schermate), `ConsulenteRun.tsx` (le
  fasi via SSE), `ConsulenteReport.tsx` (verdetto, tessere, markdown, «Applica»).
- **Puro**: `lib/utils/allocationAdviceProposal.ts` (gli schemi zod delle risposte, della proposta e dei candidati; il
  blocco recintato), `allocationAdviceDraft.ts` (il reducer del percorso, la bozza su localStorage, le risposte
  precompilate), `allocationAdviceApply.ts` (i piani di «Applica»: target, ruoli, obiettivi; la base di oggi; gli
  scenari di perdita), `allocationAdviceNarrative.ts` (ogni frase), `allocationAdviceDocument.ts` (il mapper del
  documento per entrambi gli SDK), `lib/utils/sseReader.ts`.
- **Server**: `lib/server/allocationAdvice/prompts.ts` (i tre prompt), `run.ts` (l'orchestrazione: contesto →
  strategia → strumenti → revisione, persistita a ogni fase), `store.ts` (Admin, `allocationAdvice/{uid}`);
  `app/api/allocation-advice/run/route.ts` (SSE, `maxDuration = 600`, 6 corse l'ora), `applied/route.ts`.
- **Client**: `lib/services/allocationAdviceService.ts` (la lettura sotto le rules), `lib/hooks/useAllocationAdvice.ts`
  (`queryKeys.allocationAdvice.all`), `lib/services/assetService.ts → updateAssetAllocationRole` (il SOLO campo che
  «Applica» tocca su un asset), `firestore.rules` (`read: canAccess`, `write: false`).
- **Modelli**: `lib/constants/aiModels.ts` → `ALLOCATION_ADVICE_STRATEGY_MODEL` (Opus 5.5) e
  `ALLOCATION_ADVICE_INSTRUMENTS_MODEL` (Sonnet 5.5).
- **Suites to run after a change here**: `allocationAdviceProposal`, `allocationAdviceDraft`, `allocationAdviceApply`,
  `allocationAdviceNarrative`, `allocationAdvicePrompts`, `allocationAdviceRun`, `allocationAdviceRoutes` ·
  `reactCompilerCoverage` (un ternario dentro un `||` nel Wizard fu saltato il primo giorno) · **Browser**
  `e2e/allocation.consulente.spec.ts` (le otto schermate sul fixture base, MAI la corsa: una prova non apre un
  controllo che spende).

## Il percorso

- **Una domanda per schermata, «Indietro» sempre** (owner, 2026-10-20). Le otto schermate sono
  `ALLOCATION_ADVICE_STEPS` (`profilo · tolleranza · borsa · politica · obiettivi · ruoli · vincoli · riepilogo`);
  **a draft that comes back follows FIRE › Obiettivi** (`reconcileDraftGoals`, 2026-10-20: goals added since are
  appended as on a fresh start, deleted ones dropped, the ones the draft has keep what was typed, a goal typed as new
  stays — the owner's «Rifai» reopened the third run's answers, taken before the goal document existed, and saw
  «Nessun obiettivo registrato»; the «rispecchiano la realtà» checkbox is hidden with zero goals);
  la schermata degli obiettivi ha sotto-schermate — una per obiettivo esistente o aggiunto, poi «cosa manca» con
  «rispecchiano la realtà?» e il testo libero — e «Indietro» dalla schermata dei ruoli torna su «cosa manca».
  Il reducer è puro (`allocationAdviceDraftReducer`); `describeStepBlock` dice perché una schermata non avanza
  (età e orizzonte mancanti, un obiettivo nuovo senza nome).
- **La bozza vive su QUESTO browser** (`allocation-advice-draft:{uid}`, `readStoredDraft`/`writeStoredDraft`,
  `try/catch` su ogni accesso): una corsa conclusa la cancella; un documento precedente precompila le risposte.
- **Gli scenari di perdita sono euro sulla base di oggi** (`lossScenarios(currentAllocationOnBase(assets).baseTotal)`):
  la stessa partizione della pagina Allocazione (negoziabili + non negoziabili, netta dei debiti), mai il
  patrimonio intero.
- **Le risposte precompilate** (`initialAnswers`): l'età dalle impostazioni, gli obiettivi da FIRE › Obiettivi, i
  ruoli di casa / fondi pensione / illiquidi dal ruolo che gli asset portano oggi (`resolveAllocationRoleWithin`),
  la borsa `DEFAULT_EXCHANGE`.
- **Il riepilogo è un elenco di righe, ciascuna un link alla sua schermata** (`goto`); «Avvia la ricerca» è
  disabilitato senza la chiave sul server («Servizio AI non configurato»).

## La corsa

- **Tre chiamate in serie, persistite a ogni fase** (`runAllocationAdvice`; sull'account del proprietario, mirror del 2026-10-20: 7,1 minuti in tutto — strategia 2,6, strumenti 2,7, revisione 1,7 — e un report di ~11 000 caratteri): il contesto è il bundle YTD
  dell'Assistente (`buildAssistantYtdContext` + `formatBundleForPrompt`, blocco portafoglio incluso); la strategia
  su Opus 5.5 (effort `high`, `max_tokens` 32 000, nessun tool); gli strumenti su Sonnet 5.5 con
  `web_search_20260209` (`max_uses` 12); la revisione su Opus 5.5. Ogni chiamata è uno stream letto fino alla
  fine: `stop_reason` deciso dal `message_delta` terminale — `max_tokens` e `refusal` sono fasi FALLITE dette
  nelle parole del prodotto (`AllocationAdviceStageError`, `retryable`), mai una proposta a metà letta come intera.
- **La struttura non si legge mai dalla prosa** (la regola dell'Assistente): la strategia emette UN blocco
  ```` ```allocation-proposal ````, la ricerca UN blocco ```` ```instrument-candidates ````, la revisione il report e
  un blocco `allocation-proposal` rivisto. `parseFencedBlock` prende l'ULTIMO blocco di quel linguaggio e lo valida
  con zod; una strategia senza blocco valido fallisce la corsa; una revisione senza blocco valido tiene la proposta
  della strategia (`report.proposal`); la ricerca senza blocco lascia `candidates: null` e il report lo dice.
- **Gli schemi**: le classi della proposta sono `ASSET_CLASS_SEQUENCE` (una chiave fuori dall'enumerazione è rifiutata);
  le percentuali delle classi SENZA `fixedAmount` sommano a 100 (±0,5); i sotto-target di una classe sommano a 100 o
  sono vuoti; una classe compare una volta; `recommendedAllocation` di un obiettivo somma a 100; gli `assetName`
  sono il nome ESATTO del blocco STRUMENTI (il modello lo copia; `findAssetByName` è case- e spazio-insensibile).
- **Il documento** `allocationAdvice/{uid}` è UNO per account, riscritto intero all'avvio (`setAllocationAdviceAdmin`)
  e poi aggiornato per fase (`patchAllocationAdviceAdmin`, `merge: true`, `removeUndefinedDeep`); le date viaggiano
  come Timestamp e tornano Date campo per campo (`mapAllocationAdviceData`, condiviso dai due SDK). Stati:
  `draft · running · ready · failed · applied`; `stage` dice dove la corsa è o si è fermata. Una corsa `running` da
  più di 20 minuti (`RUN_STALE_AFTER_MS`) è considerata morta e la pagina riapre il percorso.
- **La corsa parte dal click, mai da un effetto** (`useConsulenteRun`, 2026-10-20): un primo taglio apriva lo stream
  in un `useEffect` con un guard su ref, e lo StrictMode di React (dev) monta l'effetto due volte — il guard teneva la
  PRIMA chiusura, già annullata dal suo cleanup, e ogni evento veniva scartato: la pagina restava su «Avvio il
  percorso» mentre il server finiva la corsa. Una richiesta che spende minuti e denaro appartiene al gesto che l'ha
  chiesta; `inFlight` rifiuta un secondo avvio mentre uno corre.
- **Una richiesta per fase, mai la corsa intera** (owner, 2026-10-20, durante il giro: «su Vercel Hobby le funzioni
  devono stare sotto il minuto, vero?»). Vercel Hobby ferma una funzione a 300 s con Fluid compute (60 s senza: va
  acceso in Vercel → Settings → Functions), e la terza corsa sul mirror è durata 396 s in una richiesta, con la sola
  strategia a 210 s. Quindi `runAllocationAdviceStage` esegue UNA fase (`AllocationAdviceRunStage`: `strategy`, che
  crea il documento dalle risposte e contiene il contesto · `instruments` · `review`, che leggono il documento
  persistito — `document` passato in memoria dalla corsa intera, letto dallo store dalla route) e la route
  (`maxDuration = 300`, body `{ userId, stage, answers? }`, il rate limit conta solo la `strategy`) streama
  `stage` → `done | error` per quella fase. Il client (`useConsulenteRun.start(answers, from)`) incatena le tre, legge
  ogni stream fino al suo `done`, rilegge il documento dopo ogni fase; una fase fallita o tagliata resta
  `resumeFrom` e «Riprova» (`retry`) riparte da lì sul documento persistito, mai da capo. La revisione rilegge
  strategia e strumenti con i blocchi rimessi al loro posto (`withBlock`): il documento tiene il markdown spogliato
  e la struttura, non il testo grezzo. `runAllocationAdvice` resta le tre in sequenza, per chi non ha un tetto.
  Una fase che supera comunque i 300 s è un 504 con il documento fermo su quella fase: «Riprova» la ripete.
- **Le risposte entrano dalla stessa via che le ha scritte**: `allocationAdviceAnswersSchema` è lo schema delle
  schermate E della route (`parseOr400`).

## Il report e «Applica»

- **Il verdetto è `buildConsulenteVerdict`**: «La proposta è pronta.» con il `summary` e la data di revisione;
  «Allocazione applicata.» con la data; «Il percorso non si è concluso.» con la frase dell'errore; e, con il report
  ma senza blocco valido, un `warning` che dice perché «Applica» non c'è.
- **Un percorso nuovo legge il piano in vigore e il perché** (owner, 2026-10-20: «quando rivedrò il report alla data
  indicata, quello nuovo tiene conto delle scelte e dei motivi fatti in passato?»): la fase `strategy` legge il
  documento precedente PRIMA di sostituirlo (`priorPlanOf`, lib/utils/allocationAdviceDocument.ts: il markdown
  dell'ultimo report, le sue richieste di modifica, quando fu applicato, entro quando chiedeva di essere rivisto e
  perché) e `buildStrategyPrompt` lo appende ai dati come blocco «IL PIANO IN VIGORE E IL PERCHÉ»
  (`formatPriorPlanForPrompt`); il contratto della strategia, invariato byte per byte, chiede di non ripartire da zero
  e di aggiungere la sezione «Rispetto al piano precedente». Il documento nuovo non conserva il vecchio: il report
  precedente vive nel prompt, non nel documento.
- **«Chiedi una modifica» rilancia SOLO la revisione** (owner, 2026-10-20, durante il giro: «vorrei liberarmi degli
  ETF obbligazionari per i bond singoli… meglio dirlo all'inizio?»): una richiesta nata DOPO aver letto il report non
  costa un «Rifai il percorso». La tessera sotto «Il report» (`useConsulenteRevision`, `REVISION_COPY`) manda alla
  route `stage: 'revise'` con `request` (1–1000 caratteri, conta nel rate limit come una corsa); `runRevise` esige un
  report finito, rientra in `stage: 'review'`, chiama Opus 5.5 con `buildRevisionPrompt` — strategia e strumenti con
  i blocchi rimessi, il report precedente, TUTTE le richieste in ordine (l'ultima è la nuova), il contratto della
  revisione più la sezione «La tua richiesta» dove la richiesta non è sensata o ha un costo — e sostituisce
  `report` (proposta rivista, o la precedente se il blocco è malformato), accoda a `document.revisions`
  (`{ request, at }`, sempre un array dal mapper) e riporta lo stato a `ready` (un piano già applicato torna da
  applicare). La tessera elenca le richieste fatte; «Applica» è disabilitato mentre la revisione corre. Una richiesta
  che conviene conoscere PRIMA (un vincolo, una classe da evitare) va ancora nella schermata «Vincoli».
- **Le tessere**: Allocazione proposta (oggi → proposta per classe, `buildProposalRows` su `currentAllocationOnBase`,
  le classi possedute che la proposta lascia cadere aggiunte in coda a 0), Strumenti (i candidati per sotto-target,
  «in portafoglio» quando già posseduto, il `caveat` in ambra), Obiettivi, Ruoli degli asset (solo i cambi che
  cambiano qualcosa, `planRoleChanges`; un nome non trovato è elencato e ignorato), Il report (markdown), Applica.
- **«Applica» mostra i piani PRIMA di scrivere, una spunta per voce** (owner, 2026-10-20): i target
  (`buildTargetsFromProposal` → `setSettings({ targets })`, che SOSTITUISCE il documento dei target come fa Impostazioni;
  una classe assente dalla proposta sparisce dai target), i ruoli (`updateAssetAllocationRole`, una `updateDoc` sul
  solo campo: `updateAsset` e `updateAssetMetadata` cancellano `taxRate`/`displayTicker` assenti dal parziale), gli
  obiettivi (`planGoalDocument` → `saveGoalData`, il documento intero come FIRE › Obiettivi: esistenti aggiornati per
  id, nuovi con colore, eliminati quelli segnati «da eliminare» nelle risposte, le quote dei soli obiettivi toccati
  riscritte in percento; le quote di uno strumento oltre il 100% sono RIDOTTE nel margine lasciato dagli obiettivi
  non toccati e il piano lo dice, mai in silenzio). Poi `POST /api/allocation-advice/applied` registra cosa è stato
  scritto e il documento passa ad `applied`; ogni chiave dei lettori è invalidata (settings, assets, overview, goals,
  allocationAdvice).
- **La data di revisione** (`reviewByIso`) vive nel documento, non nelle impostazioni: la pagina Allocazione la
  stampa nel suo header (`describeReviewBy` → `describeAllocazioneHeader.reviewBy`) solo quando il piano è stato
  applicato — nessun sesto posto nelle FIVE places.
- **I prompt** (`lib/server/allocationAdvice/prompts.ts`): `system` identico per ogni utente (ruolo, regole sui dati,
  contratto di risposta, schema del blocco), tutto dell'utente in `userContent` (`formatAnswersForPrompt`, il blocco
  dati, il risultato dell'altro agente). Le risposte dell'utente VINCONO sulla preferenza del modello (un ruolo
  scelto resta; il modello può dire perché deciderebbe altrimenti, nel testo).

## Composizione mobile

Nessuna composizione, per scelta: come l'Assistente (DESIGN.md → The Conversation-Is-Content Rule) il contenuto è
un percorso — una colonna a 720px, una scheda per schermata, bottoni a 44px sotto `desktop:`; niente striscia,
niente righe chiuse, nessuna memoria `mobile-sections:`. Non è fra le superfici di `mobile:census` (la route non è
in `navigation.ts`: si raggiunge dal bottone «Consulente» di Allocazione, desktop nell'header e sotto le tessere su
un telefono, e dalla riga sotto la conversazione dell'Assistente).

## Per-page blind spots
- **The review invite** (owner, 2026-10-20, after applying the first production plan: «nei giorni vicino alla data,
  un pulsante "revisione con il Consulente"»): `reviewDueState(document, todayIso)` (lib/utils/allocationAdviceNarrative.ts)
  says `later · soon · due` against the applied plan's `reviewByIso` — `soon` within `REVIEW_SOON_DAYS` (30), `due`
  on the day and after, `none` without an applied plan. On Allocazione the «Consulente» button becomes the primary
  «Rivedi con il Consulente» (`REVIEW_INVITE_LABEL`) linking to `/consulente?rivedi=1`, which the page reads on the
  server (`searchParams`) and hands to the client as `startFresh`: the screens open over the applied plan as «Rifai il
  percorso» would, and the new run starts from the plan in force. The report's applied verdict carries
  `describeReviewInvite` (tone `warning` once due). Before the date, «Rifai il percorso» at the bottom anticipates it.
- **The run's state lives on the page, not in the wizard** (owner's first production run, 2026-10-20): the document
  becomes `running` at the first stage and the query rereads it after every stage, so a `showReport` that looked only
  at the document flipped the page to the report's «in corso» view after the strategy — spinners gone, «Ricomincia il
  percorso» offered mid-run (the chain kept going in the unmounted hook's closure and the report did arrive).
  `ConsulenteClient` owns `useConsulenteRun` and hands it to the wizard; `pageShowsReport` (lib/utils/
  allocationAdviceDocument.ts, with `isRunStale`) keeps the run's screen while the run is `running` or `failed`.
- **The E2E spec opens over a finished report** (2026-10-20: two real runs on the E2E account at :3100 left a `ready`
  document in the emulators, and the full Playwright run went red twice on «Passo 1 di 8»): `openConsulente` waits for
  step 1 OR «Rifai il percorso» and clicks the latter. The emulators keep `allocationAdvice/test-user-1` between runs;
  a real run on that account is never cleaned by the suite.
- **The exchange is a closed list, with «Altra…» opening a free field** (owner, 2026-10-20: the first version was an
  `Input` over a `datalist`, whose arrow looked like a dropdown and was not one): `ExchangeField` shows
  `EXCHANGE_OPTIONS` plus `EXCHANGE_OTHER`; «Altra…» is LOCAL state so the field stays open while the text is empty
  (`answers.exchange` is '' until typed, and step 3 does not pass), and a draft that comes back with an unlisted
  exchange reopens it (`isListedExchange`). The free text goes to the instrument agent as written.

- **La corsa costa e dura minuti** (tre chiamate, due su Opus 5.5, una con ricerca web): «Puoi lasciare la pagina»
  è vero — ogni fase è salvata — ma la connessione SSE chiusa non ferma il server; chi riapre vede la fase salvata
  e la pagina rilegge il documento finché è `running`. Una corsa tagliata dalla piattaforma resta `running` fino
  allo stale di 20 minuti.
- **Una corsa per account alla volta**: il documento è uno; «Rifai il percorso» apre il percorso SOPRA il documento
  (che resta finché una nuova corsa lo sostituisce con `set`).
- **«Applica» non è idempotente sugli obiettivi**: premuto due volte creerebbe due volte gli obiettivi nuovi — per
  questo dopo `done` il bottone resta disabilitato e il documento `applied` non lo mostra più.
- **Il demo non ha il Consulente**: scrive le impostazioni, e quelle del demo sono di tutti (`useDemoMode`).
- **Le rules sono inerti finché non sono deployate** (`npx firebase deploy --only firestore:rules`; fatto dal proprietario il 2026-10-20, il Consulente provato in produzione): prima del deploy
  la pagina non legge il documento (permission-denied → la lettura fallisce e la pagina lo dice).
- **Nessuna spec E2E della corsa**, per la regola delle prove che non spendono; la corsa vera è stata fatta sul
  mirror il 2026-10-20 con la chiave del proprietario (gli esiti in SESSION_NOTES della sessione e nel commit).
