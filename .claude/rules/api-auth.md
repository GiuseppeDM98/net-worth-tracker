---
paths:
  - app/api/**
---

# API Auth Rules

- Read `lib/server/apiAuth.ts` before editing `app/api/*`.
- Verify Firebase ID tokens with `requireFirebaseAuth(request)`.
- Bind data access with `assertSameUser()` or `assertResourceOwner()`.
- Use `getApiAuthErrorResponse(error)` for `ApiAuthError` responses.
- Cron routes use `Authorization: Bearer ${process.env.CRON_SECRET}`.
- Keep error payloads short and route-specific in `app/api/*`.