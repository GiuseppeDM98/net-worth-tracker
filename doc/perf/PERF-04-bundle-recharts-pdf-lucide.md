# PERF-04 — Il JS che ogni pagina spedisce: recharts una volta sola, il PDF, le icone e il Sankey quando servono

> Stato: da fare · Priorità: 2 · Sforzo: M · Dipende da: PERF-01 (il budget misura la chiusura) · Sblocca: PERF-11 (recharts in un chunk prima di toccare le sparkline); il ratchet di `perf/budget.json` scende

## 1. Il problema, misurato

Build di produzione del 2026-09-26 (Turbopack, Next 16.2.12), chunk iniziali per route letti dall'HTML prerenderizzato, gzip:

| Route | JS iniziale gz | di cui |
|---|---|---|
| ogni pagina dashboard | **460 KB condivisi** | 136 KB `firebase/firestore`+`auth` (anche su /login), 69 KB react-dom, 43 KB framer-motion |
| Storico | **1192 KB** | un chunk da 1568 KB raw / 513 KB gz: `@react-pdf/renderer` + recharts + codice pagina |
| Patrimonio · Analisi · Storico · Rendimenti+FIRE | +101 KB ciascuna | **recharts bundlato QUATTRO volte**: quattro chunk diversi, identici a 350 KB raw (`42yav89z`, `14i2tr0m`, `15_g8lvfbcef_`, `2gmq4b0ohq719`), uno per pagina → cambiare pagina lo riscarica |
| Cashflow › Tracciamento (prima icona categoria) | +143 KB | **lucide-react INTERO** (575 KB raw): `import('lucide-react')` dinamico con accesso per nome in `components/expenses/IconPickerPopover.tsx:23-32` non è tree-shakabile |
| Cashflow | 119 KB | `ExpenseTrackingTab` + `ExpenseDialog` (2238 righe, sempre montato) + `CategoryManagementDialog` |
| Assistente | 41 KB | react-markdown + remark-gfm statici (difendibile: è il contenuto della pagina) |
| Analisi (Flusso) | da misurare | `@nivo/sankey` (con d3-sankey e `@react-spring/web`) statico in `CashflowSankeyChart.tsx`, il suo UNICO importatore: dal 2026-09-27 (#401) sotto i 640 px il Flusso è una barra e righe e il Sankey non si disegna mai, ma il telefono lo scarica |

Cause verificate a file:riga:
- `app/dashboard/history/page.tsx:87` importa `ExportPDFButton` → `components/dashboard/ExportPDFButton.tsx:13` → `PDFExportDialog`
  → `lib/utils/pdfGenerator.tsx:4` `import { pdf } from '@react-pdf/renderer'` + `components/pdf/*`: tutto statico, per un
  bottone. Sul laptop Windows della misura Storico fa 630–710 ms di long task al mount. Le tessere principali di Storico
  (`ComposizioneTile`, `EvoluzioneTile`, `ValoreStrumentoTile`) usano recharts a vista: il risparmio di Storico viene dal PDF,
  non dal Dettaglio.
- Rendimenti spedisce recharts per `PerformanceDettaglio` → `UnderwaterDrawdownChart`, dentro un `Collapsible` CHIUSO di
  default (`PerformanceDettaglio.tsx:278,288`); le tessere principali sono SVG scritti a mano.
- FIRE: `app/dashboard/fire-simulations/page.tsx` importa staticamente i 5 moduli tab; solo la tab attiva monta, ma il codice
  di tutte e cinque (e recharts) arriva subito.
- recharts, lucide-react e date-fns sono GIÀ nella lista di default di `optimizePackageImports` di Next 16
  (`node_modules/next/dist/server/config.js:985-1030`): il problema di recharts non è il tree-shaking, è il chunking per
  route; `framer-motion`, `radix-ui`, `firebase`, `@nivo/*` NON sono nella lista.
- `lucide-react` 0.553 espone `lucide-react/dynamic` (`DynamicIcon`, un chunk per icona via `dynamicIconImports`): è la
  via prevista per un'icona scelta per nome.

Il post: «hook census», «status line scanner», V8 code cache — misure prima, poi il taglio. Qui il taglio è il più
meccanico di tutti e vale ~250 KB gz su Storico e ~100 KB a ogni cambio pagina fra le quattro con grafici.

## 2. Obiettivo misurabile

`npm run perf:budget` (PERF-01) dopo la build, tetti nuovi:
- Storico: da 1192 a **< 700 KB gz** iniziali (il PDF fuori dal grafo iniziale).
- recharts in **UN solo chunk** per tutta l'app: lo script dei «chunk più grandi» lo elenca una volta, con tutte le pagine
  che lo usano; la seconda pagina con grafici non lo riscarica (benchmark warm: `js` KB fra Patrimonio → Analisi → Storico
  sotto 150 KB per navigazione).
- Tracciamento: nessun chunk da 575 KB raw alla prima icona; il chunk richiesto per un'icona è < 5 KB.
- Rendimenti: recharts non nel grafo iniziale (arriva all'apertura del Dettaglio).
- Analisi a 390: nessuna richiesta a un chunk che contiene `d3-sankey`; a 1440 arriva (anchor positivo) e il Sankey
  compare senza salto di layout.
- Zero regressioni visive: le spec E2E delle pagine con grafici (`history*`, `analisi`, `fire*`) e le due di Patrimonio
  (`assets.bond`, `assets.sale-tax`) verdi; nessun salto di layout all'apertura di una sezione pigra (`layout-shift` = 0).

## 3. Non-obiettivi

- Non si cambia il grafico o la sua estetica; non si tocca `useChartColors` (PERF-14).
- Non si sostituisce framer-motion con `LazyMotion`/`m` (33 file, `layout` e `AnimatePresence` richiedono `domMax`: il
  risparmio è piccolo e il rischio alto). Non si tocca firebase (136 KB, serve ovunque; la lettura bloccante davanti alla shell è già andata: `contexts/AuthContext.tsx`, 2026-09-28).
- Non si spezzano i dialog di Patrimonio/Cashflow in `next/dynamic`: `AssetDialog` e `ExpenseDialog` sono oggi sempre
  montati; montarli solo all'apertura (con l'uscita animata e il ritorno del focus intatti) è PERF-11.
- Il modulo Firestore resta nel grafo del root layout, anche su `/login` (136 KB): PERF-02 ha tolto la LETTURA bloccante (`contexts/AuthContext.tsx`, 2026-09-28), non
  il modulo; toglierlo dal login è un lavoro a parte, non in questa serie.

## 4. Design

**A. recharts una volta.** Prima capire PERCHÉ quattro copie: `npx next experimental-analyze --output` (Next ≥ 16.1,
`node_modules/next/dist/docs/01-app/02-guides/package-bundling.md`) mostra le catene di import per route. Ipotesi da
verificare nell'analizzatore: `optimizePackageImports` riscrive `import { LineChart } from 'recharts'` in import profondi
diversi per pagina, e Turbopack non li mette in un chunk condiviso. Rimedio in ordine di preferenza: (1) un modulo
`components/ui/charts/recharts.ts` che riesporta i simboli usati (`export { LineChart, Line, … } from 'recharts'`) e che
TUTTI i 20 file importano — un solo modulo nel grafo → un solo chunk; (2) se non basta, escludere `recharts` dalla lista con
`experimental.optimizePackageImports` esplicita (la lista utente si UNISCE alla default, quindi serve la strada (1) oppure
`turbopack.resolveAlias` — verificare nell'analizzatore quale delle due dà un chunk solo); (3) `next/dynamic` sulle sezioni
con grafici, che rende recharts un chunk asincrono condiviso per costruzione (vedi C). Misura ad ogni tentativo con
`perf:budget` (la lista dei chunk più grandi).

**B. Il PDF quando si preme il bottone.** `ExportPDFButton` resta statico (è il bottone); `PDFExportDialog` diventa
`dynamic(() => import('@/components/pdf/PDFExportDialog'), { ssr: false })` caricato quando `open` diventa vero la prima volta
(un `useState<boolean>` «richiesto» che parte al click, così il chunk parte al click e non prima); `pdfGenerator.tsx` e
`components/pdf/*` restano importati solo da lì. Lo stato di caricamento del chunk è lo stato «in attesa» del modal
(`describeModalStatus`, doc/guide/dialog.md), non uno spinner nuovo. Attenzione: `lib/constants/printTokens.ts` è importato
anche dalle email (server): resta dov'è, è piccolo.

**C. I GRAFICI chiusi dietro `next/dynamic`, non le sezioni che li contengono.** `PerformanceDettaglio` possiede sia il
`Collapsible` sia il suo trigger (`PerformanceDettaglio.tsx:278-290`): metterlo intero dietro `dynamic` ritarderebbe la
riga sempre visibile e creerebbe proprio il salto di layout che questa spec vieta. Si caricano pigramente i COMPONENTI
GRAFICO dentro il `CollapsibleContent`/`Disclosure`: `UnderwaterDrawdownChart` (Rendimenti), `LaborMetricsChart` e i grafici
di `StoricoDettaglio`, `SavingsRateTrendSection`/`AndamentoStoricoSection`/`ConfrontoAnnualeSection` di Analisi (i loro
grafici), e le 4 tab non di default di FIRE (`CoastFire*`, `WhatIf*`, `MonteCarlo*`, `GoalBased*` — qui la tab intera, che
è un pannello, non una riga). Pattern: `const X = dynamic(() => import('…').then(m => m.X), { ssr: false, loading: () =>
<Skeleton className="h-[…]"/> })` a livello di MODULO (mai dentro un render: `react-hooks/static-components`, AGENTS.md
§ Dynamic Imports), con lo skeleton della stessa altezza del grafico (misurare `layout-shift` all'apertura nel benchmark).
Le `aria-controls`/`renderedPanels` di `PageTabs` restano coerenti (AGENTS.md § Navigation: una tab con pannello caricato
pigramente lo dichiara).

**Il Sankey di Analisi** è un grafico a vista, non dentro una disclosure, ma sotto i 640 px non esiste più (la soglia di
leggibilità del Flusso, doc/guide/cashflow-analisi.md): `CashflowSankeyChart` diventa `dynamic(…, { ssr: false })` a
livello di modulo in `FlussoTile.tsx`, reso solo fuori dalle righe del telefono, dentro un contenitore alto
`resolveSankeyHeight(…)` così l'arrivo del chunk non sposta nulla a 1440. Il modello del Sankey sotto i 640 px non si
costruisce già più dal 2026-09-27: qui si toglie il download. `role="img"` e le etichette che `e2e/analisi.spec.ts` legge
arrivano con il chunk: le asserzioni aspettano già. Misurare PRIMA quanto pesa `@nivo/*` nel chunk di Analisi (la lista
dei chunk più grandi di `perf:budget`): né la baseline né questa spec lo avevano contato.

**D. Le icone per nome.** `LAZY_CATEGORY_ICONS` cambia implementazione, non contratto: resta una mappa nome → COMPONENTE
(mai un nodo renderizzato: `CategoryIcon` spalma `iconProps` — `className`, `size` — sul componente, `IconPickerPopover.tsx:52-59`,
e AGENTS.md § Two-Step: «`Icon` as the COMPONENT, never a rendered node»). Due strade equivalenti: `lazy(dynamicIconImports[kebab])`
per voce (`lucide-react/dynamicIconImports`, un chunk per icona), oppure un componente-wrapper per voce che rende
`<DynamicIcon name={kebab} {...props} />` (`lucide-react/dynamic`). Verificare che i **121** nomi di `CATEGORY_ICONS`
(`lib/constants/categoryIcons.ts`, PascalCase) mappino ai nomi kebab di `dynamicIconImports` con un test che li risolve tutti
(un nome sbagliato oggi rende `undefined` in silenzio). Il picker (`IconPickerPopover`) che mostra TUTTE le icone curate
all'apertura carica 121 micro-chunk: accettabile, ma misurarlo; se troppo, il picker importa staticamente le 121
(tree-shaken, ~30 KB raw) e solo il RENDER per nome usa la mappa pigra.

**E. Cosa lasciare stare e dire perché** (in SESSION_NOTES): `radix-ui` umbrella (sideEffects false fino in fondo, tree-shake
plausibile — verificarlo nell'analizzatore e chiudere il dubbio), `date-fns/locale` (tree-shaken), papaparse (solo
Impostazioni › spese, già in una tab).

## 5. File da toccare

- `components/ui/charts/recharts.ts` — nuovo barrel; i 20 importatori di `recharts` passano da lì (`grep -rl "from 'recharts'"`).
- `components/dashboard/ExportPDFButton.tsx` — `dynamic` del dialog al click.
- `app/dashboard/performance/page.tsx`, `app/dashboard/fire-simulations/page.tsx`, `app/dashboard/history/page.tsx`
  (`StoricoDettaglio`), `components/cashflow/AnalisiTab.tsx` (le disclosure),
  `components/cashflow/analisi/tiles/FlussoTile.tsx` (il Sankey) — `dynamic` a livello di modulo.
- `components/expenses/IconPickerPopover.tsx`, `lib/constants/categoryIcons.ts` — `DynamicIcon`; test dei nomi.
- `next.config.ts` — solo se (2) di A serve.
- `perf/budget.json` — tetti abbassati; `scripts/perfBudget.mts` + `lib/utils/perfBudget.ts` — il controllo `libraryCopies`.
- Test: `__tests__/categoryIcons.test.ts` (ogni nome risolve), `e2e/bundle.lazy.spec.ts` (il chunk del PDF arriva solo dopo
  il click: `page.on('request')` filtrando i chunk, anchor positivo = il chunk arriva al click), `e2e/bundle.lazy.mobile.spec.ts` (390: nessun chunk con `d3-sankey` su
  Analisi; a 1440 in `bundle.lazy.spec.ts` sì).

## 6. Passi

1. `npm run perf:build && npm run perf:budget` → tabella «prima» in SESSION_NOTES; `npx next experimental-analyze --output`.
2. A: barrel + misura; se ancora quattro copie, (2) poi (3), misurando ogni volta.
3. B: PDF dinamico; Storico rimisurato (budget + benchmark cold: long task).
4. C: le sezioni; per ciascuna il salto di layout all'apertura misurato con l'observer `layout-shift` in una spec.
5. D: icone; test dei nomi; Tracciamento rimisurato (nessun chunk da 575 KB).
6. `perf/budget.json` abbassato; E2E completo.

## 7. Test e falsificazione

- `categoryIcons.test.ts`: ogni `CATEGORY_ICON_NAMES` ha una voce in `dynamicIconImports`; falsificare aggiungendo un nome
  inventato («Fenicottero») e vedere rosso.
- `e2e/bundle.lazy.spec.ts`: su Storico nessuna richiesta a un chunk che contiene `@react-pdf` prima del click su «Esporta PDF»;
  dopo il click sì (anchor positivo). Il nome del chunk cambia a ogni build: identificarlo dal CONTENUTO (la spec scarica il
  chunk e cerca `pdfkit`), non dal nome. ATTENZIONE: la suite gira su `next dev`, che spezza i chunk diversamente dalla
  build: la spec prova la pigrizia dell'IMPORT, la dimensione la prova `perf:budget` sulla build.
- `e2e/bundle.lazy.mobile.spec.ts` (390: il NOME lo manda al progetto `mobile`, account standard — non `analisi`, che
  prende solo `analisi.spec.ts`/`analisi.mobile.spec.ts`; il seed base ha un Flusso su Analisi, lo raggiunge già
  `settings.roles.spec.ts`): su Analisi il Flusso a barra e righe è visibile e nessuna richiesta a un chunk che contiene
  `d3-sankey`; la stessa asserzione a 1440 in `bundle.lazy.spec.ts` (progetto `desktop`, stesso account) lo trova (anchor
  positivo).
  Falsificare rimettendo l'import statico: a 390 il chunk arriva.
- Il ratchet stesso: `perf:budget` rosso se recharts torna in due chunk (tetto sul numero di chunk che contengono
  `CartesianGrid`: aggiungere a `perfBudget` un `libraryCopies: { recharts: 1 }`).
- Suite: `tsc`, lint 0, Vitest `Europe/Rome`, `npm run test:e2e` completo (Storico, Analisi, FIRE, Patrimonio, Cashflow).

## 8. Collaudo guidato

- C: budget rosso/verde con i tetti nuovi; le quattro falsificazioni sopra.
- F (mirror, telefono 390 e desktop 1440): 1) Storico apre e il Dettaglio si apre senza salto; 2) «Esporta PDF» apre il
  modal con la sua attesa e il PDF si genera (renderizzarlo davvero: è l'unico modo, doc/guide/email-pdf.md); 3) Rendimenti:
  il Dettaglio si apre, il drawdown c'è; 4) FIRE: tutte le cinque tab; 5) Tracciamento: le icone delle categorie ci sono
  tutte (confrontare con il picker). In più, fuori dai cinque: Analisi a 390 mostra il Flusso a barra e righe, a 1440 il
  Sankey senza salto. Non coperto: la latenza di rete reale del primo chunk.
- G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Un `dynamic` in un render body → remount a ogni render (AGENTS.md); solo a livello di modulo.
- Un'icona con nome non mappato sparisce in silenzio: il test dei nomi è la difesa.
- Il PDF ha `printTokens.ts` condiviso con le email: non spostarlo.
- Rollback: ogni parte (A–D) è un commit-parte indipendente nel diff; un revert per parte.

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest»; AGENTS.md § Dynamic Imports and Module Hygiene (il barrel di recharts e la regola «un grafico dietro
  `dynamic` a livello di modulo»); doc/guide/storico.md, rendimenti.md, fire.md, cashflow-analisi.md (le sezioni pigre);
  doc/guide/cashflow.md (le icone); `Draft Release Temp.md`; doc/perf/README.md; `perf/budget.json`.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/perf/PERF-04-bundle-recharts-pdf-lucide.md: recharts in un solo chunk per tutta
l'app (oggi quattro copie), @react-pdf fuori dal grafo iniziale di Storico (arriva al click su «Esporta PDF»), le sezioni
con grafici chiuse di default dietro next/dynamic a livello di modulo, le icone di categoria per nome con
lucide-react/dynamic invece dell'import dinamico dell'intera libreria, e il Sankey del Flusso di Analisi (@nivo/sankey)
dietro next/dynamic in FlussoTile.tsx, così il telefono, che sotto i 640 px non lo disegna, non lo scarica.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Dynamic Imports and Module Hygiene, § Navigation, § Recharts), CLAUDE.md
- Leggi doc/guide/storico.md, rendimenti.md, fire.md, cashflow-analisi.md, cashflow.md, dialog.md, email-pdf.md
- Leggi node_modules/next/dist/docs/01-app/02-guides/package-bundling.md (l'analizzatore Turbopack)
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/perf/README.md e la spec PERF-04 per intero; PERF-01 deve essere chiusa (npm run perf:budget esiste)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano.
Metodo: misura PRIMA (perf:build + perf:budget + next experimental-analyze --output) e annota in SESSION_NOTES perché
recharts è in quattro chunk; prova i rimedi nell'ordine della spec § 4.A misurando ogni volta; ogni next/dynamic a livello
di modulo con skeleton della stessa altezza (misura il layout shift all'apertura). Le quattro falsificazioni di § 7 viste ROSSE.
Chiusura: perf/budget.json abbassato ai valori nuovi; tsc, lint 0, Vitest in Europe/Rome, npm run test:e2e COMPLETO;
giro guidato di 5 punti sul mirror con il PDF generato davvero, più Analisi a 390 e a 1440; CLAUDE.md «Latest», AGENTS.md, le guide, Draft Release
Temp.md (senza dati privati), doc/perf/README.md; poi proponi il commit.
```

## 12. Modello ed effort

**Claude Opus 5.5, effort high.** Lavoro meccanico ma esteso (20 importatori, 4 pagine, il bundler): serve rigore nel
misurare ad ogni passo più che ragionamento di dominio. Se l'analizzatore non spiega le quattro copie di recharts dopo due
tentativi, passare a Fable 5.1 per quel solo punto.
