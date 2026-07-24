## ✨ New Features

- Added a period selector (3M / 6M / YTD / 1A / 3A / All) to the net worth trend chart on the Overview page.
- Added an all-time-high badge that appears next to your net worth when you reach a new peak.
- Added a "driven by" summary on Overview showing which asset classes moved your net worth the most this month.
- Added a featured progress indicator for your most relevant active goal (Goal-Based Investing) on the Overview page.
- Added an operations register for your investments: from Patrimonio you can now record Buy, Sell, and Adjustment operations on each stock, ETF, bond, crypto, or commodity, with an optional settlement account whose balance updates automatically (net-worth-neutral).
- Added a per-asset "Movimenti" view with your full operation history plus realized P&L, total return, and money-weighted return (XIRR) for that asset.
- Added a live estimated realized-P&L preview when recording a sale, so you see the outcome before confirming.
- Added "Capitale investito" on Performance: what you actually bought minus sold through the operations register in the selected period, shown next to "Contributi netti" with a popover explaining why the two figures measure different things.
- Added "Plusvalenze realizzate" on Performance: a per-fiscal-year breakdown of realized gains and losses closed through the operations register.
- Added a "Fondo Pensione" (pension fund) asset type: a manually-valued holding for your Italian complementary pension, with its own equity/bond mix, enrollment date, and unlock date.
- Added a dedicated Previdenza page to record pension contributions — TFR, employer, or your own voluntary payment from a linked cash account — with a running total by year and nature, and a one-tap delete that reverses the contribution's effect.
- Added an estimated annual IRPEF tax-saving summary on the Previdenza page, plus a plafond tracker for the "extra-deducibilità" recovery regime (workers whose first employment started after 2007).
- Added a "Vai a Previdenza" quick link on your pension fund asset in Patrimonio, and a new "Previdenza" entry in the navigation.
- Added the ability to convert an investment you already track into a pension fund asset without losing its value or history.
- Added a "Mostra previdenza complementare" look-through on Allocazione: two read-only cards show your pension fund's own equity/bond mix and the combined portfolio-plus-pension split, without affecting the plans (a pension fund is never bought or sold from there).
- Added a "Previdenza" band to the Storico asset-class chart, so your pension funds' value is shown on its own instead of being folded into Azioni/Obbligazioni.
- Performance metrics (TWR, Sharpe, volatility, drawdown, ROI, CAGR) now exclude your pension funds, since they're illiquid capital fed by contributions rather than market activity — "Capitale investito" already excluded them.
- Added an optional FIRE Calculator setting to treat locked pension capital (before its unlock date) as unavailable for early retirement, while still counting it in your total net worth everywhere else.
- Added a "Famiglia" section in Settings where you can add family members, each with their own income (RAL) and pension deduction eligibility, and link each pension fund to one of them from its asset details.
- Added support for leveraged and composite ETFs: set a "Leva" (leverage) multiplier on an ETF (e.g. 2 for a 2x fund) and the app tracks its notional exposure — the real risk it carries — separately from its market value.
- Added a dual-number view to the Allocazione hero when you hold leverage: your invested capital ("Patrimonio investito") and your notional exposure ("Esposizione nozionale") side by side, with a current-vs-target leverage indicator.
- Added leverage-aware allocation targets: your per-class targets can now sum to more than 100% to express a desired leverage, and Settings shows the resulting target leverage (e.g. "Leva target 1,50×").
- Added leverage-aware Ribilancia / Versa / Preleva plans: when you hold leveraged or composite ETFs, the suggested trades reason over your actual instruments (a €1 buy of a 2x fund moves more than €1 of exposure) instead of assuming plain 1x purchases.
- Added two new asset classes, "Trend Following" and "Carry", selectable as allocation targets and as composition legs of a composite ETF.

## 🐛 Bug Fixes

- Fixed the "Total Return per Asset" table on Dividends excluding fully-sold investments entirely and describing every gain as "unrealized" — it now uses your real buy/sell history for tracked investments, so fully-sold positions (marked "Chiusa") and partial sells show an accurate, correctly-labeled capital-gain figure instead.
- Fixed the dividend-return figure on that same table for tracked investments with more than one purchase at a different price — it now credits each dividend against the cost basis that was actually in effect when it was paid, instead of a single average across your whole holding period.
- Fixed the Previdenza tax-benefit estimate for accounts tracking more than one person's pension fund (e.g. both spouses): contributions from every fund were being summed against a single income, understating the deduction for each person. The tax benefit is now calculated once per family member, using their own income and contributions.

## 🔧 Improvements

- New investments are now recorded as an opening purchase in the operations register, and quantity and average cost for tracked investments are managed through it — so editing an investment can no longer accidentally overwrite its cost basis.
- Overview now always shows a 12-month context line next to a negative monthly change, so a down month is never shown without the bigger picture.
- Large net worth values on the Overview hero no longer risk overflowing on smaller screens.
- Cost and tax figures (TER, annual cost, estimated taxes) on Overview now follow your selected color theme consistently.
- The Analisi page is easier to scan: the key numbers, warnings, and cash-flow chart stay up front, while the deeper comparison and trend sections now collapse behind a "Mostra dettaglio" toggle instead of always taking up the whole page.
- The cash-flow chart's drill-down breadcrumb is now fully clickable — jump straight back to any earlier step instead of clicking "Indietro" repeatedly.
- Your selected period on Analisi (Anno Corrente / Anno / Storico, plus year/month) is now saved in the page link, so refreshing or sharing the link keeps your view.
- When a month ends in deficit, Analisi now also shows your average savings rate over the last 12 months next to it, for context.
- All period, view, and range toggle controls can now be navigated with the arrow keys, not just the mouse.
- The spending-anomaly warning banner on Analisi now follows your selected color theme instead of a fixed amber color.
- Removed two unused fields ("Data di iscrizione", "Prima occupazione dopo il 2007") from the pension fund's own details, now that this information is set once per family member in Settings instead of per fund.
- The Previdenza page and the "Registra versamento" dialog now explain the correct order for your monthly update: register the month's contributions first, then update the fund's current value from your statement — doing it the other way around double-counts the contributions.

## 🔒 Security

- Updated several dependencies to resolve known security advisories (`npm audit fix`).
