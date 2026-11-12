# Dependencies — the audit and the decisions

> **When to open this guide** — at the opening of EVERY session (WORKFLOW.md § 1, rule 8): `npm audit --json`,
> the comparison with § Registro below, one line of answer («dipendenze: invariate dal <data>» or «N avvisi nuovi:
> …»). A new advisory enters here with the owner's decision, asked under rule 5; nothing is upgraded in the session
> that notices it. An upgrade is a session of its own, on its own branch, with its own verification; never
> `npm audit fix`, never the command a page suggests. Created on 2026-11-01; rewritten by the upgrade of 2026-11-03.

## Status

| | |
| --- | --- |
| **Last audit** | 2026-11-11 (`npm audit --json`, on the lock of 2026-11-11 — `fast-xml-parser` moved on the lock of 2026-11-07 (PR #507), § Registro › Moves) |
| **Result** | **30 advisories**: 9 high · 21 moderate, no critical, no low (32 on 2026-11-07: 9 high · 23 moderate — two moderate rows left the registry's advisories; 31 on the morning of 2026-11-11 with a new low on `fast-xml-parser`, cured the same day; 41 on 2026-11-03; 54 before the upgrade of that day) |
| **Frameworks** | Next.js `^16.4.2` · React 19 (compiler on) · firebase `^12.5.0` (12.19.0) · firebase-admin `^14.5.0` · zod `^4.6.7` · `@anthropic-ai/sdk` `^0.115.0` · storybook `^10.6.5` · firebase-tools `^15.24.0` (15.33.0) · vitest `^4.1.12` |
| **Node** | 24.x (`engines.node`, held by `__tests__/vercelConfig.test.ts`) |
| **Next step** | none open: the next audit opens the next session (WORKFLOW.md rule 8) |

## The decisions (the owner's, dated)

1. **Accepted, dev-only, no non-destructive fix** (2026-10-08, confirmed 2026-11-01): everything `npm audit` cures only
   with `firebase-tools@13.11.2` (a semver-major downgrade of the CLI) or with `eslint@4` / `eslint-config-next@0.2.4` /
   `@storybook/react-vite@8.5.3` / `eslint-plugin-storybook@0.1.1` (major downgrades of development tools). Plus the
   rows that read `fixAvailable: true` with no fixed version inside their parents' ranges (2026-11-01, nine rows;
   2026-11-03, `eslint-plugin-import` and `google-gax`). Raising the `minimatch` override and adding a `glob` one were
   declined (2026-11-01). **`google-gax` is the one not strictly dev**: besides
   `firebase-tools` it sits under `@google-cloud/firestore-api`, optional under `firebase-admin`; 5.0.8, the last 5.x,
   is still inside the advisory's range (via `rimraf`).
2. **Accepted, runtime, no fix** (2026-10-08): `@grpc/grpc-js` under the client `firebase` (`firebase@9.14.0` is the
   only «fix», and not an option: firebase-admin 14 wants firebase ≥ 12.19 — CLAUDE.md § Known Issues).
3. **Upgraded on 2026-11-03**: every advisory with a fix inside the declared ranges, zod first; § Registro → Moves.
4. **The growth an upgrade brings raises the ceiling, it is not undone** (2026-11-03): zod's +9,6 KB gz and re2js's
   +2,1 KB gz went through `doc/guide/velocita.md` § Registro dei tetti alzati.

## Registro

The open rows of the audit of 2026-11-03. Compared at every session start; a row not here is new. On 2026-11-11 the
nine high rows are all open and 21 of the moderate ones: @google-cloud/pubsub, @opentelemetry/core, gaxios, glob,
minimatch, rimraf, uuid · @typescript-eslint/{parser,typescript-estree,utils}, typescript-eslint ·
@storybook/react-vite, @joshwooding/vite-plugin-react-docgen-typescript · archiver, archiver-utils, zip-stream,
exegesis, googleapis-common, @typescript-eslint/eslint-plugin, @typescript-eslint/type-utils, google-gax.

| Severity | Packages | Rows | npm's «fix» | Decision |
| --- | --- | --- | --- | --- |
| high | firebase · @firebase/firestore · @firebase/firestore-compat · @grpc/grpc-js | 4 | `firebase@9.14.0` (major) | accepted (2) |
| high | firebase-tools · basic-ftp · get-uri · pac-proxy-agent · proxy-agent | 5 | `firebase-tools@13.11.2` (major) | accepted (1) |
| moderate | @google-cloud/pubsub · @opentelemetry/core · gaxios · glob · minimatch · rimraf · superstatic · uuid | 8 | `firebase-tools@13.11.2` (major) | accepted (1) |
| moderate | eslint · eslint-config-next · @eslint-community/eslint-utils · @eslint/config-array · @eslint/eslintrc · @typescript-eslint/{parser,typescript-estree,utils} · typescript-eslint · eslint-plugin-jsx-a11y | 10 | `eslint@4` / `eslint-config-next@0.2.4` / `eslint-plugin-storybook@0.1.1` (major) | accepted (1) |
| moderate | @storybook/react-vite · @joshwooding/vite-plugin-react-docgen-typescript · eslint-plugin-storybook | 3 | major downgrade | accepted (1) |
| moderate | archiver · archiver-utils · zip-stream · readdir-glob · exegesis · googleapis-common · eslint-plugin-react · @typescript-eslint/eslint-plugin · @typescript-eslint/type-utils · google-gax · eslint-plugin-import | 11 | `true` or a major, it flips; no fixed version in range | accepted (1) |

### Moves

| Date | Package | From → to | Advisory cured | PR |
| --- | --- | --- | --- | --- |
| 2026-11-03 | zod | 4.4.3 → 4.6.7 | memory exhaustion on oversized constrained collections | #497 |
| 2026-11-03 | re2js (under @firebase/firestore) | 2.8.6 → 2.9.1 | lookbehind DoS | #497 |
| 2026-11-03 | undici | 6.29.0 → 6.29.1 · 7.30.0 → 7.30.1 · 8.11.2 → 8.12.3 | DoS, TLS validation, cache poisoning (eight advisories) | #497 |
| 2026-11-03 | vitest and `@vitest/*` | 4.1.11 → 4.1.12 | code injection via mock registration; Windows backslash traversal | #497 |
| 2026-11-03 | vite (rolldown 1.1.5 → 1.2.16) | 8.1.5 → 8.3.5 | launch-editor (three, one high); cross-origin script execution through custom middleware; files outside `server.fs.allow` | #497 |
| 2026-11-03 | storybook, `@storybook/*`, eslint-plugin-storybook | 10.4.1 → 10.6.5 | origin validation in the preview; code injection from the local network | #497 |
| 2026-11-03 | esbuild (one copy; tsx's nested 0.28.1 deduped away) | 0.27.7 → 0.28.2 | file read from the dev server on Windows | #497 |
| 2026-11-03 | body-parser | 1.20.8 → 1.20.9 · 2.3.0 → 2.4.0 | DoS on a compressed body | #497 |
| 2026-11-03 | qs · fast-uri · ip-address | 6.16.0 → 6.16.2 · 3.1.8 → 3.1.9 · 10.7.3 → 10.7.5 | DoS in stringify; URI spoofing; quadratic zone match | #497 |
| 2026-11-03 | @hono/node-server | 1.19.17 → 2.1.6 (published 2026-11-02, the newest in `@modelcontextprotocol/sdk`'s `^1.19.9 \|\| ^2.0.5`; a major inside the parent's range) | `serveStatic` decoding the path twice | #497 |
| 2026-11-07 | jsdom · @testing-library/react · @testing-library/dom · @testing-library/user-event | new devDependencies at exact versions: 30.1.3 · 16.3.3 · 10.4.2 · 14.6.8 (the newest stable at least seven days old; `dom` and `user-event` were already hoisted under storybook, now declared) | none — the component-test harness of the `dom` project in `vitest.config.ts` (owner, 2026-11-07); the gate below run once, 0 new advisories (32, unchanged) | #507 |
| 2026-11-11 | fast-xml-parser (with is-unsafe 2.0.2 → 2.0.3 and strnum 2.4.2 → 2.5.1; under `firebase-admin` → `@google-cloud/storage`, optional) | 5.11.2 → 5.12.0 (published 2026-11-03) | quadratic CPU on unterminated stop-node tags (low, GHSA-474x-hrwr-fgx4, new that morning) | the retirement of the Registra spec (branch `docs/ritiro-ai-05`) — in that session by the owner's waiver of WORKFLOW.md rule 8 for this row (2026-11-11); `npm update fast-xml-parser`, the gate run once |

## How an upgrade is done

- **Node 24 first** (`node -v`); then `npm ci`, and every server (emulators, `dev:e2e`, `dev:emulator`) stopped before
  each later `npm ci`.
- **One group at a time, one copy per green group** in the scratchpad (`after-group-N/package.json`, `package-lock.json`).
  A group is undone by copying the previous one back and `npm ci`, **never `git checkout`**: the lock holds the earlier
  groups' uncommitted work.
- **A direct dependency moves with `npm install -D|-S <pkg>@<exact>`** (`--save-exact` where the pin is exact, in its own
  command), a transitive one with `npm update <pkg>`, inside its parents' ranges. Never `--package-lock-only`, never
  `npm update` without an argument, never `firebase`, `firebase-admin`, `firebase-tools`, `eslint`, `eslint-config-next`,
  `storybook` past their major. `npm audit fix` never; its `--dry-run --json` is read once.
- **After each group, in order**: (1) the lock comparison: every moved version against the previous green group's lock
  (`.packages[k].version`), and each line one `npm explain` ties to the group, or the group stops; (2) the put-back: an
  entry whose version did not move gets its previous form, except the root entry `""`, which carries the new ranges; a
  new `inBundle` entry is dropped; (3) `npm ci` and
  `npm ls --all`; (4) the gate.
- **The gate**: `node -v`; `npx tsc --noEmit`; `npm run lint`; `TZ=Europe/Rome npx vitest run` and `TZ=UTC npx vitest run`;
  `npm run build && npm run perf:budget`; `npm run build-storybook -- --quiet -o <scratchpad>/storybook-static`; the
  emulators restarted and seeded, :3100 free, `npx playwright test --project=desktop`. After the last group, the whole
  `npm run test:e2e`, and on the PR's Vercel preview an Admin route with no token answers 401, never 500. A red
  test among the known flakes of `doc/guide/e2e-playwright.md` (§ Browser-Driven E2E) is re-run alone with
  `--repeat-each=3` and must be green there; a second red of the same test stops the session.
- **The acceptance filter**: walk `npm audit --json`'s `.vulnerabilities`; a row passes only when its `fixAvailable` is
  a major of `firebase`, `firebase-tools`, `eslint`, `eslint-config-next`, `@storybook/react-vite`,
  `eslint-plugin-storybook`, or the row is one of § Registro's last line. It must print nothing.
- **`jq` is not on the Windows machine**: there the comparison, the put-back and the filter are small node scripts; the
  `jq` lines are in `git show 7514812a:doc/ai/AI-00-dipendenze.md` (:192, :194, :206).

## Per-page blind spots

- **The count rises while the lock does not change**: `npm audit` asks the registry, not the lock. An audit higher than
  the recorded one means advisories published in the meantime, not an undocumented `npm update`.
- **`fixAvailable: true` is not a fix inside the range**: read the versions. Rows also flip between `true` and a major
  from one audit to the next: `@typescript-eslint/{eslint-plugin,type-utils}` within one day (2026-11-01),
  `eslint-plugin-import` and `google-gax` read `true` on the morning of 2026-11-03 with the old lock, and on
  the final lock `eslint-plugin-import` changes from one run to the next (`true`, then a major of `eslint-config-next`,
  four runs in a row). The filter accepts them by name, not by flag.
- **An open-ended override is a door**: `minimatch >=10.2.1` goes to 11.0.4 under `npm audit fix`, with
  `firebase-tools` 15.33.0 → 15.34.2 (dry run of 2026-11-03: 85 package changes). Its output is not pure JSON: text lines
  come first.
- **`npm audit fix --dry-run` crashes on npm 10.9.2** («Cannot read properties of null (reading 'edgesOut')»); npm 11 runs it.
- **npm 11 prints `allow-scripts` warnings on `npm ci`** (2026-11-03): the install scripts of `esbuild`, `re2`,
  `protobufjs`, `@firebase/util`, `unrs-resolver` stay pending and are not run; every gate was green that way. Not
  approved: nothing asked for it.
- **A green suite says nothing about bundle growth**: `perf:budget` was red on `develop` from 2026-10-17 to 2026-11-03
  with every other gate green (doc/guide/velocita.md § Registro dei tetti alzati).
