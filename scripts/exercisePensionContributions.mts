/**
 * Exercise the pension contribution service against the LOCAL Firebase Emulator Suite.
 *
 * Why this exists: `__tests__/pensionContributionService.test.ts` mocks Firestore and every
 * collaborating service, so it proves the ORCHESTRATION but never touches a real backend. Four
 * things stay invisible to it and are checked here instead:
 *   1. the `pensionContributions` Firestore rules — this script signs in as the seeded user and
 *      writes through the CLIENT SDK, so every write is rule-evaluated exactly as in the app;
 *   2. real `Timestamp` values surviving `removeUndefinedDeep` (the unit test's fake returns a Date,
 *      which passes for a different reason than a real Timestamp does);
 *   3. the composition service → `reconcileTransferCreate` → `updateCashAssetBalancesAtomic`, i.e.
 *      a real Firestore transaction rather than a mock;
 *   4. the real `createExpense`, including the transfer sign convention and category denormalisation.
 *
 * Run via `npm run emulators:pension` (emulators must already be up and seeded). It refuses to start
 * unless NEXT_PUBLIC_USE_FIREBASE_EMULATOR is set, so it can never reach production.
 *
 * Side effects: it converts `seed-pension-legacy` to AssetType `pensionFund` (a stand-in for the P2
 * AssetDialog edit) and leaves ONE voluntary contribution in place, so the dev server has something
 * to show — a transfer row in Cashflow that must not move the savings rate. Re-runnable.
 */

if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true') {
  console.error(
    'Refusing to run: NEXT_PUBLIC_USE_FIREBASE_EMULATOR is not "true". Run this via ' +
      '`npm run emulators:pension` (with `npm run emulators` up and `npm run emulators:seed` done).'
  );
  process.exit(1);
}

// Division of labour, and it is deliberate:
//   · the app's SERVICES (the code under test) run on the CLIENT SDK, signed in as the seeded user,
//     so every write they make is evaluated against firestore.rules exactly as in the browser;
//   · this script's own reads and fixture edits go through the ADMIN SDK, the same way
//     seedEmulator.ts does.
// Mixing the two is not just convenience. This file is ESM (.mts) while the app's modules are CJS
// under tsx, so the client SDK's submodules resolve inconsistently across that boundary — a
// `doc()` obtained here rejects a `db` built over there ("Expected first argument to doc() to be a
// CollectionReference…"). Reading through Admin sidesteps the dual-instance hazard entirely.
const { initializeApp: initAdminApp } = await import('firebase-admin/app');
const { getFirestore: getAdminFirestore } = await import('firebase-admin/firestore');
const { signInWithEmailAndPassword } = await import('firebase/auth');
const { auth } = await import('@/lib/firebase/config');

const adminDb = getAdminFirestore(initAdminApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-net-worth' }));
const {
  getPensionContributions,
  recordPensionContribution,
  deletePensionContribution,
} = await import('@/lib/services/pensionContributionService');
const { derivePensionDeductibleByYear, derivePensionContributionsByYearAndNature } = await import(
  '@/lib/utils/pensionContributions'
);

const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'test1234';
const TEST_UID = 'test-user-1';
const FUND_ID = 'seed-pension-legacy';
const CASH_ID = 'seed-cash';
const NON_CASH_ID = 'seed-vwce';
const TAX_YEAR = new Date().getFullYear();

let failures = 0;

// Expected noise, silenced so the report stays readable: every balance write calls
// `invalidateDashboardOverviewSummary`, which POSTs to a RELATIVE URL. There is no Next server here,
// so it throws "Failed to parse URL" — already caught and warned by the helper, because overview
// invalidation must never fail the user's actual action. Anything else still prints.
const realWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('[dashboardOverviewInvalidation]')) return;
  realWarn(...args);
};

/** Assert a condition, recording (not throwing on) a failure so the whole run is reported at once. */
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.info(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Assert that an awaited call rejects with a message containing `fragment`. */
async function checkThrows(label: string, action: () => Promise<unknown>, fragment: string): Promise<void> {
  try {
    await action();
    check(label, false, 'expected a rejection, got success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(label, message.includes(fragment), `message was "${message}"`);
  }
}

/** Current euro value of an asset (fund and cash both keep it in `quantity` at price 1). */
async function balanceOf(assetId: string): Promise<number> {
  const snapshot = await adminDb.collection('assets').doc(assetId).get();
  if (!snapshot.exists) throw new Error(`Asset ${assetId} not found — run \`npm run emulators:seed\` first.`);
  return snapshot.data()!.quantity as number;
}

/** Transfer expenses currently linked to the fund (the audit-trail rows of voluntary contributions). */
async function transferExpensesToFund(): Promise<number> {
  const snapshot = await adminDb
    .collection('expenses')
    .where('userId', '==', TEST_UID)
    .where('transferCashAssetId', '==', FUND_ID)
    .get();
  return snapshot.size;
}

async function main(): Promise<void> {
  console.info('\nExercising pension contributions against the emulator …\n');

  await signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
  console.info(`Signed in as ${TEST_EMAIL} (uid ${auth.currentUser?.uid}) — writes are rule-evaluated.\n`);

  // Clean slate: remove anything a previous run left behind, reversing its effects properly.
  const leftovers = await getPensionContributions(TEST_UID, FUND_ID);
  for (const leftover of leftovers) await deletePensionContribution(leftover);
  if (leftovers.length > 0) console.info(`Cleared ${leftovers.length} contribution(s) from a previous run.\n`);

  // Stand-in for the P2 AssetDialog edit: convert the legacy etf into a pensionFund IN PLACE, so the
  // assetId — and therefore every monthly snapshot keyed by it — survives.
  await adminDb.collection('assets').doc(FUND_ID).update({ type: 'pensionFund', updatedAt: new Date() });
  const converted = (await adminDb.collection('assets').doc(FUND_ID).get()).data();
  console.info('── Conversion (stand-in for the P2 edit) ──');
  check('legacy fund is now AssetType pensionFund', converted?.type === 'pensionFund');
  check('conversion left the value untouched', converted?.quantity === 12000, `quantity=${converted?.quantity}`);

  const fundStart = await balanceOf(FUND_ID);
  const cashStart = await balanceOf(CASH_ID);
  const transfersStart = await transferExpensesToFund();
  console.info(`\nStarting state: fund €${fundStart}, cash €${cashStart}\n`);

  // ── TFR: credits the fund standalone, creates no Expense ──────────────────
  console.info('── TFR ──');
  await recordPensionContribution(TEST_UID, {
    assetId: FUND_ID,
    source: 'tfr',
    amount: 1500,
    date: new Date(),
  });
  check('fund +1500', (await balanceOf(FUND_ID)) === fundStart + 1500);
  check('cash untouched', (await balanceOf(CASH_ID)) === cashStart);
  check('no transfer entry created', (await transferExpensesToFund()) === transfersStart);

  // ── Employer: same value effect, but deductible ───────────────────────────
  console.info('\n── Employer ──');
  await recordPensionContribution(TEST_UID, {
    assetId: FUND_ID,
    source: 'employer',
    amount: 800,
    date: new Date(),
  });
  check('fund +800', (await balanceOf(FUND_ID)) === fundStart + 2300);
  check('cash still untouched', (await balanceOf(CASH_ID)) === cashStart);

  // ── Voluntary: a real transfer through a real Firestore transaction ───────
  console.info('\n── Voluntary (transfer) ──');
  await recordPensionContribution(TEST_UID, {
    assetId: FUND_ID,
    source: 'voluntary',
    amount: 500,
    date: new Date(),
    sourceCashAssetId: CASH_ID,
    notes: 'Versamento volontario di prova',
  });
  check('fund +500', (await balanceOf(FUND_ID)) === fundStart + 2800);
  check('cash −500', (await balanceOf(CASH_ID)) === cashStart - 500);
  check('one transfer entry created', (await transferExpensesToFund()) === transfersStart + 1);

  const contributions = await getPensionContributions(TEST_UID, FUND_ID);
  check('three contributions persisted', contributions.length === 3, `got ${contributions.length}`);
  check(
    'newest first',
    contributions.every((c, i) => i === 0 || contributions[i - 1].date >= c.date)
  );
  const voluntary = contributions.find((c) => c.source === 'voluntary');
  check('voluntary carries linkedExpenseId', !!voluntary?.linkedExpenseId);
  check('voluntary carries sourceCashAssetId', voluntary?.sourceCashAssetId === CASH_ID);
  check('voluntary is flagged deductible', voluntary?.deductible === true);
  check('TFR is flagged non-deductible', contributions.find((c) => c.source === 'tfr')?.deductible === false);
  check('dates round-tripped as real Dates', voluntary?.date instanceof Date);

  // The transfer entry itself: sign convention and denormalised category.
  const transferDoc = await adminDb.collection('expenses').doc(voluntary!.linkedExpenseId!).get();
  check('transfer entry exists', transferDoc.exists);
  check('transfer entry is type "transfer"', transferDoc.data()?.type === 'transfer');
  check('transfer amount is positive (net-zero convention)', transferDoc.data()?.amount === 500);
  check('transfer origin is the cash account', transferDoc.data()?.linkedCashAssetId === CASH_ID);

  // ── Roll-ups ──────────────────────────────────────────────────────────────
  console.info('\n── Roll-ups ──');
  const deductible = derivePensionDeductibleByYear(contributions);
  check('deductible excludes TFR (800 + 500)', deductible[TAX_YEAR] === 1300, JSON.stringify(deductible));
  const byNature = derivePensionContributionsByYearAndNature(contributions);
  check(
    'per-nature split is complete',
    byNature[TAX_YEAR]?.tfr === 1500 && byNature[TAX_YEAR]?.voluntary === 500 && byNature[TAX_YEAR]?.employer === 800,
    JSON.stringify(byNature)
  );

  // ── Guards ────────────────────────────────────────────────────────────────
  console.info('\n── Guards ──');
  await checkThrows(
    'voluntary without a source account is rejected',
    () => recordPensionContribution(TEST_UID, { assetId: FUND_ID, source: 'voluntary', amount: 100, date: new Date() }),
    'requires a source cash account'
  );
  await checkThrows(
    'voluntary from a non-cash asset is rejected',
    () =>
      recordPensionContribution(TEST_UID, {
        assetId: FUND_ID,
        source: 'voluntary',
        amount: 100,
        date: new Date(),
        sourceCashAssetId: NON_CASH_ID,
      }),
    'must come from a cash account'
  );
  await checkThrows(
    'non-positive amount is rejected',
    () => recordPensionContribution(TEST_UID, { assetId: FUND_ID, source: 'tfr', amount: 0, date: new Date() }),
    'positive number'
  );
  check('guards left the balances alone', (await balanceOf(FUND_ID)) === fundStart + 2800);

  // ── Deletion: exact reversal (invariant #5) ───────────────────────────────
  console.info('\n── Deletion (exact reversal) ──');
  for (const contribution of await getPensionContributions(TEST_UID, FUND_ID)) {
    await deletePensionContribution(contribution);
  }
  check('fund back to its starting value', (await balanceOf(FUND_ID)) === fundStart);
  check('cash back to its starting value', (await balanceOf(CASH_ID)) === cashStart);
  check('transfer entry removed', (await transferExpensesToFund()) === transfersStart);
  check('no contributions left', (await getPensionContributions(TEST_UID, FUND_ID)).length === 0);

  // Leave one voluntary contribution behind for the manual dev-server inspection.
  await recordPensionContribution(TEST_UID, {
    assetId: FUND_ID,
    source: 'voluntary',
    amount: 500,
    date: new Date(),
    sourceCashAssetId: CASH_ID,
    notes: 'Versamento volontario di prova',
  });

  console.info(
    failures === 0
      ? '\n✅ All checks passed.'
      : `\n❌ ${failures} check(s) failed.`
  );
  console.info(
    '\nLeft in place for manual inspection (`npm run dev:emulator`):\n' +
      `  · ${FUND_ID} converted to AssetType pensionFund, value €${fundStart + 500}\n` +
      '  · one voluntary contribution of €500 → a transfer row in Cashflow → Tracciamento\n' +
      '  · that row must NOT move the savings rate or any budget (invariant #1)\n'
  );
}

main()
  .then(() => process.exit(failures === 0 ? 0 : 1))
  .catch((error) => {
    console.error('\nExercise failed:', error);
    process.exit(1);
  });
