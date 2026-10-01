# CLAUDE.md - Net Worth Tracker (Lean)

> **Read [WORKFLOW.md](WORKFLOW.md) before starting**: standing session rules (one branch and one
> commit per session, never commit without approval, answer in Italian) and the guided-verification
> protocol. A new rule stated in a session is added there, in that session's commit.

## Project Overview
Next.js app for Italian investors: net worth, assets, cashflow, dividends, performance metrics and long-term planning on Firebase.

**This file is the INDEX**: "what it is + where it lives", nothing more — keep it well under 20.000 characters; it is injected into every turn. Repo-wide conventions and gotchas live in **AGENTS.md**; the per-area rules and traps in **`doc/guide/<tema>.md`** (one file per page/tab/subsystem — the feature index below points to each, and AGENTS.md § 3 carries a stub apiece; the test harness is `doc/guide/e2e-emulatori.md`, its two stubs in AGENTS.md § 5; `shell.md` and `cache-persistita.md` have theirs under AGENTS.md § Navigation and § Caching); the aesthetic spec in **DESIGN.md**; env/emulators/Playwright in **SETUP.md**; users and positioning in **PRODUCT.md**. Session rules and the guided-verification protocol in **[WORKFLOW.md](WORKFLOW.md)** (see the note at the top).

> **Language**: this file and AGENTS.md are in English. Italian is reserved for user-facing UI text. Page and feature names stay Italian, because they are the labels the product shows: Panoramica, Patrimonio, Cashflow, Analisi, Rendimenti, Allocazione, Storico, Previdenza, Impostazioni.

## Current Status
- Stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, Vitest, Framer Motion, Recharts, Yahoo Finance, Borsa Italiana scraping, Anthropic.
- `tsc` clean; **209 files / 4803 tests** green in `Europe/Rome` and in the machine's zone + **45 Playwright spec files** (162 tests, incl. 6 auth setups; last full run 2026-09-30 evening on the Windows laptop, 162/162 in 8,3 min — `modal.origin` and `cashflow.dividendi`, the two intermittents of Known Issues, green that run; doc/guide/e2e-emulatori.md). Run Vitest under `TZ=Europe/Rome` too — every date fixture sits at noon, which structurally hides timezone bugs.
- Latest (2026-10-01): **`doc/perf/PERF-06` retired** — the expenses by window (PR #421, in develop since 2026-10-01)
  read against its spec: 21 divergences — 19 where the code was right and the lesson already home (`lib/utils/expenseWindows.ts`,
  AGENTS.md § React Query, the Cashflow, Budget, Divisione, Analisi, Centri, FIRE, persisted-cache and E2E guides, the
  comments at the lines), 0 defects, 2 deferred and already written (the § 2 targets missed on a wrong premise →
  `perf/README.md`; Analisi's Andamento on future rows → doc/guide/cashflow-analisi.md); one lesson moved here (a window
  has no rollback flag, its rollback is the revert → doc/guide/cashflow.md § Expenses by window); the measures stay in
  `doc/perf/README.md` § 6 and `perf/README.md`. **Verified**: `tsc`, lint 0, Vitest in `Europe/Rome`; no Playwright
  (comments and documents only).

## Architecture Snapshot
- App Router; protected pages under `app/dashboard/*`.
- `lib/services/*` (service layer) → pure `lib/utils/*` → `lib/server/*` (server-only). React Query for caching/invalidation, its cache persisted to IndexedDB and restored before the first fetch (an allowlist, `lib/constants/persistCache.ts`; doc/guide/cache-persistita.md, its stub in AGENTS.md § Caching). The expenses are read by WINDOW on Cashflow and FIRE (`lib/utils/expenseWindows.ts`, the ONE source; doc/guide/cashflow.md § Expenses by window), whole on Storico, Analisi and Centri.
- Italy timezone helpers in `lib/utils/dateHelpers.ts`.
- Convention: extract logic into pure, tested `lib/utils`/`lib/services` functions; keep Firestore-coupled code thin.

## Key Features (Active)
One line per area: the question it answers, then where it is described. *What the user sees* → README.md; *repo-wide rules* → AGENTS.md; *an area's rules, files and blind spots* → `doc/guide/<tema>.md`; *the aesthetic* → DESIGN.md.

- **Shell**: skip link · compact `PageHeader` · `PageTabBar` · `PageContainer` (1920) + `TileGridSkeleton` · sidebar · bottom pill + «Altro» drawer; a tile's eyebrow is an `<h3>`. Since 2026-09-28 the shell is in the prerendered HTML and renders BEFORE Firebase Auth resolves: `ProtectedRoute` wraps only the page inside `<main>`, with the generic skeleton («Verifica dell'accesso») as fallback; the profile waits as two `Skeleton` lines; a stored theme is on `<html>` from a `<head>` script. DESIGN → §5; doc/guide/shell.md (its stub: AGENTS → *Navigation*); doc/guide/stati.md, temi.md.
- **Shared account · Demo mode**: a second user as full co-owner (viewer `user.uid` ≠ owner `ownerId`); the demo auto-logs in from the landing and `useDemoMode()` gates every mutation. doc/guide/account-condiviso-demo.md.
- **Landing**: the Panoramica for someone with no data, the app's real tiles on a declared sample profile. doc/guide/landing.md.
- **Accesso e Registrazione**: one 420px tile, a verdict generated from the registration state, Italian errors only. doc/guide/accesso-registrazione.md.
- **Panoramica**: «come va il mese?» — rule-generated verdict over a tile grid on `GET /api/dashboard/overview`. doc/guide/panoramica.md.
- **Patrimonio**: the portfolio's verdict (its driver an instrument) over six tiles, plus «Mutuo» per property with linked instalments (interest and principal by year, projected end); Strumenti is the management table, a composite instrument's class chip split by class. doc/guide/patrimonio.md.
- **Registro operazioni**: BUY/SELL/ADJUSTMENT with cash settlement in cents (a sell net of the withheld tax), the asset doc rebuilt by full replay. doc/guide/registro-operazioni.md.
- **Cashflow › Tracciamento**: «come sta andando il mese?» on one period axis. doc/guide/cashflow-tracciamento.md; shared rules (sign, recurrence, a linked account moving on each row's own date, a transfer's fee as its own row, a mortgage instalment repaying its property's principal, CSV import, grouping, Sankey) in doc/guide/cashflow.md.
- **Cashflow › Budget**: «sto rispettando il budget?», no axis, the ceiling historicised by the daily cron. doc/guide/cashflow-budget.md.
- **Centri di Costo** (optional): «quanto sta costando il progetto?», no axis and no pace. doc/guide/centri-di-costo.md.
- **Cashflow › Divisione** (optional): «quanto è costato in comune, e quanto resta a ciascuno?» — le entrate in comune pagano prima, le quote dividono il netto; il residuo è di denaro che si è mosso, il calendario è una clausola a parte. doc/guide/cashflow-divisione.md.
- **Analisi**: «dove vanno i soldi, e cosa è cambiato?» on a four-mode axis; the app's only Sankey, by type or — opt-in `spendingRolesEnabled` — by 50/30/20 role; below 640px the Flusso is a share bar and rows. doc/guide/cashflow-analisi.md; the roles in doc/guide/cashflow.md.
- **Dividendi**: «quanto rendono i miei flussi?»; received and announced never one figure; BTP Italia and BTP€i coupons; a payment credits the instrument's account, else the default, never an arrear. doc/guide/cashflow-dividendi.md.
- **Rendimenti**: «quanto rende il portafoglio, e rispetto a cosa?» — configurable base, six EUR benchmarks, per-instrument attribution; below a year the hero is the period's return, Contributi is the ONE capital the formulas neutralise. doc/guide/rendimenti.md.
- **Storico**: «come sono arrivato qui?» — wealth growth, contributions included; the Driver splits it into savings, measured market, sale taxes, mortgage, pension contributions and the rest, as a ledger that adds up to the euro behind each year. doc/guide/storico.md.
- **Allocazione**: «sono allineato al piano, e cosa faccio con i prossimi soldi?» — i tre piani nominano gli STRUMENTI da scambiare e prezzano la ritenuta; «prelevare X» significa X in mano. L'Esposizione pesa il nozionale (Titoli, Settori) e il mercato (Emittenti) degli strumenti quotati del portafoglio di Allocazione, dice dove va ogni euro (letto · non letto · non applicabile · fuori vista) e legge UNA cache per ticker con le sole risposte di Yahoo, pesando nel browser. doc/guide/allocazione.md.
- **Previdenza**: «il fondo sta lavorando?» per contributor, the value typed from the statement ON the page. doc/guide/previdenza.md.
- **FIRE**: Calcolatore, Coast FIRE, What If, Monte Carlo and Obiettivi, one verdict each. doc/guide/fire.md (+ fire-coast, fire-what-if, fire-monte-carlo, fire-obiettivi).
- **Assistente AI**: the verdict IS the context; SSE streaming, memory, goal proposals; flag `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`, blocked in demo. doc/guide/assistente.md.
- **Hall of Fame**: «quali sono stati i mesi e gli anni migliori?», no axis. doc/guide/hall-of-fame.md.
- **Impostazioni**: six tabs, no verdict, one Save per page with the save state per tab (a dot, a bottom bar, «Annulla modifiche»); the write fan-out in doc/guide/impostazioni.md § Settings — the FIVE places.
- **States**: loading · nothing recorded · measured zero · failed read, on 20 surfaces — and, since 2026-09-29, «old but present»: the header's «Aggiornato alle HH:MM, sto rileggendo…» while a figure restored from the persisted cache is reread. doc/guide/stati.md; DESIGN → The Absence-Has-Three-Names Rule.
- **Dialogs and forms**: 40 modals on one vocabulary in `ResponsiveModal`; row deletes arm in the row. doc/guide/dialog.md; DESIGN → The Modal-Is-A-Tile Rule.
- **Periodic emails · budget email · PDF export**: rule-generated verdict first, AI comment second; every hex from `printTokens.ts`. doc/guide/email-pdf.md; DESIGN → The Out-Of-DOM Token Rule.
- **Themes**: twelve theme blocks × nine chart slots through `useChartColors`, every block held to the distinctness floor by `__tests__/chartPaletteDistinctness.test.ts`. doc/guide/temi.md.

## Testing
- Vitest: `npx vitest run <file>`, `npm test -- <file>`, `npx tsc --noEmit`. New tests in `__tests__/`; prefer pure functions over Firestore-coupled code.
- **Phantom `tsc` errors** clustered in `e2e/` and `lib/utils/expenseImport.ts` after a branch switch: run `npm install` first (AGENTS → *Commands*).
- **Dev/test without production data**: Firebase Emulator Suite (`npm run emulators` + `emulators:seed` + `dev:emulator`), requires a JDK. SETUP.md → Step 6. **The owner's real data for a tour**: `npm run mirror:seed -- <email>` (production read-only → emulators as `mirror@example.com`, nothing on disk) and `npm run mirror:remove` at the end — the account is the standard, the data is re-read every time (WORKFLOW.md § 3).
- **Performance**: `npm run perf:budget` (JS per route against `perf/budget.json`, two seconds, after a build) and
  `npm run perf:bench -- --runs=3` (cold/warm on the mirror, via `perf:build` + `perf:serve` on :3200); commands, columns,
  the baseline in force and the raised-ceiling register in `perf/README.md`. A route that grows raises its ceiling in the
  same commit with `raisedBy`. The specs and the 2026-09-26 history in `doc/perf/README.md` (PERF-00, 01, 02, 03 and 05 done, their specs retired).
- **Mobile composition**: the small-screen census (19 surfaces × 390/768/1024), the chosen direction, the nine specs and
  the owner's decisions in `doc/mobile/README.md`; the census script in `doc/mobile/reference/` (MOB-01 ports it to
  `npm run mobile:census` / `mobile:budget`). Implemented after `doc/perf/`.
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
  so not yet fixed — re-read this before trusting a single red run of it. **A second failure mode on 2026-09-29**
  (Windows laptop, the machine twice as slow as the day before): red at line 47 — no `data-state="closed"` frame inside
  the sampler's 2,6 s window, so the dialog opened more than ~1,5 s after the click — three times ALONE on a fresh
  `.next-e2e`, and identically with develop's `app/page.tsx` and `AuthShell.tsx` swapped in on the same server, so not
  the day's commit. The window is the spec's, not the app's: a slow machine can fail it without any regression.
- **`e2e/cashflow.dividendi.spec.ts` › «the form refuses…» is red after `cashflow.accounts` + `cashflow.budget`** (2026-09-30:
  3/3 on a clean `develop` worktree, 2/3 on the branch of PR #418, green alone): after the refusal the dialog stays open
  with its form reset — `reset` re-runs, cause not traced yet. Two of four full runs that day had it red; green in
  the evening's full run of the same day (162/162).
- **Four base specs are red in the cloud container only** (2026-09-25): its Chromium groups four-digit euros («1.100 €»),
  the specs expect «1100 €» as on the Mac (doc/guide/e2e-emulatori.md). Read the received text before «fixing» code.
- **The icon rail's 44px targets are measured at 1440 with a mouse**; no fixture covers a ≥1440px tablet in landscape.
- **Two shared primitives stay below 44px on touch, on every page**: the `PageTabBar` pill below 1440 (inactive tabs
  38×32, icon only) and the `Switch` (36×20; its row's `Label` is clickable, the thumb alone is not). Measured on
  Impostazioni, 2026-09-22; left alone there because enlarging either changes every page at once.

## Key Files
Cross-cutting entry points only: each area's files open its guide (`doc/guide/<tema>.md` § Files), every pure module has
`__tests__/{module}.test.ts`, every page its `e2e/{page}*.spec.ts` where one exists.
- **Shell**: `app/dashboard/layout.tsx` (`<main>` = `page-main`), `app/dashboard/template.tsx`, `components/layout/{Sidebar,BottomNavigation,SecondaryMenuDrawer,SceneLink,PageHeader,PageTabBar,PageTabs,PageContainer,ThemePicker,LogoutDialog}.tsx`, `lib/utils/viewTransition.ts` (the ONE `startViewTransition`, `data-vt` scoping) + `lib/hooks/useSceneNavigation.ts` (the page scene), `lib/utils/themeTransition.ts`, `components/ui/sidebar.tsx` (`SIDEBAR_WIDTH_ICON`), `lib/constants/navigation.ts` (the ONE source of the nav arrays); tile primitives `components/ui/{tile,tile-method-note,series-legend,narrative-text,ranked-rows,tile-grid-skeleton,page-verdict}.tsx`, `lib/hooks/useRovingFocus.ts` (a list as ONE Tab stop), `lib/utils/narrative.ts` (`Narrative`, `VerdictTone`, `PageVerdictModel`)
- **Shared primitives / utils** (each the single source of its rule): `components/ui/{composition-list,composition-bar,segmented-pill,drill-breadcrumb,chart-hover}.tsx`, `components/ui/charts/recharts.ts` (the ONE door to recharts); `lib/utils/expenseWindows.ts` (the ONE source of the expense windows) · `formatters.ts` · `metricColors.ts` (`getMetricValueColor`) · `assetPricing.ts` (`requiresManualPricing`) · `assetLiquidity.ts` · `expenseTypeTransition.ts` · `firestoreData.ts` (`removeUndefinedDeep`) · `dateHelpers.ts` (`endOfMonthBound`, `getItalyDateIso`, `isItalyDayAfter`) · `spendingProjection.ts` (the ONE month-end projection) · `recurrenceDates.ts` (the ONE source on recurrence)
- **E2E**: `playwright.config.ts`, `e2e/*.ts`, `e2e/global-setup.ts`, fixtures `scripts/{seedEmulator.ts,seedPensionE2E,seedAnalisiE2E,seedCoastFireE2E,seedCostCentersE2E,seedSplitE2E,seedHallOfFameE2E,seedInstrumentProfilesE2E}.mts` (+ `scripts/instrumentProfileFixtures.ts`, the Esposizione's Yahoo profiles shared by the base seed and the E2E re-stamp); scripts `test:e2e`/`e2e:seed*`/`dev:e2e`; the production mirror `scripts/mirrorProdAccount.mts` (`mirror:seed`/`mirror:remove`)


## Design Context
Authoritative aesthetic spec: **DESIGN.md** — hand-maintained, **never regenerate it**; its YAML frontmatter is the normative layer read by the impeccable detector, `.impeccable/design.json` only the extensions sidecar (its narrative is DESIGN.md verbatim — script-check before rewriting it; its `extensions.motion` is read from the CODE). Product truth: **PRODUCT.md**. Rules are cited by name (DESIGN → **The X Rule**) and enforced by `components/ui/{tile,page-verdict,responsive-modal}.tsx`, `statesNarrative.ts` and `printTokens.ts`. A change to a page starts from its `doc/guide/<page>.md` and DESIGN.md's named rules. History: `git log`.
