# CLAUDE.md - Portfolio Tracker

## Project Overview

**Portfolio Tracker** is a comprehensive web application for tracking and managing investment portfolios across multiple asset classes, with integrated expense tracking, FIRE (Financial Independence, Retire Early) calculator, and personal financial rankings.

### Project Purpose
Replace spreadsheet-based portfolio management with a modern, automated solution specifically designed for Italian investors using European exchanges.

### Key Features

**Portfolio Management:**
- Multi-asset class support: Stocks, ETFs, bonds, crypto, real estate, commodities, cash, private equity
- Automatic price updates from Yahoo Finance (100+ worldwide exchanges)
- Asset allocation tracking with target vs actual comparison
- Cost basis tracking with unrealized gains calculation and tax estimation
- TER (Total Expense Ratio) tracking for cost-conscious investing
- Composite assets for pension funds and mixed-allocation investments

**Historical Analysis:**
- Automated monthly snapshots via scheduled cron jobs
- Net worth timeline with interactive charts
- Asset class evolution visualization over time
- Year-over-year performance comparison
- CSV export for external analysis

**Expense & Income Tracking:**
- Four entry types: Income, Fixed Expenses, Variable Expenses, Debts
- Custom categories with subcategories and color coding
- Recurring expenses with automatic monthly generation
- Advanced hierarchical filtering system (Type → Category → Subcategory)
- Visual analytics: interactive three-level drill-down charts
- Income-to-expense ratio metric with financial health indicators

**FIRE Calculator & Tracker:**
- Safe Withdrawal Rate configuration (4% rule based on Trinity Study)
- FIRE Number calculator (25x annual expenses methodology)
- Progress tracking toward financial independence
- Monte Carlo retirement simulations for probabilistic planning
- Historical evolution charts of income, expenses, and sustainable withdrawals

**Hall of Fame:**
- Personal financial records of all time
- Best/worst months by net worth growth, income, and expenses (Top 20)
- Best/worst years by annual performance (Top 10)
- Automatic ranking updates with each new snapshot

**Localization:**
- 🇮🇹 Fully Italian UI
- EUR currency format: €1.234,56
- Italian date format: DD/MM/YYYY
- Support for European exchanges (XETRA, Borsa Italiana, Euronext)

---

## Tech Stack

### Frameworks and Languages
| Category | Technology | Version |
|----------|-----------|---------|
| **Frontend Framework** | Next.js (App Router) | 16.0.1 |
| **Runtime** | React | 19.2.0 |
| **Language** | TypeScript | 5.x |
| **Styling** | Tailwind CSS | 4.x |
| **UI Components** | shadcn/ui | - |
| **Base Components** | Radix UI | - |

### Backend and Database
| Category | Technology | Version |
|----------|-----------|---------|
| **Backend** | Next.js API Routes (serverless) | 16.0.1 |
| **Database** | Firebase Firestore (NoSQL) | - |
| **Authentication** | Firebase Authentication | 12.5.0 |
| **Admin SDK** | Firebase Admin | 13.6.0 |

### Libraries and Utilities
| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Price Data** | yahoo-finance2 | 3.10.1 | Financial price API from Yahoo Finance |
| **Charts** | Recharts | 3.3.0 | Interactive charts and visualizations |
| **Form Management** | react-hook-form | 7.66.0 | Form handling |
| **Validation** | zod | 4.1.12 | Schema validation |
| **Date Utilities** | date-fns | 4.1.0 | Date manipulation (Italian locale) |
| **Theming** | next-themes | 0.4.6 | Dark/light mode |
| **Icons** | lucide-react | 0.553.0 | Icon library |
| **Notifications** | sonner | 2.0.7 | Toast notifications |
| **Styling Utils** | clsx + tailwind-merge | - | Class name utilities |
| **CSS Variance** | class-variance-authority | 0.7.1 | Component variants |

### Deployment and Automation
| Category | Technology | Purpose |
|----------|-----------|---------|
| **Hosting** | Vercel | Automatic deployment, serverless functions |
| **Cron Jobs** | Vercel Cron | Automatic monthly snapshots, price updates |

### Architectural Choices

**Why Next.js?**
- Best-in-class React framework with excellent developer experience
- App Router for modern routing and server components
- API Routes for serverless backend without separate infrastructure

**Why Firebase?**
- Generous free tier
- Real-time updates
- Easy authentication without server management
- Firestore Security Rules for server-side authorization

**Why Yahoo Finance?**
- Free API without required API key
- Reliable with extensive ticker coverage (unlike paid APIs)
- Support for 100+ worldwide exchanges

**Why Vercel?**
- Seamless Next.js integration
- Automatic deployments from Git
- Built-in cron jobs for automation

**Why TypeScript?**
- Type safety prevents bugs
- Improves maintainability and developer experience
- Safe autocomplete and refactoring

---

## Project Structure

```
net-worth-tracker/
├── app/                      # Next.js App Router
│   ├── api/                  # API Routes (serverless functions)
│   │   ├── cron/             # Cron job endpoints (monthly snapshots)
│   │   ├── prices/           # Asset price update endpoints
│   │   ├── auth/             # Authentication endpoints
│   │   └── ...               # Other API endpoints
│   ├── dashboard/            # Dashboard pages (protected routes)
│   │   ├── patrimonio/       # Asset and portfolio management
│   │   ├── cashflow/         # Expense and income tracking
│   │   ├── fire/             # FIRE calculator and simulations
│   │   ├── allocazione/      # Asset allocation and rebalancing
│   │   ├── storico/          # Historical analysis and performance
│   │   ├── hall-of-fame/     # Personal record rankings
│   │   └── settings/         # Settings and configuration
│   ├── login/                # Login page
│   ├── register/             # Registration page
│   ├── layout.tsx            # Root layout (auth provider, themes)
│   ├── page.tsx              # Homepage/landing
│   └── globals.css           # Global styles (Tailwind)
│
├── components/               # Reusable React components
│   ├── ui/                   # shadcn/ui components (Button, Dialog, etc.)
│   ├── auth/                 # Authentication components
│   ├── dashboard/            # Dashboard-specific components
│   ├── charts/               # Chart components (Recharts wrappers)
│   └── ...                   # Other shared components
│
├── contexts/                 # React Contexts
│   └── AuthContext.tsx       # Firebase authentication context
│
├── lib/                      # Libraries and utilities
│   ├── firebase/             # Firebase configuration (client + admin)
│   ├── services/             # Business logic services
│   │   ├── yahooFinanceService.ts  # Yahoo Finance API
│   │   ├── assetService.ts         # Asset CRUD operations
│   │   └── ...                     # Other services
│   └── utils/                # Utility functions
│
├── types/                    # TypeScript type definitions
│   ├── asset.ts              # Asset and portfolio types
│   ├── expense.ts            # Expense and income types
│   └── ...                   # Other types
│
├── public/                   # Static assets (images, favicon)
│
├── firestore.rules           # Firestore Security Rules
├── firestore.indexes.json    # Firestore database indexes
├── vercel.json               # Vercel configuration (cron jobs)
├── next.config.ts            # Next.js configuration
├── tsconfig.json             # TypeScript configuration
├── package.json              # Dependencies and scripts
├── .env.local.example        # Environment variables template
├── README.md                 # Project documentation
├── SETUP.md                  # Setup and deployment guide
└── VERCEL_SETUP.md           # Vercel + Firebase troubleshooting
```

### Main Directories

**app/** - Next.js App Router
- Filesystem-based routing
- Server Components by default
- API Routes in `app/api/`
- Nested layouts for shared UI structure

**components/** - Reusable React components
- `ui/` contains shadcn/ui components (design system)
- Components organized by feature/domain
- Presentational components separated from business logic

**lib/** - Business logic and utilities
- `firebase/` manages client and admin SDK connections
- `services/` contains all business logic (CRUD, external APIs)
- `utils/` for generic helper functions

**types/** - TypeScript definitions
- Shared types for domain entities
- Interfaces for API responses
- Type guards and utility types

**contexts/** - React Context providers
- AuthContext for global authentication state
- Pattern: Context + Provider + custom hook

### Architectural Patterns

**Separation of Concerns:**
- UI Components in `components/`
- Business logic in `lib/services/`
- Type definitions in `types/`
- API routes in `app/api/`

**Data Flow:**
1. UI Components call services
2. Services interact with Firebase/external APIs
3. Services return typed data
4. Components render data

**Authentication Flow:**
1. Firebase Auth via AuthContext
2. Protected routes verify auth in layout
3. Firestore Rules authorize server-side operations
4. API routes validate CRON_SECRET for automation

---

*Auto-generated document - Version 1.0*
