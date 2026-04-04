# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Net Worth Tracker is a Next.js app for Italian investors to track net worth, assets, cashflow, dividends, performance metrics, and long-term planning with Firebase.

## Current Status
- Stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, Vitest, Framer Motion, Recharts, Yahoo Finance, Borsa Italiana scraping, Anthropic
- Latest implementation (2026-04-04, session 52): **Hall of Fame overdrive pass**. Hall of Fame now presents monthly and yearly rankings with a more editorial hierarchy, adds current-period spotlight cards with live ranking values, and opens note dialogs with clearer trigger continuity from the selected record.
- Previous implementation (2026-04-04, session 51): **FIRE & Simulations overdrive pass**. Monte Carlo now preserves previous results during reruns and reveals distributions more progressively, Goal-Based Investing links summary focus to allocation and detail views more clearly, and the FIRE calculator/projection surfaces react with a steadier local preview instead of abrupt redraws.
- Previous implementation (2026-04-04, session 50): **Dividends & Coupons overdrive pass**. `Dividendi & Cedole` now keeps calendar focus, table filters, and summary context more tightly aligned, opens dividend details from rows/cards with contextual continuity, and presents growth / YOC summary cards with clearer in-place explanations.

## Architecture Snapshot
- App Router with protected pages under `app/dashboard/*`
- Service layer in `lib/services/*`
- Shared utilities in `lib/utils/*`
- React Query for caching and invalidation
- Italy timezone helpers in `lib/utils/dateHelpers.ts`

## Key Features (Active)
- Portfolio tracking across equities, bonds, crypto, real estate, commodities, and cash
- Automatic price updates via Yahoo Finance and Borsa Italiana bond support
- Hall of Fame now reads as an editorial ranking surface with clearer monthly/yearly hierarchy, spotlight cards for the current month/year, and contextual note dialogs tied to the selected record
- Cashflow now preserves context better across `Tracciamento`, `Dividendi & Cedole`, `Anno Corrente`, `Storico Totale`, and `Budget`, with calmer filter feedback and a steadier Budget deep-dive flow
- Dividendi & Cedole now keeps calendar day focus, active date filtering, table/detail context, and summary cards more tightly in sync, with a read-only contextual detail step before edit mode
- Storico now reads more like a guided analysis surface: main sections enter as chapters, dense blocks are separated more clearly, chart mode switches feel local instead of page-wide, and doubling milestones build progressively
- Rendimenti now presents smoother period switching, KPI settling from prior values, staged monthly heatmap reveal, a more legible underwater drawdown surface, and contextual custom-range / AI dialogs
- Allocazione now presents a more readable drill-down path on desktop and a steadier mobile sheet experience, with each drill-down level reopening from the top and progress bars using centered target markers
- Patrimonio now preserves visited macro-tab and sub-tab state across `Gestione Asset`, `Anno Corrente`, and `Storico`, with calmer transitions for dense historical tables and scoped refresh feedback on the active view
- Overview/Dashboard now emphasizes the primary net-worth KPI with a more precise count-up/settle pattern, softer conditional-card reflow, and chart reveals that avoid noisy replay on secondary updates
- Private API actions now require verified Firebase auth server-side, while scheduled maintenance flows continue to authenticate with `CRON_SECRET`
- Cashflow tracking with categories, filters, Sankey drill-down, budget management, and linked cash-account updates
- History page with net worth evolution, asset class breakdown, liquidity, YoY variation, savings vs investment growth, `Lavoro & Investimenti`, doubling analysis, and allocation comparison
- `Lavoro & Investimenti` in History now includes:
  - lifetime KPI cards for labor income, saved from work (with total expenses sub-line), gross investment growth, and net investment growth
  - positive-month and negative-month counters based on monthly `netWorthGrowth`
  - monthly chart from `prepareMonthlyLaborMetricsData()`
- Settings page now offers visible unsaved-state preview and clearer in-context feedback for sensitive configuration changes (without autosave behavior changes)
- Dividends and coupons tracking with EUR conversion, focused monthly calendar, contextual per-payment detail view, total return per asset, and DPS growth summaries
- FIRE planning now includes local preview feedback in the calculator, steadier scenario projections, and clearer liquid vs illiquid readouts
- Monte Carlo simulations now preserve result continuity across reruns, with progressive percentile/distribution reveal and more explicit Bear/Base/Bull comparison focus
- Goal-based investing now links summary cards, allocation chart, and detail cards through a shared focus model for faster visual comprehension
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
- Allocation: `app/dashboard/allocation/page.tsx`, `components/allocation/*`
- Assets: `app/dashboard/assets/page.tsx`, `components/assets/AssetPriceHistoryTable.tsx`, `components/assets/AssetClassHistoryTable.tsx`
- Mobile navigation: `components/layout/BottomNavigation.tsx`, `components/layout/SecondaryMenuDrawer.tsx`
- Mobile perf: `lib/hooks/useMediaQuery.ts`

**Last updated**: 2026-04-04 (session 52)

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
