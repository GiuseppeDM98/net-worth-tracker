# MOB-05 — Rendimenti

> Stato: da fare · Priorità: 2 (la base è una clausola vincolante; Plusvalenze sparisce in silenzio) · Sforzo: M ·
> Dipende da: MOB-02, PERF-09 · Sblocca: MOB-08, MOB-09

## 1. Il problema, misurato

Censimento 2026-09-26. **390×844**: 4,71 schermate, 8 tessere (1 sopra la piega / 0 intere), 53 cifre (7 sopra), 27
controlli, 2 grafici; navbar 74 px, verdetto 153 px; LA tessera da y 478, alta 585: finisce sotto la pill; l'ultima
tessera finisce a y 3706. **768**: 2,75 · 8 (3/1). **1024×768**: 3,62 · 8 (1/0). Il codice (righe del 2026-09-26, PRIMA
di PERF-09: riverificarle):

- `app/dashboard/performance/page.tsx:721-736` verdetto + riga d'ambito (`:727-732`, `describeMeasurementBase`);
  `:738-742` sotto `desktop:` selettore e due bottoni da 44 px DOPO verdetto e base. `:616-626` la navbar mobile ha
  solo «Aggiorna»; a dati insufficienti (`:663-693`) il telefono non ha il periodo personalizzato.
- `:292-294` meta e registro leggono solo `data`: una meta in errore vale «non migrato», `realizedSummary` è `null`
  (`:539`), la tessera non si monta (`:849-853`). **Plusvalenze sparisce**, e Contributi perde il registro (`:529-532`).
  Il registro in errore invece ferma GIÀ la pagina: lo stadio 1 lo legge sulla stessa chiave (`:360`) e il `catch` mette
  `loadFailed` (`:380-381`).
- `components/performance/tiles/RendimentoTile.tsx`: eroe `:95-109`, chip dello scarto `:112-124`, chip sull'altra base
  `:125-130`, chip «dal massimo del periodo» `:131-135`, curva `minHeight={160}` `:149`.
- `lib/utils/performanceNarrative.ts:309-352` una frase sola, `:355-360` nessun taglio. I modali hanno già
  `returnFocusTo` (`page.tsx:689`, `:876`, `:890`).

## 2. Obiettivo misurabile

- `mobile:budget`, `rendimenti` a 390: schermate **≤ 2,0**, `figuresOutsideVerdict` **≤ 5**,
  `firstClosedRowAbovePill: true`; `budget.json` abbassato; 768 e 1024 non peggiorano.
- A 1440 la pagina di oggi, salvo Plusvalenze in errore (§ 4.5).
- Playwright a 390: § 7 (base senza tap, asse, celle, AI mai cliccato, memoria, fuoco, eyebrow rosso).

## 3. Non-obiettivi

- B e C; il desktop oltre § 4.5; le colonne del tablet (MOB-08); DESIGN.md (MOB-09).
- Letture, base, flussi e cache: PERF-09. Qui nessuna query cambia.
- Il chip sull'altra base e il ROI non entrano nella striscia; `AIAnalysisDialog` non cambia.

## 4. Design

### 4.1 La prima schermata sotto `desktop:`

Navbar («Aggiorna», «Analizza con AI») → titolo del verdetto → **asse** → striscia → **riga d'ambito** → «Il perché» →
LA tessera **Rendimento (TWR)**, senza eroe né chip dello scarto sotto `tablet:` (non si chiude) → «Il resto della
pagina» → righe chiuse → il «Dettaglio», com'è. La tecnica dell'asse la decide MOB-02 (§ 4.9, 9) per tutte
le pagine. Con lo slot `axis` di MOB-02 qui non c'è altro da fare. Senza slot, la tecnica è di questa spec: la `section`
del verdetto va `max-desktop:contents` e il selettore prende un `order-*` fra `h2` e striscia; ma `PageContainer` è un
blocco `space-y-4` (`components/layout/PageContainer.tsx:17`): la colonna flex è il wrapper di `page.tsx:723`, dove il
selettore va spostato, e `PageVerdict` non ha `className` (`components/ui/page-verdict.tsx:4-8`: prop opzionale,
additiva, di questa spec).

### 4.2 La striscia — `selectPerformanceStrip` in `lib/utils/performanceSummary.ts`

`(input: { heroReturn: HeroReturn; benchmarkGap: number | null; benchmarkName: string; benchmarkLoading: boolean;
hasAttribution: boolean }) => StripFigure[]`, dai valori che la pagina già calcola (`page.tsx:492-499`):

| Cella | `value` · `format` | `opens` | `reason` | `lifts` |
|---|---|---|---|---|
| «Rendimento {`heroReturn.label`}» (nei N mesi · nel mese · annualizzato) | `heroReturn.value` · `signed-percent` | `rend-attribuzione`, se assente `rend-capitale` | «non ancora misurabile» | `rend-twr` · `hero` |
| «Sul 60/40» | `resolveBenchmarkGap(…)` · `points` | `rend-benchmark` | «in arrivo» / «modello non disponibile» | `rend-twr` · `benchmark-chip` |

Sotto l'anno la cifra è il rendimento del periodo, MAI annualizzato (`resolveHeroReturn`); lo scarto è sulla sua base,
con la funzione del verdetto e del chip (**The Same-Basis Rule**). `resolveBenchmarkGap` sta in
`performanceNarrative.ts:259`, che importa da `performanceSummary.ts`: la striscia riceve il risultato, mai la chiama
(import circolare). L'etichetta porta la base: la didascalia che **The Binding-Clause Rule** (proposta, MOB-09) chiede.
`RendimentoTile` prende `liftedFigures?: readonly ('hero' | 'benchmark-chip')[]` da `liftedBlocks(strip, 'rend-twr')`
e mette `LIFTED_FIGURE_CLASS` sui due blocchi.

### 4.3 Il verdetto breve e la riga d'ambito

Il paragrafo è UNA frase a punti e virgola («Rende +6,0% nei 8 mesi (TWR), 2 punti sopra il Portafoglio 60/40, con
uno Sharpe di …; il drawdown massimo …; … positivi.», `performanceNarrative.ts:315-350`): la «prima frase» della
decisione 4 del brief è tutto il paragrafo. Default (decisione 4, come MOB-02 § 4.7 e MOB-07 § 4.2): spezzarla
al primo «;» anche a 1440, `leadLength` = la prima frase, `restLabel` «Sharpe, drawdown e mesi positivi»; il suo inizio
ripete le due celle. La deroga `leadLength: 0` (solo titolo, `sentence` invariata; `0` = `lead` vuoto, MOB-02 § 4.1) è
la domanda 1, comune a MOB-03 e MOB-04. Nessun `binding`; senza rendimento nessun taglio. **La riga d'ambito** diventa `scope` di
`PageVerdict`, un solo DOM, visibile a ogni larghezza e mai dietro un tap: senza, «+6,0%» si legge come il rendimento
di tutto il patrimonio.

### 4.4 Le sette righe

`useMobileSections({ route: 'performance', sections })` (`mobile-sections:performance`). DOM invariato (AGENTS
§ Hierarchy, Density and Disclosure); sotto `desktop:` LA tessera `order-1`, `PageRest` `order-2`, le righe `order-3…`
nell'ordine mobile di oggi. Hanno cifre gli aside di Rischio e Benchmark (`RischioTile.tsx:67-72`,
`BenchmarkTile.tsx:81-85`) e l'anno di Attribuzione e Capitale e mercato (`describePeriodAside`,
`performanceNarrative.ts:229-231`): ogni riga prende `asideWhenClosed` in parole, da `PERFORMANCE_CLOSED_ASIDES`
(`performanceNarrative.ts`), inoltrato a `Tile`.

| id | eyebrow | `asideWhenClosed` | presente se |
|---|---|---|---|
| `rend-rischio` | Rischio | «volatilità, Sharpe e drawdown» | sempre |
| `rend-consistenza` | Consistenza | «mese per mese» | sempre |
| `rend-benchmark` | Benchmark | «contro i portafogli modello» | sempre |
| `rend-contributi` | Contributi | «capitale entrato nel periodo» | sempre |
| `rend-attribuzione` | Da dove viene il rendimento | «per strumento» | `attribution` |
| `rend-plusvalenze` | Plusvalenze realizzate | «per anno fiscale» | una vendita chiusa (`realizedSummary`), o lettura fallita |
| `rend-capitale` | Capitale e mercato | «versato e mercato» | sempre |

Heatmap e curva del capitale si montano all'apertura (The Period-Transforms Rule vale per ciò che è montato).

### 4.5 Plusvalenze in errore

Pura in `performanceSummary.ts`: `resolveRealizedGainsState({ meta, trades })` (ognuna `{ isError, data }`) →
`absent | failed | ready`. `failed` = meta o registro in errore SENZA dati (`data === undefined`: una rilettura fallita
tiene il dato già letto, come PERF-03; meta `null` = «non migrato»); `absent` = non migrato o nessuna vendita chiusa.
Con `failed`, a ogni larghezza, `ErrorNotice` da `describeReadFailure({ subject: 'Plusvalenze realizzate',
consequence: 'Le plusvalenze realizzate non sono state lette: …', canRetry: true })`, riprova = refetch delle due
query. Sotto `desktop:` `collapse`, `live={!compact}`, `SectionSpec.failed`: la riga si apre da sola, chiusa ha
l'eyebrow in `--destructive`, annuncia solo `PageRest`. Il registro in errore ferma la pagina oggi (§ 1) e dopo PERF-09
(gate su ogni query, PERF-09 § 4 A): il caso vero è la meta.

### 4.6 Le azioni

- **«Analizza con AI»** nella navbar mobile accanto ad «Aggiorna»: `Sparkles`, `h-11 w-11`, `aria-label` e `disabled`
  di `HeaderActions`; `aiOpenerRef` da `event.currentTarget`, così `returnFocusTo` vale per ogni copia. **Nessun test
  né sonda lo clicca**: spende.
- **«Periodo personalizzato»**: icona `CalendarDays` 44×44 in coda al selettore (a capo se non sta), anche a dati
  insufficienti; idem `customOpenerRef`. Via `:738-742` e il ramo `stacked`.

### 4.7 Conflitti con PERF

- **PERF-09** riscrive il caricamento (hook, `/api/performance/yields`, attesa su ogni query): MOB-05 parte dopo di
  lei e non tocca letture; la sua spec che conta `/api/performance/*` resta verde. Qui il guadagno è CPU, non rete.
- **PERF-04**: `UnderwaterDrawdownChart` resta nel «Dettaglio»; le tessere sono SVG a mano (PERF-04 § 1), le righe
  chiuse non risparmiano chunk. **PERF-14** toglie il `layout` dai wrapper di pagina, non il `layout="position"` di
  `AttribuzioneTile.tsx:68` (il riordino al cambio periodo), che resta in un pannello montato all'apertura; la riga
  anima in CSS. **PERF-12**: ref scritti solo negli handler. **PERF-03** (implementata il 2026-09-29): Rendimenti non ha
  «Aggiornato alle…» — lo stadio 1 legge con `fetchQuery` e non dipinge mai un dato vecchio (PERF-09 potrà darglielo, nel
  `PageHeader` come le altre pagine, mai nella composizione).

### 4.8 Domande al proprietario

1. Deroga alla decisione 4 (comune a MOB-03 § 4.6, 1 e MOB-04 § 4.8, 1): sul telefono titolo + striscia + base, e la
   frase intera in «Il perché» (`leadLength: 0`)? Se no, il default di § 4.3: frase spezzata al primo «;» anche a 1440, **Deciso il 2026-09-27 (doc/mobile/README.md § 9): deroga ammessa e dichiarata quando la prima frase ristamperebbe ≥ 2 cifre della striscia.**
   e le due cifre stampate due volte.
2. A 390 resta il chip sull'altra base (proposta: sì) e il chip «dal massimo del periodo» (proposta: no sotto
   `tablet:`)? È la distanza di OGGI dal picco (`computeDrawdownStatus`, `page.tsx:506`); Rischio e verdetto stampano il
   MASSIMO (`resolveDrawdownStory`, `:507`): nascosto, non lo dice più nessuna cifra. Se la prima riga cade sotto la
   pill, curva a 120 px.
3. Benchmark «in errore» se falliscono tutte e sei le serie (oggi trattini muti)? È l'unica prova nel browser
   dell'eyebrow rosso qui.
4. Contributi senza registro a meta illeggibile: punto cieco in guida (proposta) o avviso nella tessera?
5. (Spostata in MOB-02 § 4.9, 9, perché vale per ogni pagina con un asse. Se lì si sceglie `max-desktop:contents`: una
   `section` a `display: contents` non ha box, altezza 0, il criterio con cui MOB-01 scarta un verdetto nascosto, e
   nessun box per `view-transition-name: page-verdict`, `page-verdict.tsx:30`; più l'albero ARIA.)

## 5. File da toccare

- `app/dashboard/performance/page.tsx` — sezioni, striscia, `scope`, `order-*`, azioni, Plusvalenze.
- `components/performance/tiles/RendimentoTile.tsx` — `liftedFigures` (e il chip del drawdown, domanda 2).
- `components/ui/page-verdict.tsx` — `className` opzionale, o lo slot `axis` (domanda 5).
- `components/performance/tiles/{Rischio,Consistenza,Benchmark,Contributi,Attribuzione,Plusvalenze,CapitaleMercato}Tile.tsx`.
- `components/performance/GrowthOfHundredChart.tsx` — solo se serve: `minHeight` inline (`:168`) → variabile CSS.
- `lib/utils/performanceSummary.ts`, `lib/utils/performanceNarrative.ts` — le pure di § 4.
- `playwright.config.ts` — progetto `degraded-mobile` (`dependencies: ['setup-degraded']`); `/degraded\./` nei
  `testIgnore` di `mobile`, il cui `testMatch` la prenderebbe sull'account base (`:199-200`).
- `e2e/mobile-composition.performance.degraded.mobile.spec.ts` — nuova. `doc/mobile/budget.json`.

## 6. Passi

1. Branch, guide, `mobile:census` PRIMA, domande di § 4.8. 2. Pure e test falsificati. 3. Tessere e pagina.
4. Playwright. 5. `mobile:census`/`mobile:budget`. 6. Giro, documentazione, commit proposto.

## 7. Test e falsificazione

- `__tests__/performanceSummary.test.ts` — la striscia: etichetta «nei N mesi» sotto l'anno, valore = eroe; scarto =
  `resolveBenchmarkGap` (falsificare con `computeBenchmarkDelta` annualizzato su 4 mesi: rosso); `null` con `reason`;
  `validateStrip` vuoto; la prima cella identica dentro `narrativeToText(sentence)` (falsificare con l'annualizzato).
  `resolveRealizedGainsState`: meta in errore senza dati → `failed` (falsificare leggendo solo `data`), `null` →
  `absent`, errore con dati → `ready` (falsificare leggendo solo `isError`).
- `__tests__/performanceNarrative.test.ts` — `leadLength`/`restLabel` presenti, assenti senza rendimento (falsificare
  tagliando anche lì); `sentence` invariata con la deroga (attese di `:147`, `:248`), col «.» al primo «;» senza; `PERFORMANCE_CLOSED_ASIDES` senza `/\d|€|%/`
  (falsificare con «8 mesi»). `leadLength: 0` lo prova MOB-02 § 7.
- **`e2e/mobile-composition.performance.degraded.mobile.spec.ts`**, progetto `degraded-mobile` (390×844, touch,
  `DEGRADED_STORAGE_STATE`, `testMatch: /\.degraded\.mobile\.spec\.ts/`), seed `performance` in `beforeAll` come
  `e2e/performance.degraded.spec.ts:87-88` (nessun registro: **6 righe**); `page.route('**/api/ai/**')` conta 0 a fine
  spec. (1) radiogroup «Periodo di misura» fra titolo e striscia, 2 celle ≥ 44 px, «Base: …» senza tap sopra «Il resto
  della pagina», eroe nascosto, 6 trigger chiusi, pannelli vuoti e `inert`; (2) AI nella navbar 44×44, mai cliccato;
  (3) calendario → Escape → fuoco sull'icona; (4) la cella dello scarto apre `rend-benchmark`, fuoco sul trigger;
  (5) reload con due righe aperte; (6) con domanda 3 sì, `**/api/benchmarks/returns**` → `abort` (`retry: 1`,
  `useBenchmarkReturns.ts:35`): riga aperta da sola, chiusa rossa, un solo `role="alert"`; (7) `main` senza
  sforamenti. Rossi falsificando: (1) la base in «Il perché»; (2) l'AI solo in `headerActions(true)`; (3) senza
  `returnFocusTo`; (4) `reveal` senza focus; (5) nessuna scrittura; (6) `failed` ignorato; (7) una cella
  `min-w-[420px]`.
- A 1440 `performance.degraded.spec.ts` e `modal.origin.spec.ts` verdi e invariate. **Non coperto nel browser**: la
  meta in errore (Firestore client, un canale per tutte le letture).

## 8. Collaudo guidato

- A: le due spec a 1440, suite area Rendimenti, Vitest nei due fusi. C: § 7.
- F (mirror; telefono vero se si può): 1) quanto rende e su quale base, senza tap; 2) le due celle; 3) un cambio di
  periodo; 4) righe aperte e chiuse, con «Riduci movimento», e reload; 5) 1440 come prima. L'AI solo se il
  proprietario accetta di spendere. G: `npm run mirror:remove`.

## 9. Rischi e rollback

- Margine sopra la pill di 16–36 px nei mock: si accorcia la curva, mai la lettura. `contents` sul verdetto: domanda 5.
- Rollback per lettera: `strip` non passata, `leadLength` tolto, `collapse` `undefined`, `:738-742` rimesso;
  Plusvalenze in errore resta (è una correzione).

## 10. Documentazione da aggiornare

- CLAUDE.md «Latest»; `doc/guide/rendimenti.md` § Composizione mobile e § Per-page blind spots (meta non provata nel
  browser; domanda 4); `doc/guide/stati.md`; `doc/guide/e2e-emulatori.md`; `Draft Release Temp.md` (una riga, senza
  dati privati); `doc/mobile/README.md` § 6.

## 11. Prompt di implementazione

```text
Ciao, in questa sessione implementiamo doc/mobile/MOB-05-rendimenti.md: Rendimenti sotto desktop apre con il titolo
del verdetto, l'asse subito sotto, una striscia di due cifre (rendimento sulla sua base e scarto sul 60/40, da
selectPerformanceStrip), la riga «Base: …» sempre visibile, LA tessera Rendimento (TWR) senza eroe e sette righe
chiuse con la memoria per pagina; «Analizza con AI» nella navbar (mai cliccato da un test: spende); Plusvalenze
realizzate diventa un ErrorNotice quando la meta del registro non si legge. Le API di MOB-02 con i loro nomi, mai
rinominate.

Da fare TASSATIVAMENTE prima di ogni cosa:
- Leggi WORKFLOW.md, AGENTS.md (§ Tailwind Breakpoints and Responsive Layout, § React Query and Derived State,
  § Motion, § Navigation, § Hierarchy, Density and Disclosure, § Accessibility, § 5 Commands), CLAUDE.md
- Leggi doc/guide/rendimenti.md PER INTERO, doc/guide/stati.md, doc/guide/dialog.md, doc/guide/e2e-emulatori.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md e APPLICALE mentre scrivi codice
- Leggi doc/mobile/README.md, MOB-02 e il codice che ha lasciato, la spec MOB-05 per intero; DESIGN.md § 5, § 6 e
  il capitolo mobile se c'è (MAI rigenerarlo); doc/perf/PERF-09 (deve essere chiusa)
- Crea SESSION_NOTES.md; crea il branch dalla branch attiva PRIMA di editare

Regole: nessun commit senza il mio OK; un branch e un commit; rispondi in italiano; le cinque domande di § 4.8 con lo
strumento interattivo prima di toccare la pagina; nessuna sonda, script o test apre «Analizza con AI».
Chiusura: mobile:census e mobile:budget prima/dopo (budget.json abbassato); tsc, lint 0, Vitest in Europe/Rome; la
spec Playwright nuova con le falsificazioni viste rosse, performance.degraded e modal.origin a 1440; giro guidato di
5 punti sul mirror, poi mirror:remove; la documentazione di § 10 in UN diff; proponi il commit.
```

## 12. Modello ed effort

**Claude Fable 5.1, effort high.** Le regole di dominio più dense (base, stessa base per cifra e scarto, periodo sotto
l'anno) e un taglio del verdetto che tocca una clausola vincolante; il layout è di MOB-02.
