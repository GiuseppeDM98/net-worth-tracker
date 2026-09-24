# CLAUDE.md - Net Worth Tracker (Lean)

> **Read [WORKFLOW.md](WORKFLOW.md) before starting**: standing session rules (one branch and one
> commit per session, never commit without approval, answer in Italian) and the guided-verification
> protocol. A new rule stated in a session is added there, in that session's commit.

## Project Overview
Next.js app for Italian investors: net worth, assets, cashflow, dividends, performance metrics and long-term planning on Firebase.

**This file is the INDEX**: "what it is + where it lives", nothing more — keep it well under 20.000 characters; it is injected into every turn. Repo-wide conventions and gotchas live in **AGENTS.md**; the per-area rules and traps in **`doc/guide/<tema>.md`** (one file per page/tab/subsystem — the feature index below points to each, and AGENTS.md § 3 carries a stub apiece; the test harness is `doc/guide/e2e-emulatori.md`, its two stubs in AGENTS.md § 5); the aesthetic spec in **DESIGN.md**; env/emulators/Playwright in **SETUP.md**; users and positioning in **PRODUCT.md**. Session rules and the guided-verification protocol in **[WORKFLOW.md](WORKFLOW.md)** (see the note at the top).

> **Language**: this file and AGENTS.md are in English. Italian is reserved for user-facing UI text. Page and feature names stay Italian, because they are the labels the product shows: Panoramica, Patrimonio, Cashflow, Analisi, Rendimenti, Allocazione, Storico, Previdenza, Impostazioni.

## Current Status
- Stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, Vitest, Framer Motion, Recharts, Yahoo Finance, Borsa Italiana scraping, Anthropic.
- `tsc` clean; **180 files / 4249 tests** green in both timezones + **35 Playwright spec files** (120 tests, incl. 6 auth setups; last full run 2026-09-24 evening, 4,1 min: 120 green, `modal.origin` included). Run Vitest under `TZ=Europe/Rome` too — every date fixture sits at noon, which structurally hides timezone bugs.
- Latest (2026-09-24, notte): **Allocazione — il Piano con leva prende il ridisegno del 21/09.** Il motore con leva
  pianificava su strumenti che l'albero e la ritenuta non leggevano: lista piatta, niente ritenuta, Preleva lordo.
  Ora `groupFlowTrades`/`groupRebalanceTrades` (`allocazioneSummary.ts`) fanno dei suoi ordini lo stesso albero classe →
  strumento: un composito si divide per composizione nelle sue classi (le gambe di `buildHoldings`, trovate per
  `AllocatableHolding.assetId`, con `PlanNode.order` «parte di un ordine da X € di TICKER»), uno scambio dentro una
  classe sono DUE mosse (una per azione), il «→ %» di classe è quello del motore. `solveWithdrawalGross` prende il
  pianificatore: anche il Preleva con leva si lorda. `InstrumentTradeList` rimosso. Collaudo: `tsc` 0, ESLint 0, Vitest
  180 file / 4249 nei due fusi (8 test nuovi, quattro falsificazioni viste rosse), `e2e/allocation.spec.ts` 7/7, sonda
  Playwright sullo specchio a 1440 e 390 (trovato e corretto: il ticker perso nel nome troncato a 390) e giro guidato
  confermato dal proprietario. doc/guide/allocazione.md.
- Latest (2026-09-24, sera): **Hall of Fame — critique Impeccable (26/40) chiusa nella stessa sessione, tutto il backlog.**
  Due P1: «2026 · ORA» troncato in «20…» nella tessera Anni a OGNI larghezza (la colonna del periodo era
  `w-[58px]` + `truncate`: ora è un `min-w-`, mai un tetto, `whitespace-nowrap`, e le chip «ORA» / «2 mesi»
  ne fanno parte) e tre articoli scritti a mano — «il 88,5%», «Gli 10 anni», «dal migliore» sulle spese —
  ora da `articleForPercent`/`pluralArticleFor` e `RANKING_ORDER` («dal più alto» / «dal più forte»). Tre P2:
  la cifra del verdetto stampata tre volte in 200 px (la lettura Record dice la somma del podio e l'ultima
  riga in tessera, la lettura Anni il DISTACCO dal posto sopra — `rowAboveCurrent`, senza segno e senza
  colore); l'asse dei 12 record senza anno (`TimelinePoint.yearLabel`, una seconda riga sotto i mesi); il
  form nota rifatto — precompilato DALLA RIGA (`NoteTrigger` → `NotePrefill`, «+» al passaggio del mouse
  sulle tessere, sempre nella colonna «Nota» del Dettaglio), `fieldset`/`legend`, il vocabolario delle
  tessere (`SECTION_LABELS` «Crescita del patrimonio · mese», `SECTION_SUBJECTS`), `returnFocusTo` su
  entrambe le finestre, `describeWriteError`, la lettura che dice quando il periodo non è in nessuna
  classifica scelta (`isPeriodRanked`). Le scelte del proprietario: il footer Record chiude sulla RIPRESA
  («da allora 32 mesi su 35 in crescita», `stats.sinceWorstMonth` salvato dai due writer, mai derivato) e
  il primo anno parziale è dichiarato («2022 · 2 mesi», `YearlyRecord.monthsCovered`, `isPartialYear`);
  l'header data i record (`rankingsUpdatedAt`, timbrato solo da `updateHallOfFame`: `updatedAt` si muove
  a ogni nota). Minori: «mar 2024» a capo nella tessera Note, marcatori 44 px su touch, pillole 32/44 e
  `semantics="radio"`, la tabella del Dettaglio con la dissolvenza a destra MISURATA (`scrollWidth >
  clientWidth`), il trigger del Dettaglio letto per intero, «Leggi la nota di marzo 2024», l'aside Record
  come finestra («da dic 2022 a set 2026») e non un terzo «46», «I 12 record più grandi», un'assenza in
  una frase, due footer dietro «Come si calcola», il «+» del navbar mobile tolto (tre stop con lo stesso
  nome). **Verifica**: `tsc`, lint 0, Vitest 180 file / 4241 nei due fusi (22 nuovi; falsificati: articolo a
  mano, mesi piatti contati come crescita, `isPartialYear` forzato — rossi); Playwright NUOVO account
  fixture `hof@example.com` (`scripts/seedHallOfFameE2E.mts`, 47 snapshot dal 2022, il documento costruito
  DALLA ROUTE nella spec) con `e2e/hall-of-fame.hof{,.mobile}.spec.ts`, 11 test (+ setup) verdi, la
  colonna troncata falsificata rossa in browser. Evidenza della critique: Playwright (estensione Chrome
  non connessa), detector CLI 0, overlay 42/38 quasi tutti «per scala». doc/guide/hall-of-fame.md
  riscritta (campi salvati, la tessera che non ripete il verdetto, la nota dalla riga, i locator); la
  lezione della sessione (mai `git checkout <file>` per annullare una riga) in AGENTS.md § Commands.
## Architecture Snapshot
- App Router; protected pages under `app/dashboard/*`.
- `lib/services/*` (service layer) → pure `lib/utils/*` → `lib/server/*` (server-only). React Query for caching/invalidation.
- Italy timezone helpers in `lib/utils/dateHelpers.ts`.
- Convention: extract logic into pure, tested `lib/utils`/`lib/services` functions; keep Firestore-coupled code thin.

## Key Features (Active)
One line per area: the question it answers, then where it is described. *What the user sees* → README.md; *repo-wide rules* → AGENTS.md; *an area's rules, files and blind spots* → `doc/guide/<tema>.md`; *the aesthetic* → DESIGN.md.

- **Shell**: skip link · compact `PageHeader` · `PageTabBar` · `PageContainer` (1920) + `TileGridSkeleton` · sidebar · bottom pill + «Altro» drawer; a tile's eyebrow is an `<h3>`. DESIGN → §5; AGENTS → *Navigation*.
- **Shared account · Demo mode**: a second user as full co-owner (viewer `user.uid` ≠ owner `ownerId`); the demo auto-logs in from the landing and `useDemoMode()` gates every mutation. doc/guide/account-condiviso-demo.md.
- **Landing**: the Panoramica for someone with no data, the app's real tiles on a declared sample profile. doc/guide/landing.md.
- **Accesso e Registrazione**: one 420px tile, a verdict generated from the registration state, Italian errors only. doc/guide/accesso-registrazione.md.
- **Panoramica**: «come va il mese?» — rule-generated verdict over a tile grid on `GET /api/dashboard/overview`. doc/guide/panoramica.md.
- **Patrimonio**: the portfolio's verdict (its driver an instrument) over six tiles; Strumenti is the management table. doc/guide/patrimonio.md.
- **Registro operazioni**: BUY/SELL/ADJUSTMENT with cash settlement in cents (a sell net of the withheld tax), the asset doc rebuilt by full replay. doc/guide/registro-operazioni.md.
- **Cashflow › Tracciamento**: «come sta andando il mese?» on one period axis. doc/guide/cashflow-tracciamento.md; shared rules (sign, recurrence, a linked account moving on each row's own date, CSV import, grouping, Sankey) in doc/guide/cashflow.md.
- **Cashflow › Budget**: «sto rispettando il budget?», no axis, the ceiling historicised by the daily cron. doc/guide/cashflow-budget.md.
- **Centri di Costo** (optional): «quanto sta costando il progetto?», no axis and no pace. doc/guide/centri-di-costo.md.
- **Cashflow › Divisione** (optional): «quanto è costato in comune, e quanto resta a ciascuno?» — il residuo è di denaro che si è mosso, il calendario è una clausola a parte. doc/guide/cashflow-divisione.md.
- **Analisi**: «dove vanno i soldi, e cosa è cambiato?» on a four-mode axis; the app's only Sankey. doc/guide/cashflow-analisi.md.
- **Dividendi**: «quanto rendono i miei flussi?»; received and announced never one figure; BTP Italia and BTP€i coupons; a payment credits the instrument's account, else the default, never an arrear. doc/guide/cashflow-dividendi.md.
- **Rendimenti**: «quanto rende il portafoglio, e rispetto a cosa?» — configurable base, six EUR benchmarks, per-instrument attribution; below a year the hero is the period's return, Contributi is the ONE capital the formulas neutralise. doc/guide/rendimenti.md.
- **Storico**: «come sono arrivato qui?» — wealth growth, contributions included; the Driver splits it into savings, measured market, sale taxes, mortgage, pension contributions and the rest, as a ledger that adds up to the euro behind each year. doc/guide/storico.md.
- **Allocazione**: «sono allineato al piano, e cosa faccio con i prossimi soldi?» — i tre piani nominano gli STRUMENTI da scambiare e prezzano la ritenuta; «prelevare X» significa X in mano. doc/guide/allocazione.md.
- **Previdenza**: «il fondo sta lavorando?» per contributor, the value typed from the statement ON the page. doc/guide/previdenza.md.
- **FIRE**: Calcolatore, Coast FIRE, What If, Monte Carlo and Obiettivi, one verdict each. doc/guide/fire.md (+ fire-coast, fire-what-if, fire-monte-carlo, fire-obiettivi).
- **Assistente AI**: the verdict IS the context; SSE streaming, memory, goal proposals; flag `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`, blocked in demo. doc/guide/assistente.md.
- **Hall of Fame**: «quali sono stati i mesi e gli anni migliori?», no axis. doc/guide/hall-of-fame.md.
- **Impostazioni**: six tabs, no verdict, one Save per page with the save state per tab (a dot, a bottom bar, «Annulla modifiche»); the write fan-out in doc/guide/impostazioni.md § Settings — the FIVE places.
- **States**: loading · nothing recorded · measured zero · failed read, on 20 surfaces. doc/guide/stati.md; DESIGN → The Absence-Has-Three-Names Rule.
- **Dialogs and forms**: 40 modals on one vocabulary in `ResponsiveModal`; row deletes arm in the row. doc/guide/dialog.md; DESIGN → The Modal-Is-A-Tile Rule.
- **Periodic emails · budget email · PDF export**: rule-generated verdict first, AI comment second; every hex from `printTokens.ts`. doc/guide/email-pdf.md; DESIGN → The Out-Of-DOM Token Rule.
- **Themes**: twelve theme blocks × nine chart slots through `useChartColors`, every block held to the distinctness floor by `__tests__/chartPaletteDistinctness.test.ts`. doc/guide/temi.md.

## Testing
- Vitest: `npx vitest run <file>`, `npm test -- <file>`, `npx tsc --noEmit`. New tests in `__tests__/`; prefer pure functions over Firestore-coupled code.
- **Phantom `tsc` errors** clustered in `e2e/` and `lib/utils/expenseImport.ts` after a branch switch: run `npm install` first (AGENTS → *Commands*).
- **Dev/test without production data**: Firebase Emulator Suite (`npm run emulators` + `emulators:seed` + `dev:emulator`), requires a JDK. SETUP.md → Step 6. **The owner's real data for a tour**: `npm run mirror:seed -- <email>` (production read-only → emulators as `mirror@example.com`, nothing on disk) and `npm run mirror:remove` at the end — the account is the standard, the data is re-read every time (WORKFLOW.md § 3).
- **Browser (E2E)**: Playwright, `npm run test:e2e` with the emulators up (needs **Java ≥ 21**); app on :3100 with an isolated build dir. Accounts and fixtures: SETUP.md → Step 7; gotchas: doc/guide/e2e-emulatori.md § Browser-Driven E2E (Playwright).

## Data & Integrations
Firestore client + admin · Yahoo Finance (prices, benchmark history) · Borsa Italiana scraping (Italian bonds, dividends) · Frankfurter (FX) · FRED (`FRED_API_KEY`, series ECBDFR) · Anthropic (`claude-sonnet-5` analysis + assistant, `claude-haiku-4-5` extraction).

## Known Issues (Active)
Only what crosses areas; an area's blind spots — the behaviours that look like bugs and are not — close its `doc/guide/<tema>.md` (§ Per-page blind spots). The demo account's manual setup is in README.md → Known Issues, the shared account's prerequisites in SETUP.md → Step 5b.

- **Two Sonnet generations coexist** (`lib/constants/aiModels.ts`): the Rendimenti analysis runs on `claude-sonnet-4-6`, the assistant and the emails on `claude-sonnet-5`. Aligning them changes cost and output, so it is a product decision still to take; until then the four constants stay distinct and each modal reads its OWN route's.
- **Two deliberate dependency pins keep advisories open.** `firebase-admin` at `^13.6.0` (@14 pulls pure-ESM `jose@6` → `ERR_REQUIRE_ESM` on Vercel; 8 moderate `uuid` advisories stay) and `next` at `~16.2.12` (16.3.0 breaks Vercel at `onBuildComplete`; 2 HIGH libvips advisories via `sharp`, low exposure). **Unpin next and re-run `npm audit fix` once Vercel digests 16.3.x.**
- **Per-page blind spots** — the behaviours that look like bugs and are not — live at the end of each `doc/guide/<page>.md` (one *Per-page blind spots* section per page). Moved there verbatim from this file's Known Issues; CLAUDE.md keeps only the cross-cutting ones.
- **Three Vitest cases fail under `TZ=UTC`** (`budgetUtils` › crossing day, `pensionSummary` › value age, `tracciamentoSummary` › `isScheduledRow`), on a clean `develop` too (checked in a worktree, 2026-09-20): they read «today» by Italian calendar day against fixtures built in the process timezone. The suite's two timezones are the machine's and `Europe/Rome`; a CI in UTC would see them red.
- **Every controlled `ResponsiveModal` opened without `returnFocusTo` drops focus on `body` when it closes** (Radix cancels its own restore when there is no `Trigger`; doc/guide/dialog.md). Rendimenti's two and Hall of Fame's two are fixed; the others take the opener when they are next touched.
- **`--muted-foreground` measures 4,46:1 on `--background` in the default LIGHT theme** (measured in the browser,
  2026-09-21, on the compact `PageHeader`'s description) — just under the AA floor of 4,5:1, on every page that uses
  the shell, not on one. It is a theme-token change with a twelve-block blast radius, so it belongs to a
  `doc/guide/temi.md` session, not to a page's.
- **`e2e/modal.origin.spec.ts` is intermittent in a FULL run** (2026-09-21): it failed twice in a row and then passed
  twice with the same code — once with `components/ui/period-picker.tsx` reverted and once with it restored, so that
  change is not the cause (and it failed once more in the full run of 2026-09-22, green alone right after). When it fails, Rendimenti's «Periodo personalizzato» button has moved **23,4px** between the
  `boundingBox()` the spec takes and the origin captured at the click: a late reflow under suite load, roughly the
  height of the custom-period chip row. It passes alone, and in the `desktop` project alone. Not reproduced on demand,
  so not yet fixed — re-read this before trusting a single red run of it.
- **The icon rail's 44px targets are measured at 1440 with a mouse**; no fixture covers a ≥1440px tablet in landscape.
- **Two shared primitives stay below 44px on touch, on every page**: the `PageTabBar` pill below 1440 (inactive tabs
  38×32, icon only) and the `Switch` (36×20; its row's `Label` is clickable, the thumb alone is not). Measured on
  Impostazioni, 2026-09-22; left alone there because enlarging either changes every page at once.

## Key Files
Cross-cutting entry points only: each area's files open its guide (`doc/guide/<tema>.md` § Files), every pure module has
`__tests__/{module}.test.ts`, every page its `e2e/{page}*.spec.ts` where one exists.
- **Shell**: `app/dashboard/layout.tsx` (`<main>` = `page-main`), `app/dashboard/template.tsx`, `components/layout/{Sidebar,BottomNavigation,SecondaryMenuDrawer,SceneLink,PageHeader,PageTabBar,PageTabs,PageContainer,ThemePicker,LogoutDialog}.tsx`, `lib/utils/viewTransition.ts` (the ONE `startViewTransition`, `data-vt` scoping) + `lib/hooks/useSceneNavigation.ts` (the page scene), `lib/utils/themeTransition.ts`, `components/ui/sidebar.tsx` (`SIDEBAR_WIDTH_ICON`), `lib/constants/navigation.ts` (the ONE source of the nav arrays); tile primitives `components/ui/{tile,tile-method-note,series-legend,narrative-text,ranked-rows,tile-grid-skeleton,page-verdict}.tsx`, `lib/hooks/useRovingFocus.ts` (a list as ONE Tab stop), `lib/utils/narrative.ts` (`Narrative`, `VerdictTone`, `PageVerdictModel`)
- **Shared primitives / utils** (each the single source of its rule): `components/ui/{composition-list,composition-bar,segmented-pill,drill-breadcrumb,chart-hover}.tsx`; `lib/utils/formatters.ts` · `metricColors.ts` (`getMetricValueColor`) · `assetPricing.ts` (`requiresManualPricing`) · `assetLiquidity.ts` · `expenseTypeTransition.ts` · `firestoreData.ts` (`removeUndefinedDeep`) · `dateHelpers.ts` (`endOfMonthBound`, `getItalyDateIso`, `isItalyDayAfter`) · `spendingProjection.ts` (the ONE month-end projection) · `recurrenceDates.ts` (the ONE source on recurrence)
- **E2E**: `playwright.config.ts`, `e2e/*.ts`, `e2e/global-setup.ts`, fixtures `scripts/{seedEmulator.ts,seedPensionE2E,seedAnalisiE2E,seedCoastFireE2E,seedCostCentersE2E,seedSplitE2E,seedHallOfFameE2E}.mts`; scripts `test:e2e`/`e2e:seed*`/`dev:e2e`; the production mirror `scripts/mirrorProdAccount.mts` (`mirror:seed`/`mirror:remove`)


## Design Context
Authoritative aesthetic spec: **DESIGN.md** — hand-maintained, **never regenerate it**; its YAML frontmatter is the normative layer read by the impeccable detector, `.impeccable/design.json` only the extensions sidecar (its narrative is DESIGN.md verbatim — script-check before rewriting it; its `extensions.motion` is read from the CODE). Product truth: **PRODUCT.md**. Rules are cited by name (DESIGN → **The X Rule**) and enforced by `components/ui/{tile,page-verdict,responsive-modal}.tsx`, `statesNarrative.ts` and `printTokens.ts`. A change to a page starts from its `doc/guide/<page>.md` and DESIGN.md's named rules. History: `git log`.
