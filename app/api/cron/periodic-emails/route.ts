import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { buildAndSendForPeriod, getSettingsAdmin } from '@/lib/server/monthlyEmailService';
import { claimEmailDelivery, confirmEmailDelivery, releaseEmailDelivery } from '@/lib/server/emailDeliveries';
import { verifyCronSecret } from '@/lib/server/apiAuth';
import { emailsDueOn, type DueEmail } from '@/lib/utils/emailSchedule';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';

/**
 * GET /api/cron/periodic-emails
 *
 * The monthly and yearly summary emails, daily at 19:00 UTC (vercel.json): an hour after the snapshot
 * cron, the same Italian day (20:00 or 21:00 in Rome). An email is about a CLOSED period and leaves the
 * day after it ends — the 1st of the month for the month just closed, 1 January also for the year —
 * with the 2nd and the 3rd as catch-up days (`emailsDueOn`). The ledger (`lib/server/emailDeliveries.ts`)
 * makes each (account, kind, period) leave once: a run claims, sends, confirms; a failed send or one
 * with nothing to send releases the claim for the next run.
 *
 * Accounts are walked one after the other inside `maxDuration`; one account's failure never stops the
 * others. Requires CRON_SECRET via the Authorization header.
 */
export const maxDuration = 300;

type Outcome = 'sent' | 'skipped' | 'errors';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!verifyCronSecret(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const due = emailsDueOn(getItalyDateIso(now));
  const emails: Record<Outcome, number> = { sent: 0, skipped: 0, errors: 0 };
  // Twenty-seven days a month there is nothing to send: no read at all.
  if (due.length === 0) return NextResponse.json({ success: true, emails });

  const usersSnapshot = await adminDb.collection('users').get();
  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    if (userId === process.env.NEXT_PUBLIC_DEMO_USER_ID) {
      emails.skipped += due.length;
      continue;
    }
    let settings: Awaited<ReturnType<typeof getSettingsAdmin>>;
    try {
      settings = await getSettingsAdmin(userId);
    } catch (settingsError) {
      console.error(`[cron] email settings unreadable for user ${userId}:`, settingsError);
      emails.errors += due.length;
      continue;
    }
    // On 1 January two comments are due: side by side — two `high` requests in a row do not fit 300 s.
    const outcomes = await Promise.all(due.map((email) => sendDueEmail(userId, settings, email, now)));
    for (const outcome of outcomes) emails[outcome] += 1;
  }
  return NextResponse.json({ success: true, emails });
}

/** One (account, kind, period): claimed, sent, confirmed. Never throws. */
async function sendDueEmail(
  userId: string,
  settings: Awaited<ReturnType<typeof getSettingsAdmin>>,
  due: DueEmail,
  now: Date,
): Promise<Outcome> {
  const enabled = due.kind === 'monthly' ? settings?.monthlyEmailEnabled : settings?.yearlyEmailEnabled;
  const recipients = settings?.monthlyEmailRecipients ?? [];
  if (!enabled || recipients.length === 0) return 'skipped';
  try {
    if (!(await claimEmailDelivery(userId, due.kind, due.periodKey, now))) return 'skipped';
  } catch (claimError) {
    console.error(`[cron] ${due.kind} claim failed for user ${userId}:`, claimError);
    return 'errors';
  }
  let sent: boolean;
  try {
    sent = await buildAndSendForPeriod(userId, recipients, due.kind, due.year, due.month);
  } catch (sendError) {
    console.error(`[cron] ${due.kind} email failed for user ${userId}:`, sendError);
    await releaseEmailDelivery(userId, due.kind, due.periodKey).catch(() => undefined);
    return 'errors';
  }
  if (!sent) {
    // Nothing to send (no snapshot for the period): free for tomorrow's run.
    await releaseEmailDelivery(userId, due.kind, due.periodKey).catch(() => undefined);
    return 'skipped';
  }
  // The email is out: a confirm that fails must NOT free the period — it would leave twice today.
  try {
    await confirmEmailDelivery(userId, due.kind, due.periodKey, new Date());
  } catch (confirmError) {
    console.error(`[cron] confirm failed for user ${userId} (${due.kind} ${due.periodKey}):`, confirmError);
  }
  return 'sent';
}
