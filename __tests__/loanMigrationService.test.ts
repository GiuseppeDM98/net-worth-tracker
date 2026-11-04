/**
 * The migration of a legacy property debt decides on what Firestore holds now, never on the list the
 * page was given: that list can be the one IndexedDB restored, older than the migration itself, and a
 * full E2E run wrote a second loan from it (2026-11-03).
 * Falsification seen red: `migratePropertyDebtsToLoans` planning on its `assets` argument.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/types/assets';

const getDocFromServer = vi.fn();
const createAsset = vi.fn();
const commit = vi.fn();
const update = vi.fn();

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteField: vi.fn(() => 'DELETE'),
  doc: vi.fn((_db: unknown, name: string, id: string) => ({ path: `${name}/${id}`, id })),
  getDocFromServer: (ref: unknown) => getDocFromServer(ref),
  getDocs: vi.fn(async () => ({ docs: [] })),
  query: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(() => ({ update, commit })),
}));
vi.mock('@/lib/services/assetService', () => ({ createAsset: (...args: unknown[]) => createAsset(...args) }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));

const { migratePropertyDebtsToLoans } = await import('@/lib/services/loanMigration');

const restored = {
  id: 'home',
  type: 'realestate',
  name: 'Casa',
  currency: 'EUR',
  outstandingDebt: 100_000,
  debtInterestRate: 2,
} as unknown as Asset;

describe('migratePropertyDebtsToLoans', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes nothing when the property no longer carries the debt the restored list shows', async () => {
    getDocFromServer.mockResolvedValue({ exists: () => true, data: () => ({ type: 'realestate', name: 'Casa', currency: 'EUR' }) });
    await expect(migratePropertyDebtsToLoans('owner', [restored])).resolves.toEqual({ migrated: 0 });
    expect(createAsset).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it('writes nothing for a property deleted since the restored list', async () => {
    getDocFromServer.mockResolvedValue({ exists: () => false, data: () => undefined });
    await expect(migratePropertyDebtsToLoans('owner', [restored])).resolves.toEqual({ migrated: 0 });
    expect(createAsset).not.toHaveBeenCalled();
  });

  it('migrates the debt Firestore holds, not the one in the list', async () => {
    getDocFromServer.mockResolvedValue({ exists: () => true, data: () => ({ ...restored, id: undefined, outstandingDebt: 90_000 }) });
    await expect(migratePropertyDebtsToLoans('owner', [restored])).resolves.toEqual({ migrated: 1 });
    expect(createAsset).toHaveBeenCalledTimes(1);
    expect(createAsset.mock.calls[0][1]).toMatchObject({ quantity: 90_000, type: 'loan' });
  });

  it('writes nothing when the fresh read fails', async () => {
    getDocFromServer.mockRejectedValue(new Error('offline'));
    await expect(migratePropertyDebtsToLoans('owner', [restored])).rejects.toThrow('offline');
    expect(createAsset).not.toHaveBeenCalled();
  });
});
