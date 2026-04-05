import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  verifyIdTokenMock,
  listAssistantThreadsMock,
  createAssistantThreadMock,
  getAssistantThreadDetailMock,
  getAssistantThreadMock,
  getAssistantMemoryDocumentMock,
  updateAssistantMemoryDocumentMock,
  deleteAssistantMemoryDocumentMock,
  appendAssistantMessageMock,
  updateAssistantThreadMetadataMock,
  streamAssistantResponseMock,
} = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  listAssistantThreadsMock: vi.fn(),
  createAssistantThreadMock: vi.fn(),
  getAssistantThreadDetailMock: vi.fn(),
  getAssistantThreadMock: vi.fn(),
  getAssistantMemoryDocumentMock: vi.fn(),
  updateAssistantMemoryDocumentMock: vi.fn(),
  deleteAssistantMemoryDocumentMock: vi.fn(),
  appendAssistantMessageMock: vi.fn(),
  updateAssistantThreadMetadataMock: vi.fn(),
  streamAssistantResponseMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: verifyIdTokenMock,
  },
}));

vi.mock('@/lib/server/assistant/store', () => ({
  listAssistantThreads: listAssistantThreadsMock,
  createAssistantThread: createAssistantThreadMock,
  getAssistantThreadDetail: getAssistantThreadDetailMock,
  getAssistantThread: getAssistantThreadMock,
  getAssistantMemoryDocument: getAssistantMemoryDocumentMock,
  updateAssistantMemoryDocument: updateAssistantMemoryDocumentMock,
  deleteAssistantMemoryDocument: deleteAssistantMemoryDocumentMock,
  appendAssistantMessage: appendAssistantMessageMock,
  updateAssistantThreadMetadata: updateAssistantThreadMetadataMock,
  buildThreadTitleFromPrompt: vi.fn(() => 'Titolo server'),
  isAssistantStoreError: vi.fn(() => false),
}));

vi.mock('@/lib/server/assistant/anthropicStream', () => ({
  streamAssistantResponse: streamAssistantResponseMock,
}));

import { GET as getThreadsRoute, POST as postThreadsRoute } from '@/app/api/ai/assistant/threads/route';
import { GET as getThreadRoute } from '@/app/api/ai/assistant/threads/[threadId]/route';
import {
  GET as getMemoryRoute,
  PATCH as patchMemoryRoute,
  DELETE as deleteMemoryRoute,
} from '@/app/api/ai/assistant/memory/route';
import { POST as streamRoute } from '@/app/api/ai/assistant/stream/route';

function createJsonRequest(
  url: string,
  {
    method = 'GET',
    body,
    headers,
  }: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('Assistant private API routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';

    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    listAssistantThreadsMock.mockResolvedValue([]);
    createAssistantThreadMock.mockResolvedValue({
      id: 'thread-1',
      userId: 'user-1',
      title: 'Titolo server',
      createdAt: new Date(2026, 3, 5),
      updatedAt: new Date(2026, 3, 5),
      lastMessagePreview: '',
      mode: 'chat',
      pinnedMonth: null,
    });
    getAssistantThreadDetailMock.mockResolvedValue({
      thread: {
        id: 'thread-1',
        userId: 'user-1',
        title: 'Titolo server',
        createdAt: new Date(2026, 3, 5),
        updatedAt: new Date(2026, 3, 5),
        lastMessagePreview: 'ciao',
        mode: 'chat',
        pinnedMonth: null,
      },
      messages: [],
    });
    getAssistantThreadMock.mockResolvedValue({
      id: 'thread-1',
      userId: 'user-1',
      title: 'Titolo server',
      createdAt: new Date(2026, 3, 5),
      updatedAt: new Date(2026, 3, 5),
      lastMessagePreview: '',
      mode: 'chat',
      pinnedMonth: null,
    });
    getAssistantMemoryDocumentMock.mockResolvedValue({
      preferences: {
        responseStyle: 'balanced',
        includeMacroContext: false,
        memoryEnabled: true,
      },
      items: [],
      updatedAt: null,
    });
    updateAssistantMemoryDocumentMock.mockResolvedValue({
      preferences: {
        responseStyle: 'deep',
        includeMacroContext: true,
        memoryEnabled: true,
      },
      items: [],
      updatedAt: new Date(2026, 3, 5),
    });
    deleteAssistantMemoryDocumentMock.mockResolvedValue({
      preferences: {
        responseStyle: 'balanced',
        includeMacroContext: false,
        memoryEnabled: true,
      },
      items: [],
      updatedAt: new Date(2026, 3, 5),
    });
    appendAssistantMessageMock
      .mockResolvedValueOnce({
        id: 'user-msg-1',
        threadId: 'thread-1',
        userId: 'user-1',
        role: 'user',
        content: 'Analizza il mio mese',
        createdAt: new Date(2026, 3, 5),
        mode: 'month_analysis',
        monthContext: { year: 2026, month: 3 },
        webSearchUsed: false,
      })
      .mockResolvedValueOnce({
        id: 'assistant-msg-1',
        threadId: 'thread-1',
        userId: 'user-1',
        role: 'assistant',
        content: 'Risposta',
        createdAt: new Date(2026, 3, 5),
        mode: 'month_analysis',
        monthContext: { year: 2026, month: 3 },
        webSearchUsed: true,
      });
    updateAssistantThreadMetadataMock.mockResolvedValue(undefined);
    streamAssistantResponseMock.mockImplementation(async ({ onStatus, onText }: any) => {
      onStatus('writing');
      onText('Risposta');
      onStatus('saving');
      return { text: 'Risposta', webSearchUsed: true };
    });
  });

  it('returns 401 for threads route without Authorization header', async () => {
    const response = await getThreadsRoute(
      createJsonRequest('http://localhost/api/ai/assistant/threads?userId=user-1')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Authorization bearer token',
    });
    expect(listAssistantThreadsMock).not.toHaveBeenCalled();
  });

  it('returns 403 for threads route when token and userId do not match', async () => {
    const response = await getThreadsRoute(
      createJsonRequest('http://localhost/api/ai/assistant/threads?userId=user-2', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Authenticated user does not match requested user',
    });
    expect(listAssistantThreadsMock).not.toHaveBeenCalled();
  });

  it('creates a thread for the authenticated user', async () => {
    const response = await postThreadsRoute(
      createJsonRequest('http://localhost/api/ai/assistant/threads', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: {
          userId: 'user-1',
          mode: 'chat',
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      thread: {
        id: 'thread-1',
        userId: 'user-1',
      },
    });
    expect(createAssistantThreadMock).toHaveBeenCalledWith({
      userId: 'user-1',
      mode: 'chat',
      pinnedMonth: null,
    });
  });

  it('returns a thread detail for the authenticated user', async () => {
    const response = await getThreadRoute(
      createJsonRequest('http://localhost/api/ai/assistant/threads/thread-1?userId=user-1', {
        headers: {
          Authorization: 'Bearer valid-token',
        },
      }),
      { params: Promise.resolve({ threadId: 'thread-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      thread: {
        id: 'thread-1',
      },
    });
    expect(getAssistantThreadDetailMock).toHaveBeenCalledWith('thread-1', 'user-1');
  });

  it('returns 401 for memory route without Authorization header', async () => {
    const response = await getMemoryRoute(
      createJsonRequest('http://localhost/api/ai/assistant/memory?userId=user-1')
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing Authorization bearer token',
    });
  });

  it('patches memory only for the authenticated user', async () => {
    const response = await patchMemoryRoute(
      createJsonRequest('http://localhost/api/ai/assistant/memory', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: {
          userId: 'user-1',
          preferences: {
            responseStyle: 'deep',
            includeMacroContext: true,
          },
        },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      preferences: {
        responseStyle: 'deep',
      },
    });
    expect(updateAssistantMemoryDocumentMock).toHaveBeenCalledWith('user-1', {
      preferences: {
        responseStyle: 'deep',
        includeMacroContext: true,
      },
      item: undefined,
    });
  });

  it('deletes memory data only for the authenticated user', async () => {
    const response = await deleteMemoryRoute(
      createJsonRequest('http://localhost/api/ai/assistant/memory', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: {
          userId: 'user-1',
          itemId: 'memory-1',
        },
      })
    );

    expect(response.status).toBe(200);
    expect(deleteAssistantMemoryDocumentMock).toHaveBeenCalledWith('user-1', {
      itemId: 'memory-1',
      resetAll: undefined,
    });
  });

  it('streams assistant data for the authenticated user', async () => {
    const response = await streamRoute(
      createJsonRequest('http://localhost/api/ai/assistant/stream', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: {
          userId: 'user-1',
          mode: 'month_analysis',
          prompt: 'Analizza il mio mese',
          month: { year: 2026, month: 3 },
          preferences: {
            responseStyle: 'balanced',
            includeMacroContext: true,
            memoryEnabled: true,
          },
        },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');

    const streamText = await response.text();
    expect(streamText).toContain('"type":"meta"');
    expect(streamText).toContain('"type":"text"');
    expect(streamText).toContain('"type":"done"');
    expect(streamAssistantResponseMock).toHaveBeenCalled();
  });

  it('returns 403 on stream route when token and userId do not match', async () => {
    const response = await streamRoute(
      createJsonRequest('http://localhost/api/ai/assistant/stream', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer valid-token',
        },
        body: {
          userId: 'user-2',
          mode: 'chat',
          prompt: 'Ciao',
        },
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Authenticated user does not match requested user',
    });
  });
});
