## ✨ New Features

- Settings page is now organized into 4 tabs (Allocation, Preferences, Expenses, Dividends) — no more scrolling through a single long page
- Profile settings (age, risk-free rate, auto-calculate allocation formula) are now in the Allocation tab, next to the target percentages they affect
- Risk-free rate field now shows an inline link to retrieve the current BTP 10Y value directly below the input

## 🐛 Bug Fixes

- Fixed Yield on Cost (YOC) calculation in the Performance page: buying additional shares after a dividend payment no longer understates YOC. The metric now correctly reflects the dividend yield relative to your average cost per share, regardless of when shares were purchased
- Fixed YOC accuracy when your average cost per share changes over time: each dividend now records the exact cost basis at the time of payment, so the metric reflects what you actually paid for the shares that generated that income — not your current blended average

## 🔧 Improvements

- "Ripristina Default" button in Settings is now only shown in the Allocation tab where it is relevant
- Settings tabs use lazy loading — only the default tab (Allocation) renders on page load
- Expense category type (Fixed, Variable, Debt, Income) can now be changed after creation — all associated transactions are updated automatically, including amount sign correction when switching between income and expense types
