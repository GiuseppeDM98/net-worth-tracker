# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Net Worth Tracker is a Next.js app for Italian investors to track net worth, assets, cashflow, dividends, performance metrics, and long-term planning with Firebase.

## Current Status
- Stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, Vitest, Framer Motion, Recharts, Yahoo Finance, Borsa Italiana scraping, Anthropic
- Latest implementation (2026-04-09, session a11y-perf): **Accessibility & performance audit, Assistente AI**. `aria-live="polite" aria-atomic="false"` on streaming response container. `MARKDOWN_COMPONENTS` extracted to module level (was inline — caused ReactMarkdown to re-mount on every render). `scrollIntoView({ behavior: 'instant' })` during streaming, `smooth` only on thread load. Sheet mobile thread auto-closes after selection (controlled `isThreadSheetOpen` state). Action buttons in memory rows visible on touch via `@media(pointer:fine)` instead of always-hidden `opacity-0`. Touch targets bumped from `h-6 w-6` to `h-8 w-8`. Memory filter tabs: `role="tablist"/"tab"` + `aria-selected`. `aria-label` on all `SelectTrigger`, textarea, `AssistantMonthPicker`. `type="button"` on prompt chips. Save-button color: `text-green-600 dark:text-green-400`. Spec: `docs/spec-audit-assistant.md`. Previous session (internal-cleanup): `MONTH_NAMES` constant, `cachedFormatCurrencyEUR` in ContextCard.

## Architecture Snapshot
- App Router with protected pages under `app/dashboard/*`
- Service layer in `lib/services/*`
- Shared utilities in `lib/utils/*`
- React Query for caching and invalidation
- Italy timezone helpers in `lib/utils/dateHelpers.ts`

## Key Features (Active)
- Portfolio tracking across equities, bonds, crypto, real estate, commodities, and cash
- Automatic price updates via Yahoo Finance and Borsa Italiana bond support
- Assistente AI (2026-04-09): 5 modes — `month_analysis`, `year_analysis`, `ytd_analysis`, `history_analysis`, `chat`. Chat mode has `chatContextType` selector (`none | month | year | ytd | history`), default `'none'`. `chatContextType` rendered as secondary compact row below the textarea. `bySubCategoryAllocation` in context bundle. `selector.month` encoding: `>0`=monthly, `0`=year, `-1`=YTD, `-2`=history. `useAssistantPeriodContext` unifies all 4 context hooks. `includeMacroContext` gates web search. Extended thinking (budget 2000) + 3500 max_tokens. `resolvedThreadId` pattern avoids stale RQ cache. Feature flag `NEXT_PUBLIC_ASSISTANT_AI_ENABLED`. Persistent conversations, auto-memory, markdown with tables. Memory extraction runs in all modes, gated by `memoryEnabled` only. `includeDummySnapshots` preference: toggle visible only when `hasDummySnapshots` (computed fresh at memory GET, never persisted). **Stop**: `AbortController` in `abortControllerRef`; `handleStop()` aborts SSE mid-stream; `AssistantComposer` shows Square stop button (destructive, always enabled) during streaming. **Delete confirmations**: memory items and thread list both use 2-click inline confirmation with 3s auto-disarm. **Layout**: Preferences in header popover (Settings2). Memory collapsible in sidebar. Thread card delete button in flex flow (not absolute) to avoid Badge overlap. Mobile hero chips-first. **Conversation history**: `streamAssistantResponse` receives `conversationHistory: AssistantMessage[]`; builds multi-turn Anthropic messages array. Loaded before `appendAssistantMessage` so new user msg is excluded. Cap: chat 10 pairs, structured 3 pairs. **A11y (2026-04-09)**: `aria-live` on stream container; `aria-label` on all selects + textarea; `role="tablist/tab"` on memory filters; action buttons always visible on touch (`@media(pointer:fine)`); `h-8 w-8` touch targets; Sheet mobile auto-closes after thread selection; `MARKDOWN_COMPONENTS` at module level; `scrollIntoView instant` during streaming.
- Login and Register now feel more native to the product, with calmer entry motion, cleaner field focus choreography, keyboard-reachable password toggles, and inline submit status feedback
- Hall of Fame now reads as an editorial ranking surface with clearer monthly/yearly hierarchy, spotlight cards for the current month/year, and contextual note dialogs tied to the selected record
- Cashflow "Entrate per categoria" pie chart on mobile now caps legend items at 3 (same as expense chart), preventing overflow when 4+ categories exceed the 5% threshold
- Cashflow now preserves context better across `Tracciamento`, `Dividendi & Cedole`, `Anno Corrente`, `Storico Totale`, and `Budget`, with calmer filter feedback and a steadier Budget deep-dive flow
- Dividendi & Cedole now keeps calendar day focus, active date filtering, table/detail context, and summary cards more tightly in sync, with a read-only contextual detail step before edit mode
- Storico now reads more like a guided analysis surface: main sections enter as chapters, dense blocks are separated more clearly, chart mode switches feel local instead of page-wide, and doubling milestones build progressively
- Rendimenti now presents smoother period switching, KPI settling from prior values, staged monthly heatmap reveal, a more legible underwater drawdown surface, and contextual custom-range / AI dialogs
- Allocazione now presents a more readable drill-down path on desktop and a steadier mobile sheet experience, with each drill-down level reopening from the top and progress bars using centered target markers
- Patrimonio now preserves visited macro-tab and sub-tab state across `Gestione Asset`, `Anno Corrente`, and `Storico`, with calmer transitions for dense historical tables, scoped refresh feedback on the active view, and a hidden previous-month baseline for `Anno Corrente` so first-month comparisons and summary percentages remain accurate without adding an extra visible column
- Patrimonio Anno Corrente and Storico tables show only assets with `includeInHistoryTables: true` (toggle in AssetDialog). Anno Corrente: `quantity > 0` only. Storico: includes `quantity === 0` for sold-asset history with "Venduto" badge. `restrictToPassedAssets={true}` on both tables. Disabling cost basis in AssetDialog correctly deletes `averageCost`/`taxRate` from Firestore via `deleteField()`
- Overview/Panoramica now loads KPI, variations, expense summary, charts, and rendering flags from one authenticated overview query, improving warm loads and keeping related data in sync after asset, cashflow, snapshot, and stamp-duty-setting changes
- Overview/Dashboard KPI cards all animate on mount via `OverviewAnimatedCurrency` leaf nodes (count-up isolated per card, not page-level). Charts mount after hero settles via `requestIdleCallback`. Formatter cache in `lib/utils/formatters.ts` avoids `Intl.NumberFormat` allocation on every render.
- Private API actions now require verified Firebase auth server-side, while scheduled maintenance flows continue to authenticate with `CRON_SECRET`
- Cashflow tracking with categories, filters, Sankey drill-down, budget management, and linked cash-account updates
- History page with net worth evolution, asset class breakdown, liquidity, YoY variation, savings vs investment growth, `Lavoro & Investimenti`, doubling analysis, and allocation comparison
- `Lavoro & Investimenti` in History now includes:
  - lifetime KPI cards for labor income, saved from work (with total expenses sub-line), gross investment growth, and net investment growth
  - positive-month and negative-month counters based on monthly `netWorthGrowth`
  - monthly chart from `prepareMonthlyLaborMetricsData()`
- Settings page now offers visible unsaved-state preview and clearer in-context feedback for sensitive configuration changes (without autosave behavior changes)
- Dividends and coupons tracking with EUR conversion, focused monthly calendar, contextual per-payment detail view, total return per asset, and DPS growth summaries
- FIRE planning now includes local preview feedback in the calculator, steadier scenario projections, clearer liquid vs illiquid readouts, and the Indennità Annuale card now shows the Patrimonio FIRE base value directly
- Monte Carlo simulations now preserve result continuity across reruns, with progressive percentile/distribution reveal and more explicit Bear/Base/Bull comparison focus
- Goal-based investing now links summary cards, allocation chart, and detail cards through a shared focus model for faster visual comprehension
- PDF export and AI-powered performance analysis

## Testing
- Framework: Vitest
- Useful commands:
  - `npm test -- <file>`
  - `npx vitest run <file>`
  - `npx tsc --noEmit`
- Current repo includes targeted tests for pure utilities/services plus private API auth regression coverage in `__tests__/apiAuthRoutes.test.ts` and assistant auth / policy coverage in `__tests__/assistantRoutes.test.ts`, `__tests__/assistantWebSearchPolicy.test.ts`, `__tests__/assistantPromptRouting.test.ts`, month context bundle coverage in `__tests__/assistantMonthContextService.test.ts`, thread auth + DELETE coverage in `__tests__/assistantThreadRoutes.test.ts`, and memory extraction unit tests in `__tests__/assistantMemoryExtraction.test.ts`

## Data & Integrations
- Firestore client + admin
- Yahoo Finance for prices
- Borsa Italiana scraping for Italian bonds and dividend data
- Frankfurter API for FX conversion
- Anthropic for AI analysis

## Known Issues (Active)
- FX conversion depends on Frankfurter API availability, with cache fallback

## Key Files
- Overview data pipeline: `app/api/dashboard/overview/route.ts`, `lib/services/dashboardOverviewService.ts`, `lib/hooks/useDashboardOverview.ts`, `types/dashboardOverview.ts`
- Overview KPI animation: `components/dashboard/OverviewAnimatedCurrency.tsx`, `components/dashboard/OverviewChartsSection.tsx`
- Formatter cache: `lib/utils/formatters.ts` (`cachedFormatCurrencyEUR`)
- Assistant: `app/dashboard/assistant/page.tsx`, `components/assistant/AssistantPageClient.tsx`, `components/assistant/AssistantPageSkeleton.tsx`, `components/assistant/AssistantComposer.tsx`, `components/assistant/AssistantPromptChips.tsx`, `components/assistant/AssistantContextCard.tsx`, `components/assistant/AssistantMonthPicker.tsx`, `components/assistant/AssistantStreamingResponse.tsx`, `components/assistant/AssistantMemoryPanel.tsx`, `components/assistant/AssistantMemoryItemRow.tsx`, `lib/constants/assistantPrompts.ts`, `app/api/ai/assistant/*` (incl. `context/route.ts`, `stream/route.ts`), `lib/server/assistant/*` (incl. `memoryExtraction.ts`, `webSearchPolicy.ts`), `lib/services/assistantMonthContextService.ts`, `lib/hooks/useAssistantMonthContext.ts` (exports `useAssistantPeriodContext`), `types/assistant.ts`
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

**Last updated**: 2026-04-09 (session harden — stop button, delete confirmations, thread item layout fix)

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
