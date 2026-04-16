## ✨ New Features

- Portfolio values for assets priced in foreign currencies (USD, GBP, CHF, etc.) are now automatically converted to EUR using live exchange rates — net worth, allocation, and historical snapshots all reflect the correct EUR equivalent

## 🐛 Bug Fixes

- Fixed chart legends ("Net Worth by Asset Class" and "Liquidity vs Illiquidity Evolution") overlapping the X-axis on mobile when rotating from portrait to landscape orientation on the History page
- Fixed non-EUR assets (e.g. ETFs listed on NYSE or LSE) showing their native currency amount with a € symbol instead of the correct converted value
- Fixed gain/loss absolute value on asset cards showing the wrong currency symbol for non-EUR assets (now correctly shows $ for USD assets, £ for GBP assets, etc.)
- Fixed assets created with the wrong currency in the form — the currency field is now always corrected from Yahoo Finance's response on the first price update

## 🔧 Improvements

- Asset creation now immediately computes and stores the EUR-converted price, so the portfolio total is correct right after saving without needing to manually trigger a price update
- London Stock Exchange tickers (e.g. SWDA.L, EIMI.L) are now correctly handled: Yahoo Finance returns prices in pence (GBp), which are automatically normalized to pounds (GBP) before EUR conversion
