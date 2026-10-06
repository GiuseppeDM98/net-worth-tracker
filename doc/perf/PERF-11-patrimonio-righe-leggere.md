# PERF-11 — Patrimonio: N grafici montati al buio, un dialog da 2887 righe sempre vivo

> Stato: da fare · Priorità: 3 · Sforzo: M · Dipende da: PERF-04 (recharts in un chunk), PERF-05 (chiusa il 2026-09-29: `AssetDialog` non legge da chiuso), PERF-12 (il census in `scripts/`) · Sblocca: —

## 1. Il problema, misurato

Patrimonio: 790 ms cold al primo numero, LCP 1230, **270 ms di long task** al mount (mediana di 3 run, mirror con 25 asset),
e 314 ms warm con 11 richieste Firestore (dal 2026-09-29 warm ne fa 0: assets, snapshot, overview, ledger e rate in cache). Il lavoro di rendering, verificato:

- `components/assets/StrumentiTile.tsx:621-644` rende **DUE volte l'elenco**: la lista mobile di `AssetRow` (`desktop:hidden`) e
  la tabella desktop (`hidden desktop:block`) sono entrambe nel DOM a ogni larghezza. La sparkline vive SOLO in `AssetRow`
  (`AssetSparkline` è importata solo lì, grep 2026-09-26): la tabella desktop non ne ha. Ogni `AssetRow` monta il suo pannello
  collassato con CSS (`grid-rows-[0fr]` + `inert`, `AssetRow.tsx:312-329`) e dentro `AssetSparkline` (`AssetRow.tsx:329`):
  un `LineChart` recharts in `ResponsiveContainer` (ResizeObserver), un `useChartColors` (rAF + `getComputedStyle` + 9
  `getPropertyValue`) e un secondo rAF `setReady` (`AssetSparkline.tsx:22-30`). Con N asset: **N grafici, 2N rAF, N+1
  `getComputedStyle`** montati dentro `display:none` (desktop, la lista intera è nascosta) o dentro righe chiuse (mobile), a ogni apertura.
- `AssetDialog` (2887 righe, 22 `useState`, 23 `useWatch` alla radice, `:596-618`) e `CashAccountDialog` sono SEMPRE montati
  (`assets/page.tsx:528, 536`) anche chiusi; da chiuso il dialog non legge più nulla (`useSettings(ownerId, { enabled: open })`, 2026-09-29) ma partecipa a ogni render
  della pagina. Da aperto, ogni tasto in un campo `useWatch`-ato alla radice ri-renderizza le 2887 righe.
  **Lettura di PRIMA del compiler** (emendamento del 2026-10-05, chiudendo PERF-12): fino a quel giorno la radice di
  `AssetDialog` NON era compilata (due `try … finally`, `:950` e `:1098`, la facevano saltare intera); da PERF-12 compila
  (`__tests__/reactCompilerCoverage.test.ts`), e il dialog gemello `ExpenseDialog`, nella stessa situazione, è sceso da
  242 a **1** componente per tasto in «Importo». Il costo per tasto di `AssetDialog` va quindi RIMISURATO prima di § 4 D:
  può essere già quello che D voleva ottenere.
- `app/dashboard/assets/page.tsx:385`: `motion.div layout="position"` intorno all'INTERA pagina — è di PERF-14, non di questa spec.
- **Da PERF-04 (2026-09-30) la sparkline paga l'unione di recharts**: recharts è in UN chunk condiviso (il barrel
  `components/ui/charts/recharts.ts`), che contiene i moduli di TUTTI i grafici dell'app; la copia che Patrimonio aveva
  prima conteneva solo ciò che `AssetSparkline` usa. Patrimonio 723,7 → 731,1 KB gz (+28,5 KB stimati di `recharts/es6/*`
  e +6,3 di `es-toolkit`, dall'analizzatore). Una sparkline montata all'apertura della riga (§ 4) — o disegnata a mano in
  SVG, come le tessere di Rendimenti — toglie recharts dal grafo iniziale di Patrimonio: `perf:budget` lo dirà.

Il post: 6.900 hook e 900 sottoscrizioni nel percorso di digitazione del composer; la tabella resa cella per cella; il
renderer che tocca solo ciò che cambia.

## 2. Obiettivo misurabile

- Al mount di Patrimonio: **0** istanze di `AssetSparkline` montate (contate dal numero di `svg.recharts-surface` in `main`),
  **1** `useChartColors` (quello della pagina); long task cold da 270 a **< 120 ms**; il primo numero **< 500 ms**.
- Aprendo una riga (mobile): la sparkline appare entro un frame, senza salto (altezza riservata 32 px).
- `AssetDialog` montato solo da aperto E fino alla fine della sua uscita animata (così `onCloseAutoFocus` di Radix riporta
  il focus all'opener: `returnFocusTo` è un `RefObject`, `components/ui/responsive-modal.tsx:116`, riempito con
  `event.currentTarget` al click — doc/guide/dialog.md); le due fasi intatte; `e2e/assets.bond.spec.ts` e
  `assets.sale-tax.spec.ts` verdi.
- Un solo elenco nel DOM per larghezza (mobile O desktop), letto da `useMediaQuery('(min-width: 1440px)')` (dal
  2026-09-28, PERF-02, è `useSyncExternalStore` con snapshot server `false`: Patrimonio è dietro `ProtectedRoute` e
  monta solo sul client, DOPO l'idratazione, quindi legge il valore vero già al primo render — va detto nel commento): il numero di `AssetRow` + righe
  `<tr>` = N, non 2N. 1440 inclusivo (AGENTS.md § Tailwind Breakpoints; il progetto Playwright `desktop` gira a 1440).
- Census (`scripts/perfRenderCensus.mjs`, perf/README.md § Il census): lo script NON ha ancora uno scenario per Patrimonio (ha `settings`,
  `expense`, `tabs`, scelti con `--scenario=`; `--route=` non esiste) — questa spec AGGIUNGE lo scenario `asset` (10 tasti
  in «quantità» di «Modifica» su un ETF del mirror, sul modello di `expense`) e lo lancia con
  `npm run perf:census -- --scenario=asset`. Obiettivo: un tasto ri-renderizza la sezione quantità/PMC, non il picker del
  tipo — se il «prima» con il compiler lo fa già, D non si fa (§ 4).

## 3. Non-obiettivi

- Non si cambia l'aspetto della riga, della tabella, della sparkline né del chip di classe (`InstrumentClassChip`, dal
  2026-09-27: segmenti in CSS sulle variabili dei temi, nessun hook, nessun `getComputedStyle`) (DESIGN.md;
  doc/guide/patrimonio.md).
- Non si spezza `AssetDialog` in file più piccoli (un refactor a parte, se mai; qui solo il mount e i `useWatch`).
- Non si tocca la matematica (`patrimonioSummary.ts`, `assetPerformanceDeltas.ts`), né il `layout="position"` (PERF-14).

## 4. Design

**A. La sparkline nasce quando la si guarda.** `AssetRow` monta `AssetSparkline` solo con `open`: il pannello collassato
resta CSS per l'animazione dei dettagli, ma il grafico dentro è `{open && <AssetSparkline …/>}` con un segnaposto della
stessa altezza (`h-8`) quando chiuso, così l'animazione della griglia non cambia. I colori arrivano dalla pagina come prop
(`chartColors`), non da un hook per riga (il pattern di `useActionColors` «una volta per tessera, righe a prop»).

**B. Un elenco per larghezza.** `const isDesktop = useMediaQuery('(min-width: 1440px)')` in `StrumentiTile` e `{isDesktop ?
<table> : <lista>}`. ATTENZIONE alle spec: oggi la trappola documentata è «responsive DOM duplicates make `.first()` the
HIDDEN mobile copy» (doc/guide/e2e-emulatori.md); dopo, esiste UNA copia. Le spec che usano `.filter({ visible: true })`
restano verdi; quelle che contano righe raddoppiate (se esistono) vanno lette. Il chip composito (`InstrumentClassChip`)
è oggi in entrambe le copie: con un elenco per larghezza i chip diventano N. Non ha un hook per riga (i colori sono
`var(--…)` in CSS), quindi non c'è nulla da passare a prop; il suo minimo di 112 px è `desktop:` e vale solo nella tabella.

**C. Dialog montati all'apertura, smontati dopo l'uscita.** `ResponsiveModal` tiene il contenuto durante l'animazione di
chiusura (doc/guide/dialog.md:71-72) ed è lì che Radix ripristina il focus (`onCloseAutoFocus`): uno smontaggio immediato
alla chiusura salterebbe il ritorno del focus. Quindi la pagina tiene `assetDialog: { open, mounted }`: `mounted` diventa
vero all'apertura e falso in `onExitComplete` (se `ResponsiveModal` non lo espone, aggiungerlo: è il posto dove sa che
l'exit è finito). Il `returnFocusTo` è un ref riempito da `event.currentTarget` al click (la regola del 2026-09-20). Il reset
del form su `(open, record)` continua a valere; con il mount condizionale, un `useState(record ? 2 : 1)` come initializer
SAREBBE corretto — ma la regola del repo (`setStep` settled during render, AGENTS.md § Two-Step) resta, perché vale anche
per i dialog che restano montati, e un solo modo è meglio di due: dirlo nel commento.

**D. Meno lavoro per tasto nel dialog.** I 23 `useWatch` alla radice di `AssetDialog` diventano `useWatch` DENTRO le sezioni
che li usano (ogni sezione un componente a livello di modulo che riceve `control`): un tasto in «quantità» ri-renderizza la
sezione quantità/PMC, non il picker del tipo. `useWatch()` per il render, `getValues()` per gli handler, mai `watch()`
(AGENTS.md § Dialog Form Reset). Con il React Compiler (acceso dal 2026-10-05) le sezioni memoizzano da sole.
**D si decide sulla misura** (emendamento del 2026-10-05): il compiler è acceso e `AssetDialog` compila; se il census
`asset` del passo 1 mostra già pochi componenti per tasto, D cade e la spec lo scrive in § 6 di doc/perf/README.md con
il numero. Se D si fa, una sezione che riceve `form` (lo stesso oggetto a ogni render) NON legge `form.formState`: si
iscrive con `useFormState({ control })`, o con il compiler il padre ripassa prop invariate e l'errore del campo non
compare più (visto su `ExpenseDialog` il 2026-10-05, doc/guide/cashflow.md § The expense form reads the keys). Ogni
`try` delle sezioni nuove segue le riscritture di AGENTS.md § Motion (niente `finally`, niente `throw` dentro un `try`):
il test di copertura del compiler è rosso altrimenti.

## 5. File da toccare

- `components/assets/AssetRow.tsx`, `AssetSparkline.tsx` (prop `colors`), `StrumentiTile.tsx` (un elenco; `chartColors` per riga).
- `app/dashboard/assets/page.tsx` — mount condizionale dei due dialog con `mounted`/`onExitComplete` + `returnFocusTo`.
- `components/ui/responsive-modal.tsx` — `onExitComplete` se manca.
- `components/assets/AssetDialog.tsx` — sezioni con `useWatch` locale (solo se § 4 D resta).
- `scripts/perfRenderCensus.mjs` — lo scenario `asset` (e la sua riga nella tabella di perf/README.md § Il census).
- Test: `e2e/assets.rows.spec.ts` (1440: 0 sparkline al mount; `<tr>` = N, `AssetRow` = 0; il focus torna all'opener dopo
  Escape), `e2e/assets.rows.mobile.spec.ts` (390: 1 sparkline dopo l'apertura di una riga, righe = N — il NOME sceglie il
  progetto), `e2e/assets.bond.spec.ts`, `assets.sale-tax.spec.ts`, `assets.composite-chip.spec.ts` (1440 e 390 con
  `setViewportSize` prima del `goto`: il suo commento «Both the desktop table and the phone rows are in the DOM» si
  riscrive, i locator restano), `cashflow.mortgage.spec.ts` (la tessera Mutuo sta in Patrimonio),
  `__tests__/assetDialogHelpers.test.ts`.

## 6. Passi

1. Benchmark cold Patrimonio prima; conteggio `svg.recharts-surface` al mount; lo scenario `asset` nel census, poi il
   census prima (10 tasti in «quantità», build `--profile`) — e la decisione su D.
2. A + B; le due spec nuove; E2E Patrimonio; benchmark.
3. C (con la lettura di `ResponsiveModal`); la spec del focus; il giro delle due fasi.
4. D se resta; census dopo.
5. E2E completo; benchmark dopo.

## 7. Test e falsificazione

- `assets.rows.spec.ts` (1440): `svg.recharts-surface` = 0 al mount; `<tr>` del body = N e `AssetRow` = 0 — falsificare
  rimettendo il mount incondizionato della sparkline → rosso; e il focus: dopo Escape `document.activeElement` è il bottone
  che ha aperto — falsificare smontando subito alla chiusura (senza `onExitComplete`) → il focus finisce su `body`, rosso.
- `assets.rows.mobile.spec.ts` (390): anchor positivo = dopo il click su una riga `svg.recharts-surface` = 1; righe = N.
- Due fasi: «Nuovo asset» apre su fase 1 anche dopo un «Modifica»: è una GUARDIA DI REGRESSIONE che resta verde attraverso
  il cambio (con il mount condizionale la trappola dell'initializer non esiste più; la spec lo dice nel suo header —
  «a green check… say in its header which of the two it is», WORKFLOW.md § 2).
- Census: la sezione quantità ri-renderizza, il picker no; falsificare rimettendo un `useWatch('quantity')` alla radice → il
  conteggio torna a «tutto il dialog».
- Suite: `patrimonioSummary`, `assetDialogHelpers`, `e2e/assets*`, `e2e/cashflow.mortgage.spec.ts`.

## 8. Collaudo guidato

- A: E2E Patrimonio + Mutuo. C: le tre falsificazioni.
- F (mirror, 390 e 1440): 1) la tabella e le righe identiche a prima, i Δ, il chip diviso di uno strumento composito e le
  azioni; 2) aprire una riga sul telefono: la
  sparkline compare senza salto; 3) «Modifica» su un ETF → fase 2 con i campi; poi «Nuovo» → fase 1; 4) digitare la
  quantità: il dialog non «pensa»; 5) Escape: il modal esce con la sua animazione e il focus torna sul bottone. Non
  coperto: solo il tempo (benchmark).
- G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Un elenco solo per larghezza cambia il DOM che le spec conoscono: leggere ogni `.first()`/`.filter({visible})` su Patrimonio.
- Lo smontaggio del dialog e il ritorno del focus: `onExitComplete` è la difesa; la spec del focus la prova.
- Rollback per lettera (A–D).

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest»; doc/guide/patrimonio.md (un elenco per larghezza, la sparkline all'apertura, i dialog montati
  all'apertura e smontati dopo l'uscita); doc/guide/dialog.md (`mounted`/`onExitComplete` con `returnFocusTo`);
  doc/guide/e2e-emulatori.md (la trappola dei duplicati responsivi non vale più su Patrimonio); AGENTS.md § Recharts (colori
  a prop per riga) e § Two-Step (il commento sul mount condizionale); `Draft Release Temp.md`; doc/perf/README.md.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-11-patrimonio-righe-leggere.md: su Patrimonio le sparkline per asset
nascono solo quando la riga si apre (colori a prop dalla pagina, non un hook per riga), un solo elenco nel DOM per
larghezza (useMediaQuery, 1440 inclusivo), AssetDialog e CashAccountDialog montati solo da aperti e smontati DOPO
l'animazione di uscita (onExitComplete) con returnFocusTo, e i useWatch di AssetDialog spostati nelle sezioni che li
usano SOLO se il census lo mostra ancora necessario (dal 2026-10-05 AssetDialog compila con il React Compiler: § 4 D).
Nessun numero e nessun aspetto cambia. Il layout="position" della pagina NON si tocca (è PERF-14).

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Motion, § Recharts, § Dialog Form Reset, § Two-Step Create Dialogs, § Tailwind Breakpoints, § 5 Testing), CLAUDE.md
- Leggi doc/guide/patrimonio.md, dialog.md (per intero: l'uscita animata e il focus), stati.md, e2e-emulatori.md
- Leggi components/ui/responsive-modal.tsx PRIMA di decidere il mount condizionale
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/perf/README.md e la spec PERF-11 per intero; PERF-05 (2026-09-29) e PERF-04 (2026-09-30) sono chiuse, PERF-12 è ritirata (2026-10-06: il compiler e la sua mappa in AGENTS.md § Motion, il census in perf/README.md § Il census)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano.
Metodo: benchmark cold su /dashboard/assets prima/dopo; conteggio dei grafici montati al mount prima/dopo; il census di
scripts/perfRenderCensus.mjs (aggiungi lo scenario `asset`, poi npm run perf:census -- --scenario=asset su una build
perf:build -- --profile) per i re-render per tasto nel dialog prima/dopo; le tre falsificazioni di § 7 viste ROSSE;
reactCompilerCoverage verde.
Chiusura: tsc, lint 0, Vitest in Europe/Rome, npm run test:e2e COMPLETO (Patrimonio e Mutuo in particolare); giro
guidato di 5 punti sul mirror a 390 e 1440, poi mirror:remove; CLAUDE.md «Latest», doc/guide/patrimonio.md, dialog.md,
e2e-emulatori.md, AGENTS.md § Recharts e § Two-Step, Draft Release Temp.md (senza dati privati), doc/perf/README.md;
proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Refactor di componenti con regole di dialog e breakpoint scritte; il punto sottile è
l'animazione d'uscita del modal con il mount condizionale, che si risolve leggendo un file e con una spec sul focus.
