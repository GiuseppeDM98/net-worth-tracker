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
- Average cost tracking with 4-decimal precision
- Current vs target asset allocation visualization

### Performance Analytics
- Comprehensive metrics: ROI, CAGR, TWR, IRR, Sharpe Ratio, Maximum Drawdown
- Yield on Cost (YOC) and Current Yield calculations
- Monthly returns heatmap and underwater drawdown chart
- Rolling performance charts
- AI-powered analysis using Claude with Extended Thinking and web search

### Cashflow
- Income and expense tracking with custom categories and subcategories
- Bulk move transactions between categories/subcategories (cross-type supported)
- 5-layer Sankey diagram visualization
- 4-level drill-down for detailed expense analysis
- Period analysis with year and month filters
- CSV export

### Dividends
- Multi-currency dividend recording with automatic EUR conversion
- Borsa Italiana scraping for Italian market data (dividends and bond prices)
- Monthly calendar view with drill-down
- Dividend statistics and yield calculations

### Historical Analysis
- Automatic monthly portfolio snapshots (via Vercel cron)
- Net worth evolution, asset class breakdown, and liquidity charts
- Year-over-Year variation analysis
- Savings vs Investment Growth comparison
- Doubling time analysis with geometric calculations and fixed thresholds

### FIRE Planning
- FIRE calculator with primary residence exclusion
- Multi-scenario projections (Bear / Base / Bull) with inflation adjustment
- Per-scenario FIRE numbers with automatic savings stop at FIRE reached

### Monte Carlo Simulations
- 4 asset classes: Equity, Bonds, Real Estate, Commodities
- Editable parameters per asset class (returns, volatility)
- Bear/Base/Bull scenario comparison with overlay charts and distribution analysis
- Auto-fill allocation from real portfolio (crypto and cash excluded, normalized to 100%)

### Other
- **Hall of Fame** — Monthly and annual performance rankings with multi-section note system
- **PDF Export** — 8 configurable sections (performance metrics only in annual/total exports)

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
   Yahoo Finance · Frankfurter · Borsa Italiana · Anthropic · Tavily
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
| Charts | Recharts, @nivo/sankey | Data visualization |
| Finance | yahoo-finance2 | Real-time price data |
| AI | @anthropic-ai/sdk | Performance analysis |
| PDF | @react-pdf/renderer | Export reports |
| Forms | react-hook-form, zod | Form handling and validation |
| Dates | date-fns, date-fns-tz | Timezone-aware date operations |
| Scraping | cheerio | Borsa Italiana dividend and bond price data |
| Testing | Vitest | Unit testing (123 tests) |

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
- **Responsive breakpoint**: `desktop:` (1025px) instead of Tailwind's default `lg:`
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
│   ├── monte-carlo/        # Monte Carlo UI
│   ├── history/            # Historical analysis
│   ├── hall-of-fame/       # Rankings
│   └── pdf/                # PDF export (sections + primitives)
├── lib/
│   ├── services/           # Business logic (21 services)
│   ├── utils/              # Helpers (formatters, dates, auth)
│   ├── hooks/              # Custom React hooks
│   ├── constants/          # App config, colors, defaults
│   ├── firebase/           # Firebase client + admin setup
│   └── query/              # React Query key factory
├── types/                  # TypeScript definitions (8 files)
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

- Legend labels may be truncated on mobile (shows top 3 elements only)
- Currency conversion depends on the Frankfurter API (falls back to cached rates)

## License

This project is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0).

This means you are free to use, modify, and distribute this software, but any modified version that is accessible over a network must also make its source code available under the same license.

See [LICENSE.md](LICENSE.md) for the full license text.
