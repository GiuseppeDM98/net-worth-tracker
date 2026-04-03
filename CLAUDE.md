# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Net Worth Tracker is a Next.js app for Italian investors to track net worth, assets, cashflow, dividends, performance metrics, and long-term planning with Firebase.

## Current Status
- Stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, Vitest, Framer Motion, Recharts, Yahoo Finance, Borsa Italiana scraping, Anthropic
- Latest implementation (2026-04-03, session 39): **Secondary visual rhythm (Spec 10)**. Overview and History pages now have 3 explicit reading zones separated by `border-t border-border/40` dividers and tighter `space-y-4` grouping for secondary card clusters. Overview: secondary metrics (Variazioni, Expense Stats, Cost Cards) grouped with `space-y-4`; "Composizione" eyebrow + border-t before pie charts. History: zone dividers before "Risparmio vs Crescita" (evolution→analysis) and before "Tempo di Raddoppio" (analysis→context). Dividers added as `className` on existing `motion.div` so they animate with content. Also: "Risparmiato da Lavoro" card in History now shows total expenses for the period as a sub-line (`totalExpensesSum` exposed from `laborIncomeMetrics` useMemo return).
- Previous implementation (2026-04-03, session 38): **Brand integration + contextual help distribution**. Hall of Fame: "Ranking/Rankings" → "Record" throughout Italian copy; title and nav unchanged (intentional English brand choice). Performance methodology section compressed: YOC 68→12 lines, Current Yield 94→12 lines, 5 chart sections trimmed (removed redundant intros and "Interpretazione" paragraphs already covered by CardDescriptions). Allocation: "Specific Assets" → "Asset specifici" in h1/CardTitle/sheet mobile; callout "Nota" → "Asset specifici"; goal-derived callout shortened. Settings: labor income helper tightened.
- Previous implementation (2026-04-03, session 37): **Allocation page guidance integration**. Removed standalone blue `Legenda` box. All 3 desktop table "Azione" headers now show `±2% soglia` sub-line (`text-[10px] text-muted-foreground`). Mobile card difference banner replaced static "Differenza" label with contextual `Da acquistare` / `Da ridurre` / `Bilanciato` based on action signal.

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
  - lifetime KPI cards for labor income, saved from work (with total expenses sub-line), gross investment growth, and net investment growth
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

**Last updated**: 2026-04-03 (session 39)

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
