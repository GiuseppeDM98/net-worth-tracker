# MOB-07 — Allocazione · Previdenza · FIRE

> Stato: da fare · Priorità: 3 (Pianificazione, la meno aperta dal telefono) · Sforzo: L · Dipende da: MOB-02 (MOB-01 per
> il budget; PERF-04, PERF-05, PERF-10 e PERF-00 chiuse) · Sblocca: MOB-08, MOB-09

## 1. Il problema, misurato

Censimento 2026-09-26, 390×844 (altezze in px; righe di codice da riverificare):

| Superficie | schermate | cifre tot / sopra | tessere | le più alte |
|---|---|---|---|---|
| Allocazione | 5,25 | 194 / 27 | 5 | Piano 1279, Per classe 757, Bilanciamento 497 |
| Previdenza | 3,84 | 59 / 16 | 5 | Il fondo oggi 698 |
| FIRE › Calcolatore · Coast | 3,37 · 2,75 | 49 / 15 · 49 / 17 | 4 · 3 | Traguardo 707 · 644 |
| FIRE › What If | 4,57 | 82 / 18 | 4 | Sensibilità 1111, Evento 1034 |
| FIRE › Monte Carlo | 5,05 | 34 / 7 | 4 | Parametri 2043, Probabilità 694 |
| FIRE › Obiettivi (vuoto) | 1,00 | 0 / 0 | 1 | Obiettivi 149 |

- **Allocazione**: `order-1…5` in `app/dashboard/allocation/page.tsx:462-520`; Bilanciamento e Per classe in un wrapper
  `contents desktop:flex` (`:461`). Il verdetto è UNA frase di clausole unite da «; »
  (`lib/utils/allocazioneNarrative.ts:211-212`); il punteggio è titolo (`:198`) e anello (`BilanciamentoTile.tsx:129`);
  l'aside di Previdenza è un importo (`allocazioneNarrative.ts:697-702`). Esposizione riceve gli asset dalla pagina e
  possiede solo i profili (`usePortfolioExposure(ownerId, assets)`, `EsposizioneTile.tsx`; PERF-00, chiusa il
  2026-09-28: i profili da `/api/portfolio/instrument-profiles`, la pesatura nel browser, la riga di copertura sopra
  l'elenco), con il suo `role="alert"` per il solo `isError` della query; le righe si rileggono al momento.
- **Previdenza** (`components/pension/PensionOverview.tsx:263-330`): versamenti non letti = quattro `ErrorNotice`. Il
  verdetto è una frase per contribuente con le tre cause (`lib/utils/pensionNarrative.ts:120-143`); `returnState` viene
  da `isPensionReturnMeasurable` (`lib/utils/pensionReturn.ts:183`); l'aside di Anno fiscale è la RAL (`pensionNarrative.ts:397-404`).
- **FIRE**: tab in stato (`app/dashboard/fire-simulations/page.tsx:48`); Radix `TabsContent` smonta la tab inattiva
  (`:66-81`). La frase del vincolo del fondo chiude il paragrafo (`fireNarrative.ts:108`, `coastFireView.ts:645`,
  `monteCarloNarrative.ts:113`, `whatIfNarrative.ts:209`, qui legata a `summary.isBridge`, `whatIfSummary.ts:200`).
  Evento è `order-1` ma terza nel DOM (`WhatIfAnalysisTab.tsx:427`, The Input Tile Rule). Una lettura fallita è della
  tab intera (`FireCalculatorTab.tsx:717` e simili): nessun `failed` per riga.

## 2. Obiettivo misurabile

- `npm run mobile:budget` a 390 (stime; vale la prima corsa): schermate Allocazione ≤ 1,8 · Previdenza ≤ 1,9 ·
  Calcolatore ≤ 1,9 · Coast ≤ 1,8 · What If ≤ 2,2 · Monte Carlo ≤ 1,8 · Obiettivi 1,00; `overflowX` `false`; `--tighten`.
  `figuresOutsideVerdict` e `firstClosedRowAbovePill` registrati: con LA tessera oltre ~420 px la prima riga chiusa sta
  sotto la pill (§ 4.6, 5).
- Playwright: DOM in ordine desktop, pannelli chiusi vuoti, memoria per pagina e per tab, eyebrow rosso, zero richieste
  `/api/portfolio/instrument-profiles` (la route di PERF-00) a Esposizione chiusa; a 1440 le pagine di oggi salvo § 4.6, 2.

## 3. Non-obiettivi

- B e C; il desktop; le primitive (MOB-02); il tablet (MOB-08); DESIGN.md (MOB-09); calcoli, parole (salvo la riga
  d'ambito, § 4.1), tessere nuove.
- **Impostazioni**: nessun verdetto né cifra da sollevare, un modulo con un «Salva»; PERF-13 la riscrive in sei
  componenti. La pill a 44 px arriva da MOB-02. **Assistente**: la conversazione è il contenuto, nessuna tessera.

## 4. Design

### 4.1 Regole comuni

- **API**: quelle di MOB-02 § 4.1, coi loro nomi. **Chiavi**: `mobileSectionsKey('allocation')`, `('pension')`,
  `('fire-simulations', tab)`, `tab` ∈ `fire` · `coast` · `whatif` · `montecarlo` · `goals`: ogni tab ha il suo
  `useMobileSections` e ricorda da sé.
- **DOM**: `PageRest` subito DOPO la cella di LA tessera; sotto `desktop:` LA tessera `order-1`, `PageRest` `order-2`, le
  righe `order-3…` nell'ordine mobile di oggi. «Parametri», «Ipotesi», «Dettaglio» restano disclosure, dopo le righe.
- **Striscia**: ogni cella è una cifra che verdetto o lettura stampano già (§ 7 lo prova sul testo; se no, non entra),
  col `format` dato qui sotto. Il formatter della pagina si rifà con il contratto di MOB-02
  § 4.1: `'pp'` («pp», `allocazioneNarrative.ts:50-52`), `decimals` (due decimali, `pensionNarrative.ts:43-46`; i
  decimali variabili di `monteCarloNarrative.ts:39-42` li calcola il selettore). `verdictStrip.ts` non si tocca.
- **Il vincolo del fondo** (`respectPensionLockInFire`) cambia il senso di ogni cifra FIRE: sotto `desktop:` diventa lo
  `scope` di `PageVerdict`, da `describeFireLockScope(lock: FireLock): string | null` (nuova, `fireNarrative.ts`;
  «Modello ponte: fondo pensione escluso fino al 2050»; What If solo con `summary.isBridge`), passato solo con
  `sections.compact`. La frase del vincolo sta sempre nel `rest` (`leadLength` si ferma prima): lo scope non la doppia.

### 4.2 Allocazione

- **LA tessera = Bilanciamento** (`alloc-bilanciamento`): «sono allineato al piano?», con la banda nel suo aside.
- **Striscia** `selectAllocazioneStrip({ balance, gaps })` (`allocazioneSummary.ts`), tono `neutral` (The
  Scope-Is-Not-An-Axis Rule): «Fuori posizione» `misallocationPct`, `percent`, → `alloc-piano`, `lifts: { section:
  'alloc-bilanciamento', block: 'fuori-posizione' }` (KPI e didascalia; sotto 0,05 la lettura tace la cifra,
  `allocazioneNarrative.ts:252-253`: il test la cerca nel KPI); «{classe} sopra|sotto» `Math.abs(differencePp)` di
  `offTargetGaps(activeClassGaps(gaps))[0]`, `'pp'`, → `alloc-per-classe`, `null` «tutte in soglia». Il punteggio no.
- **Righe**: `alloc-piano` («Ribilancia, Versa o Preleva»), `alloc-per-classe` («corrente, target e gap»),
  `alloc-esposizione` («titoli, settori, emittenti»), `alloc-previdenza` («il fondo nel mix», non l'importo). Importo e
  modalità del Piano sono stato della pagina.
- **Esposizione**: la pagina osserva la stessa chiave dell'hook di PERF-00 —
  `queryKeys.portfolio.instrumentProfiles(ownerId, profileRequestsSignature(selectProfileRequests(assets)))`, la firma
  «AAPL:stock|VWCE.DE:fund» di `lib/utils/exposureRequests.ts` — con `enabled` = `!compact ||
  !!collapse('alloc-esposizione')?.mounted` (oggi l'hook è `enabled` a firma non vuota; a firma vuota il motore gira
  senza chiamate); con `isError` sotto `desktop:` rende
  `<ErrorNotice collapse live={false}>` e passa `failed`. La regione della banda (`page.tsx:447`) resta: annuncia un
  gesto, non un errore. **La riga di copertura** (letto · non letto · non applicabile · fuori vista) sta nel pannello,
  sopra l'elenco: mai nella striscia né in `asideWhenClosed` (porta importi). **Una fetta «non letta» non è una lettura
  fallita**: `failed` e l'eyebrow rosso restano il solo `isError` della query, mai una copertura parziale. La pesatura
  gira nel browser: a riga chiusa non si calcola nulla, oltre a non leggere nulla.
- **Verdetto**: la prima clausola diventa frase e `leadLength`; leva e prossimi soldi sono il seguito, `restLabel` secondo
  ciò che c'è («dove vanno i prossimi soldi», «la leva»: `nextMoney` è `null` senza importo). I target irraggiungibili
  (`orphanSentence`, `allocazioneNarrative.ts:169`) sono `binding`: nessun taglio.

### 4.3 Previdenza

- **LA tessera = Il fondo oggi** (valore, curva, «Aggiorna valore»: il gesto del mese).
- **Striscia** `selectPensionStrip({ blocks, taxYear })` (`pensionSummary.ts`), The Three-Causes Rule: **tre celle o
  nessuna**, solo con UN blocco e `returnState === 'measured'`. «Mercato da {mmm YYYY}» (ogni clausola nomina la sua
  finestra) TWR, `signed-percent`, → `prev-rendimento`; «Datore nel {Y}» `employerInYear`, `currency`, → `prev-versato`;
  «Fisco nel {Y}, circa» `taxSaving`, `currency`, → `prev-anno-fiscale`. Il verdetto TOGLIE la clausola di una causa
  vuota (`pensionNarrative.ts:130-135`): la cella resta `null` col motivo che la pagina già stampa (l'aside di Anno
  fiscale: «senza RAL», «fondo non assegnato»), mai uno zero. Non misurabile, più blocchi, errori: nessuna striscia.
- **Righe**: `prev-rendimento` (la finestra), `prev-anno-fiscale` («beneficio e plafond», non la RAL), `prev-versato`
  («per natura»), `prev-versamenti` («N versamenti»); le `ErrorNotice` prendono `collapse`, `live={!compact}`, `failed`.
  **Verdetto** senza taglio: un blocco è una frase; con più blocchi il titolo giudica tutti. L'asse va dove dice MOB-02 § 4.9, 9.

### 4.4 FIRE

| Tab | LA tessera | Striscia (campo, formato → riga) | Righe | Seguito |
|---|---|---|---|---|
| Calcolatore | Traguardo | «Ti mancano» `gap`, `currency` → `fire-base`; «Rendita oggi» `PassiveIncome.monthly`, `currency` → `fire-reddito` | `fire-scenari`, `fire-reddito`, `fire-base` | «. Da allora…» |
| Coast | Traguardo | «Ti mancano» `gap` (raggiunto: «Margine» `surplus`), `currency` → `coast-afflussi`; «Nell'orso» `coastNumberToday` dell'orso, `currency` → `coast-scenari` | `coast-afflussi`, `coast-scenari` | il ritmo |
| What If | Evento | «Patrimonio FIRE» `netWorth.delta`, `signed-currency` → `whatif-delta`; «Nel {anno}» `gapThen`, `signed-currency` → `whatif-prima-dopo`; `[]` a evento vuoto | `whatif-prima-dopo`, `whatif-delta`, `whatif-sensibilita` | la frase Coast |
| Monte Carlo | Probabilità | «Mediana» `medianFinal`, `currency` → `mc-distribuzione`; «Orso» `successRate` dell'orso, `percent` → `mc-scenari` | `mc-distribuzione`, `mc-scenari`, `mc-parametri` | orso e toro |
| Obiettivi | Obiettivi | nessuna | `goals-traiettoria`, `-milestone`, `-allocazione`, `-assegnazioni` | — |

- **`null`**: Calcolatore raggiunto; Coast con margine sotto 0,5 €; What If sotto `changed` (`whatIfNarrative.ts:67`)
  o divergenza `null`; mediana a zero «esaurito» (The Stale-Run Rule: mai «0 €»).
- **Tasse e pensioni** qualificano il numero FIRE ma stanno nella didascalia di Traguardo (`captionHonestClauses`,
  `fireNarrative.ts:311-318`), sempre aperta: il secondo ramo di The Binding-Clause Rule. Il vincolo va nello `scope`.
- **Parametri** (Monte Carlo): aside «il piano di oggi», o «modificati: premi Esegui» con `haveRunInputsChanged` (The
  Stale-Run Rule anche da chiusa). Non eseguibile: Parametri sola, ed è LA tessera.
- **Obiettivi**: scegliere un obiettivo chiama `reveal('goals-traiettoria')`; vuoto o disattivato: una tessera, nessun
  `PageRest`. **Nulla registrato**: Traguardo aperto con l'azione, righe «non ancora calcolabile»; le costanti di cella
  (`FireCalculatorTab.tsx:171-174`, `CoastFireTab.tsx:112-114`) servono i due rami.

### 4.5 Conflitti con PERF

PERF-04 fa pigra la tab intera (What If, Coast, Monte Carlo, Obiettivi; PERF-04 § 4, C), non i grafici dentro: Prima e
dopo è nel chunk della tab (`WhatIfAnalysisTab.tsx:89`), si monta all'apertura senza scaricare nulla; lo skeleton di
MOB-02 § 4.8 vale per un grafico pigro da sé. PERF-05: `failed` = gli `isError` degli hook (Previdenza li ha già,
`PensionOverview.tsx:117-130`); le righe citate si spostano. PERF-00 (e PERF-10 per il `Server-Timing`): l'Esposizione
parte all'apertura e da calda non chiama Yahoo. PERF-03:
`freshness` fuori da «Il perché». PERF-12/14: nessun `layout`. PERF-13: § 3.

### 4.6 Domande al proprietario

1. Allocazione: «Fuori posizione» + scarto maggiore, o il punteggio (ripete titolo e anello)? La didascalia «… € da
   spostare» (`BilanciamentoTile.tsx:134`) non è stampata altrove: sparisce col KPI, o si solleva solo il valore?
2. Il taglio cambia la punteggiatura anche a 1440 (Allocazione «. La leva», Calcolatore «. Da allora»): va bene?
3. Il vincolo del fondo come riga d'ambito, o `binding` (verdetto intero sul telefono)?
4. Previdenza con due contribuenti: nessuna striscia e verdetto intero, o il primo e il resto dietro «Il perché»? Con
   uno, la striscia ripete le tre cifre del verdetto intero appena sopra: si tiene (come MOB-02 § 4.9, 7)?
5. LA tessera oltre ~420 px: prima riga chiusa sotto la pill, o la curva a 160 px sotto `desktop:`
   (`TraguardoTile.tsx:109-111`, oggi 240)? Mai la lettura.
6. What If: LA tessera Evento (The Input Tile Rule) o Prima e dopo? Evento è terza nel DOM: Prima e dopo e Delta
   vengono PRIMA di «Il resto della pagina» per Tab e lettore di schermo; Prima e dopo è la prima.
7. Obiettivi: nessuna striscia, o «Assegnato» e «Servono al mese» (oggi dentro frasi di LA tessera)?

## 5. File da toccare

- `app/dashboard/allocation/page.tsx`, `components/allocation/tiles/{Bilanciamento,Piano,PerClasse,Esposizione,Previdenza}Tile.tsx`.
- `components/pension/PensionOverview.tsx`, `components/pension/tiles/{Rendimento,AnnoFiscale,Versato,Versamenti}Tile.tsx`.
- `components/fire-simulations/{FireCalculatorTab,CoastFireTab,WhatIfAnalysisTab,MonteCarloTab,GoalBasedInvestingTab}.tsx`;
  le tessere delle righe (inoltrano `collapse`, `asideWhenClosed`) in `components/fire-simulations/{tiles,coast/tiles,
  whatif/tiles}/`, `components/monte-carlo/tiles/`, `components/goals/tiles/`.
- `lib/utils/{allocazioneSummary,allocazioneNarrative,pensionSummary,fireSummary,fireNarrative,coastFireView}.ts`,
  `lib/utils/{whatIfSummary,whatIfNarrative,monteCarloSummary,monteCarloNarrative}.ts`. I test di § 7,
  `doc/mobile/budget.json`.

## 6. Passi

1. Branch, guide, `mobile:census` PRIMA, le domande di § 4.6. 2. Pure e test, falsificati. 3. Allocazione, Previdenza, le
cinque tab. 4. Playwright, tsc, lint, Vitest. 5. `mobile:census`/`mobile:budget`, giro, documentazione, commit.

## 7. Test e falsificazione

- `__tests__/allocazioneSummary.test.ts`: due celle, scarto `null` in soglia, testi dentro `describeBalance` e
  `buildAllocazioneVerdict` (falsificare con due decimali). `allocazioneNarrative.test.ts`: `lead` chiude con «.»; con
  target irraggiungibili `rest` vuoto (falsificare togliendo `binding`).
- `pensionSummary.test.ts`: un blocco misurato → tre celle; non misurato, due blocchi → `[]`; celle nel verdetto,
  finestra nell'etichetta, datore a zero → `null` (falsificare con `block.return !== null` al posto di `returnState`, e
  con uno `0`). `fireSummary`, `coastFireView`, `whatIfSummary`, `monteCarloSummary`: selettori, `validateStrip` vuoto,
  testi ritrovati, le `null` (falsificare con l'euro non compatto e con «0 €» a mediana esaurita). I quattro builder
  FIRE: `lead` chiude con «.», vincolo nel `rest` (falsificare lasciando «, e da allora»). `fireNarrative.test.ts`:
  `describeFireLockScope` non nullo ⇔ frase del vincolo (tre tab su `lock`, What If su `isBridge`); didascalia con
  tasse e pensioni (falsificare togliendo `captionHonestClauses`).
- **`e2e/allocation.mobile.spec.ts`** (esiste da PERF-00 con la riga di copertura a 390: si ESTENDE, non si crea, e il
  suo caso apre prima «Esposizione»; progetto `mobile`): (1) due celle ≥ 44 px, KPI «Fuori posizione» nascosto
  e lettura intera, quattro trigger chiusi, `#alloc-piano-panel` `inert` e vuoto; (2) la cella apre il Piano, focus sul
  trigger; (3) zero richieste ai profili a riga chiusa; (4) `page.route('**/api/portfolio/instrument-profiles**', abort)`
  (`e2e/settings.spec.ts:143`), aprire e chiudere: eyebrow `text-destructive`, «, lettura fallita», l'annuncio;
  (5) reload, `mobile-sections:allocation`; (6) nessuno sforamento. Rossi falsificando: (1) `liftedFigures` assente;
  (2) `reveal` senza focus; (3) `enabled` sempre vero; (4) `failed` sempre falso; (5) nessuna scrittura; (6) una cella
  `min-w-[420px]`.
- `pension.mobile.spec.ts`: `:19` ordine dalle righe, `:67` apre Versamenti; tre celle su `scripts/seedPensionE2E.mts`
  (rosso se il selettore ne rende due). `fire.mobile.spec.ts:28`, `coast.mobile.spec.ts:19` premono «Apri tutte»;
  nuove: riga d'ambito (`scripts/seedCoastFireE2E.mts:83`), memoria per tab (a tab smontata torna solo
  `localStorage`), Obiettivi senza `PageRest`; rossi con scope anche a 1440, chiave senza `tab`, `PageRest` a zero.
- `allocation.spec.ts`, `pension.spec.ts`, `fire.spec.ts`, `coast.spec.ts` (1440): nessun `[id$="-trigger"]` (Parametri
  e Dettaglio hanno il loro `aria-expanded`), striscia invisibile (falsificare ignorando `compact`).

## 8. Collaudo guidato

- A: le spec desktop, Vitest nei due fusi. C: § 7.
- F (mirror, telefono vero o DevTools a 390): 1) Allocazione; 2) Previdenza, tre cause o nessuna; 3) la riga del
  vincolo; 4) cambiare tab e tornare; 5) le tre pagine a 1440 come prima. G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Una spec mobile che legge in una riga chiusa non trova nulla: si rileggono tutte. La striscia di Previdenza tace
  spesso (senza RAL, dati incoerenti): voluto.
- `reveal` sposta il focus (MOB-02 § 4.4): in Obiettivi ogni scelta da tastiera lascia la lista; se il giro lo
  conferma, lì si apre senza focus. `dismissed` vive con la tab montata: cambiando tab una lettura fallita riapre.
- Rollback: `collapse` sempre `undefined` per pagina; i builder per lettera.

## 10. Documentazione da aggiornare

CLAUDE.md «Latest»; § Composizione mobile in `doc/guide/{allocazione,previdenza,fire,fire-coast,fire-what-if,
fire-monte-carlo,fire-obiettivi}.md`; `doc/guide/e2e-emulatori.md`; `Draft Release Temp.md` (una riga, senza dati
privati); `doc/mobile/README.md` § 6.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-07-allocazione-previdenza-fire.md: la composizione mobile di
Allocazione (Bilanciamento aperta, Esposizione letta solo da aperta, eyebrow rosso in errore), Previdenza (tre cause in
striscia o nessuna) e delle cinque tab di FIRE (il vincolo del fondo come riga d'ambito), con le API di MOB-02 coi loro
nomi, i test Vitest e le spec Playwright di § 7.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § React Query and Derived State,
  § Motion, § Navigation, § Hierarchy, Density and Disclosure, § Accessibility), CLAUDE.md
- Leggi doc/guide/allocazione.md, previdenza.md, fire.md, fire-coast.md, fire-what-if.md, fire-monte-carlo.md,
  fire-obiettivi.md, stati.md, e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/mobile/README.md, MOB-02 (§ 4.1 è il contratto) e questa spec per intero; DESIGN.md § 5 e § 6 (MAI
  rigenerarlo). MOB-01, MOB-02, PERF-04, PERF-05, PERF-10 e doc/perf/PERF-00 devono essere chiuse
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; le sette domande di § 4.6 con lo
strumento interattivo, prima di toccare le pagine; nessuna cifra del mirror in test, documenti o draft.
Chiusura: mobile:census e mobile:budget prima/dopo (--tighten); tsc, lint 0, Vitest in Europe/Rome; le spec
Playwright di § 7 con le falsificazioni viste rosse; giro guidato di 5 punti sul mirror, poi mirror:remove; la
documentazione di § 10 in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort high.** Sette superfici dense di regole di dominio (le tre cause, il modello ponte, la
ritenuta, The Stale-Run Rule): il rischio è una cella o un taglio che ne contraddice una.
