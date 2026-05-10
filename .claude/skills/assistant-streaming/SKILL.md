---
name: assistant-streaming
description: Builds assistant SSE flows across app/api/ai/assistant/*, lib/server/assistant/*, and components/assistant/* when asked to update assistant stream, memory panel, thread history, or chat context. Includes route wiring, server orchestration, client streaming state, and UI updates. Do NOT use for non-assistant routes or general React refactors.
paths:
  - app/api/ai/assistant/**
  - lib/server/assistant/**
  - components/assistant/**
  - __tests__/assistantRoutes.test.ts
  - types/**/*.ts
---
# Assistant Streaming

## Critical

- Keep all assistant feature work inside the existing assistant stack:
  - API routes in `app/api/ai/assistant/*`
  - server orchestration in `lib/server/assistant/*`
  - UI in `components/assistant/*`
- Private assistant routes must verify Firebase UID server-side before any data access or stream creation.
- User-facing strings must stay Italian. Code comments stay English.
- Do not introduce non-assistant abstractions or move logic into generic React helpers unless the existing assistant files already do that.
- Validate with the project’s TypeScript and assistant-focused tests before finishing: `npx tsc --noEmit` and `npm.cmd test -- --run __tests__/assistantRoutes.test.ts`.

## Instructions

1. **Map the existing assistant entry points before changing code.**
   - Inspect the current route files under `app/api/ai/assistant/*`, the orchestration layer in `lib/server/assistant/*`, and the UI files in `components/assistant/*`.
   - Match the naming and file split already used in the repo; do not create a parallel assistant path.
   - This step uses the existing assistant route structure as the source of truth.
   - Verify the current route, server, and component boundaries before proceeding to the next step.

2. **Implement or update the API route in `app/api/ai/assistant/*` using the existing auth pattern.**
   - Keep the route in the same folder pattern already used by the assistant features.
   - Import Firebase auth checks from `lib/server/apiAuth.ts` for private access, and fail fast if the UID is missing or invalid.
   - If the route is a cron-like helper, require `Authorization: Bearer ${process.env.CRON_SECRET}` exactly as in the project rules; otherwise do not add cron auth.
   - Return SSE-compatible responses from the route when streaming is required, and preserve the existing response shape used by assistant tests.
   - This step uses the output from Step 1.
   - Verify the route compiles and the auth gate matches the existing assistant route behavior before proceeding to the next step.

3. **Put assistant business logic in `lib/server/assistant/*`, not in the route handler.**
   - Move thread loading, memory assembly, message preparation, and stream orchestration into the server layer.
   - Keep server-only dependencies in this layer; do not import client components here.
   - Reuse the project’s shared types from `types/*` if the assistant flow already has them; otherwise add the narrowest new type in the assistant domain.
   - Preserve any existing assistant-specific helpers, especially anything that builds thread history or memory context.
   - This step uses the output from Step 2.
   - Verify the server function returns the exact data needed by the route before proceeding to the next step.

4. **Implement the SSE stream contract consistently in the assistant server layer.**
   - When emitting stream events, keep event names and payload shapes aligned with the current assistant consumer behavior.
   - If the flow supports partial deltas, ensure the final event includes the completed assistant message and any thread metadata required by the UI.
   - On failure, propagate a structured error that the route can translate into an HTTP/SSE error response; do not leak raw provider errors to the client.
   - This step uses the output from Step 3.
   - Verify the streamed event sequence matches the current assistant test expectations before proceeding to the next step.

5. **Update assistant UI in `components/assistant/*` to consume the stream without switching to generic state patterns.**
   - Keep assistant-specific state, hooks, and presentation inside the assistant component tree.
   - Prefer derived values with `useMemo` for thread lists, memory summaries, and rendered context; avoid `useEffect + setState` for computed collections.
   - Keep labels, button text, empty states, and toasts in Italian.
   - Use Sonner for toast feedback if the existing assistant components already do.
   - This step uses the output from Step 4.
   - Verify the UI still renders existing thread/memory/chat states before proceeding to the next step.

6. **Keep thread history and memory panel updates synchronized across data, types, and UI.**
   - If you add, rename, or remove thread-history fields, update the corresponding type definitions in `types/*`, the server assembly in `lib/server/assistant/*`, and the UI in `components/assistant/*` together.
   - Do not leave stale getters/setters or partial shapes; this project expects settings and domain fields to stay synchronized.
   - If the assistant context includes persisted memory, make sure the server emits the same normalized structure that the memory panel expects.
   - This step uses the output from Step 5.
   - Verify TypeScript passes without new type narrowing hacks before proceeding to the next step.

7. **Validate the assistant flow with the project’s targeted checks.**
   - Run `npm.cmd test -- --run __tests__/assistantRoutes.test.ts` for route and stream coverage.
   - Run `npx tsc --noEmit` to catch route/server/UI type drift.
   - If the change touches broader integration points, run `npm.cmd test` and `npm.cmd run lint`.
   - This step uses the output from Step 6.
   - Verify all targeted tests and type checks pass before finishing.

## Examples

**User says:** “Update the assistant stream so thread history is included in chat context.”

**Actions taken:**
1. Inspect `app/api/ai/assistant/*`, `lib/server/assistant/*`, and `components/assistant/*` to find the existing stream path.
2. Add the thread-history assembly in `lib/server/assistant/*` and keep the route thin.
3. Update the SSE payload so the client receives the new history block.
4. Adjust the memory panel UI in `components/assistant/*` to render the updated thread data.
5. Run `npm.cmd test -- --run __tests__/assistantRoutes.test.ts` and `npx tsc --noEmit`.

**Result:**
- The assistant route still authenticates server-side.
- The stream now includes thread history in the existing SSE contract.
- The memory panel shows the updated context without changing unrelated app code.

## Common Issues

- **If you see `Unauthorized` or `Missing Firebase UID` from an assistant route:**
  1. Verify the route is calling the existing Firebase auth check from `lib/server/apiAuth.ts`.
  2. Confirm the request includes valid auth headers/cookies expected by the app.
  3. Ensure the route does not start any stream or DB call before the auth check completes.

- **If you see `Response body already used` or a broken SSE stream:**
  1. Confirm the route returns the stream once and does not `json()` the same response.
  2. Check that the server layer owns stream creation and the route only forwards it.
  3. Verify the client is not re-reading the same stream event source.

- **If `__tests__/assistantRoutes.test.ts` fails on event ordering or payload shape:**
  1. Compare emitted assistant events against the existing test fixture expectations.
  2. Check that delta events and final completion events are still emitted in the same order.
  3. Preserve any required metadata fields for thread ID, message ID, or memory context.

- **If `npx tsc --noEmit` reports missing or incompatible assistant types:**
  1. Update the relevant assistant domain types in `types/*` first.
  2. Then align the server assembly in `lib/server/assistant/*`.
  3. Finally update the component props and local state in `components/assistant/*`.

- **If the memory panel shows stale data after a stream update:**
  1. Verify the server emits the normalized memory payload used by the UI.
  2. Check that the UI derives the display state from the latest stream result rather than a copied local cache.
  3. Re-run the assistant route tests to confirm the final payload includes the updated memory fields.