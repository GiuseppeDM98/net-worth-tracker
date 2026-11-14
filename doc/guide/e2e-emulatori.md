# E2E ed emulatori

> **When to open this guide** — anyone writing or changing a seed in `scripts/seed*.mts` / `scripts/seedEmulator.ts`, `scripts/mirrorProdAccount.mts`, a throwaway emulator exercise, starting or stopping the emulators and the dev servers, or proving that a refactor changed no number. **The Playwright half — the projects, the fixtures a spec plants, the page-reading traps, the full run and its known flakes — is `doc/guide/e2e-playwright.md` since 2026-11-11** (this file had passed 500 lines; the text moved whole, its section title unchanged). `AGENTS.md` keeps the stub with the essentials (`AGENTS.md § Emulator Exercise Scripts`); here is the full rule. The environment (JDK, emulators, Playwright, accounts and fixtures) is owned by `SETUP.md` → Steps 6-7; the translation of all this into a guided verification is `WORKFLOW.md` § 3.

## Files

- **E2E ed emulatori**: `playwright.config.ts`, `e2e/*.spec.ts`, `e2e/global-setup.ts`, the six `e2e/auth*.setup.ts` + `e2e/persistedCache.ts` (the helper that keeps the persisted query cache out of the parked sessions), `e2e/freshnessProbe.ts` (the helper that records what a load showed and reads what the app persisted), `e2e/shellBoot.ts`, the seeds `scripts/seedEmulator.ts` + `scripts/seed*.mts` (`seedPensionE2E`, `seedAnalisiE2E`, `seedCoastFireE2E`, `seedCostCentersE2E`, `seedSplitE2E`, `seedHallOfFameE2E`, `seedInstrumentProfilesE2E` + `scripts/instrumentProfileFixtures.ts`, the Esposizione's Yahoo profiles shared by the base seed and the E2E re-stamp, `seedCensusE2E` — the first-screen census's account `census@example.com`, not a Playwright fixture: `npm run mobile:census` re-seeds it on the `perf:serve` build at :3200 — the port it shares with `perf:*`, never with :3100 — and writes `.mobile-census/` (gitignored), doc/guide/prima-schermata.md), the production mirror `scripts/mirrorProdAccount.mts` (`npm run mirror:seed` / `mirror:remove`), throwaway exercises `scripts/*.tmp.mts` (untracked), the tour's windows `scripts/collaudo-finestre.mts` (visible, signed in, self-closing; WORKFLOW.md § 3 Obligation 5); npm scripts `test:e2e` / `e2e:seed*` / `dev:e2e` / `emulators` / `emulators:seed` / `dev:emulator`

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
  (every surface «NOT SETTLED») on a build that settles fine by hand was a game running on the machine: check the
  process list before doubting the code.

## Emulator Exercise Scripts
- **An expected string typed by hand never matches an Intl amount** (2026-11-07, a throwaway emulator check of the cashflow block): it-IT puts U+00A0
  between the figure and «€», so a `toEqual` on lines written with a plain space fails on a diff whose two sides
  look identical. Normalise `/[  ]/g` to a space in the throwaway, or build the expectation with the formatter.
- **A module two scripts or a test share is a `.ts`, imported with no extension** (2026-11-03, `scripts/mirrorCollections.ts`):
  `tsc` refuses a path ending in `.mts` (TS5097, no `allowImportingTsExtensions`); a top-level await still wants the `.mts` entry.
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
  (two `include` lines per dist dir — check it out again) and keeps writing briefly after it is stopped (delete the
  dir after the process is gone). **A throwaway server WITHOUT a key of `.env.local`** (2026-11-07, «Servizio AI non
  configurato»): `cmd /c set X=` DELETES the variable and `@next/env` then loads the file's value; an EMPTY variable
  survives only a node→node spawn (`spawn(process.execPath, [next, 'dev', …], { env: { …, X: '' } })`, not npm or cmd).
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
  (`MIRROR_UID=… npm run mirror:remove` clears one seeded under another id). **The Consulente's reset of one account**
  (`npm run consulente:reset -- <email>`, production, dry run without `--yes`; `consulente:reset:emulator` here) is
  the only other script that touches production, and only `allocationAdvice/{uid}` with its `history`
  (doc/guide/consulente.md § The run). **What the app writes during a tour goes
  too** (2026-11-03, `TOUR_ONLY_DOCS` in `scripts/mirrorCollections.ts`, held against `firestore.rules` by
  `__tests__/mirrorCollections.test.ts`): a Consulente run leaves `allocationAdvice/prod-mirror` (and, under it, the `history` of the paths it replaced, 2026-11-08), the theme `userPreferences/prod-mirror`, a chat
  `assistantMemory/prod-mirror` and the `messages` under its thread (`recursiveDelete`: a delete does not cascade), a grant `account-access/prod-mirror`,
  and none is read from production; a new per-account document the app writes joins that list. Check after a tour by listing the emulator's collections for `prod-mirror`. A saved `.emulator-data` older than that
  date may bring a `userPreferences/prod-mirror` back at the next start: it is local and git-ignored.
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
  read `netstat -ano`, confirm each PID's command line is this repo's, then `Stop-Process -Id … -Force`. **Under the
  agent's sandbox `netstat -ano` and `Get-NetTCPConnection` may list NONE of the emulators' ports (8080, 9099, 4000)
  nor :3000 while every one of them answers** (2026-11-08): «alive or dead» is decided with a request — `curl -s -o
  /dev/null -w "%{http_code}" http://127.0.0.1:<port>/` (200 from all four) — never with the listener list. **Kill by the
  TREE's PIDs, never by a loose command-line pattern** (2026-11-08): list `Win32_Process` filtered on this repo's path,
  read each command line, then `taskkill /PID <pid> /T /F` on the wrappers you started; a filter on
  `start-server.js` without the port killed the owner's `next dev` (its inner process carries no «dev» in its own
  command line), and `*next*build*` killed the dev server's Turbopack workers (their path is `.next\dev\build\chunks`). **A port 3000
  held by another app sends `next dev` to 3001 on its own** (2026-09-19: a foreign app answered `/login` with a redirect
  to `/it/login`, and the probe waited for a form that never came): read the «Local:» line of the dev log first.
  **A port 3100 held by another app is REUSED by Playwright** (`reuseExistingServer` is on locally, the port fixed in
  `playwright.config.ts`; 2026-10-08 and 2026-10-12, the owner's other project on `next start --port 3100`): the suite
  would run against the wrong app. Before a suite, read the command line of :3100's PID; if it is not this repo's
  `dev:e2e`, the owner stops it — the agent never does.
- **After a long session the Firestore emulator can refuse every gRPC WRITE while REST still answers** (2026-09-29,
  Windows machine: two full suites, six partial runs, four benchmarks and a mirror seed in one evening, the JVM at
  2,5 GB): `global-setup` died on the Centri seed's `WriteBatch.commit` with `4 DEADLINE_EXCEEDED … after 60.0s`, the
  Admin SDK's channel, while a REST `PATCH`/`DELETE` on the same emulator took 70 ms and the app (WebChannel) kept
  working — so the tour looked healthy and every spec was unrunnable. The tell is the pair: a 60 s Admin timeout
  beside a fast `curl`. Not a defect of the seed or of the branch: export and restart the emulators (from the
  terminal that started them, so `--export-on-exit` runs) and rerun.
