# Portfolio Tracker

A comprehensive web application for tracking and managing investment portfolios across multiple asset classes. Built to replace a 5+ year old Google Sheets workflow with a modern, automated solution.

## Project Vision

This application serves as a complete financial portfolio management system designed for serious investors who want to:
- Track multi-asset class portfolios (stocks, ETFs, bonds, crypto, real estate, commodities, cash)
- Monitor asset allocation against target percentages
- Maintain historical records of portfolio value over time
- Make data-driven rebalancing decisions
- Track progress toward Financial Independence / Retire Early (FIRE) goals

The app prioritizes:
- **Accuracy**: Automated price updates from reliable sources
- **Clarity**: Visual representations of portfolio composition and allocation
- **Control**: Manual oversight of automated processes
- **Persistence**: Long-term historical tracking (months/years)
- **Privacy**: Self-hosted data in Firebase (no third-party portfolio services)

## Core Features

### 1. Asset Management
- **Add/Edit/Delete Assets**: Full CRUD for all portfolio holdings
- **Multi-Asset Class Support**:
  - Stocks (individual companies)
  - ETFs (index funds, factor ETFs)
  - Bonds (individual bonds, bond ETFs)
  - Cryptocurrency (Bitcoin, Ethereum, etc.)
  - Real Estate (physical properties with fixed valuations)
  - Commodities (gold ETFs, physical holdings)
  - Cash (bank accounts, money market funds)
  - Private Equity (unlisted investments with manual valuations)
- **Detailed Asset Information**:
  - Ticker symbol (with exchange suffix for European securities)
  - Asset name
  - Asset type and class categorization
  - Quantity held
  - Average cost (optional, for performance tracking)
  - Current market price
  - Last price update timestamp
  - Currency (default EUR, multi-currency support)

### 2. Automated Price Updates
- **Yahoo Finance Integration**: Real-time price fetching for publicly traded securities
- **Manual Update Trigger**: On-demand button to update all prices instantly
- **End-of-Month Updates**: Scheduled automatic updates at month-end (not month-start)
- **Price History**: Historical price data stored for trend analysis
- **Error Handling**: Graceful handling of tickers not found or API failures
- **Multi-Market Support**: European (XETRA, LSE, Euronext), US (NYSE, NASDAQ), and other exchanges

### 3. Asset Allocation Management
Portfolio allocation tracking with two-level hierarchy:

#### Primary Asset Classes
- Equity (stocks and stock ETFs)
- Bonds (fixed income securities)
- Real Estate (physical properties)
- Cryptocurrency (digital assets)
- Commodities (precious metals, etc.)
- Cash (liquid savings)

#### Sub-Categories (Example: Equity)
- **All-World Equity**: Broad market ETFs (VWCE, SWDA)
- **Factor ETFs**: 
  - Momentum (IWMO)
  - Quality (IWQU)
  - Value (IWVL)
- **Pension Funds**: Employer-sponsored retirement accounts
- **Private Equity**: Illiquid private investments
- **High Risk**: Thematic/speculative ETFs (ARKK)
- **Single Stocks**: Individual company holdings (Ferrari, etc.)

#### Allocation Features
- **Target Setting**: Define desired allocation percentages (must sum to 100%)
- **Current vs Target**: Real-time comparison showing deviations
- **Rebalancing Actions**: Automated suggestions (COMPRA/VENDI/OK)
- **Visual Indicators**: Color-coded differences (red = rebalance needed, green = on target)
- **Euro Amounts**: Show both percentages and absolute euro values for clarity

### 4. Portfolio Visualization
- **Asset Class Pie Chart**: High-level distribution across major categories
- **Individual Asset Pie Chart**: Detailed breakdown by specific holdings (top 10 + "Others")
- **Percentage Labels**: Clear labeling on chart slices (shown if >5%)
- **Interactive Tooltips**: Hover details showing name, value, percentage
- **Consistent Color Coding**: Asset classes always use same colors across all views

### 5. Dashboard Overview
Summary metrics displayed prominently:
- **Total Net Worth**: Complete portfolio value
- **Liquid Net Worth**: Excluding illiquid assets (real estate, private equity)
- **Asset Count**: Total number of holdings
- **Month-over-Month Change**: Growth/decline from previous month (when available)

### 6. Historical Tracking (Future Enhancement)
Monthly snapshot system for long-term analysis:
- **Monthly Snapshots**: Automatic capture of portfolio state at month-end
- **Net Worth Timeline**: Line chart showing total value over time
- **Liquid vs Illiquid**: Track separately for liquidity planning
- **Asset Class Evolution**: Stacked area chart showing composition changes
- **Year-over-Year Growth**: Annual comparison metrics
- **Export Capability**: Download historical data as CSV/Excel

### 7. FIRE Progress Tracker (Future Enhancement)
Financial Independence planning tools:
- **FIRE Target**: Set desired portfolio value for retirement
- **Years to FIRE**: Calculate based on current savings rate and growth assumptions
- **Progress Bar**: Visual indicator of completion percentage
- **Projection Calculator**: Model future scenarios with different savings rates
- **Withdrawal Rate**: 4% rule calculator for sustainable retirement spending

## Technical Architecture

### Technology Stack
- **Frontend**: Next.js 14+ (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui component library
- **Backend**: Next.js API Routes (serverless functions)
- **Database**: Firebase Firestore (NoSQL document database)
- **Authentication**: Firebase Authentication (email/password + OAuth)
- **Price Data**: yahoo-finance2 (npm package)
- **Charts**: Recharts (React charting library)
- **Deployment**: Vercel (automatic deployments from Git)
- **Form Management**: react-hook-form + zod (validation)
- **Date Utilities**: date-fns

### Why These Choices?
- **Next.js**: Best-in-class React framework with excellent DX and performance
- **Firebase**: Generous free tier, real-time updates, easy authentication, no server management
- **Yahoo Finance**: Free, reliable, extensive ticker coverage (unlike most APIs)
- **Vercel**: Seamless Next.js integration, generous free tier, edge functions
- **TypeScript**: Type safety prevents bugs, improves code maintainability
- **shadcn/ui**: High-quality, customizable components, no runtime JS overhead

### Database Schema

#### Collections Structure
```
users/
  └─ {userId}/
      - email: string
      - displayName: string
      - createdAt: timestamp

assets/
  └─ {assetId}/
      - userId: string (indexed)
      - ticker: string
      - name: string
      - type: "stock" | "etf" | "bond" | "crypto" | "commodity" | "cash" | "realestate"
      - assetClass: "equity" | "bonds" | "crypto" | "realestate" | "cash" | "commodity"
      - subCategory: string (optional)
      - exchange: string
      - currency: string
      - quantity: number
      - averageCost: number (optional)
      - currentPrice: number
      - lastPriceUpdate: timestamp
      - createdAt: timestamp
      - updatedAt: timestamp

assetAllocationTargets/
  └─ {userId}/
      - targets: {
          equity: {
            targetPercentage: number
            subTargets: { allWorld: number, momentum: number, ... }
          }
          bonds: { targetPercentage: number }
          ...
        }
      - updatedAt: timestamp

priceHistory/
  └─ {ticker}-{YYYY-MM-DD}/
      - ticker: string
      - price: number
      - date: timestamp
      - currency: string

monthlySnapshots/
  └─ {userId}-{YYYY-MM}/
      - userId: string
      - year: number
      - month: number
      - totalNetWorth: number
      - liquidNetWorth: number
      - byAssetClass: { equity: number, bonds: number, ... }
      - byAsset: Array<{ assetId, ticker, name, quantity, price, totalValue }>
      - assetAllocation: { equity: %, bonds: %, ... }
      - createdAt: timestamp
```

### Key Design Decisions

#### 1. End-of-Month Price Updates
**Rationale**: User's workflow involves monthly portfolio reviews at month-end. This timing:
- Aligns with salary deposits and investment purchases
- Provides clean monthly boundaries for historical snapshots
- Matches typical financial reporting periods

**Implementation**: Vercel Cron job scheduled for last day of each month (e.g., 31st, 30th, 28/29th)

#### 2. Manual Price Update Override
**Rationale**: While automated updates are convenient, users need control to:
- Update prices immediately before making investment decisions
- Verify prices after market volatility
- Refresh data if automated job fails

**Implementation**: Button in UI calls API route that triggers batch Yahoo Finance updates

#### 3. Separate Asset Allocation Targets
**Rationale**: Targets change infrequently but are referenced often. Storing separately:
- Reduces data duplication in asset documents
- Allows atomic updates to entire allocation strategy
- Enables historical tracking of target changes

**Implementation**: Single document per user in `assetAllocationTargets` collection

#### 4. Price History Storage
**Rationale**: Historical prices enable:
- Performance analysis over time
- Verification of price changes
- Reduced API calls (check history before fetching)

**Implementation**: One document per ticker per day, indexed by ticker+date for fast queries

#### 5. Monthly Snapshots vs Real-Time Calculation
**Rationale**: Snapshots provide:
- Guaranteed historical accuracy (immune to data changes)
- Fast loading of historical charts (no recalculation needed)
- Audit trail of portfolio state

**Implementation**: Automated job creates snapshot from current asset state + prices

### API Routes

#### `/api/prices/update`
- **Method**: POST
- **Auth**: Required (Firebase token)
- **Body**: `{ assetIds?: string[] }` (optional, defaults to all user assets)
- **Response**: `{ updated: number, failed: string[], prices: Map<string, number> }`
- **Logic**:
  1. Verify user authentication
  2. Fetch assets from Firestore (filter by assetIds if provided)
  3. Extract unique tickers
  4. Call `yahooFinanceService.getMultipleQuotes(tickers)`
  5. Update each asset's `currentPrice` and `lastPriceUpdate`
  6. Save to `priceHistory` collection
  7. Return results with any failures

#### `/api/portfolio/calculate` (Future)
- **Method**: GET
- **Auth**: Required
- **Response**: Current portfolio metrics (net worth, allocation, etc.)
- **Logic**: Real-time calculation from current asset data

#### `/api/portfolio/snapshot` (Future)
- **Method**: POST
- **Auth**: Required or Cron secret
- **Response**: Snapshot document ID
- **Logic**: Create monthly snapshot, triggered by Cron job

### Frontend Components Architecture

#### Page Structure
```
app/
├── (auth)/
│   ├── login/page.tsx          # Login form
│   └── register/page.tsx       # Registration form
├── dashboard/
│   ├── page.tsx                # Overview (charts, summary)
│   ├── layout.tsx              # Sidebar navigation
│   ├── assets/
│   │   └── page.tsx            # Asset table, CRUD operations
│   ├── allocation/
│   │   ├── page.tsx            # Current vs target comparison
│   │   └── settings/page.tsx  # Edit allocation targets
│   ├── history/page.tsx        # Historical charts (future)
│   └── fire/page.tsx           # FIRE tracker (future)
└── api/
    ├── prices/update/route.ts
    └── portfolio/
        ├── calculate/route.ts
        └── snapshot/route.ts
```

#### Component Hierarchy
```
Layout
├── Header (user menu, logo)
├── Sidebar (navigation)
└── Main Content
    ├── Dashboard
    │   ├── SummaryCard (x4)
    │   ├── AssetClassPie
    │   └── AssetDistributionPie
    ├── Assets Page
    │   ├── AssetTable
    │   ├── UpdatePricesButton
    │   └── AssetDialog (add/edit)
    └── Allocation Page
        ├── AllocationTable (current)
        ├── AllocationTable (target)
        └── Link to settings
```

#### Reusable Components
- `SummaryCard`: Metric display with optional trend indicator
- `AssetTable`: Sortable table with actions (edit/delete)
- `AssetDialog`: Form for adding/editing assets
- `AllocationTable`: Display allocation with differences
- `AssetClassPie`: Pie chart for asset class distribution
- `AssetDistributionPie`: Pie chart for individual assets
- `UpdatePricesButton`: Trigger manual price updates
- `LoadingSpinner`: Generic loading indicator
- `LoadingSkeleton`: Skeleton screens for tables/cards

### Service Layer

#### `assetService.ts`
- `getAllAssets(userId)`: Fetch all user assets
- `getAssetById(assetId)`: Fetch single asset
- `createAsset(userId, assetData)`: Add new asset
- `updateAsset(assetId, updates)`: Modify existing asset
- `deleteAsset(assetId)`: Remove asset
- `updateAssetPrice(assetId, price)`: Update price and timestamp

#### `yahooFinanceService.ts`
- `getQuote(ticker)`: Fetch single ticker price
- `getMultipleQuotes(tickers)`: Batch fetch (more efficient)
- `validateTicker(ticker)`: Check if ticker exists
- `searchTicker(query)`: Search for tickers by name/symbol

#### `assetAllocationService.ts`
- `getTargets(userId)`: Fetch user's allocation targets
- `setTargets(userId, targets)`: Save allocation targets
- `calculateCurrentAllocation(assets)`: Compute current state
- `compareAllocations(current, targets)`: Generate rebalancing actions

#### `chartService.ts`
- `prepareAssetDistributionData(assets)`: Format for pie chart
- `prepareAssetClassDistributionData(assets)`: Aggregate by class
- `calculatePercentages(assets)`: Convert values to percentages

## User Workflow Examples

### Monthly Portfolio Review (Primary Use Case)
1. **Day 30-31 of month**: Automated Cron job updates all asset prices from Yahoo Finance
2. **Month-end**: User logs in to review portfolio
3. User views **Dashboard** for high-level overview:
   - Total net worth: €251,953
   - Liquid net worth: €193,207 (excluding €58,746 real estate)
   - Month-over-month change: +€3,240 (+1.3%)
4. User clicks **"Allocation"** to check rebalancing needs:
   - Equity: 84.5% current vs 80.6% target → **VENDI** €9,804 in equity
   - Bonds: 5.5% current vs 16.9% target → **COMPRA** €28,723 in bonds
   - Crypto: 2.1% current vs 2.5% target → **COMPRA** €1,008 in crypto
5. User invests €2,000 monthly savings according to rebalancing actions:
   - €1,500 into bond ETF (IMB28)
   - €500 into crypto (WBIT)
6. User updates holdings in **"Assets"** page:
   - Edit IMB28: increase quantity by 15 shares
   - Edit WBIT: increase quantity by 0.02 BTC
7. Click **"Update Prices"** to refresh current values
8. Return to **"Allocation"** to verify closer to targets

### Adding a New Investment
1. User purchases new ETF: ARKK (high-risk equity)
2. Navigate to **"Assets"** page
3. Click **"Add Asset"** button
4. Fill form:
   - Ticker: `ARKK` (US exchange, no suffix needed)
   - Name: ARK Innovation ETF
   - Type: ETF
   - Asset Class: Equity
   - Sub-category: High Risk
   - Exchange: NYSE
   - Currency: USD (will be converted to EUR)
   - Quantity: 10
   - Average Cost: €45.00
5. Click **"Save"** → Asset appears in table
6. Click **"Update Prices"** → Current price fetched from Yahoo Finance
7. Total value calculated: 10 × current_price

### Rebalancing Portfolio
1. User notices **Allocation** page shows significant deviations
2. Equity overweighted (+€15,000) → needs to sell
3. Bonds underweighted (-€28,000) → needs to buy
4. User decides to rebalance with €10,000:
   - Sell €10,000 of VWCE (all-world equity)
   - Buy €10,000 of CSBGE3 (bond ETF)
5. After transactions settle:
   - Navigate to **"Assets"**
   - Edit VWCE: reduce quantity
   - Edit CSBGE3: increase quantity
   - Update prices to get latest values
6. Check **"Allocation"** → deviations reduced

### Tracking FIRE Progress (Future)
1. User sets FIRE target: €1,000,000
2. Current net worth: €251,953 (25% complete)
3. Monthly savings: €2,000
4. Assumed annual return: 7%
5. App calculates: **18.3 years to FIRE**
6. User adjusts scenarios:
   - Increase savings to €2,500 → 16.1 years
   - Reduce target to €800,000 → 14.2 years
7. Dashboard shows progress bar: 25% complete

## Localization & Formatting

### Italian Standards
- **Currency**: €1.234,56 (period for thousands, comma for decimals)
- **Dates**: DD/MM/YYYY (e.g., 31/12/2024)
- **Percentages**: 12,34% (comma for decimals)
- **Number Format**: Use `Intl.NumberFormat('it-IT')`

### UI Language
- Primary language: Italian for user-facing strings
- Technical terms: English is acceptable (ETF, FIRE, etc.)
- Action labels: Italian (COMPRA, VENDI, OK)
- Navigation: Italian (Dashboard → Panoramica, Assets → Patrimonio)

### Color Coding
- **Asset Classes**:
  - Equity: Blue (#3B82F6)
  - Bonds: Red (#EF4444)
  - Crypto: Amber (#F59E0B)
  - Real Estate: Green (#10B981)
  - Cash: Gray (#6B7280)
  - Commodity: Brown (#92400E)
- **Allocation Differences**:
  - Over-allocated (needs selling): Red
  - Under-allocated (needs buying): Orange
  - On target: Green
  - Close to target (±1%): Yellow

## Special Asset Handling

### Real Estate
- **Fixed Valuation**: Manually set price (doesn't update from Yahoo Finance)
- **Illiquid Flag**: Excluded from "Liquid Net Worth"
- **Example**: Casa Rovereto s/s = €58,745.99 (fixed)
- **Update Process**: User manually updates value when reassessed

### Private Equity
- **Fixed Valuation**: Academia Private Equity = €4,000 (fixed)
- **No Market Price**: Doesn't trade publicly
- **Update Process**: User updates when quarterly reports received

### Pension Funds
- **Semi-Liquid**: Fondo Pensione Giuseppe
- **Price Updates**: May require manual updates (check if Yahoo Finance has ticker)
- **Special Category**: Tracked separately under equity sub-category

### Cryptocurrency
- **High Volatility**: Prices update frequently
- **Multiple Tickers**: WBIT (Bitcoin), CETH (Ethereum)
- **Euro Pairs**: Use EUR pairs when available (BTC-EUR vs BTC-USD)

### Bank Accounts (Cash)
- **Fixed Value**: No price updates needed
- **Quantity = Balance**: Conto BNL = €14,962.56
- **Price = 1**: Always €1.00 per "share"

## Error Handling & Edge Cases

### Price Update Failures
- **Ticker Not Found**: Log error, skip asset, continue with others
- **API Timeout**: Retry once, then mark as failed
- **Invalid Response**: Use previous price, log warning
- **Zero Price**: Reject as invalid, keep previous price

### Data Validation
- **Quantity**: Must be positive number
- **Percentage**: Must be 0-100
- **Ticker**: Must match format (alphanumeric + optional .XX suffix)
- **Allocation Totals**: Must sum to exactly 100%

### User Experience
- **Loading States**: Show spinners during async operations
- **Error Toasts**: Clear, actionable error messages
- **Confirmation Dialogs**: Confirm before deleting assets
- **Optimistic Updates**: Update UI immediately, rollback on failure
- **Empty States**: Helpful messages when no data (e.g., "Add your first asset to get started")

## Security Considerations

### Firestore Rules
```javascript
// Users can only read/write their own data
match /users/{userId} {
  allow read, write: if request.auth.uid == userId;
}

// Assets belong to users
match /assets/{assetId} {
  allow read, write: if request.auth.uid == resource.data.userId;
}

// Price history readable by all authenticated users
// Only backend can write (via Admin SDK)
match /priceHistory/{document} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

### API Security
- **Authentication**: All API routes verify Firebase Auth token
- **Authorization**: Users can only access their own data
- **Rate Limiting**: Prevent abuse of price update endpoint
- **Input Validation**: Sanitize all user inputs (ticker, quantity, etc.)
- **SQL Injection**: N/A (Firestore is NoSQL)
- **XSS Prevention**: React auto-escapes by default

### Data Privacy
- **No Third-Party Analytics**: User data stays in Firebase
- **No External Portfolio Services**: Direct Yahoo Finance integration only
- **Encrypted Transmission**: HTTPS for all requests
- **Firebase Security**: Google-managed infrastructure, SOC 2 certified

## Performance Optimization

### Frontend
- **Code Splitting**: Dynamic imports for charts (loaded on-demand)
- **Memoization**: `React.memo` for expensive chart components
- **Lazy Loading**: Images and heavy components load when visible
- **Bundle Size**: Tree-shaking to remove unused code

### Backend
- **Batch Operations**: Update multiple prices in single Firebase batch write
- **Caching**: Cache Yahoo Finance responses (5-minute TTL)
- **Pagination**: Limit asset list to 100 per page (if user has many assets)
- **Indexing**: Firestore composite indexes for complex queries

### Database
- **Denormalization**: Store computed values (totalValue) to avoid recalculation
- **Snapshot Strategy**: Pre-compute historical data instead of aggregating on-the-fly
- **Selective Fetching**: Only fetch fields needed for each view

## Testing Strategy

### Manual Testing
- **Authentication Flow**: Register, login, logout, password reset
- **Asset CRUD**: Add, edit, delete, list all operations
- **Price Updates**: Manual trigger, verify prices update correctly
- **Allocation Calculations**: Verify math is correct
- **Charts**: Check percentages sum to 100%, colors consistent
- **Responsive Design**: Test on mobile, tablet, desktop
- **Error Scenarios**: Test with invalid tickers, network failures

### Automated Testing (Future)
- **Unit Tests**: Test calculation functions (allocation, percentages)
- **Integration Tests**: Test API routes with mock Firebase
- **E2E Tests**: Playwright/Cypress for critical user flows
- **Visual Regression**: Percy or Chromatic for UI consistency

## Deployment

### Vercel Configuration
```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install"
}
```

### Environment Variables
Set in Vercel dashboard (Settings → Environment Variables):
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `FIREBASE_ADMIN_PRIVATE_KEY` (for server-side)

### Cron Jobs (Vercel Cron)
Create `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/prices/update",
    "schedule": "0 22 30,31 * *"  // 10 PM on 30th and 31st of every month
  }]
}
```

### Custom Domain (Optional)
- Register domain (e.g., `portfolio.example.com`)
- Add in Vercel dashboard
- Configure DNS (automatic with Vercel nameservers)

## Future Roadmap

### Phase 2: Historical Analysis
- [ ] Monthly snapshot creation (automated)
- [ ] Net worth timeline chart
- [ ] Liquid vs illiquid split chart
- [ ] Year-over-year growth metrics
- [ ] Asset class evolution chart (stacked area)

### Phase 3: FIRE Tracking
- [ ] FIRE target configuration
- [ ] Years to FIRE calculator
- [ ] Withdrawal rate calculator (4% rule)
- [ ] Scenario modeling (different savings rates)
- [ ] Progress visualization

### Phase 4: Advanced Features
- [ ] CSV/Excel import for bulk asset additions
- [ ] PDF export of portfolio reports
- [ ] Email notifications (monthly summary)
- [ ] Multi-currency support (full)
- [ ] Budget tracking integration
- [ ] Tax reporting (capital gains, dividends)

### Phase 5: Portfolio Analysis
- [ ] Performance metrics (ROI, IRR)
- [ ] Risk metrics (Sharpe ratio, volatility)
- [ ] Correlation analysis
- [ ] Factor exposure breakdown
- [ ] Backtesting allocation strategies

## Support & Maintenance

### Common Issues
1. **Ticker not found**: Verify format (US tickers no suffix, EU needs .DE/.L/.MI)
2. **Prices not updating**: Check Yahoo Finance API status, verify network
3. **Allocation doesn't sum to 100%**: Rounding errors, use 2 decimal places max
4. **Charts not loading**: Check Recharts version, verify data format

### Debugging
- **Firebase Console**: View raw database documents
- **Vercel Logs**: Check API route execution and errors
- **Browser DevTools**: Network tab for failed requests
- **React DevTools**: Component state and props inspection

### Contact
For questions or issues related to this project:
- Check TODO.md for implementation details
- Review Firebase/Vercel documentation
- Consult Next.js App Router guides

## License
Private project - All rights reserved

## Acknowledgments
- Built to replace 5+ years of Google Sheets tracking
- Inspired by FIRE community portfolio tracking needs
- Designed for Italian investors (EUR, XETRA, Borsa Italiana)

---

**Version**: 1.0.0 (MVP)  
**Last Updated**: November 2025  
**Status**: In Development