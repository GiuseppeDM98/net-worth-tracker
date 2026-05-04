# Draft Release Notes

## ✨ New Features

- Added **benchmark comparison** to the Performance page — compare your portfolio's time-weighted return against four model portfolios: 60/40 (Global Equity + Bonds), All Weather (Ray Dalio), Buffett 90/10, and Golden Butterfly. The chart shows indexed growth of €100 from the start of the selected period; the summary table shows annualized TWR and total growth for each
- Added **EUR conversion toggle** for benchmarks — "Converti benchmark in EUR" switch applies historical monthly USD/EUR exchange rates so the comparison accounts for currency impact (off by default; fetches data only when enabled)
- Added benchmark composition detail — click the ⓘ button next to any benchmark pill to see the underlying ETFs, weights, and data source

## 🐛 Bug Fixes

- Fixed benchmark comparison table showing different TWR and total growth values than the main KPI cards on the Performance page — values now use the same pre-computed metrics as the header cards
- Fixed missing `+` prefix on positive portfolio "Total Growth" values in the benchmark comparison table

## 🏗️ Technical

- New server API routes: `GET /api/benchmarks/returns` (Yahoo Finance ETF data, 7-day Firestore cache) and `GET /api/benchmarks/fx-rates` (Frankfurter monthly EUR/USD rates, 7-day Firestore cache) — both shared globally across all users
- New Firestore collections: `benchmark-cache/{benchmarkId}` and `fx-rate-cache/usd-eur` (server-write only)
