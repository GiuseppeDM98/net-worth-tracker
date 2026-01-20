# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Net Worth Tracker is a Next.js app for Italian investors to track net worth, assets, cashflow, dividends, performance metrics, and historical snapshots with Firebase.

## Current Status
- Versione stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, date-fns-tz, @nivo/sankey
- Feature ultimo mese: Sankey subcategories toggle + Asset historical aggregation + Settings fixes
- Ultima implementazione: Added optional 5-layer Sankey view with subcategories toggle for detailed cashflow visualization (2026-01-20)
- In corso ora: nessuna attivita attiva
- Completamento: n/d

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

## Data & Integrations
- Firestore (client + admin) con merge updates per evitare data loss.
- Yahoo Finance per prezzi.
- Frankfurter API per conversione valute (cache 24h con fallback).
- Borsa Italiana scraping (ETF vs Stock table structure).

## Known Issues (Active)
- Etichette legenda su mobile troncate (top 3 elementi).
- Conversione valuta dipende da Frankfurter API (fallback su cache, ma possibile failure prolungata).
- Subcategory rename not fully implemented (tracking prepared but old keys not deleted in Firestore).

## Key Files
- History page: `app/dashboard/history/page.tsx`
- Chart service: `lib/services/chartService.ts`
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
- Date helpers: `lib/utils/dateHelpers.ts`
- Formatters: `lib/utils/formatters.ts`
- Asset service: `lib/services/assetService.ts` (includes `calculateFIRENetWorth`)
- Asset allocation service: `lib/services/assetAllocationService.ts` (includes nested object replacement pattern)
- Asset price history utils: `lib/utils/assetPriceHistoryUtils.ts` (name-based aggregation for re-acquired assets)
- Asset price history table: `components/assets/AssetPriceHistoryTable.tsx` (historical price/value visualization)
- Settings page: `app/dashboard/settings/page.tsx`
- PDF data service: `lib/services/pdfDataService.ts`
- Asset dialog: `components/assets/AssetDialog.tsx`
- FIRE calculator: `components/fire-simulations/FireCalculatorTab.tsx`
- Performance metrics section: `components/performance/MetricSection.tsx`
- Asset types: `types/assets.ts`

**Last updated**: 2026-01-20
