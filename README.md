# Net Worth Tracker

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)
![Firebase](https://img.shields.io/badge/Firebase-12-FFCA28?logo=firebase)
![Vitest](https://img.shields.io/badge/Vitest-4-6E9F18?logo=vitest)
![License](https://img.shields.io/badge/License-AGPL--3.0-blue)

## Description

Net Worth Tracker is a full-featured personal finance application built for Italian investors. It provides comprehensive portfolio tracking, performance analytics, cashflow management, dividend monitoring, and long-term financial planning tools — all in a single dashboard.

The app integrates with Yahoo Finance for real-time price updates and includes advanced features like Monte Carlo simulations, FIRE (Financial Independence, Retire Early) projections, AI-powered performance analysis, and a dedicated AI assistant foundation via Claude. The UI is in Italian while the codebase follows English conventions.

## Key Features

### Portfolio Management
- **Overview that answers before it counts** — the Panoramica opens with a one-sentence verdict on the month ("Agosto sta andando bene." / "Agosto è in calo, nonostante il mercato."), generated from your data and never claiming what the data can't support, followed by a grid of tiles that each answer one question with a short reading above the figures: net worth with trend and a "Mercato" line (the price effect on what you held — your own buys and sells never count as return), liquidity split, this month's cashflow with an end-of-month spending projection, composition, costs with the instruments that weigh most, up to three goals, spending and income by category, and your largest positions
- Multi-asset tracking across stocks, ETFs, bonds, crypto, real estate, commodities, pension funds, and cash — added via a guided two-step dialog: pick the asset type first, then fill in only the relevant fields for that type
- Multi-currency support: assets priced in USD, GBP, CHF, etc. are automatically converted to EUR for all portfolio calculations using live Frankfurter exchange rates; LSE pence (GBp) normalized to GBP automatically
- Automatic price updates via Yahoo Finance (all assets) and Borsa Italiana (Italian bonds with ISIN)
- **Ticker display alias**: give any investment a short, readable label (e.g. "CL2" instead of "CL2.MI") shown everywhere across the app instead of the raw ticker — automatic price updates keep using the real ticker underneath, unaffected
- Bond coupon scheduling: automatic coupon generation with step-up rate tiers and final premium (Premio Finale) support — full BTP Valore compatible
- Average cost tracking with 4-decimal precision, including a built-in multi-broker PMC calculator for positions spread across multiple brokers
- **Operations register (Registro operazioni)**: record explicit Buy / Sell / Adjustment operations on each tracked investment (stocks, ETFs, bonds, crypto, commodities), with an optional settlement account whose balance updates automatically — operations are net-worth-neutral (money simply moves between the asset and your cash). A per-asset "Movimenti" view lists your full operation history alongside realized P&L, total return, and money-weighted return (XIRR); each sale row also shows its realized gain/loss as a percentage and the average cost (PMC) at the moment of that sale. A sale shows an estimated realized-P&L preview before you confirm. For tracked investments, quantity and average cost are managed through the register, so editing an asset can never overwrite its cost basis. The register also powers "Capitale investito" and "Plusvalenze realizzate" on Performance and the total-return breakdown on Dividends (see below)
- **Fondo Pensione (Previdenza)**: track your Italian complementary pension as a manually-valued asset — no ticker, valued from your statement, with its own equity/bond mix. The Previdenza page (redesigned 2026-08-26) opens with a one-sentence verdict on whether the fund is working — "Il fondo sta lavorando." / "Il fondo ha perso terreno." / "Il rendimento del fondo non è misurabile." — followed, for each contributor, by the three causes of growth as three numbers: what the market returned on the trusted window (a TWR, net of contributions), what the employer added in the year and what the tax office gives back; a cause with nothing behind it drops its clause, and a return that cannot be measured is said as such instead of a percentage. Then five tiles: the fund today (its live value, this month's market effect — the same figure the Overview's digest prints — everything ever paid in, the value series closed on today's value), the return (TWR, annualised, market gain, the return on your own capital with the employer's share kept apart — employer contributions are pay, not investment return), the fiscal year (what was deducted against the ceiling, the estimated IRPEF saving, the "extra-deducibilità" plafond if you're eligible), the year's contributions by nature and the ledger of the year with a two-click delete that reverses the contribution's effect. The fiscal year sits beside the verdict and drives the annual tiles; the fund's value and its return keep their own windows. Contributions are TFR, employer, or a voluntary payment debited from a linked cash account; an existing tracked investment can be converted into a pension fund without losing its value or history. If you track more than one person's pension fund in the same account (e.g. both spouses), add each as a family member in Settings — the verdict, the return and the tax-saving estimate are computed once per person against their own funds and income, never mixed. Your pension fund counts toward your true asset-class exposure on Allocazione (it's locked, not tradable, so no plan ever buys or sells it) and has its own Previdenza tile there; Storico shows it as a dedicated "Previdenza" band; and Performance metrics exclude it by default, since it's capital fed by contributions rather than market activity. Pick the month your contributions became fully recorded in Settings; before it, contributions and growth are indistinguishable and no return is shown. One thing to know: a contribution is attributed to the month you record it, so if your fund credits contributions with a lag and you copy its value from the website every month, the month you record reads the market a little low and the month the fund credits it a little high — the window's total is right as soon as the fund credits it and you update the value.
- Current vs target asset allocation visualization
- **Automatic Azioni/Obbligazioni targets** (opt-in, Settings → Allocazione): enter your age and the risk-free rate and The Bull's rule of thumb (`125 − age − rate × 5`) sets the equity share. Obbligazioni take the formula's residual and stay there; every other class you allocate — materie prime, crypto, immobili, trend following, carry — is funded out of the Azioni side, so a satellite sleeve never eats into the defensive part of the portfolio. The summary line states all three figures, and the targets always total 100%
- Asset allocation as a verdict over tiles (redesigned 2026-08-25): the page opens with one sentence — "Allineato al 96%." — followed by the facts in words (which classes drift and by how many points, the leverage against its target when there is one, and where the next 1000 € would go), then a grid of tiles. **Bilanciamento**: the band-independent balance score as a ring, the share out of position, the classes off target under the drift threshold you pick right there (±2% / ±5% / the 5/25 rule / custom — it reclassifies the chips, never the score), the current mix over the target mix as two bars on one legend, and what the total holds but cannot move and what it leaves out. **Piano**: **Ribilancia** (a consolidated trade list, how much to buy/trim per class), **Versa** (a no-sell contribution planner: where new cash goes, drilling class → sub-category → the individual instrument to buy, following your specific-asset targets) and **Preleva** (the decumulation mirror: "I need €X, what do I sell?" — it draws first from whatever sits *above* target, down to the instrument and the position you'll be left holding) behind one switch, the amount shared with the verdict. **Per classe**: every class on one line — current and target share, the gap in euro, a tick that shows where it sits — with sub-categories and theoretical specific-asset targets inline; a sub-category is optional on an asset, and inside a class where you set sub-category targets whatever carries none is listed last as "Senza sottocategoria" — its value still counts in the class, it simply has no target of its own: no gap, no COMPRA/VENDI chip, and the contribution plan never sends new money there (a withdrawal can still draw from it pro-rata, like any untargeted sleeve). Then **Esposizione** and **Previdenza**, and the non-tradable and the excluded holdings below behind a "Dettaglio" disclosure. COMPRA / VENDI / OK action chips; colors follow the selected theme
- **Per-asset allocation roles** — not all wealth can be traded in slices, and the allocation math now knows it. Each asset is **Ribilanciabile** (normal), **Non negoziabile** (a locked pension fund or private equity: it *is* invested wealth, so it counts in your percentages and your true equity/bond exposure is right — but no plan ever buys or sells it, and the plans instead reach your target by moving what you can move), or **Escluso dall'allocazione** (the home you live in: not an investment, so it leaves the page entirely). Plans only ever propose amounts you can actually execute — a sell is capped at your tradable holdings — and the page flags any target left stranded with nothing tradable behind it
- **Leveraged & composite ETFs**: set a leverage multiplier on an ETF (e.g. 2 for a 2x fund) and the allocation page reasons about your *notional exposure* — the real risk you carry — not just market value. When you hold leverage, the verdict and the Bilanciamento tile state the current leverage against the target one, the composition bar's labels sum to your leverage, and your per-class targets in Settings can sum above 100% to express a target leverage (shown as e.g. "Leva target 1,50×"). The Ribilancia / Versa / Preleva plans then reason over your actual instruments — buying €1 of a 2x fund moves more than €1 of exposure — instead of assuming plain purchases. With no leverage anywhere, everything looks exactly as before
- **Portfolio exposure breakdown**: an Esposizione tile on the Allocation page that aggregates underlying-company, sector, and ETF-issuer exposure across all your ETFs plus direct stocks — the six heaviest as ranked rows closed by the rest of the portfolio, with a one-line reading that names the heaviest holding, the first sector and the biggest issuer. See your true exposure to a single company (e.g. Nvidia) when it's split across multiple ETFs: tap a row to see the instruments behind it with the formula per source ("X% di €Y = €Z") and a total. Data sourced server-side from Yahoo Finance and cached per user for 24 hours; the "Aggiorna" button forces a fresh server-side computation when needed
- Current-year historical tables use a hidden previous-month baseline so January can show growth vs the previous December without rendering an extra visible column
- **Patrimonio** opens with a one-sentence verdict on your portfolio — "Il portafoglio cresce." / "Il portafoglio è in calo: il mercato ha pesato." — followed by the facts in words (value, change over last month, how many instruments and accounts you hold, and the single instrument that moved the most), then a grid of tiles: net worth with trend and a per-instrument market digest, your cash accounts one per row, this month's buys and sells from the operations register, the asset-class mix, your unrealized gain with the best and worst positions, and the instruments table — still a real management table with column sorting (Valore, G/P, Peso, Nome, Classe), a group-by-class toggle, the ticker under each name and the Δ month / YTD / since-start columns behind an "Andamento" toggle. Those Δ columns measure the **unit price** of each position (in EUR, real estate gross of any mortgage), never its total value, so buying more of something never reads as performance; pension funds and cash accounts, whose quantity *is* the value, show "—". On the phone the instruments are flat rows that expand in place on the details, the price trend and the actions
- Holdings with **no market quote** — cash accounts, real estate, private equity and pension funds, plus anything you've switched off automatic updates for — carry a subtle row (and card) tint, so you can tell at a glance which values you're responsible for keeping up to date. It marks manual pricing, not illiquidity

### Performance Analytics
- **Rendimenti** opens with a one-sentence verdict — "Nell'ultimo anno il portafoglio rende più del 60/40." / "…rende, ma il rischio pesa." / "…perde." — followed by the facts in words (the TWR, the gap against the 60/40 in points, the Sharpe, the deepest drawdown with its month and how long it took to recover, how many months were positive) and the measured basis named under it, then a grid of tiles: the return with the growth of 100 € against the 60/40; volatility, Sharpe, Sortino and the max drawdown with its months; the heatmap of monthly returns; the capital invested through the register beside the net contributions from the cashflow; the six model portfolios ranked in EUR; realized gains per fiscal year; and the invested base under the net worth. The fifteen metrics, the rolling charts, the underwater chart and the method sit below behind a "Dettaglio" disclosure, with metric definitions in inline popovers
- The verdict names the window actually measured ("Negli ultimi 11 mesi" when a year finds eleven monthly snapshots, "Da aprile" for a year-to-date that starts there) and every gap beside a figure is on that figure's basis; the period selector (YTD / 1 anno / 3 anni / 5 anni / Storico) sits beside the verdict, and a custom date range is a dismissible chip under it, never a tab that looks disabled
- Yield on Cost (YOC) and Current Yield calculations
- Monthly returns heatmap in the app's sign colours (three intensities, so it follows all six themes) and underwater drawdown chart. Both read the same series: the max drawdown, its duration, its recovery and the Underwater chart all chain the monthly returns shown in the heatmap, so the chart is exactly the compounding of the months above it and the percentages don't shift as your contributions accumulate
- **Configurable calculation basis** (Settings → Preferenze): performance metrics measure the portfolio you actively manage, so pension funds and assets excluded from your allocation (typically your home) are left out by default — either can be brought back in, and the page states which basis it is using. Leaving a hand-valued property out raises measured volatility and lowers Sharpe, because a value that never moves between updates quietly damps your measured risk
- **Honest measurement rules**: the first snapshot of a period is the starting valuation, so the measured window opens the month after it and your first month's savings are never counted as return; below six months the headline states the *period* return instead of an annualized one (extrapolating a year from two months is a forecast, not a measurement); volatility and Sharpe show "—" rather than a number when fewer than three monthly returns are available, and they include every month — no hidden outlier filter that would let a real crash disappear from the metric meant to report it. The Money-Weighted Return (IRR) treats contributions as money paid in, discounted over the time it was actually invested
- **Capitale e mercato**: one area (the capital that entered the portfolio — your net worth at the start of the period plus net contributions) under the net-worth line; the gap between the two is what the market produced, and hovering a month reads its net worth, invested base and market return. Contributions can legitimately go negative in a window where tracked spending outpaces tracked income, and the chart shows that honestly instead of hiding it
- Rolling 12-month CAGR and Sharpe Ratio charts with 3-month moving average; always visible with an informative empty state when data is insufficient
- **Benchmark comparison**: your portfolio against six model portfolios (60/40, All Weather, Buffett 90/10, Golden Butterfly, Permanent Portfolio, 100% ACWI), each annualised over the same months as your TWR up to its own last available month and always converted to EUR (monthly rates via Frankfurter API), ranked with the gap in points; the growth of 100 € against the 60/40 is drawn in the return tile
- The hero return counts up on load; period changes settle without replaying every animation
- **Capitale investito**: alongside the existing "Contributi netti" (external savings estimated from expense tracking), a companion figure shows what you actually bought minus sold through the operations register in the selected period — an info popover explains why the two numbers measure different things and will not match. **Plusvalenze realizzate**: a per-fiscal-year breakdown of realized gains/losses closed through the operations register, across all tracked investments
- Dashboard KPI cards (Total Portfolio, Liquid Net Worth, Unrealized Gains, Taxes) animate their values on page load — numbers count up from zero once on mount; each card animates independently so the rest of the page stays stable during the animation
- Dashboard hero trend chart has a period selector (3M / 6M / YTD / 1Y / 3Y / All — All is the whole snapshot history), a hover reading of each month's value on desktop, an all-time-high badge when your net worth reaches a new peak, and a "driven by" line showing which asset classes moved the most this month; a featured progress bar for your most relevant active goal appears alongside it when Goal-Based Investing is enabled
- All major pages animate on load with staggered card entrances and smooth expand/collapse transitions; respects system "Reduce Motion" preference
- All charts animate on load: bars grow up from baseline, lines draw in left to right, area fills expand, ranked composition bars grow to width — covers every page with data visualization (History, Performance, Cashflow, Dividends, FIRE, Monte Carlo, Goals)
- AI-powered analysis using Claude with Extended Thinking and web search
- **AI Assistant** in the same shape as the rest of the app: it opens with a one-sentence verdict on the numbers the assistant will answer on — "Luglio è andato bene.", "Il 2026 finora va bene.", "Di luglio conosco solo il cashflow." — for the period chosen on the **period axis** beside it (Month, Year, YTD, Total history, or Libera for a free question, with the month or year picker right there); a free question with no period reads the Overview's own verdict on today's numbers. Under it the conversation is a tile — the suggested questions as rows to start, the thread as flat messages, the follow-ups as rows — beside a sticky companion of tiles showing the period's net worth with its change and where it started, its cashflow, and what the assistant knows about you, all *before* you ask; in Libera mode you can optionally attach any period as context. After each answer the assistant proposes **follow-up questions** you can send with one tap. It remembers goals, preferences, risk profile, and stable facts across conversations — shown in the "Cosa sa di te" tile and managed in a Memory panel of two tiles (goals with what each measures and its daily check, facts) — and surfaces a **proactive "goal reached" tile** when it detects from your data that a tracked target has been met. An "Allocazione vs target" suggested question triggers an instant allocation-vs-target comparison with purchase priorities. On the spending side it receives an **exhaustive breakdown** of the selected period — every category with every sub-category used, each with its share of total spending, alongside spending by type (fixed / variable / debt) and income by category — so "how much did I spend on utilities inside Home last year?" is answered from data rather than refused. It also sees your full category/sub-category taxonomy, including categories with no activity, so it can suggest where to file a new expense or whether a new category is warranted. Conversations and Memory open as side panels on every screen size; responses stream as markdown (including tables) with full thread continuity. It also reads your **Goal-Based Investing goals** — assigned value, target, deadline, priority, suggested mix, and whether the current pace reaches the target, including the monthly contribution needed to close the gap and the value projected at the deadline (both labelled as projections, with the return they assume) — and when goal-driven allocation is on it reasons about the targets derived from those goals rather than the manual ones the app has stopped using. It can also **propose** a new goal: the reply renders as a card with the proposed name, target, deadline, priority and allocation, and nothing is saved until you press Conferma — the assistant never creates, edits or deletes a goal by itself. Web search for macro/geopolitical context (with a dedicated "searching the web" indicator and event citation) and behaviour preferences (response style, web context, automatic memory) in one place; a "Come funziona" disclosure below the conversation explains the periods, the web search and the memory. Runs on Claude Sonnet 5. Controlled rollout via feature flag.
- Fully responsive on mobile and tablet: the period selector and the two actions sit under the verdict as full-width touch targets, tiles stack in one column, the heatmap reads on hover with a mouse and through its cells' titles on touch

### Cashflow
- **Tracciamento answers before it lists** — the tab opens with a one-sentence verdict on the period you picked ("Agosto sta andando bene." / "Agosto tiene, ma con poco margine." / "Ad agosto hai speso più di quanto è entrato."), followed by the facts in words — how much you set aside, income, spending, how spending moved against the previous month — and then a grid of tiles: the period's three figures with a six-month income-vs-spending chart and, while the month is running, where spending lands at the current pace (what you have spent so far, paced, plus what is already scheduled); spending and income by category with a reading of where the money concentrates and the residual row so the list adds up; your savings rate over the last twelve months with the average, the best and the worst closed month; and the transaction feed as the last tile, with its count and a reading of what it holds. One period picker, beside the verdict, drives everything — a closed month reads in the past tense, a year still running is compared with the same months of the previous year — while the transaction filters narrow only the list. **A period covers its whole calendar span**: "Quest'anno" is January to December even in August, so instalments and recurring entries you have already created are counted and listed rather than hidden — and because they have not happened yet, the verdict closes by naming how much of the figure it just printed is only booked ahead ("Nel totale ci sono ancora 450 € di spese già in calendario da qui a fine anno"), each such row is tagged "In calendario" and loses its red/green colour, and the months not yet started are drawn lighter in the chart. "Da inizio anno" is the shortcut next to it for the window that runs from January to the end of the current month — so it carries what is already scheduled inside this month, and nothing of the months after it. With a mouse, the charts read the month under the pointer
- Income, expense, and transfer tracking with custom categories and subcategories. Adding an entry **starts with the type** — Variable, Fixed, Debt/Installment, Income, or **Transfer** (move money between your own cash accounts) — picked from labelled cards, the same two-step flow as adding an investment in Patrimonio; the form that follows is titled and filtered for that choice, with advanced options (cost center, installments, recurrence) in a collapsible section. **Recurrence** is available on all three spending types — Fixed, Variable and Debt — and repeats **monthly or yearly**: a switch plus a Mensile | Annuale selector, a count that asks for months or years to match, and a line stating exactly how many entries will be created and the dates they will span before you save (up to 30 years of monthly payments, or 40 yearly ones). This is what lets a 17-year insurance premium or an annual subscription be projected forward the way a loan instalment always could. Income and transfers cannot recur — a transfer moves two accounts at once, and each occurrence would need its own pair of balance corrections. The whole series is created up front as real dated entries sharing a parent id, so it shows up in Cashflow and Analisi immediately and can be deleted in one action. Editing an existing entry skips the picker and keeps the type as a field inside the form, where the note explaining what a type change does to your balances lives. Transfers are net-zero: they debit the origin account and credit the destination automatically, and are excluded from all income/expense/savings/budget and performance metrics
- **The type of a saved entry can be changed** across all five types, transfers included: the category re-attaches itself to the same-named one under the new type, the amount's sign and every linked account balance are corrected automatically (converting a transfer away reverses it on both accounts; converting an entry into a transfer asks for the destination account), and an inline note states what will change before you save. Bulk re-typing a whole category across the transfer boundary is refused instead — each row touches two accounts, so only the per-entry dialog can do it safely
- **Categories are identified by document, not by name**, so the same name can live under two types (a "Casa" under Fixed and another under Variable) without their figures merging anywhere in the app — Analisi, Overview top-5, trend charts, cost centers, PDF export, periodic emails and the CSV importer all key by document. Where two do share a name, charts and lists spell out which is which — "Casa (Spese Fisse)" / "Casa (Spese Variabili)" — and leave unambiguous names alone
- **Analisi page** (`/dashboard/analisi`): opens with a one-sentence **verdict** on where the money goes and what changed — "Nel 2026 spendi più dell'anno scorso." followed by the facts (the total, the change against the same window of last year, the heaviest category and its share, the category that moved the most, the categories out of scale this month) — over a grid of tiles: the period's three figures with year-over-year pacing and spending per month beside last year's; the categories out of scale this month; the largest single expenses; spending and income by category as the full, clickable lists; and the **5-layer Sankey** flow. Every category and sub-category is a first-class object: click it anywhere — a category row, an anomaly, a top expense, a Sankey node, a comparison row, or the **"Vai a categoria…" search** (which also reaches entities with no spending in the period) — and its **Scheda** opens as a tile under the lists: the period total with its shares, a **per-year table with signed year-over-year deltas** (the current year compared like-for-like against the same months of last year) whose rows **open on the change per sub-category**, a 24-month trend with last year's dashed baseline, and the sub-categories or the underlying transactions. The focused entity lives in the page link and survives period switches. The four-state period selector (year to date / current year / past year + optional month / full history) sits beside the verdict — "Da inizio anno" stops at the end of the current month while "Anno corrente" covers January to December, so a purchase you split into instalments is visible in the year that holds it and the verdict says how much of that year has not happened yet; the verdict and the Confronto compare each window against the matching one a year earlier — "Anno corrente" against the whole of last year, "Da inizio anno" against its same months (the Scheda's per-year table keeps its own same-months rule, and says so); the year-over-year **Confronto** (selectable comparison year, a per-category delta ranking with "Nuova"/"Cessata" categories) and the long-term trends sit below the tiles behind two disclosures. All windows are declared next to their figures, and every chart respects the "history start year" preference from Settings
- **Budget tab**: opens with a one-sentence verdict on the month — "Il budget di agosto tiene." / "Agosto rischia di sforare il tetto." / "Ad agosto hai superato il tetto." — followed by the facts in words (days left, share of the ceiling used, where the month lands at the current pace and by how much, and **when** the ceiling was or will be crossed: "Lo hai superato il 22", "superando il tetto il 29"), then a grid of tiles: the ceiling with a mark for "today" on its bar, the month-end figure, what is left per day (or, once over, by how much and since when, and your real daily pace against the ceiling's), the last six months each against **the ceiling it had** (recorded daily by the scheduled job); the categories at risk of going over by month end; the thresholds you actually crossed; your annual budgets read against the year; and every budget you set with its bar and month-end figure. Budgets are yours to create — per category, sub-category or type, **monthly or annual** (year-to-date), plus income targets — with an optional **overall** monthly ceiling on all spending; changes **auto-save** as you type, paused while the category budgets exceed the ceiling. A budget on a fixed category (rent, subscriptions, instalments) is never projected by the day. Threshold alerts (50/75/90/100%) also reach your emails. Fully responsive on mobile
- **Cost Centers tab** (opt-in): group expenses by object or project (e.g. "Automobile Dacia"). The tab opens with a one-sentence verdict on your projects — "Automobile è il centro più caro." / "Automobile rischia di sforare il tetto di agosto." / "Casa al mare ha superato il tetto del 2026." — then a grid of tiles: the whole cost with this year, last year, the monthly average and the last twelve months as bars **stacked by center**; every center ranked by its cost with its count, last expense and where it stands against its ceiling; the centers **idle for more than 90 days**; and the archived ones below, out of the total. There is **no period selector**: a project's cost is its whole cost, and the few figures on another window say which ("quest'anno", "ultimi 12 mesi", "Tetto mensile · agosto" with a mark for today). A center's detail is the same shape on that center — verdict with the Modifica/Archivia/Elimina actions beside it, its cost with the ceiling's bar, month-end and year-end figures at the current pace (never for an idle or archived center), the breakdown by category and by subcategory (tap one to read the cost **net of it**), its lifecycle dates, and every linked movement with the scheduled ones marked "in calendario". Optional per-center **spending ceiling** (monthly or annual, read exactly like the Budget page's, crossing day included), and **archive/restore** for finished centers — deleting one keeps its expenses, they only lose the tag
- Bulk move transactions between categories/subcategories (cross-type supported)
- CSV export
- **CSV import** (Settings → Spese): migrate historical income/expense data from a CSV file (Italian or English headers, `;`/`,`/tab delimiter, IT or EN number/date formats). Categories resolve by **(name, type)** — same-named categories of different types import side by side, a row without a type inherits the single existing namesake's type, and duplicates sharing both name and type attach to the oldest one with a note in the preview. Shows a full preview — valid rows, discarded rows with a reason, categories/subcategories that will be created, disclosures — before anything is written, and the whole import can be undone in one tap. Transfers aren't supported (a transfer needs origin/destination accounts a historical row can't provide) and account balances are never touched by the import

### Dividends
- **Dividendi answers before it lists** — the tab opens with a one-sentence verdict on your dividend income ("Il flusso di dividendi cresce." / "…tiene." / "…è in calo."), followed by the facts in words — what you cashed in the period, how it moved against the comparable window before it, from how many instruments, what the portfolio yields on your cost, and which payment comes next — and then a grid of tiles: net income with the month-by-month shape and the next payments; how reliable the income is (how many months actually paid, and how much of it hangs on one payer); yield on cost against yield on today's price; who pays you most; what each year brought; and the payments themselves, as a table or a calendar, as the last tile. One period selector (Mese / Anno / 12 mesi / Storico), beside the verdict, drives everything; the instrument and type filters narrow only the payments list
- **Received and announced are never one figure.** A payment with a future date is a promise, not income: the table prints two totals instead of one, the calendar greys it and says how much of the month is cashed and how much is still expected, and every sentence counts the two apart. Announced payments are bounded by the period too — a coupon due later this month belongs to "Mese", one due in December to "Anno", a final premium years away only to "Storico"
- Multi-currency dividend recording with automatic EUR conversion
- Borsa Italiana scraping for Italian market data (dividends and bond prices)
- Monthly calendar view; clicking a day opens that day's payments with its own received/expected subtotals. Month navigation is bounded by the selected period — with "Mese" the arrows are gone, since the period selector *is* that control
- **Yield**: yield on cost gross **and net**, against the yield on today's market price, plus median year-over-year DPS growth. Every figure here is measured on the trailing twelve months of what you currently hold, whatever period is selected — the tile says so rather than appearing to follow the axis
- **Total Return per Asset** and **Dividend Per Share Growth** live in a "Dettaglio" section under the grid. Total Return combines capital gain % and all-time net dividends received % (calculated at historical cost basis per payment, not diluted by later purchases) to show the true investment return per asset; for investments tracked in the operations register the capital-gain figure comes from your real buy/sell history — including fully-sold positions, shown with a "Chiusa" badge, and partial sells. DPS Growth is the year-by-year gross DPS history per equity asset with YoY% and CAGR columns, YoY and CAGR stopping at the last closed year; tap any asset on mobile for a vertical year-by-year dialog

### Historical Analysis
- Automatic monthly portfolio snapshots (via Vercel cron)
- **Storico answers before it charts** — the page opens with a one-sentence verdict on your whole history ("Il patrimonio è cresciuto, e sta accelerando." / "…cresce al ritmo di sempre." / "…è cresciuto, ma ha rallentato." / "…ma nell'ultimo anno ha perso."), followed by the facts in words: how much your wealth grew since the first snapshot and at what yearly rate — contributions included, and the sentence says so, because this is wealth growth and not the investment return Rendimenti measures — your best month, your last doubling, and how the last twelve months compare with your lifetime average. Then a grid of tiles, each with its own one-line reading
- **Evoluzione**: today's value, three chips (growth since the first snapshot, the wealth CAGR named as "versamenti inclusi", the last twelve months) and the net-worth series with your notes as markers on the line — hover a month for its value, its change on the month before and its note; colors theme-aware across the six color themes
- **Raddoppi** — doubling time analysis with geometric calculations and fixed milestone thresholds: the completed doublings as rows, the one in progress with its track, and the next one projected at the same pace the verdict judges you by (the average monthly increase of the last twelve months, in euro, linear on purpose); the mode toggle sits in the tile's corner
- **Composizione**: one tile answering how your wealth is split, on two cuts of the same euro — **Asset class** or **Liquid vs illiquid** — chosen with a single toggle. A 100%-stacked area shows how the mix drifted month by month (band thickness *is* the share, so the flat top edge is a permanent check that the parts add up), with a ranked breakdown underneath giving each class its value in euro, its share, and how that share moved against the same month a year earlier. Hovering a month opens that month's balance sheet. Anything the monthly snapshots cannot attribute to a class is labelled "Non attribuito" rather than quietly dropped. Each snapshot also records how your pension funds were split across asset classes that month, so the Previdenza band is separated from Azioni/Obbligazioni using the split that was true at the time; months recorded before this fall back to your fund's current split, and the note on the tile says from which month the figure is measured rather than estimated
- **Driver della crescita**: for every year since your cashflow is complete, how much of the year's growth came from saving (income minus spending) and how much from the market, with the last twelve months as bars; a year in which the market took is said in words, never as a share
- **Valore per strumento**: pick any recorded month to see each holding's value that month (read straight from the saved snapshot, so currency/real-estate/price rules are already applied), its share, and its change on the previous month split into a **price effect** (market movement) and a **quantity effect** (your buys, sells and deposits); tick instruments to total them and chart that subset's combined value across every month on record
- A "Dettaglio" section under the tiles keeps the year-over-year variation, savings vs market month by month over the whole history, the **Labor & Investments** recap (earned from work, saved from work, investment growth gross and net of estimated taxes, plus the monthly chart — with a setup prompt linking to Settings when labor categories are not yet configured) and your notes

### FIRE Planning
- **FIRE calculator as a verdict over tiles** — the tab opens with one rule-generated sentence that answers "when?": "FIRE nel 2032, a 44 anni." followed by the facts in words (the gap to the FIRE number, the monthly pace, the year and the age, and the passive income the plan lands on in both moneys — "2300 € al mese di oggi, 2667 € del 2032 con l'inflazione al 2,5%" — plus the pension capital locked and its unlock year when the bridge model is on; "Sei già FIRE.", "FIRE oltre i 50 anni." and, when an input is missing, "Numero FIRE non calcolabile." / "Nessun patrimonio FIRE." are the other verdicts). Under it a 12-column grid: **Traguardo** (the FIRE number as the hero figure, the "% verso FI" chip over a 3px track, and the projection filling the tile in one of two views switched by the tile's own Scenari | Ventaglio toggle), **Base di calcolo** (the net worth the page runs on, the expenses and savings of the cashflow year it names, the SWR — and the pension-lock switch, which saves on change), **Reddito passivo** (annual / monthly / daily at the SWR, the years of expenses covered with the liquid and illiquid split, the current withdrawal rate against the safe one) and **Scenari** (Orso · Base · Toro as rows with their parameters and their FIRE year). The FIRE number, the verdict and the chart share ONE expense figure: the last full year's, or the running year annualized and said so
- Settings (withdrawal rate, primary residence, INPS age and the RITA hypothesis) and the three scenarios' growth and inflation live below the grid in a "Parametri" disclosure that opens by itself only until an SWR is saved, or when an edit is unsaved; the historical FIRE runway, the cashflow-vs-passive-income history and the explainer sit in a "Dettaglio" disclosure
- **Projection with two views, switched inside the Traguardo tile**: *Scenari* is the deterministic Bear/Base/Bull chart (three portfolio series plus a single dashed base-scenario FIRE target — Bear/Bull targets in the tooltip, which also names the pension-unlock step); *Ventaglio* is a Monte Carlo fan of the accumulation phase — 1,000 simulated paths with 10–90 and 25–75 percentile bands, the median, ~40 sample paths and the moving FIRE target — and the tile's footer states the cumulative probability of reaching FIRE by the projected year. Market returns and volatility are derived from your real portfolio allocation
- **Coast FIRE tab** — the same verdict-over-tiles shape as the calculator, on one question: "can I stop contributing?". It opens with a one-sentence verdict — "Non ancora: continua a versare." / "Sì, puoi smettere di versare." — followed by the facts in words: how much is missing to today's Coast FIRE number, what your current patrimonio becomes at the target age with no further contributions against what is required there, the state pensions' share of your expenses (net, in today's money, from their start dates) and, with the bridge model on, the pension fund that stays locked and counts in neither figure. Then three tiles: the target (the shortfall as the headline figure, the progress chip and track, the liquid-only read, and the Bear/Base/Bull projection with the required capital as a dashed line that steps when the fund re-enters — the tooltip names the step); the inflows the calculation already discounts (your pension fund's unlock year and each state pension's start date, every amount at today's value); and the three scenarios as rows, each with its own Coast number. Below, an "Ipotesi" disclosure holds the settings as four tiles with one save (ages, custom expenses, state pensions, IRPEF brackets, the model in four steps — open by itself until an age is saved), and a "Dettaglio" disclosure the coverage phases, the target-age need beside the steady state, the per-pension impact from gross nominal to net real, and how to read it. All chart colors theme-aware
- Coast FIRE supports one or more state pensions with editable IRPEF brackets, exact pension start dates, scenario-specific real net conversion, a guided summary that separates target-age need, bridge years, and post-pension steady state
- Multi-scenario projections (Bear / Base / Bull) with inflation adjustment
- Per-scenario FIRE numbers with automatic savings stop at FIRE reached
- Historical FIRE runway view with rolling 12-month expenses and separate total/liquid deltas
- **What If Analysis tab** — stress-test your plan against life events (job loss, major purchase, savings/spending change, windfall). It opens with a one-sentence verdict whose tone follows the delta in years ("Il FIRE slitta di 1 anno.") and names what the event does to your patrimonio, your FIRE number, your FIRE year, your passive income and your Coast FIRE plan; then four tiles — the two projections drawn over each other (today's plan as a neutral baseline, with both capitals read at today's FIRE year), every figure as a before → after row with its signed change, the event form (which income sources stop, and how the hit splits between forgone savings and expenses drawn from the portfolio), and the sensitivity matrix of years-to-FIRE by expenses × savings on today's plan. The pension bridge of the calculator applies here too, so "before" agrees with the calculator's year.
- **Goal-Based Investing (FIRE › Obiettivi)**: allocate portfolio portions to financial goals (house, retirement, emergency fund, etc.). The tab opens with a one-sentence verdict on whether you are on track — "Sei in rotta su ogni obiettivo." / "Un obiettivo su tre è in ritardo." — followed by a clause per goal (the extra monthly pace a late goal needs by its deadline, the deadline of the ones on track, the arrival of the undated, the reached). Then five tiles: every goal as a row in urgency order with its progress, what is missing, the deadline, the priority and an "In rotta / In ritardo / Raggiunto" tag (tap a row to select it); the selected goal's trajectory — the value it reaches at its deadline, the pace paid and the pace required, the months left, the expected return inferred from its recommended asset mix, and the glide-path chart — with edit and delete beside it; the milestones (the order goals will be reached at today's pace, a late goal dated at its real arrival with the months past its deadline); the allocation the goals derive beside the one your quotas hold (with Goal-Driven Allocation on); and the quotas grouped by goal beside the instruments that still have free value, closed by the unassigned total. A "Dettaglio" disclosure splits a new deposit across under-funded goals by gap × priority and explains the calculation. The AI Assistant can discuss these goals and propose new ones, which are created only on your explicit confirmation
- **Goal-Driven Allocation**: optionally derive portfolio allocation targets as a weighted average of goal recommended allocations, with automatic fallback to manual targets
- Fully responsive on mobile and tablet — tab navigation uses a dropdown on small screens

### Monte Carlo Simulations
- Opens with a one-sentence verdict on how likely the plan is to hold — "Il piano regge nell'84,2% dei casi." (green from 90%, amber from 80%, red below) — followed by the facts in words: the share of simulations in which the capital lasts to your age at the end of the horizon, what the median case closes with, the year the worst tenth runs out, how the bear and bull scenarios fare, and the pension fund that re-enters at its unlock when the bridge model is on
- One run is the three scenarios (Bear / Base / Bull) on the same plan, and the base scenario is what the verdict reads. The simulation runs by itself when the tab opens — on your portfolio's allocation normalized to the four classes (crypto and cash excluded), your net worth net of any locked pension fund and your planned annual expenses — and afterwards on "Esegui simulazione"; until you press it, the Parametri tile says the figures still belong to the last run
- Four tiles: the probability as the hero figure with the failures, the median failure year and the survivors, over the fan of the base scenario (10–90 and 25–75 bands, the median line, the capital exhausted as a dashed line); the final values as three percentiles and a ten-bin histogram, the median's bin outlined and the last bin taking the tail past the 95th percentile; the three scenarios as rows, each with its probability, its median final value and the year its worst tenth runs out; and the plan itself — starting capital with "Totale / Liquido" shortcuts, horizon, withdrawal, simulation count, the four-class allocation and the three scenarios' returns, volatilities and inflation, saved to Firestore per user
- A "Dettaglio" disclosure below the tiles holds the three medians drawn over each other, the base scenario's percentiles every five years and an explainer of the method and its limits
- All chart colours and tooltips theme-aware across the six colour themes; fully responsive — at 390px the tiles stack with the plan last and the percentile table scrolls inside its tile

### Other
- **Navigation shell** — A quiet frame built so the page's verdict is the first thing you read: a one-line page header (section · title · date), a desktop sidebar with three route groups under small uppercase labels, the AI assistant as a plain route, and an icon rail with 44px targets when collapsed; on the phone a floating bottom pill with the three primary routes and an "Altro" drawer listing Analisi and Pianificazione; in landscape on tablets a top bar opens the same navigation as a sheet
- **Periodic email summaries with AI commentary** — Automatic portfolio recap emails sent at the end of each month, quarter (March/June/September/December), **half-year (June 30 / December 31)**, and year (December 31), each with its own toggle. Emails include net worth change vs the previous period, asset class breakdown with allocation %, best/worst performing asset class (by Δ% and Δ€), income vs expenses with savings rate, full income and expense category breakdowns, top 5 individual expense transactions, dividends received, and a **Confronti** table comparing net worth, income, expenses, and savings against both the previous period and the same period one year earlier (net worth from end-of-period snapshots, cashflow from period totals). The AI-generated narrative is structured in six sections (overview, patrimony and investments, vs previous period, vs same period last year, income/expense changes with likely causes, takeaways) and reads the **same complete data the in-app Assistant does**: your full category → subcategory spending tree, income by category, current allocation with targets and gaps, your investment goals, plus the budget alerts of the month and an already-calculated split between what you saved and what the market moved. Its length scales with the period (500 words monthly, 700 quarterly and half-year, 900 yearly). Web search for macro context follows your Assistant preference — enable "contesto macro" if you want market events cited. Recipients shared across all email types; manual send buttons in Settings for on-demand previews. A separate opt-in **weekly budget email** is sent every Sunday with the status and progress of all your monthly and annual budgets plus a one-line AI summary; any category that has actually gone over its limit also lists the individual expenses behind the overrun (date, subcategory, note, amount). Powered by [Resend](https://resend.com) (free tier sufficient for personal use)
- **Public demo mode** — "Try the Demo" button on the login page and landing page auto-logs visitors into a shared read-only account. All mutation actions are disabled; the AI Assistant is fully blocked. Set `NEXT_PUBLIC_DEMO_*` env vars to enable; leave them empty to hide the CTA on self-hosted deploys
- **Color Themes** — Six selectable color themes (Default, Solar Dusk, Elegant Luxury, Midnight Bloom, Cyberpunk, Retro Arcade) with per-user persistence in Firestore and localStorage. Theme selector in Settings → Aspetto with light/dark preview swatches. Switching dark/light mode plays a circle-reveal animation from the toggle. Charts update their palette to match the active theme
- **Dark mode** — Full dark/light/system theme support. The header toggle cycles through three states: Light, Dark, and System (follows OS preference), using Sun, Moon, and Monitor icons. The same toggle is available on the public landing, login, and registration pages, so visitors can pick their mode before signing in. Every page, chart tooltip, and UI component is properly themed
- **Authentication flow** — Login and registration take the dashboard's own shape, scaled to what they are: one column with the sentence the app is about ("Il tuo patrimonio, spiegato prima che misurato.") and one card. The card's first line is also its status line — what the form wants, then what it is doing, then how it went — so there is no second feedback paragraph under the button. Errors are written in Italian rather than relayed from Firebase ("Email o password non corretti." instead of "Firebase: Error (auth/invalid-credential)."), and a cause the app does not recognise gets a plain sentence instead of the English one. On Register, the sentence states the access rule before you type — including "La registrazione è riservata alle email autorizzate" when the invite list is on, and a closed-registration page that offers the sign-in link instead of a form — and the two password rules ("Almeno 6 caratteri", "Le due password coincidono") are rows that tick as you type. Standard 36px fields with the app's focus ring, a "Mostra / Nascondi" word instead of an eye icon, 44px targets on phones, and `autoComplete` hints for browsers and password managers
- **Hall of Fame** — Your personal records, opened by a one-sentence verdict on the best month you ever had and where the running month and year stand among them. No period selector: a record is a position, not a period. Five tiles — the best months for net worth (with the twelve record months drawn in the order they happened, and the worst month underneath), the months with the most income, the months you kept the most of it (income minus expenses, only where income was recorded), the years, and the notes you filed on your own records. The full ranking — twenty months or ten years, for growth, decline, income, spending or saving — sits below behind a «Dettaglio» disclosure with its own switcher; a note survives the ranking it was written for
- **PDF Export** — 7 configurable sections with custom year/month period selection; sections auto-disabled for past periods when historical data is unavailable
- **Settings** — Every group of settings is a tile that says, in one line, what it is currently doing and what that changes elsewhere ("Base gestita: fondi pensione e asset esclusi restano fuori", "Bollo allo 0,2% attivo", "Marcella vede e modifica tutto — spese, asset, dividendi — con le sue credenziali"), with the controls under it; when something is not set, the line says what stops working instead of showing a blank. This is the one page with no verdict sentence: a settings page does not measure anything. Six tabs — Preferenze (profile, the calculation basis of Rendimenti, portfolio costs, the FIRE toggles, household members for the pension tax benefit, periodic emails), Allocazione (the plan's total with its target leverage, the Azioni/Obbligazioni formula, per-class targets with sub-categories inline), Spese (default accounts, CSV import, categories), Dividendi, Condivisione and Aspetto (light/dark/system beside the six colour themes). One Salva for the whole page validates everything; what saves itself — the colour theme, the light/dark mode — says so. Two tiles show settings owned by another page (the FIRE plan's parameters, the Assistant's preferences): they state the current values and link to where those are edited, so no setting has two places that can save it. Mobile tab navigation uses a segmented pill control; on desktop the section tabs sit under the one-line page header

## Quick Start

```bash
# Clone the repository
git clone https://github.com/GiuseppeDM98/net-worth-tracker.git
cd net-worth-tracker

# Install dependencies
npm install

# Copy and configure environment variables
cp .env.local.example .env.local
# Edit .env.local with your Firebase credentials (see Prerequisites below)

# Start development server
npm run dev
# → http://localhost:3000
```

> For the full setup guide including Firebase configuration and Firestore security rules, see [SETUP.md](SETUP.md).

## Prerequisites

- **Node.js** 18.x or higher
- **Firebase project** with Firestore + Authentication enabled (free tier is sufficient)
- **Vercel account** (recommended for deployment and cron jobs) or **Docker** for self-hosting
- **Anthropic API key** (optional — enables AI performance analysis)

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your values:

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_*` (6 vars) | Yes | Firebase client SDK configuration |
| `FIREBASE_ADMIN_*` or `FIREBASE_SERVICE_ACCOUNT_KEY` | Yes | Firebase Admin SDK (server-side) |
| `CRON_SECRET` | Yes | Secret for authenticating cron job requests |
| `NEXT_PUBLIC_APP_URL` | Yes | Your deployed application URL |
| `NEXT_PUBLIC_REGISTRATIONS_ENABLED` | No | Toggle new user registration (default: `true`) |
| `NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED` | No | Enable email whitelist for registration |
| `NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS` | No | Enable test snapshot generation in Settings |
| `ANTHROPIC_API_KEY` | No | Enables AI-powered performance analysis |
| `FRED_API_KEY` | No | Lets the daily cron refresh the ECB deposit facility rate history (via FRED) served by `/api/benchmarks/ecb-rates`; the Rendimenti page itself uses the risk-free rate configured in Settings |
| `RESEND_API_KEY` | No | Enables automatic monthly portfolio summary emails (via [Resend](https://resend.com)) |
| `RESEND_FROM_EMAIL` | No | Sender address for monthly emails (e.g. `onboarding@resend.dev` for personal use) |
| `NEXT_PUBLIC_DEMO_USER_ID` | No | Firebase UID of the shared demo account |
| `NEXT_PUBLIC_DEMO_EMAIL` | No | Email for demo auto-login (shown on landing page) |
| `NEXT_PUBLIC_DEMO_PASSWORD` | No | Password for demo auto-login |

See [`.env.local.example`](.env.local.example) for detailed comments on each variable.

### Security Notes

- `NEXT_PUBLIC_FIREBASE_*` values are client configuration, not server secrets. They are expected to be visible in the browser bundle.
- Keep `FIREBASE_ADMIN_*`, `FIREBASE_SERVICE_ACCOUNT_KEY`, `CRON_SECRET`, and `ANTHROPIC_API_KEY` server-only.
- Private App Router API routes are expected to verify Firebase ID tokens server-side. Scheduled cron flows authenticate separately with `CRON_SECRET`.

## Architecture

```
┌─────────────────────────────────────┐
│          Next.js App Router         │
│  (SSR pages + API routes + cron)    │
├──────────┬──────────┬───────────────┤
│  React   │  React   │   API Routes  │
│  Pages   │  Query   │  (server-side)│
├──────────┴──────────┴───────────────┤
│           Service Layer             │
│  (Firestore, Yahoo Finance, AI,    │
│   scraping, metrics, PDF)           │
├─────────────────────────────────────┤
│  Firebase Auth  │  Firestore DB     │
└─────────────────┴───────────────────┘
         External APIs:
   Yahoo Finance · Frankfurter · Borsa Italiana · Anthropic · FRED
```

**Key design patterns:**
- **App Router** with protected dashboard routes
- **Service layer** (`lib/services/`) for all business logic
- **React Query** for client-side data caching and mutations
- **Feature-based component organization** (by domain, not by layer)
- **Shared layout system** (`PageContainer`, `PageHeader`, `PageTabBar`) for consistent page structure
- **Timezone-aware** date handling (Europe/Rome)

## Tech Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| Framework | Next.js 16, React 19 | SSR, routing, API routes |
| Language | TypeScript 5 | Type safety |
| Styling | Tailwind CSS v4, shadcn/ui | UI components and design system |
| Data | React Query (TanStack) | Client-side caching and server state |
| Backend | Firebase (Firestore + Auth) | Database and authentication |
| Animation | framer-motion | Page transitions and micro-interactions |
| Charts | Recharts, @nivo/sankey | Data visualization |
| Finance | yahoo-finance2 | Real-time price data |
| AI | @anthropic-ai/sdk | Performance analysis |
| PDF | @react-pdf/renderer | Export reports |
| Forms | react-hook-form, zod | Form handling and validation |
| Dates | date-fns, date-fns-tz | Timezone-aware date operations |
| Scraping | cheerio | Borsa Italiana dividend and bond price data |
| Testing | Vitest · Playwright | Unit testing (3186 tests) · browser E2E against the Firebase emulator (37 specs) |

## Development

### Commands

```bash
npm run dev        # Start dev server with hot-reload
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Run ESLint
npx knip           # Find unused files, exports, and dependencies (see knip.json)
npm test           # Run unit tests (single run)
npm run test:watch # Run tests in watch mode

# Local Firebase Emulator Suite (offline dev/testing — never touches production; requires a JDK)
npm run emulators      # Start Auth + Firestore emulators (data persists across restarts)
npm run emulators:seed # Seed a synthetic test account (once) — test@example.com / test1234
npm run dev:emulator   # Run the app against the local emulators

# Browser tests (needs the emulators above running; app served on :3100, so your dev server can stay up)
npm run test:e2e       # Playwright: desktop 1440px, mobile 390px, degraded-state scenarios
npm run test:e2e:ui    # Same, interactive runner
```

See [SETUP.md → Step 6](SETUP.md) for the full local-emulator guide (prerequisites, persistence, reset)
and [SETUP.md → Step 7](SETUP.md) for the Playwright suite.

Vitest covers the pure utilities and services, where the logic lives. Playwright covers what only a
real browser can see — the `desktop:` layout switch at 1440px, animated disclosures, deep links that
must cold-load into the right state, whether a loading state ever flashes the wrong content, and
whether a page overflows its viewport at 390px (measured on the elements, since the app shell's
scroll container hides that from `document.scrollWidth`).
Covered pages: **Previdenza** (including a project for the states a healthy fixture can never reach —
a return that can't be trusted, a window where nothing moved, a fund with no history yet — seeded on
their own account: `npm run e2e:seed -- suspicious|idle|fresh`), **Analisi** (its own fixture
account too, with every expense dated January so exact assertions hold whatever month the suite runs
in) and **FIRE / Coast FIRE** (a deterministic Coast fixture with custom expenses, two state pensions
and a pension fund unlocking inside the projection's horizon). Note: the emulators need **Java 21+**
— see SETUP.md → Step 6.

### Conventions

- **UI language**: Italian
- **Code language**: English (comments explain WHY, not WHAT — see [COMMENTS.md](COMMENTS.md))
- **Responsive breakpoint**: `desktop:` (1440px) instead of Tailwind's default `lg:`
- **Radix UI imports**: All `components/ui/` primitives import from the `radix-ui` umbrella package with named imports (`{ X as XPrimitive }`) — not from individual `@radix-ui/react-*` packages
- **Radix Select**: No empty string values — use sentinel values like `__all__`
- **Settings changes**: Always update type definition + getter + setter together. A field the user can CLEAR needs the `'x' in settings` guard in both write chains, or the write succeeds and the old value comes back on the next hard refresh

## Deployment

### Vercel (recommended)

1. Import the repository on [vercel.com](https://vercel.com)
2. Add all environment variables from `.env.local`
3. Deploy — cron jobs for snapshots and dividends are configured in `vercel.json`

Two cron jobs run daily at 18:00 UTC:
- `/api/cron/monthly-snapshot` — Automatic monthly portfolio snapshots
- `/api/cron/daily-dividend-processing` — Dividend data processing

> For detailed instructions, see [VERCEL_SETUP.md](VERCEL_SETUP.md).

### Docker (self-hosted)

Run the app on any VPS or server with Docker. Firebase still handles authentication and the database.

```bash
cp .env.local.example .env.local  # fill in your Firebase credentials
docker compose up -d --build
```

> For the full guide including cron job setup and nginx/HTTPS configuration, see [DOCKER.md](DOCKER.md).

## Project Structure

```
net-worth-tracker/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (17 endpoints)
│   ├── dashboard/          # Protected pages (8 sections)
│   ├── login/              # Auth pages
│   └── register/
├── components/             # React components (~116)
│   ├── ui/                 # shadcn/ui base components
│   ├── layout/             # Sidebar, header, navigation
│   ├── assets/             # Portfolio management
│   ├── performance/        # Metrics and charts
│   ├── cashflow/           # Income/expense tracking
│   ├── dividends/          # Dividend calendar and tables
│   ├── fire-simulations/   # FIRE calculator
│   ├── goals/              # Goal-based investing
│   ├── monte-carlo/        # Monte Carlo UI
│   ├── history/            # Historical analysis
│   ├── hall-of-fame/       # Rankings
│   └── pdf/                # PDF export (sections + primitives)
├── lib/
│   ├── services/           # Business logic (22 services)
│   ├── utils/              # Helpers (formatters, dates, auth)
│   ├── hooks/              # Custom React hooks
│   ├── constants/          # App config, colors, defaults
│   ├── firebase/           # Firebase client + admin setup
│   └── query/              # React Query key factory
├── types/                  # TypeScript definitions (9 files)
├── contexts/               # React contexts (AuthContext)
└── public/                 # Static assets
```

## Contributing

Contributions are welcome! When contributing:

1. Fork the repository and create a feature branch
2. Follow the existing code conventions (Italian UI, English code)
3. Read [COMMENTS.md](COMMENTS.md) for the project's commenting philosophy
4. Ensure `npm run build` passes before submitting a PR

If you work on this repo with an AI coding agent, point it at [WORKFLOW.md](WORKFLOW.md) first: it
holds the standing session rules (one branch and one commit per session, never commit without
explicit approval) and the guided-verification protocol used here — including how to drive the
Firebase emulator and the authenticated Playwright fixtures instead of testing by hand.

### Reporting Issues

- Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) for bugs
- Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) for new ideas

## Known Issues

- Currency conversion depends on the Frankfurter API (falls back to 24h-cached rates); non-EUR assets created before the FX update will show native price as EUR until the next price refresh
- Demo account requires manual setup: create a Firebase user, populate Firestore with realistic fake data, and set the three `NEXT_PUBLIC_DEMO_*` env vars

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0).

This means you are free to use, modify, and distribute this software, but any modified version that is accessible over a network must also make its source code available under the same license.

See [LICENSE.md](LICENSE.md) for the full license text.

## Screenshots

> Screenshots recorded on the app with anonymized or synthetic data.

### Dashboard & Portfolio

![Portfolio overview](docs/screenshots/portfolio-overview.png)
*Overview: the month's verdict over a grid of tiles — net worth, liquidity, cashflow, composition, costs, goals*

![Asset allocation](docs/screenshots/asset-allocation.png)
*Allocazione: the verdict over Bilanciamento, Piano, Per classe and Esposizione*

### Cashflow

![Cashflow Sankey](docs/screenshots/cashflow-sankey.png)
*Analisi: the flow of the year as a 5-layer Sankey inside its tile — a type drills by a click, a category opens its Scheda*

![Cashflow drill-down](docs/screenshots/cashflow-drilldown.png)
*Analisi: the Scheda of a subcategory — period total, per-year table with signed deltas, 24-month trend, transactions*

### Performance & History

![Performance metrics](docs/screenshots/performance-metrics.png)
*Rendimenti: the verdict — how much the portfolio returns, and against what — over the TWR, the risk figures and the six model portfolios*

![Monthly heatmap](docs/screenshots/monthly-heatmap.png)
*Rendimenti: the Consistenza tile — positive months over the measured ones, and every month's return as a heatmap*

![Net worth history](docs/screenshots/history-networth.png)
*Net worth evolution over time*

### FIRE & Simulations

![FIRE calculator](docs/screenshots/fire-calculator.png)
*FIRE projections with Bear/Base/Bull scenarios*

![Monte Carlo](docs/screenshots/monte-carlo.png)
*FIRE › Monte Carlo — the verdict over Probabilità, Distribuzione and Scenari a confronto*

### Dividends & Hall of Fame

![Dividend calendar](docs/screenshots/dividend-calendar.png)
*Dividendi: the payments tile in calendar view — received and expected kept apart, day by day*

![Hall of Fame](docs/screenshots/hall-of-fame.png)
*Hall of Fame: the record month named first, then the rankings — net worth, income, what a month kept, and the years*

## Star History

[![Star History Chart](https://api.star-history.com/image?repos=GiuseppeDM98/net-worth-tracker&type=date&legend=top-left)](https://www.star-history.com/?repos=GiuseppeDM98%2Fnet-worth-tracker&type=date&legend=top-left)
