/**
 * Deterministic Cashflow › Divisione fixture for the Playwright suite — its OWN account.
 *
 * Run via `npm run e2e:seed:split` (Admin SDK pointed at the emulators — NEVER production).
 * Playwright's global setup runs it before every suite.
 *
 * WHY A SEPARATE ACCOUNT (test-user-split)
 * The tab is opt-in (`expenseSplitEnabled`): turning it on for the base account would add a fifth
 * tab to every Cashflow spec, and a row carrying `personalMemberId` is an ordinary row — on the
 * Analisi account it would move the exact figures those specs assert.
 *
 * THE DATES, chosen so the page reads the same whatever day the suite runs
 * Every row sits on **1 January of the current year** except one, on **31 December**. Read over
 * the whole year — the window every spec here uses — the first group has always happened and the
 * last one never has, so the split between what is booked and what is still in the calendar is a
 * constant. The ONE day that breaks it is 31 December itself, when the last row comes due; there
 * is no date that survives that and still proves the distinction.
 *
 * THE ARITHMETIC, and why these amounts
 * Salaries 2400 and 1600 give exactly 60/40, so no share is a repeating decimal. The pool is 1500,
 * of which 500 is still in the calendar:
 *
 *   |          | quota del periodo | quota contabilizzata | personali | resta (periodo) | resta (contab.) |
 *   | Ghiandaia| 900               | 600                  | 200       | 1300            | 1600            |
 *   | Tarsio   | 600               | 400                  | 1100      | −100            | +100            |
 *
 * Tarsio is the case the page exists to get right: **+100 € today, −100 € once the calendar is
 * paid**. Before 2026-09-21 the tile printed the −100 in the destructive token and the verdict
 * said «lo stipendio di Tarsio non basta» — over money still in the account.
 *
 * A third labor-income row of 1000 € is left «in comune» on purpose: labor income nobody is named
 * on cannot earn a share, and the page must SAY so rather than quietly compute 60/40 on part of
 * the month's salaries. One more row belongs to a member who is not in Famiglia, so «Senza
 * intestatario» has something in it.
 *
 * Every proper noun is a DECOY — Ghiandaia, Tarsio, Lemure, Okapi, Narvalo, Axolotl, Bradipo —
 * words that appear in no other fixture, so a locator that finds one has found this data.
 *
 * Idempotent: deterministic `split-*` ids rewritten on every run, and rows an earlier run left
 * behind are removed first.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. Run this via `npm run e2e:seed:split` ' +
      '(with the emulators started via `npm run emulators`).'
  );
  process.exit(1);
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-net-worth';
const UID = 'test-user-split';
const EMAIL = 'split@example.com';
const PASSWORD = 'test1234';

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const auth = getAuth();

const now = new Date();
const YEAR = now.getFullYear();
/** UTC midnight, the way the expense form writes a date — never local midnight. */
const JANUARY = new Date(Date.UTC(YEAR, 0, 1));
const NEW_YEARS_EVE = new Date(Date.UTC(YEAR, 11, 31));

const MEMBERS = [
  { id: 'split-m-ghiandaia', name: 'Ghiandaia' },
  { id: 'split-m-tarsio', name: 'Tarsio' },
];
/** An id `familyMembers` does not contain: its row lands in «Senza intestatario». */
const GHOST_MEMBER_ID = 'split-m-fantasma';

const CATEGORIES = [
  { id: 'split-cat-stipendio', name: 'Stipendio Ghiandaia', type: 'income' },
  { id: 'split-cat-affitto', name: 'Affitto Lemure', type: 'fixed' },
  { id: 'split-cat-bollette', name: 'Bollette Okapi', type: 'fixed' },
  { id: 'split-cat-auto', name: 'Auto Narvalo', type: 'variable' },
  { id: 'split-cat-svago', name: 'Svago Axolotl', type: 'variable' },
  { id: 'split-cat-spesa', name: 'Spesa Bradipo', type: 'variable' },
];
const CATEGORY_BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

interface SeedRow {
  id: string;
  categoryId: string;
  date: Date;
  /** Signed the way the app stores it: positive income, negative spending. */
  amount: number;
  personalMemberId?: string;
}

const ROWS: SeedRow[] = [
  { id: 'split-inc-ghiandaia', categoryId: 'split-cat-stipendio', date: JANUARY, amount: 2400, personalMemberId: 'split-m-ghiandaia' },
  { id: 'split-inc-tarsio', categoryId: 'split-cat-stipendio', date: JANUARY, amount: 1600, personalMemberId: 'split-m-tarsio' },
  // Labor income left «in comune»: it buys nobody a share, and the page must declare it.
  { id: 'split-inc-orphan', categoryId: 'split-cat-stipendio', date: JANUARY, amount: 1000 },

  { id: 'split-com-booked', categoryId: 'split-cat-affitto', date: JANUARY, amount: -1000 },
  // The row that has NOT happened: inside the pool, outside every booked residual.
  { id: 'split-com-scheduled', categoryId: 'split-cat-bollette', date: NEW_YEARS_EVE, amount: -500 },

  { id: 'split-per-ghiandaia', categoryId: 'split-cat-svago', date: JANUARY, amount: -200, personalMemberId: 'split-m-ghiandaia' },
  { id: 'split-per-tarsio', categoryId: 'split-cat-auto', date: JANUARY, amount: -1100, personalMemberId: 'split-m-tarsio' },

  { id: 'split-ghost', categoryId: 'split-cat-spesa', date: JANUARY, amount: -120, personalMemberId: GHOST_MEMBER_ID },
];

async function seedAccount(): Promise<void> {
  try {
    await auth.updateUser(UID, { email: EMAIL, password: PASSWORD, emailVerified: true });
  } catch {
    await auth.createUser({ uid: UID, email: EMAIL, password: PASSWORD, emailVerified: true });
  }
  console.info(`  ✓ account ${EMAIL}`);
}

async function removeLeftovers(): Promise<void> {
  const wanted = new Set(ROWS.map((row) => row.id));
  const snap = await db.collection('expenses').where('userId', '==', UID).get();
  const strays = snap.docs.filter((doc) => !wanted.has(doc.id));
  await Promise.all(strays.map((doc) => doc.ref.delete()));
  if (strays.length > 0) console.info(`  ✓ removed ${strays.length} row(s) left by an earlier run`);
}

async function seedData(): Promise<void> {
  await Promise.all(
    CATEGORIES.map(({ id, ...category }) =>
      db.collection('expenseCategories').doc(id).set({ userId: UID, ...category, subCategories: [], createdAt: now, updatedAt: now })
    )
  );
  await Promise.all(
    ROWS.map(({ id, categoryId, personalMemberId, ...row }) => {
      const category = CATEGORY_BY_ID.get(categoryId)!;
      return db
        .collection('expenses')
        .doc(id)
        .set({
          userId: UID,
          type: category.type,
          categoryId,
          categoryName: category.name,
          currency: 'EUR',
          // Absent means «in comune»: written only when the row belongs to somebody.
          ...(personalMemberId ? { personalMemberId } : {}),
          ...row,
          createdAt: now,
          updatedAt: now,
        });
    })
  );
  console.info(`  ✓ ${CATEGORIES.length} categories, ${ROWS.length} rows`);
}

async function seedSettings(): Promise<void> {
  // merge: a plain set would wipe whatever else a future fixture puts in this document.
  await db.collection('assetAllocationTargets').doc(UID).set(
    {
      userId: UID,
      expenseSplitEnabled: true,
      familyMembers: MEMBERS,
      laborIncomeCategoryIds: ['split-cat-stipendio'],
    },
    { merge: true }
  );
  console.info('  ✓ settings — expenseSplitEnabled, 2 members, 1 labor category');
}

console.info(`Seeding Divisione E2E fixture for ${UID} on ${PROJECT_ID}…`);
await seedAccount();
await removeLeftovers();
await seedData();
await seedSettings();
console.info('Done.');
