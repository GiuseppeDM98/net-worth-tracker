---
name: vitest-route-testing
description: Adds or updates Vitest tests for `app/api/*`, `lib/services/*`, and `lib/server/*` using `vi.mock()` and `NextRequest`. Use when user says 'add route test', 'mock firebase', 'test API auth', or 'write service tests'. Do NOT use for visual component snapshots or e2e tooling.
paths:
  - app/api/**/*.ts
  - lib/services/**/*.ts
  - lib/server/**/*.ts
  - __tests__/**/*.test.ts
---
# Vitest Route Testing

## Critical
- Test API and server code with the same patterns already used in `__tests__/assistantRoutes.test.ts` and `__tests__/householdUtils.test.ts`.
- For any `app/api/*` test, create a real `NextRequest` and call the exported route handler directly.
- Private `app/api/*` routes must be tested with Firebase auth mocked at the server boundary; do not hit Firebase or external APIs.
- Mock all module boundaries with `vi.mock()` before importing the module under test.
- Verify the test file passes `npx tsc --noEmit` and `npm.cmd test -- --run <test-file>` before moving on.

## Instructions
1. **Find the matching test location and naming pattern**
   - Put route and server tests under `__tests__/` using the existing `*.test.ts` naming convention, for example `__tests__/assistantRoutes.test.ts`.
   - Match the module under test by file name or feature name, not by UI component structure.
   - If you are testing `app/api/...`, import the specific handler file from that route.
   - **Verify the target file path and test file name before proceeding to the next step.** This step uses the output from the user request and the existing test naming pattern.

2. **Mirror the existing Vitest setup from project tests**
   - Use `import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'` when you need lifecycle hooks.
   - Use `vi.restoreAllMocks()` or `vi.clearAllMocks()` in `afterEach` when the test file mutates mocks.
   - Keep test data inline and minimal, as done in existing `__tests__/*.test.ts` files.
   - **Verify the test file imports only Vitest APIs and the module under test before proceeding to the next step.** This step uses the output from Step 1.

3. **Mock dependencies at the module boundary with `vi.mock()`**
   - Mock Firebase client/admin modules from `lib/firebase/*` and server auth helpers from `lib/server/apiAuth.ts` when the route or server code depends on them.
   - Mock service dependencies in `lib/services/*` or other helpers used by the unit under test.
   - Keep mocks at the top of the file, before importing the handler or service being tested.
   - Return explicit stub values from each mock function; do not leave implicit `undefined` behavior.
   - **Verify every external dependency is mocked before proceeding to the next step.** This step uses the output from Step 2.

4. **Build requests for route handlers using `NextRequest`**
   - For `app/api/*` tests, import `NextRequest` from `next/server` and construct requests with `new NextRequest('http://localhost/api/...', { method, headers, body })`.
   - If the route reads JSON, pass `body: JSON.stringify(payload)` and set `headers: { 'content-type': 'application/json' }`.
   - Call the handler directly, for example `await GET(request)` or `await POST(request)`.
   - **Verify the route handler receives a real `NextRequest` before proceeding to the next step.** This step uses the output from Step 3.

5. **Assert the exact status and response shape used by the route**
   - Read the response with `await response.json()` when the handler returns JSON.
   - Assert the HTTP status code, success/error shape, and any message fields exactly as returned by the route.
   - If the route uses `NextResponse.json(...)`, assert the payload structure, not just that the call succeeded.
   - **Verify the assertions match the route's real response contract before proceeding to the next step.** This step uses the output from Step 4.

6. **Cover the auth and failure branches explicitly**
   - For private routes, add one test for the authenticated path and one for the unauthenticated or rejected path.
   - Mock `lib/server/apiAuth.ts` so the route can be tested without real Firebase UID verification.
   - For service tests in `lib/services/*` and server tests in `lib/server/*`, cover both the happy path and the thrown error path.
   - **Verify both success and failure paths are covered before proceeding to the next step.** This step uses the output from Step 5.

7. **Run the project validations used for this repo**
   - Run the focused test file first: `npm.cmd test -- --run __tests__/your-file.test.ts`.
   - If the file touches types or request/response shapes, run `npx tsc --noEmit` next.
   - If the change affects shared utilities or route behavior, run `npm.cmd test` after the focused file passes.
   - **Verify all targeted tests and type checks pass before finishing.** This step uses the output from Step 6.

## Examples
- **User says:** “add route test for the assistant API”
  - **Actions taken:** Create `__tests__/assistantRoutes.test.ts`; mock `lib/server/apiAuth.ts`, `lib/server/assistant/*`, and any Firebase/service dependencies with `vi.mock()`; construct `NextRequest` instances for `GET` or `POST`; call the route handler directly; assert status codes and JSON payloads.
  - **Result:** A focused route test that exercises auth, success, and failure branches without hitting Firebase or external APIs.

- **User says:** “write service tests for household utils”
  - **Actions taken:** Add or update `__tests__/householdUtils.test.ts`; import the service or utility directly; mock only the dependencies at the module boundary; assert returned values and thrown errors with Vitest.
  - **Result:** Deterministic unit tests aligned with the repo’s existing `__tests__/*.test.ts` pattern.

## Common Issues
- **If you see `ReferenceError: fetch is not defined` in a route test:**
  1. Mock the helper that performs the fetch instead of calling the network.
  2. If the code uses `NextRequest`, instantiate it in the test and do not rely on a global request object.

- **If you see `TypeError: Cannot read properties of undefined (reading 'json')`:**
  1. Ensure the mocked dependency returns the expected object shape.
  2. Check that the handler response is being read with `await response.json()` only after calling the route.

- **If you see `FirebaseError` or auth failures during tests:**
  1. Mock `lib/server/apiAuth.ts` so the route never reaches real Firebase verification.
  2. Confirm the private route test covers both the allowed and rejected auth cases.

- **If you see `Cannot use import statement outside a module` or module resolution errors:**
  1. Keep the test file in `__tests__/` with a `.test.ts` suffix.
  2. Import from the same path style used elsewhere in the repo and avoid mixing default and named imports incorrectly.

- **If you see type errors after changing request bodies or response payloads:**
  1. Run `npx tsc --noEmit`.
  2. Update the mocked payload and the assertion to match the exact route contract.
  3. Re-run `npm.cmd test -- --run __tests__/your-file.test.ts`.