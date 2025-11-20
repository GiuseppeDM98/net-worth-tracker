# 💰 Portfolio Tracker

A comprehensive web application for tracking and managing investment portfolios across multiple asset classes, with integrated expense tracking, FIRE (Financial Independence, Retire Early) calculator, and personal financial rankings.

Built with Next.js, Firebase, and TypeScript. Designed to replace spreadsheet-based portfolio management with a modern, automated solution.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Next.js](https://img.shields.io/badge/Next.js-16.0-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange)](https://firebase.google.com/)

---

## 📸 Screenshots

### Dashboard Overview
<img width="2284" height="1271" alt="image" src="https://github.com/user-attachments/assets/8b11c9a4-3907-4801-8b6d-7cbac8f0882b" />


### Asset Management
<img width="2299" height="600" alt="image" src="https://github.com/user-attachments/assets/aa8373f5-883e-438f-af6d-b511009edf9e" />


### Asset Allocation Comparison
<img width="2293" height="1070" alt="image" src="https://github.com/user-attachments/assets/2b9b2450-9d64-4127-813d-c7b77fb84b02" />


### Historical Performance Charts
<img width="2289" height="1234" alt="image" src="https://github.com/user-attachments/assets/fee5a375-39d4-4030-901f-a6fb2d3ba99b" />


### Expense Tracking
<img width="2281" height="1262" alt="image" src="https://github.com/user-attachments/assets/fde827b9-60a0-4b63-857f-51f56813141d" />


### Expense Analytics
<img width="2251" height="1273" alt="image" src="https://github.com/user-attachments/assets/b4d7fa8f-49a1-46fd-af4a-9065a90c9d36" />


### FIRE Tracker
<img width="2283" height="1258" alt="image" src="https://github.com/user-attachments/assets/580da85f-8557-4e2f-b973-92159b69be18" />


### Hall of Fame Rankings
<img width="2286" height="1261" alt="image" src="https://github.com/user-attachments/assets/7fe5b615-2905-4da3-9ec3-54bdaee184c9" />


---

## ✨ Key Features

### 📊 **Portfolio Management**
- **Multi-asset class support**: Stocks, ETFs, bonds, crypto, real estate, commodities, cash, private equity
- **Automatic price updates** from Yahoo Finance for 100+ exchanges worldwide
- **Asset allocation tracking** with target vs current comparison and rebalancing recommendations
- **Composite assets** for pension funds and mixed-allocation investments
- **Liquidity tracking** to separate liquid and illiquid net worth
- **Cost basis tracking** with unrealized gains and tax estimation
  - Track average cost per share/unit for each asset
  - Automatic calculation of unrealized gains (current value - cost basis)
  - **G/P (Gain/Loss) column** in Assets table showing absolute value and percentage for each asset
  - **Total portfolio G/P** displayed in table footer with aggregate performance
  - Special calculation for real estate: G/P based on gross property value vs purchase cost (independent of outstanding debt)
  - Estimated tax calculation based on configurable tax rates
  - Gross and net net worth visualization (before/after taxes)

### 📈 **Historical Analysis**
- **Automated monthly snapshots** via scheduled cron jobs
- **Net worth timeline** with interactive charts
- **Asset class evolution** visualization over time
- **Year-over-year performance** comparison
- **CSV export** for external analysis

### 💸 **Expense & Income Tracking**
- **Four entry types**: Income, Fixed Expenses, Variable Expenses, Debts
- **Custom categories** with sub-categories and color coding
- **Recurring expenses** with automatic monthly generation
- **Visual analytics**: Spending breakdown by category, type, and monthly trends
- **Year/month filtering** with dynamic statistics
- **Current year view** by default with automatic filters

### 🔥 **FIRE Calculator & Tracker**
- **Safe Withdrawal Rate** configuration (4% rule based on Trinity Study)
- **FIRE Number calculator** (25x annual expenses methodology)
- **Progress tracking** toward financial independence
- **Current vs Planned scenarios** comparison
- **Monthly/Annual/Daily allowance** calculations
- **Years of expenses** coverage tracker
- **Historical evolution** charts of income, expenses, and sustainable withdrawal

### 🎲 **Monte Carlo Retirement Simulations**
- **Probabilistic retirement planning** with thousands of simulations
- **Success rate calculation** to assess plan sustainability
- **Market vs Historical parameters**: Use standard market assumptions or your own historical returns
- **Flexible portfolio selection**: Total net worth, liquid assets only, or custom amount
- **Interactive visualizations**:
  - Fan chart showing percentile distributions (10th, 25th, 50th, 75th, 90th)
  - Distribution histogram of final portfolio values
  - Failure analysis with median and average depletion years
- **Configurable parameters**: Retirement duration, asset allocation, withdrawal rates, inflation
- **Automatic data integration**: Pre-populates with your current portfolio and expense data

### 🏆 **Hall of Fame Rankings**
- **Personal financial records** across all time
- **Best/Worst months** by net worth growth, income, and expenses (Top 20)
- **Best/Worst years** by annual performance (Top 10)
- **Automatic ranking updates** with each new snapshot
- **Motivation tracking** to compare current performance with historical bests

### ⚙️ **Smart Automation**
- **Formula-based allocation**: Auto-calculate equity/bonds % based on age and risk-free rate
- **End-of-month automation**: Prices update and snapshots create automatically
- **Smart price updates**: Skip assets that don't need updates (cash, real estate)
- **Duplicate protection**: Prevent creating duplicate snapshots

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Firebase account (free tier)
- Vercel account (free tier) or any Node.js hosting

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/portfolio-tracker.git
   cd portfolio-tracker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Firebase**
   - Create a Firebase project ([detailed guide](./SETUP.md#firebase-setup))
   - Enable Firestore Database and Authentication
   - Configure security rules

4. **Configure environment variables**

   Create a `.env.local` file:
   ```bash
   # Firebase Client SDK
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

   # Firebase Admin SDK (server-side)
   FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

   # Cron Job Security
   CRON_SECRET=your_secure_random_string

   # App URL
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

   **For detailed setup instructions, see [SETUP.md](./SETUP.md)**

5. **Run the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

6. **Deploy to Vercel**

   See the [Deployment Guide](./SETUP.md#vercel-deployment) for production deployment instructions.

---

## 🛠 Tech Stack

| Category | Technology |
|----------|-----------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript 5 |
| **Styling** | Tailwind CSS 4, shadcn/ui components |
| **Backend** | Next.js API Routes (serverless) |
| **Database** | Firebase Firestore (NoSQL) |
| **Authentication** | Firebase Authentication |
| **Price Data** | Yahoo Finance API (via yahoo-finance2) |
| **Charts** | Recharts |
| **Deployment** | Vercel (with Cron Jobs) |
| **Form Management** | react-hook-form + zod validation |
| **Date Utilities** | date-fns (Italian locale) |

### Why These Choices?

- **Next.js**: Best-in-class React framework with excellent developer experience
- **Firebase**: Generous free tier, real-time updates, easy authentication, no server management
- **Yahoo Finance**: Free, reliable, extensive ticker coverage (unlike most paid APIs)
- **Vercel**: Seamless Next.js integration, automatic deployments, built-in cron jobs
- **TypeScript**: Type safety prevents bugs and improves maintainability

---

## 📚 Documentation

- **[Setup Guide](./SETUP.md)**: Complete installation and configuration guide
  - Firebase setup (Firestore, Authentication, Security Rules)
  - Vercel deployment (environment variables, cron jobs)
  - Price data provider alternatives (Alpha Vantage, Finnhub, Twelve Data)
  - Infrastructure alternatives (MongoDB, Supabase, Netlify, Railway)

- **[Vercel Configuration](./VERCEL_SETUP.md)**: Firebase Admin SDK troubleshooting on Vercel

- **[Cron Job Configuration](./vercel.json)**: Automated monthly snapshots schedule

---

## 🌍 Localization

The application is designed for **Italian users** with:

- 🇮🇹 **Italian UI** (labels, navigation, messages)
- **EUR currency** formatting: €1.234,56
- **Italian date format**: DD/MM/YYYY
- **Italian number format**: 1.234,56
- Support for **European exchanges** (XETRA, Borsa Italiana, Euronext, etc.)

### Supported Markets

- 🇺🇸 US exchanges (NYSE, NASDAQ)
- 🇪🇺 European exchanges (XETRA, LSE, Euronext, Borsa Italiana)
- 🌏 Global exchanges (Tokyo, Hong Kong, Toronto, etc.)

*Ticker format examples*:
- US: `AAPL`, `TSLA`, `MSFT`
- Germany (XETRA): `VWCE.DE`, `BMW.DE`
- UK (LSE): `BP.L`, `HSBA.L`
- Italy: `ENEL.MI`, `UCG.MI`

---

## 🔐 Security & Privacy

- **Authentication**: Firebase Auth with email/password and Google sign-in
- **Authorization**: Firestore security rules ensure users can only access their own data
- **Registration Control**: Optional whitelist system to restrict who can create accounts
- **Data Privacy**: Your financial data stays in your Firebase project (no third-party services)
- **Server-side Validation**: Prevents client-side manipulation of critical operations
- **Cron Secret**: Protects automated endpoints from unauthorized access

### Registration Control

Configure who can register for your deployment:

```bash
# Open to everyone (default)
NEXT_PUBLIC_REGISTRATIONS_ENABLED=true

# Completely block new registrations
NEXT_PUBLIC_REGISTRATIONS_ENABLED=false

# Only allow specific emails (whitelist)
NEXT_PUBLIC_REGISTRATIONS_ENABLED=false
NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED=true
NEXT_PUBLIC_REGISTRATION_WHITELIST=your-email@gmail.com,admin@example.com
```

See [SETUP.md](./SETUP.md#registration-control) for details.

---

## 🧪 Development Features

### Test Snapshot Generator

For development and testing purposes, the application includes a **bulk test snapshot generator** that creates realistic historical data to test charts, statistics, and UI components.

#### How to Enable

1. **Set environment variable** in your `.env.local`:
   ```bash
   NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS=true
   ```

2. **Navigate to Settings page** in the application

3. **Scroll to "Funzionalità di Sviluppo"** section (only visible when enabled)

4. **Click "Genera Snapshot di Test"** button

#### What It Does

The test data generator creates:

**1. Historical Monthly Snapshots** (going back N months, configurable up to 120)
- Initial net worth: Configurable (default: €50,000)
- Monthly growth rate: Configurable average portfolio growth (default: 0.8% → ~10% annual)
- Asset allocation: 85% liquid / 15% illiquid
- Asset class distribution: 60% equity, 25% bonds, 8% crypto, 5% real estate, 2% cash
- **Realistic asset class returns** with different volatilities:
  - **Equity** (60%): ~1.0% monthly (~12% annual), volatility ~5% annual
  - **Bonds** (25%): ~0.4% monthly (~5% annual), volatility ~1.5% annual
  - **Crypto** (8%): ~1.2% monthly (~15% annual), volatility ~10% annual (high risk)
  - **Real Estate** (5%): ~0.6% monthly (~7% annual), volatility ~1% annual
  - **Cash** (2%): ~0.2% monthly (~2.4% annual, inflation), minimal volatility
- 10 dummy assets: AAPL, GOOGL, MSFT, TSLA, BTC, ETH, US Treasury, Corporate Bonds, Real Estate Fund, Cash EUR
- Random but realistic price variations using normal distribution (Box-Muller transform)

**Technical Implementation:**
- Each asset class grows **independently** with its own return rate and volatility
- Equity, bonds, crypto, real estate, and cash are tracked separately month-by-month
- Portfolio value is recalculated as sum of all asset classes each month
- This creates realistic correlation and diversification effects
- Asset allocation percentages vary over time based on performance (e.g., if equity outperforms, its percentage increases)
- **Perfect for testing Monte Carlo simulations** with historical data that has proper equity/bonds differentiation

**2. Expenses & Income Data** (optional, enabled by default)
- **Income entries**: 1-2 per month with ±8% variation
  - Categories: Stipendio, Freelance, Investimenti, Altro
- **Fixed expenses**: Constant with ±3% variation (35% of total expenses)
  - Categories: Affitto, Utenze, Abbonamenti
- **Variable expenses**: 8-15 entries per month with ±40% variation (50% of total expenses)
  - Categories: Spesa, Trasporti, Svago, Shopping
- **Debts**: Nearly constant with ±1% variation (15% of total expenses)
  - Categories: Mutuo, Prestito Auto
- Realistic date distribution throughout each month

#### Parameters

When you click the button, a modal allows you to configure:

**Patrimonio (Net Worth):**
- **Patrimonio Iniziale** (Initial Net Worth): Starting amount in EUR (default: €50,000)
- **Tasso di Crescita Mensile** (Monthly Growth Rate): Average monthly portfolio growth percentage (default: 0.8% → ~10% annual). Realistic range: 0.5-1.0% for typical portfolios
- **Numero di Mesi** (Number of Months): How many months to generate (1-120, default: 24)

**Spese ed Entrate (optional toggle):**
- **Entrate Mensili Medie** (Average Monthly Income): Mean monthly income in EUR (default: €3,000)
- **Spese Mensili Medie** (Average Monthly Expenses): Mean monthly expenses in EUR (default: €2,500)

#### 🏷️ Dummy Data Identification

All test data generated by this feature is marked with special identifiers for easy management:

- **Snapshots**: Have `isDummy: true` field in the database
- **Expenses**: Have IDs starting with `dummy-` (e.g., `dummy-income-...`, `dummy-fixed-...`)
- **Categories**: Have IDs starting with `dummy-category-` (e.g., `dummy-category-income-stipendio`)

This naming convention allows you to identify and remove all test data at once.

#### ⚠️ Important Warning

**Test data is saved to the same Firebase collections as real data:**
- Snapshots → `monthly-snapshots` collection (with `isDummy: true`)
- Expenses → `expenses` collection (with IDs starting with `dummy-`)
- Categories → `expenseCategories` collection (with IDs starting with `dummy-category-`)

All test data will appear in your charts, statistics, and Hall of Fame alongside real data.

#### 🗑️ Removing Test Data

You have two options to remove test data:

**Option 1: Use the Built-in Delete Button (Recommended)**
1. Navigate to **Settings** page in the application
2. Scroll to **"Funzionalità di Sviluppo"** section
3. Click **"Elimina Tutti i Dati Dummy"** button
4. Review the count of items to be deleted
5. Confirm deletion

This will remove all dummy snapshots, expenses, and categories in one operation.

**Option 2: Manual Firebase Console Deletion**
1. Open [Firebase Console](https://console.firebase.google.com/)
2. Navigate to Firestore Database
3. Select your project
4. Delete test documents from these collections:
   - `monthly-snapshots`: Documents with `isDummy: true` field
   - `expenses`: Documents with IDs starting with `dummy-`
   - `expenseCategories`: Documents with IDs starting with `dummy-category-`

**Recommendation**: Only use this feature in a development/test environment or in a separate Firebase project to avoid mixing test data with real financial data.

#### Use Cases

- **Testing charts** with historical data without waiting months for real snapshots
- **Hall of Fame testing** with realistic income/expense variations to see best/worst months and years
- **FIRE calculator testing** with actual expense data to validate sustainable withdrawal calculations
- **Monte Carlo simulation testing** with realistic equity/bonds returns and volatilities that differ appropriately (equity higher return/volatility, bonds lower)
- **Expense analytics testing** to verify category breakdowns, trends, and monthly comparisons
- **UI development** to see how components handle different data scales and edge cases
- **Performance testing** with large datasets (up to 120 months of data)
- **Demo purposes** to showcase the application's full capabilities
- **Development** of new features requiring historical portfolio and expense data

---

## 🔄 Price Data Providers

This project uses **Yahoo Finance** by default (free, no API key required).

### Want to use a different provider?

The following alternatives are supported but **require custom integration**:

| Provider | Free Tier | Rate Limit | API Key Required |
|----------|-----------|------------|------------------|
| **Yahoo Finance** ✅ | Unlimited | Reasonable use | No |
| **Alpha Vantage** | 500 calls/day | 5 calls/min | Yes |
| **Finnhub** | Unlimited | 60 calls/min | Yes |
| **Twelve Data** | 800 calls/day | 8 calls/min | Yes |

**Implementation required**: If you want to use an alternative provider, you'll need to:
1. Modify `src/services/yahooFinanceService.ts`
2. Update API routes in `/api/prices/`
3. Handle provider-specific rate limits and error codes

See [Price Data Provider Alternatives](./SETUP.md#price-data-provider-alternatives) for implementation guidance.

---

## 🏗 Infrastructure Alternatives

While the default setup uses **Firebase + Vercel**, the application can be adapted to:

### Database Alternatives
- **MongoDB Atlas**: NoSQL document database (similar migration)
- **Supabase**: PostgreSQL with real-time features (requires SQL migration)
- **PlanetScale**: Serverless MySQL (requires SQL migration)

### Hosting Alternatives
- **Netlify**: Similar to Vercel, easy migration
- **Railway**: Docker-based deployment
- **Self-hosted**: VPS with Docker

See [Infrastructure Alternatives](./SETUP.md#infrastructure-alternatives) for migration guides.

---

## 📖 Usage Examples

### Adding Your First Asset

1. Navigate to **"Patrimonio"** (Assets)
2. Click **"Add Asset"**
3. Fill in the form:
   - **Ticker**: `VWCE.DE` (Vanguard All-World ETF on XETRA)
   - **Name**: Vanguard FTSE All-World
   - **Type**: ETF
   - **Asset Class**: Equity
   - **Quantity**: 15
4. Click **"Crea"** - the system automatically fetches the current price
5. Your asset appears in the table with total value calculated

### Setting Up Recurring Expenses

1. Go to **Settings** → Create category "Mortgage" (type: Debts)
2. Navigate to **"Tracciamento Spese"** (Expense Tracking)
3. Click **"Nuova Spesa"**
4. Fill form:
   - Type: Debts
   - Category: Mortgage
   - Amount: €800
   - Date: 2025-01-10
   - Enable **"Crea voce per ogni mese"** (recurring)
   - Day: 10
   - Months: 12
5. System creates 12 monthly entries automatically

### Tracking FIRE Progress

1. Navigate to **"FIRE"** page
2. Set **Safe Withdrawal Rate**: 4.0%
3. (Optional) Set **Planned Annual Expenses**: €25,000
4. View metrics:
   - FIRE Number (target net worth)
   - Progress to FI (%)
   - Monthly Allowance (sustainable withdrawal)
   - Years of Expenses remaining
5. Compare current vs planned scenarios
6. Track progress month-over-month with historical chart

### Tracking Cost Basis and Taxes

1. Navigate to **"Patrimonio"** (Assets)
2. Click on an existing asset or create a new one
3. Enable **"Tracciamento Cost Basis"** toggle
4. Enter:
   - **Costo Medio per Azione**: €85.50 (your average purchase price)
   - **Aliquota Fiscale**: 26 (tax rate percentage)
5. Save the asset
6. View on Dashboard:
   - **Patrimonio Totale Lordo/Netto**: Gross and net total worth
   - **Patrimonio Liquido Lordo/Netto**: Gross and net liquid worth
   - **Plusvalenze Non Realizzate**: Unrealized gains (green) or losses (red)
   - **Tasse Stimate**: Estimated taxes on gains

### Viewing Gain/Loss in Assets Table

Once you've set up cost basis tracking for your assets, the **G/P (Gain/Loss) column** provides immediate visibility into each investment's performance.

#### Understanding the G/P Column

1. Navigate to **"Patrimonio"** (Assets) page
2. The G/P column appears after **"Valore Totale"** (Total Value)
3. For each asset with cost basis set:
   - **First line**: Absolute gain/loss (e.g., +€1,250.00 or -€340.00)
   - **Second line**: Percentage gain/loss (e.g., +12.5% or -4.2%)
   - **Green text**: Positive returns
   - **Red text**: Losses
4. Assets without cost basis show **"-"** in gray

#### Table Footer Totals

At the bottom of the assets table:
- **Total portfolio value**: Sum of all asset values
- **Total G/P**: Aggregate gain/loss across all assets with cost basis
  - Calculated as: Sum of all individual gains/losses
  - Percentage: (Total G/P / Total Cost Basis) × 100

#### Special Case: Real Estate with Debt

For real estate properties with outstanding mortgages, the G/P calculation follows this logic:

**Example:**
- House purchased at: €200,000 (cost basis)
- Current market value: €250,000
- Outstanding mortgage: €150,000

**What you see in the table:**
- **Valore Totale (Total Value)**: €100,000 (net value: €250k - €150k debt)
- **G/P**: +€50,000 (+25%)

**Why this calculation?**
The G/P reflects the **property's appreciation**, not your equity gain. The calculation is:
- Gain/Loss = Current Gross Value - Purchase Cost
- Gain/Loss = €250,000 - €200,000 = +€50,000
- Percentage = €50,000 / €200,000 = +25%

This approach accurately represents the investment performance of the property itself, independent of how it was financed. Your net worth correctly shows €100,000 (after debt), while the G/P shows the true appreciation of the asset (+€50,000).

---

## 🤝 Contributing

Contributions are welcome! This project is open source under the AGPL-3.0 license.

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Use existing component patterns (shadcn/ui)
- Test with multiple asset types and edge cases
- Ensure Firestore security rules are maintained
- Update documentation for new features

---

## 🐛 Troubleshooting

### Common Issues

**Ticker not found**
- Verify ticker format on [Yahoo Finance](https://finance.yahoo.com/)
- European tickers need exchange suffix (`.DE`, `.L`, `.MI`)

**Cron job not running**
- Check Vercel Functions logs
- Verify `CRON_SECRET` environment variable
- Test manually: `curl https://your-app.vercel.app/api/cron/monthly-snapshot?secret=YOUR_SECRET`

**Firebase Admin SDK errors on Vercel**
- See detailed troubleshooting in [VERCEL_SETUP.md](./VERCEL_SETUP.md)
- Use `FIREBASE_SERVICE_ACCOUNT_KEY` with full JSON content

For more troubleshooting help, see the [SETUP.md Troubleshooting section](./SETUP.md#troubleshooting).

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

### What does this mean?

- ✅ You can use, modify, and distribute this software freely
- ✅ You must disclose your source code when distributing
- ✅ If you run a modified version as a web service, you must share the source code with users
- ✅ All derivative works must use the same AGPL-3.0 license

**Why AGPL-3.0?**
This license ensures the project remains open source even when deployed as a web service, preventing someone from taking the code and offering it as a proprietary SaaS product.

See the [LICENSE](./LICENSE) file for the full license text.

---

## 🙏 Acknowledgments

- Built to replace 5+ years of Google Sheets-based portfolio tracking
- Inspired by the FIRE (Financial Independence, Retire Early) community
- Designed for Italian investors using European exchanges
- Expense tracking methodology inspired by YNAB and Mint
- FIRE calculations based on the **Trinity Study** (Safe Withdrawal Rate research)

---

## 📞 Support

- **Documentation**: See [SETUP.md](./SETUP.md) for detailed guides
- **Issues**: Report bugs or request features via [GitHub Issues](https://github.com/GiuseppeDM98/net-worth-tracker/issues)
- **Discussions**: Ask questions in [GitHub Discussions](https://github.com/GiuseppeDM98/net-worth-tracker/discussions)

---

## 🗺 Roadmap

### Current Features (Completed ✅)
- ✅ Multi-asset portfolio management
- ✅ Automatic price updates from Yahoo Finance
- ✅ Asset allocation tracking and rebalancing
- ✅ Historical snapshots and performance charts
- ✅ Expense and income tracking
- ✅ FIRE calculator and progress tracker
- ✅ Hall of Fame personal financial rankings
- ✅ Registration control system
- ✅ Cost basis tracking with unrealized gains and tax estimation
- ✅ Gain/Loss (G/P) column in Assets table with total portfolio performance
- ✅ Monte Carlo retirement simulations

### Future Enhancements (Planned 🔜)
- 🔜 PDF export of portfolio reports
- 🔜 Email notifications (monthly summary)
- 🔜 Multi-currency full conversion support
- 🔜 Performance metrics (ROI, IRR, CAGR, Sharpe ratio)
- 🔜 Internationalization (i18n) for multi-language support
- 🔜 Monte Carlo: Expand asset allocation to include all asset classes (Equity, Bonds, Commodities, Cryptocurrencies, Real Estate, Cash) with configurable percentages
- 🔜 Monte Carlo: Calculate historical returns and volatility from user snapshots when sufficient data is available (minimum 24 monthly data points per asset class). Display warning message when data is insufficient for specific asset classes (e.g., "⚠️ Asset X: Limited historical data. Using market averages")
- 🔜 Dummy snapshot generator: Add Commodity asset class generation (currently set to 0%) to match all available asset classes

### Long-term Vision (Future 🚀)
- 🚀 CSV/Excel import for bulk asset additions
- 🚀 Risk analysis (volatility, max drawdown, correlation)
- 🚀 Backtesting allocation strategies
- 🚀 AI-powered rebalancing suggestions
- 🚀 Dividend tracking
- 🚀 Tax reporting (capital gains, dividends)
- 🚀 Automatic price tracking for individual bonds
- 🚀 Find a way to dockerize the application for easy self-hosting by anyone, explore database structure modifications (SQLite or other options?) to give users broad choice based on an .env.local variable, so the software will know whether to use Firebase or a local database - Idea to explore

---


## ⭐ Star History
If you find this project useful, please consider giving it a star on GitHub!

<a href="https://www.star-history.com/#GiuseppeDM98/net-worth-tracker&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=GiuseppeDM98/net-worth-tracker&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=GiuseppeDM98/net-worth-tracker&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=GiuseppeDM98/net-worth-tracker&type=date&legend=top-left" />
 </picture>
</a>

---

**Made with ❤️ for the FIRE community and DIY investors**
