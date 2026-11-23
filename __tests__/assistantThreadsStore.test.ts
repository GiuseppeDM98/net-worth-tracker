/**
 * Tests for `listAssistantThreads` (lib/server/assistant/store.ts) — the Conversazioni list read
 * one page at a time (since 2026-10-05), against an in-memory Admin Firestore that honours
 * `where`, `orderBy`, `startAfter`/`startAt` (a document snapshot) and `limit`.
 *
 * Seen RED on purpose: the cursor written as `startAt` printed the page's last thread twice — the
 * second page held 11 threads, not 10.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

type Row = { id: string; data: Record<string, unknown> };

const { threads, messages, messageUpdateMock, messageSetMock } = vi.hoisted(() => ({
  threads: new Map<string, Record<string, unknown>>(),
  // The `messages` subcollection, keyed `threadId/messageId`.
  messages: new Map<string, Record<string, unknown>>(),
  messageUpdateMock: vi.fn(),
  messageSetMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => {
  const millis = (value: unknown) => (value instanceof Date ? value.getTime() : Number(value));

  function query(filters: Array<(row: Row) => boolean>, orderField?: string, cursor?: { id: string; inclusive: boolean }, max?: number) {
    return {
      where: (field: string, _op: '==', value: unknown) =>
        query([...filters, (row) => row.data[field] === value], orderField, cursor, max),
      orderBy: (field: string) => query(filters, field, cursor, max),
      startAfter: (snapshot: { id: string }) => query(filters, orderField, { id: snapshot.id, inclusive: false }, max),
      startAt: (snapshot: { id: string }) => query(filters, orderField, { id: snapshot.id, inclusive: true }, max),
      limit: (count: number) => query(filters, orderField, cursor, count),
      async get() {
        // `updatedAt desc`, ties by document id desc — Firestore's implicit order for a descending query.
        let rows = [...threads.entries()]
          .map(([id, data]) => ({ id, data }))
          .filter((row) => filters.every((test) => test(row)))
          .sort((a, b) => millis(b.data[orderField!]) - millis(a.data[orderField!]) || (a.id < b.id ? 1 : -1));
        if (cursor) {
          const at = rows.findIndex((row) => row.id === cursor.id);
          rows = rows.slice(cursor.inclusive ? at : at + 1);
        }
        if (max !== undefined) rows = rows.slice(0, max);
        return { docs: rows.map((row) => ({ id: row.id, data: () => row.data })) };
      },
    };
  }

  return {
    adminDb: {
      collection: () => ({
        ...query([]),
        doc: (id: string) => ({
          get: async () => ({ id, exists: threads.has(id), data: () => threads.get(id) }),
          // The thread's own write beside a new message (the messageCount increment).
          set: async () => undefined,
          collection: () => ({
            doc: (messageId = 'new-msg') => ({
              id: messageId,
              get: async () => ({ id: messageId, exists: messages.has(`${id}/${messageId}`), data: () => messages.get(`${id}/${messageId}`) }),
              update: messageUpdateMock,
              set: messageSetMock,
            }),
            // Honours the direction and the limit: the thread's detail reads its LAST page (2026-11).
            orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') => ({
              limit: (count: number) => ({
                get: async () => ({
                  docs: [...messages.entries()]
                    .filter(([path]) => path.startsWith(`${id}/`))
                    .sort(([, a], [, b]) => (millis(a[field]) - millis(b[field])) * (direction === 'asc' ? 1 : -1))
                    .slice(0, count)
                    .map(([path, data]) => ({ id: path.slice(id.length + 1), data: () => data })),
                }),
              }),
            }),
          }),
        }),
      }),
    },
  };
});

import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import {
  ASSISTANT_THREADS_PAGE_SIZE,
  appendAssistantMessage,
  getAssistantThreadDetail,
  listAssistantThreads,
  setAssistantMessageProposal,
} from '@/lib/server/assistant/store';
import type { AssistantRouteReading } from '@/types/assistant';

const OWNER = 'owner-1';

function seedThreads(count: number, userId = OWNER, prefix = 't') {
  for (let index = 0; index < count; index += 1) {
    // Thread t000 is the most recent: one minute apart, newest first.
    const updatedAt = new Date(Date.UTC(2026, 9, 5, 12, 0) - index * 60_000);
    threads.set(`${prefix}${String(index).padStart(3, '0')}`, {
      userId,
      title: `Conversazione ${index}`,
      mode: 'chat',
      createdAt: updatedAt,
      updatedAt,
      lastMessagePreview: '',
      messageCount: 1,
    });
  }
}

describe('listAssistantThreads — one page at a time', () => {
  beforeEach(() => {
    threads.clear();
  });

  it('reads 50 of 60 threads and a cursor, then the 10 that follow it — none twice, none lost', async () => {
    seedThreads(60);
    seedThreads(5, 'someone-else', 'x');

    const first = await listAssistantThreads(OWNER);
    expect(ASSISTANT_THREADS_PAGE_SIZE).toBe(50);
    expect(first.threads).toHaveLength(50);
    expect(first.threads[0].id, 'most recent first').toBe('t000');
    expect(first.nextCursor).toBe('t049');

    const second = await listAssistantThreads(OWNER, { after: first.nextCursor! });
    expect(second.threads.map((thread) => thread.id)).toEqual(Array.from({ length: 10 }, (_, i) => `t${String(50 + i).padStart(3, '0')}`));
    expect(second.nextCursor, 'the last page says so').toBeNull();
  });

  it('offers no next page on exactly one page of threads', async () => {
    seedThreads(50);
    const page = await listAssistantThreads(OWNER);
    expect(page.threads).toHaveLength(50);
    expect(page.nextCursor).toBeNull();
  });

  it('refuses a cursor that is another account’s thread (403) or no thread at all (404)', async () => {
    seedThreads(3);
    seedThreads(3, 'someone-else', 'x');
    await expect(listAssistantThreads(OWNER, { after: 'x000' })).rejects.toMatchObject({ status: 403 });
    await expect(listAssistantThreads(OWNER, { after: 'gone' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('setAssistantMessageProposal — the outcome of a card on its message (2026-11)', () => {
  beforeEach(() => {
    threads.clear();
    messages.clear();
    messageUpdateMock.mockReset().mockResolvedValue(undefined);
    messageSetMock.mockReset();
    seedThreads(1);
    seedThreads(1, 'someone-else', 'x');
    messages.set('t000/msg-1', { userId: OWNER, role: 'assistant', content: 'Ecco.', createdAt: new Date(Date.UTC(2026, 10, 1, 10)), mode: 'register' });
  });

  it('updates ONE key by its field path — never a merge that could create the document', async () => {
    const stored = await setAssistantMessageProposal(OWNER, 't000', 'msg-1', 'expense:0', { status: 'written', writtenIds: ['exp-1'] });

    expect(messageSetMock).not.toHaveBeenCalled();
    expect(messageUpdateMock).toHaveBeenCalledTimes(1);
    const [path, value] = messageUpdateMock.mock.calls[0];
    expect(path).toBeInstanceOf(FieldPath);
    expect((path as FieldPath).isEqual(new FieldPath('proposals', 'expense:0'))).toBe(true);
    expect(value).toMatchObject({ status: 'written', writtenIds: ['exp-1'] });
    expect(value.at).toBeInstanceOf(Timestamp);
    // The server stamps the time and answers it as a Date.
    expect(stored).toMatchObject({ status: 'written', writtenIds: ['exp-1'] });
    expect(stored.at).toBeInstanceOf(Date);
  });

  it('answers 404 for a message that does not exist, 403 for another account’s thread, 404 for no thread — writing nothing', async () => {
    await expect(setAssistantMessageProposal(OWNER, 't000', 'local-assistant-1', 'expense:0', { status: 'ignored' })).rejects.toMatchObject({ status: 404 });
    await expect(setAssistantMessageProposal(OWNER, 'x000', 'msg-1', 'expense:0', { status: 'ignored' })).rejects.toMatchObject({ status: 403 });
    await expect(setAssistantMessageProposal(OWNER, 'gone', 'msg-1', 'expense:0', { status: 'ignored' })).rejects.toMatchObject({ status: 404 });
    expect(messageUpdateMock).not.toHaveBeenCalled();
  });

  it('reads the outcomes back with the thread, each `at` a Date', async () => {
    const at = Timestamp.fromDate(new Date(Date.UTC(2026, 10, 1, 10, 5)));
    messages.set('t000/msg-1', {
      ...messages.get('t000/msg-1'),
      proposals: { 'expense:0': { status: 'written', writtenIds: ['exp-1'], month: '2026-09', at }, 'expense:1': { status: 'ignored', at } },
    });
    messages.set('t000/msg-0', { userId: OWNER, role: 'user', content: 'ho speso 5 euro', createdAt: new Date(Date.UTC(2026, 10, 1, 9)), mode: 'register' });

    const detail = await getAssistantThreadDetail('t000', OWNER);
    const assistant = detail.messages.find((message) => message.id === 'msg-1');
    expect(assistant?.proposals).toEqual({
      // `month` (the row «Modifica» saved in another month, 2026-11-11) comes back with the outcome.
      'expense:0': { status: 'written', writtenIds: ['exp-1'], month: '2026-09', at: at.toDate() },
      'expense:1': { status: 'ignored', at: at.toDate() },
    });
    // A message with no card carries no `proposals` key at all.
    expect(detail.messages.find((message) => message.id === 'msg-0')).not.toHaveProperty('proposals');
  });
});

// The reading of a message sent with mode 'auto' (2026-11), stored on the ASSISTANT message only.
// Seen RED on purpose: `routeReading: message.routeReading` written unconditionally (R11b); the raw
// field returned by `mapMessage` (R12); the detail read `'asc'` (R12b: messages 1-100 came back).
describe('the route reading on a message, and the thread\'s last 100 messages (2026-11)', () => {
  const READING: AssistantRouteReading = {
    route: { intent: 'month_analysis', period: { kind: 'month', year: 2026, month: 10 }, webSearch: false, confidence: 0.9 },
    source: 'router',
  };

  beforeEach(() => {
    threads.clear();
    messages.clear();
    messageSetMock.mockReset().mockResolvedValue(undefined);
    seedThreads(1);
  });

  it('R11b: writes the reading with no undefined `reason`, and no key at all without one', async () => {
    const base = { userId: OWNER, role: 'assistant' as const, content: 'Ecco.', mode: 'month_analysis' as const };
    await appendAssistantMessage('t000', { ...base, routeReading: { ...READING, reason: undefined } });
    const written = messageSetMock.mock.calls[0][0];
    expect(written.routeReading).toEqual(READING);
    expect(written.routeReading).not.toHaveProperty('reason');

    await appendAssistantMessage('t000', base);
    expect(messageSetMock.mock.calls[1][0]).not.toHaveProperty('routeReading');
  });

  it('R12: reads a valid reading back, and drops a malformed one while keeping the message', async () => {
    messages.set('t000/msg-1', { userId: OWNER, role: 'assistant', content: 'Ecco.', createdAt: new Date(Date.UTC(2026, 10, 1, 10)), mode: 'month_analysis', routeReading: READING });
    messages.set('t000/msg-2', { userId: OWNER, role: 'assistant', content: 'Altro.', createdAt: new Date(Date.UTC(2026, 10, 1, 11)), mode: 'chat', routeReading: { route: 'x' } });
    messages.set('t000/msg-3', { userId: OWNER, role: 'user', content: 'Ciao', createdAt: new Date(Date.UTC(2026, 10, 1, 12)), mode: 'chat' });

    const detail = await getAssistantThreadDetail('t000', OWNER);
    expect(detail.messages.find((m) => m.id === 'msg-1')?.routeReading).toEqual(READING);
    const malformed = detail.messages.find((m) => m.id === 'msg-2');
    expect(malformed?.content).toBe('Altro.');
    expect(malformed).not.toHaveProperty('routeReading');
    expect(detail.messages.find((m) => m.id === 'msg-3')).not.toHaveProperty('routeReading');
  });

  it('R12b: a thread of 101 messages reads its last 100, in ascending order', async () => {
    for (let index = 1; index <= 101; index += 1) {
      messages.set(`t000/m${String(index).padStart(3, '0')}`, {
        userId: OWNER, role: index % 2 ? 'user' : 'assistant', content: `messaggio ${index}`,
        createdAt: new Date(Date.UTC(2026, 10, 1, 0, index)), mode: 'chat',
      });
    }
    const detail = await getAssistantThreadDetail('t000', OWNER);
    expect(detail.messages.map((m) => m.content)).toEqual(Array.from({ length: 100 }, (_, i) => `messaggio ${i + 2}`));
  });
});
