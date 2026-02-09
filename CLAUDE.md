# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Net Worth Tracker is a Next.js app for Italian investors to track net worth, assets, cashflow, dividends, performance metrics, and historical snapshots with Firebase.

## Current Status
- Versione stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, date-fns-tz, @nivo/sankey, @anthropic-ai/sdk
- Feature ultimo mese: AI Performance Analysis with Web Search + Doubling Time Analysis
- Ultima implementazione: FIRE Projection Scenarios (Bear/Base/Bull) con inflazione (2026-02-09)
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
  - **Average Cost Precision**: Campo "Costo Medio per Azione" supporta 4 decimali (es. €100,1119) per allinearsi con precisione broker e migliorare accuratezza calcoli gain/loss.
- Cashflow con categorie, filtri, statistiche e Sankey diagram interattivo:
  - Budget flow visualization con unified month filter, 5-layer optional view, dual-path navigation
  - Multi-level drill-down: Budget → Type → Category → Subcategory → Transaction Details
  - Separate charts per Anno Corrente e Storico Totale
  - **Analisi Periodo** in Storico Totale: sezione con filtri anno+mese, Sankey + 2 pie charts (spese/entrate per categoria) con drill-down 3 livelli. Default tutti i dati dal 2025+, filtri opzionali.
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
- Hall of Fame con ranking mensili/annuali, highlight periodo corrente, e sistema note dedicato multi-sezione.
- FIRE calculator con esclusione configurabile casa di abitazione (flag `isPrimaryResidence`, setting globale, PDF export consistente).
  - **Proiezione Scenari**: proiezione deterministica patrimonio sotto 3 scenari di mercato (Bear/Base/Bull)
    - Parametri editabili per scenario: crescita mercati + inflazione (con default preimpostati)
    - Inflazione applicata alle spese anno per anno → FIRE Number è un target mobile
    - Risparmio annuale auto-calcolato dal cashflow reale (entrate - uscite ultimo anno)
    - Default: Bear (4%/3.5%), Base (7%/2.5%), Bull (10%/1.5%)
    - Output: chart 3 linee + FIRE Number tratteggiato, card "Anni al FIRE", tabella anno per anno collassabile
    - Parametri salvabili in Firestore settings
- Monte Carlo simulations con parametri di mercato editabili (equity 7%/18%, bonds 3%/6%).
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
  - SSE streaming, Extended Thinking (10k tokens), Web Search (Tavily API, 3 parallel queries)
  - Metrics interpretation, market context, strengths/weaknesses, actionable insights (max 350 parole)
  - Dialog UI con markdown, copy-to-clipboard, regenerate, timestamp, disclaimer

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
- FIRE projection scenarios: `components/fire-simulations/FIREProjectionSection.tsx`, `components/fire-simulations/FIREProjectionChart.tsx`, `components/fire-simulations/FIREProjectionTable.tsx`
- FIRE service: `lib/services/fireService.ts` (includes `getAnnualCashflowData`, `calculateFIREProjection`)
- Performance metrics section: `components/performance/MetricSection.tsx`
- Asset types: `types/assets.ts` (includes DoublingMilestone, DoublingTimeSummary, DoublingMode)
- AI Analysis: `app/api/ai/analyze-performance/route.ts` (Anthropic API integration with SSE streaming + web search preprocessing), `components/performance/AIAnalysisDialog.tsx` (dialog with markdown rendering)
- Web Search: `lib/services/tavilySearchService.ts` (multi-query approach with 3 categories), `types/tavily.ts` (API types)
- Auth helpers: `lib/utils/authHelpers.ts` (token refresh + retry logic for Firebase Auth + Firestore synchronization)
- Auth context: `contexts/AuthContext.tsx` (user registration with token refresh pattern)

**Last updated**: 2026-02-09
