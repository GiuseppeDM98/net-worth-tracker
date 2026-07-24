/**
 * Exercise the P3 pension integrations (Rendimenti base exclusion + FIRE lock-in) against the
 * LOCAL Firebase Emulator Suite.
 *
 * Why this exists: `__tests__/performanceBase.test.ts` and `__tests__/pensionFire.test.ts` prove the
 * PURE MATH exhaustively but mock Firestore entirely, so they never touch: a real `Asset` document
 * (type/composition/pensionFundDetails.unlockDate as Firestore actually stores them — the unlock
 * date is a plain string, not a Timestamp), a real `MonthlySnapshot` document, or the WIRING inside
 * `getAllPerformanceData`/`FireCalculatorTab`'s composition of `calculateFIRENetWorth` +
 * `calculatePensionLockedValue`. This script checks exactly that seam, on a throwaway synthetic
 * account that never touches `test-user-1`'s data.
 *
 * Run via `npm run emulators:pension-p3` (emulators must already be up; `emulators:seed` not
 * required — this script seeds its own account). It refuses to start unless
 * NEXT_PUBLIC_USE_FIREBASE_EMULATOR is set, so it can never reach production.
 *
 * Scenario (two monthly snapshots, one return period, zero expenses so cash flow is trivially 0):
 *   - `p3-core` (etf, liquid): 10.000 € → 10.500 € — a genuine +5% market return.
 *   - `p3-pension-locked` (pensionFund, illiquid, unlockDate in 2036): 1.000 € → 9.000 € — an 8.000 €
 *     contribution, NOT market growth. If wrongly counted, it would inflate the portfolio's return
 *     from +5% to roughly +60% (huge and easy to eyeball as wrong).
 *   - `p3-pension-unlocked` (pensionFund, illiquid, unlockDate in 2020 — already past): flat 3.000 €.
 *     Present to prove the two exclusions are independent: performanceBase excludes BOTH pension
 *     funds regardless of lock status, while the FIRE lock-in only counts the one still locked.
 *
 * Idempotent: deterministic doc ids, overwritten on every run.
 */

if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true') {
  console.error(
    'Refusing to run: NEXT_PUBLIC_USE_FIREBASE_EMULATOR is not "true". Run this via ' +
      '`npm run emulators:pension-p3` (with `npm run emulators` up).'
  );
  process.exit(1);
}

// Same division of labour as scripts/exercisePensionContributions.mts: seeding + the "expected"
// control values go through the ADMIN SDK (bypasses rules, avoids the CJS/ESM dual-instance hazard
// of using the client SDK from an .mts file for writes); the "actual" values under test go through
// the app's REAL client-SDK services, signed in, so every read is rule-evaluated exactly as in the
// browser and every Firestore round-trip (Timestamps, the unlockDate string) is real.
const { initializeApp: initAdminApp } = await import('firebase-admin/app');
const { getFirestore: getAdminFirestore } = await import('firebase-admin/firestore');
const { getAuth: getAdminAuth } = await import('firebase-admin/auth');
const { signInWithEmailAndPassword } = await import('firebase/auth');
const { auth } = await import('@/lib/firebase/config');

const adminApp = initAdminApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-net-worth' });
const adminDb = getAdminFirestore(adminApp);
const adminAuth = getAdminAuth(adminApp);

const {
  getAllAssets,
  calculateAssetValue,
  calculateFIRENetWorth,
  calculateLiquidFIRENetWorth,
  calculateIlliquidFIRENetWorth,
} = await import('@/lib/services/assetService');
const { getUserSnapshots } = await import('@/lib/services/snapshotService');
const { getAllPerformanceData, calculatePerformanceForPeriod } = await import(
  '@/lib/services/performanceService'
);
const { toPerformanceBaseSnapshots } = await import('@/lib/utils/performanceBase');
const { calculatePensionLockedValue } = await import('@/lib/utils/pensionFire');

const TEST_UID = 'test-user-p3-verify';
const TEST_EMAIL = 'test-p3-verify@example.com';
const TEST_PASSWORD = 'test1234';

const CORE_ID = 'p3-core';
const LOCKED_PENSION_ID = 'p3-pension-locked';
const UNLOCKED_PENSION_ID = 'p3-pension-unlocked';

const now = new Date();
// Date() handles negative-month rollover (e.g. January - 2 → previous November) so the
// year/month pair is always valid; getMonth() is 0-indexed, MonthlySnapshot.month is 1-indexed.
const d1 = new Date(now.getFullYear(), now.getMonth() - 2, 15);
const d2 = new Date(now.getFullYear(), now.getMonth() - 1, 15);
const month1 = { year: d1.getFullYear(), month: d1.getMonth() + 1 };
const month2 = { year: d2.getFullYear(), month: d2.getMonth() + 1 };

let failures = 0;

/** Assert a condition, recording (not throwing on) a failure so the whole run is reported at once. */
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.info(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function closeEnough(a: number | null, b: number | null, epsilon = 1e-6): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= epsilon * Math.max(1, Math.abs(a), Math.abs(b));
}

async function seedAuthUser(): Promise<void> {
  try {
    await adminAuth.createUser({ uid: TEST_UID, email: TEST_EMAIL, password: TEST_PASSWORD });
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/uid-already-exists' || code === 'auth/email-already-exists') {
      await adminAuth.updateUser(TEST_UID, { email: TEST_EMAIL, password: TEST_PASSWORD });
    } else {
      throw error;
    }
  }
}

async function seedAssets(): Promise<void> {
  const base = { userId: TEST_UID, lastPriceUpdate: now, createdAt: now, updatedAt: now };
  await Promise.all([
    adminDb.collection('assets').doc(CORE_ID).set({
      ...base,
      ticker: 'P3CORE',
      name: 'P3 Core Holding',
      type: 'etf',
      assetClass: 'equity',
      currency: 'EUR',
      quantity: 10500,
      currentPrice: 1,
      isLiquid: true,
    }),
    adminDb.collection('assets').doc(LOCKED_PENSION_ID).set({
      ...base,
      ticker: 'P3PENLOCK',
      name: 'P3 Fondo Pensione Bloccato',
      type: 'pensionFund',
      assetClass: 'equity',
      currency: 'EUR',
      quantity: 9000,
      currentPrice: 1,
      isLiquid: false,
      allocationRole: 'frozen',
      pensionFundDetails: { provider: 'Fondo P3 Test', unlockDate: '2036-01-01' },
    }),
    adminDb.collection('assets').doc(UNLOCKED_PENSION_ID).set({
      ...base,
      ticker: 'P3PENFREE',
      name: 'P3 Fondo Pensione Sbloccato',
      type: 'pensionFund',
      assetClass: 'equity',
      currency: 'EUR',
      quantity: 3000,
      currentPrice: 1,
      isLiquid: false,
      allocationRole: 'frozen',
      pensionFundDetails: { provider: 'Fondo P3 Sbloccato', unlockDate: '2020-01-01' },
    }),
  ]);
}

async function seedSnapshots(): Promise<void> {
  const rows = [
    {
      ...month1,
      byAsset: [
        { assetId: CORE_ID, ticker: 'P3CORE', name: 'P3 Core Holding', quantity: 10000, price: 1, totalValue: 10000 },
        { assetId: LOCKED_PENSION_ID, ticker: 'P3PENLOCK', name: 'P3 Fondo Pensione Bloccato', quantity: 1000, price: 1, totalValue: 1000 },
        { assetId: UNLOCKED_PENSION_ID, ticker: 'P3PENFREE', name: 'P3 Fondo Pensione Sbloccato', quantity: 3000, price: 1, totalValue: 3000 },
      ],
      totalNetWorth: 14000,
      illiquidNetWorth: 4000,
    },
    {
      ...month2,
      byAsset: [
        { assetId: CORE_ID, ticker: 'P3CORE', name: 'P3 Core Holding', quantity: 10500, price: 1, totalValue: 10500 },
        { assetId: LOCKED_PENSION_ID, ticker: 'P3PENLOCK', name: 'P3 Fondo Pensione Bloccato', quantity: 9000, price: 1, totalValue: 9000 },
        { assetId: UNLOCKED_PENSION_ID, ticker: 'P3PENFREE', name: 'P3 Fondo Pensione Sbloccato', quantity: 3000, price: 1, totalValue: 3000 },
      ],
      totalNetWorth: 22500,
      illiquidNetWorth: 12000,
    },
  ];

  await Promise.all(
    rows.map((row) =>
      adminDb.collection('monthly-snapshots').doc(`${TEST_UID}-${row.year}-${row.month}`).set({
        userId: TEST_UID,
        year: row.year,
        month: row.month,
        totalNetWorth: row.totalNetWorth,
        liquidNetWorth: row.totalNetWorth - row.illiquidNetWorth,
        illiquidNetWorth: row.illiquidNetWorth,
        byAssetClass: { equity: row.totalNetWorth },
        byAsset: row.byAsset,
        assetAllocation: { equity: 100 },
        createdAt: new Date(row.year, row.month - 1, 28),
      })
    )
  );
}

/** Delete the performance-cache doc so a run right after a previous one never serves a stale cache. */
async function clearPerformanceCache(): Promise<void> {
  await adminDb.collection('performance-cache').doc(TEST_UID).delete().catch(() => {});
}

async function main(): Promise<void> {
  console.info('\nExercising P3 pension integrations (Rendimenti + FIRE) against the emulator …\n');

  await seedAuthUser();
  await seedAssets();
  await seedSnapshots();
  await clearPerformanceCache();
  console.info('Seeded synthetic account, 3 assets, 2 monthly snapshots.\n');

  await signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
  console.info(`Signed in as ${TEST_EMAIL} (uid ${auth.currentUser?.uid}) — reads are rule-evaluated.\n`);

  // ── §7 Rendimenti: performance base excludes BOTH pension funds ───────────
  console.info('── Rendimenti (performanceBase) ──');

  const assets = await getAllAssets(TEST_UID);
  check('fetched 3 assets', assets.length === 3, `got ${assets.length}`);
  const pensionAssetIds = assets.filter((a) => a.type === 'pensionFund').map((a) => a.id);
  check(
    'both pension funds identified by type',
    pensionAssetIds.length === 2 &&
      pensionAssetIds.includes(LOCKED_PENSION_ID) &&
      pensionAssetIds.includes(UNLOCKED_PENSION_ID),
    JSON.stringify(pensionAssetIds)
  );

  // "Expected": fetch the real snapshots ourselves, strip locally, compute via the same pure engine.
  const rawSnapshots = await getUserSnapshots(TEST_UID);
  check('fetched 2 snapshots', rawSnapshots.length === 2, `got ${rawSnapshots.length}`);
  const strippedSnapshots = toPerformanceBaseSnapshots(rawSnapshots, pensionAssetIds);
  const strippedTotals = strippedSnapshots.map((s) => s.totalNetWorth).sort((a, b) => a - b);
  check(
    'stripped snapshots equal core-only values (10.000 / 10.500)',
    strippedTotals[0] === 10000 && strippedTotals[1] === 10500,
    JSON.stringify(strippedTotals)
  );
  const expected = await calculatePerformanceForPeriod(
    TEST_UID,
    strippedSnapshots,
    'ALL',
    2.5,
    undefined,
    undefined,
    [],
    undefined
  );
  check('expected (stripped) has sufficient data', !expected.hasInsufficientData);

  // "Actual": the real service, doing its own fetch + exclusion internally.
  const actual = await getAllPerformanceData(TEST_UID, true);
  check('actual (getAllPerformanceData) has sufficient data', !actual.allTime.hasInsufficientData);
  check(
    'TWR: actual matches hand-stripped expected',
    closeEnough(actual.allTime.timeWeightedReturn, expected.timeWeightedReturn),
    `actual=${actual.allTime.timeWeightedReturn} expected=${expected.timeWeightedReturn}`
  );
  check(
    'ROI: actual matches hand-stripped expected',
    closeEnough(actual.allTime.roi, expected.roi),
    `actual=${actual.allTime.roi} expected=${expected.roi}`
  );

  // Sensitivity check: the UNSTRIPPED number must be wildly different — proves the test would
  // actually catch a regression (e.g. someone reverting the exclusion), not just agreeing with itself.
  const unstripped = await calculatePerformanceForPeriod(
    TEST_UID,
    rawSnapshots,
    'ALL',
    2.5,
    undefined,
    undefined,
    [],
    undefined
  );
  const roiGapPp = Math.abs((unstripped.roi ?? 0) - (actual.allTime.roi ?? 0));
  check(
    'unstripped ROI is wildly different (would catch a broken/reverted exclusion)',
    roiGapPp > 10,
    `unstripped=${unstripped.roi} actual=${actual.allTime.roi} gap=${roiGapPp}pp`
  );

  // ── §8 FIRE: lock-in subtracts ONLY the fund still locked ──────────────────
  console.info('\n── FIRE (pensionFire) ──');

  const fireNetWorth = calculateFIRENetWorth(assets, false);
  const liquidFireNetWorth = calculateLiquidFIRENetWorth(assets, false);
  const illiquidFireNetWorth = calculateIlliquidFIRENetWorth(assets, false);
  check('FIRE net worth = 22.500', fireNetWorth === 22500, `got ${fireNetWorth}`);
  check('liquid FIRE net worth = 10.500 (only the core holding)', liquidFireNetWorth === 10500, `got ${liquidFireNetWorth}`);
  check('illiquid FIRE net worth = 12.000 (both pension funds)', illiquidFireNetWorth === 12000, `got ${illiquidFireNetWorth}`);
  check(
    'liquid + illiquid reconciles to the FIRE total',
    liquidFireNetWorth + illiquidFireNetWorth === fireNetWorth
  );

  const locked = calculatePensionLockedValue(assets, now, calculateAssetValue);
  check('locked value = 9.000 (only the fund with a future unlockDate)', locked === 9000, `got ${locked}`);

  const currentNetWorthWithLockIn = fireNetWorth - locked;
  const illiquidWithLockIn = Math.max(0, illiquidFireNetWorth - locked);
  check('current net worth with lock-in = 13.500', currentNetWorthWithLockIn === 13500, `got ${currentNetWorthWithLockIn}`);
  check(
    'illiquid with lock-in = 3.000 (the still-unlocked fund stays illiquid, just not locked)',
    illiquidWithLockIn === 3000,
    `got ${illiquidWithLockIn}`
  );
  check(
    'liquid + illiquid reconciles to the lock-in total (the row-consistency invariant)',
    liquidFireNetWorth + illiquidWithLockIn === currentNetWorthWithLockIn
  );

  console.info(
    failures === 0 ? '\n✅ All checks passed.' : `\n❌ ${failures} check(s) failed.`
  );
}

main()
  .then(() => process.exit(failures === 0 ? 0 : 1))
  .catch((error) => {
    console.error('\nExercise failed:', error);
    process.exit(1);
  });
