/**
 * The Accumulo fixture of the base account (2026-10-18), shared by `accumulo.mobile.spec.ts` and
 * `accumulo.tablet.spec.ts`: ONE active plan of 12 installments, written to the
 * Firestore emulator on the wire (the pattern of `allocation.mobile.spec.ts`: `Authorization: Bearer
 * owner`, a REST write in `beforeAll`, the removal in `afterAll`). The suite runs on ONE worker, so the
 * plan exists only while these files run and the Bilanciamento verdict of every other spec (which names
 * an active plan's installment) never sees it.
 *
 * The plan started two months before the day of the run: the open installment is the third whatever
 * the day, the first two executed (no late line), the third with nothing registered — «Rata 3 di 12».
 * Instruments are the base seed's (`seed-vwce`, `seed-aapl`, `seed-btp`, scripts/seedEmulator.ts), at
 * the prices the seed stamps; round invented figures (WORKFLOW.md § 1 rule 7). The spec asserts the
 * STRUCTURE, never a figure: the euro amounts follow the seed's prices.
 *
 * A helper, not a spec: no project collects it (`testMatch`), it only exports.
 */

import { expect } from '@playwright/test';

const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
const HEADERS = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const OWNER = 'test-user-1';
const PLAN_ID = 'e2e-accumulo-plan';

type Json = Record<string, unknown>;

/** A JS value as a Firestore REST value (dates become timestamps). */
function toValue(value: unknown): Json {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  return { mapValue: { fields: toFields(value as Json) } };
}

function toFields(object: Json): Json {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined).map(([key, value]) => [key, toValue(value)]));
}

async function write(path: string, data: Json): Promise<void> {
  const res = await fetch(`${FIRESTORE}/${path}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify({ fields: toFields(data) }) });
  expect(res.ok, `${path}: ${res.status}`).toBe(true);
}

async function remove(path: string): Promise<void> {
  await fetch(`${FIRESTORE}/${path}`, { method: 'DELETE', headers: HEADERS });
}

/** The 'YYYY-MM' key of the month `offset` months from the machine's current one. */
function monthKeyAt(offset: number): string {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const WEIGHTS = [
  { assetId: 'seed-vwce', targetPercentage: 50, label: 'Vanguard FTSE All-World', price: 110, quantity: 3 },
  { assetId: 'seed-aapl', targetPercentage: 20, label: 'Apple Inc.', price: 175, quantity: 1 },
  { assetId: 'seed-btp', targetPercentage: 30, label: 'BTP Valore 2030', price: 101, quantity: 1 },
];

/** Writes the active plan (installment 3 of 12 open). */
export async function seedAccumuloFixture(): Promise<void> {
  const now = new Date();
  const positionId = (assetId: string) => `e2e-pos-${assetId.replace('seed-', '')}`;
  const installments = Array.from({ length: 12 }, (_, k) => {
    const index = k + 1;
    const executed = index <= 2;
    return {
      index,
      month: monthKeyAt(index - 3),
      carryInEur: {},
      ...(executed ? { confirmedAt: now } : {}),
      lines: WEIGHTS.map((weight) => ({
        positionId: positionId(weight.assetId),
        assetId: weight.assetId,
        plannedQuantity: weight.quantity,
        priceEurAtPlan: weight.price,
        plannedAmountEur: weight.quantity * weight.price,
        status: executed ? 'executed' : 'planned',
        ...(executed ? { executedQuantity: weight.quantity, executedAmountEur: weight.quantity * weight.price } : {}),
      })),
    };
  });
  // Two months ago: the seed's portfolio minus the two installments' purchases, the cash back.
  const baselineClasses = { equity: 14940, bonds: 303, crypto: 27500, cash: 9212 };
  await write(`accumulationPlans/${PLAN_ID}`, {
    userId: OWNER,
    name: 'Piano E2E',
    status: 'active',
    startMonth: monthKeyAt(-2),
    months: 12,
    liquidity: { sourceCashAssetIds: ['seed-cash'], reserveEur: 2000, monthlyInflowEur: 0 },
    positions: WEIGHTS.map((weight) => ({
      id: positionId(weight.assetId),
      label: weight.label,
      targetPercentage: weight.targetPercentage,
      memberAssetIds: [weight.assetId],
      buyAssetId: weight.assetId,
    })),
    disposals: [],
    baseline: {
      capturedAt: now,
      positionValuesEur: { [positionId('seed-vwce')]: 1540, [positionId('seed-aapl')]: 1400, [positionId('seed-btp')]: 303 },
      sourceCashEur: 9212,
      pricesEur: { 'seed-vwce': 110, 'seed-aapl': 175, 'seed-btp': 101 },
      measurement: { measuredAt: now, classNotionalEur: baselineClasses, marketBaseEur: 51955 },
    },
    installments,
    residualEur: 0,
    createdAt: now,
    updatedAt: now,
    activatedAt: now,
  });
}

/** Removes the plan; safe to call when it is not there. */
export async function removeAccumuloFixture(): Promise<void> {
  await remove(`accumulationPlans/${PLAN_ID}`);
}
