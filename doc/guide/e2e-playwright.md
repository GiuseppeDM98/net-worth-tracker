# E2E — Playwright

> **When to open this guide** — anyone writing or changing a Playwright spec in `e2e/`, `playwright.config.ts`, `e2e/global-setup.ts`, an `e2e/auth*.setup.ts` or a helper no project collects (`e2e/*Fixture.ts`, `e2e/shellBoot.ts`, `e2e/chunkProbe.ts`, `e2e/assistantRegister.ts`), or reading a red of one; a red of the full run, the known flakes and the suite's speed are `doc/guide/e2e-suite.md` (since 2026-11-17). `AGENTS.md` keeps the stub with the essentials (`AGENTS.md § Browser-Driven E2E (Playwright)`); here is the full rule, moved whole from `doc/guide/e2e-emulatori.md` on 2026-11-11 (its history before that day: `git log -- doc/guide/e2e-emulatori.md`). The files, the seeds, the emulators' start and stop, the mirror, the throwaway exercises and «proving a refactor changed no number» stay in `doc/guide/e2e-emulatori.md` (§ Files, § Emulator Exercise Scripts); the environment in `SETUP.md` → Steps 6-7.

## Browser-Driven E2E (Playwright)
- **The ring specs** (2026-11-15; doc/guide/grafici.md § The ring): `e2e/ring-chart{,.mobile,.tablet}.spec.ts` (the
  homes of 2026-11-12, one body `ringChartSuite.ts`) and the minor tiles' seven files —
  `e2e/ring-chart.split{,.mobile}.spec.ts` (projects `split`, `split-mobile`), `e2e/ring-chart.centri{,.mobile}.spec.ts`
  (`centri`, `centri-mobile`; «Per sottocategoria» on a centre the test plants and removes), `e2e/ring-chart.owners{,.mobile}.spec.ts` (base account, «Valore» and «Carico»), `e2e/ring-chart.dividendi.spec.ts`
  (`desktop`, two dividends created through the form and deleted by the app) — plus one assertion in
  `e2e/cashflow.mortgage.spec.ts`; all through `expectRingFiguresInside` (`e2e/ringFit.ts`). **Deleting several rows of a
  list that re-reads after each delete waits for the row count to drop** before the next press (2026-11-15, the Dividendi
  spec): the refetch re-renders the next armed row mid-click, the button detaches and the click waits out the test.
- **The tablet composition has two projects, one spec runs in both** (since 2026-10-16): `tablet` (768×1024, the pill) and
  `tablet-landscape` (1024×768: the landscape stage and the 56px icon rail `TabletRail`, no pill and no bar), copied from
  `mobile` (`isMobile`, `hasTouch`, the base account, the same `testIgnore`); a `*.tablet.spec.ts` branches on
  `page.viewportSize().width` (`isLandscape` in `e2e/tabletLayout.ts`). The shared measures there: the grid's tracks, the
  fold (`foldOf`: the pill's top at 768, `main`'s bottom in landscape); **`expectLandscapeShell`** (the rail at x 0 and 56px
  wide, every target ≥ 44px, one `aria-current="page"`, `#page-main` at top 0 with the viewport's whole height, no visible
  `[data-sidebar="trigger"]`); **`expectLandscapeStage(page, scope, ids)`** (`stageParts` finds `[data-stage="verdict"]`,
  `[data-stage="lead"]` and the index by its «Il resto della pagina» heading: THE tile 16px under the verdict, the index
  360px wide and 16px to its right, starting on the verdict's line and ending on THE tile's, every row in DOM order inside it
  right under the one before with a hairline, a closed one 52px — its trigger's height; THE tile ends above the fold when the
  stage has `data-stick="true"`, starts above it otherwise); **`expectStickyStage`** (every row open, `main` scrolled to its
  end in steps: THE tile stays 16px under the verdict, never slides over it); an opened row that did not move nor scroll
  (`openRow` + `expectOpenedRow`: its box and `main.scrollTop` read before the tap; in landscape it stays in the index), no
  half grid row at 768 (`expectNoHalfCells`), `expectNoOverflow`; at 1440 **`expectGridAcrossMain`** (the grid as wide as `main`'s content box). Counting the grid's tracks does NOT prove the 1440 grid (2026-10-16): with `max-desktop:` taken off the stage's columns the grid kept its twelve tracks inside the 360px column and the check stayed green — the width is what went red. The specs: `e2e/overview.tablet.spec.ts` (the overview
  patched by `overviewFixture.ts`), `e2e/cashflow.tablet.spec.ts` (Tracciamento's rows, the 44×44 tabs, the «+» at 768 and
  «Aggiungi» 44px tall in landscape) and `e2e/patrimonio.tablet.spec.ts` (the overview request aborted: no stage, Strumenti
  spans the plain grid at 768 and in landscape — seen red with `tablet:col-span-2` taken off, the defect of the retirement).
  Read with `contextOptions: { reducedMotion: 'reduce' }`, or Framer's entrance moves the boxes. Hall of Fame, Analisi,
  Centri and Divisione have their own fixtures and no tablet project: the tour looks at them.
- **Patrimonio, Analisi and Storico are composed at 390: a spec opens the row before it reads inside it** (since
  2026-10-14): `#patrimonio-strumenti-trigger` before an `AssetRow` exists (`assets.rows.mobile.spec.ts`, the 390 case of
  `assets.composite-chip.spec.ts` — a `desktop` project resized, but the composition reads the width), `#analisi-flusso-trigger`
  before «Quote del flusso» (`analisi.mobile.spec.ts`, `bundle.lazy.mobile.spec.ts`: closed, the legend is not in the DOM
  and the absence of the Sankey would pass empty), «Apri tutte» before `history.mobile.spec.ts` measures `main`. A
  lifted block is asserted HIDDEN with its positive anchor beside it (the legend, the strip's own cell): `getByRole`
  skips a `display: none` node, so `toHaveCount(0)` and `toBeHidden()` pass alike — the falsification (the
  `liftedFigures` dropped) is what proves either. The specs: `mobile-composition.{patrimonio,history}.mobile.spec.ts`
  (base account; Patrimonio's overview patched by `overviewFixture.ts`, a top instrument added so the sentence names the
  market), `mobile-composition.patrimonio.spec.ts` (1440), `mobile-composition.analisi.mobile.spec.ts` (`analisi-mobile`).
  **On the `analisi` projects never pass `--no-deps`**: `global-setup` re-seeds `analisi@example.com` and the parked
  session no longer opens (the login page, seen that day) — on `mobile`/`desktop` the base account survives it. A row
  «still in the calendar» is planted on the 28th of December at noon UTC (`ornitorinco` in its note) and removed after,
  the test skipped from that day on. Storico's ledger is summed on its VISIBLE rows inside `#storico-driver-panel`, the
  featured year being the panel's `button[aria-expanded="true"]`.
- **Allocazione, Previdenza and the five FIRE tabs are composed at 390 since 2026-10-15: a spec opens the row before it reads inside it** — `#alloc-esposizione-trigger` before the coverage line (`allocation.mobile.spec.ts`), `#prev-versamenti-trigger` before the ledger's delete targets (`pension.mobile.spec.ts`), «Apri tutte» before `fire.mobile.spec.ts` and `coast.mobile.spec.ts` measure `main`. **A request that must NOT happen is counted with a positive anchor first** (`allocation.mobile.spec.ts`: `page.on('request')` on `/api/portfolio/instrument-profiles`, the Esposizione's trigger seen closed, then `[]` after 1,5 s; the opening makes the count grow): the Esposizione reads its profiles only once its row has been opened, and the route's abort (`page.route(…, route.abort())`, the pattern of `settings.spec.ts`) makes the FIRST read fail into an `ErrorNotice` row with ONE live node. **The FIRE page's memory is per tab** (`mobile-sections:fire-simulations:fire`, `:coast`, …): `fire.mobile.spec.ts` opens a row, switches tab, opens one there and comes back — the inactive `TabsContent` is unmounted, so what survives the switch is `localStorage` alone. A What If spec reads the Evento FIRST in `section.rounded-2xl` of the tabpanel at both widths (Evento is THE tile, first in the DOM at 1440 too — DESIGN.md → The Input Tile Rule). On the base account the FIRE verdict may read «Sei già FIRE.» (small expenses): `fire.spec.ts` asserts «anni. Da allora» only on a headline that starts with «FIRE nel». At 1440, `allocation.spec.ts` compares the Piano's edges with Bilanciamento's and Per classe's in the three modes and with the amount cleared (2026-11-12).
- **Rendimenti's composition spec runs on the degraded account at 390, with the model series answered by the browser**
  (2026-10-14, `e2e/mobile-composition.performance.degraded.mobile.spec.ts`, project `degraded-mobile`:
  `testMatch: /\.degraded\.mobile\.spec\.ts/`, `DEGRADED_STORAGE_STATE`; `mobile` ignores `degraded.`, or it would
  collect the file on the base account): the only composition that needs a measured return, so it seeds the
  `performance` scenario in `beforeAll` like `e2e/performance.degraded.spec.ts`. The six `/api/benchmarks/returns` and
  the FX are `route.fulfill`ed with a flat invented month (+1% a month, 0,92 € a dollar, last year and this one), so the
  gap cell and the Benchmark row depend on nothing outside the emulator — Yahoo and Frankfurter included; the failed-row
  test aborts the six instead (`retry: 1`: each is asked twice, then fails for good). `**/api/ai/**` is routed to a
  counter that must read 0 at the end of the file: no test opens «Analizza con AI». A sentence rendered by
  `NarrativeSegments` is matched on its PROSE («a fine maggio 2026 oggi valgono»), never on `/^100 €/`: the unit is its
  own span, so «100» and «€» are two text nodes (seen red that day).
- **Cashflow's composition specs bend the base fixture through the emulator's REST API and undo it** (2026-10-12,
  `e2e/mobile-composition.cashflow.mobile.spec.ts` on `mobile`, `…cashflow.split.mobile.spec.ts` on `split-mobile`): a
  decoy expense at NOON UTC of the month's last day (the scope line; its late evening is 00:30 of the NEXT month in Rome
  under summer time, and `periodToRange` reads the local month — dated 22:30 the assertion would have been red from
  March to September, seen in the spec's retirement), a `budgets/test-user-1` document with a 1000 € ceiling (the base
  account has none — PATCH, then DELETE and a GET at 404), a coupon in `dividends/` (the base account has none, and the
  rows exist only with a registry); every decoy carries «ornitorinco» in its note and the sweep before and after each
  test finds them by it — **paging the collection with `nextPageToken`**: the emulator holds every fixture account's
  rows (hof alone 94 expenses) and a single `pageSize=300` read left the decoy on the second page, so the next run read
  «Spese 1170 €» (seen that day). **A failed stats read is a REWRITTEN answer, never an abort**: `page.route('**/api/dividends/stats*')`
  → `route.fetch()` → `route.fulfill({ response, json: { ...body, stats: null } })` (the pattern of
  `panoramica.snapshot.spec.ts`), because since 2026-10-05 that request carries the registry too and `r.abort()` is the
  failure of the whole TAB. Two boxes compared after a strip cell's tap are read in ONE `Promise.all`, or before the tap:
  `reveal` scrolls smoothly and two reads taken during it disagree (seen red that day, 222 against 294). **A row
  remembered open answers `aria-expanded="true"` at its first render, BEFORE a deferred landing focuses its trigger**
  (2026-11-11, Analisi's Scheda: `landOnScheda`'s 50 ms timer): a test that moves the focus after a re-opening waits for
  the landing first (`toBeFocused()` on the trigger), or the landing takes the focus back. A Cashflow
  phone spec scopes its locators to the tabpanel by name: every visited tab is `forceMount`ed (doc/guide/shell.md). A test
  with TWO cold loads of a tab (a reload after a change) sets its own `test.setTimeout(120_000)` (the 45 s a verdict may
  take do not fit the 30 s default) and, before the reload, **waits for the URL to carry the tab** (`toHaveURL(/tab=budget/)`):
  a tab click writes `?tab=` through `router.replace` after the panel shows, so a reload fired first lands on Tracciamento
  and reads as a timeout on the other tab's verdict (2026-10-12, twice in the full suite, green alone). A memory held in
  `localStorage` is falsified by clearing its key before the step (`mobile-sections:cashflow:cost-centers` before Back,
  `cashflow.centri.mobile.spec.ts`), not by editing the hook.
- **A phone spec freezes the clock BEFORE `goto`, and a closed row holds nothing** (2026-10-10, Hall of Fame composed,
  `e2e/mobile-composition.hof.mobile.spec.ts`): `page.clock.setFixedTime(new Date('2026-09-15T12:00:00+02:00'))` keeps
  the `hof` fixture's running month and year whatever the calendar — the parked Firebase token outlives the frozen
  instant and the emulator does not check it, so the session holds (the fallback the spec names, moving the memory
  test to Vitest, was not needed). Below `desktop:` every tile but THE tile is a closed row with an EMPTY panel until
  its first opening: a spec reading inside one clicks `#<id>-trigger` first (`hall-of-fame.hof.mobile.spec.ts` on
  Anni), and the level-2 heading is `.first()` or by name — «Il resto della pagina» is a second `h2`. A spec that
  asserts «no `order-*` in the grid» reads `classList` with `/^(?:[a-z-]+:)*order-/`: a `[class*="order-"]` selector
  matches every `border-*` (13 hits on a page with none, seen that day). The composition's `reducedMotion` is asked
  through `test.use({ contextOptions: { reducedMotion: 'reduce' } })` (`reducedMotion` is not a test option).
- **The parked session may or may not carry what a Firestore sync writes into `localStorage`**
  (2026-10-10, `e2e/motion.layout.spec.ts`): `auth*.setup.ts` captures the state as soon as the
  profile shows, so the colour theme `ColorThemeProvider` copies from `userPreferences/{uid}` is in
  the file on one run and missing on the next — and then every test sees the theme switch a few
  hundred ms after its load. No seed resets the base account's `userPreferences` (that day the
  persisted `.emulator-data` carried a colour theme from an earlier session). A spec that counts
  reads or renders, or that needs no theme change mid-test, reads the account's stored theme from
  the emulator and writes it into `localStorage` with `addInitScript` before the page loads, so
  the sync writes the same value and changes nothing.
- **The six `auth*.setup.ts` anchor on the PROFILE, at 1440** (2026-09-28). Since the shell is in the
  prerendered HTML, `getByRole('navigation')` and `main` exist on `/dashboard` before Firebase has said who is signed
  in, so the old anchor (`navigation.or(main)`) would have declared the session ready too early. Each setup now waits
  for `waitForURL(/\/dashboard/)` and then for the account's email in `[data-sidebar="footer"]`, which the sidebar
  prints only once `onAuthStateChanged` has answered — and the six setup projects run at `SETUP_VIEWPORT` (1440×900,
  `playwright.config.ts`), because below `desktop:` the sidebar is a closed Sheet and the footer is not in the DOM.
  The same fact for any spec: `main`, the skip link and the bottom nav are not proof of a session; the page's `h1`
  or the footer's email are. `e2e/shell.boot{,.mobile}.spec.ts` are the shell's own specs (the HTML without JS, a
  clean hydration console with a positive `console.error` anchor, the theme at the first frame — their assertions
  are shared in `e2e/shellBoot.ts`, a helper no project collects). **A hydration mismatch is a `pageerror`, not a
  console line** (2026-09-28): React 19 throws «Hydration failed because the server rendered HTML didn't match the
  client» as an uncaught error, so a spec listening on `page.on('console')` alone stayed GREEN with a `typeof
  window` branch planted in the layout — read `page.on('pageerror')` too. And a mismatch makes React regenerate the
  tree on the client, which then prints «Encountered a script tag while rendering React component» for the `<head>`
  theme script: that line is a symptom of the failed hydration, not of the script.
- **What a page DOWNLOADS is asserted by chunk CONTENT** (`e2e/chunkProbe.ts`, 2026-09-30): chunk names change every
  build, so `probeChunks` reads each body for a STRING LITERAL of the module (`CHUNK_SIGNATURES` in `chunkProbe.ts`, since
  2026-11-16): a minifier renames functions and drops module paths and comments, never a string, so one signature
  holds on `next dev` and on the production build of the whole run. A literal of ONE source file of `app/`,
  `components/`, `lib/` — a comment counts, dev chunks keep them (`circular link` is quoted by `cashflowSankey.ts`, so
  the Sankey's signature is d3-sankey's `Error("circular link")`) —, pinned by `__tests__/chunkSignatures.test.ts`;
  never OUR module's path, which the importer's chunk also names in its `import()` loader. To measure a placeholder
  against what replaces it, HOLD the chunk until the test releases it (`holdChunks`) — a fixed delay loses the race to a
  preload — and navigate to `domcontentloaded`: a held chunk requested before `load` means `load` never fires. A held
  check that stays true with NOTHING held asserts `held() > 0` (Dividendi's landing: the tab's loading state is the
  page's placeholder). These prove an import is lazy; sizes are `perf:budget`'s. Worked example:
  `e2e/bundle.lazy{,.mobile}.spec.ts`. **A signature is proven by breaking it**: with every one set to a string no chunk
  holds, the presence and hold checks go red (8 of the 11 tests on 2026-11-16, both servers; Dividendi's the ninth, once
  it asserted `held()`); the four absence checks — two of them in tests a broken signature leaves green — by
  putting a static import back (the PDF engine in `PDFExportDialog`, the Sankey in `FlussoTile`, the Flusso in
  `DettaglioDisclosure`, the sparkline's preload at 1440 in `StrumentiTile`), each red at its own line on both servers.
- **Only four lazy surfaces are held against a placeholder that moves**: Analisi's Sankey (`layout-shift` 0
  and equal heights) and Rendimenti's Dettaglio (no placeholder ever shown), both in `e2e/bundle.lazy.spec.ts`
  (2026-09-30); Cashflow's Dividendi at 390 and Divisione at 390 and 1440 (2026-10-06, `e2e/lazyTabLanding.ts`, run
  by `bundle.lazy.mobile.spec.ts` and `cashflow.split{,.mobile}.spec.ts`): the tab's chunk held, then the tab put in
  its OWN loading state (its stats request held; Firestore's channel held behind a period never read), the grid's
  first cell at the same place — seen red at 52, 56 and 4 px with the old fallbacks. **A layout-shift score cannot see
  a node that REPLACES another**: the tab remounts the fallback's nodes, and the score stayed 0 while the grid
  jumped 52 px — measure the position, and only once the panel's entrance (`tabPanelSwitch`, 6 px) has settled: two
  readings 250 ms apart, not `expect.poll`, whose first reading sits beside the previous one. Budget and Centri di
  Costo are not held: their fallback and their loading state are the same cells of one constant.
  Analisi's three disclosures and its Scheda and the four lazy FIRE tabs measured `layout-shift` 0 ONCE, on the mirror at
  1440 and 390; no spec holds them, so a placeholder that loses its height there goes unseen by the suite. If one of
  them went back into the initial JavaScript, `perf:budget` would still catch it (its route over the ceiling).
- **A chunk held from the first navigation makes an absence at mount inert** (2026-10-07, `e2e/assets.rows.mobile.spec.ts`):
  «0 sparklines before any row is opened» stayed green with every row mounting its chart, because the held chunk kept
  them all on their placeholder. The absence is asserted with the chunk ARRIVED (`probeChunks` polled until it has),
  the placeholder-against-chart height in a second test that holds it.
- **An animation tied to a navigation is sampled WITHOUT the page scene** (2026-10-08, `e2e/motion.layout.mobile.spec.ts`):
  on the dev server a shell-link click runs a view transition whose update waits for the route to compile, and the
  browser renders NO frame meanwhile (rAF still from 52 to 355 ms) — a spring started in that commit settles in the dark
  and the frames read a jump whatever the code did. `delete Document.prototype.startViewTransition` in an init script
  takes the browser-without-view-transitions path (`runViewTransition` feature-detects). And a spy on
  `getComputedStyle(document.documentElement)` counts Next's router too (two calls per navigation, its scroll
  handling): spy on what the code under test reads — the `--chart-*` tokens through
  `CSSStyleDeclaration.prototype.getPropertyValue` — not on the call.
- **«No placeholder ever showed» is watched from BEFORE the action** (2026-09-30): a `MutationObserver` installed before
  the click, read after; counting skeletons once the chart is visible passes whether or not one flashed (seen inert).
- **In a cloud container the pinned Chromium is not installed** (2026-09-25): `browserType.launch: Executable doesn't
  exist at /opt/pw-browsers/chromium_headless_shell-XXXX`. Never `playwright install` there: a throwaway
  `playwright.local.config.ts` (listed in `.git/info/exclude`, deleted at the end) spreads `playwright.config.ts` and
  gives every project `launchOptions: { executablePath: '/opt/pw-browsers/chromium' }`; run with `-c` on it.
- **A spec cannot import app code** (2026-09-25): Playwright does not resolve the `@/` alias, and every `lib/` module
  uses it, so `import('../lib/server/…')` dies on its first transitive import. A server function is pinned in Vitest
  against an in-memory Admin Firestore that enforces reads-before-writes (`__tests__/serverCashSettlement.test.ts`), and
  exercised ONCE on the real emulator by a throwaway `.mts` run with `tsx` (which does resolve the alias).
- **A spec that presses Impostazioni's «Salva» restores the whole document** (2026-09-25): the page writes every field
  it holds, the `targets` tree included, and drops the base seed's sub-targets — two Allocazione tests went red in the
  NEXT spec file of the full run, not in the one that saved. Read the document in `beforeAll`, `set()` it back whole in
  `afterAll` (`e2e/cashflow.transfer-fee.spec.ts`).
- **The cloud container's Chromium groups four-digit euros; Node and the pinned Chromium do not** (2026-09-25): the
  container's `/opt/pw-browsers/chromium` (Chrome 141) prints «1.100 €» where Node and the Mac's pinned build print
  «1100 €», so four specs whose regex reads an ungrouped four-digit amount are red there and only there
  (`analisi.spec.ts`, `cashflow.centri.spec.ts`, `cashflow.split.spec.ts`, `pension.spec.ts` — green on the Mac on
  2026-09-24). Not a regression: read the received text before touching code. A new spec takes both (`1\.?012,00`).
- **A `toContainText` on a tile's region also reads the sentence under its eyebrow** (2026-09-27):
  `cashflow.split.spec.ts` asserted Nibbio's «100 €» on the whole region and was satisfied by «1100 € di spese
  personali» in the reading, so the hero could have printed anything. Assert a figure on the hero
  (`locator('p.font-mono').first()` with `toHaveText`) and keep `toContainText` for a sentence. A spec line that holds
  a literal no-break space inside a regex defeats the Edit tool's matching: patch it with a node one-liner.
- **A falsification of a seed-borne belt goes through the FIXTURE MODULE, never through a direct write to the
  emulator** (2026-09-28, the Esposizione's Yahoo profiles): `e2e/global-setup.ts` re-seeds on EVERY invocation, so a
  `PATCH` that emptied `VWCE.DE`'s profile was overwritten by `npm run e2e:seed:profiles` before the spec ran and the
  spec stayed green — the empty profile has to come from `scripts/instrumentProfileFixtures.ts` itself (edited, run,
  reverted). And the same session's first red was NOT the falsification: a stale `.next-e2e` answered 404 on the
  BRAND-NEW route at its first cold hit and the tile showed its error branch (the rule above about stale routes,
  seen on a route that did not exist when the dist dir was built).
- **A red spec you did not touch: read the fixture in the emulator before the code** (2026-09-20). `.emulator-data`
  persists across sessions, so the base seed DRIFTS: `seed-btp` had lost its `taxRate` a week earlier and the two
  Dividendi specs proposed the 26% fallback instead of the instrument's 12,5% — it read as a regression of the
  session's change. `curl` the document (`Bearer owner`), and `npm run emulators:seed` restores the base account
  without touching the other fixtures. **It also drifts by CALENDAR** (2026-10-03): `scripts/seedEmulator.ts` dates its
  rows on the month it ran and `global-setup` never re-runs it, so the first suite of a new month finds no
  current-month row — nine Tracciamento, freshness, owner and mobile specs red with «Nessun movimento registrato ad
  ottobre» / «the seed has no current-month row». After a month change, re-seed before the full run. **The seed dates its three expenses `min(5, today)`**:
  on a fixed 5th, a re-seed in the first four days of a month writes FUTURE rows — FIRE says «servono spese
  registrate», Coast loses its pace sentence, Storico's Driver has nothing to open (five specs red).
- **What belongs here**: only what needs a real layout — the `desktop:` switch at 1440px, a collapsible, a state flash,
  computed font sizes, bounding boxes, overflow; the arithmetic stays with Vitest. **Two limits**: a race between
  concurrent queries is not reproducible locally (the Firestore Web SDK multiplexes every target onto ONE webchannel),
  and an error branch is not reachable by cutting the network (the SDK treats an unreachable backend as offline).
- **A fixture that cannot put the property on screen makes the spec assert nothing** (2026-09-21): Allocazione's base
  seed had class targets but no SUB-targets, so no class row was expandable and the plans had no level under the
  class — the spec could not reach the row's own figures, the sub-category base or the rebalance's descent. Extending
  the SHARED seed (`scripts/seedEmulator.ts`) is the right fix and its blast radius is the whole suite, so it is
  followed by a full `npm run test:e2e`, never by the one spec that needed it. Check first what else writes to the
  document: the other fixtures `merge` into `assetAllocationTargets` for `familyMembers` and the flags, and none of
  them reads the `targets` map.
- **`workers: 1`, non-negotiable** (the specs share emulator accounts). **Give the suite its OWN fixture**, tuned so the
  thing under test is on screen at all (Analisi dates every expense to January so its figures are exact in any month;
  Coast picks the RITA long-unemployment variant because the ordinary unlock falls past the projection) and say so in
  the file. `e2e/global-setup.ts` runs every seed on EVERY invocation, side by side since 2026-11-16 (each writes its
  own account; Previdenza → Coast stay a chain, Coast's inflow needs the fund): a new fixture is an `npm run e2e:seed:*`
  script plus one `runSeed` in that `Promise.all` — after another one only if it reads what that one writes —, and a test that patches
  Firestore does it inside the test. **Re-seeding an account mid-suite logs it out** (`auth.updateUser(uid, { password })`
  revokes the refresh tokens and the parked `storageState`): creation once from `global-setup`, data-only per test.
- **`storageState` does NOT capture IndexedDB unless asked** (`{ path, indexedDB: true }`) — the Firebase session lives
  there, the file looks valid and every spec lands on `/login`. **Drive the dev server on `localhost`, never
  `127.0.0.1`**: Next blocks cross-origin dev resources from the bare IP, the page never hydrates and the login form
  submits natively — indistinguishable from a wrong password.
- **And that capture also takes the persisted React Query cache** (since 2026-09-29): the app writes its
  cache to the `nwt-query-cache` database, so a parked session would carry into EVERY spec the figures the setup's
  login happened to read, and the first frame of every spec would be a restore. The six `auth*.setup.ts` strip that
  database from the state file they just wrote — `stripPersistedQueryCache` in `e2e/persistedCache.ts`, AFTER
  `storageState`, not an `indexedDB.deleteDatabase` from the page before it: the app holds the database open and a
  delete would wait on that connection forever. The names are repeated in the helper (a spec cannot import `lib/`)
  and `__tests__/persistCache.test.ts` pins them to `lib/constants/persistCache.ts`. So every spec's first visit is
  a genuine first visit; a spec that RELOADS inside itself sees the restored figures first and the fresh ones as they
  land — an assertion that retries (`toHaveText`, `toBeVisible`) waits for them, a one-shot `innerText()` read right
  after the reload may catch the old frame — and an Admin write made between two `goto` of one spec IS reread by the
  second (the restore invalidates what it restored), which is what four specs of the full run had silently relied on
  (`assets.bond`, `cashflow.owner`, `cashflow.transfer-fee`, `fire`: red until the restore invalidated, 2026-09-29).
  Three things `e2e/freshness.spec.ts` learned: the persister writes on a one-second throttle whose first call is
  immediate, so poll the record for the KEY you need (`expenses/<uid>`), not for any record; the auth wait is
  `role="status"` «Verifica dell'accesso» and the page's own skeleton «Caricamento» — match the label, not the role;
  and an emptied `<p>` has no width, which Playwright calls NOT visible — assert the emptied node without a `visible`
  filter (both header copies, `toHaveText(['', ''])`). The sign-out test reads the record back through IndexedDB
  itself (`indexedDB.open` + `get`), the way «assert on data» means here.
- **Prove the test can fail before trusting it** (the 1440px assertions were re-run at 1200px, where they must fail).
- **The whole run — its server, its known flakes, its speed — is `doc/guide/e2e-suite.md`** (split out on 2026-11-17):
  a red only a full run produces, the flake list read before any re-run, the production build that serves it.
- **A green suite on the emulators says nothing about a server dependency's MODULE LOADING on Vercel** (2026-10-08):
  `verifyIdToken` skips the signature against the Auth emulator, so the `jwks-rsa → jose` chain of firebase-admin never
  ran under Playwright, and 173 green tests preceded a deploy where every Admin route answered 500 (`ERR_REQUIRE_ESM`;
  doc/guide/server.md § Server Layer and API Authorization has the rule and the cure). The check that exists for that: the standalone production build
  locally with the real credentials, probed with a forged token (expected 401 with the audience error in the log,
  never 500) — and then the preview deploy, which only the owner can open.
- **Reading the page — the traps, each seen once**: `page.addInitScript` runs BEFORE `document.documentElement` exists
  (observe `document` with `subtree: true`, or the script dies and the spec passes having observed nothing);
  `innerText` applies `text-transform` and is `''` for anything not rendered (an uppercase eyebrow marker or an open
  Recharts tooltip need `textContent`); `boundingBox()` is viewport-relative (`scrollIntoViewIfNeeded()` before hovering
  a chart below the fold) and two calls sample two FRAMES (read every rect one assertion compares in ONE `evaluate()`,
  never during an animation); responsive DOM duplicates make `.first()` the HIDDEN mobile copy (`.filter({ visible:
  true })`) — not on Patrimonio's Strumenti since 2026-10-07: one list per width there, the table at 1440 and
  the rows at 390, so a row locator finds one copy and a count is the instrument count; a collapsed CSS-grid region is still "visible" (scope through the toggle's `aria-controls` and measure
  height); a `fill()` right after `goto(…, { waitUntil: 'domcontentloaded' })` is wiped by hydration (`waitUntil:
  'load'`, then `.inputValue()`); `addInitScript` runs on EVERY navigation, reloads included, so a `localStorage.removeItem`
  placed there to start clean also wipes the persistence the spec is about to verify — guard it with a `sessionStorage`
  flag (2026-09-14); on `/login` `getByLabel(/password/i)` resolves the «Mostra password» toggle first and `fill()`
  refuses a button — use `input[type=password]` (2026-09-19). **A box read for a geometry assertion is taken AFTER the entrance** (2026-10-04, `e2e/modal.origin.spec.ts`): a
  header button is enabled from the page's first frame and glides 4px for ~250 ms with the page scene, so a
  `boundingBox()` right after `toBeEnabled` was up to 4px off — wait for the page's verdict, then for a box two reads
  100 ms apart agree on. **A box's content width is `clientWidth` minus the padding** (2026-11-11,
  `e2e/allocation.consulente.book.mobile.spec.ts`): `getBoundingClientRect().width` carries the border, and a «full
  width» button read against it is 2px short; a height of 44px read on a drawer's row while it rises can be 43,9999
  — round it, or read it after the rise. **Renaming an `aria-label` breaks every spec that matched its old substring** («Modifica asset» →
  «Modifica {name}», `assets.bond.spec.ts` on 2026-09-14): grep `e2e/` for the old name in the same commit.
- **After Escape a vaul drawer is still in the DOM for ~1,5 s, and `main` sits under an `aria-hidden` ancestor all
  that time** (2026-09-18, at 390): `getByRole(…)` on anything in the page counts 0, so a step that comes right after
  closing a `ResponsiveModal` on a phone reads as «the button is not there» — a capture script skipped the armed-delete
  screenshot that way. Wait for `getByRole('dialog')` to be hidden (or for the control itself), never a fixed 400 ms.
- **`npx playwright test … | grep … | head -N` hides the verdict** (2026-09-18): `global-setup` prints ~14 «✓ …» seed
  lines that fill `head` first — filter on `"\[(desktop|mobile)\]|[0-9]+ (passed|failed)"`. **A falsification must fail
  on the assertion it is about**: break ONE behaviour at a time, or an earlier assertion goes red and proves nothing.
  When the only mutation that breaks a LATER step also breaks an earlier one (2026-11-15, the opening fee's Tracciamento
  row in `e2e/assets.trade-fee.spec.ts`: `fees` dropped from `firstBuy` fails first on the Firestore read), run a
  throwaway copy of the spec with the earlier reads set aside (matching `testMatch`, deleted after) and watch the new
  step fail there.
  **Shoot the SETTLED frame**: right after `dialog.waitFor()` a vaul drawer is half-way up (~500 ms) and a button is
  mid colour-transition — ~800 ms before a capture, never before an assertion.
- **A spec that needs a server-computed FLAG forces it on the RESPONSE** (2026-09-18, `e2e/panoramica.snapshot.spec.ts`:
  `page.route` + `route.fetch()` + `route.fulfill({ response, json })`): planted data goes stale at the month's turn,
  and without the flag the click under test WRITES a snapshot. **The same for a whole SCENARIO of the Panoramica**
  (2026-10-11, PR #452, `e2e/overviewFixture.ts` for `e2e/overview.{mobile.,}spec.ts`): the base account's real response
  is patched on the wire with round invented figures — the variations, the expense stats (`incomeScheduled` present, the
  previous month under 30% so `SavingsRateBadge` never covers the pill: the spec reads `[class*="fixed bottom-4 left-4"]`
  at 0 first), a curve with last December, January and the running month (the YTD window exists), `hasTERTracking` on
  (seven rows), a taxed sale per scenario with a tax of ≥ 10.000 € (the container's Chromium groups «1.100 €») —
  nothing written, no dependence on the seed's month. A helper no project collects (`overviewFixture.ts`, like
  `shellBoot.ts`): a scenario spreads its overrides over `baseOverviewPatch()`. **The hidden rest of a cut verdict is
  in the DOM**: `toContainText` on the verdict's region reads it, so «title only» is asserted with
  `getByText(/Il patrimonio vale/)` → `toBeHidden()`, never with `not.toContainText` (seen that day).
- **A control that calls a model is pressed only on a FAKED route** (owner, 2026-11-07):
  `npm run dev:e2e` is `next dev`, which loads `.env.local` — and so does the whole run's production server since
  2026-11-16 (`perfServe.mjs --env-local`) —, so the owner's real `ANTHROPIC_API_KEY` reaches the server
  on :3100 and enables the control (the Consulente's `configured`) — the key makes it pressable, never what answers
  it. The spec installs `page.route('**/api/allocation-advice/run', …)` BEFORE the click and answers each request by
  its `stage` with an SSE body (`data: {json}\n\n`: the `stage` events, then `done` or `error`; an interview round is ONE `interview` event, `e2e/consulenteInterview.ts`); a request it must
  hold to read a state is answered after the assertion. No dummy key in `package.json`, no real request from a spec.
  Worked example: `e2e/allocation.consulente.spec.ts` › «runs the stages on a faked route, a failed stage
  retried from itself, then the operating plan». **A fake that stands for a route which WRITES does the write itself** (2026-11-10,
  `e2e/assistantRegister.ts`): the Assistente's stream route stores the thread and the two messages before it answers,
  and the card's PATCH and the reload read them — so the fake writes them with the Admin SDK and answers `done` with
  the id it wrote; the real PATCH and thread routes then run against real documents. Since 2026-11-12 the
  fake also emits the router's `route` event (`reply(prompt, body)` returns the text or `{ text, reading }`; a body
  `route` comes back as the reading, `'carried'` or `'override'`), `plantExchange(user, assistant, reading)` writes
  the reading (`null`: a message saved before the router), and `enterRegister`/`registerAction` are gone — a
  sentence is read as a registration with no mode to enter. Two things the fake does NOT do: it emits no `context`
  event, so after a faked analysis the verdict stays a skeleton (the real route sends the bundle, `stream/route.ts`);
  and its `done` says `webSearchUsed: false`, which the line reads over the reading's `webSearch` — no « · con
  ricerca web» on a faked answer. The Assistente page needs the key
  in `.env.local` to render its composer at all (`openAssistant` says so in its failure message). A spec with
  independent tests is NOT `serial`: the first red would skip the rest, and one mutation run could not show three reds.
- **Locators — the controls are not buttons** (2026-08-28: read the failure's page snapshot before guessing a second
  selector): the Cashflow picker is a `combobox` named «Periodo selezionato: {label}», `SegmentedPill` options are
  `tab`, the instalment toggle sits behind the «Impostazioni avanzate» disclosure, the two-step create dialog capitalises
  its types («Spesa Variabile»), `CompositionList` rows are `<button role="listitem">` named `"{name}, {value},
  {share}%"`, `PageTabBar` tabs are named at every width but icon-only below 1440px (`getByRole('tab', { name })`, not
  `getByText`). `getByRole(…, { name })` matches SUBSTRINGS («Avvisi» resolves «Avvisi soglia») and `getByLabel` matches
  substrings case-insensitively («Azioni (€)» resolves «Obbligazioni (€)» — a strict-mode violation naming two inputs
  that reads as the field missing, 2026-08-30): pass `exact: true` on every generated field.
- **Numbers on the page**: on the BASE account FIRE figures depend on the RUN MONTH, so a spec there asserts STRUCTURE
  and FORMAT, never amounts; the euro regex must accept ungrouped four-digit amounts,
  `(\d{1,3}(\.\d{3})+|\d{1,4}),\d{2}` (CLDR `minimumGroupingDigits = 2`, the AGENTS.md § Italian Localization trap); Node's
  `Intl` puts a NARROW no-break space (U+202F) before `€`, the browser a plain one (U+00A0) — flatten both sides. **And
  a sentence rendered by `NarrativeSegments` has NO space before the unit in the DOM** (2026-10-10: the unit is its own
  span, AGENTS.md § Italian Localization): `[\s\u00a0]*€` matches every surface, a literal `' €'` matches only the
  figures printed outside the narrative (`RecordRows`, the heroes, the tables). A
  decoy-absence check on Cashflow must scope to `[role="tabpanel"][data-state="active"]` — every tab stays mounted
  (`forceMount`) and hidden.
- **Three traps of a tour spec, each seen once (2026-09-07)**: `/dashboard/settings` opens on `?tab=allocazione`, so a
  control of the Generale tile needs `?tab=generale` in the URL or it is never in the DOM; a Recharts legend repeats
  the labels of the rows above it, so `getByText(label, { exact: true })` inside the tile is a strict-mode violation
  (`.first()` — the rows come first); a dev server compiles a route on its first hit and the settings page takes more
  than Playwright's 30s default (`test.setTimeout`), which reads as «element not found» on a page that is still
  compiling.
- **A settings change is only verified by a RELOAD** (2026-08-29: four fields wrote fine and came back old on the next
  load — the form is rebuilt by `getSettings`, the half where the bugs live): drive the UI, save,
  `page.reload({waitUntil: 'load'})`, assert on the INPUTS, and test setting and CLEARING separately.
- **A two-click confirm in a spec waits for the ARMED label before the second click** (2026-09-13): on a cold dev server the
  second `click()` on «Elimina operazione» landed on a button not yet re-rendered as armed and the row stayed, with no
  error anywhere; `await expect(row.getByRole('button', { name: /Premi di nuovo per/ })).toBeVisible()` between the two
  clicks, and `page.waitForResponse` on the DELETE to read its status, made the same step green. A first run against a
  cold server also logs an overview «Lettura fallita» and a failed backfill that a warm server does not reproduce — read
  the API bodies (`page.on('response')` on `/api/` ≥ 400) before calling either a defect.
- **A throwaway spec: own config, right filename, removed by the app, deleted.** The broad `desktop` project collects any
  `*.spec.ts`, so a spec written for its own fixture account fails under the base account in a full run — give it
  `playwright.<name>.config.ts` with its own setup project and a narrow `testMatch`, run with `--config=`, delete it
  before the full suite (2026-08-28). The FILENAME chooses the account: `*.spec.ts` → `desktop`, `*.mobile.spec.ts` →
  `mobile`, `*.degraded.spec.ts` → degraded, `*.degraded.mobile.spec.ts` → `degraded-mobile` (2026-10-14), `*.tablet.spec.ts` → `tablet` AND `tablet-landscape` (2026-10-16, both, on the base account; `desktop` ignores `tablet.` too), and only a name containing `analisi.spec.ts` reaches the Analisi fixture
  (`desktop` carries `testIgnore: /analisi\./`), only one containing `centri.spec.ts` the Centri di Costo one — a name after what it verifies is not collected, or collected against
  the WRONG fixture. It asserts on Firestore, plants a decoy word absent from the seed, and removes its fixture BY THE
  APP, not by `curl -X DELETE` (2026-08-31: deleting a trade through the ledger's button re-ran the replay a REST delete
  skips), looping the deletion because an earlier failed run may have left its own.
- **Java for the emulators**: a JDK ≥ 21; on macOS the Homebrew OpenJDK is enough with `JAVA_HOME` unset (verified
  2026-09-06); the Windows ritual (Temurin 21, the `javapath` shim, MSYS `PATH`, freeing a held port by PID) is
  SETUP.md → *Local Verification Troubleshooting*. **Ports 8080/9099 answering is not proof that OUR emulators are up**
  (2026-08-27: another repo's suite, `chronostep-9ab39`, took every seed into its own `demo-net-worth` namespace and
  `auth.setup.ts` died on `auth/user-not-found`): read the owner's command line (`Get-CimInstance Win32_Process -Filter
  "ProcessId=<pid>" | select CommandLine`), never kill a foreign suite, and wipe what the seeds left there with
  `DELETE /emulator/v1/projects/demo-net-worth/databases/(default)/documents` and `…/projects/demo-net-worth/accounts`.
- **A spec that edits a document another fixture also writes RESTORES what it read, never deletes** (2026-09-11):
  `cashflow.owner.spec.ts` cleared `familyMembers` on `assetAllocationTargets/test-user-1` in its `finally`, the
  Previdenza seed keeps «Marco» in that same field, and the two pension specs that ran after it failed with a verdict
  missing the name. Read the fields before mutating, put back the value (or `FieldValue.delete()` only if it was
  absent). A fixture ISIN must be one the account never held: `createAsset` re-links onto an existing asset whose
  ISIN already has dividends. And a date planted at LOCAL midnight is 23:00 UTC of the day before — the form stores
  `new Date('YYYY-MM-DD')`, UTC midnight, so every coupon derived from a local-midnight fixture reads the 14th.
  (Moved here whole from `AGENTS.md` → *Audit habits* on 2026-09-20; the rule stays there in one line.)
- **A throwaway probe on the dev server** (2026-11-13): the Next dev overlay (`nextjs-portal`) covers the bottom-left button of the 1024×768 rail and swallows its click — the probe hides it with `nextjs-portal{display:none!important}`; the dashboard never reaches `networkidle` (Firestore listeners stay open), so a window opened for the owner waits on `domcontentloaded` and a failed `goto` is caught, or the script exits and takes the window with it.
- **`browser.newContext()` inside a test inherits the project's `use`, `storageState` included** (2026-11-15): an
  «anonymous» context opened that way is logged in, and `/` redirects to the Panoramica. A context for the landing
  passes `storageState: { cookies: [], origins: [] }`. A `tile.screenshot()` taken as soon as the tile is visible can
  come out blank (the entrance is still running): assert on the DOM, photograph after a pause.

## In brief

The core's summary of this guide, moved here whole from AGENTS.md (§ 5 → Browser-Driven E2E (Playwright)) on 2026-11-17; AGENTS.md keeps a stub.

- **What belongs in a browser test**: only what needs a real layout (the `desktop:` switch at 1440px, a collapsible, a
  state flash, computed sizes, bounding boxes, overflow); the arithmetic stays with Vitest. A query race and an error
  branch reached by cutting the network are NOT reproducible locally.
- **`workers: 1`, non-negotiable**, and **each suite its OWN fixture** (an `npm run e2e:seed:*` script plus one
  `runSeed` in `e2e/global-setup.ts`, the seeds side by side since 2026-11-16). Re-seeding an account mid-suite logs it out: creation once, data-only per test.
- **The whole run is a production build, an area run `next dev`** (2026-11-16): `npm run test:e2e` builds `.next-e2e-build`
  when the code changed, refuses a stale one or a server on :3100; a chunk is known by a STRING its module carries
  (`CHUNK_SIGNATURES`, unique per `__tests__/chunkSignatures.test.ts`), never a name or path a minifier drops.
- **The FILENAME chooses the account**: `*.spec.ts` → `desktop`, `*.mobile.spec.ts` → `mobile`, `*.degraded.spec.ts` →
  degraded, `*.degraded.mobile.spec.ts` → `degraded-mobile` (2026-10-14), `*.tablet.spec.ts` → `tablet` (768×1024, two
  columns and the pill) AND `tablet-landscape` (1024×768, the stage and the icon rail — `expectLandscapeStage`,
  `expectLandscapeShell`, `expectStickyStage` in `e2e/tabletLayout.ts`) on the base account, branching on
  `page.viewportSize().width` (2026-10-16; `desktop` ignores `tablet.`), only `analisi.spec.ts` / `centri.spec.ts` / `split.spec.ts` / `hof.spec.ts` reach those fixtures — and each
  is ALSO excluded from `desktop`/`mobile` by `testIgnore`. A throwaway spec gets its own `playwright.<name>.config.ts`
  and is deleted before the full suite (2026-08-28).
- **`localhost`, never `127.0.0.1`** (the page never hydrates and the login submits natively), and `storageState`
  captures the Firebase session only with `{ path, indexedDB: true }`.
- **Prove the test can fail before trusting it**, breaking ONE behaviour at a time (2026-09-18). **Assert on Firestore,
  not on pixels**: plant a decoy word absent from the seed, and remove the fixture BY THE APP, not by `curl -X DELETE`
  (2026-08-31). On the BASE account FIRE figures depend on the run month: assert STRUCTURE and FORMAT, never amounts.
- **Proving a refactor changed no number** (doc/guide/e2e-emulatori.md, its own section): measure the noise floor first (two dumps of unchanged code), compare
  old-vs-new MINUTES apart, and compare the SET of rendered values, not the page text.
- **In the cloud container** (2026-09-25) the pinned Chromium is missing (a throwaway `playwright.local.config.ts` sets
  `executablePath`), its own Chromium groups «1.100 €» (four base specs read red there only), and no spec can import
  `lib/` (no `@/` alias): doc/guide/e2e-playwright.md.
- Il resto — the page-reading traps (`addInitScript`, `innerText`, `boundingBox`, hidden mobile duplicates, hydration
  wiping a `fill()`), the vaul drawer after Escape, locators that are not buttons and substring matching (`exact: true`),
  the euro regex and U+202F, forcing a server flag on the response, the settings reload rule, the armed two-click
  confirm, the three tour-spec traps, the frozen clock and the empty closed row of a phone spec, Java ≥ 21 and foreign
  emulators on 8080/9099 — in `doc/guide/e2e-playwright.md`.
