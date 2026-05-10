---
paths:
  - __tests__/**
  - app/api/**
  - lib/services/**
  - lib/server/**
---

# Testing Patterns

- Follow the existing Vitest pattern in `__tests__/apiAuthRoutes.test.ts` and `__tests__/assistantRoutes.test.ts`.
- Mock `next/server`, `firebase-admin`, and service modules with `vi.mock()`.
- Test route auth, owner checks, and response JSON shape, not private helpers.
- Keep AAA structure and name tests by route or service behaviour.
- Start with the narrow route test, then widen to `npm.cmd test` when shared flows change.