# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Net Worth Tracker is a Next.js app for Italian investors to track net worth, assets, cashflow, dividends, performance metrics, and historical snapshots with Firebase.

## Current Status
- Versione stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase, date-fns-tz
- Feature ultimo mese: Savings vs Investment Growth chart in History page per analizzare contributo risparmi vs mercato
- Ultima implementazione: Stacked bar chart annuale che separa Net Savings (cashflow) da Investment Growth (market performance) (2026-01-18)
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
- Cashflow con categorie, filtri e statistiche.
- Snapshot mensili automatici + storico e CSV export.
- History page con multiple chart visualizations:
  - Net Worth evolution (total, liquid, illiquid)
  - Asset Class breakdown (stacked area € or multi-line %)
  - Liquidity evolution (overlapping areas or separate lines)
  - YoY variation (bar chart con variazione annuale)
  - Savings vs Investment Growth: stacked bar chart annuale mostrando Net Savings (green) + Investment Growth (blue/red conditional) = Total NW Growth
  - Current vs Target allocation comparison
- Performance metrics (ROI, CAGR, TWR, IRR, Sharpe, drawdown suite) con heatmap rendimenti mensili, grafico underwater e rolling CAGR/Sharpe con medie mobili.
  - Yield on Cost (YOC): Metriche YOC Lordo e Netto nella Performance page con annualizzazione per confrontabilità tra periodi (YTD, 1Y, 3Y, 5Y, ALL, CUSTOM)
  - Row 4 dedicata "Metriche Dividendi" con conditional rendering (visibile solo se dati disponibili)
  - Dettagli: dividendi totali, cost basis, numero asset inclusi
  - Sezione educativa nelle Note Metodologiche con formula, esempi concreti e interpretazione
- Dividendi multi-currency con conversione EUR, scraping Borsa Italiana, e vista calendario mensile.
  - Calendar view: griglia 6 settimane × 7 giorni (inizio lunedì, locale italiana) con payment dates
  - Click su data: dialog con dettagli dividendi + applicazione filtri
  - Visual filter indicator: banner blu "Filtro attivo" con pulsante cancella rapido
  - Totals row: riga totali in tabella quando filtri attivi
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
- Testing e validazione Savings vs Investment chart con dati reali utente.
- Ottimizzazioni UI/UX basate su feedback utente.
- Eventuali enhancement al chart (percentage toggle, drill-down mensile).

## Key Files
- History page: `app/dashboard/history/page.tsx`
- Chart service: `lib/services/chartService.ts`
- Performance page: `app/dashboard/performance/page.tsx`
- Performance metrics: `lib/services/performanceService.ts`
- Performance types: `types/performance.ts`
- YOC API route: `app/api/performance/yoc/route.ts`
- Performance charts: `components/performance/MonthlyReturnsHeatmap.tsx`, `components/performance/UnderwaterDrawdownChart.tsx`
- Cashflow charts: `components/cashflow/TotalHistoryTab.tsx`, `components/cashflow/CurrentYearTab.tsx`
- Dividends UI: `components/dividends/DividendTrackingTab.tsx`, `components/dividends/DividendTable.tsx`, `components/dividends/DividendCalendar.tsx`, `components/dividends/CalendarDayCell.tsx`, `components/dividends/DividendDetailsDialog.tsx`
- Dividends stats: `app/api/dividends/stats/route.ts`, `components/dividends/DividendStats.tsx`
- Dividend types: `types/dividend.ts`
- Hall of Fame UI: `app/dashboard/hall-of-fame/page.tsx`
- Date helpers: `lib/utils/dateHelpers.ts`
- Formatters: `lib/utils/formatters.ts`

**Last updated**: 2026-01-18
