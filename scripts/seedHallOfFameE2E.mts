/**
 * Seed the Hall of Fame E2E fixture account into the LOCAL Firebase Emulator Suite.
 *
 * Run via `npm run e2e:seed:hof` (the emulator env is set there — NEVER against production; the
 * script refuses without `FIRESTORE_EMULATOR_HOST`). `e2e/global-setup.ts` runs it before
 * `auth.hof.setup.ts` parks the session, so re-creating the account cannot revoke a session
 * that does not exist yet.
 *
 * WHY ITS OWN ACCOUNT. A Hall of Fame is only worth a browser with a history behind it: this
 * account carries 47 monthly snapshots (novembre 2022 → settembre 2026) and one income + one
 * expense row per month, with a story the specs can name — a best month in 2024, a worst month
 * in 2023, a partial first year, a running year and a running month inside the top five. The
 * base account has a handful of snapshots of the running year, and the figures of every other
 * spec would move if it grew a history.
 *
 * WHAT IT DOES NOT WRITE: the `hall-of-fame/{uid}` document. The specs press «Aggiorna i
 * record» themselves, so the REAL route builds it through the whole data path — a document
 * written here would prove the seed, not the app. The seed deletes a previous document, so the
 * suite always starts from the empty state.
 *
 * Idempotent: deterministic ids, every previous row of the account removed first.
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. Run this via `npm run e2e:seed:hof`.');
  process.exit(1);
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-net-worth';
/** Matches `e2e/auth.hof.setup.ts`. */
export const HOF_UID = 'hof-user';
export const HOF_EMAIL = 'hof@example.com';
const PASSWORD = 'test1234';

const app = initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);
const auth = getAuth(app);
const now = new Date();

interface Month {
  year: number;
  month: number;
}

/** November 2022 → September 2026, oldest first. */
function months(): Month[] {
  const out: Month[] = [];
  for (let year = 2022; year <= 2026; year++) {
    for (let month = 1; month <= 12; month++) {
      if (year === 2022 && month < 11) continue;
      if (year === 2026 && month > 9) continue;
      out.push({ year, month });
    }
  }
  return out;
}

const key = (m: Month) => `${m.year}-${String(m.month).padStart(2, '0')}`;

/**
 * Net-worth deltas that make the story; every other month takes the deterministic default.
 * The specs name these: keep them in step with `e2e/hall-of-fame.hof*.spec.ts`.
 */
const DIFF_OVERRIDES: Record<string, number> = {
  '2023-10': -9800, // the worst month
  '2024-03': 18400, // the best month
  '2024-07': 2100,
  '2024-08': -2100,
  '2024-11': 14200, // second
  '2025-01': 12900, // third
  '2025-04': -4300,
  '2026-02': -1500,
  '2026-09': 11800, // the running month, fourth — as long as the suite runs in September 2026
};

const INCOME_OVERRIDES: Record<string, number> = {
  '2022-12': 5800,
  '2023-12': 6100,
  '2024-12': 6500,
  '2025-12': 6900, // the income record
};

const EXPENSE_OVERRIDES: Record<string, number> = {
  '2022-12': 3200,
  '2023-12': 3200,
  '2024-07': 4900, // the expense record
  '2024-12': 3250,
  '2025-12': 3200,
};

function seriesFor(index: number, m: Month) {
  const k = key(m);
  const diff = DIFF_OVERRIDES[k] ?? 900 + ((index * 37) % 1300);
  const income = INCOME_OVERRIDES[k] ?? 3100 + Math.floor(index / 12) * 150 + ((index * 13) % 5) * 40;
  const expenses = EXPENSE_OVERRIDES[k] ?? 1900 + ((index * 29) % 700);
  return { diff, income, expenses };
}

async function seedAuthUser(): Promise<void> {
  try {
    await auth.createUser({ uid: HOF_UID, email: HOF_EMAIL, password: PASSWORD, emailVerified: true });
    console.info(`  ✓ created Auth user ${HOF_EMAIL}`);
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/uid-already-exists') {
      await auth.updateUser(HOF_UID, { email: HOF_EMAIL, password: PASSWORD });
      console.info(`  ✓ updated Auth user ${HOF_EMAIL}`);
    } else if (code === 'auth/email-already-exists') {
      // The email belongs to another uid (a throwaway account of an earlier session): that
      // account is not the fixture, so it goes, and the fixture takes its place.
      const other = await auth.getUserByEmail(HOF_EMAIL);
      await auth.deleteUser(other.uid);
      await auth.createUser({ uid: HOF_UID, email: HOF_EMAIL, password: PASSWORD, emailVerified: true });
      console.info(`  ✓ replaced Auth user ${HOF_EMAIL} (was uid ${other.uid})`);
    } else {
      throw error;
    }
  }
}

async function clearPreviousRun(): Promise<void> {
  for (const name of ['monthly-snapshots', 'expenses', 'expenseCategories']) {
    const snap = await db.collection(name).where('userId', '==', HOF_UID).get();
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
  // The rankings are the app's to build: the suite starts from «I record cominciano dal secondo snapshot».
  await db.collection('hall-of-fame').doc(HOF_UID).delete();
}

async function seedData(): Promise<void> {
  await db.collection('expenseCategories').doc('hof-cat-income').set({
    userId: HOF_UID,
    name: 'Stipendio',
    type: 'income',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  });
  await db.collection('expenseCategories').doc('hof-cat-var').set({
    userId: HOF_UID,
    name: 'Spese del mese',
    type: 'variable',
    subCategories: [],
    createdAt: now,
    updatedAt: now,
  });
  await db.collection('assetAllocationTargets').doc(HOF_UID).set({ userId: HOF_UID, laborIncomeCategoryIds: ['hof-cat-income'] });

  let netWorth = 120_000;
  const batch = db.batch();
  months().forEach((m, index) => {
    const { diff, income, expenses } = seriesFor(index, m);
    if (index > 0) netWorth += diff;
    batch.set(db.collection('monthly-snapshots').doc(`${HOF_UID}-${m.year}-${m.month}`), {
      userId: HOF_UID,
      year: m.year,
      month: m.month,
      totalNetWorth: netWorth,
      liquidNetWorth: netWorth,
      illiquidNetWorth: 0,
      byAssetClass: { equity: netWorth },
      assetAllocation: { equity: netWorth },
      createdAt: new Date(Date.UTC(m.year, m.month - 1, 28, 11)),
    });
    // Mid-month at noon UTC: the same Italian calendar day in every timezone the suite runs in.
    const date = new Date(Date.UTC(m.year, m.month - 1, 15, 11));
    batch.set(db.collection('expenses').doc(`hof-exp-${key(m)}-in`), {
      userId: HOF_UID,
      type: 'income',
      categoryId: 'hof-cat-income',
      categoryName: 'Stipendio',
      amount: income,
      currency: 'EUR',
      date,
      createdAt: now,
      updatedAt: now,
    });
    batch.set(db.collection('expenses').doc(`hof-exp-${key(m)}-out`), {
      userId: HOF_UID,
      type: 'variable',
      categoryId: 'hof-cat-var',
      categoryName: 'Spese del mese',
      amount: -expenses,
      currency: 'EUR',
      date,
      createdAt: now,
      updatedAt: now,
    });
  });
  await batch.commit();
  console.info(`  ✓ ${months().length} snapshots + ${months().length * 2} expense rows (net worth ends at ${netWorth} €)`);
}

async function main(): Promise<void> {
  console.info(`\nSeeding the Hall of Fame E2E fixture (project ${PROJECT_ID}) …`);
  await seedAuthUser();
  await clearPreviousRun();
  await seedData();
  console.info('Done.\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
