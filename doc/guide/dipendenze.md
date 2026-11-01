# Dependencies — the audit and the decisions

> **When to open this guide** — at the opening of EVERY session (WORKFLOW.md § 1, rule 8): `npm audit --json`,
> the comparison with the table below, one line of answer («dipendenze: invariate dal <data>» or «N avvisi nuovi:
> …»). A new advisory enters here with the owner's decision, asked under rule 5; nothing is upgraded in the session
> that notices it. An upgrade is a session of its own, on its own branch, with its own verification; never
> `npm audit fix --force`, never the command a page suggests: the version is chosen and installed by hand, preferring
> a release a few days old. Created on 2026-11-01 by the planning session of the `doc/ai/` series (the first session
> that noticed the file was missing, as the rule asks; no `TEMPLATES.md` exists, this is the format).

## Status

| | |
| --- | --- |
| **Last audit** | 2026-11-01 (`npm audit --json`, lockfile at commit d6dbb590 of 2026-10-23) |
| **Result** | **54 advisories**: 1 critical · 14 high · 38 moderate · 1 low (on 2026-10-08 they were 20, all inside `firebase-tools` and `@grpc/grpc-js`) |
| **Frameworks** | Next.js `^16.4.2` · React 19 (compiler on) · firebase `^12.5.0` · firebase-admin `^14.5.0` · zod `^4.1.12` · `@anthropic-ai/sdk` `^0.115.0` · storybook `^10.4.1` · firebase-tools `^15.24.0` · vitest (see the lock) |
| **Node** | 24.x (`engines.node`, held by `__tests__/vercelConfig.test.ts`) |
| **Next step** | **AI-00** (`doc/ai/AI-00-dipendenze.md`): the upgrade session the owner decided on 2026-11-01, BEFORE the first implementation of the series |

## The decisions (the owner's, dated)

Three families, three decisions:

1. **Accepted, dev-only, no non-destructive fix** (2026-10-08, confirmed 2026-11-01): everything `npm audit` cures only
   with `firebase-tools@13.11.2` (a semver-major downgrade of the CLI, which runs locally for the emulators only) or with
   `eslint@4` / `eslint-config-next@0.2.4` / `@storybook/react-vite@8.5.3` / `eslint-plugin-storybook@0.1.1` (all major
   downgrades of development tools). None of them enters the bundle or the Vercel functions.
2. **Accepted, runtime, no fix** (2026-10-08): `@grpc/grpc-js` under the client `firebase` (`firebase@9.14.0` is the
   only «fix», and not an option: firebase-admin 14 wants firebase ≥ 12.19 — CLAUDE.md § Known Issues).
3. **To upgrade in AI-00** (2026-11-01): every advisory with `fixAvailable: true` (a minor or patch bump inside the
   declared range), **zod first** because it is the only one both direct AND at runtime (the route schemas in
   `lib/server/validation.ts` and the Assistente's blocks); then `storybook` (critical but dev-only), `vitest`/`@vitest/mocker`,
   `undici`, `vite`, `body-parser`, `re2js`, `fast-uri`, `qs`, `ip-address`, `@hono/node-server`, `esbuild`, the
   `archiver`/`glob`/`minimatch` chains where the fix is non-major.

## The table (2026-11-01)

Severity · package · direct · via · the fix npm proposes · **decision**. «fix» = `fixAvailable: true` (non-major bump).

| Severity | Package | Direct | Via | npm fix | Decision |
| --- | --- | --- | --- | --- | --- |
| critical | storybook 10.0.0–10.6.1 | yes (dev) | origin validation in the preview | fix | **AI-00** |
| high | zod < 4.6.6 | **yes (runtime)** | memory exhaustion on oversized constrained collections | fix | **AI-00, first** |
| high | undici | no | DoS in the EventSource parser | fix | AI-00 |
| high | vite 8.0.0–8.1.5 | no (vitest) | launch-editor on Windows | fix | AI-00 |
| high | body-parser | no (firebase-tools) | DoS on a compressed body | fix | AI-00 |
| high | re2js 2.2.0–2.8.6 | no | lookbehind DoS | fix | AI-00 |
| high | firebase · @firebase/firestore · @firebase/firestore-compat · @grpc/grpc-js | firebase yes | grpc-js `getAuthContext` | `firebase@9.14.0` (major) | **accepted** (2) |
| high | firebase-tools · basic-ftp · get-uri · pac-proxy-agent · proxy-agent | firebase-tools yes (dev) | the CLI's proxy chain | `firebase-tools@13.11.2` (major) | **accepted** (1) |
| moderate | vitest · @vitest/mocker | vitest yes (dev) | mock registration / Windows | fix | AI-00 |
| moderate | @hono/node-server · fast-uri · qs · ip-address · googleapis-common · exegesis · archiver · archiver-utils · readdir-glob · zip-stream · eslint-plugin-import · eslint-plugin-react | no | various (DoS, spoofing, glob) | fix | AI-00 |
| moderate | @google-cloud/pubsub · @opentelemetry/core · gaxios · glob · google-gax · minimatch · rimraf · superstatic · uuid | no | firebase-tools chain | `firebase-tools@13.11.2` (major) | **accepted** (1) |
| moderate | eslint · eslint-config-next · @eslint-community/eslint-utils · @eslint/config-array · @eslint/eslintrc · @typescript-eslint/{eslint-plugin,parser,type-utils,typescript-estree,utils} · typescript-eslint · eslint-plugin-jsx-a11y | eslint, eslint-config-next yes (dev) | minimatch | `eslint@4` / `eslint-config-next@0.2.4` (major) | **accepted** (1) |
| moderate | @storybook/react-vite · @joshwooding/vite-plugin-react-docgen-typescript · eslint-plugin-storybook | yes (dev) | glob | major downgrade | **accepted** (1) |
| low | esbuild 0.27.3–0.28.0 | no | file read from the dev server on Windows | fix | AI-00 |

## How an upgrade is done (the contract of AI-00)

- One package at a time, by hand: `package.json` + the root line of the lock, then `npm install` and `git diff --stat`
  (AGENTS.md § Commands: `npm install --package-lock-only` rewrites dozens of unrelated lines). A version released at
  least a few days earlier.
- After each group: `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `npm run build`; at the end
  `npm run perf:budget` (zod sits in every route: a bump that grows the bundle raises a ceiling with `raisedBy`).
- Never move `firebase`, `firebase-admin`, `firebase-tools`, `eslint`, `eslint-config-next`, `storybook` past their
  major: the reasons in CLAUDE.md § Known Issues and above.
- At the end the table is rewritten from the new `npm audit` with its date; the «Last audit» line changes.

## Per-page blind spots

- **The count rises while the lock does not change**: `npm audit` asks the registry, not the lock. An audit higher than
  the recorded one does not mean an undocumented `npm update` — it means advisories published in the meantime.
- **`fixAvailable: true` does not say the bump's range**: npm promises a fix «without a major» of the DIRECT packages,
  but may carry a transitive across a major (vitest 4 → vite 8 in 2026-10). Read `npm audit fix --dry-run` first, and
  install by hand anyway.
