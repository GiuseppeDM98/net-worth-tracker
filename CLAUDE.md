# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Net Worth Tracker is a Next.js app for Italian investors to track net worth, assets, cashflow, dividends, performance metrics, and historical snapshots with Firebase.

## Current Status
- Versione stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, date-fns-tz, @nivo/sankey, @anthropic-ai/sdk
- Feature ultimo mese: AI Performance Analysis with Web Search + Month filter for Sankey chart + Doubling Time Analysis
- Ultima implementazione: Web Search integration per AI Analysis (2026-01-29)
- In corso ora: nessuna attivita attiva
- Completamento: 100%

## Architecture Snapshot
- App Router con pagine protette sotto `app/dashboard/*`.
- Service layer in `lib/services/*` (Firestore client/admin, scraping, metriche).
- Utility in `lib/utils/*` (formatters, date helpers, asset history).
- React Query per caching e invalidazioni post-mutation.

### Timezone Handling
- All date operations use Europe/Rome timezone (Italian investors)
- Helper functions in `lib/utils/dateHelpers.ts`:
  - `getItalyDate()` - Convert to Italy timezone
  - `getItalyMonth()` - Extract month (1-12) in Italy timezone
  - `getItalyYear()` - Extract year in Italy timezone
  - `getItalyMonthYear()` - Extract both month and year
- Ensures consistent behavior across client (browser) and server (Vercel UTC)

## Key Features (Active)
- Portfolio multi-asset con aggiornamento prezzi Yahoo Finance.
- Cashflow con categorie, filtri, statistiche e Sankey diagram interattivo:
  - Budget flow visualization: Income Categories → Budget → Expense Types → Expense Categories + Risparmi
  - **Month filter in CurrentYearTab**: Dropdown selector to filter Sankey chart by specific month (Jan-Dec) or show full year
    - Timezone-aware filtering using `getItalyMonth()` for consistency between server (UTC) and client (CET)
    - Visual filter indicator: blue banner with "Filtro attivo" + quick "Cancella" button
    - Dynamic title: updates to show selected month (e.g., "Flusso Cashflow Gennaio 2026")
    - Empty state: message when selected month has no expenses
    - Only affects Sankey chart, other charts remain unaffected
  - **Optional 5-layer view**: Toggle "Mostra sottocategorie" aggiunge layer Subcategories (Categories → Subcategories)
  - **Dual-path navigation**: Drill-down classico (4 click) o click diretto su subcategory nel 5-layer (1 click)
  - Multi-level drill-down: Budget → Type → Category → Subcategory → Transaction Details
  - Transaction details table: desktop (sticky header, scrollable) + mobile (card layout)
  - Dynamic breadcrumb: shows full navigation path in header (e.g., "Variabili - Cibo - Coop")
  - Smart navigation: auto-skip to transactions if category has no subcategories
  - Expense types layer: Spese Fisse (blue), Variabili (violet), Debiti (amber)
  - Mobile optimization: top 3 categories per expense type, top 4 subcategories per category, responsive labels
  - Smart filtering: "Altro" singolo escluso quando categoria non ha subcategories reali
  - Separate charts per Anno Corrente e Storico Totale (filtro 2025+)
- Snapshot mensili automatici + storico e CSV export.
- Asset price/value history tables (Prezzi Storici / Valori Storici):
  - Aggregazione per nome asset invece di ID univoco
  - Asset venduti e ricomprati mostrano riga unificata con continuità dati storici
  - Badge "Venduto" solo per asset non più nel portfolio corrente
- History page con multiple chart visualizations:
  - Net Worth evolution (total, liquid, illiquid)
  - Asset Class breakdown (stacked area € or multi-line %)
  - Liquidity evolution (overlapping areas or separate lines)
  - YoY variation (bar chart con variazione annuale)
  - Savings vs Investment Growth: stacked bar chart annuale mostrando Net Savings (green) + Investment Growth (blue/red conditional) = Total NW Growth
  - **Doubling Time Analysis**: traccia tempo impiegato dal patrimonio per raddoppiare
    - **Dual mode**: Geometrico (2x, 4x, 8x, 16x...) vs Soglie Fisse (€100k, €200k, €500k, €1M, €2M)
    - Toggle button per alternare tra modalità
    - 3 summary metrics: Raddoppio Più Rapido, Tempo Medio, Milestone Completate
    - Timeline milestone cards con badge colorati (green complete, blue in-progress)
    - Progress bar per milestone in corso con percentuale completamento
    - Edge case handling: negative periods skipped, insufficient data message, in-progress tracking
  - Current vs Target allocation comparison
- Performance metrics (ROI, CAGR, TWR, IRR, Sharpe, drawdown suite) con heatmap rendimenti mensili, grafico underwater e rolling CAGR/Sharpe con medie mobili.
  - Yield on Cost (YOC): Metriche YOC Lordo e Netto nella Performance page con annualizzazione per confrontabilità tra periodi (YTD, 1Y, 3Y, 5Y, ALL, CUSTOM)
  - Current Yield: Metriche Current Yield Lordo e Netto basate su valore mercato attuale (vs cost basis di YOC) con stesso pattern annualizzazione
  - Row 4 dedicata "Metriche Dividendi" con conditional rendering (visibile solo se dati disponibili): YOC Lordo, YOC Netto, Current Yield Lordo, Current Yield Netto
  - Dettagli card: dividendi totali (gross/net), cost basis (YOC) o valore portafoglio (Current Yield), numero asset inclusi
  - Confronto automatico in tooltip: CY Lordo vs YOC Lordo, CY Netto vs YOC Netto per analizzare crescita dividendi vs prezzo
  - Sezione educativa nelle Note Metodologiche con formula, esempi concreti (lordo + netto), confronto YOC vs CY e interpretazione
- Dividendi multi-currency con conversione EUR, scraping Borsa Italiana, e vista calendario mensile.
  - Calendar view: griglia 6 settimane × 7 giorni (inizio lunedì, locale italiana) con payment dates
  - Click su data: dialog con dettagli dividendi + applicazione filtri
  - Visual filter indicator: banner blu "Filtro attivo" con pulsante cancella rapido
  - Totals row: riga totali in tabella quando filtri attivi
- Hall of Fame con ranking mensili/annuali e highlight del periodo corrente.
  - Sistema note dedicato con supporto multi-sezione: associa note a mesi/anni specifici
  - **Dual-dialog UX**: Click icona → view dialog (read-only) → "Modifica Nota" button → edit dialog
  - View dialog: period display, sections grouped (Monthly/Yearly), scrollable text
  - Edit dialog: create/edit con checkboxes per 8 sezioni ranking (4 mensili + 4 annuali)
  - Icone amber per note presenti, filtrate automaticamente per sezione e periodo
  - Note separate da History, preservate durante ricalcolo rankings (pattern GET existing → merge → SET)
- FIRE calculator con esclusione configurabile casa di abitazione:
  - Flag `isPrimaryResidence` su asset immobiliari (checkbox nel form asset)
  - Setting globale `includePrimaryResidenceInFIRE` disponibile in Settings page e FIRE Calculator (default OFF = escludi, metodologia FIRE standard)
  - Calcolo automatico con `calculateFIRENetWorth()` che filtra immobili primari in base al setting
  - PDF export consistente con UI (usa stesso calcolo e setting)
  - Backwards compatible: asset esistenti senza flag → inclusi, settings esistenti → esclusi (FIRE standard)
- Monte Carlo simulations.
- Performance metrics organizzate in 4 categorie logiche:
  - 📈 Rendimento (ROI, CAGR, TWR, IRR)
  - ⚠️ Rischio (Volatilità, Sharpe, Max Drawdown, Durata Drawdown, Recovery Time)
  - 📊 Contesto (Contributi Netti, Durata)
  - 💰 Dividendi (YOC Lordo/Netto, Current Yield Lordo/Netto)
  - Section headers con descrizioni per ogni categoria
  - Componente riutilizzabile `MetricSection` per layout responsive
- PDF Export con 8 sezioni configurabili (Portfolio, Allocation, History, Cashflow, Performance, FIRE, Summary):
  - Sezione Performance disponibile solo in export annuali (YTD) e totali, non in mensili
  - Tutte le 15 metriche performance organizzate in 4 categorie con formatting professionale
  - Breakdown dettagliato Contributi Netti (Entrate/Dividendi/Uscite) allineato con UI Performance page
  - Time filter mapping: yearly → YTD, total → ALL, monthly → Performance disabled
  - Graceful degradation con dati insufficienti (< 2 snapshots)
- **AI Performance Analysis**: On-demand portfolio analysis powered by Claude Sonnet 4.5 (Anthropic API)
  - Button in Performance page header: "Analizza con AI" con icona Sparkles
  - Real-time streaming response with Server-Sent Events (SSE) for progressive text display
  - **Extended Thinking enabled**: 10k token budget for deeper internal reasoning before responding
  - **Web Search Integration** (Tavily API): Real-time financial news context
    - Multi-query approach: 3 parallel searches (Central Banks, Geopolitical Events, Market Events)
    - Top 2 results per category for balanced coverage (6 total)
    - Captures events post-January 2025 (e.g., Liberation Day, Fed meetings, market volatility)
    - Graceful degradation: continues without web search if API fails
  - Analysis features:
    - Metrics interpretation con 4 categorie (Rendimento, Rischio, Contesto, Dividendi)
    - Financial market events context: real-time news from WSJ, Bloomberg, FT, Reuters
    - Strengths identification, weaknesses, actionable insights (max 350 parole)
  - Enhanced prompt: include periodo esatto con date range + current date + market context
  - Italian language output aligned with app localization
  - Dialog UI (max-w-4xl) with markdown formatting (bold, bullet points), scrollable content
  - Summary metrics header: ROI, CAGR, TWR con color-coding verde/rosso
  - Copy-to-clipboard button con feedback visivo (toast + icon transition)
  - Generation timestamp footer in Italian format (DD/MM/YYYY HH:mm)
  - Regenerate button for new analysis if unsatisfied with first result
  - Graceful error handling with fallback messages and toast notifications
  - Auto-fetch on dialog open, disclaimer footer (not financial advice)

## Data & Integrations
- Firestore (client + admin) con merge updates per evitare data loss.
- Yahoo Finance per prezzi.
- Frankfurter API per conversione valute (cache 24h con fallback).
- Borsa Italiana scraping (ETF vs Stock table structure).
- Tavily API per web search (AI performance analysis context, free tier 1,000 credits/mese).

## Known Issues (Active)
- Etichette legenda su mobile troncate (top 3 elementi).
- Conversione valuta dipende da Frankfurter API (fallback su cache, ma possibile failure prolungata).
- Subcategory rename not fully implemented (tracking prepared but old keys not deleted in Firestore).

## Key Files
- History page: `app/dashboard/history/page.tsx` (includes Doubling Time section)
- Chart service: `lib/services/chartService.ts` (includes `prepareDoublingTimeData()`)
- Doubling Time UI: `components/history/DoublingTimeSummaryCards.tsx`, `components/history/DoublingMilestoneTimeline.tsx`
- Performance page: `app/dashboard/performance/page.tsx`
- Performance metrics: `lib/services/performanceService.ts`
- Performance types: `types/performance.ts`
- YOC API route: `app/api/performance/yoc/route.ts`
- Current Yield API route: `app/api/performance/current-yield/route.ts`
- Performance charts: `components/performance/MonthlyReturnsHeatmap.tsx`, `components/performance/UnderwaterDrawdownChart.tsx`
- Cashflow charts: `components/cashflow/TotalHistoryTab.tsx`, `components/cashflow/CurrentYearTab.tsx`, `components/cashflow/CashflowSankeyChart.tsx`
- Dividends UI: `components/dividends/DividendTrackingTab.tsx`, `components/dividends/DividendTable.tsx`, `components/dividends/DividendCalendar.tsx`, `components/dividends/CalendarDayCell.tsx`, `components/dividends/DividendDetailsDialog.tsx`
- Dividends stats: `app/api/dividends/stats/route.ts`, `components/dividends/DividendStats.tsx`
- Dividend types: `types/dividend.ts`
- Hall of Fame UI: `app/dashboard/hall-of-fame/page.tsx`
- Hall of Fame notes: `components/hall-of-fame/HallOfFameNoteViewDialog.tsx` (read-only view), `components/hall-of-fame/HallOfFameNoteDialog.tsx` (create/edit with multi-section), `components/hall-of-fame/NoteIconCell.tsx` (filtered icons)
- Hall of Fame service: `lib/services/hallOfFameService.ts` (CRUD + getNotesForPeriod + note preservation), `lib/services/hallOfFameService.server.ts` (note preservation)
- Date helpers: `lib/utils/dateHelpers.ts`
- Formatters: `lib/utils/formatters.ts`
- Asset service: `lib/services/assetService.ts` (includes `calculateFIRENetWorth`)
- Asset allocation service: `lib/services/assetAllocationService.ts` (includes nested object replacement pattern)
- Asset price history utils: `lib/utils/assetPriceHistoryUtils.ts` (name-based aggregation for re-acquired assets)
- Asset price history table: `components/assets/AssetPriceHistoryTable.tsx` (historical price/value visualization)
- Settings page: `app/dashboard/settings/page.tsx`
- PDF export: `types/pdf.ts`, `lib/services/pdfDataService.ts`, `components/pdf/PDFDocument.tsx`, `components/pdf/PDFExportDialog.tsx`, `lib/utils/pdfTimeFilters.ts`
- PDF sections: `components/pdf/sections/PerformanceSection.tsx` (performance metrics with 4 categories)
- Asset dialog: `components/assets/AssetDialog.tsx`
- FIRE calculator: `components/fire-simulations/FireCalculatorTab.tsx`
- Performance metrics section: `components/performance/MetricSection.tsx`
- Asset types: `types/assets.ts` (includes DoublingMilestone, DoublingTimeSummary, DoublingMode)
- AI Analysis: `app/api/ai/analyze-performance/route.ts` (Anthropic API integration with SSE streaming + web search preprocessing), `components/performance/AIAnalysisDialog.tsx` (dialog with markdown rendering)
- Web Search: `lib/services/tavilySearchService.ts` (multi-query approach with 3 categories), `types/tavily.ts` (API types)

**Last updated**: 2026-01-29
