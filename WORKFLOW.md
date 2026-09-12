# Workflow — standing instructions

> **Standing instructions for any AI agent working on this repo.** They are not suggestions and not
> per-session: they hold until this file says otherwise.
>
> **Why they live in the repo and not in agent memory**: agent memory is per-machine and per
> install, so the same rules drift into different versions on the laptop, the desktop and a cloud
> session. A tracked file travels with the clone and can be reviewed in a diff. If you are an agent
> with persistent memory, do **not** re-save these rules there — save one pointer to this file. If
> the owner states a new rule, it is added *here*, in that session's commit.
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
   question tool, one batch per topic, multi-select where the options are not exclusive and the
   recommended option first; never a numbered list of questions in prose. The owner refines the
   wording through the free-text answer («hai pagato», not «pagherai», for a tax the broker
   withholds at the sale).

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
   what would be the bug. Only what a probe cannot say: layout, whether the screen says what it must
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
`.next-e2e` build dir) is the Playwright server; keep it separate from the tour server on :3000.

### Obligation 5 — how to hand the owner an app already authenticated

The app **is** locally runnable; there is no fallback to declare.

- **The tour server**: `npm run dev:emulator` → `http://localhost:3000`. It reads the emulators, so
  nothing seen there can touch production data.
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
  | `degraded@example.com` | `test-user-degraded` | The states in which a return is *not* a measure — empty/degraded readings |

- **So the screen is not empty**: `npm run emulators:seed` for the base account, plus the fixture the
  page needs — `npm run e2e:seed` (Previdenza), `npm run e2e:seed:analisi` (Analisi),
  `npm run e2e:seed:coast` (Coast FIRE). Give the owner the **exact URL**, e.g.
  `http://localhost:3000/dashboard/pension`, not "go to Previdenza".
- **The routes** are `/dashboard` plus `assets · cashflow · analisi · dividends · performance ·
  history · allocation · pension · fire-simulations · hall-of-fame · assistant · settings`.
- **The owner's REAL data, without touching production — the standard since 2026-09-07**: `npm run mirror:seed --
  <production email>` reads the production account (service account from `.env.local`, `.get()` only, refuses to run
  with `FIRESTORE_EMULATOR_HOST`) and seeds it into the emulators under `mirror@example.com` / `test1234` (uid
  `prod-mirror`), re-keyed, in one command and with nothing written to disk (`scripts/mirrorProdAccount.mts`). The
  ACCOUNT is the standard, the DATA is not: it is re-read on every seed because a month later it has changed, and
  `npm run mirror:remove` takes it out at the end of the session (phase G). It is the right tour when the change moves
  the owner's own figures (Rendimenti, Storico): a fixture proves the mechanism, the mirror shows what the owner will
  see tomorrow.
- **A reading the owner cannot open with their own account**: this app has a role split — *viewer*
  (`user.uid`) vs *owner* (`ownerId`), grants in `account-access/{ownerUid}`. To show the delegated
  view, seed a grant for the second identity and log in as *that* identity (SETUP.md → Step 5b);
  do not ask the owner to reason about what a guest "would" see.
- Two areas are deliberately out of reach of a tour: the **assistant** needs
  `NEXT_PUBLIC_ASSISTANT_AI_ENABLED` and a live Anthropic key, and **email/PDF** have no DOM — they
  are verified by rendering them from a throwaway spec (doc/guide/email-pdf.md).

### Obligation 4 — automate it here

- **Throwaway fixtures** follow the existing seed pattern (`scripts/seedEmulator.ts`,
  `scripts/seedAnalisiE2E.mts`, `scripts/seedPensionE2E.mts`, `scripts/seedCoastFireE2E.mts`) or
  live as a throwaway `.mts` in the session scratchpad. `.mts`, never `.ts`: a `.ts` script is CJS
  under tsx and has no top-level await (AGENTS.md → *Emulator Exercise Scripts*).
- **The authenticated browser already exists.** The Playwright projects park an authenticated
  `storageState` per fixture account (`e2e/.auth/{user,analisi,degraded}.json`, minted by the three
  `auth*.setup.ts` projects), so a script does not have to reproduce the login:
  `npx playwright test --project=<desktop|mobile|analisi|analisi-mobile|degraded>`. A throwaway spec
  must match that project's `testMatch` to be collected, and must be deleted at the end.
- **Automated suites are yours to run, always**: `npx tsc --noEmit`, `TZ=Europe/Rome npx vitest run`
  and `npx playwright test`.
- **Assert on data, not on pixels.** Read back from the Firestore emulator —
  `curl -H "Authorization: Bearer owner" "http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents/<collection>"`;
  without that header the call is silently filtered to an empty result, which looks exactly like
  "there are no documents" — or from the API route's own response, or from the emulator UI on
  `http://127.0.0.1:4000`. Arithmetic belongs to Vitest; the browser is for what only a browser
  knows (AGENTS.md → *Browser-Driven E2E*).
- **Prove the check can fail.** Break the thing under test on purpose once and watch the assertion
  go red. A green check that has never been seen red is indistinguishable from one asserting
  nothing. **When it stays green, the sentence that motivated the test was wrong, not the test**
  (2026-09-07: «the picker overflows a 360 phone» — it did not): rewrite the claim everywhere it was
  written, keep the test as a regression guard, and say in its header which of the two it is.
- **Phase E here is the delegation boundary**: `assertCanAccessAccount`, `firestore.rules`,
  `REGISTRATION_WHITELIST`. The positive/negative pair is the owner's document against another
  account's document — same collection, same shape.
- **Phase G**: prefer deleting the few documents you created (`curl -X DELETE` with the same
  `Bearer owner` header) over wiping `.emulator-data/`, which throws away the shared seed.

### Where things are recorded

- **Branches**: `develop` is the integration branch, `main` the default; a session branches off
  whatever is active (usually `develop`) and merges into it by PR.
- **The outcome of a verification**: `SESSION_NOTES.md` during the session (untracked — delete it
  before the commit); it is folded into `CLAUDE.md` (the "Latest" entry) and `Draft Release Temp.md`
  before the PR.
- **Impeccable critiques are committed** (since 2026-09-12): `.impeccable/critique/*.md` is tracked,
  so the snapshot `polish` reads as its backlog is the same on every machine. A critique is
  committed in the session that produces it; one that describes a surface since rebuilt is
  deleted, not kept as history (the eleven pre-«Verdict over Tiles» ones were removed that day).
  `.impeccable/hook.cache.json` stays local (`.git/info/exclude`).
- **Do not duplicate project conventions here.** Code and comment conventions live in
  `DEVELOPMENT_GUIDELINES.md` and `COMMENTS.md`, repo-wide patterns and traps in `AGENTS.md`, the
  per-area rules in `doc/guide/<tema>.md`, the aesthetic in `DESIGN.md`, environment and emulators
  in `SETUP.md`. This file holds only the portable standard and its local translation.
