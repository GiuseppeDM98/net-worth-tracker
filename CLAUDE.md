# CLAUDE.md - Net Worth Tracker (Lean)

> **Read [WORKFLOW.md](WORKFLOW.md) before starting**: standing session rules (one branch and one
> commit per session, never commit without approval, answer in Italian) and the guided-verification
> protocol. A new rule stated in a session is added there, in that session's commit.

## Project Overview
Next.js app for Italian investors: net worth, assets, cashflow, dividends, performance metrics and long-term planning on Firebase.

**This file is the INDEX**: "what it is + where it lives", nothing more — keep it well under 20.000 characters; it is injected into every turn. Repo-wide conventions and gotchas live in **AGENTS.md**; the per-area rules and traps in **`doc/guide/<tema>.md`** (one file per page/tab/subsystem — the feature index below points to each, and AGENTS.md § 3 carries a stub apiece); the aesthetic spec in **DESIGN.md**; env/emulators/Playwright in **SETUP.md**; users and positioning in **PRODUCT.md**. Session rules and the guided-verification protocol in **[WORKFLOW.md](WORKFLOW.md)** (see the note at the top).

> **Language**: this file and AGENTS.md are in English. Italian is reserved for user-facing UI text. Page and feature names stay Italian, because they are the labels the product shows: Panoramica, Patrimonio, Cashflow, Analisi, Rendimenti, Allocazione, Storico, Previdenza, Impostazioni.

## Current Status
- Stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, Vitest, Framer Motion, Recharts, Yahoo Finance, Borsa Italiana scraping, Anthropic.
- `tsc` clean; **170 files / 3869 tests** green + **55 Playwright E2E specs** (73 tests green in one full run on 2026-09-18, 2,7 min, incl. 4 auth setups). Run Vitest under `TZ=Europe/Rome` too — every date fixture sits at noon, which structurally hides timezone bugs.
- Latest (2026-09-19, third session): **Storico's Driver measures the market instead of guessing it.** «Mercato −557 €»
  in settembre 2026 was the broker's withheld tax on a VWCE sale (4089 € estimated, 4092,50 € on the statement) plus
  1297 € of instalments in calendar, read as «Δ − risparmio». `lib/utils/growthDrivers.ts`: risparmio (rows already
  happened) · mercato per instrument (`marketEffect.ts`, moved out of `dashboardOverviewUtils` — Panoramica and Storico
  now print the same +2086 €) · tasse · mutuo rimborsato · fondo pensione · altre; «Lavoro e investimenti» takes the
  same parts; «altre variazioni» is said in a sentence only above max(100 €, 5%) (`isMaterialOtherChange`, Panoramica
  too). **Verification**: `tsc`, lint 0, Vitest 3869 under `TZ=Europe/Rome` and without, three falsifications red, the
  mirror's settembre split equal to an independent read-only script (2086 € market), Playwright 1440/390 on the mirror
  (Driver reading word for word, `main` overflow 0, Lavoro's rows summing to the 80.323 € growth).

## Architecture Snapshot
- App Router; protected pages under `app/dashboard/*`.
- `lib/services/*` (service layer) → pure `lib/utils/*` → `lib/server/*` (server-only). React Query for caching/invalidation.
- Italy timezone helpers in `lib/utils/dateHelpers.ts`.
- Convention: extract logic into pure, tested `lib/utils`/`lib/services` functions; keep Firestore-coupled code thin.

## Key Features (Active)
One line per area: the question it answers, then where it is described. *What the user sees* → README.md; *repo-wide rules* → AGENTS.md; *an area's rules, files and blind spots* → `doc/guide/<tema>.md`; *the aesthetic* → DESIGN.md.

- **Shell**: compact `PageHeader` · `PageTabBar` · `PageContainer` (1920) + `TileGridSkeleton` · sidebar · bottom pill + «Altro» drawer. DESIGN → §5; AGENTS → *Navigation*.
- **Shared account · Demo mode**: a second user as full co-owner (viewer `user.uid` ≠ owner `ownerId`); the demo auto-logs in from the landing and `useDemoMode()` gates every mutation. doc/guide/account-condiviso-demo.md.
- **Landing**: the Panoramica for someone with no data, the app's real tiles on a declared sample profile. doc/guide/landing.md.
- **Accesso e Registrazione**: one 420px tile, a verdict generated from the registration state, Italian errors only. doc/guide/accesso-registrazione.md.
- **Panoramica**: «come va il mese?» — rule-generated verdict over a tile grid on `GET /api/dashboard/overview`. doc/guide/panoramica.md.
- **Patrimonio**: the portfolio's verdict (its driver an instrument) over six tiles; Strumenti is the management table. doc/guide/patrimonio.md.
- **Registro operazioni**: BUY/SELL/ADJUSTMENT with cash settlement, the asset doc rebuilt by full replay. doc/guide/registro-operazioni.md.
- **Cashflow › Tracciamento**: «come sta andando il mese?» on one period axis. doc/guide/cashflow-tracciamento.md; shared rules (sign, recurrence, CSV import, grouping, Sankey) in doc/guide/cashflow.md.
- **Cashflow › Budget**: «sto rispettando il budget?», no axis, the ceiling historicised by the daily cron. doc/guide/cashflow-budget.md.
- **Centri di Costo** (optional): «quanto sta costando il progetto?», no axis and no pace. doc/guide/centri-di-costo.md.
- **Cashflow › Divisione** (optional): «quanto è costato in comune, e quanto resta a ciascuno?». doc/guide/cashflow-divisione.md.
- **Analisi**: «dove vanno i soldi, e cosa è cambiato?» on a four-mode axis; the app's only Sankey. doc/guide/cashflow-analisi.md.
- **Dividendi**: «quanto rendono i miei flussi?»; received and announced never one figure; BTP Italia and BTP€i coupons. doc/guide/cashflow-dividendi.md.
- **Rendimenti**: «quanto rende il portafoglio, e rispetto a cosa?» — configurable base, six EUR benchmarks, per-instrument attribution. doc/guide/rendimenti.md.
- **Storico**: «come sono arrivato qui?» — wealth growth, contributions included; the Driver splits it into savings, measured market, sale taxes, mortgage, pension contributions and the rest. doc/guide/storico.md.
- **Allocazione**: «sono allineato al piano, e cosa faccio con i prossimi soldi?». doc/guide/allocazione.md.
- **Previdenza**: «il fondo sta lavorando?» per contributor, the value typed from the statement ON the page. doc/guide/previdenza.md.
- **FIRE**: Calcolatore, Coast FIRE, What If, Monte Carlo and Obiettivi, one verdict each. doc/guide/fire.md (+ fire-coast, fire-what-if, fire-monte-carlo, fire-obiettivi).
- **Assistente AI**: the verdict IS the context; SSE streaming, memory, goal proposals; flag `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`, blocked in demo. doc/guide/assistente.md.
- **Hall of Fame**: «quali sono stati i mesi e gli anni migliori?», no axis. doc/guide/hall-of-fame.md.
- **Impostazioni**: six tabs, no verdict, one Save per page; the write fan-out in doc/guide/impostazioni.md § Settings — the FIVE places.
- **States**: loading · nothing recorded · measured zero · failed read, on 20 surfaces. doc/guide/stati.md; DESIGN → The Absence-Has-Three-Names Rule.
- **Dialogs and forms**: 40 modals on one vocabulary in `ResponsiveModal`; row deletes arm in the row. doc/guide/dialog.md; DESIGN → The Modal-Is-A-Tile Rule.
- **Periodic emails · budget email · PDF export**: rule-generated verdict first, AI comment second; every hex from `printTokens.ts`. doc/guide/email-pdf.md; DESIGN → The Out-Of-DOM Token Rule.
- **Themes**: twelve theme blocks, chart slots through `useChartColors`. doc/guide/temi.md.

## Testing
- Vitest: `npx vitest run <file>`, `npm test -- <file>`, `npx tsc --noEmit`. New tests in `__tests__/`; prefer pure functions over Firestore-coupled code.
- **Phantom `tsc` errors** clustered in `e2e/` and `lib/utils/expenseImport.ts` after a branch switch: run `npm install` first (AGENTS → *Commands*).
- **Dev/test without production data**: Firebase Emulator Suite (`npm run emulators` + `emulators:seed` + `dev:emulator`), requires a JDK. SETUP.md → Step 6. **The owner's real data for a tour**: `npm run mirror:seed -- <email>` (production read-only → emulators as `mirror@example.com`, nothing on disk) and `npm run mirror:remove` at the end — the account is the standard, the data is re-read every time (WORKFLOW.md § 3).
- **Browser (E2E)**: Playwright, `npm run test:e2e` with the emulators up (needs **Java ≥ 21**); app on :3100 with an isolated build dir. Accounts and fixtures: SETUP.md → Step 7; gotchas: AGENTS.md → *Browser-Driven E2E*.

## Data & Integrations
Firestore client + admin · Yahoo Finance (prices, benchmark history) · Borsa Italiana scraping (Italian bonds, dividends) · Frankfurter (FX) · FRED (`FRED_API_KEY`, series ECBDFR) · Anthropic (`claude-sonnet-5` analysis + assistant, `claude-haiku-4-5` extraction).

## Known Issues (Active)
Only what crosses areas; an area's blind spots — the behaviours that look like bugs and are not — close its `doc/guide/<tema>.md` (§ Per-page blind spots). The demo account's manual setup is in README.md → Known Issues, the shared account's prerequisites in SETUP.md → Step 5b.

- **Two Sonnet generations coexist** (`lib/constants/aiModels.ts`): the Rendimenti analysis runs on `claude-sonnet-4-6`, the assistant and the emails on `claude-sonnet-5`. Aligning them changes cost and output, so it is a product decision still to take; until then the four constants stay distinct and each modal reads its OWN route's.
- **Two deliberate dependency pins keep advisories open.** `firebase-admin` at `^13.6.0` (@14 pulls pure-ESM `jose@6` → `ERR_REQUIRE_ESM` on Vercel; 8 moderate `uuid` advisories stay) and `next` at `~16.2.12` (16.3.0 breaks Vercel at `onBuildComplete`; 2 HIGH libvips advisories via `sharp`, low exposure). **Unpin next and re-run `npm audit fix` once Vercel digests 16.3.x.**
- **Per-page blind spots** — the behaviours that look like bugs and are not — live at the end of each `doc/guide/<page>.md` (one *Per-page blind spots* section per page). Moved there verbatim from this file's Known Issues; CLAUDE.md keeps only the cross-cutting ones.
- **The icon rail's 44px targets are measured at 1440 with a mouse**; no fixture covers a ≥1440px tablet in landscape.

## Key Files
Cross-cutting entry points only: each area's files open its guide (`doc/guide/<tema>.md` § Files), every pure module has
`__tests__/{module}.test.ts`, every page its `e2e/{page}*.spec.ts` where one exists.
- **Shell**: `app/dashboard/layout.tsx` (`<main>` = `page-main`), `app/dashboard/template.tsx`, `components/layout/{Sidebar,BottomNavigation,SecondaryMenuDrawer,SceneLink,PageHeader,PageTabBar,PageTabs,PageContainer,ThemePicker,LogoutDialog}.tsx`, `lib/utils/viewTransition.ts` (the ONE `startViewTransition`, `data-vt` scoping) + `lib/hooks/useSceneNavigation.ts` (the page scene), `lib/utils/themeTransition.ts`, `components/ui/sidebar.tsx` (`SIDEBAR_WIDTH_ICON`), `lib/constants/navigation.ts` (the ONE source of the nav arrays); tile primitives `components/ui/{tile,narrative-text,ranked-rows,tile-grid-skeleton,page-verdict}.tsx`, `lib/utils/narrative.ts` (`Narrative`, `VerdictTone`, `PageVerdictModel`)
- **Shared primitives / utils** (each the single source of its rule): `components/ui/{composition-list,composition-bar,segmented-pill,drill-breadcrumb,chart-hover}.tsx`; `lib/utils/formatters.ts` · `metricColors.ts` (`getMetricValueColor`) · `assetPricing.ts` (`requiresManualPricing`) · `assetLiquidity.ts` · `expenseTypeTransition.ts` · `firestoreData.ts` (`removeUndefinedDeep`) · `dateHelpers.ts` (`endOfMonthBound`, `getItalyDateIso`, `isItalyDayAfter`) · `spendingProjection.ts` (the ONE month-end projection) · `recurrenceDates.ts` (the ONE source on recurrence)
- **E2E**: `playwright.config.ts`, `e2e/*.ts`, `e2e/global-setup.ts`, fixtures `scripts/{seedEmulator.ts,seedPensionE2E,seedAnalisiE2E,seedCoastFireE2E,seedCostCentersE2E}.mts`; scripts `test:e2e`/`e2e:seed*`/`dev:e2e`; the production mirror `scripts/mirrorProdAccount.mts` (`mirror:seed`/`mirror:remove`)


## Design Context
Authoritative aesthetic spec: **DESIGN.md** — hand-maintained, **never regenerate it**; its YAML frontmatter is the normative layer read by the impeccable detector, `.impeccable/design.json` only the extensions sidecar (its narrative is DESIGN.md verbatim — script-check before rewriting it; its `extensions.motion` is read from the CODE). Product truth: **PRODUCT.md**. Rules are cited by name (DESIGN → **The X Rule**) and enforced by `components/ui/{tile,page-verdict,responsive-modal}.tsx`, `statesNarrative.ts` and `printTokens.ts`. A change to a page starts from its `doc/guide/<page>.md` and DESIGN.md's named rules. History: `git log`.
