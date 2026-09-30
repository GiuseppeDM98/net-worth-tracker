/**
 * The round trip through the persister keeps the dates (PERF-03): a `Date` comes back a `Date` at
 * the same instant, a Firestore `Timestamp` — or its prototype-less `{ seconds, nanoseconds }`
 * shape — comes back the `Date` its type declared, and nothing else is touched.
 */
import { describe, expect, it } from 'vitest';
import { deserializeFromPersist, serializeForPersist } from '@/lib/utils/queryPersistence';

/** What the Firestore SDK's Timestamp looks like to a duck: the two fields and a converter. */
function fakeTimestamp(seconds: number, nanoseconds: number) {
  return {
    seconds,
    nanoseconds,
    toDate: () => new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000)),
  };
}

/** Through the persister and back; `TOut` names what the restored value is expected to be. */
const roundTrip = <TOut>(value: unknown): TOut => deserializeFromPersist<TOut>(serializeForPersist(value));

describe('serializeForPersist / deserializeFromPersist', () => {
  it('should return a Date as a Date, at the same instant', () => {
    const expense = { id: 'e1', amount: 12.5, date: new Date('2026-09-15T00:00:00.000Z') };

    const restored = roundTrip<typeof expense>(expense);

    expect(restored.date).toBeInstanceOf(Date);
    expect(restored.date.getTime()).toBe(expense.date.getTime());
    expect(restored).toEqual(expense);
  });

  it('should revive a Firestore Timestamp instance as a Date', () => {
    const stamped = { createdAt: fakeTimestamp(1_758_000_000, 500_000_000) };

    const restored = roundTrip<{ createdAt: Date }>(stamped);

    expect(restored.createdAt).toBeInstanceOf(Date);
    expect(restored.createdAt.getTime()).toBe(1_758_000_000_500);
  });

  it('should revive a prototype-less { seconds, nanoseconds } as a Date, the SDK marker included', () => {
    const restored = roundTrip<{ bare: Date; marked: Date }>({
      bare: { seconds: 1_700_000_000, nanoseconds: 0 },
      marked: { seconds: 1_700_000_000, nanoseconds: 250_000_000, type: 'timestamp' },
    });

    expect(restored.bare).toBeInstanceOf(Date);
    expect(restored.bare.getTime()).toBe(1_700_000_000_000);
    expect(restored.marked).toBeInstanceOf(Date);
    expect(restored.marked.getTime()).toBe(1_700_000_000_250);
  });

  it('should leave an object that merely HAS seconds and nanoseconds among other fields alone', () => {
    const duration = { seconds: 90, nanoseconds: 0, label: 'novanta secondi' };

    expect(roundTrip(duration)).toEqual(duration);
  });

  it('should carry dates nested in arrays and maps — the shape of a persisted client', () => {
    const client = {
      timestamp: 1_758_000_000_000,
      buster: '1',
      clientState: {
        mutations: [],
        queries: [
          {
            queryKey: ['expenses', 'owner-uid'],
            queryHash: '["expenses","owner-uid"]',
            state: {
              data: [
                { id: 'a', date: new Date('2026-01-31T23:00:00.000Z'), tags: ['x'] },
                { id: 'b', date: fakeTimestamp(1_760_000_000, 0), nested: { updatedAt: new Date('2026-09-29T10:00:00.000Z') } },
              ],
              dataUpdatedAt: 1_758_000_000_000,
              status: 'success',
            },
          },
        ],
      },
    };

    const restored = roundTrip<typeof client>(client);
    const [first, second] = restored.clientState.queries[0].state.data as unknown as Array<{ date: Date; nested?: { updatedAt: Date } }>;

    expect(first.date).toBeInstanceOf(Date);
    expect(first.date.toISOString()).toBe('2026-01-31T23:00:00.000Z');
    expect(second.date).toBeInstanceOf(Date);
    expect(second.date.getTime()).toBe(1_760_000_000_000);
    expect(second.nested?.updatedAt.toISOString()).toBe('2026-09-29T10:00:00.000Z');
    expect(restored.clientState.queries[0].state.dataUpdatedAt).toBe(1_758_000_000_000);
  });

  it('should drop an invalid Date rather than store "Invalid Date"', () => {
    expect(roundTrip({ when: new Date('not a date') })).toEqual({ when: null });
  });

  it('should keep strings that look like dates as strings', () => {
    const iso = { updatedAt: '2026-09-29T10:00:00.000Z' };

    expect(roundTrip<typeof iso>(iso)).toEqual(iso);
    expect(typeof roundTrip<typeof iso>(iso).updatedAt).toBe('string');
  });
});
