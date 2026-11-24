/**
 * assetService.deleteAsset (2026-11-23): a 409 `has-ledger-operations` becomes an `AssetDeleteRefusedError`
 * carrying the count, untouched by the final catch that wraps every other failure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authenticatedFetch } = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch }));

import { AssetDeleteRefusedError, deleteAsset } from '@/lib/services/assetService';

const reply = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('deleteAsset', () => {
  beforeEach(() => {
    authenticatedFetch.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('a 409 with the ledger code → AssetDeleteRefusedError with the count', async () => {
    authenticatedFetch.mockResolvedValue(reply(409, { error: 'Asset has ledger operations', code: 'has-ledger-operations', operations: 3 }));

    const error = await deleteAsset('asset-1', 'owner-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AssetDeleteRefusedError);
    expect((error as AssetDeleteRefusedError).operations).toBe(3);
  });

  it('any other failure stays wrapped in the generic error', async () => {
    authenticatedFetch.mockResolvedValue(reply(500, { error: 'boom' }));

    const error = await deleteAsset('asset-1', 'owner-1').catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(AssetDeleteRefusedError);
    expect((error as Error).message).toBe('Failed to delete asset asset-1');
  });

  it('a 200 resolves', async () => {
    authenticatedFetch.mockResolvedValue(reply(200, { success: true, deletedFutureDividends: 0 }));
    await expect(deleteAsset('asset-1', 'owner-1')).resolves.toBeUndefined();
  });
});
