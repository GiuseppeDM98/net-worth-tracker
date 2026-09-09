/**
 * Deterministic Coast FIRE fixture for the Playwright suite.
 *
 * Run via `npm run e2e:seed:coast`, and from Playwright's global setup AFTER the Previdenza
 * fixture — it needs `e2e-pension-fund` to already exist for the unlock inflow to have a subject.
 *
 * WHY A SEPARATE FILE, not a block inside `seedPensionE2E.mts`
 * That script is scoped to what the Previdenza view reads. This one writes only Coast FIRE
 * *settings*, on the same `assetAllocationTargets/test-user-1` document, with `merge: true` so
 * neither fixture can wipe the other's fields.
 *
 * WHY CUSTOM EXPENSES AND NOT THE CASHFLOW FALLBACK
 * `getAnnualExpenses` reads the LAST COMPLETE year, and the base seed writes current-month
 * expenses only — so without an explicit figure the Coast projection is null and the tab renders
 * its empty state. `coastFireCustomExpenses` also removes the run-month dependency the FIRE tab
 * has (AGENTS → *Browser-Driven E2E*): the expenses side of every Coast figure is then fixed.
 *
 * WHAT STAYS RUN-DATE DEPENDENT (deliberately, hence structural assertions in the spec)
 * Each pension's start date is an absolute date, so `yearsUntilStart` — and with it the deflation
 * applied to the gross amount — shifts by one day per day. The spec asserts shape and format;
 * exact arithmetic belongs to `__tests__/fireService.test.ts`.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error(
    'Refusing to seed: FIRESTORE_EMULATOR_HOST is not set. Run this via `npm run e2e:seed:coast` ' +
      '(with the emulators started via `npm run emulators`).'
  );
  process.exit(1);
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-net-worth';
const TEST_UID = 'test-user-1';

if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

/**
 * Age 35 with a Coast target at 60 puts both pensions AFTER the target, which is the case the
 * bridge model exists for: the portfolio carries the whole need for a while, and the "a regime"
 * step only appears once the last pension has started.
 */
const CURRENT_AGE = 35;
const COAST_RETIREMENT_AGE = 60;
const ANNUAL_EXPENSES = 30_000;

async function seedCoastFireSettings(): Promise<void> {
  await db
    .collection('assetAllocationTargets')
    .doc(TEST_UID)
    .set(
      {
        userId: TEST_UID,
        userAge: CURRENT_AGE,
        withdrawalRate: 4,
        includePrimaryResidenceInFIRE: false,
        coastFireRetirementAge: COAST_RETIREMENT_AGE,
        coastFireCustomExpenses: ANNUAL_EXPENSES,
        coastFirePensions: [
          {
            id: 'e2e-coast-pension-inps',
            label: 'Pensione INPS',
            grossMonthlyAmount: 2200,
            monthsPerYear: 13,
            startDate: '2058-01-01',
          },
          {
            id: 'e2e-coast-pension-estera',
            label: 'Pensione estera',
            grossMonthlyAmount: 600,
            monthsPerYear: 12,
            startDate: '2052-06-01',
          },
        ],
        // Bridge model: with the toggle on, `e2e-pension-fund` leaves the spendable capital and
        // re-enters at its RITA unlock. The long-unemployment variant (INPS 67 − 10 = 57, i.e. 22
        // years from age 35) is what puts the unlock BEFORE the Coast target at 60 — with the
        // ordinary rule it lands at 62, past the end of the projection, and the step the spec
        // asks the chart to show would fall outside the chart.
        respectPensionLockInFire: true,
        pensionInpsRetirementAge: 67,
        pensionRitaLongUnemployment: true,
      },
      { merge: true }
    );

  console.info(
    `  ✓ Coast FIRE settings (età ${CURRENT_AGE} → target ${COAST_RETIREMENT_AGE}, ` +
      `spese ${ANNUAL_EXPENSES} €, 2 pensioni, lock-in fondo attivo)`
  );
}

async function main(): Promise<void> {
  console.info(`\nSeeding Coast FIRE E2E fixture into ${PROJECT_ID} (emulator)…\n`);
  await seedCoastFireSettings();
  console.info('\nDone.\n');
}

main().catch((error) => {
  console.error('Coast FIRE E2E seed failed:', error);
  process.exit(1);
});
