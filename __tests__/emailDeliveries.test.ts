/**
 * The ledger of the periodic emails, run on its own transactions over an in-memory Firestore: a period
 * is claimed once, released only while «sending», never again once «sent»; «Invia ora» records a send
 * with no claim before it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeAdminDb, type FakeAdminDb } from './fixtures/fakeAdminDb';

vi.mock('server-only', () => ({}));

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return holder.db;
  },
}));

import {
  EMAIL_DELIVERIES_COLLECTION,
  claimEmailDelivery,
  confirmEmailDelivery,
  releaseEmailDelivery,
} from '@/lib/server/emailDeliveries';

const NOW = new Date('2026-11-01T19:05:00Z');
let db: FakeAdminDb;

beforeEach(() => {
  db = createFakeAdminDb();
  holder.db = db;
});

const stored = () => db.docs.get(`${EMAIL_DELIVERIES_COLLECTION}/user-a_monthly_2026-10`);

describe('the email ledger', () => {
  it('lets the first claim of a period through and refuses the second', async () => {
    expect(await claimEmailDelivery('user-a', 'monthly', '2026-10', NOW)).toBe(true);
    expect(await claimEmailDelivery('user-a', 'monthly', '2026-10', NOW)).toBe(false);
    expect(stored()?.status).toBe('sending');
  });

  it('makes a released period claimable again', async () => {
    await claimEmailDelivery('user-a', 'monthly', '2026-10', NOW);
    await releaseEmailDelivery('user-a', 'monthly', '2026-10');
    expect(stored()).toBeUndefined();
    expect(await claimEmailDelivery('user-a', 'monthly', '2026-10', NOW)).toBe(true);
  });

  it('never lets a confirmed period be claimed again', async () => {
    await claimEmailDelivery('user-a', 'monthly', '2026-10', NOW);
    await confirmEmailDelivery('user-a', 'monthly', '2026-10', NOW);
    expect(await claimEmailDelivery('user-a', 'monthly', '2026-10', new Date(NOW.getTime() + 3 * 60 * 60 * 1000))).toBe(false);
    expect(stored()?.status).toBe('sent');
  });

  it('deletes nothing when a release follows a confirm', async () => {
    await claimEmailDelivery('user-a', 'monthly', '2026-10', NOW);
    await confirmEmailDelivery('user-a', 'monthly', '2026-10', NOW);
    await releaseEmailDelivery('user-a', 'monthly', '2026-10');
    expect(stored()?.status).toBe('sent');
  });

  it('records a manual send with no claim before it as «sent» with manual: true', async () => {
    await confirmEmailDelivery('user-a', 'monthly', '2026-10', NOW, true);
    expect(stored()).toMatchObject({ userId: 'user-a', kind: 'monthly', periodKey: '2026-10', status: 'sent', manual: true });
    expect(stored()?.claimedAt).toBeDefined();
    expect(Object.values(stored()!).includes(undefined)).toBe(false);
  });

  it('keeps the account, the kind and the period apart', async () => {
    expect(await claimEmailDelivery('user-a', 'monthly', '2026-10', NOW)).toBe(true);
    expect(await claimEmailDelivery('user-a', 'yearly', '2026', NOW)).toBe(true);
    expect(await claimEmailDelivery('user-b', 'monthly', '2026-10', NOW)).toBe(true);
  });
});
