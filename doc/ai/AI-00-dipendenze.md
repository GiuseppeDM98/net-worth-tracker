# AI-00 — Dependency upgrade

> Series `doc/ai/` (README.md § 5): the first spec, **depends on nothing**; the specs after it are implemented on its
> diff in numeric order (AI-01, a documentation session, uses nothing of it). Written on 2026-11-01 from `develop`
> @ b9411a4d. The audit and the owner's decisions are in `doc/guide/dipendenze.md` (created the same day); this spec is
> the session that executes decision 3 of that guide, on Node 24 (decision 33). Read adversarially on 2026-11-01: 31
> findings applied, the decisions 21–73 in README.md § 3 (this spec: decisions 2, 21, 22, 33, 34, 41, 42, 43).

## 1. The problem today (evidence on the code)

- `npm audit --json` on 2026-11-01 reports **54 rows** (1 critical · 14 high · 38 moderate · 1 low; 35 distinct
  advisories, the latest published on 2026-10-30) against the 20 that CLAUDE.md § Known Issues records for 2026-10-08;
  the lockfile has not changed since d6dbb590 (2026-10-23), so the new rows are advisories published since, not
  packages added. 22 rows carried `fixAvailable: true` in the first audit of the day, 20 in a later one: the two
  `@typescript-eslint/{eslint-plugin,type-utils}` rows switched to the `eslint-config-next@12.0.4` major within the day.
- **Thirteen rows have a fix inside the declared ranges** and are this session's: `zod`, `storybook`, `vitest`,
  `@vitest/mocker`, `vite`, `esbuild`, `undici`, `body-parser`, `re2js`, `fast-uri`, `qs`, `ip-address`,
  `@hono/node-server`. Simulated on a copy of the lock with npm 11 (`--package-lock-only`, the five groups of § 4),
  the audit falls to 41 rows (9 high · 32 moderate, no critical, no low).
- **One is direct AND at runtime**: `zod < 4.6.6` (high, «memory exhaustion while validating oversized constrained
  collections»; 4.4.3 installed). It parses the request bodies of 13 route files through `parseOr400`
  (`lib/server/validation.ts`; e.g. `app/api/allocation-advice/run/route.ts:59-67 @ ce26af4d`), seven dialogs through
  `zodResolver`, and it GENERATES the Consulente's structured-output schema: `betaZodOutputFormat(allocationAdviceAnswerSchema)`
  (`lib/server/allocationAdvice/run.ts:94 @ ce26af4d`) calls `z.toJSONSchema` (`@anthropic-ai/sdk@0.115.0`
  `helpers/beta/zod.js:19`), while `__tests__/allocationAdviceRun.test.ts:129,137,329 @ ce26af4d` assert only
  `format.type`. One zod copy is shared (`deduped`) by `@anthropic-ai/sdk`, `firebase-tools`, `@modelcontextprotocol/sdk`
  and `eslint-plugin-react-hooks`. The series adds more schemas on request bodies and model answers (AI-04
  `questionSchema`, `questionSetSchema`, `interviewRoundSchema`; AI-05 `expenseProposalSchema`, extended by AI-06): an
  upgrade AFTER them would have to re-verify them; before, it verifies today's.
- **Two transitive ones are at runtime**: `re2js` 2.8.6 under `firebase` › `@firebase/firestore` (`^2.8.3`, in the
  browser bundle) and `undici` 7.30.0 under `cheerio` (`^7.19.0`), which both cheerio entries import at load; the
  Borsa Italiana scrapers load cheerio on the server (`lib/services/borsaItalianaScraperService.ts:16 @ ce26af4d`,
  `lib/services/borsaItalianaBondScraperService.ts:19 @ ce26af4d`). `undici` has two more copies: 6.29.0 under
  `firebase-tools`, 8.11.2 under `node-gyp` (dev, optional).
- **One is critical but dev-only**: `storybook 10.0.0–10.6.1` (origin validation in the preview; 10.4.1 installed). Its
  train is four packages pinned in `package.json`: `storybook`, `@storybook/addon-docs`, `@storybook/react-vite` (`^10.4.1`)
  and `eslint-plugin-storybook` (EXACT `10.4.1`, loaded by `eslint.config.mjs:2 @ ce26af4d`). The vulnerable
  `esbuild` 0.27.7 is Storybook's (it caps esbuild at `^0.27`; 10.6.5 accepts `^0.28`); `tsx` has its own 0.28.1.
- **`vite` 8.1.5 is not moved by vitest**: vitest declares `vite: ^6.0.0 || ^7.0.0 || ^8.0.0`, which 8.1.5 already
  satisfies; the one vite copy is shared with `@storybook/react-vite`. `@vitest/mocker` is not a direct dependency:
  vitest pins it EXACT to its own version.
- **Five live inside the `firebase-tools` CLI** (dev; its own version stays 15.33.0): `body-parser` (1.20.8 and 2.3.0),
  `qs`, `fast-uri`, `ip-address`, `@hono/node-server` 1.19.17 (fixed only from 2.1.3, inside
  `@modelcontextprotocol/sdk`'s `^1.19.9 || ^2.0.5`). Moving them changes the code the emulators run.
- **Nine rows are flagged `fixAvailable: true` but have no fixed version inside their parents' ranges**: `archiver`,
  `archiver-utils`, `zip-stream`, `readdir-glob`, `exegesis`, `googleapis-common`, `eslint-plugin-react`,
  `@typescript-eslint/eslint-plugin`, `@typescript-eslint/type-utils`; `glob` and `minimatch` have only the
  `firebase-tools@13.11.2` major. They are accepted (decision 41).
- **`package.json` carries three `overrides`**: `jwks-rsa ^3.2.2` (held by
  `__tests__/vercelConfig.test.ts:43-44 @ ce26af4d`), `minimatch >=10.2.1` and `postcss ^8.5.14`. The minimatch one is
  open-ended: npm 11's `npm audit fix --dry-run` of 2026-11-01 takes it to 11.0.3 (published 2026-10-27), among 65
  version changes that include `firebase-tools` 15.33.0 → 15.34.2.
- **This Mac runs Node 22.14.0** (`engines.node` is `24.x`, what Vercel builds with) and its `node_modules` is stale:
  `npm ls next` prints «next@16.4.0 invalid: "^16.4.2"» and six extraneous wasm packages; `npm audit fix --dry-run`
  crashes on its npm 10.9.2 («Cannot read properties of null (reading 'edgesOut')»), npm 11 runs it.
- The accepted families — the `firebase-tools` chain and `@grpc/grpc-js` under `firebase` (CLAUDE.md, 2026-10-08), the
  eslint / eslint-config-next / `@storybook/react-vite` / eslint-plugin-storybook major downgrades
  (`doc/guide/dipendenze.md` decision 1, 2026-11-01) and decision 41's nine rows — are NOT touched by this spec.

## 2. Goal and acceptance criteria

The repo the series is built on carries no advisory that a fix inside the declared ranges cures, the direct runtime
dependency `zod` is current, and every gate is green on Node 24. `S` below is the session's scratchpad directory
(outside the repo).

1. **`npm audit` keeps only the accepted families.** Proof: the acceptance filter of § 4 prints nothing on the final
   lock; `npm audit --json | jq -c '.metadata.vulnerabilities'` reads, on the 2026-11-01 registry,
   `{"info":0,"low":0,"moderate":32,"high":9,"critical":0,"total":41}`, plus the rows recorded under decision 43. The remaining
   rows are the `firebase-tools` chain, `firebase`/`@grpc/grpc-js`, the eslint/eslint-config-next and
   `@storybook/react-vite`/eslint-plugin-storybook major downgrades, and decision 41's nine rows. The filter does not
   read `fixAvailable: true` as a fix: it lets through a row only when its fix is a major of an accepted parent or the
   row is one of the nine. Mutation: `cp $S/after-group-0/package-lock.json package-lock.json` and
   `npm audit --package-lock-only --json | <filter>` prints the thirteen names of § 1; the final lock is copied back
   from `$S/after-group-5/`.
2. **`zod` is 4.6.7, one copy, and every schema parses as before.** Proof: `npm ls zod` prints `zod@4.6.7` once and
   every other line `deduped`; the seven zod suites alone, then the whole suite in both zones, green; the new case of
   `__tests__/goalProposal.test.ts` (§ 6) green before and after the bump; the wire schema compared (§ 6). Mutation:
   `.max(20)` → `.max(21)` at `lib/utils/goalProposal.ts:78 @ ce26af4d` turns the new case red; undone with the inverse
   Edit.
3. **No direct dependency crossed a major, and exactly six lines of `package.json` moved.** Proof: `git diff
   package.json` shows `zod` `^4.1.12` → `^4.6.7`, `vitest` `^4.0.18` → `^4.1.12`, `storybook`, `@storybook/addon-docs`,
   `@storybook/react-vite` `^10.4.1` → `^10.6.5`, `eslint-plugin-storybook` `10.4.1` → `10.6.5` (exact, as before), and
   nothing else: no key added (`@vitest/mocker` stays transitive), the three `overrides` unchanged. Read line by line
   with the owner in phase B. Mutation: naming `@vitest/mocker` in a command (`npm install -D @vitest/mocker@4.1.12`)
   adds a seventh line, which this criterion refuses.
4. **The transitive moves stayed inside their parents' ranges, and nothing outside the groups moved.** Proof:
   `npm ls --all` exits 0; `npm ls firebase firebase-admin firebase-tools next @firebase/app minimatch` prints 12.19.0,
   14.5.0, 15.33.0, 16.4.2, one `@firebase/app@0.16.2`, every minimatch copy 10.2.5 — as in phase A; each group's lock
   comparison (§ 4) lists only versions `npm explain` ties to the group; the lock holds `undici` ≥ 6.29.1 / ≥ 7.30.1 /
   ≥ 8.12.2, `re2js` ≥ 2.8.7, one `esbuild` ≥ 0.28.1; `git diff package-lock.json` holds no flag-only hunk (no
   `fsevents`, no new `inBundle` entry). Mutation: `npm audit fix` (never run) moves minimatch to 11.0.3 and
   firebase-tools to 15.34.2 (its npm 11 dry run of 2026-11-01): the `npm ls` line of this criterion reads them red.
5. **Every gate is green on Node 24.** Proof: the dependency gate (§ 6) green on HEAD in phase A and after every group,
   each output quoted in `SESSION_NOTES.md`; `npm run perf:budget` green — a route that grows past its ceiling raises
   it with `"raisedBy": "#NNN: why"` and a row in `doc/guide/velocita.md` § Registro dei tetti alzati (§ Il ratchet e
   il tetto alzato); its first line reads `[perf:budget] build .next (BUILD_ID of <today>)`. Mutation: a stale `.next` (on the Mac once a build of
   15 August, red on five routes, `doc/guide/velocita.md` § Baseline in vigore) shows an older date on that line.
6. **Storybook 10.6.5 builds, outside the repo.** Proof: `npm run build-storybook -- --quiet -o $S/storybook-static`
   exits 0; `git status --short` shows no `storybook-static/`; `npm ls esbuild` prints no copy in 0.27.3–0.28.0.
   Mutation: without `-o` the build writes `storybook-static/` in the repo root, which `.gitignore` does not list, and
   `git status` shows it.
7. **The Playwright whole run is green on the emulators** (`npm run test:e2e`, after group 5). A red test listed among
   the known flakes of `doc/guide/e2e-emulatori.md` § Browser-Driven E2E (Playwright) is re-run alone with
   `--repeat-each=3` and must be green there; a second red of the same test stops the session. Proof: the run's summary
   line in the commit message. Mutation: none (this session writes no spec; the bundle is the object).
8. **The deploy loads the moved dependencies** (phase F, the owner). Proof: on the PR's Vercel preview, signed in,
   `/dashboard/assistant` loads and `/api/dashboard/overview` answers 200 in the network panel; opened directly with no
   token, `/api/prices/bond-quote?isin=IT0005672024` answers 401 «Missing Authorization bearer token», never a 500 (its
   module graph — cheerio › undici 7, zod, firebase-admin — loads in a Vercel Function:
   `app/api/prices/bond-quote/route.ts:25-43 @ ce26af4d`, `lib/server/apiAuth.ts:30-31 @ ce26af4d`); on the mirror,
   ONE Consulente run reaches the report (the API accepts the wire schema of zod 4.6.7). Mutation: an ESM-only
   package `require()`d by a moved dependency turns the 401 into a 500 (AGENTS.md § Server Layer and API
   Authorization, `:281 @ ce26af4d`).
9. **The documentation states the new audit** (§ 9). Proof: the diff; `grep -n -e "keeps 20 advisories" -e "the 20
   .npm audit. advisories" CLAUDE.md doc/guide/server.md` prints nothing (it prints both lines today). Mutation: none
   (text).

## 3. Decisions

- **Decision 2 (owner, 2026-11-01)**: a dedicated upgrade session BEFORE the first implementation.
- **The guide's decision 3**: zod first, then every other row with a fix inside the declared ranges.
- **Decision 33**: Node 24 on every machine before this session; `node -v` is the first command, and a gate on Node 22
  is not a gate.
- **Decision 41**: the nine rows of § 1 with no in-range fix are accepted as family 1 (firebase-tools and eslint
  chains, dev only), named in criterion 1 and in the guide's § Registro.
- **Decision 42**: a gate red after zod 4.4.3 → 4.6.7 is fixed in the session when the fix is small (≤ ~20 lines),
  otherwise the session stops and asks the owner; zod is never reverted.
- **Decision 43**: advisories published after the audit of 2026-11-01 that have a fix inside the declared ranges are
  listed to the owner in ONE question and upgraded in this session, in the same gate rounds; the others are recorded in
  the guide's § Registro.
- **Decision 21**: AI-03 adds `jsdom`, `@testing-library/dom`, `@testing-library/react`, `@testing-library/user-event` as devDependencies with a
  row in the guide's § Registro and runs this spec's dependency gate (§ 6) once; this session writes both into the
  guide (§ 9) so that AI-03 finds them after this spec is retired.
- **Decision 34**: the § 11 prompt stays in Italian (the owner's words).
- **Adopted, reversible**: the order of the groups (direct runtime → transitive runtime → test runner → Storybook → the
  CLI's chain). A group other than zod's whose gate is red is undone whole (§ 4) and recorded in the § Registro as
  «accepted until <reason>», never forced; the next groups go on.
- **Adopted, reversible**: the versions are exact (zod 4.6.7, vitest 4.1.12, Storybook 10.6.5): a newer patch published
  since is taken only through decision 43. A transitive moves by `npm update`, so its version is the newest inside its
  parents' ranges at the session; each is recorded with its publish date.
- **Adopted, reversible**: `npm audit fix` is never run; its `--dry-run --json` is read once in phase A (it writes
  nothing): each bump is explicit, so the diff of the session reads as a list of decisions.

## 4. Solution

Phase A, on HEAD, before any install:

```bash
node -v                                                    # v24.x; anything else stops the session (decision 33)
npm ci                                                     # node_modules = the lock, which it never writes
npm ls --all > /dev/null && echo tree-ok                   # exit 0 (before npm ci on 2026-11-01: next 16.4.0 «invalid», 6 extraneous)
mkdir -p $S/after-group-0 && cp package.json package-lock.json $S/after-group-0/
npm ls zod vitest @vitest/mocker vite esbuild storybook re2js undici minimatch firebase firebase-admin firebase-tools next @firebase/app > $S/ls-A.txt
npm audit --json > $S/audit-A.json                          # rule 8's opening audit
jq -r '[.vulnerabilities[].via[] | objects | .url] | unique[]' $S/audit-A.json \
  | while read -r u; do echo "$(gh api "advisories/${u##*/}" --jq .published_at) ${u##*/}"; done | sort > $S/advisories-A.txt
npm audit fix --dry-run --json > $S/audit-fix-dry.json     # read once; never without --dry-run
npx tsx -e 'const { betaZodOutputFormat } = require("@anthropic-ai/sdk/helpers/beta/zod"); const { allocationAdviceAnswerSchema } = require("./lib/utils/allocationAdviceProposal"); console.log(JSON.stringify(betaZodOutputFormat(allocationAdviceAnswerSchema).schema, null, 2))' > $S/answer-schema-before.json
```

`$S/advisories-A.txt` lists 35 advisories on 2026-11-01; a line dated 2026-11-01 or later is a new one (decision 43):
the session lists every new one with its rows and fix in ONE question, before group 1. A new advisory on a package a
group already moves raises that group's exact version to the newest release inside the declared range that cures it
and was published at least three days before the session (a transitive follows its `npm update`); one on another
package forms a group 6 with the same method and gate; one with no fix inside the range is recorded in the
§ Registro. Then the new case of `__tests__/goalProposal.test.ts` (§ 6) is written and the dependency gate runs once
on HEAD's dependencies: a gate red there stops the session before group 1 — the owner gets the output; the upgrade
never starts on a red baseline.

The five groups, in order, each closed by the dependency gate before the next starts:

```bash
# group 1 — the direct runtime dependency
npm install zod@4.6.7
# group 2 — the runtime transitives (re2js under @firebase/firestore; undici's three copies)
npm update re2js undici
# group 3 — the test runner (@vitest/mocker follows its exact pin; vite does not, hence the update)
npm install -D vitest@4.1.12
npm update vite
# group 4 — the Storybook train (one install for the three ranges, one for the exact pin), then its esbuild
npm install -D storybook@10.6.5 @storybook/addon-docs@10.6.5 @storybook/react-vite@10.6.5
npm install -D --save-exact eslint-plugin-storybook@10.6.5
npm update esbuild
# group 5 — inside the firebase-tools CLI (its own version stays 15.33.0)
npm update body-parser qs fast-uri ip-address @hono/node-server
```

After the commands of group N (`P` = N − 1), in this order:

```bash
# 1. what moved, against the previous green group: every line must be the group's package or one `npm explain` ties to it
jq -rn --slurpfile a $S/after-group-$P/package-lock.json --slurpfile b package-lock.json '$a[0].packages as $x | $b[0].packages as $y | (($x|keys) + ($y|keys) | unique[]) as $k | select($x[$k].version != $y[$k].version) | "\($k) \($x[$k].version // "-") -> \($y[$k].version // "-")"'
# 2. the flag-only rewrites put back (an entry whose version did not move gets its previous form; a new inBundle entry is dropped)
jq --slurpfile prev $S/after-group-$P/package-lock.json '$prev[0].packages as $p | .packages |= with_entries(if ($p[.key] != null and .key != "" and $p[.key].version == .value.version) then .value = $p[.key] else . end | select(.value.inBundle != true or $p[.key] != null))' package-lock.json > $S/lock.json && cp $S/lock.json package-lock.json
# 3. node_modules = the lock that will be committed
npm ci && npm ls --all > /dev/null && echo tree-ok
# 4. group 1 only: the wire schema after (the same npx tsx -e line) > $S/answer-schema-after.json; diff the two files
# 5. the dependency gate (§ 6); green →
mkdir -p $S/after-group-$N && cp package.json package-lock.json $S/after-group-$N/
```

Undoing a group = `cp $S/after-group-$P/package.json $S/after-group-$P/package-lock.json .` and `npm ci`; never
`git checkout`. The acceptance filter of criterion 1, run after group 5 and in its mutation:

```bash
npm audit --json | jq -r --argjson nine '["archiver","archiver-utils","zip-stream","readdir-glob","exegesis","googleapis-common","eslint-plugin-react","@typescript-eslint/eslint-plugin","@typescript-eslint/type-utils"]' --argjson majors '["firebase","firebase-tools","eslint","eslint-config-next","@storybook/react-vite","eslint-plugin-storybook"]' '.vulnerabilities | to_entries[] | select(if (.value.fixAvailable|type) == "object" then (.value.fixAvailable.name as $n | $majors | index($n) | not) else (.key as $k | $nine | index($k) | not) end) | .key'
```

On the 2026-11-01 registry the groups give: zod 4.6.7; re2js 2.9.1, undici 6.29.1 / 7.30.1 / 8.12.3; vitest and the
`@vitest/*` 4.1.12, vite 8.3.5 (rolldown 1.2.16); storybook, its `@storybook/*` and eslint-plugin-storybook 10.6.5,
esbuild 0.28.2 (one copy; tsx's nested 0.28.1 deduped away); body-parser 1.20.9 / 2.4.0, qs 6.16.2, fast-uri 3.1.9,
ip-address 10.7.5, @hono/node-server 2.1.5. Then the guide, CLAUDE.md, `doc/guide/server.md` and the README row are
rewritten (§ 9); `Draft Release Temp.md` is untouched (nothing the user sees).

## 5. Constraints and traps (AGENTS.md rules, «here it means that»)

- **AGENTS.md § Commands, «Never `git checkout <file>` to undo ONE edit on uncommitted work»** — here it means that from
  group 2 on the lock holds the earlier groups' uncommitted work: a group is undone by copying back
  `$S/after-group-$P/` and `npm ci`, never by `git checkout -- package-lock.json`.
- **AGENTS.md § Commands, «`npm install` first, then put back any lock line npm rewrote for the platform (`fsevents`'s
  `dev`)»** — here it means step 2 of § 4 after every group: on 2026-11-01 npm 11 dropped the `dev` flag of
  `@pkgjs/parseargs` and of playwright's `fsevents` and added six `inBundle` entries under
  `@tailwindcss/oxide-wasm32-wasi` on the first install; the final lock diff holds version moves only. A direct
  dependency moves with `npm install -D|-S <pkg>@<exact>` (`--save-exact` where the pin is exact), a transitive one with
  `npm update <pkg>` (inside its parents' ranges), never `--package-lock-only`.
- **AGENTS.md § Commands, the phantom errors of a stale `node_modules`** — here it means `npm ci` in phase A (this Mac
  holds next 16.4.0 against the lock's 16.4.2) and after every group, so each gate runs on the lock that is committed.
  Every server (emulators, `dev:e2e`, `dev:emulator`) is stopped before an `npm ci`.
- **A version move that `npm explain` does not tie to the group** stops the group: it is undone and the owner gets the
  comparison's output in one question (rule 5).
- **CLAUDE.md § Known Issues, firebase-admin 14 pins `firebase` ≥ 12.19 and Node 24** — here it means that `firebase`,
  `firebase-admin`, `@firebase/*` and `firebase-tools` are named in no command and `npm update` without an argument is
  never run; their subtrees still move: zod (group 1), undici 6 (group 2) and group 5 live under `firebase-tools`,
  re2js under `@firebase/firestore`, so the dependency gate restarts the emulators every time.
- **`@hono/node-server` crosses 1.x → 2.1.5** inside `@modelcontextprotocol/sdk`'s declared `^1.19.9 || ^2.0.5` (the
  advisory's fix starts at 2.1.3): allowed, it is the parent's range; recorded in the § Registro.
- **AGENTS.md § Server Layer and API Authorization, «A Vercel Function never `require()`s an ESM-only package»** — here
  it means that the three `overrides` survive every install unchanged (`__tests__/vercelConfig.test.ts` holds
  `jwks-rsa`), `npm ls minimatch` prints 10.2.5 before and after, and phase F reads the preview (criterion 8): the
  emulators cannot see this trap.
- **One zod copy serves five consumers** — `npm ls zod` prints one version; `npm run lint` covers
  `eslint-plugin-react-hooks`, the emulators `firebase-tools` and `@modelcontextprotocol/sdk`.
- **Decision 42 on group 1** — a red gate after zod is fixed in the session when the fix (a schema, a call, a test) is
  ≤ ~20 lines and named in the commit message; otherwise the session stops and asks; zod is never undone.
- **`eslint-plugin-storybook` is pinned exact** — its own `npm install --save-exact`; one install with the three ranged
  packages would turn it into `^10.6.5`.
- **`npm run perf:budget` reads the `.next` that `npm run build` just wrote** (`scripts/perfBudget.mts:44,128 @ ce26af4d`):
  its first line names the build and its date; `perf:build` / `perf:serve` are not used in this session. A raised
  ceiling needs the PR number: the session commits after the owner's OK, opens the PR, writes `#NNN` into `raisedBy`
  and the register row, and amends that one commit after a second OK (rule 1 covers `--amend`).
- **Playwright reuses a server already on :3100** (`playwright.config.ts:259 @ ce26af4d`, `reuseExistingServer`): before
  each Playwright run `lsof -i :3100` is empty, so `dev:e2e` starts on the group's modules.
- **The double-zone Vitest rule** — the runner upgrade is the change that could move a date fixture; both zones run in
  every gate.
- **The two `@typescript-eslint` rows flip** between `fixAvailable: true` and the eslint-config-next major across audits
  of one day: criterion 1's filter accepts them by name, not by flag.
- **Cases that do not change**: the demo user, the shared-account viewer, the phone at 390, the tablet, reduced motion,
  the calendar edges — no app code or UI changes; the whole Playwright run (mobile and tablet projects by filename)
  covers the bundle.

## 6. Tests per level (with the mutation that proves each)

- **The dependency gate** (every group, phase A on HEAD, and once in AI-03 for its devDependencies, decision 21):
  `node -v` (v24); `npx tsc --noEmit`; `npm run lint`; `TZ=Europe/Rome npx vitest run` and `TZ=UTC npx vitest run`;
  `npm run build && npm run perf:budget`; `npm run build-storybook -- --quiet -o $S/storybook-static`; the emulators
  restarted (`npm run emulators`, `npm run emulators:seed`), :3100 free, `npx playwright test --project=desktop`. A
  red Playwright test follows the flake rule of criterion 7.
- **Unit, the zod suites**: after group 1, first alone — `TZ=Europe/Rome npx vitest run
  __tests__/{serverValidation,goalProposal,allocationAdviceRoutes,allocationAdviceRun,allocationAdviceProposal,assistantRoutes,assistantMemoryExtraction}.test.ts`
  — then the whole suite in both zones.
- **Unit, the new case** (permanent, written in phase A): in `__tests__/goalProposal.test.ts`, inside «the proposal that
  MODIFIES a goal and names its instruments (2026-10-20)», 21 assignments (`ETF 1` … `ETF 21`, 10 each) → `parseGoalProposal`
  returns `null`, and the first 20 → a proposal with 20 assignments (the positive anchor). Green on 4.4.3 and on 4.6.7.
  Mutation: `.max(20)` → `.max(21)` at `lib/utils/goalProposal.ts:78 @ ce26af4d` turns it red.
- **The wire schema** (not a test: the structured output's input): `$S/answer-schema-before.json` and `-after.json`
  diffed after group 1. An empty diff passes; a non-empty one is shown to the owner in phase B, and phase F's mirror run
  proves the API accepts it.
- **Type**: `npx tsc --noEmit`. Mutation: none (the compiler, not an assertion this session writes).
- **Build, perf, Storybook**: `npm run build`, `npm run perf:budget`, the Storybook build. Mutation: none; a grown
  bundle is the finding (criterion 5).
- **E2E**: the desktop project in every gate, the whole run after group 5 (criterion 7). The seven `zodResolver` dialogs
  (`ExpenseDialog`, `AssetDialog`, `TransactionDialog`, `DividendDialog`, `CategoryManagementDialog`,
  `PensionContributionDialog`, `PensionValueDialog`) are proven by the whole run.

## 7. Guided verification (WORKFLOW.md § 2)

- **A — invarianza** (before any install): the expected outcome first — «the filter prints the thirteen names of § 1
  now and nothing at the end; every gate green on Node 24; six lines of `package.json`; firebase-tools 15.33.0,
  minimatch 10.2.5»; then the phase-A block of § 4, the decision-43 question when new advisories exist, the new
  goalProposal case, the dependency gate on HEAD, every output quoted in `SESSION_NOTES.md`.
- **B — static**: `git diff package.json` read line by line with the owner (criterion 3) and the wire-schema diff
  (after group 1); the versions are fixed in § 4, so no version is asked.
- **C — the groups**: the five groups of § 4 in order, each with its comparison, put-back, `npm ci` and gate.
- **D — under the UI**: the `npm ls` lines of criteria 2 and 4 against `$S/ls-A.txt`, the acceptance filter and its
  mutation (criterion 1), the zod mutation (criterion 2).
- **E — browser**: the Playwright whole run on the emulators (criterion 7).
- **F — the owner, in two steps, at the owner's «pronto»**: before the commit, on the mirror (`npm run mirror:seed --
  <email>`, `npm run dev:emulator` with the `.env.local` key, the page opened for the owner already signed in): ONE
  Consulente run to the report. After the PR is open, on its Vercel preview signed in: `/dashboard/assistant` loads,
  `/api/dashboard/overview` 200 in the network panel, `/api/prices/bond-quote?isin=IT0005672024` opened directly 401
  (criterion 8). The session hands over the URL and the three checks; the PR is not merged before both steps. Not
  covered: the Storybook UI (its build only), the emulators' UI.
- **G — cleanup** (before the commit): `npm run mirror:remove`, the emulators and every server stopped, `git status`
  shows only `package.json`, `package-lock.json`, `__tests__/goalProposal.test.ts` and the docs of § 9 (a
  `tsconfig.json` rewritten by `next dev` is restored, AGENTS.md § Commands); `SESSION_NOTES.md` written into its
  destinations and deleted (WORKFLOW.md rule 9).

## 8. Putting it into service

One branch `chore/dipendenze-2026-11` from `develop`, one commit `chore(deps): zod 4.6.7, vitest 4.1.12, storybook
10.6.5, transitive fixes` (the gates' signals — test counts, the whole run, the audit before/after — in its message),
PR to `develop`; phase F's preview read by the owner before the merge. No feature flag, no rollout.

## 9. Documentation

- `doc/guide/dipendenze.md` (75 lines, stays under 100):
  - § Status: «Last audit» = the session's date and lock commit; «Result» = the new count by severity; «Frameworks»
    with zod `^4.6.7`, storybook `^10.6.5`, vitest `^4.1.12`; «Next step» = «none open: the next audit opens the next
    session (WORKFLOW.md rule 8)».
  - § The decisions: family 1 gains decision 41's nine rows («`fixAvailable: true` with no fixed version inside their
    parents' ranges»); family 3 becomes «Upgraded on <date>», pointing to § Registro.
  - § The table (2026-11-01) becomes **§ Registro**: the open rows of the new audit, one line per family with its
    decision (`eslint-plugin-import` in the eslint-config-next row; the two `@typescript-eslint` rows and the other
    seven in decision 41's row), then a «Moves» table — date · package · from → to · advisory cured · PR — whose first
    rows are this session's five groups. AI-03 adds its `jsdom` / `@testing-library/*` row there (decision 21).
  - § How an upgrade is done (the contract) rewritten to this spec's method: Node 24 first; `npm ci`; one copy per
    green group in the scratchpad and the undo by copy + `npm ci`, never `git checkout`; `npm install -D|-S
    <pkg>@<exact>` for a direct dependency, `npm update <pkg>` for a transitive; the lock comparison and the put-back
    (the two `jq` lines of § 4); the dependency gate of § 6, after every group; the acceptance filter; `npm audit fix`
    never, its `--dry-run --json` read once. AI-03 reuses this gate (decision 21).
  - § Per-page blind spots gains: «`fixAvailable: true` is not a fix inside the range» (the nine rows; the two rows
    that flipped within one day); «an open-ended override is a door» (`minimatch >=10.2.1` → 11.0.3 under `npm audit
    fix`); «`npm audit fix --dry-run` crashes on npm 10.9.2».
- CLAUDE.md § Known Issues, the first bullet (`CLAUDE.md:65 @ ce26af4d`, «`npm audit` keeps 20 advisories…») becomes:
  «**`npm audit` keeps N advisories, none critical** (<date>, after the dependency upgrade: zod 4.6.7, vitest 4.1.12,
  Storybook 10.6.5): all in the families accepted in `doc/guide/dipendenze.md` — the `firebase-tools` chain and the
  eslint / Storybook chains whose fix is a major downgrade (dev only), `@grpc/grpc-js` under the client `firebase` (fix
  = `firebase@9`, not an option). Compared at every session start (WORKFLOW.md rule 8); never `npm audit fix`.»
- CLAUDE.md § Current Status, «Latest»: replaced by the session's one-line outcome (the upgrade, the new count, where it
  is written; Next: AI-01), the «Open» items kept (WORKFLOW.md § 2, Closing a verification).
- `doc/guide/server.md` § Per-page blind spots (`:48-50 @ ce26af4d`): «and the 20 `npm audit` advisories inside
  `firebase-tools` and `@grpc/grpc-js`» becomes «and the `npm audit` count; the advisories and their decisions are in
  `doc/guide/dipendenze.md`».
- `doc/ai/README.md` § 6: AI-00 «implemented on <date>, PR #… in develop since …».
- `doc/guide/velocita.md` § Registro dei tetti alzati: one row only when criterion 5 raises a ceiling.
- Nothing in AGENTS.md (no new rule; WORKFLOW.md rule 8 points to the guide), nothing in `Draft Release Temp.md`.

## 10. Declared out of scope

Only what is definitively not done (decision 22):

- The accepted families stay: the `firebase-tools` chain and the eslint / Storybook major downgrades (the guide's
  decision 1), `@grpc/grpc-js` under `firebase` (the guide's decision 2), the nine rows (decision 41); each is compared
  at every session start (WORKFLOW.md rule 8).
- No `minimatch` override raised and no `glob` override added (decision 41: both cures were declined).
- No upgrade of Next.js, React, `firebase`, `firebase-admin`, `firebase-tools` itself, `@anthropic-ai/sdk`, eslint,
  eslint-config-next (decision 2 scopes this session to the advisories with a fix inside the declared ranges).
- `jsdom`, `@testing-library/react`, `@testing-library/user-event`: AI-03 (decision 21).
- Storybook's stories and `.storybook/` config: untouched (decision 2).

## 11. The prompt that implements it

```
Leggi WORKFLOW.md, AGENTS.md § Commands e § Server Layer and API Authorization, CLAUDE.md § Known Issues,
doc/guide/dipendenze.md, doc/ai/AI-00-dipendenze.md e doc/ai/README.md § 3 (decisioni 2, 21, 33, 41, 42, 43).
Il primo comando è `node -v`: se non stampa v24, fermati e chiedimi di installare Node 24 (nvm o volta). Poi la fase A
della § 7: `npm ci`, le copie in scratchpad, l'audit d'apertura (gli avvisi pubblicati dal 2026-11-01 in poi me li
elenchi in una sola domanda, decisione 43), il dry run di `npm audit fix`, lo schema JSON prima, il caso nuovo di
__tests__/goalProposal.test.ts e il gate delle dipendenze (§ 6) su HEAD: un gate già rosso su HEAD ti ferma.
Implementa i cinque gruppi della § 4 nell'ordine e con le versioni esatte della spec: dopo ogni gruppo il confronto
del lock, il ripristino dei flag, `npm ci` e il gate delle dipendenze. Mai `git checkout` sul lock (si torna con le
copie in scratchpad), mai `npm audit fix` senza `--dry-run`, mai `--force`, mai `npm update` senza argomento, mai
firebase/firebase-admin/firebase-tools/eslint/eslint-config-next/storybook oltre il major; le dipendenze transitive
sotto firebase-tools e @firebase/firestore si muovono solo con `npm update <nome>` dentro il range. Se il gate di zod
è rosso: correggi nella sessione quando bastano ~20 righe, altrimenti fermati e chiedimi; zod non si annulla mai
(decisione 42). Uno spostamento di versione che `npm explain` non lega al gruppo ti ferma.
Alla fine riscrivi doc/guide/dipendenze.md (Status, decisioni, § Registro, How an upgrade is done, blind spots), il
primo punto di CLAUDE.md § Known Issues e la riga Latest, la frase sugli avvisi di doc/guide/server.md § Per-page
blind spots e la riga AI-00 di doc/ai/README.md § 6.
Collaudo: WORKFLOW.md § 2, fasi A–G come nella § 7 della spec; la fase F è mia (la corsa del Consulente sul mirror
prima del commit, la preview Vercel dopo la PR). Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium**. Estimated size: 1 session, ~3 h (six rounds of the dependency gate, the whole
Playwright run, phase F); `package.json` 6 lines, the lock several hundred, one test case, four docs.
