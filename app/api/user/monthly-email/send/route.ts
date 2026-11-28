/**
 * POST /api/user/monthly-email/send
 *
 * «Invia ora»: sends the summary of the LAST CLOSED period now, even if the cron already sent it — the
 * month just closed (`lastClosedMonth`) or the year just closed (`lastClosedYear`), on the Italian day;
 * never the month in progress. A send that went out is recorded in the ledger with `manual: true`, so
 * the cron does not send the same period again; a failed record is logged and the email still counts as
 * sent.
 *
 * Auth: Firebase ID token via Authorization: Bearer <token>; the route answers for the token's own uid
 * (a co-owner's «Invia ora» reads the co-owner's settings). The demo account is refused.
 * Body: { periodType?: 'monthly' | 'yearly' } — absent means monthly, any other value is a 400.
 * Returns: { success: true } or error JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { getSettingsAdmin, buildAndSendForPeriod } from '@/lib/server/monthlyEmailService';
import { confirmEmailDelivery } from '@/lib/server/emailDeliveries';
import { lastClosedMonth, lastClosedYear, monthPeriodKey, type PeriodicEmailKind } from '@/lib/utils/emailSchedule';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    if (userId === process.env.NEXT_PUBLIC_DEMO_USER_ID) {
      return NextResponse.json({ error: 'Non disponibile in demo' }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as { periodType?: unknown };
    const periodType = body.periodType ?? 'monthly';
    if (periodType !== 'monthly' && periodType !== 'yearly') {
      return NextResponse.json({ error: 'periodType non valido' }, { status: 400 });
    }
    const kind: PeriodicEmailKind = periodType;

    const now = new Date();
    const todayIso = getItalyDateIso(now);
    const closed = lastClosedMonth(todayIso);
    const closedYear = lastClosedYear(todayIso);
    const period =
      kind === 'yearly'
        ? { year: closedYear, month: 12, periodKey: String(closedYear) }
        : { ...closed, periodKey: monthPeriodKey(closed.year, closed.month) };

    const settings = await getSettingsAdmin(userId);
    const enabled = kind === 'yearly' ? settings?.yearlyEmailEnabled : settings?.monthlyEmailEnabled;
    if (!enabled) {
      return NextResponse.json(
        { error: kind === 'yearly' ? "L'email annuale non è attiva" : "L'email mensile non è attiva" },
        { status: 400 }
      );
    }
    if (!settings?.monthlyEmailRecipients?.length) {
      return NextResponse.json({ error: 'Nessun destinatario configurato' }, { status: 400 });
    }

    const sent = await buildAndSendForPeriod(
      userId,
      settings.monthlyEmailRecipients,
      kind,
      period.year,
      period.month
    );
    if (!sent) {
      return NextResponse.json(
        { error: 'Nessuno snapshot per questo periodo: salvane uno prima' },
        { status: 404 }
      );
    }

    // The email is out: a record that fails is logged, never turned into an error for the user.
    try {
      await confirmEmailDelivery(userId, kind, period.periodKey, new Date(), true);
    } catch (confirmError) {
      console.error(`Manual ${kind} send: ledger confirm failed for user ${userId}:`, confirmError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending periodic email:', error);
    return NextResponse.json(
      { error: 'Invio non riuscito', details: (error as Error).message },
      { status: 500 }
    );
  }
}
