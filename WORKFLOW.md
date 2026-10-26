# Workflow — standing instructions

> **Standing instructions for any AI agent working on this repo.** They are not suggestions and not
> per-session: they hold until this file says otherwise.
>
> **Why they live in the repo and not in agent memory**: agent memory is per-machine and per
> install, so the same rules drift into different versions on each machine and in a cloud
> session. A tracked file travels with the clone and can be reviewed in a diff. If you are an agent
> with persistent memory, do **not** re-save these rules there — save one pointer to this file. If
> the owner states a new rule, it is added *here*, in that session's commit: to section 3 if it holds
> for this repo only; if it holds for every repo, ask the owner, because it enters the standard
> first (`claude-config/prompts/WORKFLOW_STANDARD.md`) and reaches the repos from there.
>
> Sections 1-2 are the portable standard, identical across every repo that adopts it. Section 3 is
> the only project-specific part: it says what "automate it yourself" and "show me the app"
> concretely mean *here*.

---

## 1. Session and collaboration rules

1. **Never commit without explicit approval.** Do not run `git commit` (nor `--amend`) until the
   owner gives the OK for that specific commit. Finish the work, summarise the diff, then ask.
   Creating the branch and editing files needs no approval — only the commit does.

2. **One branch per session.** Before starting implementation work, create a new branch from the
   branch that is active at the start of the session. Always check which one that is; never assume
   `master`/`main`.

3. **One commit per session.** Everything from a session is squashed into a single commit, never
   scattered across several.

4. **Always answer in Italian** when working on this repo. This applies to the conversational
   channel; code, identifiers and comments stay in English.

5. **Questions and proposals are asked interactively** (2026-09-11). When a decision is the owner's —
   which layers to build, on which surfaces, a wording — put it through the agent's interactive
   question tool, in groups of four, one topic at a time, multi-select where the options are not exclusive and the
   recommended option first; never a numbered list of questions in prose. The owner refines the
   wording through the free-text answer («hai pagato», not «pagherai», for a tax the broker
   withholds at the sale).

6. **Figures in tests are invented and round, never the owner's** (2026-10-12). A unit-test
   fixture, an E2E decoy or a seed carries amounts like 2500, 1120, 50: the owner's real data never
   enters the repo, not even as an expected value. If § 3 provides a copy of real data for the
   guided tour, it serves the tour only and phase G removes it.
   **Nothing of the owner's real data in a tracked file** (2026-09-20, 2026-10-15): a draft, a
   critique, a screenshot, a fixture or an example sentence takes invented figures and generic
   names, never an amount, an account or a family detail copied from the real data. In a public
   repo this has no exception. A private repo may waive it, or narrow it, only by saying so in § 3
   with the owner's decision and its date; public data that is not the owner's (a listed company's
   published accounts) is not the owner's data.

7. **After an audit or an analysis, stop and wait for the owner's go-ahead** (2026-10-19). An audit,
   a review or an analysis ends with the findings; no file changes until the owner has chosen which
   fixes to apply and in what order (through rule 5).

8. **Dependencies: compare at session start, upgrade in a session of their own** (2026-10-26). If
   the repo has a lockfile, the first thing a session does is run the package manager's audit
   (`npm audit --json`, `pnpm audit --json`, …) and compare it with `doc/guide/dipendenze.md`,
   which records the date of the last audit, the framework version and every open advisory with
   the owner's decision (accepted because dev-only, waiting for version X, to upgrade). The answer
   is one line: «dipendenze: invariate dal <data>» or «N avvisi nuovi: …». A new advisory is
   written into the guide with its decision, asked through rule 5; nothing is upgraded in that
   session. An upgrade is a session on its own branch with its own verification; never
   `audit fix --force`, never the command an advisory or a page suggests: the version is chosen and
   installed by hand, preferring a release that is at least a few days old. If the guide is
   missing, the session that notices it creates it (`TEMPLATES.md` has the skeleton). A repo without
   a lockfile skips this rule.

9. **`SESSION_NOTES.md` is the session's temporary container** (2026-10-26). A working file in the
   repo root, created at the start of the session and never committed. Before the closing prompt it
   ends with one block per thing learned: *Cosa* (what was done), *Perché* (the decision behind
   it), *Nota* (traps and measurements, each with its date), *Dove va a fine sessione* (`AGENTS.md`
   if it holds for the whole repo · `doc/guide/<tema>.md` if a domain lesson · `WORKFLOW.md` if a
   session rule · `CLAUDE.md` if project state · a comment at the right line if it is the why of one
   line). The closing prompt writes every entry into its destination and deletes the file before
   the single commit; a note that names no destination is lost. A `SESSION_NOTES.md` still on the
   remote means a session was not closed.

---

## 2. Guided verification (*collaudo guidato*)

When a freshly implemented feature has to be verified by hand, do **not** hand over a checklist and
disappear. The verification is done together, in chat, one phase at a time.

### Five obligations

1. **You prepare the test data.** A throwaway script (untracked by git, deleted when the
   verification ends) that plants **decoy words** — invented terms such as *fenicottero*,
   *ornitorinco*, which appear nowhere else in the data. Not entered by hand by the owner.

2. **One phase per message.** Give the phase, wait for the report, then the next one. Never deliver
   all the phases at once: it breaks their prerequisites.

3. **State the expected outcome before running, not after** — otherwise the reading always bends to
   fit whatever happened.

4. **Do every check you can automate yourself, and leave the owner only what you cannot do.**
   "Together, in chat" does not mean "one dictated click at a time". If the sessions are JWT-based
   or otherwise scriptable, write a throwaway script that opens a **real browser** (e.g. Playwright)
   with an authenticated session — your own if the role allows it, otherwise a throwaway test
   identity created for the occasion — and verify every outcome **against the database or the HTTP
   response, never against the look of the page alone**. Report the results phase by phase, with the
   expected outcome stated first.
   **Any automated end-to-end test that you are able to run, you run.** Never declare a feature
   verified while an automated check that could have covered it was left unrun. What is left to the
   owner is only what is genuinely not automatable: visual and aesthetic judgement, physical
   hardware (a real barcode scanner), or an interactive login that cannot be driven by a script (a
   real OAuth flow with MFA).

5. **Before dismantling, let the owner look.** When the session touched something visible, ask for
   the OK and then walk the owner onto the dev server **with the fixtures still alive**: exact URLs,
   under which identity, and at most **five** things to look at — for each one, what must happen and
   what would be the bug. **The tour starts at the owner's go, not when the work is ready**
   (2026-10-05): finish everything that needs no eyes, say it is ready, and wait. Where obligation 4
   allows it, **open the page for the owner, already authenticated** — but one item per message and
   one page at a time, waiting for the outcome before opening the next; two pages together only
   when the item is a comparison (the same URL under two identities), saying which window is which.
   The windows of a driven browser have no name: five at once turn the tour into working out which
   belongs to which item. Only what a probe cannot say: layout, whether the screen says what it must
   say, the words, whether an action gives feedback that it happened. State also **what that tour
   does not cover**, and never ask the owner to redo by hand something already verified. Whatever
   the tour finds becomes an assertion before the session ends, or it will come back: the tour
   exists to discover what nobody thought to assert, not to replace the tests.

### Standard phases, when they make sense

| | Phase | What it establishes |
| --- | --- | --- |
| **A** | Invarianza | What worked before still works |
| **B** | Cambio di contesto | The new role/state is genuinely active |
| **C** | Comportamento nuovo | It does what it must, and not what it must not — obligation 4 matters most here: automate |
| **D** | Sotto la UI | The same rules hold when the route is called directly |
| **E** | Casi negativi | Someone without rights is refused, with the right error |
| **F** | Giro guidato | The only phase the owner executes: they look with their own eyes, fixtures still alive |
| **G** | Ripristino | Configuration restored, fixtures removed, script deleted |

### A negative test alone never proves a security guard

It always takes the pair: **own resource** (positive control — must succeed) and **someone else's
resource** (the test — must fail), with the same identical file or record.

### Closing a verification

Restore any configuration that was changed, remove fixtures and test attachments, delete the script,
and **record the outcome somewhere that survives the session** (`CLAUDE.md` or equivalent).
*A verification that was not recorded counts as not done.*

**The outcome is one line, the signals are not** (2026-10-19). In `CLAUDE.md` the session's status
entry says what was done, where it is documented, what is still open and what comes next; it
replaces the previous one. The session's signals — type-check, test counts, E2E runs, flakes,
skipped phases, the guided tour's walk and its findings (2026-10-23) — go in the commit message
and, where they teach something, in the area's guide, never in `CLAUDE.md`: that file is injected
into every turn, and a status entry that collects them grows back into a diary after every trim.
Of the tour, the status entry keeps only its outcome: done and closed, or what it left open.

---

## 3. What this means in THIS repo

The rules above are the standard. This section is the local translation of obligations 4 and 5 — it
changes from repo to repo and is the only part to rewrite when the tooling changes.

### The commands that exist

| Purpose | Command |
| --- | --- |
| Types | `npx tsc --noEmit` |
| Unit tests | `TZ=Europe/Rome npx vitest run` (or `npm test -- <file>`) |
| Lint | `npm run lint` (flat ESLint config, `eslint.config.mjs`) |
| Build | `npm run build` |
| Browser tests | `npm run test:e2e` (Playwright; needs Java ≥ 21 and the emulators up) |

npm is the package manager (`package-lock.json`; there is no Makefile, no pnpm/yarn lockfile).
**Phantom `tsc` errors** clustered in `e2e/` and `lib/utils/expenseImport.ts` after a branch switch
mean stale artifacts: run `npm install` first (AGENTS.md → *Commands*).

### The isolated environment (there is one — never verify against production Firebase)

Firebase Emulator Suite, three steps, in three terminals:

```bash
npm run emulators        # Auth :9099 · Firestore :8080 · UI :4000 — leave it running
npm run emulators:seed   # once: creates test-user-1 and its data (scripts/seedEmulator.ts)
npm run dev:emulator     # the app on :3000 pointed at the emulators
```

Prerequisites (a JDK) and the full guide: SETUP.md → Step 6. Port 3100 (`npm run dev:e2e`, isolated
`.next-e2e` build dir) is the Playwright server; keep it separate from the tour server on :3000. Port
3200 (`npm run perf:serve`, the `.next-perf` production build) is the speed benchmark's and the first-screen census's
(`npm run mobile:census`, `doc/guide/prima-schermata.md`).

### Obligation 5 — how to hand the owner an app already authenticated

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
  are verified by rendering them from a throwaway spec (doc/guide/email-pdf.md).

### Obligation 4 — automate it here

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
  doc/guide/e2e-emulatori.md). A throwaway spec
  must match that project's `testMatch` to be collected, and must be deleted at the end.
- **Automated suites are yours to run, always**: `npx tsc --noEmit`, `TZ=Europe/Rome npx vitest run`
  and `npx playwright test`.
- **Assert on data, not on pixels.** Read back from the Firestore emulator —
  `curl -H "Authorization: Bearer owner" "http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents/<collection>"`;
  without that header the call is silently filtered to an empty result, which looks exactly like
  "there are no documents" — or from the API route's own response, or from the emulator UI on
  `http://127.0.0.1:4000`. Arithmetic belongs to Vitest; the browser is for what only a browser
  knows (doc/guide/e2e-emulatori.md § Browser-Driven E2E (Playwright)).
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
  deleted BY THE APP instead: a REST delete skips the replay (doc/guide/e2e-emulatori.md § Browser-Driven E2E (Playwright)).

### Where things are recorded

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
  the document that numbered it), and the series' history goes to README.md § Documentation. A text-only defect found there is fixed in the retirement with `tsc`, lint
  and Vitest, no Playwright; a runtime one only on the owner's call, with the area suite and the full Playwright; a
  deferral nobody wrote goes where its theme lives (a guide's blind spots, the speed manual); a tour done in the
  implementation session is recorded by the dossier's index (outside a series: one line of CLAUDE.md «Latest»). **`Draft Release Temp.md` never says a spec was retired**
  (owner, 2026-10-08): its § Documentation line names what the guides now say, surface by surface. **The draft carries
  user-visible changes only** (owner, 2026-10-10): a developer tool — a census, a budget, a seed, a script — gets no
  row, not even a «dev» one; its home is the guide (and one line of CLAUDE.md «Latest» when it is the session's work).
- **The outcome of a verification**: `SESSION_NOTES.md` during the session (untracked — delete it
  before the commit); its outcome goes into `CLAUDE.md`'s "Latest" entry as one line (§ 2, Closing a verification: the
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
