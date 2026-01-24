# Draft Release Notes

## ✨ New Features

### Doubling Time Analysis
- Added Doubling Time Analysis section to History page to track how long your net worth takes to double over time
- Dual-mode visualization:
  - **Geometric mode**: Track exponential growth (2x, 4x, 8x, 16x...)
  - **Fixed Thresholds mode**: Track psychological milestones (€100k, €200k, €500k, €1M, €2M)
- Toggle button to easily switch between calculation modes
- Summary metrics dashboard showing:
  - Fastest doubling period achieved
  - Average time to double across all milestones
  - Total number of milestones completed
- Timeline visualization displaying all completed milestones with detailed information
- Progress tracking for current milestone in progress with percentage completion and progress bar
- Smart handling of edge cases (negative net worth periods, insufficient data, portfolios starting above thresholds)

## 🐛 Bug Fixes

- Fixed threshold milestones incorrectly showing 0-month duration when portfolio tracking started with net worth already above threshold value (e.g., starting at €164k would show €100k milestone as "reached in 0 months")

## 🔧 Improvements

- Improved milestone calculation accuracy by skipping pre-existing thresholds
- Added responsive design support for doubling time cards (mobile/tablet/desktop layouts)
- Dark mode support for all doubling time components
