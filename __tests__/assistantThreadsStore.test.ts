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

const { threads } = vi.hoisted(() => ({ threads: new Map<string, Record<string, unknown>>() }));

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
        }),
      }),
    },
  };
});

import { ASSISTANT_THREADS_PAGE_SIZE, listAssistantThreads } from '@/lib/server/assistant/store';

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
