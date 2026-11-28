/**
 * The ledger of the periodic emails' sends: one document per (account, kind, period).
 *
 * The cron runs daily and the first three days of a month are its window, so without a record a second
 * run on the same day sent again and a failed run never sent (2026-11-28). A run CLAIMS the period
 * («sending»), sends, then CONFIRMS it («sent») — or RELEASES it when the send failed or there was
 * nothing to send, so the next run tries again. A «sent» document is never released: the email is out.
 *
 * Server-only (`firestore.rules` denies every client read and write): the documents are read by id, so
 * the collection needs no index. «Invia ora» does not consult the ledger, it only records its send.
 */
import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { canClaimDelivery, emailDeliveryId, type EmailDeliveryStatus } from '@/lib/utils/emailSchedule';

export const EMAIL_DELIVERIES_COLLECTION = 'emailDeliveries';

interface StoredDelivery {
  status: EmailDeliveryStatus;
  claimedAt?: Timestamp;
}

function deliveryRef(userId: string, kind: string, periodKey: string) {
  return adminDb.collection(EMAIL_DELIVERIES_COLLECTION).doc(emailDeliveryId(userId, kind, periodKey));
}

/** Takes the period for this run in a transaction (read, then `canClaimDelivery`, then write «sending»). */
export async function claimEmailDelivery(userId: string, kind: string, periodKey: string, now: Date): Promise<boolean> {
  const ref = deliveryRef(userId, kind, periodKey);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? (snap.data() as StoredDelivery) : null;
    const existing = stored ? { status: stored.status, claimedAtMs: stored.claimedAt?.toMillis() ?? 0 } : null;
    if (!canClaimDelivery(existing, now.getTime())) return false;
    tx.set(ref, { userId, kind, periodKey, status: 'sending', claimedAt: Timestamp.fromDate(now) });
    return true;
  });
}

/**
 * The send went out. Valid with no claim before it — how «Invia ora» records its send: then the
 * document is born here, `claimedAt` included, so a later claim reads a complete record.
 */
export async function confirmEmailDelivery(
  userId: string,
  kind: string,
  periodKey: string,
  now: Date,
  manual?: boolean,
): Promise<void> {
  const ref = deliveryRef(userId, kind, periodKey);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const at = Timestamp.fromDate(now);
    tx.set(
      ref,
      {
        userId,
        kind,
        periodKey,
        status: 'sent',
        sentAt: at,
        ...(manual ? { manual: true } : {}),
        ...(snap.exists ? {} : { claimedAt: at }),
      },
      { merge: true },
    );
  });
}

/** The send failed or there was nothing to send: the period is free for the next run. A «sent» stays. */
export async function releaseEmailDelivery(userId: string, kind: string, periodKey: string): Promise<void> {
  const ref = deliveryRef(userId, kind, periodKey);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && (snap.data() as StoredDelivery).status === 'sending') tx.delete(ref);
  });
}
