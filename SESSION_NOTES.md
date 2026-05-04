# Session Notes — Portfolio Benchmark Comparison

**Session**: claude/portfolio-comparison-benchmarks-TuDOq  
**Date**: 2026-05-04  
**Feature**: Compare user portfolio performance vs standard model portfolios (60/40, All Weather, Buffett 90/10, Golden Butterfly)

## Approach

- **No fake Firestore user**: benchmarks are derived from Yahoo Finance ETF historical prices, cached in a global Firestore collection `benchmark-cache/{benchmarkId}`
- **ETF proxies (USD)**: best historical depth; USD noted clearly in UI; FX conversion deferred to v2
- **UI placement**: new "Confronto con Portafogli Modello" Card in the Rendimenti page, after "Evoluzione Patrimonio", before rolling CAGR charts
- **Indexed chart**: both user portfolio and benchmarks normalized to 100 at period start (same TWR-equivalent methodology)
- **Period sync**: reuses existing `selectedPeriod` / `heatmapData` from the performance page

## Files Created

- `types/benchmarks.ts` — TypeScript types
- `lib/constants/benchmarks.ts` — benchmark definitions with ETF weights
- `app/api/benchmarks/returns/route.ts` — server-side fetch + Firestore cache (TTL 7d)
- `lib/hooks/useBenchmarkReturns.ts` — React Query hook per benchmark
- `components/performance/BenchmarkComparisonChart.tsx` — indexed line chart + TWR table
- `components/performance/BenchmarkComparisonSection.tsx` — section with toggle pills, loading states

## Files Modified

- `app/dashboard/performance/page.tsx` — inserted BenchmarkComparisonSection after Evoluzione Patrimonio chart
- `firestore.rules` — added `benchmark-cache` collection (read: any authenticated user, write: Admin SDK only)

## Benchmark ETF Proxies

| ID | Components |
|----|-----------|
| `60-40` | ACWI (60%) + AGG (40%) |
| `all-weather` | SPY (30%) + TLT (40%) + IEF (15%) + GLD (7.5%) + GSG (7.5%) |
| `buffett-90-10` | SPY (90%) + SHY (10%) |
| `golden-butterfly` | VTI (20%) + VBR (20%) + GLD (20%) + TLT (20%) + SHY (20%) |
