# Setup Guide - Portfolio Tracker

This guide will walk you through setting up the Portfolio Tracker web app from scratch, using the `net-worth-tracker` repository as the codebase source, including Firebase configuration, Vercel deployment, and available alternatives.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Firebase Setup](#firebase-setup)
3. [Local Development Setup](#local-development-setup)
4. [Local Verification Troubleshooting](#local-verification-troubleshooting)
5. [Vercel Deployment](#vercel-deployment)
6. [Price Data Provider Alternatives](#price-data-provider-alternatives)
7. [Infrastructure Alternatives](#infrastructure-alternatives)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18.x or higher ([Download](https://nodejs.org/))
- **npm** or **yarn** package manager
- A **Google account** (for Firebase)
- A **Vercel account** (free tier available at [vercel.com](https://vercel.com))
- **Git** installed on your machine
- **Firebase CLI** installed globally (recommended for deploying Firestore rules from the versioned repo file): `npm install -g firebase-tools`

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

Do not manually copy a rules snippet from this guide. The authoritative rules live in the versioned repo file [firestore.rules](./firestore.rules), and they must stay aligned with the collections currently used by the app.

1. Log in with the Firebase CLI:

```bash
firebase login
```

2. Link the repo to your Firebase project:

```bash
firebase use --add
```

3. Deploy the rules directly from the repo root:

```bash
firebase deploy --only firestore:rules
```

4. Verify in Firebase Console → **Firestore Database** → **Rules** that the published rules match [firestore.rules](./firestore.rules)

If you prefer using the Firebase Console UI, copy the contents of [firestore.rules](./firestore.rules) exactly as-is.

### Step 4b: Deploy Firestore Indexes

The app requires composite indexes for multi-field queries (e.g. filtering by `userId` and ordering by `date`). These are defined in [firestore.indexes.json](./firestore.indexes.json) and must be deployed alongside the rules:

```bash
firebase deploy --only firestore:indexes
```

Or deploy rules and indexes together in one command:

```bash
firebase deploy --only firestore
```

Index creation can take a few minutes. You can monitor progress in Firebase Console → **Firestore Database** → **Indexes**. Queries that depend on a missing index will fail with an error that includes a direct link to create it — if you see that in the browser console, it means this step was skipped.

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
# NOTE: the whitelist itself is server-only (no NEXT_PUBLIC_ prefix) — the email list
# must never reach the client bundle. Only the two toggles are public.
NEXT_PUBLIC_REGISTRATIONS_ENABLED=true
NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED=false
REGISTRATION_WHITELIST=

# Development Features (optional - for testing/demo)
NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS=false

# Resend — Monthly email summaries (optional)
# Required only if you want to receive automatic monthly portfolio reports.
# Sign up for free at https://resend.com (free tier: 3000 emails/month).
RESEND_API_KEY=
RESEND_FROM_EMAIL=onboarding@resend.dev
```

**How to get the values:**
- Firebase Client SDK values: From Firebase Console → Project Settings → Your apps
- `FIREBASE_SERVICE_ACCOUNT_KEY`: Paste the entire content of the downloaded JSON file
- `CRON_SECRET`: Generate a random string (e.g., use `openssl rand -hex 32`)
- `NEXT_PUBLIC_ENABLE_TEST_SNAPSHOTS`: Set to `true` to enable dummy data generation in Settings page (for development, testing, or demo purposes). **Warning**: Test data is saved to the same Firebase collections as real data. You can delete all dummy data using the "Elimina Tutti i Dati Dummy" button in Settings. See [README.md](./README.md) for full feature documentation. **Recommended**: Keep `false` in production environments.
- `ANTHROPIC_API_KEY` (optional): Enables AI-powered performance analysis. If omitted, the rest of the app still works normally.
- `RESEND_API_KEY` (optional): Enables monthly email summaries. Create a free API key at [resend.com/api-keys](https://resend.com/api-keys). If omitted, the email feature is silently disabled.
- `RESEND_FROM_EMAIL` (optional): Sender address for monthly emails. Options:
  - `onboarding@resend.dev` — Resend shared domain, no setup required. Delivers only to your Resend account's email address (suitable for personal/single-user deployments).
  - A verified custom domain address (e.g. `noreply@yourdomain.com`) — required to deliver to arbitrary recipients. Add your domain under Resend → Domains and configure the provided DNS records. Note: `*.vercel.app` subdomains cannot be verified as sending domains.

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

### Step 5b (Optional): Shared account — delegated access

A second user can be granted full co-owner read/write on your account (Impostazioni →
Condivisione account). Three prerequisites, in this order, or the add fails:

1. **The guest must be in the whitelist**: add their email to `REGISTRATION_WHITELIST`
   (with `NEXT_PUBLIC_REGISTRATION_WHITELIST_ENABLED=true`) so they can register at all.
2. **The guest must register first**: the add resolves their email to a Firebase UID, and
   a non-existent user returns a 404 («La persona deve prima registrarsi»). Have them
   complete `/register` before you add them.
3. **`firestore.rules` must be deployed** (Step 4 of Firebase Setup): enforcement of the
   delegated access lives in the rules; without the deploy the grant document exists but
   reads are denied.

The guest's theme stays their own; everything else (data, mutations) operates on the
owner's account via the account switcher in the sidebar.

### Step 6 (Optional but recommended): Local testing with the Firebase Emulator Suite

Run the app against **local** Auth + Firestore emulators instead of the cloud project, so
development and manual testing never touch production data. The emulator also loads
`firestore.rules`, so you validate rule changes locally before deploying them.

**Prerequisite — a Java runtime, version 21 OR ABOVE.** The Firestore emulator runs on Java,
and current `firebase-tools` refuses anything older ("no longer supports Java version before 21"
— an installed JDK 15 that used to work stopped working on 2026-08-14). On Windows:

```powershell
winget install Microsoft.OpenJDK.21
# then open a NEW terminal so PATH refreshes, and verify:
java -version
```

(macOS: `brew install temurin` · Debian/Ubuntu: `sudo apt install openjdk-21-jre`.)

If you can't (or don't want to) replace the system Java, a portable JRE works: extract a
Temurin 21 JRE zip anywhere (e.g. `%USERPROFILE%\.jdk\`) and prepend its `bin` to `PATH`
just for the emulator terminal — that is how the E2E runs are driven on this machine.

**Usage — three terminals:**

```bash
# 1) Start the emulators (Auth :9099, Firestore :8080, UI :4000). First run downloads the jars.
npm run emulators

# 2) Seed a synthetic test account (only needed once — see persistence note below).
npm run emulators:seed

# 3) Run the app pointed at the emulators.
npm run dev:emulator
```

Then open [http://localhost:3000](http://localhost:3000) and log in with the seeded account:

- **Email:** `test@example.com`  ·  **Password:** `test1234`

Inspect the data live in the Emulator UI at [http://127.0.0.1:4000](http://127.0.0.1:4000).

**What the seed creates** (`scripts/seedEmulator.ts`): the test user plus a representative
portfolio — 4 ledger assets (ETF / stock / bond / crypto), a cash account, a primary residence,
allocation settings, a few expense categories + expenses, and two monthly snapshots.

**Data persistence:** `npm run emulators` imports the previous session's data on start and exports
it on exit (`Ctrl+C`), so you **seed once** and your data survives restarts. To start clean, delete
the `.emulator-data/` directory (gitignored) and re-seed.

**Notes:**
- Nothing here touches production: the client SDK is routed to the emulators by
  `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`, and the Admin SDK by `FIRESTORE_EMULATOR_HOST` — both
  set automatically by the npm scripts. The emulators run offline under the `demo-net-worth`
  project id (no `firebase login` required).
- The external integrations (Yahoo Finance, Frankfurter FX, Anthropic, FRED) still call the real
  services — only Firestore and Auth are emulated.

### Step 7 (Optional): Browser tests with Playwright

The Vitest suite (`npm test`) covers the pure utilities and services, which is where this codebase
keeps its logic. What it cannot see is anything that only exists once a browser lays the page out:
the `desktop:` layout switch at 1440px, an animated collapsible, or a loading state that briefly
shows the wrong content. That is what the Playwright suite is for.

**Prerequisite — the emulators from Step 6 must already be running**, seeded once:

```bash
npm run emulators        # terminal 1, leave running
npm run emulators:seed   # once, the base test account
```

Then install the browser (first time only) and run the suite:

```bash
npx playwright install chromium
npm run test:e2e         # or: npm run test:e2e:ui  (interactive runner)
```

Playwright starts its own app server on **port 3100** and seeds its fixture automatically — no third
terminal needed. If the emulators are not up it fails immediately with the two commands above
rather than a connection stack trace.

**Why port 3100 and a separate build directory:** Next refuses to start a second `next dev` for the
same project directory whatever the port, because the lock lives inside the build dir. `npm run
dev:e2e` therefore sets `NEXT_DIST_DIR=.next-e2e` (a conditional line in `next.config.ts`, inert
everywhere else), so the tests can run while your normal dev server stays up on port 3000 — which
also guarantees they never point at production data.

**What it covers** (`e2e/`), across five projects — `desktop` (1440px), `mobile` (390px),
`degraded` (1440px, second account), `analisi` (1440px) and `analisi-mobile` (390px):

- **Previdenza** — layout switch, type scale, the year axis, the collapsible, the primary action's
  position, that the empty state never flashes while data loads, and the three degraded states
  (`suspicious` / `idle` / `fresh`).
- **Analisi** — the focus-URL cold load, search → dossier (including a zero-spend entity and the
  transfer exclusion), the focus surviving a period switch, the KPI pacing rows, the driver ranking
  with `Cessata`, the per-subcategory breakdown inside a year row, and the mobile truncation caption.

Three fixture accounts, each seeded by the global setup:

| Script | Account | Why it is separate |
| --- | --- | --- |
| `npm run e2e:seed` | base + `test-user-degraded` | Pension data layered on the Step 6 seed; the degraded scenarios take an argument (`suspicious` \| `idle` \| `fresh` \| `performance` — the last one is Rendimenti's: an ETF beside a pension fund marked `excluded`, four snapshots, one TFR, for `e2e/performance.degraded.spec.ts`) |
| `npm run e2e:seed:analisi` | `test-user-analisi` | Every expense dated **January**, so year-to-date windows contain them whatever month the suite runs in and every asserted figure stays exact all year. The base seed's current-month expenses would pollute them |

Run either on its own if you want that data in the browser for manual inspection.

**Area exercise scripts** (emulator, rules enforced, not part of the Playwright run):
`npm run emulators:pension` drives the pension contribution services end to end;
`npm run emulators:pension-p3` checks the Rendimenti-exclusion and FIRE lock-in wiring on a
throwaway synthetic account.

**Notes:**
- Authentication happens once in `e2e/auth.setup.ts` and is reused by every spec via
  `storageState`. It is captured with `indexedDB: true` because the Firebase Web SDK stores its
  session there — without that flag the state file looks fine but every spec lands on the login page.
- The suite runs with `workers: 1`: all specs share one emulator account, so parallel runs would
  race on it.
- Chromium only, for every project. The mobile projects are a 390px viewport on Chromium rather than
  the WebKit-backed iPhone descriptor — one browser to install, and what is under test is the layout
  at a width, not an engine difference.

---

## Local Verification Troubleshooting

Environment traps that look like code defects. If errors cluster in files you never touched, suspect
this section before the diff.

### `tsc` reports missing modules right after a branch switch

`node_modules` is shared across branches in one working directory and git does not track it. Checking
out a branch swaps `package.json` back but not what is physically installed, so packages the new
branch declares can simply be absent. **The tell is WHERE the errors land**: e.g. ~25 errors, all
inside `e2e/`, `playwright.config.ts` and `lib/utils/expenseImport.ts` — the files owned by the
missing `@playwright/test` and `papaparse` — and none in the code being changed. Run `npm install`
before debugging, or `npm install --no-save <pkg>` for a one-off verification run that leaves the
manifest and lockfile alone.

### All three Playwright auth setups fail with the "npx playwright install" banner

The Chromium build is missing after a Playwright version bump: `npx playwright install chromium`.
Errors clustered in the *setups* rather than the specs mean environment, not diff.

### A port is still held after stopping a background process

Stopping a process does not kill its children on Windows: the emulator JVM and the dev server survive
and keep holding 8080 / 9099 / 4000 / 3100, so the next start fails with `EADDRINUSE` *while the
service still answers*. Find the real owner and stop it by PID:

```powershell
Get-NetTCPConnection -LocalPort 8080 -State Listen
```

### The emulator refuses to start for lack of Java 21 (Windows)

Moved here from AGENTS.md on 2026-09-06; on macOS a Homebrew OpenJDK (26 at the time of writing) starts the emulators
with `JAVA_HOME` unset, and `kill -INT` on the `firebase` CLI process runs the export-on-exit.

**The emulator needs Java ≥ 21; this machine now HAS it, and a shell already running may still not see it.** Temurin
  21 (`C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot`) was installed on 2026-08-30, the USER `JAVA_HOME`
  points at it and the user `PATH` carries `%JAVA_HOME%\bin`; the `Oracle\Java\javapath` shim — which resolved `java` to
  the JDK 15 whatever `JAVA_HOME` said — was removed from BOTH the user and machine scopes (the directory is still on
  disk, it is only off the PATH). **An environment change never reaches a process that is already running**: a session
  started before it keeps the old `PATH`, so `java -version` inside it still prints 15 and `(Get-Command java).Source`
  still names the shim — which is what the pre-2026-08-30 note above recorded as "this machine has no JDK 21". Read the
  SCOPES, not the process: `[Environment]::GetEnvironmentVariable('Path','Machine')` and `…'User'`, plus
  `[Environment]::GetEnvironmentVariable('JAVA_HOME','User')`. A new terminal picks the change up. The portable route of
  SETUP.md → Step 6 remains the fallback where it has not been picked up (`winget` is NOT on this shell's PATH): fetch
  the zip directly
  (`https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse`), expand it into the session
  scratchpad and export `JAVA_HOME`/`PATH` for the `npm run emulators` process only — no system change, nothing to undo.
  **In the Bash tool, `PATH` entries must be MSYS paths (`/c/Users/…`), not `C:/Users/…`**: `PATH` is colon-separated, so a
  drive letter splits the entry in two, the portable JDK never resolves, `java -version` still prints the system 15 and
  firebase-tools dies with "no longer supports Java version before 21" — a failure that reads as a missing download
  (verified 2026-08-30). `JAVA_HOME` itself is fine either way; check with `which java` before starting the emulators. Stopping the npm wrapper does **not** kill
  the JVM: the ports stay taken and the next start fails with "port taken", naming no stale process. Free them by PID — `netstat -ano | grep LISTENING | grep :8080`, then `taskkill //PID <pid> //F //T`, the same for `next dev` on :3100 — and only AFTER the Hub export.

### `npm run start` refuses to serve the build

`next.config.ts` sets `output: "standalone"`, so Next warns and refuses. Motion and
perceived-performance work must be judged on a production build (dev exaggerates cost, and its CSS
arrives via JS — under throttling it shows an unstyled window production does not have). The working
recipe, including the two copies Next does **not** do for you (skip them and every asset 404s, so the
page renders with no styles at all — easily mistaken for a rendering defect):

```powershell
npm run build
Copy-Item -Recurse -Force .next/static .next/standalone/.next/static
Copy-Item -Recurse -Force public .next/standalone/public
node .next/standalone/server.js
```

### Font-loading changes cannot be verified in dev

`next/font` emits no `<link rel="preload">` in `next dev` (0 on every route). The build filename
carries the answer instead: `-s.p.` in the hashed woff2 name means preloaded
(`797e433a….woff2` with `.p.` = preloaded; without `preload: true` the `.p.` is absent).

### Inspecting or cleaning a few emulator documents

An unauthenticated REST call against the Firestore emulator is silently filtered to an empty result
by the rules engine rather than erroring — which looks exactly like "no documents exist". Use the
emulator-only admin bypass token:

```bash
curl -H "Authorization: Bearer owner" \
  "http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents/expenses"
```

Same header with `-X DELETE` on a document path removes it, so a handful of leftovers from a manual
test run do not require wiping `.emulator-data/`.

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

Vercel Cron Jobs are configured in `vercel.json` file in the project root.

#### Understanding the Cron Configuration

The current `vercel.json` file contains:

```json
{
  "crons": [
    {
      "path": "/api/cron/monthly-snapshot",
      "schedule": "0 18 * * *"
    },
    {
      "path": "/api/cron/daily-dividend-processing",
      "schedule": "0 18 * * *"
    }
  ]
}
```

**What this does**:
- `/api/cron/monthly-snapshot`: Creates or updates monthly portfolio snapshots for all users
- `/api/cron/daily-dividend-processing`: Scrapes recent dividends, creates matching cashflow entries when payment dates are reached, and schedules next bond coupons
- `schedule`: When to run (cron syntax format, UTC)

#### Cron Schedule Format

The schedule uses standard cron syntax: `minute hour day month dayOfWeek`

| Field | Values | Example |
|-------|--------|---------|
| minute | 0-59 | `0` = at the start of the hour |
| hour | 0-23 (UTC) | `18` = 18:00 UTC (19:00 CET, 20:00 CEST) |
| day | 1-31 | `28-31` = days 28 through 31 |
| month | 1-12 or * | `*` = every month |
| dayOfWeek | 0-6 or * | `*` = every day of week |

#### Common Schedule Examples

**Current repo default** (`0 18 * * *`):
- Runs **every day** at 18:00 UTC
- Applies to both configured cron jobs
- This is convenient during active development, but the snapshot job runs daily

**Recommended for production snapshot schedule** (`0 18 28-31 * *`):
- Runs only on days **28-31** of each month at 18:00 UTC
- Covers all month lengths (Feb=28/29, Apr/Jun/Sep/Nov=30, others=31)
- Creates true monthly snapshots at month-end

**Suggested production split**:
- `/api/cron/monthly-snapshot`: `0 18 28-31 * *`
- `/api/cron/daily-dividend-processing`: keep daily, for example `0 18 * * *`

⚠️ **Trade-off of the month-end schedule.** The daily run is not only a development convenience: it
is what keeps the *current month's* snapshot close to reality. Anything that changes an asset's
value immediately — recording a pension contribution is the clearest case — is reflected in the
asset at once but only reaches the snapshot on the next cron run. Metrics computed from snapshots
therefore disagree with the live figures until then: a pension contribution understates the fund's
TWR by its own amount, and the Previdenza hero shows a value the return card is not yet using. With
the daily schedule that window closes the same evening; with `0 18 28-31 * *` it can last weeks.
Choose month-end for clean monthly data points, daily for figures that track what you just entered.

**Custom time examples**:
- `0 22 28-31 * *` - 22:00 UTC (23:00 CET, 00:00 CEST)
- `0 20 1 * *` - 1st day of each month at 20:00 UTC
- `0 18 15 * *` - 15th day of each month at 18:00 UTC

**Timezone note**:
- All times are in **UTC**
- Italy is UTC+1 (winter) or UTC+2 (summer)
- 18:00 UTC = 19:00 CET (winter) or 20:00 CEST (summer)

#### How to Modify the Cron Schedule

1. **Edit `vercel.json`** in your project root:
   ```json
   {
     "crons": [
       {
         "path": "/api/cron/monthly-snapshot",
        "schedule": "0 18 28-31 * *"
      },
      {
        "path": "/api/cron/daily-dividend-processing",
        "schedule": "0 18 * * *"
      }
    ]
  }
   ```

2. **Commit and push** to GitHub:
   ```bash
   git add vercel.json
   git commit -m "Update cron schedule to run at month-end only"
   git push
   ```

3. **Vercel auto-redeploys** with the new configuration (usually takes 1-2 minutes)

4. **Verify** in Vercel Dashboard → Your Project → Settings → Cron Jobs

#### Authentication & Security

**Important**: The cron endpoint is protected by the `CRON_SECRET` environment variable.

- Without the correct secret, the endpoint returns 401 Unauthorized
- Set `CRON_SECRET` in Vercel environment variables (see Step 3)
- The secret is automatically passed by Vercel's cron system

#### Testing Your Cron Job

**Manual test** (useful after configuration changes):

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" "https://your-app.vercel.app/api/cron/monthly-snapshot"
```

Replace:
- `your-app.vercel.app` with your actual Vercel URL
- `YOUR_CRON_SECRET` with the value from your environment variables

For the dividends job:

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" "https://your-app.vercel.app/api/cron/daily-dividend-processing"
```

**Expected response**:
```json
{
  "message": "Snapshots created successfully",
  "results": [...]
}
```

#### Monitoring Cron Execution

1. Go to **Vercel Dashboard** → Your Project → **Deployments**
2. Click on the latest deployment
3. Go to **Functions** tab
4. Find `/api/cron/monthly-snapshot` in the list
5. Click to view execution logs and any errors

#### What the Cron Job Does

When triggered, the endpoint (`/app/api/cron/monthly-snapshot/route.ts`):

1. Reads all users from Firestore
2. Calls the portfolio snapshot API for each user
3. Updates Hall of Fame rankings after successful snapshot creation
4. Returns a summary of successes and errors

The dividend processing endpoint (`/app/api/cron/daily-dividend-processing/route.ts`) runs separately and:

1. Scrapes recent dividend announcements for supported assets
2. Creates dividend entries when needed
3. Creates linked cashflow entries when payment dates are reached
4. Schedules the next bond coupon automatically

**Note**: The implementation is in `/app/api/cron/monthly-snapshot/route.ts` if you need to customize the logic.

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

1. **Replacing the service layer**: Modify `lib/services/yahooFinanceService.ts`
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
- **Cron Jobs**: External scheduler (cron-job.org) or Linux crontab
- **Migration effort**: Low — the repo already ships a production-ready `Dockerfile` and `docker-compose.yml`

```bash
cp .env.local.example .env.local  # fill in your Firebase credentials
docker compose up -d --build
```

> See [DOCKER.md](DOCKER.md) for the full guide: environment variable setup, cron job options, nginx + Let's Encrypt configuration, and troubleshooting.

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
5. Test endpoint manually: `curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/cron/monthly-snapshot`

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
5. **Monitor FIRE progress**: Visit the "FIRE e Simulazioni" page to track your financial independence journey

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
