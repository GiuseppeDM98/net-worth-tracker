# MOB-05 — Rendimenti

> Stato: da fare · riletta in modo adversariale il 2026-10-10: 25 rilievi, 4 decisioni · Priorità: 2 (la base è una clausola vincolante; Plusvalenze sparisce in silenzio) · Sforzo: M ·
> Dipende da: MOB-01 (ritirata il 2026-10-10, in develop dal 2026-10-10, PR #448), MOB-02 (ritirata il 2026-10-10, in develop dal 2026-10-10, PR #450; PERF-09 chiusa il 2026-10-04, in develop) · Sblocca: MOB-06..08, MOB-09

## 1. Il problema, misurato

Censimento 2026-09-26. **390×844**: 4,71 schermate, 8 tessere (1 sopra la piega / 0 intere), 53 cifre (7 sopra), 27
controlli, 2 grafici; navbar 74 px, verdetto 153 px; LA tessera da y 478, alta 585: finisce sotto la pill; l'ultima
tessera finisce a y 3706. **768**: 2,75 · 8 (3/1). **1024×768**: 3,62 · 8 (1/0). Il codice (righe del 2026-09-26, PRIMA
che il caricamento passasse a `lib/hooks/usePerformanceData.ts`, 2026-10-04: riverificarle):

- `app/dashboard/performance/page.tsx:721-736` verdetto + riga d'ambito (`:727-732`, `describeMeasurementBase`);
  `:738-742` sotto `desktop:` selettore e due bottoni da 44 px DOPO verdetto e base; il `CustomPeriodChip` è un fratello
  dopo le azioni impilate (`:700-702`). `:616-626` la navbar mobile ha solo «Aggiorna»; a dati insufficienti (`:663-693`)
  il telefono non ha il periodo personalizzato. Il DOM della griglia è Rendimento, Benchmark, Contributi, [Attribuzione,
  Capitale e mercato], [Rischio, Consistenza, Plusvalenze] (`:712-809`), riordinato sul telefono con `order-1…8
  desktop:order-none`, che README § 9, 1 vieta; i commenti di `page.tsx:16-20` («the phone re-orders») e `:572` lo dicono.
- `:292-294` meta e registro leggono solo `data`: una meta in errore vale «non migrato», `realizedSummary` è `null`
  (`:539`), la tessera non si monta (`:849-853`). **Plusvalenze sparisce**, e Contributi perde il registro (`:529-532`,
  `investedCapital` `null`). Il registro in errore invece ferma GIÀ la pagina: è una delle sei letture di
  `usePerformanceData` (`useAssetTransactions`, sulla stessa chiave), e `composeReadState` mette `loadFailed`
  (`lib/utils/readState.ts:28`); l'hook restituisce `trades` come dato, non l'`isError` della query (`:155-172`).
- `components/performance/tiles/RendimentoTile.tsx`: eroe `:95-109` (cifra e qualificatore «nei 3 mesi» nello stesso
  `div`, `:99-113`), chip dello scarto `:112-124` (due varianti: valore e «in arrivo»), chip sull'altra base
  `:125-130`, chip «dal massimo del periodo» `:131-135`, curva `minHeight={160}` `:149` (inline in
  `GrowthOfHundredChart.tsx:168`).
- `lib/utils/performanceNarrative.ts:309-352` una frase sola, `:355-360` nessun taglio; `shortBenchmarkName` (`:152`) è
  privata; lo zero è già senza segno (`:74`, `:85`). I modali hanno già `returnFocusTo` (`page.tsx:689`, `:876`, `:890`).
- `e2e/performance.degraded.spec.ts:262` legge il `textContent` della region «Verdetto sui rendimenti» e `:283` lo
  confronta dopo il reload; i sei `useBenchmarkReturns` non sono persistiti (`lib/constants/persistCache.ts:70-89`) e
  degradano in silenzio (`retry: 1`, `useBenchmarkReturns.ts:34`).

## 2. Obiettivo misurabile

- `mobile:budget` sul fixture `census@example.com` (README § 9, 10), `rendimenti` a 390: schermate **≤ 2,0**,
  `figuresOutsideVerdict` **≤ 5** (il conto: 1 cella in «%» — quella in punti non conta —, 3 euro nella lettura di
  «Crescita di 100», il chip sull'altra base; il chip «dal massimo» passa nel seguito, README § 9, 38),
  `firstClosedRowAbovePill: true`; `budget.json` stretto con `--tighten`; 768 e 1024 non peggiorano.
- A 1440 la pagina di oggi, salvo tre differenze dichiarate: la punteggiatura del verdetto dove il taglio la cambia
  (README § 9, 5), Plusvalenze in errore (§ 4.5) e Benchmark in errore (§ 4.4, README § 9, 36); e le `order-*` tolte (già
  `desktop:order-none`).
- Playwright a 390: § 7 (base senza tap, asse, celle, AI mai cliccato, memoria, fuoco, eyebrow rosso).

## 3. Non-obiettivi

- B e C; il desktop oltre § 2; le colonne del tablet (MOB-08); DESIGN.md (MOB-09); lo skeleton sotto `desktop:` (sette
  celle alte contro le righe: come per Hall of Fame).
- Letture, base, flussi e cache: sono di `lib/hooks/usePerformanceData.ts` (doc/guide/rendimenti.md § every collection
  read once). Qui nessuna query cambia; `useAssetLedgerMeta(ownerId)` si rilegge dal suo `refetch`.
- Il chip sull'altra base e il ROI non entrano nella striscia; `AIAnalysisDialog` non cambia. Il tipo `loan`
  (2026-10-10) è fuori da ogni base di Rendimenti (CLAUDE.md): nessuna cella lo legge.

## 4. Design

### 4.1 La prima schermata sotto `desktop:`

Navbar («Aggiorna», «Analizza con AI») → titolo del verdetto → **asse** (lo slot `axis` di `PageVerdict`, README § 9, 2 e
12: il selettore, l'icona del periodo personalizzato in coda, e sotto il selettore il `CustomPeriodChip` quando un
periodo personalizzato è attivo; anche a dati insufficienti, `page.tsx:619-649`, lo slot c'è, senza striscia, righe né
`scope`) → prima frase, solo nel ramo con taglio (§ 4.3) → striscia → **riga d'ambito** → «Il perché» → LA tessera
**Rendimento (TWR)**, senza eroe sotto `tablet:` (non si chiude, 21) → «Il resto della pagina» → righe chiuse → il
«Dettaglio», com'è. A 1440 il selettore resta accanto al verdetto com'è oggi (`hidden shrink-0 desktop:block`), seconda
istanza dello stesso controllo. `PageVerdict` non prende `className` e `page-verdict.tsx` non è un file di questa spec.

Il conto in px della prima schermata a 390 (navbar 74 + titolo ~60 + asse 44 + striscia ~70 + riga d'ambito ~20 + «Il
perché» 44 + «Il resto della pagina» ~50 + LA tessera con la curva a 120 px e la lettura) si scrive in SESSION_NOTES
dalla prima corsa; se non ci sta, cede solo la curva (README § 9, 4).

### 4.2 La striscia — `selectPerformanceStrip` in `lib/utils/performanceSummary.ts`

`(input: { heroReturn: HeroReturn; benchmarkGap: number | null; benchmarkShortName: string; benchmarkLoading: boolean;
hasAttribution: boolean }) => StripFigure[]`, dai valori che la pagina già calcola (`page.tsx:492-499`); la pagina passa
`benchmarkShortName` da `shortBenchmarkName`, che `performanceNarrative.ts` esporta («Portafoglio 60/40» → «60/40»):

| Cella | `value` · `format` | `opens` | `reason` | `lifts` |
|---|---|---|---|---|
| «Rendimento {`heroReturn.label`}» (nei N mesi · nel mese · annualizzato) | `heroReturn.value` · `signed-percent` | `rend-attribuzione`, se `!hasAttribution` `rend-capitale` | «non ancora misurabile» | `rend-twr` · `hero` |
| «Sul {benchmarkShortName}» | `benchmarkGap` · `points` | `rend-benchmark` | «in arrivo» con `benchmarkLoading`, «modello non disponibile» altrimenti | `rend-twr` · `benchmark-chip` |

Sotto l'anno la cifra è il rendimento del periodo, MAI annualizzato (`resolveHeroReturn`); lo scarto è sulla sua base,
con la funzione del verdetto e del chip (**The Same-Basis Rule**). `resolveBenchmarkGap` sta in
`performanceNarrative.ts:259`, che importa da `performanceSummary.ts`: la striscia riceve il risultato, mai la chiama
(import circolare). L'etichetta porta la base: la didascalia che **The Binding-Clause Rule** (proposta, MOB-09) chiede.
`RendimentoTile` prende `liftedFigures?: readonly ('hero' | 'benchmark-chip' | 'drawdown-chip')[]` ed esporta
`isRendimentoLiftedBlock` (la guardia su `liftedBlocks`, `LIFTED_FIGURE_CLASS` in `components/ui/tile.tsx`); la pagina passa
`liftedBlocks(strip, 'rend-twr').filter(isRendimentoLiftedBlock)` più `'drawdown-chip'` (§ 4.3) e mette `LIFTED_FIGURE_CLASS` sui blocchi: il blocco
`hero` è l'intero `div` della cifra (cifra + qualificatore, `:99-113`); il blocco `benchmark-chip` è il `Chip` dello
scarto con valore; con la cella 2 `null` (`liftedBlocks` non la restituisce) il chip «in arrivo» resta nella tessera come
oggi. Quando il 60/40 arriva dopo il primo render la cella passa da «in arrivo» al valore e il verdetto cambia ramo
(§ 4.3): il layout si assesta, dichiarato in guida.

### 4.3 Il verdetto breve e la riga d'ambito

Il paragrafo è UNA frase a punti e virgola («Rende +2,1% nei 4 mesi (TWR), 0,4 punti sopra il Portafoglio 60/40, con
uno Sharpe di …; il drawdown massimo …; … positivi.», `performanceNarrative.ts:315-350`): la «prima frase» della
regola «titolo + prima frase» è tutto il paragrafo. **Due rami** (README § 9, 18: per la deroga conta ogni cella della
striscia, anche in punti):

- **con il 60/40** la prima frase ristampa le due celle («+2,1%», «0,4 punti»): **`leadLength: 0`** (deroga «solo titolo»,
  dichiarata in doc/guide/rendimenti.md), `sentence` invariata (attese di `:147`, `:248`), `restLabel` «rendimento,
  Sharpe, drawdown e mesi positivi»;
- **senza il 60/40** ristampa una cella sola: il builder spezza al primo «;» anche a 1440 (README § 9, 5) scrivendo «.»
  al posto di «; » e la maiuscola sulla prima lettera del segmento seguente («Il drawdown massimo…», «Mai sotto il
  massimo…»; un segmento che inizia con una cifra resta com'è), `leadLength` conta i segmenti fino a quel «.» compreso,
  `restLabel` «Sharpe, drawdown e mesi positivi».

Nessun `binding`; senza rendimento nessun taglio. **La riga d'ambito** diventa `scope` di `PageVerdict`, passato sempre
(un solo DOM, visibile a ogni larghezza, README § 9, 13) e mai dietro un tap: senza, «+2,1%» si legge come il rendimento
di tutto il patrimonio. **Il chip «dal massimo del periodo»** (`:131-135`, la distanza di OGGI dal picco,
`computeDrawdownStatus`, `page.tsx:506`; Rischio e verdetto stampano il MASSIMO) sotto `desktop:` sparisce dalla tessera
(`'drawdown-chip'` in `liftedFigures`) e la sua cifra entra come clausola nel seguito («…; oggi a −1,2% dal massimo del
periodo»), dove `resolveDrawdownStory` già parla del drawdown (README § 9, 38: a 1440 è un'aggiunta dichiarata); il chip
sull'altra base resta.

### 4.4 Le sette righe

`useMobileSections({ route: 'performance', sections })` (`mobile-sections:performance`). **Una sequenza sola** (README
§ 9, 1 e 11): nessun `order-*`; le celle di `page.tsx` perdono `order-N desktop:order-none` e il telefono legge il DOM
desktop, che a 1440 non cambia (LA tessera è già la prima): `rend-twr`, `PageRest` subito dopo la sua cella, poi le righe
nell'ordine della tabella. Hanno cifre gli aside di Rischio e Benchmark (`RischioTile.tsx:67-72`,
`BenchmarkTile.tsx:81-85`) e l'anno di Attribuzione e Capitale e mercato (`describePeriodAside`,
`performanceNarrative.ts:229-231`): ogni riga prende `asideWhenClosed` in parole, da `PERFORMANCE_CLOSED_ASIDES`
(`performanceNarrative.ts`), inoltrato a `Tile`.

| id | eyebrow | `asideWhenClosed` | presente se |
|---|---|---|---|
| `rend-benchmark` | Benchmark | «contro i portafogli modello» | sempre; `failed` con tutte e sei le serie in errore (README § 9, 36): `ErrorNotice` al posto della tessera a ogni larghezza, riprova = `refetch` delle sei |
| `rend-contributi` | Contributi | «capitale entrato nel periodo» | sempre |
| `rend-attribuzione` | Da dove viene il rendimento | «per strumento» | `attribution` (se diventa `null` a riga aperta la riga esce da `known` e la cella 1 apre `rend-capitale`) |
| `rend-capitale` | Capitale e mercato | «versato e mercato» | sempre |
| `rend-rischio` | Rischio | «volatilità, Sharpe e drawdown» | sempre |
| `rend-consistenza` | Consistenza | «mese per mese» | sempre |
| `rend-plusvalenze` | Plusvalenze realizzate | «per anno fiscale» | una vendita chiusa (`realizedSummary`), o lettura fallita |

Heatmap e curva del capitale si montano all'apertura (The Period-Transforms Rule vale per ciò che è montato).

### 4.5 Plusvalenze in errore

Pura in `performanceSummary.ts`: `resolveRealizedGainsState({ meta: { isError: boolean; data: AssetTransactionsMeta |
null | undefined }, trades: AssetTransaction[] })` → `'absent' | 'failed' | 'ready'`. `failed` = meta in errore SENZA
dato (`data === undefined`: una rilettura fallita della meta con un dato già letto, anche restituito dalla cache
persistita, resta `ready`, perché la meta non decide alcuna cifra del verdetto, a differenza dei sei input che fermano la
pagina con `composeReadState`); `absent` = meta `null` («non migrato») o nessuna vendita chiusa
(`summarizeRealizedGains(aggregateRealizedByYear(trades).byYear) === null`); `ready` altrimenti. Il registro in errore è
già `loadFailed` (§ 1): il caso vero è la meta. Con `failed`, a ogni larghezza, `ErrorNotice` da `describeReadFailure({
subject: 'Plusvalenze realizzate', consequence: 'Le plusvalenze realizzate non sono state lette: …', canRetry: true })`,
riprova = `refetch()` di `useAssetLedgerMeta(ownerId)`. Sotto `desktop:` `collapse`, `live={!sections.compact}`,
`SectionSpec.failed`: la riga si apre da sola, chiusa ha l'eyebrow in `--destructive`, annuncia solo `PageRest`.
Contributi senza registro a meta illeggibile resta com'è: punto cieco dichiarato in doc/guide/rendimenti.md (README § 9, 37).

### 4.6 Le azioni

- **«Analizza con AI»** nella navbar mobile accanto ad «Aggiorna», montato in ogni ramo (caricamento, lettura fallita,
  dati insufficienti) e `disabled` finché non c'è una misura (`aiDisabled`): `Sparkles`, `h-11 w-11`, `aria-label` e
  `disabled` di `HeaderActions`; `aiOpenerRef` da `event.currentTarget`, così `returnFocusTo` vale per ogni copia.
  **Nessun test né sonda lo clicca**: spende.
- **«Periodo personalizzato»**: icona `CalendarDays` 44×44 in coda al selettore nello slot `axis` (a capo se non sta,
  `flex-wrap`), anche a dati insufficienti; `disabled={isDemo}` con l'`aria-label` di `HeaderActions` («Periodo
  personalizzato — non disponibile in modalità demo»); idem `customOpenerRef`. Via `:738-742` e il ramo `stacked`.

### 4.7 Conflitti con PERF

- **PERF-09** (in develop dal 2026-10-04, spec ritirata) ha riscritto il caricamento: `lib/hooks/usePerformanceData.ts`,
  `POST /api/performance/yields`, attesa su ogni query (doc/guide/rendimenti.md § every collection read once). MOB-05
  non tocca letture; il test di `e2e/performance.degraded.spec.ts` che conta `/api/performance/*` resta verde. Qui il
  guadagno è CPU, non rete.
- **PERF-04** (in develop dal 2026-09-30): i tre grafici del «Dettaglio» (`UnderwaterDrawdownChart` e i due rolling) sono
  `lazyComponent` precaricati a riposo; le tessere sono SVG a mano (doc/guide/rendimenti.md), le righe
  chiuse non risparmiano chunk. **PERF-14** (in develop dal 2026-10-08) ha tolto il `layout` dai wrapper di pagina, non il `layout="position"` di
  `AttribuzioneTile.tsx:68` (il riordino al cambio periodo), che resta in un pannello montato all'apertura; la riga
  anima in CSS. **PERF-12** (in develop dal 2026-10-06, AGENTS.md § Motion): ref scritti solo negli handler. **PERF-03** (in develop dal 2026-09-30): Rendimenti ha
  «Aggiornato alle…» dal 2026-10-04 (`useFreshness(loaded.freshnessQueries)` in `page.tsx`, i due payload nella cache
  persistita): sta nel `PageHeader` come nelle altre pagine, mai nella composizione.
- **La curva cede** (README § 9, 4): sotto `desktop:` «Crescita di 100» è alta 120 px, 160 da `desktop:`:
  `GrowthOfHundredChart` legge `minHeight` da una variabile CSS (`--growth-min-h`) che `RendimentoTile` imposta a 120px e
  a 160px da `desktop:`, al posto dell'inline di `:168`.

### 4.8 Decisioni (README § 9)

Tutte le domande di questa spec sono chiuse: la deroga per celle, anche in punti (18); i chip (38: «dal massimo» nel
seguito, l'altra base resta); Benchmark in errore a ogni larghezza (36); Contributi come punto cieco (37); l'asse nello
slot (2, 12); LA tessera sempre aperta (21); l'ordine del DOM (11).

## 5. File da toccare

- `app/dashboard/performance/page.tsx` — sezioni, striscia, `scope`, `axis` (due istanze), `order-*` tolte, azioni,
  Plusvalenze, Benchmark `failed`, i commenti di testata e dello slot della navbar riscritti.
- `components/performance/tiles/RendimentoTile.tsx` — `liftedFigures`, `--growth-min-h`; `components/performance/GrowthOfHundredChart.tsx` — `minHeight` da variabile CSS.
- `components/performance/tiles/{Rischio,Consistenza,Benchmark,Contributi,Attribuzione,Plusvalenze,CapitaleMercato}Tile.tsx`.
- `lib/utils/performanceSummary.ts`, `lib/utils/performanceNarrative.ts` — le pure di § 4 (`shortBenchmarkName` esportata).
- `playwright.config.ts` — progetto `degraded-mobile` (`dependencies: ['setup-degraded']`); `/degraded\./` nei
  `testIgnore` di `mobile`, il cui `testMatch` la prenderebbe sull'account base (`:199-200`).
- `e2e/mobile-composition.performance.degraded.mobile.spec.ts` — nuova; `e2e/performance.degraded.spec.ts` (il test del
  reload); `doc/mobile/budget.json`.

## 6. Passi

1. Branch, guide, `mobile:census` PRIMA (fixture). 2. Pure e test falsificati. 3. Tessere e pagina.
4. Playwright. 5. `mobile:census`/`mobile:budget -- --tighten`, `perf:budget`. 6. Giro, documentazione, commit proposto.

## 7. Test e falsificazione

- `__tests__/performanceSummary.test.ts` — la striscia: etichetta «nei N mesi» sotto l'anno, valore = `heroReturn.value`
  ricevuto, `narrativeToText([formatStripFigure(cella 1)])` identico dentro `narrativeToText(buildPerformanceVerdict(input).sentence)`
  costruito dalla STESSA `heroReturn` (falsificare con `decimals: 2` o con il segno ASCII nella cella: rosso); `null` con
  le due `reason`; `hasAttribution: false` → cella 1 `opens: 'rend-capitale'` (falsificare con `rend-attribuzione` fisso);
  `validateStrip` vuoto. (La base dello scarto la prova già `__tests__/performanceNarrative.test.ts:244-248`: 0,4 punti su
  4 mesi, non 1,2.) `resolveRealizedGainsState`: meta in errore senza dati → `failed` (falsificare leggendo solo `data`),
  `null` → `absent`, meta presente senza vendita chiusa → `absent` (falsificare con `!!meta.data`), errore con dati →
  `ready` (falsificare leggendo solo `isError`).
- `__tests__/performanceNarrative.test.ts` — con il 60/40 `leadLength: 0` e `restLabel` «rendimento, Sharpe, drawdown e
  mesi positivi», `sentence` invariata (attese di `:147`, `:248`); senza il 60/40 il «.» al primo «;» con la maiuscola e
  `restLabel` «Sharpe, drawdown e mesi positivi» (falsificare lasciando «; il»); assenti senza rendimento (falsificare
  tagliando anche lì); la clausola «dal massimo» nel seguito; `PERFORMANCE_CLOSED_ASIDES` senza `/\d|€|%/` (falsificare
  con «8 mesi»). `leadLength: 0` lo prova già `__tests__/narrative.test.ts` (2026-10-10).
- **`e2e/mobile-composition.performance.degraded.mobile.spec.ts`**, progetto `degraded-mobile` (390×844, touch,
  `DEGRADED_STORAGE_STATE`, `testMatch: /\.degraded\.mobile\.spec\.ts/`), seed `performance` in `beforeAll` come
  `e2e/performance.degraded.spec.ts:87-88` (nessun registro: **6 righe**); `page.route('**/api/ai/**')` conta 0 a fine
  spec; `**/api/benchmarks/returns**` risponde con una serie mensile fissa (`page.route` → `fulfill`) nei test (1)–(5) e
  (7), così cella 2 e Benchmark non dipendono da Yahoo. (1) radiogroup «Periodo di misura» fra titolo e striscia, 2 celle
  ≥ 44 px, «Base: …» senza tap sopra «Il resto della pagina», eroe e chip «dal massimo» nascosti, chip sull'altra base
  visibile, 6 trigger chiusi, pannelli vuoti e `inert`; (2) AI nella navbar 44×44, mai cliccato; (3) calendario → Escape
  → fuoco sull'icona; (4) la cella dello scarto apre `rend-benchmark`, fuoco sul trigger; (5) reload con due righe
  aperte; (6) `**/api/benchmarks/returns**` → `abort` (`retry: 1`, `useBenchmarkReturns.ts:35`): riga aperta da sola,
  chiusa rossa, un solo `role="alert"`, cella 2 «modello non disponibile»; (7) `main` senza sforamenti, ordine delle `y`
  = ordine del DOM, nessuna classe `order-*` (dalla `classList`, come `e2e/mobile-composition.hof.mobile.spec.ts`). Rossi falsificando: (1) la base in «Il perché»; (2) l'AI solo in
  `headerActions(true)`; (3) senza `returnFocusTo`; (4) `reveal` senza focus; (5) nessuna scrittura; (6) `failed`
  ignorato; (7) un `order-2` rimesso su Rischio.
- A 1440 `performance.degraded.spec.ts`: il test del reload confronta titolo e paragrafo del verdetto (`section > h2`,
  `section > div`), non il `textContent` dell'intera region (che ora contiene asse, striscia, riga d'ambito e «Il
  perché», e la cella 2 cambia con i benchmark non persistiti); la modifica è dichiarata nel commit, il resto invariato.
  `modal.origin.spec.ts` verde e invariato. **Non coperto nel browser**: la meta in errore (Firestore client, un canale
  per tutte le letture).

## 8. Collaudo guidato

- A: le due spec a 1440, suite area Rendimenti, Vitest nei due fusi. C: § 7.
- F (mirror; DevTools a 390 sul portatile): 1) quanto rende e su quale base, senza tap; 2) le due celle; 3) un cambio di
  periodo; 4) righe aperte e chiuse, con «Riduci movimento», e reload; 5) 1440 come prima. L'AI solo se il
  proprietario accetta di spendere. G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Margine sopra la pill di 16–36 px nei mock: si accorcia la curva, mai la lettura (§ 4.7).
- «nei 8 mesi» e «nei 11 mesi» (`performanceSummary.ts:197`) sono sgrammaticati («negli»): fuori scope, va in
  SESSION_NOTES come difetto trovato.
- Rollback per lettera: `strip` non passata, `leadLength` tolto, `collapse` `undefined`, `:738-742` rimesso;
  Plusvalenze e Benchmark in errore restano (sono correzioni).

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest» e § Current Status; `doc/guide/rendimenti.md` § Composizione mobile (la deroga con il 60/40
  dichiarata, il chip nel seguito, l'ordine del DOM) e § Per-page blind spots (meta non provata nel browser; Contributi
  senza registro); `doc/guide/stati.md` (Benchmark in errore); `doc/guide/e2e-emulatori.md` (il progetto
  `degraded-mobile`, la serie fissa dei benchmark); AGENTS.md § Hierarchy, Density and Disclosure (la riga riscritta da MOB-02
  il 2026-10-10 elenca le pagine che portano ancora `order-*`: Rendimenti si toglie); `Draft Release Temp.md` (una riga, senza dati privati);
  `doc/mobile/README.md` § 6 e § 3.1.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-05-rendimenti.md: Rendimenti sotto desktop apre con il titolo
del verdetto, l'asse nello slot axis subito sotto (seconda istanza a 1440), una striscia di due cifre (rendimento
sulla sua base e scarto sul 60/40, da selectPerformanceStrip), la riga «Base: …» sempre visibile come scope, LA
tessera Rendimento (TWR) senza eroe e senza il chip «dal massimo» (che va nel seguito), sette righe chiuse
nell'ordine del DOM con la memoria per pagina; «Analizza con AI» nella navbar (mai cliccato da un test: spende);
Plusvalenze realizzate e Benchmark diventano un ErrorNotice quando la lettura fallisce. Le API di MOB-02 con i loro
nomi, mai rinominate.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § React Query and Derived State,
  § Motion, § Navigation, § Hierarchy, Density and Disclosure — l'ordine del DOM è README § 9, 11 —, § Accessibility,
  § 5 Commands, § Performance tooling), CLAUDE.md
- Leggi doc/guide/rendimenti.md PER INTERO, doc/guide/stati.md, doc/guide/dialog.md, doc/guide/e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/mobile/README.md (§ 9: le decisioni 1–38), MOB-02 e il codice che ha lasciato, la spec MOB-05 per intero;
  DESIGN.md § 5 e § 6 (MAI rigenerarlo; il capitolo mobile lo scrive MOB-09, dopo questa spec);
  lib/hooks/usePerformanceData.ts (il caricamento com'è dal 2026-10-04)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; nessuna domanda è aperta (README
§ 9): una scelta nuova che il codice ti impone me la chiedi con lo strumento interattivo prima di toccare la pagina;
nessuna sonda, script o test apre «Analizza con AI».
Chiusura: mobile:census e mobile:budget prima/dopo sul fixture, --tighten; tsc, lint 0, Vitest in Europe/Rome e sotto
TZ=UTC; la spec Playwright nuova con le falsificazioni viste rosse, performance.degraded (col test del reload
corretto) e modal.origin a 1440; npm run perf:build e perf:budget -- --dist=.next-perf prima e dopo (da Git Bash);
giro guidato di 5 punti sul mirror, poi mirror:remove; la documentazione di § 10 in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort high.** Le regole di dominio più dense (base, stessa base per cifra e scarto, periodo sotto
l'anno) e un taglio del verdetto che tocca una clausola vincolante; il layout è di MOB-02.
