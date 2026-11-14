# Panoramica

> **Quando aprire questa guida** — chi tocca `app/dashboard/page.tsx`, `app/api/dashboard/overview/route.ts`, `lib/services/dashboardOverviewService.ts`, `lib/hooks/useDashboardOverview.ts`, `components/dashboard/overview/*`, `lib/utils/{overviewNarrative,dashboardOverviewUtils}.ts`. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: § *Files*, sotto.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Overview**: `app/dashboard/page.tsx`, `app/api/dashboard/overview/route.ts`, `lib/services/dashboardOverviewService.ts`, `lib/hooks/useDashboardOverview.ts`, `components/dashboard/overview/*` (`PatrimonioTile` exports `resolveHeroValueClass`, and since 2026-10-11 `isPatrimonioLiftedBlock` + `PATRIMONIO_CURVE_ID_SUFFIX`; `OverviewVerdict` exports `OVERVIEW_VERDICT_ID`), pure `lib/utils/{overviewNarrative,overviewSummary,dashboardOverviewUtils,sparklinePeriod,savingsRateBadge}.ts` (`overviewSummary.ts`, 2026-10-11: the strip, the two cashflow ratios, the rows' ids and asides, `verdictNamesMarket`); `lib/utils/periodSales.ts` (`summarizePeriodSales` = the month's sells from the ledger with the estimated tax, `resolveDeclineCause` = the ONE cause of a falling month for Panoramica, Patrimonio and the email), `lib/utils/marketEffect.ts` (`MonthFlows`, `pensionPaidInAcross`, `debtRepaymentsBetween` — shared with Storico and the email, since 2026-10-14) + `lib/utils/salesNarrative.ts` (the shared words; its `binding` clauses and its unsigned zero are this page's since 2026-10-11, Patrimonio's verdict too since 2026-10-14)
- **Asset principali** (2026-10-17): `rankTopAssets` in `lib/utils/dashboardOverviewUtils.ts` (a property NET of the loans that finance it, `debtNetted`, the mortgage no row of its own; source version 23), the caption `describeNetOfDebtCaption` in `patrimonioNarrative.ts`, the tile `components/dashboard/overview/AssetPrincipaliTile.tsx`; test `__tests__/dashboardOverviewUtils.test.ts`
- **Intestatari** (2026-10-17): the payload's `ownership` (`summarizeOwnership` of `lib/utils/assetOwnership.ts` on the server's assets and `settings.familyMembers`, null when no held asset names a person; source version 22, then 24 the same day when an asset became divisible by QUOTA — `Asset.ownerShares`, lib/utils/assetSlice.ts — and the summary gained `reassign`, read as none on a payload cached before it), the tile `components/dashboard/overview/IntestatariTile.tsx` (its footer in the warning tone with «quote da riassegnare»), the row `OVERVIEW_SECTION_IDS.intestatari` with its aside («quote per persona») and its answer in `overviewSummary.ts`; source version 25 on 2026-10-18, when every group gained its carry figures (`costValue`, `costSharePct`, `costTotal`, `withoutCostBasis` — `costBasisOf` of `patrimonioSummary.ts` injected as `costOf`) for the tile's «Valore | Carico» switch, a payload cached before it offering no switch (`hasCostFigures`); the rule in doc/guide/patrimonio.md § Patrimonio («Intestatari»)
- **Server-Timing**: `lib/server/serverTiming.ts` (`startTiming` → `mark` → `toHeader`, pure, the clock injected) — the route's header since 2026-10-03
- **Browser**: `e2e/overview.mobile.spec.ts` (390, the composition — nine tests) and `e2e/overview.spec.ts` (1440), both on the base account with the overview response patched on the wire by `e2e/overviewFixture.ts`; `e2e/panoramica.snapshot.spec.ts` («Crea snapshot»), `e2e/motion.layout{,.mobile}.spec.ts` (the period switch, the cascade, the pill)
- **Suites to run after a change here — Overview / materialized summary** (moved from `AGENTS.md` § Commands on 2026-09-30): `apiAuthRoutes`, `dashboardOverviewService`, `dashboardOverviewUtils`, `monthFlows`, `serverTiming` · **Verdetto e letture** `overviewNarrative`, `salesNarrative`, `narrative` · **Composizione mobile** `overviewSummary` (with `describeOverviewClosedAnswers`, the landscape index), `verdictStrip`, `mobileSections`, `tabletComposition` · **Badge** `savingsRateBadge` · **A writer of an overview input** (the invalidation it owes, § The materialized summary): `expenseCategoryRewriteInvalidation`, `goalWritesInvalidation`, `dividendIncomeService`, `pensionContributionService`, `settingsRoundTrip`

## Panoramica and Dashboard Data Isolation

- Overview data flows through `GET /api/dashboard/overview` + `useDashboardOverview()` — no page-level fan-out queries and
  no full-history expense queries. `dashboardOverviewSummaries/{userId}` is server-owned: the client never reads it, and
  every overview-relevant mutation invalidates it explicitly. **Both endpoints are owner-scoped.**
- **`DASHBOARD_OVERVIEW_SOURCE_VERSION` invalidates hardcoded `sourceVersion: N` literals in test fixtures too** — grep
  for `sourceVersion:` in tests whenever it changes.
- **Do not import `goalService.ts` from a server-only file** — it top-level-imports the client Firebase SDK. The math
  a server needs lives in `lib/utils/goalMath.ts` and the Admin reads/writes in `lib/server/goalData.ts`.
- **Hero number overflow is a length-driven step-down**, not a container query: `heroValueClass` keys off the formatted
  string's length (>13 chars → `text-[32px] desktop:text-[40px]`). The tile's width does not vary; the string does.
- **The redesign is propagated everywhere** (twenty-three sections, the last on 2026-09-01; the per-section prompt
  file was retired on 2026-09-06). The rules live in DESIGN.md → §5 Page Verdict / Tile / Tile Grid. Patterns a page
  abandoned are marked «superseded» in DESIGN.md, never deleted while another page still uses them.
- **The hero tile is ONE component for two pages**: `components/dashboard/overview/PatrimonioTile.tsx` renders the
  Panoramica's hero and, with `movers`/`countLine`, Patrimonio's — a second hero would drift (the pre-v3 twin did).
  `ComposizioneTile` likewise takes `eyebrow`/`footer`. `resolveHeroValueClass` is the one overflow step-down.
- Count-up lives in `OverviewAnimatedCurrency` leaf nodes, never in the page component.
- **No `layout` on the page root** (2026-10-08): the page sat in a `motion.div layout="position"` since
  2026-04-03 (`git log -S`: «softer reflow of conditional cards», for metric blocks that the Verdict-over-Tiles redesign
  removed on 2026-08-22, leaving the root wrapper alone). The root never moves inside `PageContainer`, so Framer measured
  it after every commit of the page for nothing; it is a plain `div`, and `springLayoutTransition` went with it (the
  same on Patrimonio). The period switch still shifts nothing (`e2e/motion.layout.spec.ts`, `layout-shift` 0 with a
  positive anchor).
- **The tile cascade plays once per session** (owner's call, 2026-10-08, DESIGN.md → Tile Grid): `staggerContainer`
  × 8 tiles + `cardItem` kept the figures semi-transparent ~1 s after the data (962 ms on a load, 944 ms on a client
  navigation, measured on the mirror). A module-level `tileGridEntrance.played` is set once the grid has rendered, and a
  later mount reads it in a `useState` initializer: `initial={false}`, the tiles there at once. A skeleton or a failed
  read does not count as played; a reload starts a new session. Pinned by `e2e/motion.layout.spec.ts` (seen red with the
  cascade forced). Patrimonio, the landing and `AuthShell` keep the shared variants on every opening.
- **The page is a verdict over a tile grid** (`components/dashboard/overview/*`): `Tile` (`components/ui/tile.tsx`,
  re-exported as `OverviewTile`; `NarrativeText` and `RankedRows` likewise live in `components/ui/`) is the ONE shell
  (eyebrow · aside · `reading` narrative · body), grid cells wrap it in `TILE_CELL_CLASS` (`flex min-w-0 [&>section]:flex-1`)
  so a tile stretches to its row and `mt-auto` footers align across tiles. **The DOM order is the reading order on
  every width, no `order-*`** (since 2026-10-11; DESIGN.md → The First-Screen Rule): below
  `desktop:` the grid collapses to 1-2 columns in the DOM's own sequence — Sintesi before Cashflow, as at 1440 — and a
  new tile takes its position in the JSX, with a desktop span and a `SectionSpec` in `OVERVIEW_SECTIONS` (§ Composizione
  mobile); the `order-1…8` of before went that day (`e2e/overview.{mobile.,}spec.ts` hold the grid at zero `order-*`). The page root is `max-w-[1920px]`, wider than `PageContainer`'s 1600: a
  bento uses width, and at 1600 a 27" monitor left a third of the main area empty. **No tile repeats another
  tile's rows** — the Cashflow tile lost its top-3 categories the moment "Spese per categoria" existed.
- **Every sentence on the page is generated by rules in `lib/utils/overviewNarrative.ts`**, never typed in a
  component: `buildOverviewVerdict` (headline + tone + sentence) and the `describe*` tile readings return a
  `Narrative` (segments with `mono`/`sign`) rendered by `NarrativeText`; the verdict itself by `PageVerdict`
  (`components/ui/page-verdict.tsx`, `ariaLabel` names what it judges). The one rule that must never be relaxed:
  **a falling month is blamed on the market only when `marketEffect < 0`** — when the market gained and the total
  still fell, the cause is the user's own flows and the headline says "nonostante il mercato". A missing input drops
  its clause (no prior snapshot → no monthly clause, no income → no savings clause), never a placeholder.
- **And never on the market ALONE when something else weighed more** (2026-09-11). Why: on the real account
  settembre 2026 fell by 4.938 € with the market at −1.079 € — the rest was the capital-gains tax the broker withheld
  on a Vanguard sale (4.092,50 € by the snapshot note), which in regime amministrato leaves the account the day of
  the sale with no cashflow row — and the headline said «il mercato ha pesato». The cause of a falling month is ONE
  decision for three verdicts, `resolveDeclineCause` in `lib/utils/periodSales.ts` (Panoramica, Patrimonio, the
  periodic email): `despite-market` (market ≥ 0) · `taxes-over-market` (the estimated tax on the month's sales ≥ the
  market loss: «il mercato ha pesato, le tasse sulle vendite di più») · `market-and-taxes` («e con lui le tasse sulle
  vendite») · `flows-over-market` (no taxed sale, but Δ − market outweighs the market: «più per le uscite che per il
  mercato») · `market` · `unknown`. The sentence closes on the split, always when both halves exist
  (`describeOwnFlowsSplit`: «Di quel movimento, −1079 € viene dal mercato e −3859 € dai tuoi movimenti», exact by
  construction), then on the sale (`describeSales`: «Hai venduto Vanguard per 39.052 € con una plusvalenza di
  15.726 € e pagato circa 4089 € di tasse» — «pagato», never «pagherai»: the withholding is already gone; «circa»
  because it is ESTIMATED). The words live in `lib/utils/salesNarrative.ts`, SDK-free, shared by the three.
- **`monthSales` is the month's sells from the trade ledger** (`summarizePeriodSales`, payload version 16): each sold
  instrument's ledger is replayed WHOLE (`replayTransactionsWithEffects`, so the realized P&L stands against the PMC
  at the sale), the sells inside the Italian month are summed (proceeds net of fees, realized gain) and the tax is
  `max(gain, 0) × taxRate / 100` — `null` for an instrument with no `taxRate`, and then `null` for the total too
  (a missing input is never printed as «0 € di tasse»); a loss carries no tax; no loss compensation. A ledger that
  fails to replay is counted (`brokenLedgers`) and skipped, a failed read costs the sales clause and never the page.
  The service reads the ledger through `getAssetTransactionsAdmin` (its writes already invalidate the overview).
- **Testing Italian copy: `Intl('it-IT')` puts a no-break space before `€` and leaves four-digit amounts
  ungrouped** (`4120,18 €`, not `4.120,18 €`). `__tests__/overviewNarrative.test.ts` flattens the nbsp through a
  `plain()` helper and writes expectations the way the screen prints them — do not "fix" the formatter.
- **`topMovers` / `marketEffect` are MARKET return, never the user's flows.** `computeTopMovers` sums the per-asset
  price effect `q_prev × (u_curr − u_prev)` from `attributeSelectedChange` (the same split Storico uses) — or, for an
  instrument TRADED in the month, the ledger reading of § *The market counts the month's trades* — and returns `[]` when the previous snapshot has no `byAsset` — a class-value delta cannot tell a purchase from a
  price move, and a digest that calls a cash-for-crypto swap "Liquidità −14.110" is describing trades, not returns.
  `marketEffect` is `null` when not attributable, distinct from a measured `0`. Every class with an effect ≥ 1 € is
  listed, largest first (no top-N cut). **Pension funds are their own "Previdenza" line** (`PENSION_BAND_KEY`, like
  Storico's band — folded into Azioni/Obbligazioni through `composition` their return disappears) and measure
  **`Δvalue − contributions registered since the previous snapshot`** (attributed by `valueEffectMonth`, exported from `pensionReturn.ts` for exactly this), from
  `pensionReturnStartMonth` (or the first recorded contribution) onwards and 0 before — the service reads
  `pensionContributions` only for a holder of a fund, by literal collection name because
  `pensionContributionService` top-level-imports the client SDK. Known blind spot: cash and other price-1 assets never
  show a market effect. **Real estate is measured gross of debt** (`quantity × byAsset.price`, never the net `totalValue`) — on the net value a mortgage
  instalment read as "Immobili +1.036" on the real account with the house worth exactly the same.
- **An in-flow `<svg>` with `height: 100%` inside an auto-height flex box resolves its height from its own
  viewBox ratio** (width × H/W — hundreds of pixels), which is what made the hero sparkline explode the grid row.
  Stretch a `preserveAspectRatio="none"` chart by positioning the SVG `absolute inset-0` inside a `relative flex-1
  min-h-[…]` box, never with `h-full` alone. **`PeriodSelector` has no intrinsic width** (`flex-1` buttons): in a flex
  row give its wrapper an explicit width or the labels collapse into one word.
- **`PageHeader variant="compact"`** collapses the desktop header to one line (eyebrow · title · description) for
  pages whose real headline is in the content; the mobile sticky navbar is unchanged. Since 2026-09-29 that line
  also carries the page's freshness reading («Aggiornato alle 08:00, sto rileggendo…») while a payload restored from
  the persisted cache is being reread: on the overview's OWN minute (`DASHBOARD_OVERVIEW_STALE_TIME_MS`), and dated
  by the older of the read and the payload's `freshness.updatedAt` — a materialised summary can be hours older than
  the request that fetched it, and the reader is told that age, not the request's (doc/guide/stati.md § The fourth
  reading).
- **`SavingsRateBadge` is once per calendar month per account**, recorded in localStorage through
  `celebrationUtils` under `savings_rate_{ownerId}_{YYYY-MM}` — a sessionStorage flag dies with every new window and
  re-greets the user on every login. The decision is pure (`lib/utils/savingsRateBadge.ts`); the effect defers its
  `setVisible` with `setTimeout(…, 0)` (react-hooks/set-state-in-effect). **`reducedMotion` is NOT part of that
  decision** (removed 2026-09-01): it used to suppress the badge outright, so a reader who asked the OS for stillness
  was never told their savings rate. It governs the entrance transition only, in the component.
- **`useCountUp` is a state machine, settled during render** (2026-09-06, `lib/utils/useCountUp.ts`): every jump branch
  (null, the once-latch, a zero target, reduced motion, start = target) is decided by the pure `settleTarget()` and only
  the rAF ticks write. Two readings changed, neither a bug: the first frame shows the start value instead of `null`, and
  a `null` target hides the stale number on the same render. A tick queued before a newer target's cleanup is dropped
  by the writer's own guard.

## The materialized summary — one round, written after, fresh for the day (2026-10-03)

- **A recompute is ONE round of reads** (`readOverviewInputs` in `dashboardOverviewService.ts`): assets, snapshots,
  settings and goals in a `Promise.all` — any of them failing rejects the route, as always — launched TOGETHER with an
  `allSettled` of the pension contributions, the trade ledger and the two months of expenses. Never in series: with
  the functions and Firestore an ocean apart each stage is ~100 ms. The contributions are read speculatively (an empty
  query for an account without a fund), but a failed read REJECTS for a holder of a fund, as before (owner's call):
  degrading to «no contributions» would print every euro paid in as the fund's market return — a wrong figure, not a
  missing clause. The ledger degrades to «no sales clause», the expenses to `expenseStats: null`, each with its warn.
  Pinned by `__tests__/dashboardOverviewService.test.ts` → *one round of reads…* (a held `assets` read with the six
  others already in flight).
- **The summary is written AFTER the response** (`after()` of `next/server`, which keeps the function alive until the
  write settles) and only if nothing touched the document since the read that found it stale: `update(…, {
  lastUpdateTime })` on an existing document, `create` on a missing one. Firestore refuses the write (codes 9 and 6,
  logged as `info`) when an invalidation landed during the recompute — with a summary fresh for the day, a plain `set`
  with `invalidatedAt: null` would erase that mutation for hours (the 5-minute TTL used to hide it). Verified on the
  emulator on 2026-10-03: read → invalidation → stale `update` refused, the invalidation kept, the same write with the
  current `updateTime` accepted.
- **Fresh = same Italian day, at most 6 h, never after an invalidation** (`isSummaryStale(summary, now)`;
  `DASHBOARD_OVERVIEW_SUMMARY_TTL_MS` = 6 h). The DAY test is the one nothing else can replace: the payload reads
  «today» (the current and previous month, the month-end projection, what is still scheduled) and nothing writes at
  midnight — computed at 23:50, it is yesterday's at 00:10 (the test of that case went red with the day test removed).
  The 6 h are the safety net for an input no invalidation sees; the daily snapshot cron (18:00 UTC) invalidates every
  account anyway.
- **The rule that makes the day-long freshness true: every write to an input of the payload invalidates the summary**
  — assets, snapshots, the five settings fields the payload reads (`settingsAffectDashboardOverview`, a checklist
  comment in `assetAllocationService.ts`), `goalBasedInvesting`, pension contributions, the trade ledger and the
  expense rows (name, type, amount, date, category). On 2026-10-03 a grep of every writer found five that did not,
  all fixed that day: the category cascades of `expenseService` (rename, type change, reassign, clear, move — the
  subcategory reassign alone stays out, the payload never reads it), a dividend income row NOT credited to an account
  (create, edit, delete), the two goal writers (`saveGoalData`, `appendInvestmentGoal`), the settings predicate (3 of
  the 5 fields: it held only because Impostazioni always sends the stamp duty) and the pension contribution record
  (invalidated before the record existed). A new writer of an input owes its invalidation in the same commit.
- **The request time is ONE `now`, from the freshness test to the payload** (2026-10-03): `getDashboardOverview`
  takes it and hands it to the readers, the expense stats and `buildLiveOverviewPayload` — a function of the recompute
  never reads its own clock, or a request across a month's midnight builds half its payload on each month. Pinned by
  `__tests__/dashboardOverviewService.test.ts` → *reads the current month from the request time…*, which asserts on
  the ARGUMENT of `getItalyMonthYear`: that file mocks it to April, so an assertion on the payload stays green with
  the defect in.
- **`Server-Timing`**: `auth;dur, db;dur, compute;dur, total;dur, source;desc=materialized|recompute`. `db` sums the
  summary read and the round of reads; `total` runs from the handler's first line to the header, so the auth and the
  tiny rest are inside it; the write after the response is in none of them. In production: DevTools → Network → the
  `overview` request → Timing → *Server Timing*. On the emulator (2026-10-03, the mirror, dev server): a recompute
  `db` ~45 ms, `compute` ~2, `total` ~50; a materialized read `total` ~7. The route's wall time in recompute went from
  a median of 105/97 ms to 58/57 ms with the payload identical to the byte. The functions run in `fra1` since 2026-10-04 (`vercel.json` → `regions`, SETUP.md § Function region); no production reading was taken (owner, 2026-10-04).

## The critique of 2026-09-13 — what changed and why

- **Every subject the driver clause can name is in `CLASS_SUBJECTS`, the pension band included** (`overviewNarrative.ts`).
  The market digest lists the pension funds as their own line (`PENSION_BAND_KEY`), so the top mover can be that key —
  on the real account it was, and the verdict printed «e pension hanno fatto il grosso del lavoro». A key the map does
  not know DROPS the clause (the Narrative Honesty Rule), never prints the key with a guessed verb; the test walks
  `ASSET_CLASS_SEQUENCE ∪ {PENSION_BAND_KEY}`. The Cashflow tile's «Ad agosto» / «come ad agosto» come from
  `atPreviousMonth` in the same module — no component types a preposition.
- **The tax on a sale is named in the HEADLINE when it explains the drop** (owner's call): `resolveDeclineCause` has a
  seventh cause, `taxes-despite-market` — the market gained and the estimated tax is at least half of the whole drop
  (`Δ = market + own flows`, so a caller without the own-flows half, the email, cannot reach it) — and
  `declineHeadlineTail(cause, sales)` prints «per le tasse sulla vendita di VWCE, non per il mercato.» (the instrument
  when the period sold exactly one). The sentence then puts the sale right after the variation, before the savings
  rate, and drops the market-vs-flows split the headline made redundant; Patrimonio's verdict follows the same rule.
  Tone stays `warning`: the market did not lose.
- **A category row is a button that opens its Scheda on Analisi** (`/dashboard/analisi?focusType&focusCat`, the three
  flat params the Scheda writes itself). The type travels in the payload — `DashboardOverviewCategoryAmount.expenseType`,
  source version 17 — because a category has ONE type and the deep link needs it; a row from an older payload stays a
  row. The two category tiles read the concentration through `rankingFromOverview` → `describeCategoryShare` (the
  words Tracciamento uses), and close on «Tutte le categorie in Analisi.»; Composizione closes on «Il piano in
  Allocazione.» — the Panoramica links to the page that owns the depth and has no «Dettaglio» of its own (owner's call).
- **The sparkline period is the shared `SegmentedPill`, `semantics="radio"`** (`PeriodSelector.tsx`): it picks a value
  the chart reads, so no tablist; roving tabindex, 14px labels, 44px of height under `desktop:`. The primitive's
  inactive label is `text-foreground/70` since the same day — `text-muted-foreground` on `bg-muted` measured 4,34:1.
- **`RankedRows`' label column is a share of the row (42%, floored), the bar takes the rest** (`components/ui/ranked-rows.tsx`):
  a fixed 92px column cut «Stipendio Giuseppe» to «Stipendio Giu…» at every width while the bar grew to 210px, and
  the rows of one list must share one track. The third desktop row is 4 · 4 · 4: at 3 columns the income tile could
  not hold a label, a 40px bar and two figures. Costi's «Pesano di più» follows the figures (`mt-4`), not the tile's
  bottom: pinned, it left ~110px of nothing whenever a taller tile shared the row.
- **The light chart palette holds the dark hue bands** — doc/guide/temi.md § The default theme's light slots hold the dark hue bands.

## A month the tax kept flat (2026-09-19)

- **A month that did NOT fall can still be the tax's story** (owner's call): `resolveTaxedGrowth` in
  `lib/utils/periodSales.ts` — tax ≥ Δ (the tax took at least half of the gross growth Δ + tax) → `flat` below
  `FLAT_PERIOD_PCT` (0,5%) or `eroded` above, and `taxedGrowthHeadline` prints «Settembre è in pari: le tasse sulla
  vendita di VWCE si sono prese la crescita.» / «… cresce, ma … più di metà della crescita.» Tone `warning`. It needs only
  Δ and the tax, so the email reaches it too; on Patrimonio it outranks the «massimo storico» headline. The sale then
  leads the sentence (`taxIsTheStory`), exactly like `taxes-despite-market`.
- **A taxed sale carries the split itself**: `describeSales(sales, split)` closes on «: senza, il mese avrebbe fatto
  +4213 € (…)», the parts of § *The market counts the month's trades* summing to Δ + tax, and `describeMonthSplit` is
  printed only when there is no tax to take out. The email keeps its own three-part split and calls `describeSales`
  without the counterfactual. A taxed sale carries the split itself («senza, il mese avrebbe fatto …»), replacing
  `describeOwnFlowsSplit` (the two-part split of 2026-09-11 above, no longer in the code).
- **`monthSales.purchases`** (source version 18): every BUY of the month on any instrument, fees included, migration
  baselines excluded, `null` when none — «Nello stesso mese hai comprato 6 strumenti per 34.304 €» (`describePurchases`).
  A fact beside the sale, never «con la vendita hai comprato»: the ledger cannot tell which money paid.
- **The driver clause names the MARKET's mover**: «sul mercato hanno spinto soprattutto le criptovalute (+726 €)»
  (Patrimonio, since 2026-10-14 a sentence of its own: «Sul mercato ha spinto soprattutto WBIT (+726 €).»). «Hanno fatto il grosso del lavoro» read as the month's cause
  and credited +726 € to a month of +124 €.

## The market counts the month's trades (2026-09-19)

- **An instrument with a BUY/SELL after the previous snapshot's month reads its market from the ledger**
  (`tradeAwarePriceEffect` in `lib/utils/dashboardOverviewUtils.ts`, fed `monthTrades` by the service's
  `tradesAfterSnapshot`, source version 19): `Δvalue − net money in − unexplained quantity × today's unit value`, with
  money in = Σ buys (q × priceEur + fees) − Σ sells (q × priceEur − fees). A held quote gives the old `q_prev × Δu`, a
  bought one `q × (u_now − p) − fees`, a sold one `q × (p − u_prev) − fees`, and a position closed in the month is
  still measured. Why: `q_prev × Δu` gave 0 to the quotes bought in the month, and on the real account settembre 2026
  parked +537,88 € in «dai tuoi movimenti», which the owner read as income − expenses. Pinned by
  `__tests__/dashboardOverviewUtils.test.ts` → *the month's trades, read from the ledger*.
- **A quantity no BUY/SELL explains stays OUT of the market**: a migration baseline written in the month, an adjustment,
  a quantity typed by hand move no money the ledger knows, so they are valued at today's price and land in «altre
  variazioni». Pension funds and hand-valued property keep their own rules. A failed ledger read leaves the digest on
  `q_prev × Δu` (a warn in the log, the sales clause gone).
- **The month's split is market · savings · the rest**: `describeMonthSplit` / `monthSplitParts` in
  `lib/utils/salesNarrative.ts` — «Di quel movimento: +3980 € dal mercato, +1180 € risparmiati, −1040 € di altre
  variazioni.», the same three parts inside the taxed sale's counterfactual. «Risparmiati» is income − expenses ALREADY
  happened (negative: «spesi oltre le entrate»); «altre variazioni» is the exact residual (interest, balances corrected
  by hand, hand-valued holdings, expenses not recorded), said only when MATERIAL — `isMaterialOtherChange`: at least
  max(100 €, 5% of the change being split) (owner, 2026-09-19). Below that it is timing, not a cause: settembre 2026's
  +150 € was card spending not yet debited (a credit card leaves the account the month after its rows), a debt balance
  corrected by hand and 3,64 € between the estimated and the withheld tax — so the two named parts may not add up to
  the total by a few euro. Without the cashflow the second part says what it holds: «tra risparmio e altre variazioni». Patrimonio takes the same `savings` from the same payload.
  The split reads «dal mercato · risparmiati · di altre variazioni» on the savings already happened, the last only
  when material (`isMaterialOtherChange`: max(100 €, 5% of the change) — below it is card-debit timing, not a cause;
  shared with Storico).
- **The user's money outside the cashflow has its own name** (owner, 2026-10-14): the payload's `monthFlows`
  (`computeMonthFlows`, source version 21) carries the pension contributions since the previous snapshot — the same
  ones the market takes out of a fund — and the principal repaid PER DEBT, by the name of its asset, and the split
  names them between the savings and the residual: «+2100 € dal mercato, −1500 € spesi oltre le entrate, +300 € di
  debito rimborsato (Mutuo), +1800 € versati nel fondo pensione», two debts as «+450 € di debito rimborsato (Mutuo
  +300 €, Prestito auto +150 €)», a debt that went up «di nuovo debito». Both are flows: signed, never coloured. Why:
  on the real account ottobre 2026 read «+1792 € di altre variazioni», which were exactly the month's TFR, employer and
  voluntary contributions, and looked like an error. The rules are Storico's Driver's (`pensionPaidInAcross`,
  `debtRepaymentsBetween` in `lib/utils/marketEffect.ts`), measured against the LIVE portfolio like the market; a
  property's legacy debt is credited to the loan that finances it (`financedAssetId`), so the migration month of
  2026-10-10 reads one debt that crossed from the house to its loan (0 on the real account), not −X and +X.
  Patrimonio's verdict and the periodic email name the same two parts (doc/guide/email-pdf.md). Pinned by
  `__tests__/{monthFlows,salesNarrative,overviewNarrative,patrimonioNarrative}.test.ts`.
- **The verdict's savings rate is what has already happened** (owner's call): `resolveLivedCashflow` in
  `overviewNarrative.ts` subtracts `expensesScheduled` and the new `incomeScheduled` — Tracciamento's `settleTotals` —
  and names the calendar beside it: «Hai messo da parte il 45% delle entrate finora (altri 1297 € di spese in
  calendario)». The old rate counted rows dated after today (17% against 45% already saved, the same day). A payload
  without `incomeScheduled` gets no lived reading (`null`), never half a subtraction.
- **Below the savings floor the lived part speaks in euros** (2026-11-12, `readSavings`, AGENTS.md § Shared Constants):
  a deficit so far reads as a signed saving — «Finora hai messo da parte −497 €: le spese superano le entrate» — and
  spending without income as «Nessuna entrata finora, 500 € di spese»; then, when the calendar holds rows, how it
  closes the month: «; con il calendario (2600 € di entrate) il mese chiude all'81%» (`describeCalendarClosing`, the
  article from the figure as printed — The Comma Rule —, or «chiude a −X €» below the floor). The headline's
  «spese oltre le entrate» reads `spendingExceedsIncome` (the deficit, not `savingsRate < 0`); the Cashflow tile's
  reading `describeCashflow(readSavings(…))` says «Speso più di quanto è entrato.» for a deficit and nothing without
  income; its caption prints «— · 0,01×» below the floor. **Every «messo da parte» takes its article from the figure as
  printed** (The Comma Rule, `savedArticle`, 2026-11-14 — «il 81%» until then): «l'81% delle entrate finora», «Messo da
  parte l'8%», «il» before a negative rate («il −12%»). The Assistente keeps the Panoramica's sentence for its
  no-context verdict (`__tests__/assistantNarrative.test.ts`). Pinned by `__tests__/{overviewNarrative,overviewSummary,cashflowTile}.test.ts(x)`
  and the «savings floor» test of `e2e/overview.spec.ts`.

## Composizione mobile

The second page composed for a small screen (2026-10-11, PR #452; its spec, retired the same day, is in `git log -- doc/mobile/`; the primitives and the sample page are Hall of Fame's, doc/guide/hall-of-fame.md § Composizione mobile): below `desktop:` the page is composed, at 1440 it is the page above with three declared additions. The rules are DESIGN.md's (§ 5 → Small-Screen Composition: The First-Screen, Lifted-Figure, Closed-Row and Binding-Clause Rules); here is what this page does with them.

- **THE tile**: Patrimonio (`PatrimonioTile`, id `panoramica-patrimonio` = `OVERVIEW_PATRIMONIO_ID`), right after the verdict in the DOM and open at every width, never a row (THE tile stays outside the sections controller, DESIGN.md → The First-Screen Rule: it is not in `OVERVIEW_SECTIONS`); what it hides below `desktop:` is under Lifted blocks.
- **The first closed row ends UNDER the pill at 390** (owner, 2026-10-11: THE tile with no curve left to yield, the first closed row under the pill is recorded `false` with a `raisedBy` — DESIGN.md → The First-Screen Rule; the register in doc/guide/prima-schermata-misure.md): on the budget's fixture the pill starts at 767, the verdict is 198px (the strip on two rows), THE tile 442px (hero 66, the «Andamento» row with the 44px picker 74, the curve 120, the labels 15, the count line 48), «Il resto» 44, and Sintesi ends at 879. Neither the curve (120px is the floor it yields to, The First-Screen Rule) nor the labels (−38px at most) could close the gap: `perf/mobile-budget.json` registers `firstClosedRowAbovePill: false` at 390 with its `raisedBy`; `e2e/overview.mobile.spec.ts` holds what is true — the title, the verdict and the period picker above the pill, the first row after THE tile.
- **The strip** (`selectOverviewStrip(overview)`, `lib/utils/overviewSummary.ts`): «Questo mese» → `variations.monthly.value`, two decimals, opens «Il perché»; «Da inizio anno» → `variations.yearly.percentage`, two decimals, opens THE tile — the tile never closes, so the cell sets the curve on `'YTD'`, scrolls to `#panoramica-patrimonio-andamento` after the commit (the tile itself without a curve) and lands the focus on the checked period (`PeriodSelector` untouched); «Messo da parte finora» → the verdict's rate (`resolveLivedCashflow`, else the whole month), `Math.round`ed once as the sentence rounds it (2026-10-10: −12,5 is «−12%» in both, `Intl` alone would say −13) — or, below the savings floor with a lived reading, the deficit as `signed-currency` («−497 €», the sentence's figure, 2026-11-12), and the reason «spese oltre le entrate» without one (`savedSoFarFigure`) —, opens the Cashflow row, which keeps the WHOLE month beside it. Every cell carries `decimals`, so a cell prints EXACTLY what the sentence prints (`__tests__/overviewSummary.test.ts` holds the identity); a `null` prints its reason («nessuno snapshot prima di questo mese», «nessuno snapshot da cui contare l'anno», «nessuna entrata finora» with a lived reading, «nessuna entrata nel mese» without); all three `null` → no strip. **«Questo mese» is a wide cell on any four-digit variation** («+3000,00 €» is ten characters, and a cell longer than nine takes a strip row of its own: DESIGN.md → Page Verdict): the strip takes two rows, 103px on the fixture — the first proof of `WIDE_CELL_CHARS`; a `null` cell's reason («nessuno snapshot prima di questo mese») is a wide cell by the same rule. The cells announce what they open from the controller's `eyebrows`, the page adding «l'andamento da inizio anno» and «il perché» for the two cells that open no row.
- **Lifted blocks** (THE tile hides what the strip prints — The Lifted-Figure Rule; `PatrimonioTile.liftedFigures`, `PatrimonioLiftedBlock = 'monthly' | 'yearly' | 'movers' | 'curve-end'`, `LIFTED_FIGURE_CLASS` = hidden below `desktop:`, the tablet included since 2026-10-16): the month's chip whole (its euro is the cell, its percentage is in «Il perché»), the year's chip whole — **and the year's euro, which nothing else prints, enters the sentence in brackets after the year's percentage** («+15,00% da inizio anno (+25.000,00 €)», The Lifted-Figure Rule; at 1440 a declared addition) —, the curve's right-hand label (the hero in compact form), and the «Mercato:» digest only when `verdictNamesMarket(input)` is true, i.e. the sentence names the market in words («dal mercato», the class that pushed most); when it does not (a sale with a net loss and a tax above zero skips the split and the counterfactual, and without a driver clause nothing says «mercato») the digest stays. «Massimo storico» stays; the hero is exempt (THE tile's hero is never lifted: The Lifted-Figure Rule); the chips' row hides whole when every chip in it is lifted. Below `desktop:` the curve yields to 120px (`max-desktop:min-h-[120px]`): the curve shortens, never the reading (The First-Screen Rule). The landing passes no `liftedFigures` and keeps every block; Patrimonio lifts its own with the same names since 2026-10-14 (doc/guide/patrimonio.md § Composizione mobile).
- **The rows and their aside, in DOM order** (`OVERVIEW_SECTIONS` in the page, ids `OVERVIEW_SECTION_IDS` — `panoramica-{sintesi,cashflow,composizione,costi,obiettivo,spese,entrate,asset}`; the page hands the controller the rows PRESENT through `resolveOverviewSections`, memoized on the three flags, since Costi, Obiettivo and the two category tiles come and go with the payload): Sintesi «cosa è liquidabile» · Cashflow «entrate, spese e fine mese» / «nessun dato questo mese» · Composizione «per asset class» / «nessun asset» · Costi «stima annua» · Obiettivi «in corso» / «raggiunto» · Spese «le prime del mese» / «nessuna spesa questo mese» · Entrate the same / «nessuna entrata questo mese» · Asset principali «valore, peso, rendimento» / «nessun asset in portafoglio» · Intestatari «quote per persona» (since 2026-10-17, a full row after Asset principali, present only when the payload's `ownership` is not null — a held asset names a household member; its landscape answer the largest owner's printed share, «Marco 54%») (`describeOverviewAsides`, words only). All closed on a first visit (`defaultOpen` empty), no row ever `failed` (one payload: a failed read is the page's `ErrorNotice`, no row and no announcement). `TILE_ROW_CELL_CLASS` on their cells; `PageRest` right after THE tile's cell.
- **`binding` clauses and the `scope`** (title only, the headline-only cut of The Binding-Clause Rule, declared): the first sentence would restate the strip's euro of the month and percentage of the year, so `buildOverviewVerdict` sets `leadLength: 0` and the whole sentence is «Il perché · {restLabel}» — `overviewRestLabel`: always «il patrimonio», then «il risparmio» (the savings clause), «il mercato» (the driver or the month's split), «la vendita» (a sale clause past the cut), closed by «del mese». **With `taxIsTheStory`** (the headline names the tax on a sale: `taxes-despite-market`, or a growth the tax took) **the cut goes AFTER the sale clause, purchases included** (2026-10-10): title, first sentence and the tax on the first screen, savings and market behind «Il perché». **In every other taxed month the paragraph is whole on the phone**: the tax figure «pagato (circa) N € di tasse» and the counterfactual «senza, il mese avrebbe fatto…» are `binding` segments of `describeSales` (even at zero tax; proceeds, gain, a loss and a missing rate are not), and a binding segment past the cut makes `splitVerdict` cancel it (The Binding-Clause Rule) — no «Il perché», and the «Questo mese» cell puts the focus on the verdict's box (`OVERVIEW_VERDICT_ID`, `tabIndex={-1}`) instead. The Assistente renders the same verdict model through `PageVerdict` directly (`AssistantPageClient.tsx`), without `restCollapse`: whole. No `scope`: `OverviewVerdict` passes none.
- **The calendar is a caption at every width** (The Scheduled-Is-Not-Spent Rule, DESIGN.md → The Binding-Clause Rule): the verdict's clause («altri 350 € di spese in calendario») stays with the rate behind «Il perché», and every figure that CONTAINS the calendar declares it under itself — Entrate and Spese of the Cashflow tile (`describeScheduledCaption`: «di cui 350 € già in calendario, entro il 30», the words of `scheduledSentence`, a caption without a verb; nothing under one euro), «Risparmio» (`describeScheduledNetCaption`: «di cui 350 € di spese e 2456 € di entrate già in calendario, entro il 30», or one side), the two category tiles under their reading (`scheduledCaption`, their aside's total holds `expensesScheduled`/`incomeScheduled`). The landing has nothing scheduled and shows no caption.
- **The zero is unsigned** (a figure that prints as zero takes no sign and no sign colour: AGENTS.md § Layout and Color Tokens): `signedCurrency`/`signedPercent` print «0,00 €» and «0,00%» without sign or colour, and «−0,004» is a zero as printed (`isPrintedZero`, the strip's rule, exported from `lib/utils/verdictStrip.ts`); a negative savings rate takes the typographic minus («il −12%»). Both at 1440 too. The shared `salesNarrative` follows the same rule since the retirement of 2026-10-11 (`signedCompactEuro`: «0 € risparmiati», the word after the printed sign — it printed «+0 €» until then).
- **Absences**: one payload, one state for the whole page (`resolveSurfaceState` in `app/dashboard/page.tsx`). Loading is `TileGridSkeleton` under the header; a failed read is the page's `ErrorNotice` with its retry (no `collapse`), and no strip, no rows, no `PageRest`, no announcement. Nothing recorded has no page state of its own: the rows say it in their asides («nessun asset», «nessun dato questo mese», «nessuna spesa questo mese»), and Costi, Obiettivi and the two category rows are absent when the payload has nothing for them (`resolveOverviewSections`).
- **The skeleton is the 1440 grid, the composition is not** (declared in the retirement of 2026-10-11): while the payload loads the page shows `TileGridSkeleton` with its eight cells at every width, so below `desktop:` the first paint JUMPS from eight grey tiles to the title, the strip, THE tile and the closed rows when the data lands — a declared jump, not a defect; the cached payload (doc/guide/cache-persistita.md) makes it a first-visit-only sight.
- **The memory**: `mobile-sections:panoramica` (`useMobileSections({ route: 'panoramica' })`; per device and browser, not per account); absent or unreadable → the page's defaults, every row closed (`defaultOpen` empty). «Il perché» is remembered as the row `perche`; «Apri tutte»/«Chiudi tutte» never touch it.
- **768 and the landscape stage** (since 2026-10-16; `lib/utils/tabletComposition.ts`, `useTabletComposition` + `useTabletStage`; DESIGN.md → The First-Screen and Closed-Row Rules, doc/guide/shell.md § The landscape stage — the tablet's spec, retired on 2026-10-16, is in `git log -- doc/mobile/`): at 768 two columns — Patrimonio on both, «Il resto della pagina» on a row of its own, the rows two by two in DOM order, an open row and a closed one left alone on its row (Asset principali, the seventh) on the whole grid row. **On a tablet in landscape** (a content box ≥ 880px below 1440: 936 at 1024×768 beside the icon rail) the page is a STAGE: on the left the short verdict (title, «Il perché», the strip on one row) and Patrimonio under it, 16px apart, both sticky while the page scrolls when the left stack fits the screen, Patrimonio reaching the fold and its curve growing to fill it; on the right the 360px INDEX, ONE card with «Il resto della pagina» and the eight rows flat under hairlines, each opening in place, at least as tall as the left stack (the two cards start and end on one line). From 768 the strip's three cells share one row.
- **The closed rows answer in the index** (DESIGN.md → The Closed-Row Rule, landscape only, since 2026-10-16; `describeOverviewClosedAnswers(overview, calendar)` in `overviewSummary.ts`, through `RowAnswers`; a `null` keeps the row's aside, and below landscape every row keeps it):
  - Sintesi: «liquidabile {%}» (one decimal, the typographic minus below zero); null with a total ≤ 0.
  - Cashflow: «a fine mese ~{€ compact}» (`projectCashflowMonthEnd` — never the savings rate, the strip's); null without `expenseStats`.
  - Composizione: «{class} {%}» (`describeLeadingClass`); null with no class or a zero share.
  - Costi: «costo annuo {€ compact}», only with TER or stamp-duty tracking.
  - Obiettivi: «{first goal} {%}» (rounded).
  - Spese / Entrate: the first category «Auto 29%»; «tutto in {cat}» / «tutto da {cat}» with one category, «quasi tutto in/da {cat}» when the first rounds to 100 beside others; null without `expenseStats` or rows.
  - Asset principali: «{asset} {%}» (one decimal); null when its weight is the figure Composizione prints.
- **The specs**: `e2e/overview.tablet.spec.ts` (projects `tablet` and `tablet-landscape`: two columns at 768 and the stage in landscape with the first closed row above the fold, no half grid row at 768, an opened row in place, the icon rail in landscape and the pill at 768, every row open with the left stack still and never overlapped, the header's thumb targets, a rotation, 1440 unchanged). `e2e/overview.mobile.spec.ts` (nine tests at 390 on the base account with the overview response patched on the wire — `e2e/overviewFixture.ts`, round invented figures, nothing written: the first screen, the three cells and what each opens, the tax on the first screen with and without «Il perché», the memory across a reload, the DOM order with zero `order-*` and «Il resto della pagina» held between THE tile and Sintesi (added in the retirement of 2026-10-11), the overflow guard, the six-figure wide cell), `e2e/overview.spec.ts` (1440: no trigger, no strip, no «Il perché», the chips and the digest, one `<p>` with the year's euro, the captions, the unsigned zero). `__tests__/overviewSummary.test.ts` holds the strip (`selectOverviewStrip`), `verdictNamesMarket`, the asides and the landscape answers.

## Per-page blind spots

- **`SavingsRateBadge` covers the pill and the strip's cells at 390 while it shows** (`fixed bottom-4 left-4 z-50`; owner, 2026-10-11): from the 5th of the month, once per calendar month per account, when last month's savings rate was ≥ 30%, for 3 s (`AUTO_DISMISS_MS`). Transient and rare by design, left as is; the budget's fixture keeps last month's rate under 30% on purpose, and `e2e/overview.mobile.spec.ts` reads the badge at 0 before its taps.
- **The YTD curve starts in January, the year's percentage counts from December** (`filterSparklineByPeriod`): the curve's left label is not the base of «Da inizio anno»; in January the YTD window falls back to the last two points, so the month's and the year's cells can carry the same percentage, correctly.
- **`expenseStats: null` is a month with no rows OR a failed read of the expenses**: the payload cannot tell them apart (the service degrades the expenses to `null` with a warn), so the Cashflow row stays closed with «nessun dato questo mese» in both cases; telling them apart is a new field of the payload, which no spec of the series schedules (2026-10-11).
- **«Asset principali» lists a property NET of its mortgage** (owner, 2026-10-17, `rankTopAssets`): the house printed 130.000 € at 43,6% of a net total while the mortgage, a negative row, never reached the top five. Now the row is the house minus the loans that finance it, captioned «netto del mutuo di 95.000 €», the weight on the net worth, and the mortgage is no row (it would count twice); a personal loan keeps its negative value and never reaches the top; the return stays on the gross value (the mortgage is no cost of the house). The other per-asset lists — Patrimonio › Strumenti, Storico › Valore per strumento, the PDF — keep the house GROSS beside the loan as its own negative row, so their columns add up (the owner's choice: net with a caption here, gross with the loan row where the list is a ledger).
- **Three writers still do not invalidate the summary** (2026-10-03, judged minor and left): `migrateAssetLedger`
  (once per account, its baseline BUYs move the month's market split), the coupon cleanup of `dividendService`
  (`deleteUpcomingCoupons` / `deleteFinalPremium`, which matters only for a coupon dated today) and the dummy data
  behind `NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS`. Each can leave the Panoramica on the old figure until the next
  invalidation, the next Italian day, six hours or the evening cron — whichever comes first. So can a client
  invalidation whose POST fails: it is best-effort by design (`dashboardOverviewInvalidation.ts`).
- **The first opening of each day recomputes** — by design: the payload is the day's.

- **The Cashflow tile keeps the WHOLE month** («Messo da parte il 17%», calendar included) beside the verdict's «45%
  finora» — and, since 2026-10-11, beside the strip's «Messo da parte finora», which is the verdict's figure:
  the tile shows the month's three figures and its projection, the verdict and the cell judge the days lived, and the
  calendar's caption under the figures says why the two differ. Seen by the owner on the mirror (2026-09-19) and left as is.
- **The email's «mercato» is still a residual** (`Δ − risparmio + tasse − versamenti al fondo − debito rimborsato`): it
  holds the month's traded quotes, as the page now does, but also the page's «altre variazioni».

- **The sale clause moves before the savings clause only when the headline names the tax**; on every other falling month
  the sentence keeps its order (variation · savings and driver · split · sale).
- **A category row is not a link until the overview summary is recomputed** (payload version 17): the server-owned
  `dashboardOverviewSummaries/{userId}` is rebuilt on the first read after the bump, so a stale tab may show plain rows
  once.
- **The sparkline's stroke is the SIGN of the window** (`NetWorthSparkline`: positive/destructive), not a chart slot: a
  window that ends lower than it started draws red in both modes, by design.
- **«Crea snapshot» is 44px tall below `desktop:` and 36px from it** (since 2026-10-16); its overwrite confirm is a `ResponsiveModal` `sm` since 2026-09-18
  (`describeSnapshotOverwrite`: the title names the act and the month, the reading says the month's note survives —
  a fact of `SNAPSHOT_USER_AUTHORED_FIELDS`, so the sentence goes if that list empties); the primary is NOT armed,
  because the daily cron rewrites the running month anyway. **The button is a plain `Button` and the confirm grows
  from ONE origin** (2026-09-18, what the owner had long called «una strana animazione», measured frame by frame): it
  sat in the app's only `whileTap` wrapper (scale 0.97) on `springLayoutTransition` — the soft spring for REGIONS,
  ~300 ms down and ~500 ms back, so a normal click was still breathing while the confirm opened — and the confirm
  got its `transform-origin` one frame after mounting, which the dialog's `duration-200` turned into a pivot gliding
  from the centre to the button (14 values in 200 ms). The origin is now resolved AT THE CLICK
  (`resolveCenteredModalOrigin`, `lib/utils/modalOrigin.ts`) from `event.currentTarget` — never a ref on the button,
  which the header mounts twice — and kept through the close. Pinned by `e2e/panoramica.snapshot.spec.ts`, which
  forces the «already exists» flag on the overview RESPONSE and never presses «Sovrascrivi». The inline footer links («Analisi», «Patrimonio») are text links inside a
  sentence, 15px tall — the house idiom, not a target.
- **The market digest's blind spots**: a quantity no BUY/SELL explains (a baseline written in the month, an adjustment, a hand edit) and a failed ledger read keep a traded quote out of the market; a pension fund counts only from `pensionReturnStartMonth`; hand-valued assets other than funds and real estate never show a market effect; real estate is gross of debt; the email's «mercato» is a residual that also holds the page's «altre variazioni». (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
- **The sales clause is an ESTIMATE from the ledger** (2026-09-11): the tax is `plusvalenza × taxRate` per instrument — no compensation of prior losses, no rate → «non stimate» (never zero); a sale recorded outside the ledger (a hand-edited quantity) is invisible; the AI email prompt still prints the old `Δ − risparmio` residual; and a tax the owner ALSO records as a cashflow expense is counted twice in the email's split. On the real account the estimate landed 3,64 € under the broker's withholding (4.088,86 € vs 4.092,50 €). (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
