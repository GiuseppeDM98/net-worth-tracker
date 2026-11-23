# Guided verification in this repo — the why, the history and the measures

> **When to open this guide** — before a guided tour (WORKFLOW.md § 2) or a session that writes a seed, opens the
> owner's windows, gathers browser evidence, retires a spec or writes an Impeccable critique. WORKFLOW.md § 3 keeps the
> commands, the gates and each rule in one line; here is the full text each rule came with, moved WHOLE from that
> section on 2026-11-18 (it had passed 24.000 characters, the ceiling is 12.000): the three subsections below are its
> text as it stood that day, dates included. A new lesson about the tour goes here; its rule, in one line, in § 3.

## Obligation 5 — how to hand the owner an app already authenticated

The app **is** locally runnable; there is no fallback to declare.

- **The tour server**: `npm run dev:emulator` → `http://localhost:3000`. It reads the emulators, so
  nothing seen there can touch production data.
- **The owner's go** (§ 2, obligation 5; owner, 2026-10-05): say «pronto» and wait — here the owner starts the tour
  when they can give it at least 20 minutes, because a session left idle mid-tour is what the memory watchdog kills,
  emulators and dev server with it.
- **One `next dev` at a time.** Stop the :3100 server before the tour: it exists for the suite only.
  On 2026-09-07 three background processes (the emulators and two `next dev`) plus Playwright and
  Vitest exhausted the machine's memory and the system killed all three; an emulator killed that
  way exports nothing, so the fixtures have to be re-seeded. The tour runs on the emulators plus
  ONE server.
- **The windows: `scripts/collaudo-finestre.mts`** (2026-11-13, the § 2 helper written once): `npx tsx
  scripts/collaudo-finestre.mts --email=<fixture> --url=<path> [--url=<path>] [--title=…]` opens visible windows
  already signed in (two `--url` = one session in two windows, a comparison; the tab title starts with «Finestra N»),
  refuses a non-local base, and exits when the owner closes every window, on SIGTERM (`pkill -TERM -f
  scripts/collaudo-finestre.mts` — how the agent closes them after the owner's confirmation) or after 30 minutes.
  Run it in the background, as its own task: a throwaway seed beside it in one command dies with it.
  **On Windows** (2026-11-15): until that day the script never ran there — its CLI guard compared `import.meta.url` with
  `file://` + the path, which never matches `file:///C:/…`, so it exited 0 with no window (now `pathToFileURL`); and from
  the agent's Git Bash every `--url=/dashboard/…` is rewritten into `C:/Program Files/Git/dashboard/…` (MSYS path
  conversion): prefix the command with `MSYS_NO_PATHCONV=1`, or run it from PowerShell.
  A file the page downloads (the PDF export, the CSV) lands in Playwright's temp folder, out of the owner's sight
  (2026-11-14; the helper keeps no handle on its pages): for that item a throwaway Playwright script signs in the same
  way and saves `page.on('download')` into the scratchpad, opens it for the owner, and deletes it with the fixtures
  (it carries the mirror's figures).
- **Getting in**: the login is email/password on `/login` — no OAuth, no MFA, so it is a five-second
  manual step and also fully scriptable. Fixture identities (all password `test1234`):

  | Account | UID | What it is for |
  | --- | --- | --- |
  | `test@example.com` | `test-user-1` | The base seed: assets, expenses, snapshots — the account most tours use |
  | `analisi@example.com` | `test-user-analisi` | Everything dated to January, so year-to-date windows contain it whatever month it is |
  | `centri@example.com` | `test-user-centri` | Centri di Costo ON: «Fenicottero» (annual ceiling the calendar will cross) and «Ornitorinco» (dormant, 27 movements) — `npm run e2e:seed:centri` |
  | `degraded@example.com` | `test-user-degraded` | The states in which a return is *not* a measure — empty/degraded readings |
  | `split@example.com` | `test-user-split` | Cashflow › Divisione ON: Ghiandaia and Nibbio at 60/40, with one row dated 31 December that stays «in calendario» all year — `npm run e2e:seed:split` |
  | `hof@example.com` | `hof-user` | Hall of Fame: 47 monthly snapshots from novembre 2022 with a story (best month marzo 2024, worst ottobre 2023, a two-month first year); NO rankings document — the specs press «Aggiorna i record» — `npm run e2e:seed:hof` |
  | `census@example.com` | `census-user` | The first-screen budget's fixture (since 2026-10-10, doc/guide/prima-schermata.md): every surface with data, each option in its default state — Centri and Divisione on, a coupon, a Budget ceiling, a pension fund, 47 snapshots ending last month, one row «in calendario» on the month's last day; FIRE › Obiettivi ON with ONE invented goal since 2026-10-15, the day that tab was composed for a phone (every option in its default state) — dated relative to the run; `npm run mobile:census` re-seeds it and rebuilds its Hall of Fame (`npm run e2e:seed:census` alone does not) |

- **So the screen is not empty**: `npm run emulators:seed` for the base account, plus the fixture the
  page needs — `npm run e2e:seed` (Previdenza), `npm run e2e:seed:analisi` (Analisi),
  `npm run e2e:seed:coast` (Coast FIRE). Give the owner the **exact URL**, e.g.
  `http://localhost:3000/dashboard/pension`, not "go to Previdenza".
- **The routes** are `/dashboard` plus `assets · cashflow · analisi · performance · history ·
  allocation · pension · fire-simulations · hall-of-fame · assistant · settings` — the list of
  `perf/routes.json`, held equal to `lib/constants/navigation.ts` by a test. Dividendi is not a route:
  it is `/dashboard/cashflow?tab=dividends`.
- **The owner's REAL data, without touching production — the standard since 2026-09-07**: `npm run mirror:seed --
  <production email>` reads the production account (service account from `.env.local`, `.get()` only, refuses to run
  with `FIRESTORE_EMULATOR_HOST`) and seeds it into the emulators under `mirror@example.com` / `test1234` (uid
  `prod-mirror`), re-keyed, in one command and with nothing written to disk (`scripts/mirrorProdAccount.mts`). The
  ACCOUNT is the standard, the DATA is not: it is re-read on every seed because a month later it has changed, and
  `npm run mirror:remove` takes it out at the end of the session (phase G). It is the right tour when the change moves
  the owner's own figures (Rendimenti, Storico): a fixture proves the mechanism, the mirror shows what the owner will
  see tomorrow. It is rule 6's copy of real data: it serves the tour only, and none of its figures enters a test, a
  draft or any other tracked file (this repo is public, so rule 6 has no exception here).
- **A reading the owner cannot open with their own account**: this app has a role split — *viewer*
  (`user.uid`) vs *owner* (`ownerId`), grants in `account-access/{ownerUid}`. To show the delegated
  view, seed a grant for the second identity and log in as *that* identity (SETUP.md → Step 5b);
  do not ask the owner to reason about what a guest "would" see.
- Two areas are deliberately out of reach of a tour: the **assistant** needs
  `NEXT_PUBLIC_ASSISTANT_AI_ENABLED` and a live Anthropic key, and **email/PDF** have no DOM — they
  are verified by rendering them from a throwaway spec (doc/guide/email-pdf.md). **The PR's Vercel preview is no
  tour for an AI surface** (owner, 2026-11-07, the Consulente's scene): the preview holds the demo account alone, and
  the demo blocks every AI feature (`useDemoMode()`), so a phase F planned there is skipped — it runs on the MIRROR
  (below) with the `.env.local` key, or, by the owner's choice, in production after the deploy.

## Obligation 4 — automate it here

- **When the Claude-in-Chrome extension is not connected** («Browser extension is not connected» from
  `tabs_context_mcp`, 2026-09-13 — for the session and its sub-agents alike), do not retry it: the live
  evidence an Impeccable critique or audit needs (screenshots at 1440 and 390, `main` overflow, sub-44px
  targets, console, the `detect.js` overlay) comes from a throwaway Playwright script on the emulator
  dev server — copied into the repo root as `.tmp-*.mjs` so `import 'playwright'` resolves, deleted
  after — that logs in for real and waits on the page's `h1`, never on `networkidle` (Firestore keeps
  its sockets open). Say in the report that the evidence is Playwright's. And the tour still goes on
  the MIRROR (below), not on the fixture: the fixture proves the mechanism, the mirror shows what the
  owner will see — on 2026-09-13 the mirror surfaced a stale-value reading the fixture cannot produce. **Read the
  in-page detector's count before quoting it** (2026-09-18, Centri di Costo: 71 and 110 findings, the CLI on the same
  files 0): every Cashflow tab stays mounted and hidden (`forceMount`), so ~36 hits per scan were Tracciamento's; the
  9–11px «undersized text» is the enumerated ramp; the shell, the sidebar and the overlay's own yellow (`dark-glow
  #ffba00` on a second injection) are in there too. Count what belongs to the surface, say the rest is not its. **A probe never opens a control that SPENDS** (2026-09-20): «Analizza con AI» starts its analysis on open, and an evidence pass told to «open and press Escape» made five real Anthropic calls. Read what a control does before scripting a click on it; on Rendimenti that dialog is opened once, to check the abort, or not at all. **The session's background tasks die with it**: a restart of the Claude Code session, or its memory watchdog (on both of the owner's machines, even with memory free and even mid-suite), kills the emulators and the dev
  server alike, and an emulator killed that way exports nothing. The safe default for the owner's tour: the emulators and
  the dev server run in the OWNER's terminals, which the watchdog does not touch; the agent re-seeds the mirror, checks
  the ports and reports the URLs, and does not restart a killed process on its own. When the owner asks the agent to
  start them, say they hang on the session and check the ports before every hand-over; on Windows start each one DETACHED —
  `Start-Process cmd.exe "/c npm run <script> > <scratchpad>\<name>.log 2>&1" -WindowStyle Hidden` — which is neither a
  session task the watchdog reaps nor subject to the tools' 10-minute cap; run the full suite the same way and follow its
  log with a monitor; keep only what the step needs up (no `perf:serve` beside the suite); at the end export the
  emulators through the hub and stop every process by PID (doc/guide/e2e-emulatori.md § Emulator Exercise Scripts).
- **Throwaway fixtures** follow the existing seed pattern (`scripts/seedEmulator.ts`,
  `scripts/seedAnalisiE2E.mts`, `scripts/seedPensionE2E.mts`, `scripts/seedCoastFireE2E.mts`) or
  live as a throwaway `scripts/*.tmp.mts` inside the repo (untracked, deleted in phase G) — never in
  the session scratchpad, where `firebase-admin` does not resolve. `.mts`, never `.ts`: a `.ts` script
  is CJS under tsx and has no top-level await (doc/guide/e2e-emulatori.md § Emulator Exercise Scripts).
- **The authenticated browser already exists.** The Playwright projects park an authenticated
  `storageState` per fixture account (`e2e/.auth/<account>.json`, minted by the six `auth*.setup.ts`
  projects), so a script does not have to reproduce the login: `npx playwright test --project=<name>`,
  one of the fourteen projects of `playwright.config.ts` (SETUP.md § What it covers; the full table in
  doc/guide/e2e-playwright.md). A throwaway spec
  must match that project's `testMatch` to be collected, and must be deleted at the end.
- **Automated suites are yours to run, always**: `npx tsc --noEmit`, `TZ=Europe/Rome npx vitest run`
  and `npx playwright test`. **Playwright runs in two levels** (2026-11-13, decided by the agent on the owner's
  delegation after that day's measures: a whole run 18,2 min, an area 1–4 min; 11,8 min on the production build since
  2026-11-16 — doc/guide/e2e-suite.md § The suite's speed): while working, the specs of the area touched, in every project that collects them (each guide's
  § *Files* lists them); the WHOLE suite once, with the work finished, before the commit is asked for — and again if
  code changes after it. A change with no area (`components/ui`, `lib/hooks`, shared `lib/utils`, the shell,
  `app/globals.css`, a seed, `playwright.config.ts`, a dependency) runs the whole suite at once. § 2's obligation
  stands: nothing is declared verified with that final run unrun.
- **Assert on data, not on pixels.** Read back from the Firestore emulator —
  `curl -H "Authorization: Bearer owner" "http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents/<collection>"`;
  without that header the call is silently filtered to an empty result, which looks exactly like
  "there are no documents" — or from the API route's own response, or from the emulator UI on
  `http://127.0.0.1:4000`. Arithmetic belongs to Vitest; the browser is for what only a browser
  knows (doc/guide/e2e-playwright.md § Browser-Driven E2E (Playwright)).
- **Prove the check can fail.** Break the thing under test on purpose once and watch the assertion
  go red. A green check that has never been seen red is indistinguishable from one asserting
  nothing. **When it stays green, the sentence that motivated the test was wrong, not the test**
  (2026-09-07: «the picker overflows a 360 phone» — it did not): rewrite the claim everywhere it was
  written, keep the test as a regression guard, and say in its header which of the two it is.
- **Phase E here is the delegation boundary**: `assertCanAccessAccount`, `firestore.rules`,
  `REGISTRATION_WHITELIST`. The positive/negative pair is the owner's document against another
  account's document — same collection, same shape.
- **Phase G**: prefer deleting the few documents you created (`curl -X DELETE` with the same
  `Bearer owner` header) over wiping `.emulator-data/`, which throws away the shared seed. A
  document with side effects — a transaction or trade, whose deletion re-runs the replay — is
  deleted BY THE APP instead: a REST delete skips the replay (doc/guide/e2e-playwright.md § Browser-Driven E2E (Playwright)).
  A PAC saved on a fixture during a collaudo is a plan AND its lock: delete `accumulationPlans/<id>` and
  `accumulationPlanLocks/<uid>` both, or every «senza piano» spec of Accumulo turns red (2026-11-18, the «Con vendite mirate» tour).
- **A mock page published as an Artifact inherits the host skeleton's `body{color:#000}`** (2026-11-06, the concept
  pages of the AI surfaces' visual direction): the Artifact host prepends `:root{color-scheme:light} body{background:#fff;color:#000}` and nests the
  page inside its body, so a text colour declared on `html` is overridden for every descendant and a dark page shows
  black on black — Playwright on `file://` never shows it. A page meant for an Artifact sets `background` AND `color`
  on `body` (the page contract asks for the background alone).
- **`impeccable detect` runs its `design-system-*` checks only on a file inside the repo root** (2026-11-06, the
  check of those concept pages): a copy in the scratchpad reports 0 for that family while `low-contrast` still fires, so a
  probe page (a light copy, a themes sheet) goes in the repo root as `.tmp-*.html` and is deleted before the commit.

## Where things are recorded

- **Branches**: `develop` is the integration branch, `main` the default; a session branches off
  whatever is active (usually `develop`) and merges into it by PR. **A series of specs lands on `develop`, one
  session at a time, and reaches `main` together after its last spec is retired, by a PR the owner opens** (owner,
  2026-10-12, for the mobile-composition series, whose last spec was retired on 2026-10-17; the PERF series went to
  `main` on its own, PR #446). While a series is open, its index's status table says which spec is in `develop`.
- **A spec is retired by a session of its own** (since 2026-09-28: the fourteen PERF specs, then the nine MOB ones —
  their history in README.md § Documentation): the code is read against the
  spec, every divergence gets a verdict, the lessons go home (AGENTS.md, the guide, a comment at the line, CLAUDE.md),
  then the spec and every pointer to it go. **The LAST spec of a series retires its whole folder** (`doc/perf/` on
  2026-10-08, `doc/mobile/` on 2026-10-17): before the delete, each operative piece of the index goes to ONE home — a rule
  to AGENTS.md or the guide, a measure table to a guide, a live artefact (a budget file) moved with `git mv` and never
  deleted —, every numbered decision cited in code, tests and guides is rewritten as its rule and date (a number outlives
  the document that numbered it), and the series' history goes to README.md § Documentation. **A spec's label never
  enters the code in the first place** (2026-11-12): no spec name or number in a file, function or test name nor in a
  comment, no «decision N», «criterion N» or section sign of a spec — a comment cites the rule and its date. A text-only defect found there is fixed in the retirement with `tsc`, lint
  and Vitest, no Playwright; a runtime one only on the owner's call, with the area suite and the full Playwright; a
  deferral nobody wrote goes where its theme lives (a guide's blind spots, the speed manual); a tour done in the
  implementation session is recorded by the dossier's index (outside a series: one line of CLAUDE.md «Latest»). **`Draft Release Temp.md` never says a spec was retired**
  (owner, 2026-10-08): its § Documentation line names what the guides now say, surface by surface. **The draft carries
  user-visible changes only** (owner, 2026-10-10): a developer tool — a census, a budget, a seed, a script — gets no
  row, not even a «dev» one; its home is the guide (and one line of CLAUDE.md «Latest» when it is the session's work).
- **The outcome of a verification**: `SESSION_NOTES.md` during the session (untracked — delete it
  before the commit); its outcome goes into `CLAUDE.md`'s "Latest" entry as one line — the entry is REPLACED, an
  area's line is rewritten at equal or shorter length, and the file's 20.000 characters are counted with `node -e
  "console.log(require('fs').readFileSync('CLAUDE.md','utf8').length)"` (`wc -m` in Git Bash counts bytes; 2026-11-19) — (§ 2, Closing a verification: the
  signals go in the commit message and the guide) and, when the user sees it, into `Draft Release Temp.md`,
  before the PR. **Before the closing prompt it ends with one block** (owner, 2026-09-27): *Cosa* (what
  was implemented), *Perché* (the decision behind it), *Nota* (gotchas and measures, each with its date),
  *Dove va a fine sessione* (AGENTS.md if repo-wide · `doc/guide/<tema>.md` if a domain lesson ·
  WORKFLOW.md if a session rule · CLAUDE.md if project state · a comment at the right line if it is the
  why of one line) — the closing prompt reads that block, so a note that names no destination is lost. **The draft ACCUMULATES until a release is tagged**: a session PREPENDS its entries to the
  existing sections and never rewrites the file from scratch — on 2026-09-11 a session replaced 534 lines with 5
  and 308 commits of draft had to be recovered from git two days later. **The owner DELETES the file when cutting
  the tag** (2026-09-26, `v10.0.0 — Kalendae`): its body has become the release; `git log -1 --format=%ad <last tag>`
  says when. A file that is missing is therefore never a loss — the first session after a tag recreates it from
  this template, and every later one prepends: a `# Draft release notes` title, a quote line («Accumulates until
  the next tag (WORKFLOW.md § Where things are recorded). Grouped by area; one entry per surface, rewritten to its
  final state.»), then the four sections `## ✨ New Features`, `## 🐛 Bug Fixes`, `## 🔧 Improvements`,
  `## 📚 Documentation`, one blank line between the entries of different areas. **The draft carries no private
  data** (owner, 2026-09-20): it becomes public release notes, so an example sentence takes round invented figures and
  generic names («Conto corrente», «un ETF») — never an amount, an instrument, a bank or a family detail of the real
  account, which the mirror makes easy to paste. That day 33 entries had to be rewritten.
- **Impeccable critiques are committed** (since 2026-09-12): `.impeccable/critique/*.md` is tracked,
  so the snapshot `polish` reads as its backlog is the same on every machine. A critique is
  committed in the session that produces it; one that describes a surface since rebuilt is
  deleted, not kept as history (the eleven pre-«Verdict over Tiles» ones were removed that day). **A critique is written
  on the fixture, never on the mirror** (2026-10-15): the sixteen written «live sul mirror» printed the real account's
  figures and accounts in a public repo and were redacted — amounts «x.xxx €», the account «Banca X», a family surname replaced by an invented name in the fixtures that
  had copied it. The same rule as for the draft above: nothing of the real account in a tracked file — nor the owner's
  machines by model or hostname: «the reference machine» and «the other» (2026-10-15); the operating system may be
  named («Windows», «the Mac»), because the line-ending rules depend on it (owner, 2026-10-19).
  `.impeccable/hook.cache.json` stays local (`.git/info/exclude`). **A snapshot closes only through
  `polish`, never by fixing the code** (2026-09-13): `critique-storage latest` judges it current from the
  fingerprint of the ONE target file (`page.tsx`, a 32-line wrapper), so corrections made in the
  components leave it open — the polish pass verifies each Priority Issue against the code and runs
  `critique-storage close`, which stamps `closed: true` in the tracked file. Once the target file has changed,
  `critique-storage latest` exits 2 with NO output (a JSON parser on its pipe dies on an empty stdin, 2026-09-18): keep
  the snapshot's FILE NAME from the `write` step and hand it to `close` directly — the bare name
  (`2026-09-20T09-25-18Z__app-dashboard-history-page-tsx.md`): the absolute path `write` prints, and the
  repo-relative one, both exit 2 with no output (2026-09-20). **`close` takes TWO arguments**, the resolved target AND
  that file name (`close <target> <snapshot-file>`); with the file alone it prints its usage and exits 1 (2026-09-21).
  **`close` itself can answer exit 2 and still stamp the file**
  (2026-09-20, Rendimenti: the target had changed, so `latest` had already closed the backlog): read `closed: true` in the
  snapshot, not the exit code. **A snapshot's `target_path` and
  `target_fingerprint` are those of the machine that wrote it** (2026-09-14): `latest` accepts only the local
  absolute path and the local bytes (a Windows checkout is CRLF under `* text=auto`, so its fingerprint never
  matches a macOS checkout's), while `trend` and `signals` match by slug. On 2026-09-14 the four snapshots written on Windows
  were rewritten to the macOS path and LF fingerprint. The owner works from two machines with different line endings, so
  close a snapshot on the machine that wrote it. **Impeccable runs on the Windows machine since 2026-10-17** (owner): every
  command that writes or closes a snapshot — `critique`, `polish`, `critique-storage` — runs there, so a snapshot's path and
  CRLF fingerprint always match the checkout that reads them. Every snapshot was deleted that day (the owner, closing the mobile-composition series), so the history
  starts on Windows; the Mac-stamped snapshots before it are in `git log`.
- **Do not duplicate project conventions here.** Code and comment conventions live in
  `DEVELOPMENT_GUIDELINES.md` and `COMMENTS.md`, repo-wide patterns and traps in `AGENTS.md`, the
  per-area rules in `doc/guide/<tema>.md`, the aesthetic in `DESIGN.md`, environment and emulators
  in `SETUP.md`. This file holds only the portable standard and its local translation.
