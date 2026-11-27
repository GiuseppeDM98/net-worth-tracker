# Workflow — standing instructions

> **Standing instructions for any AI agent working on this repo.** They are not suggestions and not
> per-session: they hold until this file says otherwise.
>
> **They live in the repo, not in agent memory**: memory is per machine and per install, so the
> rules drift apart; a tracked file travels with the clone. An agent with persistent memory saves
> one pointer to this file, not the rules. If the owner states a new rule, it is added *here*, in that session's commit: to section 3 if it holds
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
   Branches and edits need no approval — only the commit does.

2. **One branch per session.** Before starting implementation work, create a new branch from the
   branch that is active at the start of the session. Check which one that is; never assume `master`/`main`.

3. **One commit per session.** Everything from a session is squashed into a single commit.

4. **Always answer in Italian** when working on this repo. This applies to the conversational
   channel; code, identifiers and comments stay in English. **Every tracked document is written in
   the repo's documentation language** (2026-11-01): English in the open repos, Italian where the
   repo's documentation is Italian (its WORKFLOW.md says which). In an English-language repo, Italian
   is reserved for the UI text a document quotes, page and feature names and the owner's own words, quoted as such. A guide still in the
   other language is rewritten when a session rewrites it anyway, never in a session of its own.

5. **Questions and proposals are asked interactively** (2026-09-11). A decision that is the owner's —
   which layers to build, on which surfaces, a wording — goes through the agent's interactive
   question tool, in groups of four, one topic at a time, multi-select where the options are not
   exclusive, the recommended option first; never a numbered list of questions in prose.

6. **Figures in tests are invented and round, never the owner's** (2026-10-12). A unit-test
   fixture, an E2E decoy or a seed carries amounts like 2500, 1120, 50: the owner's real data never
   enters the repo, not even as an expected value. A copy of real data that § 3 provides for the
   guided tour serves the tour only, and phase G removes it.
   **Nothing of the owner's real data in a tracked file** (2026-09-20, 2026-10-15; code comments
   too since 2026-11-15): a draft, comment, critique, screenshot, fixture or example sentence takes
   invented figures and generic names, never an amount, holding, account, start date or family
   detail from the real data. A public repo has no exception; a private one may waive or narrow it
   only in § 3, with the owner's decision and its date. Public data that is not the owner's (a
   listed company's published accounts) is not the owner's data.

7. **After an audit or an analysis, stop and wait for the owner's go-ahead** (2026-10-19). An audit,
   a review or an analysis ends with the findings; no file changes until the owner has chosen which
   fixes to apply and in what order (through rule 5).

8. **Dependencies: compare at session start, upgrade in a session of their own** (2026-10-26). If
   the repo has a lockfile, a session first installs from it with every server stopped (`npm ci`,
   `pnpm install --frozen-lockfile`; 2026-11-17: the audit reads the lock),
   then runs the package manager's audit and compares it with
   `doc/guide/dipendenze.md`, which records the date of the last audit, the framework version and
   every open advisory with the owner's decision. The answer is one line: «dipendenze: invariate
   dal <data>» or «N avvisi nuovi: …». A new advisory is written into the guide with its decision,
   asked through rule 5; nothing is upgraded in that session. An upgrade is a session on its own
   branch with its own verification; never `audit fix --force` or the command an advisory suggests:
   the version is chosen and installed by hand, preferring a release at least a few days old. A
   missing guide is created by the session that notices it (`TEMPLATES.md`). A repo without a
   lockfile skips this rule.

9. **`SESSION_NOTES.md` is the session's temporary container** (2026-10-26). A working file in the
   repo root, created at the start of the session and never committed. Before the closing prompt it
   ends with one block per thing learned: *Cosa* (what was done), *Perché* (the decision behind
   it), *Nota* (traps and measurements, dated), *Dove va a fine sessione* (`AGENTS.md`
   if it holds for the whole repo · `doc/guide/<tema>.md` if a domain lesson · `WORKFLOW.md` if a
   session rule · `CLAUDE.md` if project state · a comment at the right line if it is the why of one
   line). The closing prompt writes every entry into its destination and deletes the file before
   the single commit; a note that names no destination is lost. A `SESSION_NOTES.md` still on the
   remote means a session was not closed.

10. **The commit's «Model: … · effort …» line is read from the spec, never asked** (2026-11-18). A
    session that implements a spec writes the model and effort the spec names (its prompt, or its
    row in the series index); the one that retires it writes the SAME pair as the implementation's
    commit (`git log`). The owner is asked only when no spec is behind the session or it ran at
    another model or effort.

---

## 2. Guided verification (*collaudo guidato*)

When a freshly implemented feature has to be verified by hand, do **not** hand over a checklist and
disappear. The verification is done together, in chat, one phase at a time.

### Five obligations

1. **You prepare the test data.** A throwaway script (untracked by git, deleted when the
   verification ends) that plants **decoy words** — invented terms such as *fenicottero*,
   *ornitorinco*, which appear nowhere else in the data. Never entered by hand.

2. **One phase per message.** Give the phase, wait for the report, then the next one. Never deliver
   all the phases at once: it breaks their prerequisites.

3. **State the expected outcome before running, not after** — otherwise the reading always bends to
   fit whatever happened.

4. **Do every check you can automate yourself, and leave the owner only what you cannot do.**
   If the sessions are scriptable, write a throwaway script that opens a **real browser**
   with an authenticated session — your own if the role allows it, otherwise a
   throwaway test identity — and verify every outcome **against the database or the HTTP response,
   never against the look of the page alone**. Report phase by phase, expected outcome first.
   **Any automated end-to-end test that you are able to run, you run**: never declare a feature
   verified with an automated check left unrun. Left to the owner is only what is genuinely not
   automatable: visual and aesthetic judgement, physical hardware (a real barcode scanner), or a
   login no script can drive (a real OAuth flow with MFA).
   **The whole suite is launched last, when no file of the repo is left to change** (2026-11-22): a
   run fingerprints its tree, and a file edited meanwhile kills it or
   makes it measure a tree that is gone. Finish every edit first, the deletion of
   `SESSION_NOTES.md` included, touch nothing in that repo until the suite reports, and run it
   again if a file changes after. Other repos and the scratchpad may change.
   **A long run in the background is watched, not waited on** (2026-11-25): for the full suite, a
   build or a benchmark, a monitor reports progress **every five minutes** and **at once**
   when a service the run needs (emulators, dev server, database) stops answering. A dead service
   stops the run: restart both, never read the reds it left as results.
   **A browser suite on a shared backend runs on several workers, each in its own data universe**
   (2026-11-26): a database, project or tenant picked by the worker's index and seeded alike, never
   accounts cloned inside one. The count is measured: the fastest whole run green twice (on a
   hybrid CPU start from the performance cores). Above two workers the trace is kept only at the
   one retry of a red, and a test green only there is «flaky», read like a red. No spec names the
   backend, a parked session or another file's data by literal (one helper does) or reads what
   another file wrote. A fixed sleep becomes a condition, unless it IS the gesture under test.
   Nothing else runs on the machine, and the run's ports are free, while it is measured or gated;
   the whole run on a production build, an area run on the dev server. § 3 carries the line
   `Browser tests: workers <N> · isolation <mechanism> · whole run <wall> on <date> (<tests>
   tests)`; `workers 1` gives its reason.

5. **Before dismantling, let the owner look.** When the session touched something visible, ask for
   the OK and then walk the owner onto the dev server **with the fixtures still alive**: exact URLs,
   under which identity, and at most **five** things to look at — for each, what must happen and
   what would be the bug. **The tour starts at the owner's go** (2026-10-05): finish everything that
   needs no eyes, say it is ready, and wait. **A tour the spec plans is always done, and before the
   commit** (2026-11-14): never offered as optional, never traded for green tests, never begun
   without the owner's go; the diff summary and the commit's OK (rule 1) follow the tour
   (2026-11-21). The assistant opens the windows itself (2026-11-21): a before/after comparison as
   two windows side by side, an action as the page already on it. Where obligation 4 allows it,
   **open the page for the owner, already authenticated**: one item per message, one page at a
   time, waiting for the outcome; two pages together only for a comparison (the same URL under two
   identities), saying which window is which.
   Only what a probe cannot say: layout, whether the screen says what it must say, the words,
   whether an action gives feedback. State also **what that tour does not cover**, and never ask
   the owner to redo by hand something already verified. Whatever the tour finds becomes an
   assertion before the session ends: the tour does not replace the tests.
   **The windows have a width and a way to close** (2026-11-24): a phone check opens at a FIXED
   viewport (`viewport: { width: 390, height: 844 }`, a helper option), never `viewport: null`.
   The helper closes the windows it opened with the
   platform's tool (`taskkill /T /F` on Windows), sparing its own parents.

**A before/after comparison of screenshots is shown cropped, one item at a time** (2026-10-30): never
a folder of files. The agent opens a browser window on an HTML page with BEFORE and AFTER **cropped
to the area that changes** (one above the other; side by side for phone screenshots), **enlarged**
when the difference is a few pixels, titled with where to look, the crop checked with a headless
screenshot first. The message says «Comparison N of M», what changes and which side is which; the
window rules of obligation 5 apply.

**A window ends by itself, and is closed by its tree** (2026-11-09). The script that opens a visible
browser exits when the owner closes the **page** (`disconnected` alone never fires), when the browser goes, or after a time limit — one
wait, written **once** in a helper the throwaway scripts import. A window is closed by its root
with the whole tree (stopping the background task kills only the shell), then the count says zero.
**Once the owner confirms an item, the agent closes its windows** (2026-11-13; the comparison page
too, 2026-11-21: it opens in a driven window, never in the owner's default browser): it stops the
helper by its root, checks the count at zero and only then opens
the next item. The owner never closes a window to move on.

### Standard phases, when they make sense

| | Phase | What it establishes |
| --- | --- | --- |
| **A** | Invarianza | What worked before still works |
| **B** | Cambio di contesto | The new role/state is genuinely active |
| **C** | Comportamento nuovo | It does what it must, and not what it must not (obligation 4) |
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

**No collaudo script outlives its session** (2026-11-09; the services too, 2026-11-13). `node ~/.claude/processi-collaudo.mjs` counts the
trees of `scripts/collaudo-*` alive in the repo and the services a session starts and forgets (the
Firebase emulators, the Next.js `dev`/`start` servers), and says whose they are: this session's
(closed with `--chiudi`), another open session's (never touched), or unknown (named to the owner,
closed with `--chiudi --anche-ignote` only on their yes). The count is the **first gate** of every
repo's gate list: zero, or none starts. The standard `settings.json` runs it with `--hook` at
`SessionEnd`; a session that dies
without ending is caught by the next gate and by the count at every session start
(`prompts/01_SESSION_START.md`).
*A verification that was not recorded counts as not done.*

**The outcome is one line, the signals are not** (2026-10-19). In `CLAUDE.md` the session's status
entry says what was done, where it is documented, what is open and what comes next; it replaces the
previous one. The session's signals — type-check, test counts, E2E runs, flakes, skipped phases, the
guided tour's walk and findings (2026-10-23) — go in the commit message and, where they teach
something, in the area's guide, never in `CLAUDE.md`, which is injected into every turn: of the
tour it keeps only the outcome, done and closed or what is left open.

---

## 3. What this means in THIS repo

The rules above are the standard. This section is the local translation of obligations 4 and 5 — it
changes from repo to repo and is the only part to rewrite when the tooling changes.

### The commands that exist

| Purpose | Command |
| --- | --- |
| Collaudo count (first gate) | `node ~/.claude/processi-collaudo.mjs` — zero collaudo trees and forgotten services (the Firebase emulators, the Next `dev`/`start` server), or the gates do not start (§ 2) |
| Types | `npx tsc --noEmit` |
| Unit tests | `TZ=Europe/Rome npx vitest run` (or `npm test -- <file>`) |
| Lint | `npm run lint` (flat ESLint config, `eslint.config.mjs`) |
| Build | `npm run build` |
| Browser tests | `npm run test:e2e` (Playwright; needs Java ≥ 21 and the emulators up) — the whole suite once, before the commit is asked for, on a production build it makes first when the code changed (since 2026-11-16), on four workers (since 2026-11-26); while working, the touched area's specs on `next dev`, one worker: `npx playwright test e2e/<area>` (Obligation 4, below) |

Browser tests: workers 4 · isolation one Firestore emulator project, one server and one set of parked sessions per worker (Auth shared) · whole run 8,6 min on 2026-11-26 (585 tests)

The whole run wants :3100–3103 free and NOTHING else running on the machine (a contended run's reds are not the
code's); a test green only at its one retry — «flaky» in the report — is named and read like a red. The wiring and
the measures: `doc/guide/e2e-suite.md` § The suite's speed.

npm is the package manager (`package-lock.json`; there is no Makefile, no pnpm/yarn lockfile).
**Phantom `tsc` errors** after a branch switch mean stale artifacts: `npm install` first (AGENTS.md → *Commands*).

### The isolated environment (there is one — never verify against production Firebase)

Firebase Emulator Suite, three steps, in three terminals:

```bash
npm run emulators        # Auth :9099 · Firestore :8080 · UI :4000 — leave it running
npm run emulators:seed   # once: creates test-user-1 and its data (scripts/seedEmulator.ts)
npm run dev:emulator     # the app on :3000 pointed at the emulators
```

Prerequisites (a JDK) and the full guide: SETUP.md → Step 6. Ports :3100–3103 are Playwright's (SETUP.md → Step 7):
`npm run dev:e2e` on :3100 for an area run; for the whole run the `.next-e2e-build` production build (since
2026-11-16), one server per worker, each on its own Firestore project (`demo-net-worth-wN`, since 2026-11-26). Keep
them apart from the tour server on :3000. Port 3200 (`npm run perf:serve`) is the speed benchmark's and the
first-screen census's (`npm run mobile:census`, `doc/guide/prima-schermata.md`).

### Obligation 5 — how to hand the owner an app already authenticated

The app **is** locally runnable; there is no fallback to declare. Every rule below has its why, its history and its
measures in `doc/guide/collaudo.md` (moved there whole on 2026-11-18).

- **The tour server**: `npm run dev:emulator` → `http://localhost:3000`, on the emulators: nothing seen there touches
  production data.
- **The owner's go** (2026-10-05): say «pronto» and wait; the owner starts the tour when they can give it 20 minutes.
- **Phase F before the commit** (owner, 2026-11-21; § 2 obligation 5): the tour first, then the diff summary and the
  OK; the assistant opens every window itself.
- **Phase F has its data before the go** (owner, 2026-11-25): what the tour needs and the mirror lacks, the assistant
  plants first on `prod-mirror`, invented, and names it in the steps.
- **One `next dev` at a time** (2026-09-07): stop the :3100 server before the tour; the tour runs on the emulators
  plus ONE server.
- **The windows: `scripts/collaudo-finestre.mts`** (2026-11-13): `npx tsx scripts/collaudo-finestre.mts
  --email=<fixture> --url=<path> [--url=<path>] [--title=…] [--width=390]`, in the background as its own task,
  closed with `npx tsx scripts/collaudo-finestre.mts --chiudi`; from Git Bash prefix `MSYS_NO_PATHCONV=1` (2026-11-15). A phone window, a download: the guide.
- **Getting in**: email/password on `/login` (no OAuth, no MFA). Fixture identities, all password `test1234`:

  | Account | UID | What it is for |
  | --- | --- | --- |
  | `test@example.com` | `test-user-1` | The base seed: assets, expenses, snapshots — the account most tours use |
  | `analisi@example.com` | `test-user-analisi` | Everything dated to January, so year-to-date windows contain it |
  | `centri@example.com` | `test-user-centri` | Centri di Costo ON — `npm run e2e:seed:centri` |
  | `degraded@example.com` | `test-user-degraded` | The states in which a return is *not* a measure |
  | `split@example.com` | `test-user-split` | Cashflow › Divisione ON — `npm run e2e:seed:split` |
  | `hof@example.com` | `hof-user` | Hall of Fame, 47 monthly snapshots, no rankings document — `npm run e2e:seed:hof` |
  | `census@example.com` | `census-user` | The first-screen budget's fixture (2026-10-10) — `npm run mobile:census` re-seeds it and its Hall of Fame (`npm run e2e:seed:census` alone does not) |

  What each fixture plants: `doc/guide/collaudo.md` § Obligation 5, «Getting in».
- **So the screen is not empty**: `npm run emulators:seed`, plus `npm run e2e:seed` (Previdenza),
  `npm run e2e:seed:analisi` (Analisi), `npm run e2e:seed:coast` (Coast FIRE). Give the **exact URL**.
- **The routes**: `/dashboard` plus `assets · cashflow · analisi · performance · history · allocation · pension ·
  fire-simulations · hall-of-fame · assistant · settings` (`perf/routes.json` = `lib/constants/navigation.ts`, held by a
  test); Dividendi is `/dashboard/cashflow?tab=dividends`.
- **The owner's REAL data** (the standard since 2026-09-07): `npm run mirror:seed -- <production email>` seeds
  `mirror@example.com` / `test1234` (uid `prod-mirror`), `npm run mirror:remove` in phase G. It serves the tour only:
  none of its figures enters a tracked file (this repo is public, rule 6 has no exception here).
- **A delegated view**: seed a grant in `account-access/{ownerUid}` and log in as the second identity (SETUP.md →
  Step 5b).
- **Out of reach of a tour**: the assistant (`NEXT_PUBLIC_ASSISTANT_AI_ENABLED` + a live key) and email/PDF (no DOM:
  a throwaway spec renders them). **The PR's Vercel preview is no tour for an AI surface** (owner, 2026-11-07): it holds
  the demo account alone; that phase F runs on the mirror, or in production after the deploy.

### Obligation 4 — automate it here

The why and the measures of each rule: `doc/guide/collaudo.md` § Obligation 4.

- **No Claude-in-Chrome** (2026-09-13): live evidence from a throwaway Playwright script (`.tmp-*.mjs` in the repo
  root, waiting on `h1`), said to be Playwright's; the tour still on the MIRROR; only the surface's detector hits (2026-09-18).
- **A probe opens a control that SPENDS only with the owner's yes, asked before, each time** (2026-09-20; 2026-11-23):
  the real model, a real email, a paid service; read what a control does before scripting a click. A committed test
  never spends.
- **The session's background tasks die with it**: a tour's services run in the OWNER's terminals; when the agent
  starts them on Windows — the full suite too — each one DETACHED (`Start-Process cmd.exe "/c npm run <script> >
  <scratchpad>\<name>.log 2>&1" -WindowStyle Hidden`), stopped by PID at the end.
- **Throwaway fixtures** follow the seed pattern (`scripts/seedEmulator.ts`, `scripts/seed*E2E.mts`) or live as an
  untracked `scripts/*.tmp.mts` inside the repo — never in the scratchpad; `.mts`, never `.ts`.
- **The authenticated browser already exists**: `e2e/.auth/<account>.json` (a whole run's other workers:
  `e2e/.auth/wN/`), minted by the six `auth*.setup.ts`;
  `npx playwright test --project=<name>`, one of the fourteen projects (doc/guide/e2e-playwright.md); a throwaway spec
  matches its project's `testMatch` and is deleted at the end.
- **Automated suites are yours to run, always**, in two levels (2026-11-13): while working, the specs of the area
  touched in every project that collects them (each guide's § *Files*); the WHOLE suite once, with the work finished,
  before the commit is asked for — and again if code changes after it. A change with no area runs the whole suite.
- **Assert on data, not on pixels**: `curl -H "Authorization: Bearer owner"
  "http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents/<collection>"` — without the header
  the answer is silently empty —, the route's own response, or the emulator UI on `http://127.0.0.1:4000`.
- **Prove the check can fail**: break the thing under test once and watch it go red; when it stays green, the sentence
  was wrong (2026-09-07): rewrite it everywhere and say so in the test's header.
- **Phase E here is the delegation boundary**: `assertCanAccessAccount`, `firestore.rules`, `REGISTRATION_WHITELIST`;
  the pair is the owner's document against another account's, same collection, same shape.
- **Phase G**: delete the few documents you created (`curl -X DELETE`, same header) rather than `.emulator-data/`; a
  transaction or trade is deleted BY THE APP (its replay).
- **A mock page for an Artifact sets `background` AND `color` on `body`** (2026-11-06).
- **A probe page for `impeccable detect` goes in the repo root as `.tmp-*.html`**, deleted before the commit (2026-11-06).

### Where things are recorded

- **Branches**: `develop` is the integration branch, `main` the default; a session branches off
  whatever is active (usually `develop`) and merges into it by PR. **A series of specs reaches `main` together after its
  last spec is retired, by a PR the owner opens** (owner, 2026-10-12), unless its index says otherwise (the DATI series
  of 2026-11-23 goes spec by spec, `doc/dati/README.md` § 8); its status table says which spec is in `develop`. The
  precedents: `doc/guide/collaudo.md` § Where things are recorded.
- **A spec is retired by a session of its own** (since 2026-09-28): the code read against the spec, every divergence
  given a verdict, the lessons home, then the spec and every pointer go; **the LAST spec of a series retires its whole
  folder**. The full rule, the
  defects found there included: `doc/guide/collaudo.md` § Where things are recorded.
- **The outcome of a verification**: `SESSION_NOTES.md` during the session (untracked, deleted before the commit, its
  last block *Cosa* · *Perché* · *Nota* · *Dove va a fine sessione*, owner 2026-09-27); its outcome one line of
  `CLAUDE.md` «Latest», the signals in the commit message and the guide.
- **`Draft Release Temp.md`** carries user-visible changes only (owner, 2026-10-10), never «spec retired» (owner,
  2026-10-08) and no private data (owner, 2026-09-20). It **ACCUMULATES until a release is tagged**: a session PREPENDS
  its entries to the existing sections and never rewrites the file from scratch (2026-09-11); **the owner DELETES the
  file when cutting the tag** (2026-09-26). A missing file is recreated from the template in
  `doc/guide/collaudo.md` § Where things are recorded.
- **Impeccable critiques are committed** (since 2026-09-12), written on the fixture, never on the mirror (2026-10-15);
  a snapshot closes only through `polish` (2026-09-13), with `critique-storage close <target> <snapshot-file>` on the
  Windows machine (owner, 2026-10-17). The machines never named (2026-10-19) and the traps of `latest` and `close`:
  `doc/guide/collaudo.md` § Where things are recorded.
- **Do not duplicate project conventions here.** Code and comment conventions live in
  `DEVELOPMENT_GUIDELINES.md` and `COMMENTS.md`, repo-wide patterns and traps in `AGENTS.md`, the
  per-area rules in `doc/guide/<tema>.md`, the aesthetic in `DESIGN.md`, environment and emulators
  in `SETUP.md`. This file holds only the portable standard and its local translation.
