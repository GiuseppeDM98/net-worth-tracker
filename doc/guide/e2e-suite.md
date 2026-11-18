# E2E — the whole run: its server, its known flakes, its speed

> **When to open this guide** — before and after `npm run test:e2e` (the whole Playwright suite): reading a red that only
> a full run produces, deciding whether it is a known flake (`--repeat-each=3`, a second red of the same test is a
> pattern), or touching what serves the run (`scripts/e2eBuild.mjs`, `scripts/buildFingerprint.mjs`,
> `scripts/perfServe.mjs`, the `webServer` of `playwright.config.ts`). Split out of `doc/guide/e2e-playwright.md` on
> 2026-11-17, when that guide passed 500 lines; writing a spec, its projects and its traps stay there.

## The server and the full run

- **A full run where every spec that calls a route is red is the suite's dev server, not the routes** (2026-09-29,
  Windows machine: 18 red of 154 in 13,5 min — the Esposizione, the Dividendi form, «Crea snapshot», an Impostazioni
  read, all eleven Hall of Fame — while the 136 that never call `/api/*` stayed green). The tell is in the `[WebServer]`
  lines of the log: «Failed to fetch YOC: Not Found», «Unexpected token '<', "<!DOCTYPE"» from a `response.json()`, a
  spec reading 404 where it expects 200 — the `next dev` Playwright started answered 404 HTML on EVERY `/api/*` route
  (`Invoke-WebRequest http://localhost:3100/api/dashboard/overview` from the shell, while it was still up), and its
  `.next-e2e/dev/types/validator.ts` typed 3 API routes of 37. Not reproduced on demand: `.next-e2e` deleted and
  `npm run dev:e2e` restarted, the same route answered 401 JSON and the nine red files reran green (30/31, the one
  left `modal.origin`, CLAUDE.md § Known Issues). Before reading a red spec, probe one route on :3100; if it 404s, restart the server and
  rerun the red files against it (`reuseExistingServer` is on locally).
- **All six setups red at 30 s on `/login` is a COLD dev server** (2026-09-30, after an `npm ci`, CPU loaded): start
  `npm run dev:e2e` detached, request the 13 routes once, run `--project=setup`, then the suite — it reuses the server.
- **The full run and its known flakes** (the record of each run is in its commit message since 2026-10-19; before
  that, in `git log -- doc/guide/e2e-emulatori.md`). A full run is ~290 tests incl. 6 setups in ~12 min on the reference
  machine (2026-10-16); 351 tests in 18,2 min on the Windows machine on 2026-11-13, 403 in 11,8 min on the production
  build on 2026-11-16 (§ The suite's speed). Each flake below was red once or twice in a full run and green alone right after
  (`--repeat-each=3`); a second red of the same test is a pattern, not noise:
  - `cashflow.tablet.spec.ts` «the tabs are 44×44…» [tablet] (2026-10-16): 0 visible tabs 1,3 s after the verdict — the tab
    bar not yet painted when `open()` returned on the verdict and THE tile. Returned on 2026-10-20 (landscape, one full run); since then `open()` waits for the tablist and a visible tab too.
  - `overview.mobile.spec.ts` «a cell with a six-figure variation…» (2026-10-16, twice): the strip's second row 1,3–1,6 px
    apart where the cells share a line. Fixed: the test polls until the two cells share their line before reading the boxes.
    Red again on 2026-11-13 (once in a full run: 212,55 against 213,57 px at the `toBe` of the shared line; green ×3 alone
    and in the three runs after it): the poll did not close it — a pattern. **Closed on 2026-11-18**: red once in a full
    run and twice in six alone (0,36 px), the cause was the READ — separate `boundingBox()` calls land in different
    frames while the page above the strip still settles; the three boxes are now read in one `evaluate` (one frame)
    and polled. Green ×15 alone on the production build; seen red with every cell `basis-full` in `verdict-strip.tsx`.
    The rule for any «two boxes share a line» check: one evaluate, never two `boundingBox()`.
  - The «remembered across a reload» tests of `mobile-composition.patrimonio.mobile.spec.ts` and `overview.mobile.spec.ts`
    (2026-10-15/16): `apiResponse.json: Response has been disposed` — the response a probe holds across `page.reload()`,
    the shape of the `holdChunks` entry below. Closed on 2026-10-16: `patchOverview` reads the body in a `try` and lets a
    disposed response go with `route.continue()` (green ×5 on both).
  - `mobile-composition.performance.degraded.mobile.spec.ts` «Analizza con AI … a thumb's target» (2026-10-16): 43,999996 px
    against `>= 44`, the sub-pixel shape of the pill's «Dividendi» below; the assertion takes half a pixel of tolerance.
  - The pill's selector (2026-10-16): the landscape `TabletRail` is the same landmark «Navigazione principale» and comes
    first in the DOM, so every tool that means THE PILL reads `nav[data-nav="pill"]` (the census included).
  - `mobile-composition.analisi.mobile.spec.ts` «a category row opens the Scheda…» (2026-10-15): `#analisi-scheda-trigger`
    counted 1 where 0 was expected — the row's trigger survived the Escape. Red again on 2026-11-11 (twice in the full runs of two Registra branches, none touching Analisi, and once in three runs alone), then **traced and fixed the same day — NOT a flake of the page but a race of the test**: on the second opening the Scheda row is remembered open, so `aria-expanded` is true at the first render, before `landOnScheda`'s 50 ms timer lands the focus on the trigger (one landing, logged with `focusin`); the test's focus into the panel came first and was taken back, and Escape on the trigger does nothing by design (2 runs in 20, the focus on the trigger after the Escape). The test now waits for the trigger's focus before moving it; seen red 3/3 with the timer at 300 ms and a 400 ms pause, green 10/10 as it is.
  - `mobile-composition.cashflow.mobile.spec.ts` «the «+» saves a row of today…» (2026-11-11): red once in a full run, then in 3 runs of 8
    alone — NOT a flake but a race of the page (the focus stopped `reveal`'s glide, the row left past the window). Fixed in
    `TransactionFeed` (doc/guide/cashflow-tracciamento.md § Files); the test polls the row's place.
  - `mobile-composition.patrimonio.mobile.spec.ts` «the DOM order is the vertical order…» (2026-10-18): the test ended while
    `patchOverview`'s route callback still had the overview refetch in flight (`route.fetch: Test ended` at
    `overviewFixture.ts:73`) — a harness race of a 2,6 s test, not a page fact. Returned on 2026-11-16 on BOTH DOM-order
    tests, Patrimonio's and Panoramica's, in one full run with the trace off (green 16/16 alone): closed in
    `patchOverview` itself, whose route callback lets a fetch the test's end cut short go (`Test ended` / `has been
    closed`) — every caller at once, no assertion touched.
  - `cashflow.dividendi.spec.ts` «the form refuses…» — the BTP row detached from the picker as it was clicked (doc/guide/
    cashflow-dividendi.md § Per-page blind spots): red again on 2026-11-16, once in the full run of the parallel seeds
    (green ×4 alone right after) — the third time with this symptom, a pattern still open.
  - `assets.trade-fee.spec.ts` «a trade’s fee becomes a locked spending row…» [desktop] (2026-11-17): after the trade's
    removal its fee row was still in Firestore at the 30 s poll (1 where 0) — once in a full run on the production build
    (16,9 min, 421 green), green ×3 alone right after; the first time.
  - `bundle.lazy.mobile.spec.ts` «Allocazione › Accumulo at 390 lands where the page drew its placeholder…» [mobile]
    (2026-11-18, `next dev`): the first tile's box `null` at `e2e/lazyTabLanding.ts:72` — red 1 in 11 alone, then 1 in 7
    after the «Con vendite mirate» tour (PR #551); not the branch's (the same red with the Portafoglio modello tile's hunk reverted). A
    pattern on the dev server, not yet run on the production build.
- **A full run on the month's first three days reads a different Budget** (2026-11-03): `mobile-composition.cashflow.mobile.spec.ts` «the two cells open the right row» counted two lifted KPIs, one on those days (no pace, `liftedBlocks` skips «Fine mese»); it now reads the Italian day. Not a flake: a test written on a later day stays green until a run lands there. **A seed that ran before the Auth emulator was up** gave 12 red in one full run the same day (`seed exit=1`, the fixtures missing): wait on BOTH :8080 and :9099 before `emulators:seed`.
- **`e2e/cashflow.transfer-fee.spec.ts` was red ONCE in a full run** (2026-10-07, Windows machine, the second full run
  of PR #434, which did not touch transfers): green alone and in the suite's order, cause not traced. A second red
  there is a pattern, not noise — note the run before re-running it. **`e2e/cashflow.mobile.spec.ts` › «every tab of the
  pill is at least 44×44» was red ONCE the same way** (2026-10-11, the full run of PR #452, the Panoramica's composition, which did not touch the pill):
  «Dividendi» read 43,99999237 px against `>= 44`, a sub-pixel reading of the 44px tab; green ×2 alone right after
  (`--repeat-each=2`). If it returns, compare with `Math.round` or a half-pixel tolerance rather than widening a timeout. **`e2e/bundle.lazy.spec.ts` › Analisi was red ONCE
  the same way** (2026-10-08, the first full run on Next 16.4, PR #436): `apiResponse.text: Response has been disposed`
  inside `holdChunks`' route handler (`chunkProbe.ts:61`) — a chunk fetched by the handler was disposed before its body
  was read, i.e. the page had moved on; green ×2 alone right after (`--repeat-each=2`). If it returns, read the body
  inside a `try` and `route.continue()` on the disposed one rather than widening a timeout. **`e2e/cashflow.dividendi.spec.ts` › «the form
  refuses in the reading line…» was red ONCE the same way** (2026-11-08, a full run that did not touch the Dividendi): the
  picker's BTP option was not clicked within 30 s; green alone right after (4/4). A second red there is a pattern, not noise.

## The suite's speed

**Since 2026-11-16 the whole run is served from a production build** (`npm run test:e2e` = `npm run e2e:build`, then
`E2E_SERVER=build playwright test`), while an area run (`npx playwright test e2e/<area>`) keeps `next dev`, which a
change needs no build for. The three levers decided on 2026-11-13 were implemented that day, each measured alone in a
whole run, on the Windows machine (8 logical cores, 31,5 GB, Playwright 1.62.1, Next 16.4.2), same day:

| Run (2026-11-16) | Tests | Wall | Before the first test | Sum of the tests | Outcome |
| --- | --- | --- | --- | --- | --- |
| The start: `next dev`, `trace: 'retain-on-failure'`, seeds in series | 403 | 17,1 min | 40,2 s | 965 s | 402 green, 1 skipped |
| Lever 1 — the trace off, first run | 403 | 16,0 min | 28,3 s | 909 s | 400 green, 2 red (`patchOverview`'s race, above), 1 skipped |
| Lever 1 — the trace off, second run | 403 | 17,8 min | 60,8 s | 986 s | 402 green, 1 skipped |
| Lever 2 — the seeds in parallel (trace back on) | 403 | 19,5 min | 29,5 s | 1111 s | 401 green, 1 red (the Dividendi flake, above), 1 skipped |
| Lever 3 — the production build, `npm run test:e2e` | 403 | **11,8 min** | 17,9 s | **670 s** | 402 green, 1 skipped |
| The session's gate, `npm run test:e2e` with its rebuild (the docs had changed) | 403 | 12,3 min | — | — | 402 green, 1 skipped |

- **Lever 1 was measured and NOT kept**: on the 400 tests green in all three, 961 s with the trace → 903 s and 982 s
  without, inside the run-to-run noise (two equal runs differ by up to ~15%: the lever-2 run's tests took 1111 s, a
  lever that touches no test). On 2026-11-13 the same switch measured −29%, but that day's dev runs carried first-visit
  costs of up to 88 s per test (`allocation.consulente.report` 88,2 → 29,6 s; on 2026-11-16 it was 8,3 → 7,1 s). So
  `trace` stays `retain-on-failure` (decided by the agent on the owner's delegation, 2026-11-16): without a gain, turning
  it off only takes away the trace of the reds a whole run alone produces, as the two of that day. `--trace=off` still
  turns it off for one run.
- **Lever 2, the seeds in parallel**: `global-setup` alone went 19,7 → 7,9 s (three runs each); in a whole run the first
  test starts at 17,9–29,5 s instead of 40,2 s. The seeds write disjoint accounts; Previdenza → Coast stay a chain, and
  each seed's output is printed whole when it ends (`runSeed` in `e2e/global-setup.ts`).
- **Lever 3, the production build — −31% of wall, −31% of the tests' own time** (965 → 670 s), the six logins 8,1 →
  5,2 s. `scripts/e2eBuild.mjs` builds into `.next-e2e-build` (its own dist dir: `.next-perf` is the benchmark's and the
  census's, built with their options) only when `scripts/buildFingerprint.mjs`'s hash of the sources differs from the
  build's stamp — every file git sees, tracked or not, `e2e/` and `__tests__/` left out, plus `.env.local`; 51 s cold, ~20 s
  on Turbopack's warm cache, <1 s to say «not rebuilt». `scripts/perfServe.mjs --port=3100 --dist=.next-e2e-build
  --env-local --fresh` serves it: the emulator variables first, then `.env.local` with Next's own `@next/env` (which
  never overrides them; without it the Consulente, a dynamic page, reads no key). **Two guards against a stale build**,
  both seen working that day: `--fresh` refuses a build whose stamp is not the tree's («The build in .next-e2e-build is
  not the build of the code as it stands» — a doc edited WHILE `test:e2e` builds changes the hash too, and the run
  stops before its first test: touch nothing until the server is up, 2026-11-17), and on the build `reuseExistingServer` is off — a server already on :3100
  (a `dev:e2e`, the owner's other app) stops the run with Playwright's «already used» instead of being tested. The
  eleven chunk tests were rewritten on signatures that survive minification (doc/guide/e2e-playwright.md § What a page DOWNLOADS), green on
  both servers and each seen red with its mutation on both. `shell.boot`'s hydration checks pass on the build.
- **The measures of 2026-11-13 that still hold**: the first visit of each page costs `next dev` 20,6 s in a whole run (49
  paths, 1236 requests; `.next-e2e/dev/cache` is Turbopack's persistent cache, 1,3 GB) — gone on the build; the six logins
  are slower on `next dev` (15,9 s against 3,7 that day); before lever 2, `global-setup`'s eight seeds were ~5 s each in
  series, nearly all of it the start of `npm run` + `tsx`.
- **Sharding by account does not pay as the accounts stand**: the base account is 59 files, 254 tests and 77% of the
  time (772 s; degraded 56 s, analisi 55 s, hof 44,5 s, split 44 s, centri 29 s), so the wall stays the base account's.
  Cloning it means `test-user-1` in 21 specs and 2 helpers, about 35 files that write to it, about 40 fixed ids
  (`seed-*`, `e2e-*`) in root collections and three seeds to parametrise; `hof` must precede `hof-mobile`, and
  `global-setup` logs every parked session out on each invocation. Playwright has `projects[].workers` but no exclusion
  between two projects of one account. **And the trace serialises the workers**: three accounts on three workers went
  49,3 → 40,2 s with it (the CPU at 1,7 cores of 8) and 42,1 → 21,9 s without; four workers on the base account with the
  trace made each test 3–7× slower. One port is enough on a production server.
- **Not done, by the decision of 2026-11-13**: no sharding (above). Left for a later session, if ever: the Dividendi
  picker flake (§ The full run and its known flakes; the `overview.mobile` six-figure one closed on 2026-11-18).

Time per area on 2026-11-13, `next dev` with the trace · production without it (the specs of an area: its guide's § *Files*):
Consulente 207 · 73 s; Cashflow's Tracciamento, accounts, mortgage and fee 140 · 92; Patrimonio 82 · 51; Assistente 64 · 33;
Analisi 53 · 28; Previdenza 48 · 33; FIRE 45 · 29; Divisione 42; Hall of Fame 41 · 23; Panoramica 38 · 23; Allocazione
34 · 20; Impostazioni 34 · 18; motion 31 · 24; Centri 27 · 13; Rendimenti 27 · 17; Dividendi 16 · 10; Storico 15 · 11;
bundle 12; Budget 10 · 8; shell 9 · 4.
