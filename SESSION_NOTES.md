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

## Status: IN PROGRESS
