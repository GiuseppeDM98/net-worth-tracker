# Server layer — API routes, Admin SDK and Vercel functions

> **When to open this guide** — anyone touching an `app/api/**/route.ts`, `lib/server/*` (the `server-only` modules, `lib/server/validation.ts`, `lib/server/serverTiming.ts`), `lib/firebase/admin.ts`, the cron routes (`app/api/cron/*/route.ts`, `CRON_SECRET`) or `vercel.json` — or anyone taking a server dependency. `AGENTS.md` keeps the stub in § Server Layer and API Authorization; here is the full rule. The environment and the deploy are `SETUP.md`'s.

## Files

- **Server layer**: `app/api/**/route.ts` (the cron routes `app/api/cron/monthly-snapshot/route.ts` and `app/api/cron/daily-dividend-processing/route.ts`, `/api/portfolio/snapshot`), `lib/server/*` (server-only: `apiAuth.ts` with `assertCanAccessAccount`, `validation.ts` with the reusable schemas, `isoDateSchema` and `parseOr400`, `serverTiming.ts` with `startTiming()` and `ServerTimingRecorder`), `lib/firebase/admin.ts` (the Admin SDK), `vercel.json`, `package.json` (`overrides`, `engines.node`); tests `__tests__/vercelConfig.test.ts`, `__tests__/serverCashSettlement.test.ts`, `__tests__/serverValidation.test.ts`, `__tests__/serverTiming.test.ts`, `__tests__/apiAuthRoutes.test.ts` and the route tests (`__tests__/{performanceYieldsRoute,dividendStatsRoute,instrumentProfilesRoute}.test.ts`), plus the throwaway emulator exercises `scripts/*.tmp.mts` of doc/guide/e2e-emulatori.md

## Server Layer and API Authorization
- Route = auth → validate → fetch → ownership check → delegate → return; no Firestore queries or business logic in the
  handler body. Firestore rules do not protect Admin SDK calls, so enforce record-level ownership after loading the doc.
- **Owner-scoped routes authorize with `assertCanAccessAccount(decodedToken, ownerUserId)`**, never a fallback to
  `decodedToken.uid`; viewer-scoped routes (sharing management) just read the token uid.
- Server-owned materialized docs are mutated only via a private authenticated route; cron routes use `CRON_SECRET`, and
  `/api/portfolio/snapshot` must keep accepting `cronSecret`.
- **Validation**: `lib/server/validation.ts` owns the reusable schemas and `parseOr400` — never cast with `as { … }`
  first, coerce dates with `z.coerce.date()` (behind a string when they come from a request, below), and validate
  **Firestore-originated** inputs at the service entry point too.
  **A date in a request is a STRING first** (2026-10-04, `isoDateSchema` = `z.string().min(1).pipe(z.coerce.date())`):
  alone, `z.coerce.date()` turns `null` into 1970-01-01 and a number into a timestamp, so a missing date answers 200 on
  an epoch instead of 400 — every request date in the file goes through it (yields, dividends, transactions), pinned by
  the «a null date» case of `__tests__/performanceYieldsRoute.test.ts` and the date cases of `serverValidation.test.ts`.
  Tests that touch a `server-only` module need `vi.mock('server-only', () => ({}))`.
- **A route's latency is a `Server-Timing` header** (`lib/server/serverTiming.ts`; five routes since 2026-10-05: overview,
  yields, dividend stats, instrument profiles, assistant threads): `startTiming()` at the handler's top, `mark('auth')`
  after `assertCanAccessAccount`, `mark('db')` after ONE round of reads, `mark('compute')` before the response; a service
  with stages of its own takes the recorder (`timing?: ServerTimingRecorder`) instead of returning times, and a count
  the header carries travels BESIDE the body, never inside it (`resolveInstrumentProfiles` → `{ response, counts }`).
  The route tests read the header's stage names (`__tests__/{dividendStatsRoute,instrumentProfilesRoute}.test.ts`).
- **`REGISTRATION_WHITELIST` has no `NEXT_PUBLIC_` prefix**, and `lib/constants/appConfig.ts` must stay client-safe.
- **A Vercel Function never `require()`s an ESM-only package — whatever the Node version** (2026-10-08): Vercel starts
  Node with `--no-experimental-require-module`, so `firebase-admin@14 → jwks-rsa@4 → jose@6` (pure ESM, loaded by
  `require` in `jwks-rsa/src/utils.js`) answered 500 on every Admin route — `ERR_REQUIRE_ESM` in the runtime log of the
  develop deploy of PR #436, on 22.x AND on 24.x — while the same production build on the laptop (Node 24, standalone,
  real credentials) answers 401 to a forged token. The cure is `package.json` `overrides` → `jwks-rsa ^3.2.2` (jose 4,
  CommonJS; firebase-admin calls only `jwks({ jwksUri, cache })` and `getSigningKeys()`, identical in 3.x), held by
  `__tests__/vercelConfig.test.ts` with `engines.node` `"24.x"` (local and Lambda on the same major). Before taking
  any server dependency whose chain reaches an ESM-only package, grep its `require(` calls; the emulators cannot see
  this (`verifyIdToken` skips the signature there) and only a real token on a deploy proves it. The same bump pins
  the CLIENT `firebase` to ≥ 12.19 (one `@firebase/app`, CLAUDE.md § Known Issues).
- **A `server-only` module is not protected by `tsc`**: importing `lib/services/dividendService.ts` (Admin SDK) from a
  client page type-checks and dies in the browser as a Next build error («You're importing a module that depends on
  "server-only"») — the browser is the check (2026-09-06). A client page reads such a registry through a client
  reader: `lib/services/dividendReceiptsService.ts` is the worked example.

## Per-page blind spots

- **The Vercel region, the ESM-only trap and the audit advisories are in `CLAUDE.md` § Known Issues**: the functions
  in `fra1` beside Firestore in `eur3` (held by `__tests__/vercelConfig.test.ts`), the `ERR_REQUIRE_ESM` of PR #436
  and its `overrides`, and the 20 `npm audit` advisories inside `firebase-tools` and `@grpc/grpc-js`.
