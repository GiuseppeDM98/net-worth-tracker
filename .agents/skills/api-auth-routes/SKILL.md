---
name: api-auth-routes
description: Creates or edits authenticated `app/api/*` routes with Firebase UID checks, `assertSameUser()`, `assertResourceOwner()`, and `getApiAuthErrorResponse()`. Use when user says "secure this route", "add private API", or "Firebase auth for API". Do NOT use for public endpoints or UI-only work.
---
# API Auth Routes

## Critical

- Private `app/api/*` routes must verify Firebase auth server-side before any data access.
- Use `lib/server/apiAuth.ts` for request auth handling and `lib/server/getApiAuthErrorResponse.ts` for auth failures.
- When the route acts on a user-owned resource, call `assertSameUser()` and/or `assertResourceOwner()` before reading or mutating data.
- Keep response shapes consistent with existing API routes: return `NextResponse.json(...)` on success and a typed error response on failure.
- Do not add client-side-only checks as a substitute for server validation.

## Instructions

1. **Inspect the closest existing private route first**
   - Open a route in `app/api/*` that already protects access, such as files under:
     - `app/api/ai/assistant/*`
     - `app/api/dividends/*`
     - `app/api/performance/*`
     - `app/api/portfolio/snapshot/*`
   - Copy the existing route style for method handlers, imports, and JSON responses.
   - Verify the route’s auth pattern before proceeding to the next step.
   - This step establishes the baseline structure you will reuse in Step 2.

2. **Add the standard auth imports and gate the handler immediately**
   - In the route file under `app/api/*/route.ts`, import the auth helpers from the project’s server auth layer:
     - `NextRequest`, `NextResponse` from `next/server`
     - `getApiAuthErrorResponse` from `lib/server/getApiAuthErrorResponse`
     - the Firebase auth helper from `lib/server/apiAuth.ts` used by the existing route family
   - Place auth verification at the top of the handler before any DB or service calls.
   - If the helper returns an auth error response, return it immediately.
   - Verify that unauthenticated requests fail before proceeding to the next step.
   - This step uses the route pattern confirmed in Step 1.

3. **Resolve the caller UID and bind all access to it**
   - Use the authenticated Firebase UID from the API auth helper output.
   - If the route receives a target user ID, compare it with the caller UID using `assertSameUser()`.
   - If the route loads an owned record, check ownership with `assertResourceOwner()` before mutation or read access beyond metadata.
   - Keep the ownership check adjacent to the data lookup, not separated into later business logic.
   - Verify the route rejects cross-user access before proceeding to the next step.
   - This step uses the auth output from Step 2.

4. **Keep route-specific business logic after auth and ownership checks**
   - Only after the checks pass, call the route’s service layer in `lib/server/*` or `lib/services/*`.
   - Match the existing codebase pattern of keeping route files thin: validation, auth, service call, JSON response.
   - Preserve any Zod validation already used by sibling routes in `app/api/*`.
   - Verify the handler still returns the expected success payload before proceeding to the next step.
   - This step uses the authenticated identity established in Step 3.

5. **Return auth failures using the shared error response helper**
   - On auth failure, return the response created by `getApiAuthErrorResponse()` rather than inventing a new error format.
   - Keep the status code and body shape aligned with the helper and existing private routes.
   - Do not stringify custom error objects manually if the shared helper already covers the case.
   - Verify the failure response matches the sibling route pattern before proceeding to the next step.
   - This step uses the auth guard from Step 2.

6. **Validate the route with the project’s checks**
   - Run the relevant tests for the touched area, following the project’s existing command style from `CLAUDE.md`, for example:
     - `npm.cmd test -- --run __tests__/assistantRoutes.test.ts`
     - `npm.cmd test -- --run __tests__/householdUtils.test.ts`
   - Run type-checking:
     - `npx tsc --noEmit`
   - If the route changed API contracts, also run the full test suite:
     - `npm.cmd test`
   - Verify tests and type-check pass before considering the route complete.
   - This step uses the final handler from Step 4.

## Examples

- **User says:** “Secure this route so only the logged-in user can access their portfolio snapshot.”
- **Actions taken:**
  1. Inspect `app/api/portfolio/snapshot/route.ts` and a similar protected route.
  2. Add `NextRequest` / `NextResponse` imports plus the shared API auth helper and `getApiAuthErrorResponse`.
  3. Check auth at the top of the handler, then compare the caller UID with the requested user using `assertSameUser()`.
  4. Call the snapshot service only after the checks pass.
  5. Return `NextResponse.json(...)` on success and the shared auth error response on failure.
- **Result:** A private API route that rejects unauthorized access server-side and follows the repo’s existing route structure.

## Common Issues

- **If you see `Unauthorized` or a 401 from a private route:**
  1. Verify the handler calls the shared API auth helper before any service call.
  2. Confirm the route returns `getApiAuthErrorResponse()` immediately on failure.
  3. Check the client is sending Firebase auth credentials for the request.

- **If you see `Forbidden` when accessing your own resource:**
  1. Verify `assertSameUser()` is comparing the authenticated UID to the correct target user ID.
  2. Check the route is not using an email, display name, or document ID where a Firebase UID is required.
  3. If the route loads a document first, verify `assertResourceOwner()` receives the owner field from that document.

- **If you see `No overload matches this call` in a route handler:**
  1. Verify the handler signature matches `NextRequest` usage in `app/api/*/route.ts`.
  2. Check the auth helper return type is narrowed before destructuring UID.
  3. Make sure `NextResponse.json(...)` receives the same payload shape used by sibling routes.

- **If `npm.cmd test -- --run ...` passes but the route still fails in app usage:**
  1. Verify the route path under `app/api/*` matches the client fetch URL exactly.
  2. Confirm the auth check happens before any early return that could bypass ownership validation.
  3. Re-run `npx tsc --noEmit` to catch mismatched route types or imports.