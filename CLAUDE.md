# CLAUDE.md - Net Worth Tracker (Lean)

> **Read [WORKFLOW.md](WORKFLOW.md) before starting**: standing session rules (one branch and one
> commit per session, never commit without approval, answer in Italian) and the guided-verification
> protocol. A new rule stated in a session is added there, in that session's commit.

## Project Overview
Next.js app for Italian investors: net worth, assets, cashflow, dividends, performance metrics and long-term planning on Firebase.

**This file is the INDEX**: "what it is + where it lives", nothing more — keep it well under 20.000 characters; it is injected into every turn. Repo-wide conventions and gotchas live in **AGENTS.md**; the per-area rules, files and blind spots in **`doc/guide/<tema>.md`** (one file per page/tab/subsystem, a stub apiece in AGENTS.md § 3; the test harness `doc/guide/e2e-emulatori.md`); the aesthetic in **DESIGN.md**; env/emulators/Playwright in **SETUP.md**; users and positioning in **PRODUCT.md**; what the user sees in **README.md**.

> **Language**: this file and AGENTS.md are in English. Italian is reserved for user-facing UI text. Page and feature names stay Italian, because they are the labels the product shows: Panoramica, Patrimonio, Cashflow, Analisi, Rendimenti, Allocazione, Storico, Previdenza, Impostazioni.

## Current Status
- Stack: Next.js 16, React 19 **with the React Compiler on** (since 2026-10-05), TypeScript 5, Tailwind v4, Firebase, Vitest, Framer Motion, Recharts, Yahoo Finance, Borsa Italiana scraping, Anthropic.
- `tsc` clean; **221 files / 4936 tests** green in `Europe/Rome` and in the machine's zone; **47 Playwright spec files** (173 tests incl. 6 auth setups; last full run 2026-10-07, Windows laptop). Run Vitest under `TZ=Europe/Rome` too — every date fixture sits at noon.
- Latest (2026-10-07): **the PERF-11 spec retired** (Patrimonio's light rows and dialogs, PR #434 in develop since 2026-10-07) — 16 divergences: twelve where the code was right, the lessons already home (doc/guide/{patrimonio,dialog,e2e-emulatori}.md, AGENTS.md § Motion · Recharts · Dynamic Imports · Two-Step, `perf/README.md` § Il census); three text defects fixed on the owner's call (patrimonio.md's account-detail state, the census header, the closing measure — 1440 521 → 443 ms, 390 CPU 4× 2001 → 1466, 764,7 → 655,8 KB gz — now in `perf/README.md` § Baseline); one unwritten deferral (`cashflow.transfer-fee` red once in a full run → e2e-emulatori.md); a false «7 `react-hooks` errors» blind spot removed from patrimonio.md. doc/perf/README.md § 6.

## Architecture Snapshot
- App Router; protected pages under `app/dashboard/*`.
- `lib/services/*` (service layer) → pure `lib/utils/*` → `lib/server/*` (server-only). React Query for caching/invalidation, its cache persisted to IndexedDB (doc/guide/cache-persistita.md). The expenses are read by WINDOW on Cashflow and FIRE, whole on Storico, Analisi and Centri (doc/guide/cashflow.md § Expenses by window).
- Italy timezone helpers in `lib/utils/dateHelpers.ts`; logic in pure, tested `lib/utils`/`lib/services` functions, Firestore-coupled code thin.

## Key Features (Active)
One line per area: the question it answers, then where it is described (README.md for what the user sees).

- **Shell**: prerendered, before Firebase Auth resolves (2026-09-28); skip link, compact `PageHeader`, `PageTabBar`, sidebar, bottom pill + «Altro». doc/guide/shell.md; DESIGN → §5.
- **Shared account · Demo mode**: a co-owner (viewer `user.uid` ≠ owner `ownerId`); the demo gated by `useDemoMode()`. doc/guide/account-condiviso-demo.md.
- **Landing** and **Accesso e Registrazione**: the app's tiles on a sample profile; one 420px tile with a generated verdict. doc/guide/landing.md, accesso-registrazione.md.
- **Panoramica**: «come va il mese?» on a server-owned summary fresh for the Italian day. doc/guide/panoramica.md.
- **Patrimonio**: «cosa possiedo, e cosa si è mosso?» — verdict, six tiles, «Mutuo» per mortgaged property, Strumenti. doc/guide/patrimonio.md.
- **Registro operazioni**: BUY/SELL/ADJUSTMENT settled in cents, the asset rebuilt by full replay. doc/guide/registro-operazioni.md.
- **Cashflow › Tracciamento**: «come sta andando il mese?». doc/guide/cashflow-tracciamento.md; shared expense rules in doc/guide/cashflow.md.
- **Cashflow › Budget**: «sto rispettando il budget?». doc/guide/cashflow-budget.md.
- **Centri di Costo** (optional): «quanto sta costando il progetto?». doc/guide/centri-di-costo.md.
- **Cashflow › Divisione** (optional): «quanto è costato in comune, e quanto resta a ciascuno?» — shared income pays first, the shares split the net. doc/guide/cashflow-divisione.md.
- **Analisi**: «dove vanno i soldi, e cosa è cambiato?» — the app's only Sankey, by type or 50/30/20 role. doc/guide/cashflow-analisi.md.
- **Dividendi**: «quanto rendono i miei flussi?» — received and announced never one figure; BTP Italia and BTP€i coupons. doc/guide/cashflow-dividendi.md.
- **Rendimenti**: «quanto rende il portafoglio, e rispetto a cosa?». doc/guide/rendimenti.md.
- **Storico**: «come sono arrivato qui?» — the Driver's ledger adds up to the euro. doc/guide/storico.md.
- **Allocazione**: «sono allineato al piano, e cosa faccio con i prossimi soldi?» — three plans naming the instruments; the Esposizione. doc/guide/allocazione.md.
- **Previdenza**: «il fondo sta lavorando?» per contributor. doc/guide/previdenza.md.
- **FIRE**: Calcolatore, Coast FIRE, What If, Monte Carlo and Obiettivi, one verdict each. doc/guide/fire.md (+ fire-coast, fire-what-if, fire-monte-carlo, fire-obiettivi).
- **Assistente AI**: the verdict IS the context; flag `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`, blocked in demo. doc/guide/assistente.md.
- **Hall of Fame**: «quali sono stati i mesi e gli anni migliori?». doc/guide/hall-of-fame.md.
- **Impostazioni**: six tabs, one Save per page. doc/guide/impostazioni.md (§ Settings — the FIVE places).
- **States**: loading · nothing recorded · measured zero · failed read, and «old but present» (2026-09-29). doc/guide/stati.md; DESIGN → The Absence-Has-Three-Names Rule.
- **Dialogs and forms**: 40 modals on `ResponsiveModal`. doc/guide/dialog.md; DESIGN → The Modal-Is-A-Tile Rule.
- **Periodic emails · budget email · PDF export**: verdict first, AI comment second. doc/guide/email-pdf.md; DESIGN → The Out-Of-DOM Token Rule.
- **Themes**: twelve theme blocks × nine chart slots. doc/guide/temi.md.

## Testing
- Vitest: `npx vitest run <file>`, `npm test -- <file>`, `npx tsc --noEmit`; new tests in `__tests__/`. Commands and traps: AGENTS.md § Commands.
- **Without production data**: the Firebase Emulator Suite (`npm run emulators` + `emulators:seed` + `dev:emulator`, a JDK) — SETUP.md → Step 6. **The owner's real data for a tour**: `npm run mirror:seed -- <email>` and `npm run mirror:remove` at the end (WORKFLOW.md § 3).
- **Browser (E2E)**: `npm run test:e2e` with the emulators up (Java ≥ 21), app on :3100 — SETUP.md → Step 7; doc/guide/e2e-emulatori.md.
- **Performance**: `npm run perf:budget`, `perf:bench`, `perf:census` — `perf/README.md`; the specs and their history in `doc/perf/README.md`. **Mobile composition** (after `doc/perf/`): `doc/mobile/README.md`.

## Data & Integrations
Firestore client + admin (production in `eur3`; the Vercel functions in `fra1`, held by `__tests__/vercelConfig.test.ts`) · Yahoo Finance · Borsa Italiana scraping · Frankfurter (FX) · FRED (`FRED_API_KEY`, ECBDFR) · Anthropic (the model ids in `lib/constants/aiModels.ts`).

## Known Issues (Active)
Only what crosses areas; an area's blind spots — behaviours that look like bugs and are not — close its `doc/guide/<tema>.md` (§ Per-page blind spots). The demo account's setup is in README.md → Known Issues, the shared account's in SETUP.md → Step 5b.

- **Two Sonnet generations coexist** (`lib/constants/aiModels.ts`): Rendimenti's analysis on `claude-sonnet-4-6`, the assistant and the emails on `claude-sonnet-5` — a product decision still to take; each modal reads its OWN route's constant.
- **Two dependency pins keep advisories open**: `firebase-admin` `^13.6.0` (@14's pure-ESM `jose@6` breaks Vercel; 8 moderate `uuid`) and `next` `~16.2.12` (16.3.0 breaks Vercel at `onBuildComplete`; 2 HIGH libvips via `sharp`). **Unpin next and `npm audit fix` once Vercel digests 16.3.x.**
- **Three Vitest cases fail under `TZ=UTC`** (`budgetUtils` › crossing day, `pensionSummary` › value age, `tracciamentoSummary` › `isScheduledRow`; 2026-09-20, on `develop` too): they read «today» by Italian day against fixtures built in the process zone — a CI in UTC would see them red.
- **A controlled `ResponsiveModal` opened without `returnFocusTo` drops focus on `body` when it closes** (doc/guide/dialog.md); fixed on Rendimenti, Hall of Fame and Patrimonio (2026-10-07), the others when next touched.
- **`--muted-foreground` is 4,46:1 on `--background` in the default LIGHT theme** (2026-09-21), just under AA on every shell page — a twelve-block token change for a doc/guide/temi.md session.
- **Two shared primitives stay below 44px on touch, on every page** (2026-09-22): the `PageTabBar` pill below 1440 (38×32) and the `Switch` (36×20; its `Label` is clickable).

## Key Files
Each area's files open its guide (`doc/guide/<tema>.md` § Files: the shell in shell.md, the E2E harness and seeds in e2e-emulatori.md); every pure module has `__tests__/{module}.test.ts`. Cross-cutting entry points only:
- **Tile primitives**: `components/ui/{tile,tile-method-note,series-legend,narrative-text,ranked-rows,tile-grid-skeleton,page-verdict}.tsx`, `lib/hooks/useRovingFocus.ts` (a list as ONE Tab stop), `lib/utils/narrative.ts` (`Narrative`, `VerdictTone`, `PageVerdictModel`)
- **Shared primitives / utils** (each the single source of its rule): `components/ui/{composition-list,composition-bar,segmented-pill,drill-breadcrumb,chart-hover,lazy-component}.tsx`, `components/ui/charts/recharts.ts` (the ONE door to recharts); `lib/utils/expenseWindows.ts` · `formatters.ts` · `metricColors.ts` (`getMetricValueColor`) · `assetPricing.ts` (`requiresManualPricing`) · `assetLiquidity.ts` · `expenseTypeTransition.ts` · `firestoreData.ts` (`removeUndefinedDeep`) · `dateHelpers.ts` (`endOfMonthBound`, `getItalyDateIso`, `isItalyDayAfter`) · `spendingProjection.ts` · `recurrenceDates.ts` · `cents.ts` (`roundToCents`) · `floatNoise.ts`

## Design Context
Authoritative aesthetic spec: **DESIGN.md** — hand-maintained, **never regenerate it**; its YAML frontmatter is the normative layer read by the impeccable detector, `.impeccable/design.json` only the extensions sidecar (script-check before rewriting it). Product truth: **PRODUCT.md**. Rules are cited by name (DESIGN → **The X Rule**) and enforced by `components/ui/{tile,page-verdict,responsive-modal}.tsx`, `statesNarrative.ts` and `printTokens.ts`. A change to a page starts from its `doc/guide/<page>.md` and DESIGN.md's named rules.
