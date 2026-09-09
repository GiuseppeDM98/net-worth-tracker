/**
 * Deterministic Analisi fixture for the Playwright suite — its OWN account.
 *
 * Run via `npm run e2e:seed:analisi` (Admin SDK pointed at the emulators — NEVER production).
 * Playwright's global setup runs it before every suite, so the specs can assert exact figures.
 *
 * WHY A SEPARATE ACCOUNT (test-user-analisi), not test-user-1
 * The base seed writes three expenses for test-user-1 dated the 5th of the CURRENT month — useful
 * for manual dev, fatal for exact assertions: every KPI and composition total would drift with the
 * run date and with any future change to the base seed. Same isolation reasoning as the degraded
 * Previdenza account.
 *
 * WHY EVERY EXPENSE IS DATED JANUARY 15th
 * The Analisi page windows on the REAL clock (Anno Corrente, YTD "stessi mesi", trailing windows).
 * January is the one month guaranteed to be inside every year-to-date window whatever month the
 * suite runs in, so totals, YoY deltas and pacing percentages stay byte-identical all year round.
 * Years are RELATIVE (current/previous) for the same reason.
 *
 * THE FIGURES, chosen so every derived number is exact:
 *   current year (CY), all January:  Condominio −300 · Elettricità −80 · Alimentari −400 ·
 *                                    Stipendio +2000 · Giroconto +150 (transfer — excluded everywhere)
 *   previous year (PY), all January: Condominio −250 · Elettricità −90 · Alimentari −500 ·
 *                                    Palestra −60 (only PY → status 'gone') · Stipendio +1900
 * ⇒ KPI CY: Entrate 2000 · Spese 780 · Risparmio 1220 (61.0%)
 * ⇒ pacing:  spese (780−900)/900 = −13.3% · entrate (2000−1900)/1900 = +5.3%
 * ⇒ Casa:    CY 380 vs PY 340 → +40 (+11.8%) · Condominio: CY 300 vs PY 250 → +50 (+20.0%)
 * ⇒ delta ranking by |Δ|: Alimentari −100 → Palestra −60 (Cessata) → Casa +40
 * "Viaggi › Skipass" exists in the taxonomy with ZERO expenses: the search-only reachability case.
 *
 * Idempotent: deterministic `e2e-*` doc ids overwritten on every run; the Auth user is
 * created-or-updated. Safe to combine account+data in one script because the global setup runs it
 * BEFORE auth.analisi.setup.ts parks the session (updating a password revokes refresh tokens).
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. Run this via `npm run e2e:seed:analisi` ' +
      '(with the emulators started via `npm run emulators`).'
  );
  process.exit(1);
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-net-worth';
const UID = 'test-user-analisi';
const EMAIL = 'analisi@example.com';
const PASSWORD = 'test1234';

const CURRENT_YEAR = new Date().getFullYear();
const PREVIOUS_YEAR = CURRENT_YEAR - 1;

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();
const auth = getAuth();
const now = new Date();

/** January 15th — inside every YTD window regardless of when the suite runs. */
const january = (year: number) => new Date(year, 0, 15);

interface CategoryFixture {
  id: string;
  name: string;
  type: string;
  subCategories: Array<{ id: string; name: string }>;
}

const CATEGORIES: CategoryFixture[] = [
  {
    id: 'e2e-cat-casa',
    name: 'Casa',
    type: 'fixed',
    subCategories: [
      { id: 'e2e-sub-cond', name: 'Condominio' },
      { id: 'e2e-sub-elet', name: 'Elettricità' },
    ],
  },
  { id: 'e2e-cat-alimentari', name: 'Alimentari', type: 'variable', subCategories: [] },
  // Only previous-year spending: the 'gone' row of the Confronto delta ranking.
  { id: 'e2e-cat-palestra', name: 'Palestra', type: 'variable', subCategories: [] },
  // Zero expenses on purpose: reachable ONLY through EntitySearch.
  {
    id: 'e2e-cat-viaggi',
    name: 'Viaggi',
    type: 'variable',
    subCategories: [{ id: 'e2e-sub-skipass', name: 'Skipass' }],
  },
  { id: 'e2e-cat-stipendio', name: 'Stipendio', type: 'income', subCategories: [] },
  // Must NEVER surface in the entity search — transfers have no dossier semantics.
  { id: 'e2e-cat-giroconto', name: 'Giroconto', type: 'transfer', subCategories: [] },
];

interface ExpenseFixture {
  id: string;
  year: number;
  type: string;
  categoryId: string;
  categoryName: string;
  subCategoryId?: string;
  subCategoryName?: string;
  amount: number;
  notes?: string;
}

const EXPENSES: ExpenseFixture[] = [
  // Current year — January.
  { id: 'e2e-exp-cond-cy', year: CURRENT_YEAR, type: 'fixed', categoryId: 'e2e-cat-casa', categoryName: 'Casa', subCategoryId: 'e2e-sub-cond', subCategoryName: 'Condominio', amount: -300, notes: 'rata condominio' },
  { id: 'e2e-exp-elet-cy', year: CURRENT_YEAR, type: 'fixed', categoryId: 'e2e-cat-casa', categoryName: 'Casa', subCategoryId: 'e2e-sub-elet', subCategoryName: 'Elettricità', amount: -80 },
  { id: 'e2e-exp-food-cy', year: CURRENT_YEAR, type: 'variable', categoryId: 'e2e-cat-alimentari', categoryName: 'Alimentari', amount: -400 },
  { id: 'e2e-exp-income-cy', year: CURRENT_YEAR, type: 'income', categoryId: 'e2e-cat-stipendio', categoryName: 'Stipendio', amount: 2000 },
  // Excluded from every Analisi figure — its presence proves the exclusion.
  { id: 'e2e-exp-transfer-cy', year: CURRENT_YEAR, type: 'transfer', categoryId: 'e2e-cat-giroconto', categoryName: 'Giroconto', amount: 150 },
  // Previous year — January.
  { id: 'e2e-exp-cond-py', year: PREVIOUS_YEAR, type: 'fixed', categoryId: 'e2e-cat-casa', categoryName: 'Casa', subCategoryId: 'e2e-sub-cond', subCategoryName: 'Condominio', amount: -250 },
  { id: 'e2e-exp-elet-py', year: PREVIOUS_YEAR, type: 'fixed', categoryId: 'e2e-cat-casa', categoryName: 'Casa', subCategoryId: 'e2e-sub-elet', subCategoryName: 'Elettricità', amount: -90 },
  { id: 'e2e-exp-food-py', year: PREVIOUS_YEAR, type: 'variable', categoryId: 'e2e-cat-alimentari', categoryName: 'Alimentari', amount: -500 },
  { id: 'e2e-exp-gym-py', year: PREVIOUS_YEAR, type: 'variable', categoryId: 'e2e-cat-palestra', categoryName: 'Palestra', amount: -60 },
  { id: 'e2e-exp-income-py', year: PREVIOUS_YEAR, type: 'income', categoryId: 'e2e-cat-stipendio', categoryName: 'Stipendio', amount: 1900 },
];

async function seedAccount(): Promise<void> {
  try {
    await auth.updateUser(UID, { email: EMAIL, password: PASSWORD, emailVerified: true });
  } catch {
    await auth.createUser({ uid: UID, email: EMAIL, password: PASSWORD, emailVerified: true });
  }
  console.info(`  ✓ account ${EMAIL}`);
}

async function seedCategories(): Promise<void> {
  await Promise.all(
    CATEGORIES.map((category) =>
      db.collection('expenseCategories').doc(category.id).set({
        userId: UID,
        name: category.name,
        type: category.type,
        subCategories: category.subCategories,
        createdAt: now,
        updatedAt: now,
      })
    )
  );
  console.info(`  ✓ ${CATEGORIES.length} categories (incl. zero-spend Viaggi›Skipass + transfer)`);
}

async function seedExpenses(): Promise<void> {
  await Promise.all(
    EXPENSES.map((expense) =>
      db.collection('expenses').doc(expense.id).set({
        userId: UID,
        type: expense.type,
        categoryId: expense.categoryId,
        categoryName: expense.categoryName,
        ...(expense.subCategoryId
          ? { subCategoryId: expense.subCategoryId, subCategoryName: expense.subCategoryName }
          : {}),
        amount: expense.amount,
        currency: 'EUR',
        date: january(expense.year),
        ...(expense.notes ? { notes: expense.notes } : {}),
        createdAt: now,
        updatedAt: now,
      })
    )
  );
  console.info(`  ✓ ${EXPENSES.length} expenses (all January, ${PREVIOUS_YEAR}+${CURRENT_YEAR})`);
}

async function seedSettings(): Promise<void> {
  // merge: this account has no other settings today, but a plain set would silently
  // wipe any a future fixture adds.
  await db.collection('assetAllocationTargets').doc(UID).set(
    {
      userId: UID,
      // The floor is load-bearing: it makes PREVIOUS_YEAR the first tracked year, so
      // the dossier's oldest row shows "—" and the pacing baseline is always valid.
      cashflowHistoryStartYear: PREVIOUS_YEAR,
    },
    { merge: true }
  );
  console.info(`  ✓ settings (cashflowHistoryStartYear = ${PREVIOUS_YEAR})`);
}

console.info(`Seeding Analisi E2E fixture for ${UID} on ${PROJECT_ID}…`);
await seedAccount();
await seedCategories();
await seedExpenses();
await seedSettings();
console.info('Done.');
