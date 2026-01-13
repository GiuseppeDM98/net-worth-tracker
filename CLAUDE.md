# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Net Worth Tracker is a Next.js app for Italian investors to track net worth, assets, cashflow, dividends, performance metrics, and historical snapshots with Firebase.

## Current Status
- Versione stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, date-fns-tz
- Feature ultimo mese: Yield on Cost (YOC) analysis con metric card e tabella dettagliata per asset
- Ultima fix: Aggiunte spiegazioni "dividendi lordi TTM (12 mesi)" nella UI YOC per chiarezza calcolo
- In corso ora: nessuna attivita attiva nota
- Completamento: n/d (da confermare)

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
- Cashflow con categorie, filtri e statistiche.
- Snapshot mensili automatici + storico e CSV export.
- Performance metrics (ROI, CAGR, TWR, IRR, Sharpe, drawdown suite) con heatmap rendimenti mensili, grafico underwater e rolling CAGR/Sharpe con medie mobili.
- Dividendi multi-currency con conversione EUR, scraping Borsa Italiana, e Yield on Cost (YOC) analysis.
- Hall of Fame con ranking mensili/annuali e highlight del periodo corrente.
- FIRE calculator e Monte Carlo.

## Data & Integrations
- Firestore (client + admin) con merge updates per evitare data loss.
- Yahoo Finance per prezzi.
- Frankfurter API per conversione valute (cache 24h con fallback).
- Borsa Italiana scraping (ETF vs Stock table structure).

## Known Issues (Active)
- Etichette legenda su mobile troncate (top 3 elementi).
- Conversione valuta dipende da Frankfurter API (fallback su cache, ma possibile failure prolungata).

## Next Steps (Prossime 1-2 sessioni)
- Verificare su mobile/tablet i grafici Rolling (CAGR/Sharpe) e la leggibilita delle legende.
- Ottimizzazioni UI/UX basate su feedback utente.

## Key Files
- Performance page: `app/dashboard/performance/page.tsx`
- Performance metrics: `lib/services/performanceService.ts`
- Performance charts: `components/performance/MonthlyReturnsHeatmap.tsx`, `components/performance/UnderwaterDrawdownChart.tsx`
- Cashflow charts: `components/cashflow/TotalHistoryTab.tsx`, `components/cashflow/CurrentYearTab.tsx`
- Dividends stats: `app/api/dividends/stats/route.ts`, `components/dividends/DividendStats.tsx`
- Dividend types: `types/dividend.ts`
- Hall of Fame UI: `app/dashboard/hall-of-fame/page.tsx`
- Date helpers: `lib/utils/dateHelpers.ts`
- Formatters: `lib/utils/formatters.ts`

**Last updated**: 2026-01-13
