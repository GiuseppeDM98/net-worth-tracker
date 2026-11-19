/**
 * The Accumulo fixture of the base account (2026-10-18), shared by `accumulo.mobile.spec.ts` and
 * `accumulo.tablet.spec.ts`: ONE active plan of 12 installments, written to the
 * Firestore emulator on the wire (the pattern of `allocation.mobile.spec.ts`: `Authorization: Bearer
 * owner`, a REST write in `beforeAll`, the removal in `afterAll`). The suite runs on ONE worker, so the
 * plan exists only while these files run and the Piano note of every other spec never sees it. The
 * plan's lock (`accumulationPlanLocks/{uid}`, «one open plan» held in a transaction) is written with it
 * and removed after it.
 *
 * By default the plan started two months before the day of the run: the open installment is the third
 * whatever the day, the first two executed (no late line), the third with nothing registered — «Rata 3
 * di 12». `startOffset: 1` makes a plan that starts next month (the `scheduled` verdict): no line executed.
 * `status: 'draft'` writes a draft instead (2026-11-12, the Consulente's hand-off): no installments, no
 * baseline, no `activatedAt`; the lock is written either way.
 * `saleMonthOffset` (2026-11-19) plants a sale of one `seed-aapl` share `saleMonthOffset` months after the open one
 * (with the default start, plan month 5 while month 3 is open: «In programma»); `reviewAtOpenMonth` writes the open
 * month as the Consulente's review month. `removeOwnerPlans` deletes every plan of the account, then the lock: a plan
 * created from the page has a generated id `removeAccumuloFixture` does not know.
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

/** Writes the active plan (by default installment 3 of 12 open) and its lock. */
export async function seedAccumuloFixture({
  startOffset = -2,
  status = 'active',
  saleMonthOffset,
  reviewAtOpenMonth = false,
}: { startOffset?: number; status?: 'active' | 'draft'; saleMonthOffset?: number; reviewAtOpenMonth?: boolean } = {}): Promise<void> {
  if (reviewAtOpenMonth && startOffset >= 1) throw new Error('reviewAtOpenMonth: no month is open before the plan starts');
  const now = new Date();
  const positionId = (assetId: string) => `e2e-pos-${assetId.replace('seed-', '')}`;
  const installments = Array.from({ length: 12 }, (_, k) => {
    const index = k + 1;
    // Executed only in the months before the current one.
    const executed = startOffset + index - 1 < 0;
    return {
      index,
      month: monthKeyAt(startOffset + index - 1),
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
  const activeOnly = status === 'active'
    ? {
        baseline: {
          capturedAt: now,
          positionValuesEur: { [positionId('seed-vwce')]: 1540, [positionId('seed-aapl')]: 1400, [positionId('seed-btp')]: 303 },
          sourceCashEur: 9212,
          pricesEur: { 'seed-vwce': 110, 'seed-aapl': 175, 'seed-btp': 101 },
          measurement: { measuredAt: now, classNotionalEur: baselineClasses, marketBaseEur: 51955 },
        },
        activatedAt: now,
      }
    : {};
  await write(`accumulationPlans/${PLAN_ID}`, {
    userId: OWNER,
    name: 'Piano E2E',
    status,
    startMonth: monthKeyAt(startOffset),
    months: 12,
    liquidity: { sourceCashAssetIds: ['seed-cash'], reserveEur: 2000, monthlyInflowEur: 0 },
    positions: WEIGHTS.map((weight) => ({
      id: positionId(weight.assetId),
      label: weight.label,
      targetPercentage: weight.targetPercentage,
      memberAssetIds: [weight.assetId],
      buyAssetId: weight.assetId,
    })),
    disposals:
      saleMonthOffset === undefined
        ? []
        : [{ assetId: 'seed-aapl', quantity: 1, monthIndex: 1 - startOffset + saleMonthOffset, estimatedProceedsEur: 175, status: 'planned' }],
    ...(reviewAtOpenMonth ? { reviewMonthIndex: 1 - startOffset } : {}),
    // A draft (the editor's draft shape since 2026-11-17) has no installments, no baseline and no activation.
    installments: status === 'active' ? installments : [],
    residualEur: 0,
    createdAt: now,
    updatedAt: now,
    ...activeOnly,
  });
  await write(`accumulationPlanLocks/${OWNER}`, { userId: OWNER, openPlanId: PLAN_ID, updatedAt: now });
}

/** Deletes every plan of the account (REST `runQuery`), then the lock; safe when there is none. */
export async function removeOwnerPlans(): Promise<void> {
  const res = await fetch(`${FIRESTORE}:runQuery`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'accumulationPlans' }],
        where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: OWNER } } },
      },
    }),
  });
  expect(res.ok, `runQuery accumulationPlans: ${res.status}`).toBe(true);
  const rows = (await res.json()) as Array<{ document?: { name: string } }>;
  for (const row of rows) {
    if (row.document) await remove(`accumulationPlans/${row.document.name.split('/').pop()}`);
  }
  await remove(`accumulationPlanLocks/${OWNER}`);
}

/** The account's active plan as written: its sales' months and each instalment's euros, by index; null without one. */
export async function readActivePlan(): Promise<{ saleMonths: number[]; instalmentEur: number[] } | null> {
  const res = await fetch(`${FIRESTORE}:runQuery`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'accumulationPlans' }],
        where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: OWNER } } },
      },
    }),
  });
  expect(res.ok, `runQuery accumulationPlans: ${res.status}`).toBe(true);
  type Value = { stringValue?: string; integerValue?: string; doubleValue?: number; mapValue?: { fields: Record<string, Value> }; arrayValue?: { values?: Value[] } };
  const rows = (await res.json()) as Array<{ document?: { fields: Record<string, Value> } }>;
  const fields = rows.map((row) => row.document?.fields).find((f) => f?.status?.stringValue === 'active');
  if (!fields) return null;
  const num = (v: Value | undefined) => Number(v?.integerValue ?? v?.doubleValue ?? 0);
  const items = (v: Value | undefined) => (v?.arrayValue?.values ?? []).map((item) => item.mapValue!.fields);
  const instalments = items(fields.installments).sort((a, b) => num(a.index) - num(b.index));
  return {
    saleMonths: items(fields.disposals).map((d) => num(d.monthIndex) || 1),
    instalmentEur: instalments.map((i) => Math.round(items(i.lines).reduce((sum, line) => sum + num(line.plannedAmountEur), 0) * 100) / 100),
  };
}

/** Removes the plan, then its lock; safe to call when they are not there. */
export async function removeAccumuloFixture(): Promise<void> {
  await remove(`accumulationPlans/${PLAN_ID}`);
  await remove(`accumulationPlanLocks/${OWNER}`);
}

// ─── The model portfolio's criteria and document (2026-11-17) ──────────────────────────────────────
// «Ricalcola» stays off until the criteria are on, and the base account has none: a spec that needs it
// switches them on in `beforeAll` and puts back what it read in `afterAll` (a spec that edits a document
// another fixture writes restores it, doc/guide/e2e-playwright.md).

const TARGETS_PATH = `assetAllocationTargets/${OWNER}`;
const MODEL_PATH = `modelPortfolios/${OWNER}`;

/** The criteria the specs switch on: the class targets essential, nothing else asked. */
const CRITERIA = {
  enabled: true,
  classPriority: 'essential',
  leveragePriority: 'high',
  factorObjectives: [],
  instrumentLimits: [],
  groupLimits: [],
};

/** The stored `idealAllocation`, as the REST value it was read in; `null` when absent. */
export type StoredCriteria = Json | null;

async function patchMasked(path: string, field: string, value: Json | null): Promise<void> {
  const body = value ? { fields: { [field]: value } } : { fields: {} };
  const res = await fetch(`${FIRESTORE}/${path}?updateMask.fieldPaths=${field}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(body) });
  expect(res.ok, `${path}.${field}: ${res.status}`).toBe(true);
}

/** Switches the criteria on and returns what was stored before. */
export async function plantCriteria(): Promise<StoredCriteria> {
  const res = await fetch(`${FIRESTORE}/${TARGETS_PATH}`, { headers: HEADERS });
  expect(res.ok, `${TARGETS_PATH}: ${res.status}`).toBe(true);
  const doc = (await res.json()) as { fields?: Record<string, Json> };
  const stored = doc.fields?.idealAllocation ?? null;
  await patchMasked(TARGETS_PATH, 'idealAllocation', toValue(CRITERIA));
  return stored;
}

/** Puts back the criteria `plantCriteria` read (absent → the field deleted) and removes the model. */
export async function restoreCriteria(stored: StoredCriteria): Promise<void> {
  await patchMasked(TARGETS_PATH, 'idealAllocation', stored);
  await remove(MODEL_PATH);
}

/** Whether the stored criteria are on (`false` when absent). */
export async function readCriteriaEnabled(): Promise<boolean> {
  const res = await fetch(`${FIRESTORE}/${TARGETS_PATH}`, { headers: HEADERS });
  const doc = (await res.json()) as { fields?: Record<string, { mapValue?: { fields?: Record<string, { booleanValue?: boolean }> } }> };
  return doc.fields?.idealAllocation?.mapValue?.fields?.enabled?.booleanValue === true;
}

/** Writes a model portfolio with the given fingerprint. */
export async function plantModel(fingerprint: string): Promise<void> {
  await write(MODEL_PATH, {
    userId: OWNER,
    weights: [
      { assetId: 'seed-vwce', targetPercentage: 70 },
      { assetId: 'seed-btp', targetPercentage: 30 },
    ],
    origin: 'manual',
    fingerprint,
    updatedAt: new Date(),
  });
}

/** The stored model's fingerprint and weights, or `null` without a model. */
export async function readModel(): Promise<{ fingerprint: string | null; assetIds: string[]; sum: number } | null> {
  const res = await fetch(`${FIRESTORE}/${MODEL_PATH}`, { headers: HEADERS });
  if (res.status === 404) return null;
  expect(res.ok, `${MODEL_PATH}: ${res.status}`).toBe(true);
  type Value = { stringValue?: string; integerValue?: string; doubleValue?: number; mapValue?: { fields: Record<string, Value> }; arrayValue?: { values?: Value[] } };
  const doc = (await res.json()) as { fields: Record<string, Value> };
  const rows = (doc.fields.weights?.arrayValue?.values ?? []).map((row) => row.mapValue!.fields);
  const pct = (v: Value | undefined) => Number(v?.integerValue ?? v?.doubleValue ?? 0);
  return {
    fingerprint: doc.fields.fingerprint?.stringValue ?? null,
    assetIds: rows.map((row) => row.assetId?.stringValue ?? ''),
    sum: rows.reduce((total, row) => total + pct(row.targetPercentage), 0),
  };
}

/** Removes the model; safe when there is none. */
export async function removeModel(): Promise<void> {
  await remove(MODEL_PATH);
}

/** The seed gives a rate only to `seed-btp` (scripts/seedEmulator.ts): «Con vendite mirate» needs it on what it sells. */
const TAXED_ASSETS = ['seed-vwce', 'seed-aapl'];

/** Plants `taxRate: 26` on the two instruments «Con vendite mirate» may sell; `removeTaxRates` deletes the field. */
export async function plantTaxRates(): Promise<void> {
  for (const id of TAXED_ASSETS) await patchMasked(`assets/${id}`, 'taxRate', toValue(26));
}

export async function removeTaxRates(): Promise<void> {
  for (const id of TAXED_ASSETS) await patchMasked(`assets/${id}`, 'taxRate', null);
}
