# Session Notes — Portfolio Metrics + New Benchmarks
**Date**: 2026-05-05
**Branch**: `claude/add-portfolio-metrics-Z2rSr`

## Goal
Enhance "Confronto con Portafogli Modello" in Rendimenti with:
1. 9 new metrics in the summary table (Volatilità, Sharpe, Sortino, Calmar, Max Drawdown, Miglior/Peggior mese, Mesi+/-)
2. 2 new model portfolios (Portafoglio Permanente, 100% ACWI)

## Changes

### lib/constants/benchmarks.ts
- Added: `permanent-portfolio` (25% VTI/TLT/GLD/SHY, pink-500)
- Added: `acwi-100` (100% ACWI, cyan-500)

### components/performance/BenchmarkComparisonChart.tsx
- New pure metric functions: `computeVolatility`, `computeDownsideDeviation`, `computeSortino`, `computeCalmar`, `computeMaxDrawdownFromReturns`, `computePositiveNegative`, `computeAllMetrics`
- New local type: `BenchmarkMetrics`
- New props: `portfolioVolatility`, `portfolioSharpe`, `portfolioMaxDrawdown`, `riskFreeRate`
- Expanded summary table: 12 columns with responsive visibility

### components/performance/BenchmarkComparisonSection.tsx
- Added b4, b5 fixed hook declarations for 2 new benchmarks
- Forwarded new props to BenchmarkComparisonChart

### app/dashboard/performance/page.tsx
- Passed `portfolioVolatility`, `portfolioSharpe`, `portfolioMaxDrawdown`, `riskFreeRate` to BenchmarkComparisonSection

## Status: COMPLETED

---

## Cosa
- Aggiunta tabella metriche estesa nel "Confronto con Portafogli Modello" in Rendimenti: Volatilità, Sharpe, Sortino, Calmar, Max Drawdown, Miglior mese, Peggior mese, Mesi+, Mesi-
- Aggiunti 2 nuovi portafogli modello: Portafoglio Permanente (Harry Browne, 25% VTI/TLT/GLD/SHY) e 100% ACWI (equity puro globale)

## Perché
- La tabella precedente mostrava solo TWR e Crescita totale — insufficiente per confrontare il profilo rischio/rendimento dei portafogli
- Il Sortino penalizza solo la volatilità al ribasso, più significativo del Sharpe per portafogli con distribuzione asimmetrica
- Il Calmar mette in relazione il rendimento con il rischio di drawdown — metrica intuitiva per investitori retail
- Il Portafoglio Permanente è il predecessore diretto del Golden Butterfly già presente, utile come punto di riferimento difensivo "puro"
- Il 100% ACWI è il benchmark azionario globale di riferimento — permette di rispondere alla domanda "batto il mercato?"

## Note
- **Metodologia unificata**: tutte le metriche di rischio sono calcolate dalla stessa serie di rendimenti mensili filtrata al periodo, senza cashflow adjustment — garantisce confronto apples-to-apples tra portafoglio e benchmark. Eccezione: Volatilità, Sharpe e Max Drawdown del portafoglio usano i valori pre-calcolati cashflow-adjusted dal `performanceService` (coerenti con le KPI card)
- **Hook count**: aggiornato da 4 a 6 hook fissi in `BenchmarkComparisonSection.tsx` — React richiede un numero stabile di hook per render; aggiungere nuovi benchmark richiede sempre una nuova dichiarazione `const bN = useBenchmarkReturns(...)` + aggiornamento di `hookResults`
- **Checklist aggiornamento benchmark**: aggiunto commento in `lib/constants/benchmarks.ts` che ricorda i 3 passi da seguire quando si aggiunge un benchmark futuro
- **Responsive table**: colonne Sortino, Calmar (`hidden md:table-cell`) e Miglior/Peggior mese, Mesi- (`hidden sm:table-cell`) si nascondono su schermi piccoli; `overflow-x-auto` gestisce lo scroll orizzontale su mobile
- **Risk-free rate**: viene passato come prop da `performance/page.tsx` via `metrics.riskFreeRate` (configurable dall'utente in Settings, default 2.5%) — non hardcodato nel componente
