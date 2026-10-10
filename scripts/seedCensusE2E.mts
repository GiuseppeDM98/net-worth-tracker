/**
 * The first-screen budget's fixture: the account `census@example.com` (uid `census-user`), which
 * `npm run mobile:census` re-seeds before every run (doc/mobile/README.md § 9, decision 10).
 *
 * Run via `npm run e2e:seed:census` (Admin SDK pointed at the emulators — NEVER production).
 *
 * WHY ITS OWN ACCOUNT. The budget in `doc/mobile/budget.json` has zero tolerance (decision 23), so
 * it is measured on data that cannot drift: never the mirror (it changes every month), never the
 * base account (every spec writes into it). And every surface must have something to show, or a
 * budget on an empty page would guard nothing: Centri di Costo and Divisione are ON, there is a
 * coupon, a Budget ceiling, a pension fund, 47 monthly snapshots for Hall of Fame, a row still in
 * the calendar at the end of the month. Every OPTION is measured in its default state (owner,
 * 2026-10-10): the 50/30/20 roles are off, and FIRE › Obiettivi is off too — the one surface
 * measured with nothing to show («Gli obiettivi non sono attivi», one tile) until the spec that
 * composes it turns it on here with an invented goal (doc/mobile/README.md § 9, 60).
 *
 * THE DATES are relative to the day of the run, so every surface counts the same on any day of
 * the month: the month's rows sit on the 5th, the previous month is whole, the snapshots end last
 * month. Two windows break it, and `mobile:census` refuses to measure in them (owner, 2026-10-10):
 * - from the 1st to the 4th the rows of the 5th are still «in calendario», and the Budget makes
 *   no forecast before day 4 (`MIN_FORECAST_DAYS`, lib/utils/budgetUtils.ts);
 * - on the month's last day the row «in calendario» comes due.
 * Across MONTHS the story slides by one: the month names move (a record of «maggio» becomes one
 * of «giugno») and a window over the calendar year (Analisi, Storico) reads one more month of
 * history — in January only January. The rows the month-bound surfaces read (Divisione, Centri,
 * the coupon of Dividendi's «year», the Budget) are all in the current month, so those hold; a
 * drift elsewhere on the first run of a new month is read before anyone tightens or widens.
 *
 * THE SAVINGS RATE of the previous month stays under 30% (3000 € in, 2400 € out): above it the
 * Panoramica shows `SavingsRateBadge`, `fixed` over the pill (components/ui/SavingsRateBadge.tsx),
 * once per browser — a first-screen measure that would depend on the browser's history.
 *
 * WHAT IT DOES NOT WRITE: the Hall of Fame rankings (`hall-of-fame/{uid}`), which only the server
 * builds — `mobile:census` calls `POST /api/hall-of-fame/recalculate` after this seed (owner,
 * 2026-10-10); nor the ledger baselines and the trade meta, which the first visit to Patrimonio
 * writes (the census's warm-up lap opens every route once before measuring).
 *
 * Every proper noun is a decoy from the `centri` and `split` fixtures (Fenicottero, Ornitorinco,
 * Ghiandaia, Tarsio…): the data is invented, nothing of a real account belongs here.
 *
 * Idempotent: every document of the account is removed first, then written whole.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. Run this via `npm run e2e:seed:census` ' +
      '(with the emulators started via `npm run emulators`).'
  );
  process.exit(1);
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-net-worth';
const UID = 'census-user';
const EMAIL = 'census@example.com';
const PASSWORD = 'test1234';

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const auth = getAuth();
const now = new Date();

// The same lists `scripts/mirrorProdAccount.mts` clears for its account, plus the two per-user
// documents only this fixture can have left behind.
const USER_COLLECTIONS = ['assets', 'expenses', 'expenseCategories', 'monthly-snapshots', 'assetTransactions', 'pensionContributions', 'dividends', 'costCenters', 'goals', 'assistantThreads'];
const PER_USER_DOCS = ['users', 'assetAllocationTargets', 'assetTransactionsMeta', 'budgets', 'hall-of-fame', 'performance-cache', 'dashboardOverviewSummaries', 'goalBasedInvesting', 'userPreferences'];

// ── The calendar of the run ─────────────────────────────────────────────────────────────────────

interface Month {
  year: number;
  /** 0-based, as `Date` wants it. */
  month: number;
}

const THIS_MONTH: Month = { year: now.getFullYear(), month: now.getMonth() };

/** The month `offset` months from the current one (−1 = last month). */
function monthAt(offset: number): Month {
  const d = new Date(THIS_MONTH.year, THIS_MONTH.month + offset, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** Noon UTC: the same Italian calendar day in every timezone the seed may run in. */
const dayOf = (m: Month, day: number) => new Date(Date.UTC(m.year, m.month, day, 11));
const lastDayOf = (m: Month) => new Date(m.year, m.month + 1, 0).getDate();

const LAST_MONTH = monthAt(-1);
/** The day every booked row of the current month sits on. */
const BOOKED = dayOf(THIS_MONTH, 5);
/** The one row still «in calendario»: the month's last day. */
const SCHEDULED = dayOf(THIS_MONTH, lastDayOf(THIS_MONTH));
const SNAPSHOT_COUNT = 47;

// ── Account, settings ───────────────────────────────────────────────────────────────────────────

async function seedAccount(): Promise<void> {
  try {
    await auth.updateUser(UID, { email: EMAIL, password: PASSWORD, emailVerified: true, displayName: 'Census' });
  } catch {
    await auth.createUser({ uid: UID, email: EMAIL, password: PASSWORD, emailVerified: true, displayName: 'Census' });
  }
  console.info(`  ✓ account ${EMAIL}`);
}

async function removeEverything(): Promise<void> {
  for (const name of USER_COLLECTIONS) {
    const snap = await db.collection(name).where('userId', '==', UID).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }
  await Promise.all(PER_USER_DOCS.map((name) => db.collection(name).doc(UID).delete()));
  console.info('  ✓ previous run removed');
}

const MEMBERS = [
  { id: 'census-m-ghiandaia', name: 'Ghiandaia', grossAnnualIncome: 35000, isFirstEmploymentPost2007: true, firstEmploymentYear: 2015 },
  { id: 'census-m-tarsio', name: 'Tarsio' },
];

async function seedSettings(): Promise<void> {
  await db.collection('users').doc(UID).set({ userId: UID, email: EMAIL, displayName: 'Census', createdAt: now });
  // A whole `set`, not a merge: the account is this fixture's alone, and a flag left by a
  // previous version of the seed would change a surface.
  await db.collection('assetAllocationTargets').doc(UID).set({
    userId: UID,
    targets: {
      equity: { targetPercentage: 60, subTargets: { World: { targetPercentage: 80 }, 'Single Stock': { targetPercentage: 20 } } },
      bonds: { targetPercentage: 30 },
      crypto: { targetPercentage: 10 },
    },
    laborIncomeCategoryIds: ['census-cat-stipendio'],
    costCentersEnabled: true,
    expenseSplitEnabled: true,
    // The Flusso's 50/30/20 view stays off: the budget measures each option in its default state.
    spendingRolesEnabled: false,
    goalBasedInvestingEnabled: false,
    familyMembers: MEMBERS,
    // FIRE and Coast FIRE (the values of scripts/seedCoastFireE2E.mts, without its pensions).
    userAge: 35,
    withdrawalRate: 4,
    plannedAnnualExpenses: 30000,
    includePrimaryResidenceInFIRE: false,
    coastFireRetirementAge: 60,
    coastFireCustomExpenses: 30000,
  });
  console.info('  ✓ settings (Centri and Divisione on, FIRE inputs)');
}

// ── Assets and snapshots ────────────────────────────────────────────────────────────────────────

interface SeedAsset {
  id: string;
  data: Record<string, unknown>;
  /** The value today, in euro: the last snapshot is built from it. */
  value: number;
}

const assetBase = () => ({ userId: UID, lastPriceUpdate: now, createdAt: now, updatedAt: now });

// Quoted tickers are only the ones `scripts/instrumentProfileFixtures.ts` stamps (VWCE.DE, AAPL):
// any other would send `/api/portfolio/instrument-profiles` to Yahoo, and the Esposizione would
// change with the network — the census reads the route's `Server-Timing` and a `source=yahoo` on
// this account stops the budget from being taken (doc/guide/prima-schermata.md, 2026-10-10).
const ASSETS: SeedAsset[] = [
  {
    id: 'census-vwce',
    value: 2200,
    data: { ...assetBase(), ticker: 'VWCE.DE', name: 'Vanguard FTSE All-World', type: 'etf', assetClass: 'equity', subCategory: 'World', currency: 'EUR', quantity: 20, averageCost: 95, currentPrice: 110, isin: 'IE00BK5BQT80' },
  },
  {
    id: 'census-aapl',
    value: 1750,
    data: { ...assetBase(), ticker: 'AAPL', name: 'Apple Inc.', type: 'stock', assetClass: 'equity', subCategory: 'Single Stock', currency: 'USD', quantity: 10, averageCost: 150, currentPrice: 190, currentPriceEur: 175 },
  },
  {
    id: 'census-btp',
    value: 505,
    data: { ...assetBase(), ticker: 'BTP', name: 'BTP Valore 2030', type: 'bond', assetClass: 'bonds', currency: 'EUR', quantity: 5, averageCost: 98, currentPrice: 101, taxRate: 12.5, isin: 'IT0005547408' },
  },
  {
    id: 'census-btc',
    value: 27500,
    data: { ...assetBase(), ticker: 'BTC', name: 'Bitcoin', type: 'crypto', assetClass: 'crypto', currency: 'EUR', quantity: 0.5, averageCost: 38000, currentPrice: 55000 },
  },
  {
    id: 'census-pension',
    value: 12000,
    // A pension fund keeps its euro value in `quantity` at price 1 (scripts/seedPensionE2E.mts).
    data: { ...assetBase(), ticker: '', name: 'Fondo Pensione Fenicottero', type: 'pensionFund', assetClass: 'equity', currency: 'EUR', quantity: 12000, currentPrice: 1, isLiquid: false, allocationRole: 'frozen', pensionFundDetails: { familyMemberId: 'census-m-ghiandaia' } },
  },
  {
    id: 'census-cash',
    value: 8000,
    data: { ...assetBase(), ticker: 'CASH', name: 'Conto Corrente', type: 'cash', assetClass: 'cash', subCategory: 'Conto Corrente', currency: 'EUR', quantity: 8000, currentPrice: 1 },
  },
  {
    id: 'census-home',
    value: 250000,
    data: { ...assetBase(), ticker: 'CASA', name: 'Abitazione principale', type: 'realestate', assetClass: 'realestate', currency: 'EUR', quantity: 1, currentPrice: 250000, isPrimaryResidence: true, isLiquid: false },
  },
];

async function seedAssets(): Promise<void> {
  await Promise.all(ASSETS.map((asset) => db.collection('assets').doc(asset.id).set(asset.data)));
  console.info(`  ✓ ${ASSETS.length} assets`);
}

/**
 * The month-on-month change of the liquid part, by snapshot index: a quadratic residue, so the
 * months differ (Hall of Fame has a best, a worst and no ties — a linear wiggle gave twelve
 * records of the same +936 €), and a fall every seventh month.
 */
const liquidDiff = (i: number) => 300 + ((i * i * 37 + i * 11) % 17) * 120 - (i % 7 === 3 ? 2400 : 0);

/**
 * 47 monthly snapshots ending LAST month, the liquid part built backwards from 98% of today's by
 * `liquidDiff`; the house stays put. Every asset is in `byAsset`, scaled with the liquid part, so
 * Previdenza reads a history for the fund.
 */
async function seedSnapshots(): Promise<void> {
  const illiquid = 250000;
  const liquidToday = ASSETS.reduce((sum, asset) => sum + asset.value, 0) - illiquid;
  const lastLiquid = Math.round(liquidToday * 0.98);
  const liquids: number[] = [lastLiquid];
  for (let i = SNAPSHOT_COUNT - 1; i > 0; i--) liquids.unshift(liquids[0] - liquidDiff(i));
  const batch = db.batch();
  for (let i = 0; i < SNAPSHOT_COUNT; i++) {
    const m = monthAt(i - SNAPSHOT_COUNT);
    const liquid = liquids[i];
    const ratio = liquid / liquidToday;
    const byAsset = ASSETS.map((asset) => {
      const totalValue = asset.id === 'census-home' ? asset.value : Math.round(asset.value * ratio);
      const quantity = asset.data.quantity as number;
      return { assetId: asset.id, ticker: asset.data.ticker, name: asset.data.name, quantity, price: totalValue / quantity, totalValue };
    });
    const sumOf = (cls: string) => byAsset.filter((row) => ASSETS.find((a) => a.id === row.assetId)!.data.assetClass === cls).reduce((s, row) => s + row.totalValue, 0);
    const byAssetClass = { equity: sumOf('equity'), bonds: sumOf('bonds'), crypto: sumOf('crypto'), cash: sumOf('cash'), realestate: illiquid };
    batch.set(db.collection('monthly-snapshots').doc(`${UID}-${m.year}-${m.month + 1}`), {
      userId: UID,
      year: m.year,
      month: m.month + 1,
      totalNetWorth: liquid + illiquid,
      liquidNetWorth: liquid,
      illiquidNetWorth: illiquid,
      byAssetClass,
      byAsset,
      assetAllocation: byAssetClass,
      createdAt: new Date(Date.UTC(m.year, m.month, 28, 11)),
    });
  }
  await batch.commit();
  console.info(`  ✓ ${SNAPSHOT_COUNT} monthly snapshots (${monthAt(-SNAPSHOT_COUNT).month + 1}/${monthAt(-SNAPSHOT_COUNT).year} → ${LAST_MONTH.month + 1}/${LAST_MONTH.year})`);
}

// ── Categories, cost centers, expenses ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: 'census-cat-stipendio', name: 'Stipendio', type: 'income' },
  { id: 'census-cat-alimentari', name: 'Alimentari', type: 'variable' },
  { id: 'census-cat-affitto', name: 'Affitto Lemure', type: 'fixed' },
  { id: 'census-cat-bollette', name: 'Bollette Okapi', type: 'fixed' },
  { id: 'census-cat-auto', name: 'Auto Narvalo', type: 'variable' },
  { id: 'census-cat-svago', name: 'Svago Axolotl', type: 'variable' },
  { id: 'census-cat-progetti', name: 'Progetti', type: 'variable' },
  { id: 'census-cat-spese', name: 'Spese del mese', type: 'variable' },
];
const CATEGORY_BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

const CENTERS = [
  // A MONTHLY ceiling the calendar crosses: 800 booked on the 5th + 300 on the last day > 1000.
  { id: 'census-cc-fenicottero', name: 'Fenicottero', color: 'chart-1', budgetAmount: 1000, budgetPeriod: 'monthly' },
  // Dormant: its rows are six months old (more than 90 days, on any day of the month).
  { id: 'census-cc-ornitorinco', name: 'Ornitorinco', color: 'chart-2' },
];
const CENTER_NAME = new Map(CENTERS.map((center) => [center.id, center.name]));

interface SeedRow {
  id: string;
  categoryId: string;
  date: Date;
  /** Signed the way the app stores it: positive income, negative spending. */
  amount: number;
  personalMemberId?: string;
  costCenterId?: string;
  isInstallment?: boolean;
}

/** The history before last month: one salary and one month of spending, deterministic per index. */
function historyRows(): SeedRow[] {
  const rows: SeedRow[] = [];
  for (let i = 0; i < SNAPSHOT_COUNT - 1; i++) {
    const m = monthAt(i - SNAPSHOT_COUNT);
    const key = `${m.year}-${String(m.month + 1).padStart(2, '0')}`;
    rows.push({ id: `census-h-${key}-in`, categoryId: 'census-cat-stipendio', date: dayOf(m, 15), amount: 3000 + ((i * 13) % 5) * 40 });
    rows.push({ id: `census-h-${key}-out`, categoryId: 'census-cat-spese', date: dayOf(m, 15), amount: -(1900 + ((i * 29) % 700)) });
  }
  return rows;
}

const ROWS: SeedRow[] = [
  ...historyRows(),

  // Last month, whole: 3000 in, 2400 out — a savings rate of 20%, under the badge's 30%.
  { id: 'census-lm-in', categoryId: 'census-cat-stipendio', date: dayOf(LAST_MONTH, 15), amount: 3000 },
  { id: 'census-lm-food', categoryId: 'census-cat-alimentari', date: dayOf(LAST_MONTH, 10), amount: -600 },
  { id: 'census-lm-rent', categoryId: 'census-cat-affitto', date: dayOf(LAST_MONTH, 5), amount: -1000 },
  { id: 'census-lm-other', categoryId: 'census-cat-spese', date: dayOf(LAST_MONTH, 20), amount: -800 },

  // This month, on the 5th — the Divisione's rows (60/40 salaries, income left «in comune», one
  // row of a member who is not in Famiglia) and Fenicottero's booked 800.
  { id: 'census-tm-in-ghiandaia', categoryId: 'census-cat-stipendio', date: BOOKED, amount: 2400, personalMemberId: 'census-m-ghiandaia' },
  { id: 'census-tm-in-tarsio', categoryId: 'census-cat-stipendio', date: BOOKED, amount: 1600, personalMemberId: 'census-m-tarsio' },
  { id: 'census-tm-in-common', categoryId: 'census-cat-stipendio', date: BOOKED, amount: 1000 },
  { id: 'census-tm-rent', categoryId: 'census-cat-affitto', date: BOOKED, amount: -1000 },
  { id: 'census-tm-food', categoryId: 'census-cat-alimentari', date: BOOKED, amount: -320 },
  { id: 'census-tm-fun', categoryId: 'census-cat-svago', date: BOOKED, amount: -200, personalMemberId: 'census-m-ghiandaia' },
  { id: 'census-tm-car', categoryId: 'census-cat-auto', date: BOOKED, amount: -1100, personalMemberId: 'census-m-tarsio' },
  { id: 'census-tm-ghost', categoryId: 'census-cat-alimentari', date: BOOKED, amount: -120, personalMemberId: 'census-m-fantasma' },
  { id: 'census-tm-project', categoryId: 'census-cat-progetti', date: BOOKED, amount: -800, costCenterId: 'census-cc-fenicottero' },

  // The ONE row still in the calendar: common (Divisione), Fenicottero's (Centri), a fixed bill.
  { id: 'census-tm-scheduled', categoryId: 'census-cat-bollette', date: SCHEDULED, amount: -300, costCenterId: 'census-cc-fenicottero', isInstallment: true },

  // Ornitorinco, dormant: 27 rows of 10 € six months ago.
  ...Array.from({ length: 27 }, (_, i) => ({
    id: `census-orn-${String(i + 1).padStart(2, '0')}`,
    categoryId: 'census-cat-progetti',
    date: dayOf(monthAt(-6), 15),
    amount: -10,
    costCenterId: 'census-cc-ornitorinco',
  })),
];

async function seedCategoriesAndCenters(): Promise<void> {
  await Promise.all(
    CATEGORIES.map(({ id, ...category }) =>
      db.collection('expenseCategories').doc(id).set({ userId: UID, ...category, subCategories: [], createdAt: now, updatedAt: now })
    )
  );
  await Promise.all(
    CENTERS.map(({ id, ...center }) => db.collection('costCenters').doc(id).set({ userId: UID, ...center, archivedAt: null, createdAt: now, updatedAt: now }))
  );
  console.info(`  ✓ ${CATEGORIES.length} categories, ${CENTERS.length} cost centers`);
}

async function seedExpenses(): Promise<void> {
  for (let i = 0; i < ROWS.length; i += 400) {
    const batch = db.batch();
    for (const { id, categoryId, personalMemberId, costCenterId, ...row } of ROWS.slice(i, i + 400)) {
      const category = CATEGORY_BY_ID.get(categoryId)!;
      batch.set(db.collection('expenses').doc(id), {
        userId: UID,
        type: category.type,
        categoryId,
        categoryName: category.name,
        currency: 'EUR',
        // Absent means «in comune» / no center: written only when the row has one.
        ...(personalMemberId ? { personalMemberId } : {}),
        ...(costCenterId ? { costCenterId, costCenterName: CENTER_NAME.get(costCenterId) } : {}),
        ...row,
        createdAt: now,
        updatedAt: now,
      });
    }
    await batch.commit();
  }
  console.info(`  ✓ ${ROWS.length} expense rows`);
}

// ── Budget, coupon, pension contributions ───────────────────────────────────────────────────────

/**
 * The ceiling is ALREADY crossed on the 5th (3540 € booked over 3000 €), and so are the two monthly
 * items: «oltre» is the one Budget state that holds all month. A ceiling above what is booked is
 * judged by the pace (`spent / day × days`), which crosses it early in the month and not late —
 * 4000 € read «rischia di sforare» on the 10th and would not on the 28th.
 */
async function seedBudget(): Promise<void> {
  await db.collection('budgets').doc(UID).set({
    userId: UID,
    overallMonthlyAmount: 3000,
    alertsEnabled: true,
    items: [
      { id: 'census-bud-food', kind: 'expense', scope: 'category', period: 'monthly', categoryId: 'census-cat-alimentari', categoryName: 'Alimentari', amount: 400, order: 0 },
      { id: 'census-bud-car', kind: 'expense', scope: 'category', period: 'monthly', categoryId: 'census-cat-auto', categoryName: 'Auto Narvalo', amount: 900, order: 1 },
      { id: 'census-bud-bills', kind: 'expense', scope: 'category', period: 'annual', categoryId: 'census-cat-bollette', categoryName: 'Bollette Okapi', amount: 3000, order: 2 },
    ],
    updatedAt: now,
  });
  console.info('  ✓ budget (ceiling 3000 €, already crossed; two monthly items, one annual)');
}

async function seedCoupon(): Promise<void> {
  // Received on the 5th of the current month: inside the Dividendi's default «year» window on
  // every day the census runs, January included.
  await db.collection('dividends').doc('census-coupon').set({
    userId: UID,
    assetId: 'census-btp',
    assetTicker: 'BTP',
    assetName: 'BTP Valore 2030',
    assetIsin: 'IT0005547408',
    exDate: dayOf(THIS_MONTH, 1),
    paymentDate: BOOKED,
    dividendPerShare: 2.5,
    quantity: 5,
    grossAmount: 12.5,
    taxAmount: 1.56,
    netAmount: 10.94,
    currency: 'EUR',
    dividendType: 'coupon',
    isAutoGenerated: false,
    createdAt: now,
    updatedAt: now,
  });
  console.info('  ✓ one coupon');
}

async function seedPensionContributions(): Promise<void> {
  const batch = db.batch();
  for (let offset = -12; offset <= -1; offset++) {
    const m = monthAt(offset);
    const date = dayOf(m, 20);
    const key = `${m.year}-${String(m.month + 1).padStart(2, '0')}`;
    for (const [source, amount] of [['tfr', 150], ['voluntary', 100]] as const) {
      batch.set(db.collection('pensionContributions').doc(`census-pc-${key}-${source}`), {
        userId: UID,
        assetId: 'census-pension',
        source,
        amount,
        date,
        taxYear: m.year,
        deductible: source !== 'tfr',
        createdAt: now,
      });
    }
  }
  await batch.commit();
  console.info('  ✓ 24 pension contributions (12 months)');
}

console.info(`Seeding the census fixture for ${UID} on ${PROJECT_ID}…`);
await seedAccount();
await removeEverything();
await seedSettings();
await seedAssets();
await seedSnapshots();
await seedCategoriesAndCenters();
await seedExpenses();
await seedBudget();
await seedCoupon();
await seedPensionContributions();
console.info('Done.');
process.exit(0);
