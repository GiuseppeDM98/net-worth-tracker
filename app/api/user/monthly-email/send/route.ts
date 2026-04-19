/**
 * POST /api/user/monthly-email/send
 *
 * Allows an authenticated user to trigger a periodic summary email immediately.
 * Accepts an optional JSON body with `periodType` ('monthly' | 'quarterly' | 'yearly').
 * When omitted, defaults to 'monthly'. Resolves the most recently completed period
 * automatically (e.g. April 19 2026 → March for quarterly, 2025 for yearly).
 *
 * Auth: Firebase ID token via Authorization: Bearer <token>
 * Body: { periodType?: 'monthly' | 'quarterly' | 'yearly' }
 * Returns: { success: true } or error JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import {
  getSettingsAdmin,
  buildAndSendForPeriod,
  getMostRecentCompletedQuarterEnd,
  getMostRecentCompletedYearEnd,
  type EmailPeriodType,
} from '@/lib/server/monthlyEmailService';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Parse optional body — default to monthly
    const body = await request.json().catch(() => ({})) as { periodType?: string };
    const periodType: EmailPeriodType =
      body.periodType === 'quarterly' || body.periodType === 'yearly'
        ? body.periodType
        : 'monthly';

    // Auto-resolve the most recently completed period for each type
    let year: number;
    let month: number;
    if (periodType === 'quarterly') {
      ({ year, month } = getMostRecentCompletedQuarterEnd(new Date()));
    } else if (periodType === 'yearly') {
      ({ year, month } = getMostRecentCompletedYearEnd(new Date()));
    } else {
      ({ year, month } = getItalyMonthYear(new Date()));
    }

    const settings = await getSettingsAdmin(userId);

    // Check the correct toggle per period type
    const enabledKey =
      periodType === 'quarterly'
        ? 'quarterlyEmailEnabled'
        : periodType === 'yearly'
        ? 'yearlyEmailEnabled'
        : 'monthlyEmailEnabled';

    if (!settings?.[enabledKey]) {
      return NextResponse.json(
        { error: `${periodType} email is not enabled for this account` },
        { status: 400 }
      );
    }
    if (!settings.monthlyEmailRecipients?.length) {
      return NextResponse.json({ error: 'No recipients configured' }, { status: 400 });
    }

    const sent = await buildAndSendForPeriod(
      userId,
      settings.monthlyEmailRecipients,
      periodType,
      year,
      month
    );
    if (!sent) {
      return NextResponse.json(
        { error: 'No snapshot found for the requested period — save a snapshot first' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending periodic email:', error);
    return NextResponse.json(
      { error: 'Failed to send email', details: (error as Error).message },
      { status: 500 }
    );
  }
}
