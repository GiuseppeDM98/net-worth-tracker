# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Net Worth Tracker is a Next.js app for Italian investors to track net worth, assets, cashflow, dividends, performance metrics, and long-term planning with Firebase.

## Current Status
- Stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, Vitest, Framer Motion, Recharts, Yahoo Finance, Borsa Italiana scraping, Anthropic
- Latest implementation (2026-04-01, session 31): **Visual hierarchy & layout orchestration**. Dashboard hero KPI card (Patrimonio Totale Lordo) is now full-width with `border-l-primary` accent and larger typography (`text-3xl/4xl`); secondary KPIs in 2-col below. Performance `MetricCard` with `isPrimary` renders value at `text-3xl`. `MetricSection` headers have a left-border accent; emoji prefixes removed from all section titles. All three main pages (Dashboard, Rendimenti, Storico) have an eyebrow breadcrumb label, `border-b` header separator, and demoted utility actions. `Geist_Mono` font set to `preload: false` to suppress browser preload warning on pages that don't use `font-mono`.
- Previous implementation (2026-04-01, session 30): **UI language & taxonomy consistency**. Aligned the full interface to Italian. Navigation: Overview→Panoramica, Assets→Patrimonio, Allocation→Allocazione, Performance→Rendimenti, History→Storico, Settings→Impostazioni. Performance page retitled "Rendimenti del Portafoglio"; Recovery Time→Tempo di Recupero, Current Yield→Rendimento Corrente. FIRE Calculator→Calcolatore FIRE. Intentional English kept: Hall of Fame, FIRE e Simulazioni, Cashflow, TWR, IRR, Sharpe Ratio, YOC, Max Drawdown.
- Previous implementation (2026-04-01, session 29): **History Labor & Investments month counters**. Two new cards count positive and negative months in `Lavoro & Investimenti` based on `netWorthGrowth`. Budget test fixtures aligned to current `BudgetItem` type.

## Architecture Snapshot
- App Router with protected pages under `app/dashboard/*`
- Service layer in `lib/services/*`
- Shared utilities in `lib/utils/*`
- React Query for caching and invalidation
- Italy timezone helpers in `lib/utils/dateHelpers.ts`

## Key Features (Active)
- Portfolio tracking across equities, bonds, crypto, real estate, commodities, and cash
- Automatic price updates via Yahoo Finance and Borsa Italiana bond support
- Cashflow tracking with categories, filters, Sankey drill-down, budget management, and linked cash-account updates
- History page with net worth evolution, asset class breakdown, liquidity, YoY variation, savings vs investment growth, `Lavoro & Investimenti`, doubling analysis, and allocation comparison
- `Lavoro & Investimenti` in History now includes:
  - lifetime KPI cards for labor income, saved from work, gross investment growth, and net investment growth
  - positive-month and negative-month counters based on monthly `netWorthGrowth`
  - monthly chart from `prepareMonthlyLaborMetricsData()`
- Performance page with ROI, CAGR, TWR, IRR, Sharpe, drawdown metrics, YOC, current yield, rolling charts, and monthly returns heatmap
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
- Current repo includes targeted tests for pure utilities and services, including `__tests__/chartService.test.ts`

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

**Last updated**: 2026-04-01 (session 31)

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
