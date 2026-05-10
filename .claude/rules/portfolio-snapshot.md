---
paths:
  - app/api/portfolio/snapshot/**
  - app/api/prices/**
  - app/api/benchmarks/**
  - app/api/cron/**
  - lib/services/**
  - lib/helpers/priceUpdater.ts
---

# Portfolio Snapshot Rules

- Keep snapshot writes in `app/api/portfolio/snapshot/route.ts` and `manual/route.ts` consistent.
- Preserve household split metadata from `types/household.ts` when building snapshots.
- Refresh prices through `lib/helpers/priceUpdater.ts` before snapshot calculations.
- Keep FX and benchmark cache routes aligned with `lib/constants/benchmarks.ts` and `types/benchmarks.ts`.
- Cron routes must remain idempotent and user-scoped through `adminDb` queries.