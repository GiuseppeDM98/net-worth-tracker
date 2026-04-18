## 🐛 Bug Fixes

- Fixed the "Asset Distribution" pie chart on mobile being clipped when a portfolio has many assets — the legend now shows a maximum of 5 items (filtering entries below 7% first), preventing the chart from being cut off in portrait mode

## 🔧 Improvements

- Improved the Net Worth Evolution chart in History: the line now renders clean and continuous without dots on every data point, matching the visual style of the area charts below it; note indicators (amber markers) are still shown on snapshots with attached notes
- Improved error handling in Cashflow and Budget so temporary loading or save issues surface clearer feedback while keeping the page usable
- Improved resilience when refreshing dashboard overview data after account changes, with safer fallback handling for non-critical failures
