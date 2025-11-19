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

### Future Enhancements (Planned 🔜)
- 🔜 PDF export of portfolio reports
- 🔜 Email notifications (monthly summary)
- 🔜 Multi-currency full conversion support
- 🔜 Performance metrics (ROI, IRR, CAGR, Sharpe ratio)
- 🔜 Internationalization (i18n) for multi-language support
- 🔜 Ability to search for a category or subcategory when adding an expense
- 🔜 Display selected month in expense tracking page (when filtering by month, make it clear to users that income, expense, and balance boxes refer to the filtered month)

### Long-term Vision (Future 🚀)
- 🚀 CSV/Excel import for bulk asset additions
- 🚀 Risk analysis (volatility, max drawdown, correlation)
- 🚀 Backtesting allocation strategies
- 🚀 Monte Carlo retirement simulations
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
