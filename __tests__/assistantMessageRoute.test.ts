/**
 * PATCH /api/ai/assistant/threads/[threadId]/messages/[messageId] — the outcome of one card of an
 * assistant message: who may write it, which bodies are refused, what the store is asked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { verifyIdTokenMock, setAssistantMessageProposalMock, accountAccessDocGetMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  setAssistantMessageProposalMock: vi.fn(),
  accountAccessDocGetMock: vi.fn(),
}));

class StoreError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

vi.mock('server-only', () => ({}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: verifyIdTokenMock },
  adminDb: {
    collection: vi.fn((name: string) => {
      // Delegated-access lookup performed by assertCanAccessAccount.
      if (name === 'account-access') {
        return { doc: vi.fn(() => ({ get: accountAccessDocGetMock })) };
      }
      throw new Error(`Unexpected collection: ${name}`);
    }),
  },
}));

vi.mock('@/lib/server/assistant/store', () => ({
  setAssistantMessageProposal: setAssistantMessageProposalMock,
  isAssistantStoreError: (error: unknown) => error instanceof StoreError,
}));

import { PATCH } from '@/app/api/ai/assistant/threads/[threadId]/messages/[messageId]/route';

const USER_ID = 'user-1';
const params = { params: Promise.resolve({ threadId: 'thread-1', messageId: 'msg-1' }) };

function patch(body: unknown, headers: Record<string, string> = { Authorization: 'Bearer token' }): NextRequest {
  return new NextRequest('http://localhost/api/ai/assistant/threads/thread-1/messages/msg-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/ai/assistant/threads/[threadId]/messages/[messageId]', () => {
  const at = new Date('2026-11-01T10:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: USER_ID });
    accountAccessDocGetMock.mockResolvedValue({ exists: false, data: () => undefined });
    setAssistantMessageProposalMock.mockImplementation(async (_u: string, _t: string, _m: string, _k: string, state: object) => ({ ...state, at }));
  });

  it('answers 401 without a token', async () => {
    const response = await PATCH(patch({ userId: USER_ID, key: 'expense:0', status: 'ignored' }, {}), params);
    expect(response.status).toBe(401);
    expect(setAssistantMessageProposalMock).not.toHaveBeenCalled();
  });

  it('stores a written row and answers the stored state', async () => {
    const response = await PATCH(patch({ userId: USER_ID, key: 'expense:0', status: 'written', writtenIds: ['exp-1'] }), params);
    expect(response.status).toBe(200);
    expect(setAssistantMessageProposalMock).toHaveBeenCalledWith(USER_ID, 'thread-1', 'msg-1', 'expense:0', { status: 'written', writtenIds: ['exp-1'] });
    expect(await response.json()).toEqual({ proposal: { status: 'written', writtenIds: ['exp-1'], at: at.toISOString() } });
  });

  it('stores an ignored goal card', async () => {
    const response = await PATCH(patch({ userId: USER_ID, key: 'goal:0', status: 'ignored' }), params);
    expect(response.status).toBe(200);
    expect(setAssistantMessageProposalMock).toHaveBeenCalledWith(USER_ID, 'thread-1', 'msg-1', 'goal:0', { status: 'ignored' });
  });

  it('refuses a key that is not «kind:index» with 400', async () => {
    for (const key of ['expense:x', 'expense', 'row:0', 'expense:0.proposals', '']) {
      const response = await PATCH(patch({ userId: USER_ID, key, status: 'ignored' }), params);
      expect(response.status, key).toBe(400);
    }
    expect(setAssistantMessageProposalMock).not.toHaveBeenCalled();
  });

  it('refuses an answer on a state that is not «answered», and an unknown status', async () => {
    expect((await PATCH(patch({ userId: USER_ID, key: 'question:0', status: 'ignored', answer: 'Sì' }), params)).status).toBe(400);
    expect((await PATCH(patch({ userId: USER_ID, key: 'expense:0', status: 'done' }), params)).status).toBe(400);
    expect((await PATCH(patch({ userId: USER_ID, key: 'question:0', status: 'answered', answer: 'Sì' }), params)).status).toBe(200);
  });

  it('answers 403 for another account with no delegated access, writing nothing', async () => {
    const response = await PATCH(patch({ userId: 'someone-else', key: 'expense:0', status: 'ignored' }), params);
    expect(response.status).toBe(403);
    expect(setAssistantMessageProposalMock).not.toHaveBeenCalled();
  });

  it('passes the store’s 403 and 404 through', async () => {
    setAssistantMessageProposalMock.mockRejectedValueOnce(new StoreError(403, 'Thread non accessibile'));
    expect((await PATCH(patch({ userId: USER_ID, key: 'expense:0', status: 'ignored' }), params)).status).toBe(403);

    setAssistantMessageProposalMock.mockRejectedValueOnce(new StoreError(404, 'Messaggio non trovato'));
    const response = await PATCH(patch({ userId: USER_ID, key: 'expense:0', status: 'ignored' }), params);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Messaggio non trovato' });
  });

  it('answers 500 with its own sentence on any other failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    setAssistantMessageProposalMock.mockRejectedValueOnce(new Error('boom'));
    const response = await PATCH(patch({ userId: USER_ID, key: 'expense:0', status: 'ignored' }), params);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Impossibile salvare l'esito della proposta" });
    consoleError.mockRestore();
  });
});
