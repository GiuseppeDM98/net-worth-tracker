---
name: dividend-and-snapshot-workflows
description: Implements dividend, snapshot, price-update, and cron workflows in app/api/dividends/*, app/api/portfolio/snapshot/*, app/api/prices/*, and app/api/cron/*. Use when user says 'sync dividends', 'create snapshot', 'update prices', or 'cron job'. Do NOT use for unrelated analytics pages.
---
# dividend-and-snapshot-workflows

## Critical
- Keep these workflows server-side only. Any route under `app/api/dividends/*`, `app/api/portfolio/snapshot/*`, `app/api/prices/*`, or `app/api/cron/*` must not rely on client state.
- Private `app/api/*` routes must verify Firebase UID server-side via `lib/server/apiAuth.ts`.
- Cron routes must reject requests unless `Authorization: Bearer ${process.env.CRON_SECRET}` matches exactly.
- User-facing strings must stay Italian; code comments stay English.
- Do not introduce `lg:` breakpoints; use `desktop:` if UI work is added alongside these flows.

## Instructions
1. **Identify the workflow and existing route shape before writing code.**
   - Inspect the closest existing files first:
     - `app/api/dividends/*`
     - `app/api/portfolio/snapshot/*`
     - `app/api/prices/*`
     - `app/api/cron/*`
     - supporting orchestration in `lib/server/*`, `lib/services/*`, and `lib/helpers/priceUpdater.ts`
   - Match the same route method/export style used in the codebase’s App Router handlers.
   - Verify which of the four patterns you are extending before proceeding to the next step.
   - This step uses the output from the project’s existing server route patterns.

2. **Add or update the route handler in the correct `app/api/*` folder.**
   - Put the handler in the domain-specific path, for example:
     - `app/api/dividends/.../route.ts`
     - `app/api/portfolio/snapshot/.../route.ts`
     - `app/api/prices/.../route.ts`
     - `app/api/cron/.../route.ts`
   - Use server-only code in the route file and keep the route small; push business logic into `lib/server/*`, `lib/services/*`, or `lib/helpers/priceUpdater.ts`.
   - For private routes, call the Firebase auth helper from `lib/server/apiAuth.ts` before doing any work.
   - Verify the route path and access model before proceeding to the next step.
   - This step uses the output from Step 1.

3. **Delegate workflow logic to the existing server layer instead of embedding it in the route.**
   - Put dividend orchestration in `lib/server/dividendUseCase.ts` and `lib/server/dividendProcessor.ts` when the task is about dividend synchronization or processing.
   - Put performance/snapshot business logic in `lib/services/performanceService.ts` when the task is snapshot-related or needs derived portfolio calculations.
   - Put price-update orchestration in `lib/helpers/priceUpdater.ts` for price refresh flows.
   - Keep cross-cutting server logic in `lib/server/*` and reuse the current helpers rather than inventing a new service layer.
   - Verify the new logic lives in the same layer as the closest existing implementation before proceeding to the next step.
   - This step uses the output from Step 2.

4. **Use the existing domain types and keep request/response shapes consistent.**
   - Reuse types from `types/*.ts` instead of creating duplicate inline shapes.
   - Keep payload names consistent with nearby code in `app/api/dividends/*`, `app/api/portfolio/snapshot/*`, and `app/api/prices/*`.
   - If the workflow touches pricing, preserve the currency/date helpers already used elsewhere in the project, especially `formatCurrency()`, `formatDate()`, and `dateHelpers.ts`.
   - Verify the request and response objects match the surrounding types before proceeding to the next step.
   - This step uses the output from Step 3.

5. **Implement authentication and authorization gates exactly as the project expects.**
   - For private endpoints, verify the Firebase UID server-side via `lib/server/apiAuth.ts` before accessing Firestore or other protected resources.
   - For cron endpoints, read the `Authorization` header and compare it with `Bearer ${process.env.CRON_SECRET}`.
   - Return the same HTTP status and JSON error style used by nearby routes when auth fails.
   - Verify the route rejects unauthorized calls before proceeding to the next step.
   - This step uses the output from Step 2.

6. **Handle external integrations using the project’s existing libraries and boundaries.**
   - For market data and prices, use the existing integration patterns around `yahoo-finance2`, `cheerio`, and the Frankfurter FX API where applicable.
   - Keep Firebase client/admin usage consistent with `lib/firebase/config.ts` and `lib/firebase/admin.ts`.
   - If the workflow writes or reads Firestore, keep the access pattern aligned with existing server-side code and do not move admin access into client components.
   - Verify the integration is using the same library and side of the boundary as the existing implementation before proceeding to the next step.
   - This step uses the output from Step 3.

7. **Add or update tests in `__tests__/*.test.ts` for the exact route or service you changed.**
   - Follow the current Vitest structure already used in the repository.
   - Cover at least:
     - success path
     - auth failure path for private routes
     - cron secret failure path for cron routes
     - external/API failure path when the workflow depends on remote data
   - Verify the tests fail before the fix and pass after the fix before proceeding to the next step.
   - This step uses the output from Steps 2–6.

8. **Run the project validations that match this workflow.**
   - Run the relevant targeted test file first, for example:
     - `npm.cmd test -- --run __tests__/assistantRoutes.test.ts`
     - `npm.cmd test -- --run __tests__/householdUtils.test.ts`
   - Then run the full suite if the workflow touches shared server code:
     - `npm.cmd test`
   - Finish with type and lint checks when route logic or shared types changed:
     - `npx tsc --noEmit`
     - `npm.cmd run lint`
   - Verify all targeted checks pass before considering the workflow complete.
   - This step uses the output from Step 7.

## Examples
- **User says:** “sync dividends for the current portfolio”
  - **Actions taken:** Inspect `app/api/dividends/*`, move processing into `lib/server/dividendUseCase.ts` or `lib/server/dividendProcessor.ts`, keep the route thin, verify Firebase auth server-side, add Vitest coverage in `__tests__/*.test.ts`.
  - **Result:** A private server route that synchronizes dividends with the same auth, orchestration, and test style as the rest of the app.

- **User says:** “create snapshot endpoint”
  - **Actions taken:** Add the route under `app/api/portfolio/snapshot/*`, reuse `lib/services/performanceService.ts` for calculations, keep request/response shapes aligned with existing types, test the success and failure paths.
  - **Result:** A snapshot workflow that matches the project’s server-first performance architecture.

- **User says:** “update prices nightly with a cron job”
  - **Actions taken:** Implement the route under `app/api/cron/*`, validate `Authorization: Bearer ${process.env.CRON_SECRET}`, reuse `lib/helpers/priceUpdater.ts`, and add cron-failure tests.
  - **Result:** A cron-safe price refresh endpoint that rejects unauthorized calls and follows project conventions.

## Common Issues
- **If you see** `Unauthorized` or `Missing Firebase UID`:
  1. Confirm the route is using `lib/server/apiAuth.ts` before any protected operation.
  2. Verify the request is coming from an authenticated session.
  3. Ensure the handler is not reading Firestore before auth succeeds.

- **If you see** `Forbidden` or `Invalid cron secret`:
  1. Check the request header is exactly `Authorization: Bearer ${process.env.CRON_SECRET}`.
  2. Confirm the environment variable is set in the running environment.
  3. Make sure the cron route is not using a different header name or prefix.

- **If you see** `Type 'X' is not assignable to type 'Y'` after changing a route:
  1. Reuse the existing type in `types/*.ts` instead of creating a new inline object.
  2. Update the service layer first, then adapt the route response to the established shape.
  3. Re-run `npx tsc --noEmit`.

- **If you see** failing price-refresh tests because of remote data or network calls:
  1. Mock the external client used by the workflow (`yahoo-finance2`, Frankfurter FX API, or fetch-based helpers).
  2. Keep the test focused on the route or service logic, not the upstream API.
  3. Re-run the targeted `npm.cmd test -- --run __tests__/...` command.

- **If you see** `Cannot find module '@/lib/server/apiAuth'` or similar import errors:
  1. Check the file is under the correct server-side directory and using the repository’s existing alias/import style.
  2. Confirm the helper exists in `lib/server/apiAuth.ts` and the path matches the project conventions.
  3. Re-run lint and typecheck after fixing the import.