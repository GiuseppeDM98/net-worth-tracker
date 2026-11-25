# Workflow — standing instructions

> **Standing instructions for any AI agent working on this repo.** They are not suggestions and not
> per-session: they hold until this file says otherwise.
>
> **Why they live in the repo and not in agent memory**: agent memory is per-machine and per
> install, so the same rules drift into different versions on each machine and in a cloud
> session. A tracked file travels with the clone and is reviewed in a diff. If you are an agent
> with persistent memory, save one pointer to this file, not the rules. If
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
   Branches and edits need no approval — only the commit does.

2. **One branch per session.** Before starting implementation work, create a new branch from the
   branch that is active at the start of the session. Check which one that is; never assume `master`/`main`.

3. **One commit per session.** Everything from a session is squashed into a single commit, never
   scattered across several.

4. **Always answer in Italian** when working on this repo. This applies to the conversational
   channel; code, identifiers and comments stay in English. **Every tracked document is written in
   the repo's documentation language** (2026-11-01): English in the open repos, Italian where the
   repo's documentation is Italian (its WORKFLOW.md says which). In an English-language repo, Italian
   is reserved for the UI text a document quotes, page and feature names (the labels the product
   shows) and the owner's own words, quoted as such (the launch prompt at the end of a spec, pasted
   text). A guide still in the
   other language is rewritten when a session rewrites it anyway, never in a session of its own.

5. **Questions and proposals are asked interactively** (2026-09-11). When a decision is the owner's —
   which layers to build, on which surfaces, a wording — put it through the agent's interactive
   question tool, in groups of four, one topic at a time, multi-select where the options are not exclusive and the
   recommended option first; never a numbered list of questions in prose. The owner refines the wording in the free-text answer.

6. **Figures in tests are invented and round, never the owner's** (2026-10-12). A unit-test
   fixture, an E2E decoy or a seed carries amounts like 2500, 1120, 50: the owner's real data never
   enters the repo, not even as an expected value. If § 3 provides a copy of real data for the
   guided tour, it serves the tour only and phase G removes it.
   **Nothing of the owner's real data in a tracked file** (2026-09-20, 2026-10-15; code comments
   too since 2026-11-15): a draft, comment, critique, screenshot, fixture or example sentence takes
   invented figures and generic names, never an amount, holding, account, start date or family
   detail from the real data — «seen live» and the lesson, not the figure. In a public
   repo this has no exception. A private repo may waive it, or narrow it, only by saying so in § 3
   with the owner's decision and its date; public data that is not the owner's (a listed company's
   published accounts) is not the owner's data.

7. **After an audit or an analysis, stop and wait for the owner's go-ahead** (2026-10-19). An audit,
   a review or an analysis ends with the findings; no file changes until the owner has chosen which
   fixes to apply and in what order (through rule 5).

8. **Dependencies: compare at session start, upgrade in a session of their own** (2026-10-26). If
   the repo has a lockfile, the first thing a session does is install from it with every server
   stopped (`npm ci`, `pnpm install --frozen-lockfile`; 2026-11-17: the audit reads the lock, not
   what is installed), then run the package manager's audit (`npm audit --json`, `pnpm audit --json`, …) and compare it with `doc/guide/dipendenze.md`,
   which records the date of the last audit, the framework version and every open advisory with
   the owner's decision (accepted because dev-only, waiting for version X, to upgrade). The answer
   is one line: «dipendenze: invariate dal <data>» or «N avvisi nuovi: …». A new advisory is
   written into the guide with its decision, asked through rule 5; nothing is upgraded in that
   session. An upgrade is a session on its own branch with its own verification; never
   `audit fix --force` or the command an advisory suggests: the version is chosen and installed by
   hand, preferring a release at least a few days old. If the guide is
   missing, the session that notices it creates it (`TEMPLATES.md`). A repo without a lockfile skips this rule.

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
    session that implements a spec writes the model and the effort the spec names (its prompt, or its
    row in the series index); the session that retires it writes the SAME pair as the implementation
    (its commit's line, `git log`). The owner is asked only when no spec is behind the session or it ran at another model or effort.

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
   "Together, in chat" does not mean "one dictated click at a time". If the sessions are scriptable (e.g. JWT), write a throwaway script that opens a **real browser** (e.g. Playwright)
   with an authenticated session — your own if the role allows it, otherwise a throwaway test
   identity created for the occasion — and verify every outcome **against the database or the HTTP
   response, never against the look of the page alone**. Report phase by phase, expected outcome first.
   **Any automated end-to-end test that you are able to run, you run.** Never declare a feature
   verified with an automated check left unrun. What is left to the
   owner is only what is genuinely not automatable: visual and aesthetic judgement, physical
   hardware (a real barcode scanner), or an interactive login that cannot be driven by a script (a
   real OAuth flow with MFA).
   **The whole suite is launched last, when no file of the repo is left to change** (2026-11-22). A
   run builds and fingerprints the tree it starts from: a file edited while it runs (a document, a
   note, `CLAUDE.md`) makes the server refuse the build as stale and the run dies at start-up, or
   measures a tree that no longer exists. So finish every edit first — code, documents, release
   notes, the deletion of `SESSION_NOTES.md` —, start the suite, touch nothing in that repo until it
   reports, and if a file changes after it, run it again. A file in another repo, or in the
   scratchpad, may change meanwhile.

5. **Before dismantling, let the owner look.** When the session touched something visible, ask for
   the OK and then walk the owner onto the dev server **with the fixtures still alive**: exact URLs,
   under which identity, and at most **five** things to look at — for each one, what must happen and
   what would be the bug. **The tour starts at the owner's go** (2026-10-05): finish everything that needs no eyes, say it is ready, and wait. **A tour the spec
   plans is always done, and before the commit** (2026-11-14): never offered as optional, never
   traded for green tests, and never begun without the owner's go; the diff summary and the request
   for the commit's OK (rule 1) follow the tour, never precede it (2026-11-21). The assistant opens
   the windows itself (2026-11-21): a before/after comparison as its two windows side by side, an
   action as the page already on it, so the owner only looks and acts. Where obligation 4
   allows it, **open the page for the owner, already authenticated**: one item per message, one page
   at a time, waiting for the outcome; two pages together only for a comparison (the same URL under
   two identities), saying which window is which.
   Five windows at once turn the tour into working out which belongs to which item. Only what a probe cannot say: layout, whether the screen says what it must
   say, the words, whether an action gives feedback that it happened. State also **what that tour
   does not cover**, and never ask the owner to redo by hand something already verified. Whatever
   the tour finds becomes an assertion before the session ends, or it comes back: the tour
   discovers what nobody thought to assert, it does not replace the tests.

**A before/after comparison of screenshots is shown cropped, one item at a time** (2026-10-30, after
twenty near-identical PNGs left the owner unable to tell what to compare): never a folder of files to
open. The agent opens a browser window on an HTML page with BEFORE and AFTER **cropped to the area that
changes** (one above the other; side by side for phone screenshots), **enlarged** when the difference
is a few pixels, with a title saying where to look, and checks the crop with a headless screenshot
first. The message says «Comparison N of M», what changes and which side is which; the window rules of
obligation 5 apply.

**A window ends by itself, and is closed by its tree** (2026-11-09). The script that opens a visible
browser exits when the owner closes the **page** (closing a driven window closes the page, not the
browser, so `browser.on("disconnected")` alone never fires), when the browser goes, or after a time
limit; never an endless wait. The repo writes that wait **once**, in a helper the throwaway scripts
import. Stopping the background task kills the shell, not the tree beneath it
(`npx → tsx → node → Chromium`): a window is closed by its root with the whole tree, then the count
says zero.
**Once the owner confirms an item, the agent closes its windows** (2026-11-13; the comparison page
too, 2026-11-21: it opens in a driven window, never in the owner's default browser, where only the
owner could close it): the owner never closes a window to move on. The agent stops the helper by its
root (it closes its browser on SIGTERM), checks the count at zero and only then opens the next item.

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

**No collaudo script outlives its session** (2026-11-09; the services too, 2026-11-13). `node ~/.claude/processi-collaudo.mjs` counts the
trees of `scripts/collaudo-*` alive in the repo and the services a session starts and forgets (the Firebase
emulators with their JVM, the Next.js `dev`/`start` servers), and says whose they are: this session's (closed with
`--chiudi`), another open session's (never touched), or nobody's known (named to the owner, closed with
`--chiudi --anche-ignote` only on their yes). The count is the **first gate** of every repo's gate list: zero, or none starts. The standard `settings.json` runs it with `--hook` at `SessionEnd`
(a service gets SIGTERM first: the emulators export on exit); a session that dies without ending is
caught by the next gate and by the same count at the start of every session (`prompts/01_SESSION_START.md`).
*A verification that was not recorded counts as not done.*

**The outcome is one line, the signals are not** (2026-10-19). In `CLAUDE.md` the session's status
entry says what was done, where it is documented, what is still open and what comes next; it
replaces the previous one. The session's signals — type-check, test counts, E2E runs, flakes,
skipped phases, the guided tour's walk and findings (2026-10-23) — go in the commit message and,
where they teach something, in the area's guide, never in `CLAUDE.md`: it is injected into every
turn, and an entry that collects them grows back into a diary. Of the tour it keeps only the
outcome: done and closed, or what is left open.

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
| Browser tests | `npm run test:e2e` (Playwright; needs Java ≥ 21 and the emulators up) — the whole suite once, before the commit is asked for, on a production build it makes first when the code changed (since 2026-11-16); while working, the touched area's specs on `next dev`: `npx playwright test e2e/<area>` (Obligation 4, below) |

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

Prerequisites (a JDK) and the full guide: SETUP.md → Step 6. Port 3100 is the Playwright server — `npm run dev:e2e`
(isolated `.next-e2e` build dir) for an area run, the `.next-e2e-build` production build for the whole run (since
2026-11-16, SETUP.md → Step 7); keep it separate from the tour server on :3000. Port
3200 (`npm run perf:serve`, the `.next-perf` production build) is the speed benchmark's and the first-screen census's
(`npm run mobile:census`, `doc/guide/prima-schermata.md`).

### Obligation 5 — how to hand the owner an app already authenticated

The app **is** locally runnable; there is no fallback to declare. Every rule below has its why, its history and its
measures in `doc/guide/collaudo.md` (moved there whole on 2026-11-18).

- **The tour server**: `npm run dev:emulator` → `http://localhost:3000`, on the emulators: nothing seen there touches
  production data.
- **The owner's go** (2026-10-05): say «pronto» and wait; the owner starts the tour when they can give it 20 minutes.
- **Phase F before the commit** (owner, 2026-11-21; § 2 obligation 5): the tour first, then the diff summary and the
  OK; the assistant opens every window itself.
- **Phase F has its data before the go** (owner, 2026-11-25): when the mirror holds nothing the tour needs (a foreign
  instrument, a kind of record the owner does not have), the assistant plants it first — invented names and round
  figures, on `prod-mirror`, so `npm run mirror:remove` takes it away — and names it in the tour's steps; never a
  phase F that asks the owner for data he does not have.
- **One `next dev` at a time** (2026-09-07): stop the :3100 server before the tour; the tour runs on the emulators
  plus ONE server.
- **The windows: `scripts/collaudo-finestre.mts`** (2026-11-13): `npx tsx scripts/collaudo-finestre.mts
  --email=<fixture> --url=<path> [--url=<path>] [--title=…] [--width=390]`, in the background as its own task;
  `--width=390` opens a phone window that stays 390 px wide even maximised (2026-11-24), the built-in browser pane
  does not (it returns to the pane's width when the turn ends); closed with `npx tsx scripts/collaudo-finestre.mts
  --chiudi` (`taskkill` on Windows: Git Bash has no `pkill`, 2026-11-24); from Git Bash on Windows prefix
  `MSYS_NO_PATHCONV=1` (2026-11-15). A file
  the page downloads goes through a throwaway Playwright script into the scratchpad (2026-11-14).
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

- **No Claude-in-Chrome** (2026-09-13): the live evidence comes from a throwaway Playwright script on the emulator dev
  server, copied into the repo root as `.tmp-*.mjs`, waiting on the page's `h1`, never on `networkidle`; say it is
  Playwright's. The tour still goes on the MIRROR. Count only the detector's hits that belong to the surface
  (2026-09-18).
- **A probe opens a control that SPENDS only with the owner's yes, asked before, each time** (2026-09-20; 2026-11-23):
  the real model, a real email, a paid service; read what a control does before scripting a click. A committed test
  never spends.
- **The session's background tasks die with it**: a tour's services run in the OWNER's terminals; when the agent
  starts them on Windows — the full suite too — each one DETACHED (`Start-Process cmd.exe "/c npm run <script> >
  <scratchpad>\<name>.log 2>&1" -WindowStyle Hidden`), stopped by PID at the end.
- **Throwaway fixtures** follow the seed pattern (`scripts/seedEmulator.ts`, `scripts/seed*E2E.mts`) or live as an
  untracked `scripts/*.tmp.mts` inside the repo — never in the scratchpad; `.mts`, never `.ts`.
- **The authenticated browser already exists**: `e2e/.auth/<account>.json`, minted by the six `auth*.setup.ts`;
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
  folder**. A text-only defect found there is fixed with `tsc`, lint and Vitest, no Playwright; a runtime one only on
  the owner's call, with the area suite and the full Playwright. The full rule: `doc/guide/collaudo.md` § Where things are recorded.
- **The outcome of a verification**: `SESSION_NOTES.md` during the session (untracked, deleted before the commit, its
  last block *Cosa* · *Perché* · *Nota* · *Dove va a fine sessione*, owner 2026-09-27); its outcome one line of
  `CLAUDE.md` «Latest», the signals in the commit message and the guide.
- **`Draft Release Temp.md`** carries user-visible changes only (owner, 2026-10-10), never «spec retired» (owner,
  2026-10-08) and no private data (owner, 2026-09-20). It **ACCUMULATES until a release is tagged**: a session PREPENDS
  its entries to the existing sections and never rewrites the file from scratch (2026-09-11); **the owner DELETES the
  file when cutting the tag** (2026-09-26). A missing file is recreated from this template: a `# Draft release notes`
  title, a quote line («Accumulates until the next tag (WORKFLOW.md § Where things are recorded). Grouped by area; one
  entry per surface, rewritten to its final state.»), then `## ✨ New Features`, `## 🐛 Bug Fixes`, `## 🔧 Improvements`,
  `## 📚 Documentation`, one blank line between the entries of different areas.
- **Impeccable critiques are committed** (since 2026-09-12), written on the fixture, never on the mirror (2026-10-15);
  a snapshot closes only through `polish` (2026-09-13), with `critique-storage close <target> <snapshot-file>` on the
  Windows machine (owner, 2026-10-17). The machines never named (2026-10-19) and the traps of `latest` and `close`:
  `doc/guide/collaudo.md` § Where things are recorded.
- **Do not duplicate project conventions here.** Code and comment conventions live in
  `DEVELOPMENT_GUIDELINES.md` and `COMMENTS.md`, repo-wide patterns and traps in `AGENTS.md`, the
  per-area rules in `doc/guide/<tema>.md`, the aesthetic in `DESIGN.md`, environment and emulators
  in `SETUP.md`. This file holds only the portable standard and its local translation.
