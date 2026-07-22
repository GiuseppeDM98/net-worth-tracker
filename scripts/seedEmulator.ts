/**
 * Seed the LOCAL Firebase Emulator Suite with a synthetic test account.
 *
 * Run via `npm run emulators:seed` (which sets FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST
 * so the Admin SDK routes to the emulators — NEVER to production). Self-contained: it inits its own
 * Admin app with the demo project id and does not import the app's `lib/firebase/admin`.
 *
 * Idempotent: deterministic doc ids (`seed-*`) are overwritten on every run, and the test user is
 * created-or-updated. Safe to re-run whenever you want a clean, known dataset.
 *
 * What it creates (userId = `test-user-1`):
 *   - one Auth user (email/password below);
 *   - 4 ledger assets with quantity > 0 (etf/stock/bond/crypto) → the Fase B migration turns each
 *     into a baseline BUY — plus a cash account (for trade settlements) and a primary residence;
 *   - minimal allocation settings, a few expense categories + expenses, and two monthly snapshots
 *     so the dashboard/history render with realistic figures.
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. Run this via `npm run emulators:seed` ' +
      '(with the emulators started via `npm run emulators`).'
  );
  process.exit(1);
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-net-worth';
const TEST_UID = 'test-user-1';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'test1234';

const app = initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);
const auth = getAuth(app);

const now = new Date();
const thisMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
const prevMonth = { year: prev.getFullYear(), month: prev.getMonth() + 1 };

/** Base fields shared by every seeded asset. */
function assetBase() {
  return { userId: TEST_UID, lastPriceUpdate: now, createdAt: now, updatedAt: now };
}

async function seedAuthUser(): Promise<void> {
  try {
    await auth.createUser({ uid: TEST_UID, email: TEST_EMAIL, password: TEST_PASSWORD });
    console.info(`  ✓ created Auth user ${TEST_EMAIL}`);
  } catch (error: unknown) {
    // Re-runnable: if the user already exists, just reset its email/password.
    const code = (error as { code?: string }).code;
    if (code === 'auth/uid-already-exists' || code === 'auth/email-already-exists') {
      await auth.updateUser(TEST_UID, { email: TEST_EMAIL, password: TEST_PASSWORD });
      console.info(`  ✓ updated existing Auth user ${TEST_EMAIL}`);
    } else {
      throw error;
    }
  }
}

async function seedAssets(): Promise<void> {
  const assets: { id: string; data: Record<string, unknown> }[] = [
    {
      id: 'seed-vwce',
      data: {
        ...assetBase(),
        ticker: 'VWCE.DE',
        name: 'Vanguard FTSE All-World',
        type: 'etf',
        assetClass: 'equity',
        currency: 'EUR',
        quantity: 20,
        averageCost: 95,
        currentPrice: 110,
        isin: 'IE00BK5BQT80',
      },
    },
    {
      id: 'seed-aapl',
      data: {
        ...assetBase(),
        ticker: 'AAPL',
        name: 'Apple Inc.',
        type: 'stock',
        assetClass: 'equity',
        currency: 'USD',
        quantity: 10,
        averageCost: 150,
        currentPrice: 190,
        currentPriceEur: 175,
      },
    },
    {
      id: 'seed-btp',
      data: {
        ...assetBase(),
        ticker: 'BTP',
        name: 'BTP Valore 2030',
        type: 'bond',
        assetClass: 'bonds',
        currency: 'EUR',
        quantity: 5,
        averageCost: 98,
        currentPrice: 101,
        isin: 'IT0005547408',
      },
    },
    {
      id: 'seed-btc',
      data: {
        ...assetBase(),
        ticker: 'BTC',
        name: 'Bitcoin',
        type: 'crypto',
        assetClass: 'crypto',
        currency: 'EUR',
        quantity: 0.5,
        averageCost: 38000,
        currentPrice: 55000,
      },
    },
    {
      id: 'seed-cash',
      data: {
        ...assetBase(),
        ticker: 'CASH',
        name: 'Conto Corrente',
        type: 'cash',
        assetClass: 'cash',
        currency: 'EUR',
        quantity: 8000,
        currentPrice: 1,
        subCategory: 'Conto Corrente',
      },
    },
    {
      id: 'seed-home',
      data: {
        ...assetBase(),
        ticker: 'CASA',
        name: 'Abitazione principale',
        type: 'realestate',
        assetClass: 'realestate',
        currency: 'EUR',
        quantity: 1,
        currentPrice: 250000,
        isPrimaryResidence: true,
        isLiquid: false,
      },
    },
  ];

  await Promise.all(assets.map((a) => db.collection('assets').doc(a.id).set(a.data)));
  console.info(`  ✓ ${assets.length} assets (4 ledger + cash + home)`);
}

async function seedSettings(): Promise<void> {
  await db.collection('assetAllocationTargets').doc(TEST_UID).set({
    userId: TEST_UID,
    laborIncomeCategoryIds: ['seed-cat-income'],
    targets: {
      equity: { targetPercentage: 60 },
      bonds: { targetPercentage: 30 },
      crypto: { targetPercentage: 10 },
    },
  });
  console.info('  ✓ allocation settings');
}

async function seedCategoriesAndExpenses(): Promise<void> {
  const categories = [
    { id: 'seed-cat-income', name: 'Stipendio', type: 'income', subCategories: [{ id: 'sub-salary', name: 'Salario' }] },
    { id: 'seed-cat-food', name: 'Alimentari', type: 'variable', subCategories: [] },
    { id: 'seed-cat-home', name: 'Casa', type: 'fixed', subCategories: [] },
  ];
  await Promise.all(
    categories.map((c) =>
      db.collection('expenseCategories').doc(c.id).set({
        userId: TEST_UID,
        name: c.name,
        type: c.type,
        subCategories: c.subCategories,
        createdAt: now,
        updatedAt: now,
      })
    )
  );

  const expenses = [
    { id: 'seed-exp-income', type: 'income', categoryId: 'seed-cat-income', categoryName: 'Stipendio', amount: 2500 },
    { id: 'seed-exp-food', type: 'variable', categoryId: 'seed-cat-food', categoryName: 'Alimentari', amount: -320 },
    { id: 'seed-exp-rent', type: 'fixed', categoryId: 'seed-cat-home', categoryName: 'Casa', amount: -800 },
  ];
  await Promise.all(
    expenses.map((e) =>
      db.collection('expenses').doc(e.id).set({
        userId: TEST_UID,
        type: e.type,
        categoryId: e.categoryId,
        categoryName: e.categoryName,
        amount: e.amount,
        currency: 'EUR',
        date: new Date(now.getFullYear(), now.getMonth(), 5),
        createdAt: now,
        updatedAt: now,
      })
    )
  );
  console.info(`  ✓ ${categories.length} categories + ${expenses.length} expenses`);
}

async function seedSnapshots(): Promise<void> {
  const byAsset = [
    { assetId: 'seed-vwce', ticker: 'VWCE.DE', name: 'Vanguard FTSE All-World', quantity: 20, price: 110, totalValue: 2200 },
    { assetId: 'seed-aapl', ticker: 'AAPL', name: 'Apple Inc.', quantity: 10, price: 175, totalValue: 1750 },
    { assetId: 'seed-btp', ticker: 'BTP', name: 'BTP Valore 2030', quantity: 5, price: 101, totalValue: 505 },
    { assetId: 'seed-btc', ticker: 'BTC', name: 'Bitcoin', quantity: 0.5, price: 55000, totalValue: 27500 },
    { assetId: 'seed-cash', ticker: 'CASH', name: 'Conto Corrente', quantity: 8000, price: 1, totalValue: 8000 },
    { assetId: 'seed-home', ticker: 'CASA', name: 'Abitazione principale', quantity: 1, price: 250000, totalValue: 250000 },
  ];
  const total = byAsset.reduce((s, a) => s + a.totalValue, 0);
  const illiquid = 250000;

  const snapshots = [
    { ...prevMonth, factor: 0.98 },
    { ...thisMonth, factor: 1 },
  ];
  await Promise.all(
    snapshots.map((s) =>
      db.collection('monthly-snapshots').doc(`${TEST_UID}-${s.year}-${s.month}`).set({
        userId: TEST_UID,
        year: s.year,
        month: s.month,
        totalNetWorth: Math.round(total * s.factor),
        liquidNetWorth: Math.round((total - illiquid) * s.factor),
        illiquidNetWorth: illiquid,
        byAssetClass: {
          equity: Math.round(3950 * s.factor),
          bonds: Math.round(505 * s.factor),
          crypto: Math.round(27500 * s.factor),
          cash: 8000,
          realestate: illiquid,
        },
        byAsset,
        assetAllocation: { equity: 3950, bonds: 505, crypto: 27500, cash: 8000, realestate: illiquid },
        createdAt: new Date(s.year, s.month - 1, 28),
      })
    )
  );
  console.info(`  ✓ ${snapshots.length} monthly snapshots`);
}

async function main(): Promise<void> {
  console.info(`\nSeeding emulator (project ${PROJECT_ID}) …`);
  await seedAuthUser();
  await seedAssets();
  await seedSettings();
  await seedCategoriesAndExpenses();
  await seedSnapshots();
  console.info('\n✅ Seed complete.');
  console.info('   Login:  ' + TEST_EMAIL + '  /  ' + TEST_PASSWORD);
  console.info('   Open the app with `npm run dev:emulator`, then log in with the above.');
  console.info('   Opening /dashboard/assets fires the ledger migration (creates 4 baselines).\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
