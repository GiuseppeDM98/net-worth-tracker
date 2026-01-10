# CLAUDE.md - Net Worth Tracker (Lean)

## Project Overview
Net Worth Tracker is a Next.js app for Italian investors to track net worth, assets, cashflow, dividends, performance metrics, and historical snapshots with Firebase.

## Current Status
- Versione stack: Next.js 16, React 19, TypeScript 5, Tailwind v4, Firebase
- Feature ultimo mese: drawdown metrics allineate TWR, separazione dividendi nei cash flow, evidenza mese/anno corrente in Hall of Fame
- In corso ora: nessuna attivita attiva nota
- Completamento: n/d (da confermare)

## Architecture Snapshot
- App Router con pagine protette sotto `app/dashboard/*`.
- Service layer in `lib/services/*` (Firestore client/admin, scraping, metriche).
- Utility in `lib/utils/*` (formatters, date helpers, asset history).
- React Query per caching e invalidazioni post-mutation.

## Key Features (Active)
- Portfolio multi-asset con aggiornamento prezzi Yahoo Finance.
- Cashflow con categorie, filtri e statistiche.
- Snapshot mensili automatici + storico e CSV export.
- Performance metrics (ROI, CAGR, TWR, IRR, Sharpe, drawdown suite).
- Dividendi multi-currency con conversione EUR e scraping Borsa Italiana.
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
- API serialize Firestore Timestamps come ISO strings: usare `toDate()`.

## Next Steps (Prossime 1-2 sessioni)
- Confermare colore e contrasto highlight Hall of Fame su temi chiaro/scuro.
- Aggiungere indicazione visiva di periodo corrente nelle card/tabelle se tema cambia.
- Rivedere eventuali altri touchpoint che usano mese/anno corrente per coerenza UI.

## Key Files
- Hall of Fame UI: `app/dashboard/hall-of-fame/page.tsx`
- Performance metrics: `lib/services/performanceService.ts`
- Date helpers: `lib/utils/dateHelpers.ts`
- Formatters: `lib/utils/formatters.ts`
- Query keys: `lib/query/queryKeys.ts`

**Last updated**: 2026-01-10
