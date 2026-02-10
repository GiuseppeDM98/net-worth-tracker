# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Net Worth Tracker is a Next.js app for Italian investors to track net worth, assets, cashflow, dividends, performance metrics, and historical snapshots with Firebase.

## Current Status
- Versione stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, date-fns-tz, @nivo/sankey, @anthropic-ai/sdk
- Ultima implementazione: Monte Carlo auto-fill allocazione da portafoglio reale (2026-02-10)
- In corso ora: nessuna attivita attiva

## Architecture Snapshot
- App Router con pagine protette sotto `app/dashboard/*`.
- Service layer in `lib/services/*` (Firestore client/admin, scraping, metriche).
- Utility in `lib/utils/*` (formatters, date helpers, asset history).
- React Query per caching e invalidazioni post-mutation.
- Timezone: Europe/Rome via `lib/utils/dateHelpers.ts` helpers (`getItalyDate`, `getItalyMonth`, `getItalyYear`, `getItalyMonthYear`)

## Key Features (Active)
- Portfolio multi-asset con aggiornamento prezzi Yahoo Finance (average cost 4 decimali).
- Cashflow con categorie, filtri, Sankey 5-layer, drill-down 4 livelli, Analisi Periodo con filtri anno+mese.
- Snapshot mensili automatici + storico e CSV export.
- Asset price/value history tables con aggregazione per nome e badge "Venduto".
- History page: Net Worth evolution, Asset Class breakdown, Liquidity, YoY variation, Savings vs Investment Growth, Doubling Time Analysis (geometrico + soglie fisse), Current vs Target allocation.
- Performance metrics (ROI, CAGR, TWR, IRR, Sharpe, drawdown suite, YOC, Current Yield) con heatmap, underwater chart, rolling charts. Organizzate in 4 categorie (Rendimento, Rischio, Contesto, Dividendi).
- Dividendi multi-currency con conversione EUR, scraping Borsa Italiana, calendario mensile con drill-down.
- Hall of Fame con ranking mensili/annuali e sistema note dedicato multi-sezione.
- FIRE calculator con esclusione casa abitazione, Proiezione Scenari Bear/Base/Bull con inflazione, FIRE Number per-scenario, stop risparmi al raggiungimento FIRE.
- Monte Carlo simulations con 4 asset class (Equity, Bonds, Immobili, Materie Prime) e parametri editabili.
  - **Confronto Scenari**: modalità Bear/Base/Bull con parametri per-scenario (rendimenti, volatilità, inflazione)
  - Toggle "Simulazione Singola" / "Confronto Scenari", overlay chart, 3 distribution charts, tabella comparativa
  - **Auto-fill allocazione** da portafoglio reale: le 4 classi MC vengono estratte dall'allocazione corrente e normalizzate a 100% (crypto e cash escluse). Fallback 60/40/0/0 se nessuna delle 4 classi presente.
- PDF Export con 8 sezioni configurabili (Performance solo in export annuali/totali).
- **AI Performance Analysis**: Claude Sonnet 4.5 con SSE streaming, Extended Thinking, Web Search (Tavily).

## Data & Integrations
- Firestore (client + admin) con merge updates.
- Yahoo Finance per prezzi. Frankfurter API per valute (cache 24h). Borsa Italiana scraping.
- Tavily API per web search (AI analysis context).

## Known Issues (Active)
- Etichette legenda su mobile troncate (top 3 elementi).
- Conversione valuta dipende da Frankfurter API (fallback su cache).
- Subcategory rename not fully implemented (old keys not deleted in Firestore).

## Key Files
- History: `app/dashboard/history/page.tsx`, `components/history/DoublingTimeSummaryCards.tsx`, `DoublingMilestoneTimeline.tsx`
- Chart service: `lib/services/chartService.ts`
- Performance: `app/dashboard/performance/page.tsx`, `lib/services/performanceService.ts`, `types/performance.ts`
- Performance API: `app/api/performance/yoc/route.ts`, `app/api/performance/current-yield/route.ts`
- Performance UI: `components/performance/MonthlyReturnsHeatmap.tsx`, `UnderwaterDrawdownChart.tsx`, `MetricSection.tsx`
- Cashflow: `components/cashflow/TotalHistoryTab.tsx`, `CurrentYearTab.tsx`, `CashflowSankeyChart.tsx`
- Dividends: `components/dividends/DividendTrackingTab.tsx`, `DividendTable.tsx`, `DividendCalendar.tsx`
- Hall of Fame: `app/dashboard/hall-of-fame/page.tsx`, `lib/services/hallOfFameService.ts`
- FIRE: `components/fire-simulations/FireCalculatorTab.tsx`, `FIREProjectionSection.tsx`, `FIREProjectionChart.tsx`, `FIREProjectionTable.tsx`, `lib/services/fireService.ts`
- Monte Carlo: `components/fire-simulations/MonteCarloTab.tsx`, `lib/services/monteCarloService.ts`
- Monte Carlo UI: `components/monte-carlo/ParametersForm.tsx`, `SimulationChart.tsx`, `DistributionChart.tsx`, `SuccessRateCard.tsx`
- Monte Carlo scenarios: `components/monte-carlo/ScenarioParameterCards.tsx`, `ScenarioComparisonResults.tsx`
- Asset types: `types/assets.ts` (MonteCarloParams, MonteCarloScenarios, DoublingMilestone, etc.)
- Settings: `lib/services/assetAllocationService.ts`, `app/dashboard/settings/page.tsx`
- AI Analysis: `app/api/ai/analyze-performance/route.ts`, `components/performance/AIAnalysisDialog.tsx`
- Web Search: `lib/services/tavilySearchService.ts`, `types/tavily.ts`
- Utils: `lib/utils/dateHelpers.ts`, `formatters.ts`, `assetPriceHistoryUtils.ts`
- Auth: `lib/utils/authHelpers.ts`, `contexts/AuthContext.tsx`
- PDF: `types/pdf.ts`, `lib/services/pdfDataService.ts`, `components/pdf/PDFDocument.tsx`

**Last updated**: 2026-02-10
