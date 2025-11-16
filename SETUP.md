# Setup Guide - Portfolio Tracker

This guide will walk you through setting up the Portfolio Tracker application from scratch, including Firebase configuration, Vercel deployment, and available alternatives.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Firebase Setup](#firebase-setup)
3. [Local Development Setup](#local-development-setup)
4. [Vercel Deployment](#vercel-deployment)
5. [Price Data Provider Alternatives](#price-data-provider-alternatives)
6. [Infrastructure Alternatives](#infrastructure-alternatives)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18.x or higher ([Download](https://nodejs.org/))
- **npm** or **yarn** package manager
- A **Google account** (for Firebase)
- A **Vercel account** (free tier available at [vercel.com](https://vercel.com))
- **Git** installed on your machine

---

## Firebase Setup

Firebase provides the backend infrastructure (database, authentication) for this application.

### Step 1: Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or **"Create a project"**
3. Enter a project name (e.g., `portfolio-tracker`)
4. (Optional) Enable Google Analytics if desired
5. Click **"Create project"**

### Step 2: Enable Firebase Authentication

1. In your Firebase project, navigate to **Build** → **Authentication**
2. Click **"Get started"**
3. Enable the following sign-in methods:
   - **Email/Password**: Click "Enable" and save
   - **Google**: Click "Enable", add your support email, and save

### Step 3: Create Firestore Database

1. Navigate to **Build** → **Firestore Database**
2. Click **"Create database"**
3. Choose a starting mode:
   - **Production mode** (recommended): Start with secure rules, you'll configure them next
   - **Test mode**: Open access (not recommended for production)
4. Select a Cloud Firestore location (choose closest to your users, e.g., `europe-west1` for Europe)
5. Click **"Enable"**

### Step 4: Configure Firestore Security Rules

1. In Firestore Database, go to the **Rules** tab
2. Replace the default rules with the following:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can only read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Assets belong to users
    match /assets/{assetId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }

    // Asset allocation targets belong to users
    match /assetAllocationTargets/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Expenses belong to users
    match /expenses/{expenseId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }

    // Expense categories belong to users
    match /expenseCategories/{categoryId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }

    // Monthly snapshots belong to users
    match /monthlySnapshots/{snapshotId} {
      allow read: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create, update: if request.auth != null && request.auth.uid == request.resource.data.userId;
      allow delete: if request.auth != null && request.auth.uid == resource.data.userId;
    }

    // Hall of Fame - personal rankings belong to users
    match /hall-of-fame/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow create, update: if request.auth != null &&
                              request.auth.uid == userId &&
                              request.resource.data.userId == userId;
      allow delete: if request.auth != null && request.auth.uid == userId;
    }

    // Price history readable by all authenticated users
    // Only backend can write (via Admin SDK)
    match /priceHistory/{document} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

3. Click **"Publish"** to save the rules

### Step 5: Get Firebase Configuration

1. In the Firebase Console, click the **gear icon** → **Project settings**
2. Scroll down to **"Your apps"** section
3. Click the **Web icon** (`</>`) to add a web app
4. Register your app with a nickname (e.g., `Portfolio Tracker Web`)
5. Copy the Firebase configuration object - you'll need these values:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### Step 6: Generate Firebase Admin SDK Credentials

For server-side operations (API routes), you need Admin SDK credentials:

1. In **Project settings** → **Service accounts** tab
2. Click **"Generate new private key"**
3. Click **"Generate key"** to download the JSON file
4. **IMPORTANT**: Keep this file secure and **never commit it to Git**
5. Save this file - you'll need it for environment variables

---

## Local Development Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-username/net-worth-tracker.git
cd net-worth-tracker
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
# Firebase Client SDK (public - safe to expose)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Firebase Admin SDK (server-side - keep secret!)
# Option A: Use the entire service account JSON (RECOMMENDED)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n..."}

# Option B: Use individual fields (for local development)
# FIREBASE_ADMIN_PROJECT_ID=your_project_id
# FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
# FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"

# Cron Job Security
CRON_SECRET=your_secure_random_string_here

# App URL (for cron jobs and redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Registration Control (optional - for restricting signups)
NEXT_PUBLIC_REGISTRATIONS_ENABLED=true
NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED=false
NEXT_PUBLIC_REGISTRATION_WHITELIST=
```

**How to get the values:**
- Firebase Client SDK values: From Firebase Console → Project Settings → Your apps
- `FIREBASE_SERVICE_ACCOUNT_KEY`: Paste the entire content of the downloaded JSON file
- `CRON_SECRET`: Generate a random string (e.g., use `openssl rand -hex 32`)

**For detailed Firebase Admin SDK configuration on Vercel, see [VERCEL_SETUP.md](./VERCEL_SETUP.md)**

### Step 4: Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Step 5: Create Your First User

1. Navigate to `/register`
2. Create an account with email/password or Google sign-in
3. Log in and start adding your assets!

---

## Vercel Deployment

### Step 1: Push to GitHub

1. Create a new GitHub repository
2. Push your local code:

```bash
git remote add origin https://github.com/your-username/your-repo.git
git branch -M main
git push -u origin main
```

### Step 2: Import Project to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository
4. Configure the project:
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `./` (leave default)
   - **Build Command**: `npm run build` (auto-configured)
   - **Output Directory**: `.next` (auto-configured)

### Step 3: Configure Environment Variables on Vercel

1. In the **"Configure Project"** section, expand **"Environment Variables"**
2. Add all the variables from your `.env.local` (see [Local Development Setup](#step-3-configure-environment-variables))
3. **IMPORTANT**: Set environment to **Production**, **Preview**, and **Development**
4. For `NEXT_PUBLIC_APP_URL`, use your Vercel deployment URL (e.g., `https://your-app.vercel.app`)

**Recommended approach for Firebase Admin SDK:**
- Use `FIREBASE_SERVICE_ACCOUNT_KEY` with the full JSON content (see [VERCEL_SETUP.md](./VERCEL_SETUP.md) for details)

### Step 4: Deploy

1. Click **"Deploy"**
2. Wait for the deployment to complete (usually 1-2 minutes)
3. Visit your deployed app at `https://your-app.vercel.app`

### Step 5: Configure Cron Jobs

Vercel Cron Jobs are configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/monthly-snapshot",
      "schedule": "0 19 * * *"
    }
  ]
}
```

**Schedule format**: `minute hour day month dayOfWeek` (cron syntax)

**Current schedule**: `0 19 * * *`
- Runs daily at 19:00 UTC (20:00 CET in winter, 21:00 CEST in summer)

**To run only at month-end**:
```json
"schedule": "0 19 28-31 * *"
```
- Runs at 19:00 UTC on days 28-31 of every month
- Covers all month lengths (28 for February, 30 for Apr/Jun/Sep/Nov, 31 for others)

**To change the time**:
- Adjust the hour to your preferred time in UTC
- Example: `0 22 28-31 * *` runs at 22:00 UTC (23:00/00:00 in Italy)

**Cron job authentication**:
- The cron endpoint is protected by `CRON_SECRET` environment variable
- Only requests with the correct secret can trigger the snapshot creation

**After modifying `vercel.json`:**
1. Commit and push changes to GitHub
2. Vercel will automatically redeploy with new cron configuration

---

## Price Data Provider Alternatives

This application currently uses **Yahoo Finance** for stock/ETF price data via the `yahoo-finance2` npm package. Yahoo Finance is free, reliable, and has extensive ticker coverage.

### Why Yahoo Finance?

- ✅ **Free**: No API key required, no rate limits for reasonable use
- ✅ **Global Coverage**: US, European, Asian exchanges
- ✅ **Real-time Data**: Delayed 15-20 minutes (acceptable for portfolio tracking)
- ✅ **No Registration**: Works out of the box

### Alternative Price Data Providers

If you want to use a different provider, here are some alternatives:

#### 1. **Alpha Vantage**
- **Website**: [alphavantage.co](https://www.alphavantage.co/)
- **Pricing**: Free tier (5 API calls/minute, 500 calls/day)
- **Coverage**: Stocks, forex, crypto, commodities
- **API Key**: Required (free registration)
- **Implementation**: Requires custom integration (not included)

**How to implement**:
1. Register for API key at Alpha Vantage
2. Replace `yahooFinanceService.ts` with Alpha Vantage API calls
3. Update `/api/prices/quote` and `/api/prices/update` routes
4. Handle rate limiting (5 calls/min on free tier)

#### 2. **Finnhub**
- **Website**: [finnhub.io](https://finnhub.io/)
- **Pricing**: Free tier (60 API calls/minute)
- **Coverage**: Stocks, forex, crypto, economic data
- **API Key**: Required (free registration)
- **Implementation**: Requires custom integration (not included)

**How to implement**:
1. Register for API key at Finnhub
2. Install `finnhub` npm package or use fetch API
3. Replace `yahooFinanceService.ts` with Finnhub client
4. Update API routes to use Finnhub endpoints

#### 3. **Twelve Data**
- **Website**: [twelvedata.com](https://twelvedata.com/)
- **Pricing**: Free tier (800 API calls/day, 8 calls/minute)
- **Coverage**: Stocks, forex, crypto, ETFs, indices
- **API Key**: Required (free registration)
- **Implementation**: Requires custom integration (not included)

**How to implement**:
1. Register for API key at Twelve Data
2. Install `twelvedata` npm package
3. Replace `yahooFinanceService.ts` with Twelve Data client
4. Update API routes and handle rate limits

### Implementation Notes

⚠️ **Important**: The current codebase is designed for Yahoo Finance. Switching to an alternative provider requires:

1. **Replacing the service layer**: Modify `src/services/yahooFinanceService.ts`
2. **Updating API routes**: Modify `/api/prices/quote` and `/api/prices/update`
3. **Handling rate limits**: Implement queuing or caching
4. **Testing ticker formats**: Different providers may use different symbols
5. **Error handling**: API-specific error codes and responses

**Development effort**: Approximately 4-8 hours depending on provider complexity.

If you decide to implement an alternative provider, consider:
- Creating a generic `PriceProvider` interface
- Implementing provider-specific classes (e.g., `YahooFinanceProvider`, `AlphaVantageProvider`)
- Using environment variables to switch between providers

---

## Infrastructure Alternatives

While this guide focuses on Firebase + Vercel, the application architecture is flexible enough to support alternatives.

### Database Alternatives to Firebase Firestore

#### 1. **MongoDB Atlas**
- **Type**: NoSQL document database
- **Pricing**: Free tier (512MB storage)
- **Migration effort**: Medium (Firestore and MongoDB are both document-based)

**Changes required**:
- Replace `firebase-admin` with `mongodb` npm package
- Update service layer to use MongoDB queries instead of Firestore
- Modify authentication (use Clerk, Auth0, or custom JWT)
- Update security rules → implement server-side authorization checks

#### 2. **Supabase**
- **Type**: PostgreSQL database with real-time features
- **Pricing**: Free tier (500MB database, 2GB bandwidth)
- **Migration effort**: High (SQL vs NoSQL paradigm shift)

**Changes required**:
- Replace Firestore collections with PostgreSQL tables
- Migrate to Supabase Auth (similar to Firebase Auth)
- Rewrite queries from NoSQL → SQL
- Update all service layer files

#### 3. **PlanetScale / Railway PostgreSQL**
- **Type**: Serverless MySQL / PostgreSQL
- **Pricing**: Free tiers available
- **Migration effort**: High (SQL migration)

**Changes required**:
- Similar to Supabase migration
- Use Prisma ORM for type-safe database access
- Implement authentication separately (NextAuth.js recommended)

### Hosting Alternatives to Vercel

#### 1. **Netlify**
- **Pricing**: Free tier (100GB bandwidth, 300 build minutes/month)
- **Cron Jobs**: Via Netlify Scheduled Functions
- **Migration effort**: Low

**Changes required**:
- Create `netlify.toml` configuration
- Convert Vercel Cron to Netlify Scheduled Functions
- Deploy via Netlify CLI or GitHub integration

#### 2. **Railway**
- **Pricing**: Free tier ($5/month credit)
- **Cron Jobs**: Via Railway Cron Jobs or external scheduler
- **Migration effort**: Low-Medium

**Changes required**:
- Configure Railway deployment settings
- Set up environment variables in Railway dashboard
- Implement cron jobs via Railway's built-in scheduler or use external service (e.g., cron-job.org)

#### 3. **Self-Hosted (Docker + VPS)**
- **Pricing**: VPS cost (e.g., DigitalOcean from $5/month)
- **Cron Jobs**: Standard Linux cron
- **Migration effort**: Medium

**Requirements**:
- Create Dockerfile for Next.js app
- Set up reverse proxy (nginx)
- Configure systemd or docker-compose for auto-restart
- Set up cron jobs in Linux crontab

**Changes required**:
- Create production `Dockerfile`
- Configure PM2 or similar process manager
- Set up SSL certificates (Let's Encrypt)
- Manual deployment process

### Recommendation

For most users, **Firebase + Vercel** is the best choice because:
- ✅ Generous free tiers
- ✅ Minimal configuration
- ✅ Automatic scaling
- ✅ Built-in authentication
- ✅ Real-time updates (Firestore)
- ✅ Easy cron job setup

Consider alternatives only if:
- You need SQL features (joins, complex queries)
- You're already using a different provider ecosystem
- You have specific compliance requirements

---

## Troubleshooting

### Common Issues

#### 1. **"Module not found: Can't resolve 'child_process'"**

**Cause**: `yahoo-finance2` package imported in a client component (runs in browser)

**Solution**:
- Always use server-side API routes for price fetching
- Import `yahoo-finance2` only in `/api` routes or server components
- Client components should call `/api/prices/quote` endpoint

#### 2. **"Error: Getting metadata from plugin failed with error: DECODER routines::unsupported"**

**Cause**: Firebase Admin SDK private key formatting issue on Vercel

**Solution**:
- See detailed guide in [VERCEL_SETUP.md](./VERCEL_SETUP.md)
- Use `FIREBASE_SERVICE_ACCOUNT_KEY` with full JSON content instead of separate variables

#### 3. **Cron job not running**

**Debugging steps**:
1. Check Vercel dashboard → Deployments → Your deployment → Functions
2. Verify `CRON_SECRET` environment variable is set
3. Check cron schedule syntax in `vercel.json`
4. View function logs for errors
5. Test endpoint manually: `curl https://your-app.vercel.app/api/cron/monthly-snapshot?secret=YOUR_CRON_SECRET`

#### 4. **Price updates failing**

**Possible causes**:
- Invalid ticker format (use `.DE` for XETRA, `.L` for London, etc.)
- Yahoo Finance API temporarily unavailable
- Network timeout

**Solutions**:
- Verify ticker symbol on [Yahoo Finance](https://finance.yahoo.com/)
- Check API route logs in Vercel dashboard
- Add error handling and retry logic

#### 5. **"Allocation doesn't sum to 100%"**

**Cause**: Rounding errors or incorrect target percentages

**Solution**:
- Go to Settings page
- Verify all target percentages sum to exactly 100%
- Use the formula-based allocation feature for automatic calculation

#### 6. **"Cannot read property 'uid' of null"**

**Cause**: Authentication state not loaded or user not logged in

**Solution**:
- Ensure `AuthContext` properly wraps your app in `layout.tsx`
- Check that `useAuth()` hook is used inside `AuthProvider`
- Verify Firebase Auth configuration in environment variables

#### 7. **Expenses not showing in charts**

**Possible causes**:
- No expenses created for the current year
- Date filter excluding expenses
- Chart data calculation error

**Solutions**:
- Check expense table has entries
- Verify year/month filters in UI
- Check browser console for JavaScript errors

### Getting Help

If you encounter issues not covered here:

1. **Check the logs**:
   - Vercel: Dashboard → Deployments → Functions tab
   - Browser: Developer Tools → Console tab

2. **Review configuration**:
   - Verify all environment variables are set correctly
   - Check Firebase security rules allow your operations

3. **Search existing issues**:
   - GitHub Issues: Check if someone else had the same problem
   - Stack Overflow: Search for error messages

4. **Open an issue**:
   - Provide error messages, logs, and steps to reproduce
   - Include environment details (Node version, deployment platform)

---

## Next Steps

After completing the setup:

1. **Create your first assets**: Navigate to "Patrimonio" page and add your holdings
2. **Set allocation targets**: Go to "Impostazioni" and configure your target allocation
3. **Add expenses**: Track your income and expenses in "Tracciamento Spese"
4. **Create first snapshot**: Manually create a snapshot or wait for the monthly cron job
5. **Monitor FIRE progress**: Visit the "FIRE" page to track your financial independence journey

For detailed feature documentation, see the main [README.md](./README.md).

---

## Security Best Practices

⚠️ **IMPORTANT**:

- **Never commit** `.env.local` or Firebase service account JSON files to Git
- **Never share** your `CRON_SECRET` or Firebase Admin credentials publicly
- **Always use** environment variables for sensitive data
- **Enable** Firestore security rules to prevent unauthorized access
- **Regularly review** Firebase Console → Authentication → Users for suspicious activity
- **Use** the registration control system to limit who can create accounts (see README.md)

Add these to `.gitignore`:
```
.env.local
.env
firebase-adminsdk-*.json
serviceAccountKey.json
```

---

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](./LICENSE) file for details.
