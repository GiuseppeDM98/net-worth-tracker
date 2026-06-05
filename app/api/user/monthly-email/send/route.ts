/**
 * POST /api/user/monthly-email/send
 *
 * Allows an authenticated user to trigger a periodic summary email immediately.
 * Accepts an optional JSON body with `periodType` ('monthly' | 'quarterly' | 'semiannual' | 'yearly').
 * When omitted, defaults to 'monthly'. Resolves the most recently completed period
 * automatically (e.g. April 19 2026 → March for quarterly, H2 2025 for semiannual, 2025 for yearly).
 * `periodType: 'weekly-budget'` sends the weekly budget status email for the current state instead.
 *
 * Auth: Firebase ID token via Authorization: Bearer <token>
 * Body: { periodType?: 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | 'weekly-budget' }
 * Returns: { success: true } or error JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import {
  getSettingsAdmin,
  buildAndSendForPeriod,
  getMostRecentCompletedQuarterEnd,
  getMostRecentCompletedHalfYearEnd,
  getMostRecentCompletedYearEnd,
  type EmailPeriodType,
} from '@/lib/server/monthlyEmailService';
import { buildAndSendWeeklyBudget } from '@/lib/server/weeklyBudgetEmailService';
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

    // Weekly budget email is a separate builder (not a snapshot-based period summary).
    if (body.periodType === 'weekly-budget') {
      const settings = await getSettingsAdmin(userId);
      if (!settings?.weeklyBudgetEmailEnabled) {
        return NextResponse.json({ error: 'weekly budget email is not enabled for this account' }, { status: 400 });
      }
      if (!settings.monthlyEmailRecipients?.length) {
        return NextResponse.json({ error: 'No recipients configured' }, { status: 400 });
      }
      const sent = await buildAndSendWeeklyBudget(userId, settings.monthlyEmailRecipients, new Date());
      if (!sent) {
        return NextResponse.json({ error: 'No budgets configured — create a budget first' }, { status: 404 });
      }
      return NextResponse.json({ success: true });
    }

    const periodType: EmailPeriodType =
      body.periodType === 'quarterly' ||
      body.periodType === 'semiannual' ||
      body.periodType === 'yearly'
        ? body.periodType
        : 'monthly';

    // Auto-resolve the most recently completed period for each type
    let year: number;
    let month: number;
    if (periodType === 'quarterly') {
      ({ year, month } = getMostRecentCompletedQuarterEnd(new Date()));
    } else if (periodType === 'semiannual') {
      ({ year, month } = getMostRecentCompletedHalfYearEnd(new Date()));
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
        : periodType === 'semiannual'
        ? 'semiAnnualEmailEnabled'
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
