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
- `tsc` clean; **229 files / 5081 tests** green in `Europe/Rome`, in the machine's zone AND under `TZ=UTC` (since 2026-10-08); **50 Playwright spec files** (189 tests incl. 6 auth setups; last full runs 2026-10-10 on the Mac, closing the first-screen census of PR #448: 189 green twice in 6,5 min, after `e2e/motion.layout.spec.ts` stopped depending on whether the parked session carries the account's colour theme — doc/guide/e2e-emulatori.md). Run Vitest under `TZ=Europe/Rome` too — every date fixture sits at noon, the ones beside midnight are named by the Italian clock.
- Latest (2026-10-10, second session): **the MOB-01 spec retired** (the first-screen census and its budget, PR #448 in develop since 2026-10-10; the manual doc/guide/prima-schermata.md, the fixture `census@example.com`, `doc/mobile/budget.json` and `doc/mobile/README.md` § 3.1 stay). 156 criteria read against the code by a six-reader, three-skeptic workflow: 126 hold; thirteen divergences were the code being right with the lesson at home; **four runtime defects of the scripts fixed on the owner's call** — the Yahoo guard was blind (the census reset the profiles `source` after the warm-up lap, the only call that can answer `yahoo`, and `--tighten` never looked: now a run-level `yahooCalled`, the census exits 1 on the fixture and `tightenRefusal(run, budget)` refuses), an unknown `--surfaces` key or `--viewports` value exits 1 with the valid ones (before: zero surfaces measured in silence, `last-run.json` overwritten), `--tighten` refuses a partial run (before: `budget.json` written, then red on «not measured»), the 50/30/20 switch is in the diagnostics (`spendingRoles`); tests seen red in `__tests__/mobileBudget.test.ts` and the new `mobileCensusOptions.test.ts`; seven text defects fixed (the three test headers now name the falsification seen red, re-run here; `reference/mobile-census.mjs`'s «until then»; a SESSION_NOTES pointer; decision 10 vs 59; MOB-06 «piega» for a pill metric; MOB-03's mirror start value; `ritiro.md`'s moved line numbers); five deferrals written (FIRE › Obiettivi measured OFF in the fixture → decision 60, MOB-07 turns it on in the seed; decision 51 rewritten on the fixture, the «obiettivo» column at 768/1024 → MOB-08 § 2 and § 5; the Tetto KPI overlap at 390 → MOB-04 § 4 and § 7; the `.mjs` why → the census header; the draft's «dev» row → the rule in WORKFLOW.md § Where things are recorded: user-visible changes only). No guided tour F (owner). **The closing measure was redone on the fixed code**: 19 × 3 on the fixture in 2,0 min, `mobile:budget` green on 57, both new refusals seen; `--selftest` green; `perf:budget -- --dist=.next-perf` green on the same build. No app code and no Playwright (dev scripts only; the 189/189 of PR #448 stand). Next: MOB-02 (`doc/mobile/README.md` § 6).

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
- **Patrimonio**: «cosa possiedo, e cosa si è mosso?» — verdict, six tiles, «Mutuo»/«Prestito» per loan (a debt is a `loan` asset worth minus its principal, 2026-10-10), Strumenti. doc/guide/patrimonio.md.
- **Registro operazioni**: BUY/SELL/ADJUSTMENT settled in cents, the asset rebuilt by full replay. doc/guide/registro-operazioni.md.
- **Cashflow › Tracciamento**: «come sta andando il mese?». doc/guide/cashflow-tracciamento.md; shared expense rules (the fee on any row, the instalment that repays a loan, the payoff, the transfer onto a property) in doc/guide/cashflow.md.
- **Cashflow › Budget**: «sto rispettando il budget?». doc/guide/cashflow-budget.md.
- **Centri di Costo** (optional): «quanto sta costando il progetto?». doc/guide/centri-di-costo.md.
- **Cashflow › Divisione** (optional): «quanto è costato in comune, e quanto resta a ciascuno?» — shared income pays first, the shares split the net. doc/guide/cashflow-divisione.md.
- **Analisi**: «dove vanno i soldi, e cosa è cambiato?» — the app's only Sankey, by type or 50/30/20 role. doc/guide/cashflow-analisi.md.
- **Dividendi**: «quanto rendono i miei flussi?» — received and announced never one figure; BTP Italia and BTP€i coupons, the single coupon at maturity (BTP Valore Insieme). doc/guide/cashflow-dividendi.md.
- **Rendimenti**: «quanto rende il portafoglio, e rispetto a cosa?». doc/guide/rendimenti.md.
- **Storico**: «come sono arrivato qui?» — the Driver's ledger adds up to the euro. doc/guide/storico.md.
- **Allocazione**: «sono allineato al piano, e cosa faccio con i prossimi soldi?» — three plans naming the instruments; the Esposizione. doc/guide/allocazione.md.
- **Previdenza**: «il fondo sta lavorando?» per contributor. doc/guide/previdenza.md.
- **FIRE**: Calcolatore, Coast FIRE, What If, Monte Carlo and Obiettivi, one verdict each. doc/guide/fire.md (+ fire-coast, fire-what-if, fire-monte-carlo, fire-obiettivi).
- **Assistente AI**: the verdict IS the context; flag `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`, blocked in demo. doc/guide/assistente.md.
- **Hall of Fame**: «quali sono stati i mesi e gli anni migliori?». doc/guide/hall-of-fame.md.
- **Impostazioni**: six tabs, six controlled views of ONE draft (`useReducer` + `lib/utils/settingsDraft.ts`), one Save per page. doc/guide/impostazioni.md (§ Settings — the FIVE places).
- **States**: loading · nothing recorded · measured zero · failed read, and «old but present» (2026-09-29). doc/guide/stati.md; DESIGN → The Absence-Has-Three-Names Rule.
- **Dialogs and forms**: 40 modals on `ResponsiveModal`. doc/guide/dialog.md; DESIGN → The Modal-Is-A-Tile Rule.
- **Periodic emails · budget email · PDF export**: verdict first, AI comment second. doc/guide/email-pdf.md; DESIGN → The Out-Of-DOM Token Rule.
- **Themes**: twelve theme blocks × nine chart slots. doc/guide/temi.md.

## Testing
- Vitest: `npx vitest run <file>`, `npm test -- <file>`, `npx tsc --noEmit`; new tests in `__tests__/`. Commands and traps: AGENTS.md § Commands.
- **Without production data**: the Firebase Emulator Suite (`npm run emulators` + `emulators:seed` + `dev:emulator`, a JDK) — SETUP.md → Step 6. **The owner's real data for a tour**: `npm run mirror:seed -- <email>` and `npm run mirror:remove` at the end (WORKFLOW.md § 3).
- **Browser (E2E)**: `npm run test:e2e` with the emulators up (Java ≥ 21), app on :3100 — SETUP.md → Step 7; doc/guide/e2e-emulatori.md.
- **Performance**: `npm run perf:budget`, `perf:bench`, `perf:census` — doc/guide/velocita.md (the budget, the benchmark, the census, the baselines and the register of raised ceilings; the fourteen PERF specs of 2026-09-26 were all implemented and retired by 2026-10-08). **Mobile composition**: `doc/mobile/README.md` (MOB-01 done and retired on 2026-10-10, MOB-02..09 open); `npm run mobile:census -- --email=census@example.com` and `npm run mobile:budget` on the same :3200 build (doc/guide/prima-schermata.md).

## Data & Integrations
Firestore client + admin (production in `eur3`; the Vercel functions in `fra1`, held by `__tests__/vercelConfig.test.ts`) · Yahoo Finance · Borsa Italiana scraping · Frankfurter (FX) · FRED (`FRED_API_KEY`, ECBDFR) · Anthropic (the model ids in `lib/constants/aiModels.ts`).

## Known Issues (Active)
Only what crosses areas; an area's blind spots — behaviours that look like bugs and are not — close its `doc/guide/<tema>.md` (§ Per-page blind spots). The demo account's setup is in README.md → Known Issues, the shared account's in SETUP.md → Step 5b.

- **`npm audit` keeps 20 advisories, none critical** (2026-10-08, after Next 16.4 / firebase-admin 14 / `npm audit fix`): all inside `firebase-tools` (the dev-only CLI; its fix is a semver-major downgrade) and `@grpc/grpc-js` under the client `firebase` SDK (fix = `firebase@9`, not an option). Re-read after the next `npm update`; never `npm audit fix --force`.
- **firebase-admin 14 pins the client `firebase` to ≥ 12.19 AND Node to 24** (2026-10-08): both want `@firebase/app` 0.16.2, and any lower `firebase` leaves two copies and kills the build on «Component auth has not been registered yet»; firebase 12.19 is +57 KB gz on every page (`doc/guide/velocita.md` § Registro). A Vercel Function never `require()`s an ESM-only package (`--no-experimental-require-module`, at any Node version): every Admin route was a 500 on the develop deploy of #436 (`ERR_REQUIRE_ESM` on `jose@6` via `jwks-rsa@4`), cured by the `overrides` → `jwks-rsa ^3.2.2` in `package.json`, held by `__tests__/vercelConfig.test.ts` (AGENTS.md § Server Layer).
- **The `PageTabBar` pill stays below 44px on touch below 1440** (38×32, 2026-09-22): MOB-02 § 4.6 owns the fix (`min-h-11 min-w-11`); the `Switch` got its 44×44 target on 2026-10-08.
- **A `ResponsiveModal` opener that never held the focus still leaves it on `body` at close** (2026-10-08): the modal restores the element focused at open, which covers the keyboard and Chrome's click, not Safari's (it does not focus a clicked button) nor a non-focusable row — those hosts pass `returnFocusTo` (doc/guide/dialog.md).

## Key Files
Each area's files open its guide (`doc/guide/<tema>.md` § Files: the shell in shell.md, the E2E harness and seeds in e2e-emulatori.md); every pure module has `__tests__/{module}.test.ts`. Cross-cutting entry points only:
- **Tile primitives**: `components/ui/{tile,tile-method-note,series-legend,narrative-text,ranked-rows,tile-grid-skeleton,page-verdict}.tsx`, `lib/hooks/useRovingFocus.ts` (a list as ONE Tab stop), `lib/utils/narrative.ts` (`Narrative`, `VerdictTone`, `PageVerdictModel`)
- **Shared primitives / utils** (each the single source of its rule): `components/ui/{composition-list,composition-bar,segmented-pill,drill-breadcrumb,chart-hover,lazy-component}.tsx`, `components/ui/charts/recharts.ts` (the ONE door to recharts); `lib/utils/expenseWindows.ts` · `formatters.ts` · `metricColors.ts` (`getMetricValueColor`) · `assetPricing.ts` (`requiresManualPricing`) · `assetLiquidity.ts` · `expenseTypeTransition.ts` · `firestoreData.ts` (`removeUndefinedDeep`) · `dateHelpers.ts` (`endOfMonthBound`, `getItalyDateIso`, `isItalyDayAfter`) · `spendingProjection.ts` · `recurrenceDates.ts` · `cents.ts` (`roundToCents`) · `floatNoise.ts`

## Design Context
Authoritative aesthetic spec: **DESIGN.md** — hand-maintained, **never regenerate it**; its YAML frontmatter is the normative layer read by the impeccable detector, `.impeccable/design.json` only the extensions sidecar (script-check before rewriting it). Product truth: **PRODUCT.md**. Rules are cited by name (DESIGN → **The X Rule**) and enforced by `components/ui/{tile,page-verdict,responsive-modal}.tsx`, `statesNarrative.ts` and `printTokens.ts`. A change to a page starts from its `doc/guide/<page>.md` and DESIGN.md's named rules.
