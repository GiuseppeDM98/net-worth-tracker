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

The app integrates with Yahoo Finance for real-time price updates and includes advanced features like Monte Carlo simulations, FIRE (Financial Independence, Retire Early) projections, and AI-powered performance analysis via Claude. The UI is in Italian while the codebase follows English conventions.

## Key Features

### Portfolio Management
- Multi-asset tracking across stocks, ETFs, bonds, crypto, real estate, commodities, and cash
- Automatic price updates via Yahoo Finance (all assets) and Borsa Italiana (Italian bonds with ISIN)
- Bond coupon scheduling: automatic coupon generation with step-up rate tiers and final premium (Premio Finale) support — full BTP Valore compatible
- Average cost tracking with 4-decimal precision, including a built-in multi-broker PMC calculator for positions spread across multiple brokers
- Current vs target asset allocation visualization
- Hierarchical asset allocation analysis with desktop drill-down and mobile bottom-sheet navigation
- Assets workspace polish: macro-tabs and historical sub-tabs preserve their state more reliably, and historical refresh actions give scoped feedback without disrupting table readability

### Performance Analytics
- Comprehensive metrics: ROI, CAGR, TWR, IRR, Sharpe Ratio, Maximum Drawdown
- Yield on Cost (YOC) and Current Yield calculations
- Monthly returns heatmap and underwater drawdown chart
- Rolling performance charts
- Performance page polish: smoother in-place period switching, metric settling from prior values, staged heatmap reveal, a calmer underwater drawdown presentation, and contextual dialogs for custom ranges and AI analysis
- Overview dashboard polish: the main net worth KPI settles in more naturally on load, snapshot overwrite feels more connected to its CTA, and portfolio charts reveal more discreetly without noisy replay
- Progressive disclosure: methodology section collapsed by default; one-time guide strip for new users; "Avanzato" badge on technical metrics (TWR, IRR, Sharpe, YOC); each chart has an inline 2-line reading hint
- Animated metric cards: values count up on load and settle more naturally during period changes; staggered entrance cascade per section
- Dashboard KPI cards (Total Portfolio, Liquid, Net Worth, Unrealized Gains, Taxes) animate their values on page load — numbers count up from zero once on mount
- All major pages (Dashboard, Hall of Fame, History, Performance, Dividends) animate on load with staggered card entrances and smooth expand/collapse transitions; respects system "Reduce Motion" preference
- All charts animate on load: bars grow up from baseline, lines draw in left to right, area fills expand, pie slices fan out — covers every page with data visualization (History, Performance, Cashflow, Dividends, FIRE, Monte Carlo, Goals)
- AI-powered analysis using Claude with Extended Thinking and web search
- Fully responsive on mobile and tablet: dropdown period selector, stacked header, color-only heatmap view on small screens

### Cashflow
- Income and expense tracking with custom categories and subcategories
- **Budget tab**: automatic budget tracking for all expense categories — items auto-generated from your categories with no manual setup; annual view with progress bars comparing current year vs budget, previous year, and historical average; click any row (category, section subtotal, or Total Expenses/Income) to open a historical year×month panel with min/max month highlights; Total Expenses also shows a per-type breakdown (Fixed / Variable / Debt) as separate month-by-month tables; collapsible sections with reordering; fully responsive on mobile with tappable cards and a per-item detail dialog
- Bulk move transactions between categories/subcategories (cross-type supported)
- 5-layer Sankey diagram visualization
- 4-level drill-down for detailed expense analysis
- Period analysis with year and month filters — filtered sections include expense type breakdown (Fixed / Variable / Debt) pie chart that updates with the active filter
- CSV export

### Dividends
- Multi-currency dividend recording with automatic EUR conversion
- Borsa Italiana scraping for Italian market data (dividends and bond prices)
- Monthly calendar view with synchronized date focus and drill-down
- Dividend statistics, contextual payment detail, and yield calculations
- **Total Return per Asset**: table combining unrealized capital gain % and all-time net dividends received % (calculated at historical cost basis per payment, not diluted by later purchases) to show the true investment return per asset; card layout on mobile
- **Dividend Per Share Growth**: year-by-year gross DPS history per equity asset with YoY% and CAGR columns; portfolio median growth rate shown as a summary; tap any asset on mobile to open a vertical year-by-year dialog

### Historical Analysis
- Automatic monthly portfolio snapshots (via Vercel cron)
- Net worth evolution, asset class breakdown, and liquidity charts
- Year-over-Year variation analysis
- Savings vs Investment Growth comparison (annual and monthly views)
- **Labor & Investments section**: lifetime KPI cards for Earned from Work, Saved from Work, Investment Growth Gross/Net, plus counters for positive and negative months based on total monthly net worth growth, and a monthly breakdown chart — visible when labor income categories are configured in Settings
- Doubling time analysis with geometric calculations and fixed thresholds

### FIRE Planning
- FIRE calculator with primary residence exclusion
- Multi-scenario projections (Bear / Base / Bull) with inflation adjustment
- Per-scenario FIRE numbers with automatic savings stop at FIRE reached
- **Goal-Based Investing**: allocate portfolio portions to financial goals (house, retirement, emergency fund, etc.) with progress tracking, recommended allocation comparison, and open-ended goal support
- **Goal-Driven Allocation**: optionally derive portfolio allocation targets as a weighted average of goal recommended allocations, with automatic fallback to manual targets
- Fully responsive on mobile and tablet — tab navigation uses a dropdown on small screens, year-by-year projection table switches to a card layout

### Monte Carlo Simulations
- 4 asset classes: Equity, Bonds, Real Estate, Commodities
- Editable parameters per asset class (returns, volatility)
- Bear/Base/Bull scenario comparison with overlay charts and distribution analysis
- Auto-fill allocation from real portfolio (crypto and cash excluded, normalized to 100%)
- Fully responsive on mobile and tablet — percentile table switches to a card layout, scenario parameter cards stack vertically

### Other
- **Dark mode** — Full dark/light/system theme support. The header toggle cycles through three states: Light, Dark, and System (follows OS preference), using Sun, Moon, and Monitor icons. Every page, chart tooltip, and UI component is properly themed
- **Authentication flow** — Login and registration screens follow the same visual language as the dashboard, with accessible focus states, keyboard-friendly password toggles, and clearer in-place submit feedback
- **Hall of Fame** — Monthly and annual performance rankings with current-period spotlight cards, contextual notes, and fully responsive mobile/tablet layouts
- **PDF Export** — 8 configurable sections with custom year/month period selection; sections auto-disabled for past periods when historical data is unavailable
- **Settings UX improvements** — The Settings area now gives clearer unsaved-change feedback, smoother nested allocation editing, and more contextual confirmations for sensitive category actions

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
- **Vercel account** (recommended for deployment and cron jobs)
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
   Yahoo Finance · Frankfurter · Borsa Italiana · Anthropic
```

**Key design patterns:**
- **App Router** with protected dashboard routes
- **Service layer** (`lib/services/`) for all business logic
- **React Query** for client-side data caching and mutations
- **Feature-based component organization** (by domain, not by layer)
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
| Testing | Vitest | Unit testing (218 tests) |

## Development

### Commands

```bash
npm run dev        # Start dev server with hot-reload
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Run ESLint
npm test           # Run unit tests (single run)
npm run test:watch # Run tests in watch mode
```

### Conventions

- **UI language**: Italian
- **Code language**: English (comments explain WHY, not WHAT — see [COMMENTS.md](COMMENTS.md))
- **Responsive breakpoint**: `desktop:` (1440px) instead of Tailwind's default `lg:`
- **Radix Select**: No empty string values — use sentinel values like `__all__`
- **Settings changes**: Always update type definition + getter + setter together

## Deployment

The recommended deployment target is **Vercel**:

1. Import the repository on [vercel.com](https://vercel.com)
2. Add all environment variables from `.env.local`
3. Deploy — cron jobs for snapshots and dividends are configured in `vercel.json`

Two cron jobs run daily at 18:00 UTC:
- `/api/cron/monthly-snapshot` — Automatic monthly portfolio snapshots
- `/api/cron/daily-dividend-processing` — Dividend data processing

> For detailed deployment instructions, see [VERCEL_SETUP.md](VERCEL_SETUP.md).

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

### Reporting Issues

- Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) for bugs
- Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md) for new ideas

## Known Issues

- Currency conversion depends on the Frankfurter API (falls back to cached rates)

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0).

This means you are free to use, modify, and distribute this software, but any modified version that is accessible over a network must also make its source code available under the same license.

See [LICENSE.md](LICENSE.md) for the full license text.

## Screenshots

> Screenshots recorded on the live app with anonymized data.

### Dashboard & Portfolio

![Portfolio overview](docs/screenshots/portfolio-overview.png)
*Portfolio overview with asset breakdown and allocation*

![Asset allocation](docs/screenshots/asset-allocation.png)
*Current vs target asset allocation*

### Cashflow

![Cashflow Sankey](docs/screenshots/cashflow-sankey.png)
*5-layer Sankey diagram of income and expenses*

![Cashflow drill-down](docs/screenshots/cashflow-drilldown.png)
*4-level drill-down into expense categories*

### Performance & History

![Performance metrics](docs/screenshots/performance-metrics.png)
*ROI, CAGR, Sharpe Ratio, drawdown and more*

![Monthly heatmap](docs/screenshots/monthly-heatmap.png)
*Monthly returns heatmap*

![Net worth history](docs/screenshots/history-networth.png)
*Net worth evolution over time*

### FIRE & Simulations

![FIRE calculator](docs/screenshots/fire-calculator.png)
*FIRE projections with Bear/Base/Bull scenarios*

![Monte Carlo](docs/screenshots/monte-carlo.png)
*Monte Carlo simulation with scenario comparison*

### Dividends & Hall of Fame

![Dividend calendar](docs/screenshots/dividend-calendar.png)
*Monthly dividend calendar with drill-down*

![Hall of Fame](docs/screenshots/hall-of-fame.png)
*Monthly and annual performance rankings*

## Star History

[![Star History Chart](https://api.star-history.com/image?repos=GiuseppeDM98/net-worth-tracker&type=date&legend=top-left)](https://www.star-history.com/?repos=GiuseppeDM98%2Fnet-worth-tracker&type=date&legend=top-left)
