# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Net Worth Tracker is a Next.js app for Italian investors to track net worth, assets, cashflow, dividends, performance metrics, and long-term planning with Firebase.

## Current Status
- Stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, Vitest, Framer Motion, Recharts, Yahoo Finance, Borsa Italiana scraping, Anthropic
- Latest implementation (2026-04-03, session 45): **Assets page overdrive pass**. Patrimonio now preserves macro-tab and sub-tab state more reliably, switches historical views with shorter panel continuity, and shows refresh feedback only on the active historical block. The shared tabs primitive also explicitly hides inactive force-mounted panels, preventing layout gaps when switching views.
- Previous implementation (2026-04-03, session 44): **Settings overdrive UX layer**. Settings now provide local unsaved-change preview (header/tab feedback), coherent immediate feedback on input/select/toggle controls, smoother nested allocation editor expansion, and contextual move/delete dialogs that open from trigger-origin while remaining reduced-motion safe.
- Previous implementation (2026-04-03, session 43): **Dashboard Overview overdrive polish**. Panoramica now has a more controlled hero KPI settle, softer reflow for conditional metric blocks, one-time chart reveal behavior, and a snapshot overwrite dialog that visually opens from the CTA while remaining neutral on close. The current-month snapshot check also uses Italy timezone helpers consistently, and late-night greeting copy now stays on `Buonasera` with a softer subtitle.

## Architecture Snapshot
- App Router with protected pages under `app/dashboard/*`
- Service layer in `lib/services/*`
- Shared utilities in `lib/utils/*`
- React Query for caching and invalidation
- Italy timezone helpers in `lib/utils/dateHelpers.ts`

## Key Features (Active)
- Portfolio tracking across equities, bonds, crypto, real estate, commodities, and cash
- Automatic price updates via Yahoo Finance and Borsa Italiana bond support
- Patrimonio now preserves visited macro-tab and sub-tab state across `Gestione Asset`, `Anno Corrente`, and `Storico`, with calmer transitions for dense historical tables and scoped refresh feedback on the active view
- Overview/Dashboard now emphasizes the primary net-worth KPI with a more precise count-up/settle pattern, softer conditional-card reflow, and chart reveals that avoid noisy replay on secondary updates
- Snapshot overwrite on the Overview page now opens with visual continuity from the `Crea Snapshot` CTA and still degrades cleanly under reduced motion
- Private API actions now require verified Firebase auth server-side, while scheduled maintenance flows continue to authenticate with `CRON_SECRET`
- Cashflow tracking with categories, filters, Sankey drill-down, budget management, and linked cash-account updates
- History page with net worth evolution, asset class breakdown, liquidity, YoY variation, savings vs investment growth, `Lavoro & Investimenti`, doubling analysis, and allocation comparison
- `Lavoro & Investimenti` in History now includes:
  - lifetime KPI cards for labor income, saved from work (with total expenses sub-line), gross investment growth, and net investment growth
  - positive-month and negative-month counters based on monthly `netWorthGrowth`
  - monthly chart from `prepareMonthlyLaborMetricsData()`
- Performance page with ROI, CAGR, TWR, IRR, Sharpe, drawdown metrics, YOC, current yield, rolling charts, and monthly returns heatmap; progressive disclosure: collapsible methodology, one-time guide strip, "Avanzato" badges on technical metrics
- Settings page now offers visible unsaved-state preview and clearer in-context feedback for sensitive configuration changes (without autosave behavior changes)
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
- Assets: `app/dashboard/assets/page.tsx`, `components/assets/AssetPriceHistoryTable.tsx`, `components/assets/AssetClassHistoryTable.tsx`
- Mobile navigation: `components/layout/BottomNavigation.tsx`, `components/layout/SecondaryMenuDrawer.tsx`
- Mobile perf: `lib/hooks/useMediaQuery.ts`

**Last updated**: 2026-04-03 (session 45)

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
