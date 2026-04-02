# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Net Worth Tracker is a Next.js app for Italian investors to track net worth, assets, cashflow, dividends, performance metrics, and long-term planning with Firebase.

## Current Status
- Stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, Vitest, Framer Motion, Recharts, Yahoo Finance, Borsa Italiana scraping, Anthropic
- Latest implementation (2026-04-02, session 35): **Mobile navigation discoverability + countUp performance fix**. "Menu" → "Altro" with `MoreHorizontal` icon; active state on Altro button when on secondary routes; drawer reorganized into 3 semantic groups (Analisi, Pianificazione, Preferenze). Fixed `useMediaQuery` spurious re-render on mobile (init with real value instead of `false`). Pie charts on Panoramica now start collapsed on mobile to avoid competing with countUp rAF loops at mount.
- Previous implementation (2026-04-02, session 34): **Settings information architecture**. Header upgraded with eyebrow label and `border-b` editorial separator. Long note block in Allocazione tab wrapped in `Collapsible` (closed by default). Dev tools section moved from Dividendi tab to bottom of Preferenze tab with `border-t` + orange eyebrow label.
- Previous implementation (2026-04-01, session 33): **Private API authorization hardening**. Private App Router routes verify Firebase ID tokens server-side, enforce user/resource ownership, accept `Authorization: Bearer <idToken>` via `authenticatedFetch()`. Cron flows remain compatible through `cronSecret`.

## Architecture Snapshot
- App Router with protected pages under `app/dashboard/*`
- Service layer in `lib/services/*`
- Shared utilities in `lib/utils/*`
- React Query for caching and invalidation
- Italy timezone helpers in `lib/utils/dateHelpers.ts`

## Key Features (Active)
- Portfolio tracking across equities, bonds, crypto, real estate, commodities, and cash
- Automatic price updates via Yahoo Finance and Borsa Italiana bond support
- Private API actions now require verified Firebase auth server-side, while scheduled maintenance flows continue to authenticate with `CRON_SECRET`
- Cashflow tracking with categories, filters, Sankey drill-down, budget management, and linked cash-account updates
- History page with net worth evolution, asset class breakdown, liquidity, YoY variation, savings vs investment growth, `Lavoro & Investimenti`, doubling analysis, and allocation comparison
- `Lavoro & Investimenti` in History now includes:
  - lifetime KPI cards for labor income, saved from work, gross investment growth, and net investment growth
  - positive-month and negative-month counters based on monthly `netWorthGrowth`
  - monthly chart from `prepareMonthlyLaborMetricsData()`
- Performance page with ROI, CAGR, TWR, IRR, Sharpe, drawdown metrics, YOC, current yield, rolling charts, and monthly returns heatmap; progressive disclosure: collapsible methodology, one-time guide strip, "Avanzato" badges on technical metrics
- Dividends and coupons tracking with EUR conversion, calendar, total return per asset, and DPS growth
- FIRE planning with primary residence toggle, liquid vs illiquid split, and scenario projections
- Monte Carlo simulations and goal-based investing
- PDF export and AI-powered performance analysis

## Testing
- Framework: Vitest
- Useful commands:
  - `npm test -- <file>`
  - `npx vitest run <file>`
  - `npx tsc --noEmit`
- Current repo includes targeted tests for pure utilities/services plus private API auth regression coverage in `__tests__/apiAuthRoutes.test.ts`

## Data & Integrations
- Firestore client + admin
- Yahoo Finance for prices
- Borsa Italiana scraping for Italian bonds and dividend data
- Frankfurter API for FX conversion
- Anthropic for AI analysis

## Known Issues (Active)
- FX conversion depends on Frankfurter API availability, with cache fallback

## Key Files
- History: `app/dashboard/history/page.tsx`
- History components: `components/dashboard/LaborMetricsChart.tsx`, `components/history/*`
- Chart service: `lib/services/chartService.ts`
- Performance: `app/dashboard/performance/page.tsx`, `lib/services/performanceService.ts`
- Cashflow and budget: `components/cashflow/*`, `lib/utils/budgetUtils.ts`, `types/budget.ts`
- FIRE: `components/fire-simulations/*`, `lib/services/fireService.ts`
- Dividends: `components/dividends/*`
- Settings: `app/dashboard/settings/page.tsx`, `lib/services/assetAllocationService.ts`

- Mobile navigation: `components/layout/BottomNavigation.tsx`, `components/layout/SecondaryMenuDrawer.tsx`
- Mobile perf: `lib/hooks/useMediaQuery.ts`

**Last updated**: 2026-04-02 (session 35)

## Design Context

### Users
Italian self-directed investors who want to understand their financial position quickly and confidently.

### Brand Personality
Elegant, sophisticated, personal.

### Aesthetic Direction
Linear / Vercel inspired clarity with polished motion, dense but readable data presentation, and strong dark mode quality.

### Design Principles
1. Data first, decoration second
2. Motion with purpose
3. Density is a feature
4. Precision builds trust
5. Personality lives in the details
