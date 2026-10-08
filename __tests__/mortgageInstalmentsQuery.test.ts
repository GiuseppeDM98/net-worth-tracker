/**
 * `getMortgageInstalments` — ONE Firestore query for every property (2026-09-29), with
 * `debtAssetId in [...]` beside the `userId` equality the rules need, and the ids in chunks of 30
 * because that is Firestore's ceiling on an `in` filter: 31 ids are two queries. Pinned here so
 * the ceiling cannot drift (a 31-id chunk is refused by Firestore at runtime, never by `tsc`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDocsMock = vi.fn();

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ collectionName: name }),
  doc: (_db: unknown, name: string, id: string) => ({ collectionName: name, id }),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string, direction?: string) => ({ orderBy: field, direction }),
  writeBatch: () => ({ update: vi.fn(), set: vi.fn(), delete: vi.fn(), commit: vi.fn() }),
  runTransaction: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  deleteField: () => '__deleteField__',
  Timestamp: { now: () => new Date('2026-09-29T09:00:00Z'), fromDate: (date: Date) => date },
}));

import { chunkForInQuery, FIRESTORE_IN_LIMIT, getMortgageInstalments } from '@/lib/services/expenseService';

/** A stored instalment row, as `getDocs` hands it back. */
const rowDoc = (id: string, debtAssetId: string) => ({
  id,
  data: () => ({ userId: 'owner', debtAssetId, amount: -700, date: { toDate: () => new Date(2026, 0, 1) }, type: 'debt' }),
});

describe('chunkForInQuery', () => {
  it('keeps up to 30 ids in one chunk and splits the 31st into a second', () => {
    const ids = Array.from({ length: 31 }, (_, i) => `p${i}`);
    expect(FIRESTORE_IN_LIMIT).toBe(30);
    expect(chunkForInQuery(ids.slice(0, 30))).toHaveLength(1);
    const chunks = chunkForInQuery(ids);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(30);
    expect(chunks[1]).toEqual(['p30']);
  });

  it('gives no chunk for no ids', () => {
    expect(chunkForInQuery([])).toEqual([]);
  });
});

describe('getMortgageInstalments', () => {
  beforeEach(() => getDocsMock.mockReset());

  it('reads every property in ONE query: userId equality plus debtAssetId in [...]', async () => {
    getDocsMock.mockResolvedValueOnce({ docs: [rowDoc('r1', 'casa'), rowDoc('r2', 'box')] });

    const rows = await getMortgageInstalments('owner', ['casa', 'box']);

    expect(getDocsMock).toHaveBeenCalledTimes(1);
    const { constraints } = getDocsMock.mock.calls[0][0] as { constraints: { field: string; op: string; value: unknown }[] };
    expect(constraints).toEqual([
      { field: 'userId', op: '==', value: 'owner' },
      { field: 'debtAssetId', op: 'in', value: ['casa', 'box'] },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['r1', 'r2']);
  });

  it('splits 31 properties into two queries and concatenates their rows', async () => {
    const ids = Array.from({ length: 31 }, (_, i) => `p${i}`);
    getDocsMock.mockResolvedValueOnce({ docs: [rowDoc('a', 'p0')] }).mockResolvedValueOnce({ docs: [rowDoc('b', 'p30')] });

    const rows = await getMortgageInstalments('owner', ids);

    expect(getDocsMock).toHaveBeenCalledTimes(2);
    const inValues = getDocsMock.mock.calls.map((call) => (call[0] as { constraints: { value: unknown }[] }).constraints[1].value as string[]);
    expect(inValues[0]).toHaveLength(30);
    expect(inValues[1]).toEqual(['p30']);
    expect(rows.map((row) => row.id)).toEqual(['a', 'b']);
  });
});
