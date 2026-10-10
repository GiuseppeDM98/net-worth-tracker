# E2E ed emulatori

> **When to open this guide** — anyone writing or changing a Playwright spec in `e2e/`, `playwright.config.ts`, `e2e/global-setup.ts`, a seed in `scripts/seed*.mts` / `scripts/seedEmulator.ts`, `scripts/mirrorProdAccount.mts`, a throwaway emulator exercise, or proving that a refactor changed no number. `AGENTS.md` keeps the stub with the essentials (`AGENTS.md § Emulator Exercise Scripts`, `AGENTS.md § Browser-Driven E2E (Playwright)`); here is the full rule. The environment (JDK, emulators, Playwright, accounts and fixtures) is owned by `SETUP.md` → Steps 6-7; the translation of all this into a guided verification is `WORKFLOW.md` § 3.

## Files

- **E2E ed emulatori**: `playwright.config.ts`, `e2e/*.spec.ts`, `e2e/global-setup.ts`, the six `e2e/auth*.setup.ts` + `e2e/persistedCache.ts` (the helper that keeps the persisted query cache out of the parked sessions), `e2e/freshnessProbe.ts` (the helper that records what a load showed and reads what the app persisted), `e2e/shellBoot.ts`, the seeds `scripts/seedEmulator.ts` + `scripts/seed*.mts` (`seedPensionE2E`, `seedAnalisiE2E`, `seedCoastFireE2E`, `seedCostCentersE2E`, `seedSplitE2E`, `seedHallOfFameE2E`, `seedInstrumentProfilesE2E` + `scripts/instrumentProfileFixtures.ts`, the Esposizione's Yahoo profiles shared by the base seed and the E2E re-stamp, `seedCensusE2E` — the first-screen census's account `census@example.com`, not a Playwright fixture: `npm run mobile:census` re-seeds it on the `perf:serve` build at :3200 — the port it shares with `perf:*`, never with :3100 — and writes `.mobile-census/` (gitignored), doc/guide/velocita.md § Il censimento della prima schermata), the production mirror `scripts/mirrorProdAccount.mts` (`npm run mirror:seed` / `mirror:remove`), throwaway exercises `scripts/*.tmp.mts` (untracked); npm scripts `test:e2e` / `e2e:seed*` / `dev:e2e` / `emulators` / `emulators:seed` / `dev:emulator`

## Proving a refactor changed no number
- **Measure the noise floor BEFORE interpreting a diff**: anything downstream of `new Date()` drifts (cents at two
  minutes, ~0,25 € at forty), so two dumps of unchanged code come first and whatever they disagree on is not your change.
  **The valid comparison is old-vs-new MINUTES apart**: `git checkout --` the modified files, delete the new ones, dump,
  restore from a patch (`git diff > …` + `git apply --include=…`, a whole-tree patch fails on files never reverted).
- **Compare the SET of rendered values, not the page text** (a redesign moves everything): every euro amount and
  percentage of the old dump must match one of the new within the noise floor — new values are the feature, missing
  old values the bug. Drive it from a throwaway Playwright spec that opens every collapsible and samples charts by
  hovering at fixed fractions of their width, so figures behind a disclosure or inside a tooltip are captured too.
- **A diff the noise floor could not show is settled with the browser's clock, not with a rebuild** (2026-09-29,
  2026-09-29): two dumps six minutes apart drifted on nothing, but the after dumps — taken seventy minutes after the
  befores — moved 21 FIRE figures by one euro (1.076.926 → 1.076.925 €: the requirement and the deflated pensions are
  functions of `new Date()`, at ~1 € per million per hour). Re-dump the surface on the NEW build with
  `context.clock.setFixedTime(<the before dump's instant>)` — `Date.now()` frozen, timers real, the app runs — and
  compare with that before dump: identical sets mean the refactor changed nothing, and the whole check costs one
  surface, not a checkout and two production builds. The dump records `at` and each surface's `ms` for exactly this.
- **Freeze the clock at SEVERAL instants, not today's** (2026-09-30, the expense windows): the same real data read
  «today», on a 15 March (the Budget's six bars reach into last year) and on a 10 January (last year has just
  closed) exercised every branch of the windows on the mirror at no extra cost — a frozen clock makes the app live
  any day — and with the clock frozen the noise floor between two dumps of unchanged code was ZERO, so a single
  value lost is a finding. Two were: a chart that ranks on rows after «today» (Analisi's Andamento) and a history
  that reads up to a snapshot the frozen clock had not reached yet (FIRE). And a spec that never sees a page settle
  (every surface «NOT SETTLED») on a build that settles fine by hand was a game running on the laptop: check the
  process list before doubting the code.

## Emulator Exercise Scripts
- **On Windows, start `next dev` from PowerShell through the npm script** (2026-09-20): launched from Git Bash as
  `npx cross-env … next dev -p 3200` the server answered every `[param]` route with Next's own 404 page while static
  routes worked — `PUT /api/dividends/<id>` read as «not found» for ten checks — and the same code started from
  PowerShell resolved them (the cause was not isolated). The tell is an HTML 404 where the handler would answer 401 without a token. A second
  server beside another project's :3000 takes its port from the environment (`$env:PORT = '3200'; npm run
  dev:emulator`): PowerShell 5.1 eats the `--` of `npm run … -- -p 3200`.
- **An exercise can drive the ROUTES** (`scripts/*.tmp.mts`): an ID token from the Auth emulator's
  `accounts:signInWithPassword`, the mutations over HTTP, fixtures and read-backs with the Admin SDK — the way to
  exercise a `server-only` module, which a script cannot import.
A collection whose value is in the *wiring* gets one: the unit suites mock Firestore away, so only an exercise covers
the rules permitting the writes, real `Timestamp` values surviving `removeUndefinedDeep` and the real atomic transaction.
- **A throwaway is an `.mts` FILE run from INSIDE the repo** (`scripts/*.tmp.mts`, untracked, deleted in phase G): a
  `.ts` script is CJS under tsx with no top-level await (nor has `npx tsx -e`); a bash heredoc with an apostrophe or a
  backtick dies with «unexpected EOF» before running a line (2026-08-25) — and the tracked files are CRLF on a Windows
  clone, so an exact-match patch from a script must normalise `\r\n` before comparing and restore it on write
  (2026-09-07); from the session scratchpad `firebase-admin`
  fails with `ERR_MODULE_NOT_FOUND` and the seed dies silently before the login it was meant to enable. A throwaway
  Playwright spec likewise lives in `e2e/` (it must match a project's `testMatch`), may override the session with
  `test.use({ storageState: { cookies: [], origins: [] }, viewport, deviceScaleFactor, colorScheme })` and log in
  through the form; a README capture hides the Next dev badge first (`page.addStyleTag({ content: 'nextjs-portal {
  display: none !important; }' })`).
- **Drive the mutations through the app's services** (client SDK, rule-evaluated) and the script's own reads and fixture
  edits with the Admin SDK — from an `.mts` file a `doc()` imported there rejects a `db` built here while sign-in still
  works, which makes the failure look unrelated. Verify by **two independent paths** (the expected figure computed in
  the script from the same real snapshots; a same-code-path comparison is circular).
- **On a shared account an exercise cannot pin ABSOLUTE values** (a pension exercise expecting 10.000 read 39.800 —
  another seed's fund was still there): derive the expectation from what is ACTUALLY in the collection, then assert the
  planted record is contained in it. **A throwaway fixture must not share document ids with the seed**
  (`{uid}-{year}-{month}` is the trap): deleting it would delete the seed's rows — re-seed if it happens.
- **A stale `.next-e2e` serves stale CSS as readily as stale routes**: a 404 on a route that exists, or a BRAND-NEW CSS
  custom property reading `''` in the browser while it is in `app/globals.css` (2026-08-30, `--chart-6/7/8`), is that
  cache. Delete the dist dir and restart before doubting your edit; prefer a fresh `NEXT_DIST_DIR=.next-throwaway`
  (keep the `.next-` prefix, what `.gitignore` matches) over someone else's; `next dev` rewrites `tsconfig.json`
  (check it out again) and keeps writing briefly after it is stopped (delete the dir after the process is gone).
  **The plain `.next` can hold a PRODUCTION build** (`BUILD_ID`, `standalone/`, `routes-manifest.json`, 2026-09-24):
  `npm run dev:emulator` on it served `/login` and `/dashboard` but answered 404 on `/dashboard/fire-simulations` and
  on `/api/dashboard/overview` — routes that exist — while the `.next-e2e` server on :3100 served them; deleting
  `.next/dev` alone did not cure it. The tour server goes on `NEXT_DIST_DIR=.next-throwaway` too.
- **A Firestore `DELETE` on a missing document answers 200**, so a phase-F cleanup aimed at the wrong collection reports
  success. Know where each write lands: a registration plants `users/{uid}` AND `assetAllocationTargets/{uid}`
  (`setSettings` writes there, NOT to a `settings` collection — verified 2026-08-30); a throwaway account that logs in
  also leaves `dashboardOverviewSummaries/{uid}` (written on the first dashboard visit). Confirm with
  `listCollectionIds` and a `GET` per candidate, then grep the exported `output-0` for the uid before calling the
  restore done.
- **Reading PRODUCTION for a realistic test — read-only, and only this way** (2026-09-06): a throwaway `.mts` inside
  the repo with the Admin SDK initialised from `.env.local` (`import nextEnv from '@next/env'` — it is CJS, the named
  `loadEnvConfig` import fails) that calls nothing but `.get()`; a guard that refuses to run with
  `FIRESTORE_EMULATOR_HOST` set; the dump written to the session scratchpad, never into the repo, and deleted with the
  script. The analysis then runs the REAL pipeline functions over the dump with the client SDK routed to the (down)
  emulators (`NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true` + the demo `NEXT_PUBLIC_FIREBASE_*` vars), so nothing it does
  can reach production. Production data has names with a leading space and rows at quantity 0: `trim()` and
  `quantity > 0` are not hygiene, they are correctness.
- **A production MIRROR in the emulators, for a tour on real data** (2026-09-07): `npm run mirror:seed -- <email>` and
  `npm run mirror:remove` (`scripts/mirrorProdAccount.mts`). Two PROCESSES in one command, never one — the parent reads
  production (the dump rules above: `.get()` only, refuses `FIRESTORE_EMULATOR_HOST`) and spawns itself as a child WITH
  the emulator variables, the dump on its stdin, because the env var is per process and one Admin SDK cannot see both;
  nothing touches the disk. The child re-keys everything to `prod-mirror` (`userId` on every row, the snapshot ids
  `{uid}-{y}-{m}`, the per-user docs), creates `mirror@example.com` / `test1234`, and leaves the caches out so the app
  recomputes with the current math. The account is a standard; the data is removed at the end of the session
  (`MIRROR_UID=… npm run mirror:remove` clears one seeded under another id).
- **Stopping the emulators: export FIRST, then kill.** `--export-on-exit` runs only on a SIGINT delivered to the
  `firebase` CLI process itself: on macOS `kill -INT <cli pid>` does it (2026-09-06) — but not reliably on emulators started as
  a background task of the agent's session (2026-09-20: 80 s with no export and the ports still held; the hub's export below
  answered 200 and moved the mtime, then a plain kill); on Windows, where only the wrapper
  can be killed, POST `http://127.0.0.1:4400/_admin/export` with `{"path": "<abs>/.emulator-data"}` (forward slashes —
  a backslashed path 400s; `/emulators/export` 404s), then terminate. **Verify the directory's mtime moved**: a 200 with
  an unchanged mtime is the failure that looks like success — and a path that lost its slashes (`C:UsersGiuseppe…`,
  2026-09-13) still answers 200 and writes a full export into a directory of THAT name in the repo root, which `git
  status` then shows as untracked: delete it. **Stopping a background task (`TaskStop`) kills only the npm wrapper**
  (2026-09-19): `next dev`, the `firebase` CLI and the Firestore `java` stay LISTENING on 3000/4000/4400/8080/9099 —
  read `netstat -ano`, confirm each PID's command line is this repo's, then `Stop-Process -Id … -Force`. **A port 3000
  held by another app sends `next dev` to 3001 on its own** (2026-09-19: a foreign app answered `/login` with a redirect
  to `/it/login`, and the probe waited for a form that never came): read the «Local:» line of the dev log first.
- **After a long session the Firestore emulator can refuse every gRPC WRITE while REST still answers** (2026-09-29,
  Windows laptop: two full suites, six partial runs, four benchmarks and a mirror seed in one evening, the JVM at
  2,5 GB): `global-setup` died on the Centri seed's `WriteBatch.commit` with `4 DEADLINE_EXCEEDED … after 60.0s`, the
  Admin SDK's channel, while a REST `PATCH`/`DELETE` on the same emulator took 70 ms and the app (WebChannel) kept
  working — so the tour looked healthy and every spec was unrunnable. The tell is the pair: a 60 s Admin timeout
  beside a fast `curl`. Not a defect of the seed or of the branch: export and restart the emulators (from the
  terminal that started them, so `--export-on-exit` runs) and rerun.

## Browser-Driven E2E (Playwright)
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
- **A full run where every spec that calls a route is red is the suite's dev server, not the routes** (2026-09-29,
  Windows laptop: 18 red of 154 in 13,5 min — the Esposizione, the Dividendi form, «Crea snapshot», an Impostazioni
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
- **What a page DOWNLOADS is asserted by chunk CONTENT** (`e2e/chunkProbe.ts`, 2026-09-30): chunk names change every
  build, so `probeChunks` reads each body for a library's module path (`node_modules/d3-sankey/`) or a function only one
  module defines — never OUR module's path, which the importer's chunk also names in its `import()` loader, and never a
  word a comment could hold (dev chunks keep comments). To measure a placeholder against what replaces it, HOLD the
  chunk until the test releases it (`holdChunks`) — a fixed delay loses the race to a preload — and navigate to
  `domcontentloaded`: a held chunk requested before `load` means `load` never fires. The suite runs `next dev`, so these
  prove an import is lazy; sizes are `perf:budget`'s. Worked example: `e2e/bundle.lazy{,.mobile}.spec.ts`.
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
  `cashflow.split.spec.ts` asserted Tarsio's «100 €» on the whole region and was satisfied by «1100 € di spese
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
  the file. `e2e/global-setup.ts` runs every seed, in order Previdenza → Coast → degraded → Analisi, on EVERY
  invocation: a new fixture is an `npm run e2e:seed:*` script plus one `spawnSync` there, and a test that patches
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
- **`e2e/cashflow.transfer-fee.spec.ts` was red ONCE in a full run** (2026-10-07, Windows laptop, the second full run
  of PR #434, which did not touch transfers): green alone and in the suite's order, cause not traced. A second red
  there is a pattern, not noise — note the run before re-running it. **`e2e/bundle.lazy.spec.ts` › Analisi was red ONCE
  the same way** (2026-10-08, the first full run on Next 16.4, PR #436): `apiResponse.text: Response has been disposed`
  inside `holdChunks`' route handler (`chunkProbe.ts:61`) — a chunk fetched by the handler was disposed before its body
  was read, i.e. the page had moved on; green ×2 alone right after (`--repeat-each=2`). If it returns, read the body
  inside a `try` and `route.continue()` on the disposed one rather than widening a timeout.
- **A green suite on the emulators says nothing about a server dependency's MODULE LOADING on Vercel** (2026-10-08):
  `verifyIdToken` skips the signature against the Auth emulator, so the `jwks-rsa → jose` chain of firebase-admin never
  ran under Playwright, and 173 green tests preceded a deploy where every Admin route answered 500 (`ERR_REQUIRE_ESM`;
  AGENTS.md § Server Layer has the rule and the cure). The check that exists for that: the standalone production build
  on the laptop with the real credentials, probed with a forged token (expected 401 with the audience error in the log,
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
  100 ms apart agree on. **Renaming an `aria-label` breaks every spec that matched its old substring** («Modifica asset» →
  «Modifica {name}», `assets.bond.spec.ts` on 2026-09-14): grep `e2e/` for the old name in the same commit.
- **After Escape a vaul drawer is still in the DOM for ~1,5 s, and `main` sits under an `aria-hidden` ancestor all
  that time** (2026-09-18, at 390): `getByRole(…)` on anything in the page counts 0, so a step that comes right after
  closing a `ResponsiveModal` on a phone reads as «the button is not there» — a capture script skipped the armed-delete
  screenshot that way. Wait for `getByRole('dialog')` to be hidden (or for the control itself), never a fixed 400 ms.
- **`npx playwright test … | grep … | head -N` hides the verdict** (2026-09-18): `global-setup` prints ~14 «✓ …» seed
  lines that fill `head` first — filter on `"\[(desktop|mobile)\]|[0-9]+ (passed|failed)"`. **A falsification must fail
  on the assertion it is about**: break ONE behaviour at a time, or an earlier assertion goes red and proves nothing.
  **Shoot the SETTLED frame**: right after `dialog.waitFor()` a vaul drawer is half-way up (~500 ms) and a button is
  mid colour-transition — ~800 ms before a capture, never before an assertion.
- **A spec that needs a server-computed FLAG forces it on the RESPONSE** (2026-09-18, `e2e/panoramica.snapshot.spec.ts`:
  `page.route` + `route.fetch()` + `route.fulfill({ response, json })`): planted data goes stale at the month's turn,
  and without the flag the click under test WRITES a snapshot.
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
  `Intl` puts a NARROW no-break space (U+202F) before `€`, the browser a plain one (U+00A0) — flatten both sides. A
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
  `mobile`, `*.degraded.spec.ts` → degraded, and only a name containing `analisi.spec.ts` reaches the Analisi fixture
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
