# E2E — the whole run: its server, its known flakes, its speed

> **When to open this guide** — before and after `npm run test:e2e` (the whole Playwright suite): reading a red that only
> a full run produces, deciding whether it is a known flake (`--repeat-each=3`, a second red of the same test is a
> pattern), or touching what serves the run (`scripts/e2eBuild.mjs`, `scripts/buildFingerprint.mjs`,
> `scripts/perfServe.mjs`, the `webServer` of `playwright.config.ts`) or what gives each of its four workers a universe
> (`e2e/emulator.ts`, `lib/firebase/emulatorProject.ts`, since 2026-11-26). Split out of `doc/guide/e2e-playwright.md` on
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
  build on 2026-11-16, 585 in 8,6 min on four workers on 2026-11-26 (§ The suite's speed). **A test the report
  calls «flaky» — red, then green at its one retry — is read like a red** (since 2026-11-26 the retry is what records
  the trace: `npx playwright show-trace test-results/<test>-retry1/trace.zip`). Each flake below was red once or twice in a full run and green alone right after
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
  - `allocation.consulente.report.spec.ts` «Salta le domande» while the round is still asked (2026-11-24): the revision's
    `interview.rounds` held a round with the request «niente ornitorinchi» that the test expected empty, in the 564-green
    full run of 2026-11-24 (the columns session; no Consulente file touched); green alone (16/16). Not traced: a second red of it is to be.
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
  - `cashflow.dividendi.spec.ts` «the form refuses…» — red once in a full run on 2026-09-30, 2026-11-03, 2026-11-08,
    2026-11-16 and 2026-11-19, never alone: **closed on 2026-11-19 in the page, not the spec**. The dialog focuses the
    picker at open, the submit's click blurs it and the refusal focuses it back at once; `SearchableCombobox`'s pending
    blur (200 ms) then closed it under the browser's focus, and «BTP» typed opened no list. `handleFocus` clears the
    pending blur (`__tests__/searchableComboboxRefocus.test.tsx`, red without it); 8/8 alone after.
  - `assets.trade-fee.spec.ts` «a trade’s fee becomes a locked spending row…» [desktop] (2026-11-17): after the trade's
    removal its fee row was still in Firestore at the 30 s poll (1 where 0) — once in a full run on the production build
    (16,9 min, 421 green), green ×3 alone right after; the first time. Red 3 in 4 on `next dev` on 2026-11-24 (2 in 3
    on the commit before), then **traced and fixed — NOT a flake but a race of the page**: the trace showed the DELETE
    answered 409, sent with the `updatedAt` of the copy restored from before the edit while the dialog reread it;
    Movimenti now holds a row's actions during that reread (doc/guide/registro-operazioni.md § Concurrency). 8/8 after.
  - `bundle.lazy.mobile.spec.ts` «Allocazione › Accumulo at 390 lands where the page drew its placeholder…» [mobile]
    (2026-11-18, `next dev`): the first tile's box `null` at `e2e/lazyTabLanding.ts:72` — red 1 in 11 alone, then 1 in 7
    after the «Con vendite mirate» tour (PR #551); not the branch's (the same red with the Portafoglio modello tile's hunk reverted). A
    pattern on the dev server; on the production build too (2026-11-18, the full run of PR #553, 433 green): red once in
    the full run, 1 in 4 alone, and 1 in 9 on develop's code (the branch stashed): **closed on 2026-11-19 in the spec, not the page**
    (red again once in a full run, 3 in 7 alone). The tile was found by `section:not([aria-label^="Verdetto"])`, which also
    matched the placeholder's UNLABELLED `section`, still mounted a frame or two after the chunk lands; measured while
    React removed it, its box was `null`. The routine now waits for the placeholder's `status` to go and reads
    `section[aria-label]`; 16/16 alone after.
- **A full run on the month's first three days reads a different Budget** (2026-11-03): `mobile-composition.cashflow.mobile.spec.ts` «the two cells open the right row» counted two lifted KPIs, one on those days (no pace, `liftedBlocks` skips «Fine mese»); it now reads the Italian day. Not a flake: a test written on a later day stays green until a run lands there. **A seed that ran before the Auth emulator was up** gave 12 red in one full run the same day (`seed exit=1`, the fixtures missing): wait on BOTH :8080 and :9099 before `emulators:seed`.
- **`e2e/cashflow.transfer-fee.spec.ts` was red ONCE in a full run** (2026-10-07, Windows machine, the second full run
  of PR #434, which did not touch transfers): green alone and in the suite's order, cause not traced that day. It came
  back five times on 2026-11-26, always on an overloaded machine (six workers, three with the trace): «the fee is
  edited from its transfer» timing out at 150 s on `fill('#fee')`. **Traced and closed that day — NOT a flake but a
  fault of the page**: the third «Modifica» opened on the list a reload restores from the persisted cache (written at
  most once a second), whose row still pointed at the fee the save before had deleted; `getFeeOf` read that pointer
  with `getDoc`, the rule on `expenses` denies a `get` of a document that is gone (`resource.data.userId` of nothing),
  and the form called the fee «non è stata letta» and kept «Commissione» disabled — the field `fill` waited for. The
  lookup is now a query on the fee's back-pointer (doc/guide/cashflow.md § Expense Sign Convention and Type Changes, «A row's fee is a ROW of its own»), held by
  `__tests__/expenseFeeLookup.test.ts` and by a planted test in the spec («a transfer still pointing at a fee that is
  gone…», red before the fix with `#fee` disabled). **`e2e/allocation.consulente.book.mobile.spec.ts` «the footer
  stacks…» was red once at six workers the same day**: its boxes were read one round trip at a time while the page
  still entered; they are read with the page at rest (`atRest`, `e2e/atRest.ts`). **`e2e/cashflow.mobile.spec.ts` › «every tab of the
  pill is at least 44×44» was red ONCE the same way** (2026-10-11, the full run of PR #452, the Panoramica's composition, which did not touch the pill):
  «Dividendi» read 43,99999237 px against `>= 44`, a sub-pixel reading of the 44px tab; green ×2 alone right after
  (`--repeat-each=2`). If it returns, compare with `Math.round` or a half-pixel tolerance rather than widening a timeout. **`e2e/bundle.lazy.spec.ts` › Analisi was red ONCE
  the same way** (2026-10-08, the first full run on Next 16.4, PR #436): `apiResponse.text: Response has been disposed`
  inside `holdChunks`' route handler (`chunkProbe.ts:61`) — a chunk fetched by the handler was disposed before its body
  was read, i.e. the page had moved on; green ×2 alone right after (`--repeat-each=2`). If it returns, read the body
  inside a `try` and `route.continue()` on the disposed one rather than widening a timeout. `e2e/cashflow.dividendi.spec.ts` › «the form
  refuses in the reading line…», red on 2026-11-08 with the same timeout, was not this race: the combobox's own, closed
  on 2026-11-19 (above).

## The suite's speed

### Four workers, each in its own universe (2026-11-26)

**The whole run (`npm run test:e2e`) uses four workers since 2026-11-26; an area run stays one worker on `next dev`.**
Measured on the Windows machine (Core Ultra 7 258V: 4 fast cores + 4 slow, no hyper-threading; 31,5 GB; Playwright
1.62.1; the production build), whole runs:

| Whole run (2026-11-26) | Tests | Wall | Outcome |
| --- | --- | --- | --- |
| The start: one worker, `trace: 'retain-on-failure'` | 574 | 22,1 min (1325 s) | 574 green |
| Four workers, a project and a server each, the trace off (the probe, twice) | 574 | **8,5 min** (511 s) · **8,2 min** (490 s) | 574 green, twice |
| Six workers, the trace off (twice) | 574 | 10,0 min (598 s) · 9,8 min (589 s) | reds from contention in both |
| As implemented: four workers, the trace at the retry of a red, the fixed waits gone | 585 | **8,6 min** (540 s with its rebuild and the seeds of four projects, 23 s) | 584 green, 1 skipped by design, no test retried |

- **A universe per worker, not a clone per account.** Worker N has its own Firestore project (`demo-net-worth-wN`),
  its own server of the ONE build (`localhost:3100+N`) and its own copy of the six parked sessions
  (`e2e/.auth/wN/*.json`); worker 0 keeps `demo-net-worth`, :3100 and `e2e/.auth/*.json`, so an area run is what it
  always was. Every project is seeded with the SAME fixtures — uids, fixed ids and dates unchanged — which is why no
  spec had to learn a new name: 51 files changed, nearly all by one mechanical replacement, against ~70 with semantic
  changes for cloning the accounts (53 files name a fixture uid, 142 distinct fixed ids in root collections). **Auth
  is shared**: the Auth emulator signs every login made with the API key into its default project (the token's `aud`
  is `demo-net-worth`), and the Firestore emulator accepts that token in every project — six accounts, one login
  each, the session file copied per port by `shareSessionWithWorkers`.
- **How the app picks the project** (`lib/firebase/emulatorProject.ts`, the one rule): the browser reads it from the
  PORT the page is served on, only with `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` on (`lib/firebase/config.ts`); the server
  keeps its default Admin app on the base project for Auth (`verifyIdToken` checks `aud` on the emulators too) and
  opens a second one for Firestore on `E2E_FIRESTORE_PROJECT`, only under `FIRESTORE_EMULATOR_HOST`
  (`lib/firebase/admin.ts`; `scripts/perfServe.mjs --firestore-project=…` sets it per server). Without the emulator
  flag and host neither override exists, whatever the port and the variable say: `__tests__/emulatorProject.test.ts`
  holds it (seen red with each guard removed). `firebase.json` has `singleProjectMode: false`: with it on, the
  emulators answered every request to another project with a warning line.
- **Nothing in `e2e/` names the backend**: `e2e/emulator.ts` gives the project, the documents URL, the base URL, the
  session paths and the seed command of THE WORKER THE FILE RUNS IN (`TEST_PARALLEL_INDEX`; `playwright.config.ts` is
  loaded again in every worker process). `grep -rnE "demo-net-worth|\.auth/|localhost:31" e2e --include=*.ts` has no
  hit outside it. The first parallel launch of the probe had 9 reds, 8 of them literals: six from a seed started with
  the fixed project (the three `degraded` specs, now `runSeedSync`), one session path written out
  (`theme.egeo.spec.ts`), one project id inside a `page.evaluate` (`settings.draft.spec.ts`).
  `e2e/worker.isolation.spec.ts` checks the wiring from inside a worker (seen red on the build with each half broken).
- **`fullyParallel` stays off**: the FILES are spread over the workers, the tests of a file run in order in one worker
  — a spec still owns the documents it plants while it runs. `hof` → `hof-mobile` needs no order: the phone specs
  press «Aggiorna i record» when the document is missing.
- **Four is measured, not derived from the core count**: six workers were slower than four and red (contention). On
  the Patrimonio + Cashflow subset (69 tests, 22 files, the trace off) the tests' window was 174–177 s at one worker,
  103–114 at two, 86–117 at three, 70–97 at four, 67–75 at six, and a test took ×1,28 its one-worker time at two
  workers, ×1,8–1,9 at three, four and six (×1,44 on the whole run at four). **The bottleneck is Chromium on the fast
  cores**: the suite uses ~1,25 cores at one worker and ~4,4 at four (the browser process triples); Firestore 0,2 core,
  the four Next servers 0,6 core together (160–290 MB each). Another machine sets `E2E_WORKERS` (never
  `--workers` alone, which cannot start a server — `global-setup` refuses it).
- **The trace is recorded at the retry of a red, never for every test** (`trace: 'on-first-retry'`, `retries: 1`): a
  trace kept for every test costs 14–17% at one worker, holds at two, and from three workers up cancelled the gain in
  four launches of four (the subset at four workers: 70–97 s without it, 208 s with it; Defender takes 2–3× the CPU
  with it on). This supersedes «Lever 1 NOT kept» below, which was measured at one worker. **A test green only at its
  retry is not green**: the report counts it as «flaky» and lists it with its first failure; it is named in the
  commit message and traced like a red (§ The full run and its known flakes) — the retry exists to leave a trace, not
  to forgive.
- **The fixed waits are gone** (`e2e/atRest.ts`): at one worker `waitForTimeout` was 207,5 s of the tests' 1249 s —
  16,6%, 286 calls at 87 places. Each is now the condition it stood for: `atRest` (no finite animation, no DOM
  mutation, the same box and scroll, no visible skeleton, the fonts loaded — for 150 ms and six frames), `afterIdle`
  (the page's own idle turn, for an ABSENCE), `settledScrollTop`, `settledBox`, or a positive anchor of the case (the
  persisted cache holding the new document, the fake run's settled rounds, a chunk probe with nothing on the wire).
  ONE is kept, and says why where it stands: the 100 ms press of `panoramica.snapshot.spec.ts`, where the held press
  IS the gesture under test. No assertion was removed. **What it bought at four workers is inside the noise of the
  wall**: 8,6 min with eleven tests more, against the probe's 8,2–8,5; the tests' own time summed to 1736 s, against
  ~1800 s (1249 × 1,44) before — a condition costs its 150 ms and six frames too, and at four workers a second of
  sleep was a quarter of a second of wall. What it does buy is a wait that ends when the page is ready and FAILS,
  naming what still moves, when it never is. The rest of the 1249 s: retried assertions 475 s (38%), clicks
  waiting for an actionable control 193 s, navigations 136 s (687 `goto`, 67 `reload`), a context and a page per test
  67 s, the specs' own `GET`s 65 s, hooks 41 s, the six logins 3,9 s.
- **The seeds per project**: `global-setup` seeds every worker's project side by side, through `tsx` itself (the npm
  scripts pin the base project, and their start was most of a seed's time): four projects in 21–30 s, one in 14,7 s.
  The base seed (`scripts/seedEmulator.ts`) is laid by `global-setup` too, in every project — the base one included —
  when the project has none or has another month's (a stamp, `e2eSeedStamps/base`): the calendar drift of the base
  seed no longer waits for someone to remember four re-seeds.
- **The emulator's JVM grows with the projects**: 0,5 GB at start, 3,4–4,0 GB after two and a half hours and 27
  launches with six projects. Restart it past ~3 GB (`DEADLINE_EXCEEDED` was seen at 2,5 GB, doc/guide/e2e-emulatori.md).
- **Nothing else runs on the machine while a run is measured or gated** — no type-check, build or second suite: a
  contended run produces reds that are not the code's (`assets.archive.spec.ts` red once at four workers with a `tsc`
  running beside it, green without). **And all the workers' ports must be free**: on
  the build nothing on :3100–3103 is reused (2026-11-26: another repo's `next dev -p 3100` stopped the run at 40 s,
  «http://localhost:3100 is already used», before its first test).
- **Not done — the next step**: sharding across machines on GitHub Actions (`--shard`), which the universe per worker
  makes possible; it needs the emulators and the build on every runner.

### The production build and the three levers (2026-11-16)

**Since 2026-11-16 the whole run is served from a production build** (`npm run test:e2e` = `npm run e2e:build`, then
`E2E_SERVER=build playwright test`), while an area run (`npx playwright test e2e/<area>`) keeps `next dev`, which a
change needs no build for. The three levers decided on 2026-11-13 were implemented that day, each measured alone in a
whole run AT ONE WORKER, on the Windows machine (8 logical cores, 31,5 GB, Playwright 1.62.1, Next 16.4.2), same day:

| Run (2026-11-16) | Tests | Wall | Before the first test | Sum of the tests | Outcome |
| --- | --- | --- | --- | --- | --- |
| The start: `next dev`, `trace: 'retain-on-failure'`, seeds in series | 403 | 17,1 min | 40,2 s | 965 s | 402 green, 1 skipped |
| Lever 1 — the trace off, first run | 403 | 16,0 min | 28,3 s | 909 s | 400 green, 2 red (`patchOverview`'s race, above), 1 skipped |
| Lever 1 — the trace off, second run | 403 | 17,8 min | 60,8 s | 986 s | 402 green, 1 skipped |
| Lever 2 — the seeds in parallel (trace back on) | 403 | 19,5 min | 29,5 s | 1111 s | 401 green, 1 red (the Dividendi flake, above), 1 skipped |
| Lever 3 — the production build, `npm run test:e2e` | 403 | **11,8 min** | 17,9 s | **670 s** | 402 green, 1 skipped |
| The session's gate, `npm run test:e2e` with its rebuild (the docs had changed) | 403 | 12,3 min | — | — | 402 green, 1 skipped |

- **Lever 1 was measured and NOT kept — at one worker; superseded on 2026-11-26** (above: with four workers the trace
  is recorded at the retry of a red): on the 400 tests green in all three, 961 s with the trace → 903 s and 982 s
  without, inside the run-to-run noise (two equal runs differ by up to ~15%: the lever-2 run's tests took 1111 s, a
  lever that touches no test). On 2026-11-13 the same switch measured −29%, but that day's dev runs carried first-visit
  costs of up to 88 s per test (`allocation.consulente.report` 88,2 → 29,6 s; on 2026-11-16 it was 8,3 → 7,1 s). So
  `trace` stayed `retain-on-failure` until 2026-11-26 (decided by the agent on the owner's delegation, 2026-11-16): without a gain, turning
  it off only took away the trace of the reds a whole run alone produces, as the two of that day. `--trace=off` still
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
  or on another worker's port (a `dev:e2e`, the owner's other app) stops the run with Playwright's «already used» instead of being tested. The
  eleven chunk tests were rewritten on signatures that survive minification (doc/guide/e2e-playwright.md § What a page DOWNLOADS), green on
  both servers and each seen red with its mutation on both. `shell.boot`'s hydration checks pass on the build.
- **The measures of 2026-11-13 that still hold**: the first visit of each page costs `next dev` 20,6 s in a whole run (49
  paths, 1236 requests; `.next-e2e/dev/cache` is Turbopack's persistent cache, 1,3 GB) — gone on the build; the six logins
  are slower on `next dev` (15,9 s against 3,7 that day); before lever 2, `global-setup`'s eight seeds were ~5 s each in
  series, nearly all of it the start of `npm run` + `tsx`.
- **Sharding by account does not pay as the accounts stand** (2026-11-13; the answer of 2026-11-26 is a project per
  worker, above — the accounts stay what they are): the base account is 59 files, 254 tests and 77% of the
  time (772 s; degraded 56 s, analisi 55 s, hof 44,5 s, split 44 s, centri 29 s), so the wall stays the base account's.
  Cloning it means `test-user-1` in 21 specs and 2 helpers, about 35 files that write to it, about 40 fixed ids
  (`seed-*`, `e2e-*`) in root collections and three seeds to parametrise; `hof` must precede `hof-mobile`, and
  `global-setup` logs every parked session out on each invocation. Playwright has `projects[].workers` but no exclusion
  between two projects of one account. **And the trace serialises the workers**: three accounts on three workers went
  49,3 → 40,2 s with it (the CPU at 1,7 cores of 8) and 42,1 → 21,9 s without; four workers on the base account with the
  trace made each test 3–7× slower.
- **Not done, by the decision of 2026-11-13**: no sharding BY ACCOUNT (above). The Dividendi picker flake was
  closed on 2026-11-19 and the `overview.mobile` six-figure one on 2026-11-18 (§ The full run and its known flakes).

Time per area on 2026-11-13, `next dev` with the trace · production without it (the specs of an area: its guide's § *Files*):
Consulente 207 · 73 s; Cashflow's Tracciamento, accounts, mortgage and fee 140 · 92; Patrimonio 82 · 51; Assistente 64 · 33;
Analisi 53 · 28; Previdenza 48 · 33; FIRE 45 · 29; Divisione 42; Hall of Fame 41 · 23; Panoramica 38 · 23; Allocazione
34 · 20; Impostazioni 34 · 18; motion 31 · 24; Centri 27 · 13; Rendimenti 27 · 17; Dividendi 16 · 10; Storico 15 · 11;
bundle 12; Budget 10 · 8; shell 9 · 4.
