# Session Notes — 2026-03-18

## Task
Fix: underwater chart (Grafico Underwater / Drawdown) shows the baseline month as the first data point.

## Root Cause
`prepareUnderwaterDrawdownData` received `periodSnapshots` from `getSnapshotsForPeriod`, which for YTD/1Y/3Y/5Y periods includes one extra "baseline" snapshot before the actual period start. This snapshot was always included in the chart output, causing the leftmost tick on the X-axis to display a month that falls outside the selected period — the same bug that had already been fixed in the heatmap and evolution chart.

## Fix Applied
**`lib/services/performanceService.ts`** — `prepareUnderwaterDrawdownData`:
- Added optional `skipBaseline = false` parameter (consistent with `preparePerformanceChartData`).
- Converted the `for...of` loop to an indexed `for` loop so index 0 can be detected.
- When `skipBaseline=true` the baseline point is processed (to seed `runningPeak` and `cumulativeCashFlow`) but not pushed to the output array.

**`app/dashboard/performance/page.tsx`** — `useEffect` that computes `underwaterData`:
- Added `hasBaselineUnderwater` flag mirroring the existing `hasBaseline` logic used in `getChartData()`.
- Passed the flag as third argument to `prepareUnderwaterDrawdownData`.

## Pattern Reference
AGENTS.md § "Performance Period Baseline Pattern" — "Chart baseline hiding — each chart function handles it independently".
- Heatmap: loop starts at `i = 1`
- Evolution chart: `skipBaseline` param → `.slice(1)`
- Underwater chart (this fix): `skipBaseline` param → `continue` at `i === 0`
