# AI-00 — Dependency upgrade

> Series `doc/ai/` (README.md § 5): the first spec, **depends on nothing**, every other spec depends on it. Written on
> 2026-11-01 from `develop` @ b9411a4d. The audit and the owner's decisions are in `doc/guide/dipendenze.md`
> (created the same day); this spec is the session that executes decision 3 of that guide.

## 1. The problem today (evidence on the code)

- `npm audit --json` on 2026-11-01 reports **54 advisories** against the 20 CLAUDE.md § Known Issues records for
  2026-10-08; the lockfile has not changed since d6dbb590 (2026-10-23), so the 34 new ones are advisories published
  since, not packages added.
- **One is direct AND at runtime**: `zod < 4.6.6` (high, «memory exhaustion while validating oversized constrained
  collections»). The app depends on `zod ^4.1.12` and parses every request body of the AI routes with it
  (`lib/server/validation.ts` `parseOr400`; `app/api/allocation-advice/run/route.ts:62-71` @ b9411a4d), and the series
  adds four more schemas on request bodies and model answers (AI-04 `interviewRoundSchema`, AI-05 `expenseProposalSchema`,
  AI-06 `questionSchema`). An upgrade AFTER those schemas exist would have to re-verify them; before, it verifies today's.
- **One is critical but dev-only**: `storybook 10.0.0–10.6.1` (origin validation in the preview). Not in the bundle.
- The rest with a fix are transitive dev or tooling chains (vitest/vite, undici, body-parser, re2js, fast-uri, qs,
  ip-address, hono, esbuild, archiver/glob/minimatch where non-major).
- The already-accepted families (CLAUDE.md 2026-10-08: `firebase-tools` chain, `@grpc/grpc-js` under `firebase`,
  the eslint/storybook-vite major downgrades) are NOT touched by this spec.

## 2. Goal and acceptance criteria

The repo the series is built on carries no advisory that a non-major bump cures, and the direct runtime dependency
`zod` is current.

1. **`npm audit` after the session lists only the accepted families** (the `firebase-tools` chain, `firebase`/`@grpc/grpc-js`,
   the eslint/eslint-config-next/storybook-vite chains that need a major downgrade). Proof: `npm audit --json | jq '.metadata.vulnerabilities'`
   and the list of `via` roots; every remaining row has `fixAvailable` = `false` or a `{ isSemVerMajor: true }` fix.
2. **`zod` is `≥ 4.6.6`** and every schema of the app parses as before. Proof: `npm ls zod` prints one version;
   `TZ=Europe/Rome npx vitest run` is green (the route-schema suites `allocationAdviceRoutes`, `goalProposal`,
   `assistantStream*`, `validation`).
3. **No direct dependency crossed a major**: `git diff package.json` shows only minor/patch moves. Proof: the diff.
4. **`npx tsc --noEmit`, `npm run lint`, `npm run build` green**; `npm run perf:budget` green or with a ceiling raised
   with `raisedBy` and the reason (`doc/guide/velocita.md` § Registro).
5. **`doc/guide/dipendenze.md` rewritten** from the new audit: the «Last audit» date, the result line, the table.
   Proof: the diff of the guide; CLAUDE.md § Known Issues' first bullet updated with the new count and date.
6. **Playwright whole run green** on the emulators (doc/guide/e2e-emulatori.md, the known flakes excluded by name):
   vitest/vite move the test runner, firebase-tools is not touched, so the emulators behave as before.

## 3. Decisions

- **Decision 2 (owner, 2026-11-01)**: a dedicated upgrade session BEFORE the first implementation.
- **The guide's decision 3**: zod first, then the dev/tooling fixes; the accepted families stay accepted.
- **Adopted, reversible**: the order of the groups below (runtime → test runner → tooling chains); a bump that fails
  its gate is reverted alone and recorded in the guide as «accepted until <reason>», never forced.
- **Adopted, reversible**: `npm audit fix` (without `--force`) is NOT run even where it would work: each bump is
  explicit in `package.json`, so the diff of the session reads as a list of decisions.

## 4. Solution

Groups, each closed by its gate before the next starts:

1. **Runtime** — `zod` → the latest `4.6.x` (≥ 4.6.6) released ≥ 3 days before the session. Gate: `tsc`, the schema
   suites, `npm run build`.
2. **Test runner** — `vitest` and `@vitest/mocker` to the latest 4.x that moves `vite` out of `8.0.0–8.1.5`; `esbuild`
   follows. Gate: `TZ=Europe/Rome npx vitest run` and `TZ=UTC npx vitest run` (the double-zone rule, AGENTS.md § Commands).
3. **Storybook** — `storybook` and the `@storybook/*` packages of the same train to the latest 10.x. Gate: `npm run
   storybook:build` if the script exists, else `npx storybook build --quiet`; the `.storybook/` config untouched.
4. **Transitive tooling** — `undici`, `body-parser`, `re2js`, `fast-uri`, `qs`, `ip-address`, `@hono/node-server`,
   `googleapis-common`, `exegesis`, `archiver*`, `readdir-glob`, `zip-stream`, `eslint-plugin-import`,
   `eslint-plugin-react`: a `npm update <name>` each (they are not direct; `npm update` moves the lock inside the
   declared range) and `npm ls <name>` to see the new version. Gate: `npm run lint`, `npm run build`.
5. **The guide and CLAUDE.md** rewritten (criterion 5), `Draft Release Temp.md` untouched (nothing the user sees).

The commands, in order, with the trap each one answers:

```bash
npm view zod versions --json | tail -5          # choose a release ≥ 3 days old
npm install zod@4.6.x                            # package.json + lock, by hand
npx tsc --noEmit && TZ=Europe/Rome npx vitest run && npm run build
npm install vitest@4.x @vitest/mocker@4.x        # the runner; vite follows
TZ=Europe/Rome npx vitest run && TZ=UTC npx vitest run
npm install storybook@10.x                       # and the @storybook/* of the same train
npm update undici body-parser re2js fast-uri qs ip-address @hono/node-server googleapis-common exegesis archiver archiver-utils readdir-glob zip-stream eslint-plugin-import eslint-plugin-react
npm run lint && npm run build && npm run perf:budget
npm audit --json | jq '.metadata.vulnerabilities'
```

## 5. Constraints and traps (AGENTS.md rules, «here it means that»)

- **AGENTS.md § Commands, `npm install --package-lock-only` rewrites dozens of unrelated lines** — here it means that
  every install is a plain `npm install <pkg>@<ver>` and `git diff --stat package-lock.json` is read after each one; a
  diff that touches packages outside the group is reverted with `git checkout -- package-lock.json` ONLY in this spec
  (nothing else of the session lives in that file) and redone.
- **CLAUDE.md § Known Issues, firebase-admin 14 pins firebase ≥ 12.19 and Node 24** — here it means that `firebase`,
  `firebase-admin`, `@firebase/*` are not in any command above; `npm update` with no argument is never run.
- **The `overrides` → `jwks-rsa ^3.2.2` in package.json** (held by `__tests__/vercelConfig.test.ts`) — here it means
  that the override survives every install; the test proves it.
- **`npm run perf:budget` runs on the production build** — here it means stopping any `perf:serve` before `perf:build`
  (memory 2026-10, doc/guide/velocita.md).
- **The double-zone Vitest rule** — the runner upgrade is the one change that could move a date fixture; both zones run.

## 6. Tests per level (with the mutation that proves each)

- **Unit**: the whole Vitest suite in both zones. Mutation that proves the gate catches a zod behaviour change: in a
  scratchpad copy of `__tests__/goalProposal.test.ts`, feed an array one item over its `.max()` and expect a parse
  failure; a passing parse would mean the schema's cap no longer binds.
- **Type**: `npx tsc --noEmit`. Mutation: none needed, a zod major-adjacent type change fails it on its own.
- **Build and perf**: `npm run build`, `npm run perf:budget`. Mutation: none; a grown bundle is the finding.
- **E2E**: the whole Playwright run on the emulators (the runner is Playwright's, untouched; the app's bundle is the
  object).

## 7. Guided verification (WORKFLOW.md § 2)

- **A — what** (before touching anything): the six criteria of § 2, the expected outcome «`npm audit` lists only the
  accepted families; every gate green; no major crossed».
- **B — static**: `git diff package.json` reviewed line by line with the owner (the question tool, one group per
  question when a choice exists: e.g. two storybook trains).
- **C — automated**: the gates of § 4 in order, each output quoted whole in the session notes.
- **D — data**: none (no Firestore change).
- **E — browser**: the Playwright whole run; a manual open of `/dashboard` on the emulators to see the app boots.
- **F — the owner**: not needed (no visible change); the owner reads the diff summary.
- **G — cleanup**: scratchpad scripts removed; `SESSION_NOTES.md` not committed.

## 8. Putting it into service

One branch `chore/dipendenze-2026-11`, one commit `chore(deps): zod 4.6, vitest 4.x, storybook 10.x, tooling chains`,
PR to `develop`; the Vercel preview opened once (`/dashboard/assistant` loads, `/api/dashboard/overview` answers 200
when signed in). No feature flag, no rollout.

## 9. Documentation

- `doc/guide/dipendenze.md`: the § Status table and the advisory table rewritten from the new audit (the guide stays
  under 100 lines).
- CLAUDE.md § Known Issues: the first bullet («`npm audit` keeps 20 advisories») rewritten with the new count, the
  date and the accepted families; nothing else (the index rule).
- `doc/ai/README.md` § 6: AI-00 «implemented on …».
- Nothing in AGENTS.md (no new rule), nothing in `Draft Release Temp.md`.

## 10. Declared out of scope

- The accepted families (firebase/grpc-js, firebase-tools, eslint and storybook-vite majors): heir CLAUDE.md § Known
  Issues, re-read at the next `npm update` as it already says.
- Next.js, React, firebase, firebase-admin, `@anthropic-ai/sdk` upgrades: heir a later dependency session, opened by
  rule 8 when an advisory names them.
- Storybook stories' content: untouched.

## 11. The prompt that implements it

```
Leggi WORKFLOW.md, AGENTS.md § Commands, CLAUDE.md § Known Issues, doc/guide/dipendenze.md e doc/ai/AI-00-dipendenze.md.
Implementa AI-00 così com'è scritta: un gruppo alla volta nell'ordine della § 4, il gate di ogni gruppo prima del
successivo, ogni versione scelta con `npm view` e di almeno tre giorni fa, mai `npm audit fix`, mai `--force`, mai
`npm update` senza argomento, mai firebase/firebase-admin/firebase-tools/eslint/eslint-config-next oltre il major.
Alla fine riscrivi doc/guide/dipendenze.md e il primo punto di CLAUDE.md § Known Issues dal nuovo `npm audit`.
Collaudo: WORKFLOW.md § 2, fasi A–G come nella § 7 della spec. Un branch, un commit, solo dopo il mio OK con il
riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium**. Estimated size: 1 session, ~2 h with the whole Playwright run; `package.json`
~6 lines, the lock several hundred, two docs.
