/**
 * Unit tests for assertCanAccessAccount — the delegated-access gate that lets a
 * member act on another user's account while denying everyone else.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecodedIdToken } from 'firebase-admin/auth';

const { accountAccessDocGetMock, collectionMock, docMock } = vi.hoisted(() => {
  const accountAccessDocGetMock = vi.fn();
  const docMock = vi.fn(() => ({ get: accountAccessDocGetMock }));
  const collectionMock = vi.fn(() => ({ doc: docMock }));
  return { accountAccessDocGetMock, collectionMock, docMock };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {},
  adminDb: { collection: collectionMock },
}));

import { assertCanAccessAccount } from '@/lib/server/apiAuth';

const token = (uid: string) => ({ uid }) as DecodedIdToken;

describe('assertCanAccessAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows the owner without reading Firestore', async () => {
    // Arrange: caller is the owner.
    // Act
    await assertCanAccessAccount(token('owner-1'), 'owner-1');
    // Assert: no membership lookup was needed.
    expect(collectionMock).not.toHaveBeenCalled();
  });

  it('allows a member listed in the grant', async () => {
    // Arrange
    accountAccessDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ memberUids: ['spouse-1', 'other-2'] }),
    });
    // Act + Assert: does not throw.
    await expect(
      assertCanAccessAccount(token('spouse-1'), 'owner-1')
    ).resolves.toBeUndefined();
    expect(collectionMock).toHaveBeenCalledWith('account-access');
    expect(docMock).toHaveBeenCalledWith('owner-1');
  });

  it('denies a non-member with 403', async () => {
    // Arrange: grant exists but caller is not in it.
    accountAccessDocGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ memberUids: ['spouse-1'] }),
    });
    // Act + Assert
    await expect(
      assertCanAccessAccount(token('stranger-9'), 'owner-1')
    ).rejects.toMatchObject({ status: 403 });
  });

  it('denies with 403 when no grant document exists', async () => {
    // Arrange
    accountAccessDocGetMock.mockResolvedValue({ exists: false, data: () => undefined });
    // Act + Assert
    await expect(
      assertCanAccessAccount(token('spouse-1'), 'owner-1')
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects with 400 when the owner id is missing', async () => {
    // Act + Assert
    await expect(
      assertCanAccessAccount(token('spouse-1'), null)
    ).rejects.toMatchObject({ status: 400 });
    expect(collectionMock).not.toHaveBeenCalled();
  });
});
