/**
 * Tests for /api/account/members — owner-scoped sharing management.
 *
 * The owner is always derived from the verified token, never from the client, so
 * these tests focus on the email->uid resolution, dedup/self guards, and the
 * grant document read-modify-write.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  verifyIdTokenMock,
  getUserByEmailMock,
  docGetMock,
  docSetMock,
  docUpdateMock,
  arrayRemoveMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getUserByEmailMock: vi.fn(),
  docGetMock: vi.fn(),
  docSetMock: vi.fn(),
  docUpdateMock: vi.fn(),
  arrayRemoveMock: vi.fn((...uids: string[]) => ({ __arrayRemove: uids })),
}));

vi.mock('server-only', () => ({}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { arrayRemove: arrayRemoveMock },
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: verifyIdTokenMock, getUserByEmail: getUserByEmailMock },
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({ get: docGetMock, set: docSetMock, update: docUpdateMock })),
    })),
  },
}));

import { GET, POST, DELETE } from '@/app/api/account/members/route';

const OWNER = 'owner-1';

function request(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('/api/account/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: OWNER, email: 'owner@example.com', name: 'Owner' });
    docGetMock.mockResolvedValue({ exists: false, data: () => undefined });
    docSetMock.mockResolvedValue(undefined);
    docUpdateMock.mockResolvedValue(undefined);
  });

  it('GET returns the existing members', async () => {
    docGetMock.mockResolvedValue({
      exists: true,
      data: () => ({
        members: [{ uid: 'm1', email: 'wife@example.com', displayName: 'Wife', addedAt: new Date('2026-01-01') }],
      }),
    });
    const res = await GET(request('GET', 'http://localhost/api/account/members'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.members).toHaveLength(1);
    expect(json.members[0].email).toBe('wife@example.com');
  });

  it('POST grants access to a registered user by email', async () => {
    getUserByEmailMock.mockResolvedValue({ uid: 'wife-2', email: 'wife@example.com', displayName: 'Wife' });
    const res = await POST(request('POST', 'http://localhost/api/account/members', { email: 'Wife@Example.com' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.member.uid).toBe('wife-2');
    // Grant doc persisted with the new member uid.
    expect(docSetMock).toHaveBeenCalledTimes(1);
    const written = docSetMock.mock.calls[0][0];
    expect(written.ownerUid).toBe(OWNER);
    expect(written.memberUids).toContain('wife-2');
  });

  it('POST rejects adding yourself with 400', async () => {
    getUserByEmailMock.mockResolvedValue({ uid: OWNER, email: 'owner@example.com', displayName: 'Owner' });
    const res = await POST(request('POST', 'http://localhost/api/account/members', { email: 'owner@example.com' }));
    expect(res.status).toBe(400);
    expect(docSetMock).not.toHaveBeenCalled();
  });

  it('POST returns 404 when the email is not registered', async () => {
    getUserByEmailMock.mockRejectedValue(new Error('user-not-found'));
    const res = await POST(request('POST', 'http://localhost/api/account/members', { email: 'ghost@example.com' }));
    expect(res.status).toBe(404);
  });

  it('POST returns 409 when the user is already a member', async () => {
    getUserByEmailMock.mockResolvedValue({ uid: 'wife-2', email: 'wife@example.com', displayName: 'Wife' });
    docGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ ownerUid: OWNER, memberUids: ['wife-2'], members: [] }),
    });
    const res = await POST(request('POST', 'http://localhost/api/account/members', { email: 'wife@example.com' }));
    expect(res.status).toBe(409);
    expect(docSetMock).not.toHaveBeenCalled();
  });

  it('POST returns 400 when the email is missing', async () => {
    const res = await POST(request('POST', 'http://localhost/api/account/members', {}));
    expect(res.status).toBe(400);
  });

  it('DELETE revokes a member', async () => {
    docGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ ownerUid: OWNER, memberUids: ['wife-2'], members: [{ uid: 'wife-2', email: 'w', displayName: null, addedAt: new Date() }] }),
    });
    const res = await DELETE(request('DELETE', 'http://localhost/api/account/members?memberUid=wife-2'));
    expect(res.status).toBe(200);
    expect(docUpdateMock).toHaveBeenCalledTimes(1);
    expect(arrayRemoveMock).toHaveBeenCalledWith('wife-2');
  });

  it('DELETE returns 400 without memberUid', async () => {
    const res = await DELETE(request('DELETE', 'http://localhost/api/account/members'));
    expect(res.status).toBe(400);
  });
});
