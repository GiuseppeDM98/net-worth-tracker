# MOB-07 — Allocazione · Previdenza · FIRE

> Stato: da fare · riletta in modo adversariale il 2026-10-10: 27 rilievi, 7 decisioni · Priorità: 3 (Pianificazione, la meno aperta dal telefono) · Sforzo: L · Dipende da: MOB-01 (ritirata il 2026-10-10, in develop dal 2026-10-10, PR #448), MOB-02
> (sequenza, README § 9, 9; PERF-04, PERF-05, PERF-10 e PERF-00 ritirate, in develop) · Sblocca: MOB-08, MOB-09

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

- **Allocazione**: il DOM è Bilanciamento, Per classe, Piano, Esposizione, Previdenza (`app/dashboard/allocation/page.tsx:470-528`,
  Bilanciamento e Per classe in un wrapper `contents desktop:flex`, `:461`), riordinato sul telefono con `order-1/3/2/4/5`
  (che README § 9, 1 vieta). Il verdetto è UNA frase di clausole unite da «; » (`lib/utils/allocazioneNarrative.ts:211-212`);
  il punteggio è titolo (`:198`) e anello (`BilanciamentoTile.tsx:129`); il KPI «Fuori posizione» ha la didascalia
  «… € da spostare» (`:139-143`); sotto 0,05 la lettura stampa «nulla è fuori posizione» senza cifra (`:254-255`);
  l'aside di Previdenza è un importo (`allocazioneNarrative.ts:697-702`); `nextMoney` non è mai `null`
  (`page.tsx:333-336`), la sua clausola tace a importo ≤ 0 (`:159`). Esposizione riceve gli asset dalla pagina e
  possiede solo i profili (`usePortfolioExposure(ownerId, assets)`, `lib/hooks/usePortfolioExposure.ts:43`, `enabled:
  !!ownerId && signature !== ''` a `:57`, SENZA un parametro `enabled`, chiamato nel corpo di `EsposizioneTile.tsx:136`;
  un «Aggiorna» fallito lascia `isError` vero CON i profili letti, `:58-60`), con il suo `role="alert"` per il solo
  `isError` della query; le righe si rileggono al momento. «Modifica target» (`mobileAction`, `page.tsx:398-405`) sta
  dopo la griglia.
- **Previdenza** (`components/pension/PensionOverview.tsx:263-330`): versamenti non letti = quattro `ErrorNotice`
  (Rendimento su `contributionsError || snapshotsError`, `:268`; le altre su `contributionsError`, `:282`, `:296`, `:310`).
  Il verdetto è una frase per contribuente con le tre cause (`lib/utils/pensionNarrative.ts:120-143`, `blockSentence`:
  con un blocco stampa TWR, `employerInYear` e `taxSaving`); `returnState` viene da `isPensionReturnMeasurable`
  (`lib/utils/pensionReturn.ts:183`); l'aside di Anno fiscale è la RAL (`pensionNarrative.ts:397-404`); l'anno fiscale è
  un fratello del verdetto (`:250-253`).
- **FIRE**: tab in stato (`app/dashboard/fire-simulations/page.tsx:48`); Radix `TabsContent` smonta la tab inattiva
  (`:66-81`). La frase del vincolo del fondo chiude il paragrafo (`fireNarrative.ts:108`, `coastFireView.ts:645`,
  `monteCarloNarrative.ts:113`, con `lock.active && lock.lockedValue > 0 && lock.unlockCalendarYear !== null`;
  `whatIfNarrative.ts:209`, qui legata a `summary.isBridge`, `whatIfSummary.ts:200`). Evento è `order-1` ma terza nel DOM
  (`WhatIfAnalysisTab.tsx:389-412`: Prima e dopo, Delta, Evento). Il Calcolatore ha DOM Traguardo, Base, Reddito, Scenari
  (`FireCalculatorTab.tsx:180-183`, `order-1/4/3/2`). Una lettura fallita è della tab intera (`FireCalculatorTab.tsx:732`,
  `CoastFireTab.tsx:305`, `WhatIfAnalysisTab.tsx:349`, `MonteCarloTab.tsx:333`, `GoalBasedInvestingTab.tsx:207`): nessun
  `failed` per riga. I builder What If stampano gli importi senza segno, con la direzione a parole
  (`whatIfNarrative.ts:34-46`, `:237-244`, `:321-325`); `changed` (`:67`) è una `const` privata.

## 2. Obiettivo misurabile

- `npm run mobile:budget` sul fixture `census@example.com` a 390: `budget.json` prende la prima corsa dopo
  l'implementazione con `--tighten`; le soglie qui sotto sono l'obiettivo di chiusura, e una superficie che le supera
  resta col valore misurato e il commit la nomina con la misura: Allocazione ≤ 1,8 · Previdenza ≤ 1,9 · Calcolatore ≤ 1,9
  · Coast ≤ 1,8 · What If ≤ 2,2 · Monte Carlo ≤ 1,8 · Obiettivi ≤ 1,8 (ACCESO nel seed da questa spec, README § 9, 60:
  il fixture lo misurava spento, `screens` 1,00 su una tessera sola, e il budget non guardava le righe `goals-*`);
  `overflowX` `false`. `figuresOutsideVerdict` ≤ 5;
  `firstClosedRowAbovePill: true` dove LA tessera ha una curva (la curva cede, § 4.5), e `false` con `raisedBy` per
  Bilanciamento ed Evento, che non ne hanno (README § 9, 19).
- Playwright: ordine del DOM, pannelli chiusi vuoti, memoria per pagina e per tab, eyebrow rosso, zero richieste
  `/api/portfolio/instrument-profiles` (la route dei profili) a Esposizione chiusa; a 1440 le pagine di oggi salvo la
  punteggiatura del verdetto (README § 9, 5), Evento in testa su What If (43) e le `order-*` tolte.

## 3. Non-obiettivi

- B e C; il desktop oltre § 2; le primitive (MOB-02); il tablet (MOB-08); DESIGN.md (MOB-09); calcoli, parole (salvo la riga
  d'ambito, § 4.1, e la punteggiatura), tessere nuove.
- **Impostazioni**: nessun verdetto né cifra da sollevare, un modulo con un «Salva»; dal 2026-10-08 è un orchestratore
  (`app/dashboard/settings/page.tsx`) su sei viste controllate (`components/settings/tabs/*Tab.tsx`,
  doc/guide/impostazioni.md). La pill a 44 px arriva da MOB-02. **Assistente**: la conversazione è il contenuto, nessuna tessera.
- Il tipo `loan` (2026-10-10): un prestito è escluso dall'allocazione e lascia FIRE con la casa che finanzia; nessuna
  cella di MOB-07 lo legge, la prova resta in `allocation.spec.ts` / `fire.spec.ts` a 1440.

## 4. Design

### 4.1 Regole comuni

- **API**: quelle di MOB-02 § 4.1, coi loro nomi (`axis` compreso). **Chiavi**: `mobileSectionsKey('allocation')`,
  `('pension')`, `('fire-simulations', tab)`, `tab` ∈ `fire` · `coast` · `whatif` · `montecarlo` · `goals`: ogni tab ha il suo
  `useMobileSections` e ricorda da sé; `defaultOpen` vuoto ovunque; `sections` passa solo le righe rese in quel render
  (`alloc-previdenza` solo con un fondo, `page.tsx:527`; `goals-*` condizionali): una riga che sparisce esce da `known`.
  `dismissed` vive con la tab montata: cambiando tab una lettura fallita riapre.
- **DOM: una sequenza sola, il DOM di oggi** (README § 9, 1 e 11): `PageRest` subito DOPO la cella di LA tessera; le
  righe nell'ordine del DOM; gli `order-*` si tolgono; il desktop non cambia salvo What If (§ 4.4). «Parametri»,
  «Ipotesi», «Dettaglio» restano disclosure, dopo le righe; «Modifica target» resta dopo l'ultima riga e prima del
  «Dettaglio», fuori da `PageRest`. Una pagina o tab con zero righe (What If senza base, Monte Carlo senza run, Obiettivi
  vuoto o spento) non rende `PageRest` né «Il resto della pagina».
- **Striscia**: ogni cella è una cifra che verdetto o lettura stampano già (§ 7 lo prova sul testo; se no, non entra; una
  lettura resta intera, README § 9, 15), col `format` dato qui sotto. Il formatter della pagina si rifà con il contratto di
  MOB-02 § 4.1: `'pp'` («pp», `allocazioneNarrative.ts:50-52`), `decimals` (due decimali, `pensionNarrative.ts:43-46`; i
  decimali variabili di `monteCarloNarrative.ts:39-42` li calcola il selettore). `verdictStrip.ts` non si tocca.
- **Il vincolo del fondo** (`respectPensionLockInFire`) cambia il senso di ogni cifra FIRE: sotto `desktop:` diventa lo
  `scope` di `PageVerdict` (README § 9, 44), da `describeFireLockScope(lock: FireLock): string | null` (nuova,
  `fireNarrative.ts`; «Modello ponte: fondo pensione escluso fino al 2050»), non nulla esattamente quando `lock.active &&
  lock.lockedValue > 0 && lock.unlockCalendarYear !== null` (la condizione di `lockSentence`); What If passa
  `summary.isBridge ? describeFireLockScope(lock) : null`; la pagina lo passa solo con `sections.compact` (a 1440 la frase
  intera lo dice già). La frase del vincolo sta sempre nel `rest` (`leadLength` si ferma prima): lo scope non la doppia.
- **La curva cede** (README § 9, 4): sotto `desktop:` la curva di LA tessera scende a 120 px: `max-desktop:min-h-[120px]`
  (240 da `desktop:`) in `TraguardoTile.tsx:109-111`, `CoastTraguardoTile.tsx:87`, `ProbabilitaTile.tsx:64`; (180 da
  `desktop:`) in `FondoOggiTile.tsx:141`; la lettura resta intera.
- **`failed`** è di Allocazione (Esposizione) e Previdenza; nelle cinque tab FIRE nessuna `SectionSpec` porta `failed`:
  ogni lettura fallita resta l'`ErrorNotice` della tab intera, come oggi.

### 4.2 Allocazione

- **LA tessera = Bilanciamento** (`alloc-bilanciamento`): «sono allineato al piano?», con la banda nel suo aside; senza
  curva: `firstClosedRowAbovePill` `false` con `raisedBy: "MOB-07: Bilanciamento non ha una curva da cedere"` (19).
- **Striscia** `selectAllocazioneStrip({ balance: BalanceScore, gaps: ClassGap[] })` (`allocazioneSummary.ts`;
  `BalanceScore` in `lib/utils/allocationUtils.ts:303`), tono `neutral` (The Scope-Is-Not-An-Axis Rule), due celle
  (README § 9, 45): «Fuori posizione» `misallocationPct`, `percent`, → `alloc-piano`, `lifts: { section:
  'alloc-bilanciamento', block: 'fuori-posizione' }` (si nasconde solo il valore del KPI; la didascalia «… € da
  spostare», che nessun altro stampa, resta sotto l'etichetta: 17; la lettura «il 3,5% è fuori posizione» resta intera,
  15); sotto 0,05 (la soglia di `describeBalance`) `null` con `reason` «nulla», la parola che la lettura stampa;
  «{classe} sopra|sotto» `Math.abs(differencePp)` di `offTargetGaps(activeClassGaps(gaps))[0]`, `'pp'`, →
  `alloc-per-classe`, `null` «tutte in soglia». Il punteggio no (titolo e anello).
- **Righe**, nell'ordine del DOM: `alloc-per-classe` («corrente, target e gap»), `alloc-piano` («Ribilancia, Versa o
  Preleva»), `alloc-esposizione` («titoli, settori, emittenti»), `alloc-previdenza` («il fondo nel mix», non l'importo).
  Importo e modalità del Piano sono stato della pagina.
- **Esposizione**: `usePortfolioExposure(ownerId, assets, options?: { enabled?: boolean })` (terzo argomento additivo,
  default `true`, in AND con `!!ownerId && signature !== ''`; da spento `profiles` è `undefined` e `computeExposure` non
  gira): `EsposizioneTile` riceve la prop `enabled` dalla pagina (`!sections.compact || !!collapse('alloc-esposizione')?.mounted`)
  e la passa all'hook; la pagina legge `isError` dalla stessa chiave (`queryKeys.portfolio.instrumentProfiles(ownerId,
  profileRequestsSignature(selectProfileRequests(assets)))`, `lib/query/queryKeys.ts:104`) con un osservatore `enabled:
  false`, che non scarica nulla (React Query scarica se ALMENO UN osservatore è abilitato: per questo l'hook dentro la
  tessera deve spegnersi). Le pagine montano dentro `ProtectedRoute` dopo l'auth: `useCompactLayout` vale il vero già al
  primo render, quindi `enabled` non parte mai a `compact` falso sul telefono. A firma vuota, sotto `desktop:`, il motore
  gira solo con la riga montata. Con `isError` e nessun profilo letto, sotto `desktop:`, `<ErrorNotice
  collapse={collapse('alloc-esposizione')} live={false} onRetry={refetch}>` e `failed`; dopo un «Aggiorna» fallito con i
  profili letti la tessera resta col suo avviso, che sotto `desktop:` perde `role="alert"`, e la sezione porta comunque
  `failed`. La regione della banda (`page.tsx:447`) resta: annuncia un gesto, non un errore. **La riga di copertura**
  (letto · non letto · non applicabile · fuori vista) sta nel pannello, sopra l'elenco: mai nella striscia né in
  `asideWhenClosed` (porta importi). **Una fetta «non letta» non è una lettura fallita**: `failed` e l'eyebrow rosso
  restano il solo `isError` della query, mai una copertura parziale.
- **Verdetto**: la prima clausola diventa frase e `leadLength` (la punteggiatura cambia anche a 1440, «. La leva»,
  README § 9, 5); `restLabel`: «la leva» con la sola clausola della leva, «dove vanno i prossimi soldi» con la sola
  `nextMoneyClause` non vuota, «la leva e i prossimi soldi» con entrambe; senza seguito `leadLength` resta `undefined`.
  I target irraggiungibili (`orphanSentence`, `allocazioneNarrative.ts:169`) sono `binding`: nessun taglio.

### 4.3 Previdenza

- **LA tessera = Il fondo oggi** (valore, curva a 120 px sotto `desktop:`, «Aggiorna valore»: il gesto del mese; in demo
  manca, come oggi). L'anno fiscale (`yearAxis`, `SegmentedPill`) sotto `desktop:` passa come `axis` di `PageVerdict`,
  subito sotto il titolo (README § 9, 2 e 12); a 1440 resta accanto al verdetto come oggi (seconda istanza).
- **Striscia** `selectPensionStrip({ blocks, taxYear })` (`pensionSummary.ts`), The Three-Causes Rule: **tre celle o
  nessuna**, solo con UN blocco e `returnState === 'measured'`. «Mercato da {mmm YYYY}» (ogni clausola nomina la sua
  finestra) TWR, `signed-percent`, → `prev-rendimento`; «Datore nel {Y}» `employerInYear`, `currency`, → `prev-versato`,
  `null` con `reason` «nessun versamento» a zero; «Fisco nel {Y}, circa» `taxSaving`, `currency`, → `prev-anno-fiscale`,
  `null` con `reason` «senza RAL» se `ral` è null, «fondo non assegnato» se `tax` è null, «nessun versamento» se
  `taxSaving` è 0 (mai uno zero: il verdetto TOGLIE la clausola di una causa vuota, `pensionNarrative.ts:130-135`).
  Cambiare anno ricalcola «Datore» e «Fisco» dallo stesso `blocks`; «Mercato da …» non cambia (off-axis); nessuna riga si
  apre o chiude. Non misurabile, più blocchi, errori: nessuna striscia (la copertura a 390 dei non misurati resta Vitest).
- **Righe**: `prev-rendimento` (la finestra), `prev-anno-fiscale` («beneficio e plafond», non la RAL), `prev-versato`
  («per natura»), `prev-versamenti` («N versamenti»); le quattro `ErrorNotice` prendono `collapse` e
  `live={!sections.compact}`, e le `SectionSpec` portano `failed`: `prev-rendimento` = `contributionsError ||
  snapshotsError`, le altre tre = `contributionsError` (l'eyebrow rosso di Previdenza è provato solo in Vitest, non in
  Playwright: Firestore dal client).
- **Verdetto**: con UN blocco misurato e la striscia di tre celle, **`leadLength: 0`** (la frase unica stampa le tre
  celle: deroga «solo titolo», README § 9, 3 e 46), `restLabel` «le tre cause»; la frase intera sta dietro «Il perché»,
  dove può ripetere le cifre (8). Con due o più contribuenti: verdetto intero e nessuna striscia (46: la frase di chi ha
  perso terreno non finisce dietro un tap). Senza striscia nessun taglio.

### 4.4 FIRE

| Tab | LA tessera | Striscia (selettore; campo, formato → riga) | Righe (ordine del DOM) | Seguito |
|---|---|---|---|---|
| Calcolatore | Traguardo | `selectFireStrip({ target: FireTarget, passiveIncome: PassiveIncome })` in `fireSummary.ts`: «Ti mancano» `gap`, `currency` → `fire-base` (la lettura «ne mancano…» resta intera, 15); «Rendita oggi» `PassiveIncome.monthly`, `currency` → `fire-reddito` | `fire-base`, `fire-reddito`, `fire-scenari` | «. Da allora…» |
| Coast | Traguardo | `selectCoastStrip({ target: CoastTarget, scenarios: CoastScenarioRow[] })` in `coastFireView.ts`: «Ti mancano» `gap` (raggiunto: «Margine» `surplus`), `currency` → `coast-afflussi`; «Nell'orso» `coastNumberToday` dell'orso, `currency` → `coast-scenari` | `coast-afflussi`, `coast-scenari` | il ritmo |
| What If | **Evento** (README § 9, 43: prima nel DOM anche a 1440, cella sinistra; The Input Tile Rule la riscrive MOB-09; senza curva → `raisedBy: "MOB-07: Evento è un modulo"`) | `selectWhatIfStrip({ event: WhatIfEvent, summary: WhatIfSummary, divergence: WhatIfDivergence \| null })` in `whatIfSummary.ts`: «Patrimonio FIRE {scende\|sale}» `Math.abs(netWorth.delta)`, `currency`, `tone` dal segno → `whatif-delta`; «{Distanza\|Vantaggio} nel {anno}» `Math.abs(gapThen)`, `currency`, `tone` dal segno → `whatif-prima-dopo` (le parole di direzione sono quelle che le frasi già stampano: i builder non scrivono «+»/«−»); `[]` a evento vuoto | `whatif-prima-dopo`, `whatif-delta`, `whatif-sensibilita` | la frase Coast |
| Monte Carlo | Probabilità | `selectMonteCarloStrip({ run: MonteCarloRun, comparison: ScenarioComparison \| null })` in `monteCarloSummary.ts`: «Mediana» `medianFinal`, `currency` → `mc-distribuzione`; «Orso» `successRate` dell'orso, `percent` → `mc-scenari` | `mc-distribuzione`, `mc-scenari`, `mc-parametri` | orso e toro |
| Obiettivi | Obiettivi | nessuna (README § 9, 47) | `goals-traiettoria`, `-milestone`, `-allocazione`, `-assegnazioni` | — |

- **`null` e le `reason`**: Calcolatore raggiunto → «Ti mancano» `null` «già FIRE»; Coast con margine sotto 0,5 € →
  «Margine» `null` «raggiunto»; What If sotto la soglia (`isWhatIfChange(delta, unit = 0.5)`, esportata da
  `whatIfSummary.ts`: `whatIfNarrative.ts` la importa al posto della sua `const changed`, una sola soglia per frase e
  cella) o divergenza `null` → `null` «invariato» (lo stampa `buildDeltaRows`); mediana a zero → `null` «i soldi
  finiscono» (le parole di `monteCarloNarrative.ts:95`; The Stale-Run Rule: mai «0 €»).
- **I quattro builder**: in ogni ramo (anche «Sei già FIRE.», «Proiezione non disponibile.», «FIRE oltre i N anni.»,
  Coast raggiunto, Monte Carlo non eseguita, What If senza evento) `leadLength` cade sul primo «.», ripunteggiato anche
  a 1440 (Calcolatore «. Da allora…», README § 9, 5); se dopo non resta nulla `leadLength` resta `undefined`; se il resto
  è la sola frase del vincolo, `restLabel` «il fondo pensione».
- **Tasse e pensioni** qualificano il numero FIRE ma stanno nella didascalia di Traguardo (`captionHonestClauses`,
  `fireNarrative.ts:311-318`), sempre aperta: il secondo ramo di The Binding-Clause Rule. Il vincolo va nello `scope`.
- **Parametri** (Monte Carlo): aside «il piano di oggi», o «modificati: premi Esegui» con `haveRunInputsChanged` (The
  Stale-Run Rule anche da chiusa); la striscia resta quella del run mostrato finché non si preme Esegui. Senza un run
  (eseguibile o no): Parametri sola, LA tessera aperta, nessuna striscia, nessun `PageRest`.
- **Obiettivi**: scegliere un obiettivo chiama `collapse('goals-traiettoria')?.onOpenChange(true)`: la riga si apre senza
  spostare il focus né scorrere (la lista resta dove il lettore la usa; `reveal` resta delle celle della striscia).
  Vuoto o disattivato (il fixture base lo è): una tessera, nessun `PageRest`. **Nulla registrato**: Traguardo aperto con
  l'azione, righe «non ancora calcolabile»; le costanti di cella (`FireCalculatorTab.tsx:171-174`, `CoastFireTab.tsx:112-114`)
  servono i due rami.

### 4.5 Conflitti con PERF

PERF-04 (in develop dal 2026-09-30) ha reso pigra la tab intera (What If, Coast, Monte Carlo, Obiettivi: `lazyComponent`
in `app/dashboard/fire-simulations/page.tsx`, doc/guide/fire.md), non i grafici dentro: Prima e
dopo è nel chunk della tab (`WhatIfAnalysisTab.tsx:89`), si monta all'apertura senza scaricare nulla; lo skeleton di
MOB-02 § 4.8 vale per un grafico pigro da sé. L'Esposizione (dal 2026-09-28; il `Server-Timing` della sua route dice
`source=cache|yahoo` dal 2026-10-05) parte all'apertura e da calda non chiama Yahoo. PERF-03 (in develop dal 2026-09-30):
«Aggiornato alle…» sta nel `PageHeader` — le pagine Previdenza e FIRE leggono gli stessi hook dei loro componenti per la
riga — mai nella composizione né in «Il perché». PERF-12 (in develop dal 2026-10-06) e PERF-14 (dal 2026-10-08),
AGENTS.md § Motion: nessun `layout`. `perf/budget.json` ha i tetti di `/dashboard/allocation` (593), `pension` e
`fire-simulations` (736): `perf:budget` prima e dopo; `perf:census` con gli scenari `mount` e `nav` (§ 11). Impostazioni: § 3.

### 4.6 Decisioni (README § 9)

Tutte le domande di questa spec sono chiuse: Allocazione due celle (45) e solo il valore del KPI sollevato (17); la
punteggiatura a 1440 (5); il vincolo come `scope` (44); Previdenza con uno (3, 46) e con più contribuenti (46); la curva
a 120 px e le eccezioni senza curva (4, 19); What If con Evento in testa (43); Obiettivi senza striscia (47); le celle che
ripetono la lettura (15); LA tessera sempre aperta (21); lo scope dentro il verdetto nel censimento (13); l'ordine del DOM (11).

## 5. File da toccare

- `app/dashboard/allocation/page.tsx`, `components/allocation/tiles/{Bilanciamento,Piano,PerClasse,Esposizione,Previdenza}Tile.tsx`,
  `lib/hooks/usePortfolioExposure.ts` (`options.enabled`).
- `scripts/seedCensusE2E.mts` (README § 9, 60): `goalBasedInvestingEnabled: true` e UN obiettivo inventato, con uno
  stato che vale dal 5 al penultimo giorno (doc/guide/prima-schermata.md § Il fixture); `fire-obiettivi` rimisurato
  con `--tighten` nelle tre viewport, la riga di README § 3.1 riscritta; WORKFLOW.md § 3 (la riga del fixture) e
  l'intestazione del seed perdono «Obiettivi spento».
- `components/pension/PensionOverview.tsx`, `components/pension/tiles/{FondoOggi,Rendimento,AnnoFiscale,Versato,Versamenti}Tile.tsx`,
  `lib/utils/pensionNarrative.ts` (`leadLength`, `restLabel`).
- `components/fire-simulations/{FireCalculatorTab,CoastFireTab,WhatIfAnalysisTab,MonteCarloTab,GoalBasedInvestingTab}.tsx`;
  `components/fire-simulations/tiles/TraguardoTile.tsx`, `coast/tiles/CoastTraguardoTile.tsx`,
  `components/monte-carlo/tiles/ProbabilitaTile.tsx` (la curva); `components/goals/tiles/ObiettiviTile.tsx`; le tessere
  delle righe (inoltrano `collapse`, `asideWhenClosed`) in `components/fire-simulations/{tiles,coast/tiles,whatif/tiles}/`,
  `components/monte-carlo/tiles/`, `components/goals/tiles/`.
- `lib/utils/{allocazioneSummary,allocazioneNarrative,pensionSummary,fireSummary,fireNarrative,coastFireView}.ts`,
  `lib/utils/{whatIfSummary,whatIfNarrative,monteCarloSummary,monteCarloNarrative}.ts`. I test di § 7;
  `e2e/{allocation,pension,fire,coast}.mobile.spec.ts`, `e2e/{allocation,pension,fire,coast}.spec.ts`; `doc/mobile/budget.json`.

## 6. Passi

1. Branch, guide, `mobile:census` PRIMA (fixture). 2. Pure e test, falsificati. 3. Allocazione, Previdenza, le
cinque tab. 4. Playwright, tsc, lint, Vitest. 5. `mobile:census`/`mobile:budget -- --tighten`, `perf:budget`, `perf:census`, giro, documentazione, commit.

## 7. Test e falsificazione

- `__tests__/allocazioneSummary.test.ts`: due celle, scarto `null` in soglia, «Fuori posizione» `null` «nulla» sotto
  0,05 (falsificare stampando «0,0%»), testi dentro `describeBalance` e `buildAllocazioneVerdict` (falsificare con due
  decimali). `allocazioneNarrative.test.ts`: `lead` chiude con «.»; i tre `restLabel`; con target irraggiungibili `rest`
  vuoto (falsificare togliendo `binding`).
- `pensionSummary.test.ts`: un blocco misurato → tre celle; non misurato, due blocchi → `[]`; celle nel verdetto,
  finestra nell'etichetta, datore a zero → `null` «nessun versamento», le tre `reason` del fisco (falsificare con
  `block.return !== null` al posto di `returnState`, e con uno `0`). `pensionNarrative.test.ts`: `leadLength: 0` con un
  blocco misurato, `undefined` con più blocchi (falsificare con `leadLength` undefined). `fireSummary`, `coastFireView`,
  `whatIfSummary`, `monteCarloSummary`: i quattro selettori, `validateStrip` vuoto, testi ritrovati (What If: le parole
  di direzione), le `null` con le `reason` (falsificare con l'euro non compatto e con «0 €» a mediana esaurita);
  `isWhatIfChange` una sola per frase e cella. I quattro builder FIRE: `lead` chiude con «.» in ogni ramo, vincolo nel
  `rest`, `restLabel` «il fondo pensione» quando è solo (falsificare lasciando «, e da allora»). `fireNarrative.test.ts`:
  `describeFireLockScope` non nullo ⇔ la condizione di `lockSentence`; `whatIfNarrative.test.ts`: scope ⇔ `BRIDGE_NOTE` su
  un fixture con `isBridge` e `lock` coerenti; didascalia con tasse e pensioni (falsificare togliendo `captionHonestClauses`).
- **`e2e/allocation.mobile.spec.ts`** (esiste dal 2026-09-28 con la riga di copertura a 390: si ESTENDE, non si crea, e il
  suo caso apre prima «Esposizione»; progetto `mobile`): (1) due celle ≥ 44 px, il valore del KPI «Fuori posizione»
  nascosto, «… da spostare» e la lettura intera, quattro trigger chiusi nell'ordine del DOM (Per classe prima del Piano),
  `#alloc-piano-panel` `inert` e vuoto; (2) la cella apre il Piano, focus sul trigger; (3) zero richieste ai profili a
  riga chiusa; (4) `page.route('**/api/portfolio/instrument-profiles**', abort)` (`e2e/settings.spec.ts:143`), aprire e
  chiudere: eyebrow `text-destructive`, l'annuncio; (5) reload, `mobile-sections:allocation`; (6) nessuno sforamento,
  nessun `[class*="order-"]`. Rossi falsificando: (1) `liftedFigures` assente; (2) `reveal` senza focus; (3) `enabled`
  sempre vero nell'hook; (4) `failed` sempre falso; (5) nessuna scrittura; (6) una cella `min-w-[420px]`.
- `pension.mobile.spec.ts`: `:19` ordine dalle righe, `:67` apre Versamenti; tre celle su `scripts/seedPensionE2E.mts`
  (rosso se il selettore ne rende due); solo titolo + striscia, la frase in «Il perché». `fire.mobile.spec.ts:28`,
  `coast.mobile.spec.ts:19` premono «Apri tutte»; nuove, in `e2e/fire.mobile.spec.ts` (progetto `mobile`, account base):
  riga d'ambito sul Calcolatore con il vincolo di `scripts/seedCoastFireE2E.mts:83`; memoria per tab aprendo `fire-base`,
  passando a Coast, aprendo `coast-scenari` e tornando (a tab smontata torna solo `localStorage`); Obiettivi nel ramo
  «disattivato» del fixture base: una tessera, nessun `PageRest`; What If: Evento prima nel DOM. Rossi con scope anche a
  1440, chiave senza `tab`, `PageRest` a zero.
- `allocation.spec.ts`, `pension.spec.ts`, `fire.spec.ts`, `coast.spec.ts` (1440): nessun `[id$="-trigger"]` (Parametri
  e Dettaglio hanno il loro `aria-expanded`), striscia invisibile, le due frasi del verdetto («. La leva», «. Da
  allora»), Evento nella cella sinistra di What If (falsificare ignorando `compact`).

## 8. Collaudo guidato

- A: le spec desktop, Vitest nei due fusi. C: § 7.
- F (mirror, DevTools a 390 sul portatile): 1) Allocazione; 2) Previdenza, tre cause o nessuna; 3) la riga del
  vincolo; 4) cambiare tab e tornare; 5) le tre pagine a 1440 come prima (salvo le due frasi ed Evento). G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Una spec mobile che legge in una riga chiusa non trova nulla: si rileggono tutte. La striscia di Previdenza tace
  spesso (senza RAL, dati incoerenti): voluto.
- Rollback: `collapse` sempre `undefined` per pagina; i builder per lettera; `options.enabled` default `true` spegne il resto.

## 10. Documentazione da aggiornare

CLAUDE.md «Latest» e § Current Status; § Composizione mobile in `doc/guide/{allocazione,previdenza,fire,fire-coast,fire-what-if,
fire-monte-carlo,fire-obiettivi}.md` (l'ordine del DOM; `allocazione.md:141`, `fire.md:175` e `fire-coast.md:46` perdono
«il telefono tiene il suo ordine con gli `order-*`»; `fire-what-if.md`: Evento in testa anche a 1440);
`doc/guide/e2e-emulatori.md`; `Draft Release Temp.md` (una riga per pagina, senza dati privati); `doc/mobile/README.md` § 6 e § 3.1.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-07-allocazione-previdenza-fire.md: la composizione mobile di
Allocazione (Bilanciamento aperta, due celle, Esposizione letta solo da aperta con usePortfolioExposure(…, { enabled }),
eyebrow rosso in errore), Previdenza (un contribuente: solo titolo e tre cause in striscia; più contribuenti: verdetto
intero senza striscia) e delle cinque tab di FIRE (Evento in testa su What If anche a 1440, il vincolo del fondo come
riga d'ambito, Obiettivi senza striscia), le righe nell'ordine del DOM con le order-* tolte, la curva a 120 px sotto
desktop, con le API di MOB-02 coi loro nomi, i test Vitest e le spec Playwright di § 7.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § React Query and Derived State,
  § Motion, § Navigation, § Hierarchy, Density and Disclosure — per l'ordine del DOM vale README § 9, 11, non la riga
  sugli order-* —, § Accessibility, § Performance tooling), CLAUDE.md
- Leggi doc/guide/allocazione.md, previdenza.md, fire.md, fire-coast.md, fire-what-if.md, fire-monte-carlo.md,
  fire-obiettivi.md, stati.md, e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/mobile/README.md (§ 9: le decisioni 1–47), MOB-02 (§ 4.1 è il contratto) e questa spec per intero;
  DESIGN.md § 5 e § 6 (MAI rigenerarlo). MOB-01..06 sono chiuse.
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; nessuna domanda è aperta (README
§ 9): una scelta nuova che il codice ti impone me la chiedi con lo strumento interattivo prima di toccare le pagine;
nessuna cifra del mirror in test, documenti o draft.
Chiusura: mobile:census e mobile:budget prima/dopo sul fixture (--tighten; raisedBy per Bilanciamento ed Evento); tsc,
lint 0, Vitest in Europe/Rome e sotto TZ=UTC; le spec Playwright di § 7 con le falsificazioni viste rosse; npm run
perf:build e perf:budget -- --dist=.next-perf prima e dopo (da Git Bash; un tetto si alza solo con raisedBy e il mio
OK); npm run perf:census -- --scenario=mount,nav --route=allocation,pension,fire-simulations --label=prima|dopo; giro
guidato di 5 punti sul mirror, poi mirror:remove; la documentazione di § 10 in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort high.** Sette superfici dense di regole di dominio (le tre cause, il modello ponte, la
ritenuta, The Stale-Run Rule): il rischio è una cella o un taglio che ne contraddice una.
