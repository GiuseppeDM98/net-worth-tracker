/**
 * POST /api/user/monthly-email/send
 *
 * Allows an authenticated user to trigger the monthly summary email immediately
 * (without waiting for the end-of-month cron). Useful for testing the email
 * layout with real data at any point during the month.
 *
 * Auth: Firebase ID token via Authorization: Bearer <token>
 * Body: none required
 * Returns: { success: true } or error JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase/admin';
import { getSettingsAdmin, buildAndSendForCurrentMonth } from '@/lib/server/monthlyEmailService';

export async function POST(request: NextRequest) {
  try {
    // Verify Firebase ID token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Load settings and validate recipients are configured
    const settings = await getSettingsAdmin(userId);
    if (!settings?.monthlyEmailEnabled) {
      return NextResponse.json(
        { error: 'Monthly email is not enabled for this account' },
        { status: 400 }
      );
    }
    if (!settings.monthlyEmailRecipients?.length) {
      return NextResponse.json(
        { error: 'No recipients configured' },
        { status: 400 }
      );
    }

    // Build data for current Italy month and send
    const sent = await buildAndSendForCurrentMonth(userId, settings.monthlyEmailRecipients);
    if (!sent) {
      return NextResponse.json(
        { error: 'No snapshot found for the current month — save a snapshot first' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending monthly email:', error);
    return NextResponse.json(
      { error: 'Failed to send monthly email', details: (error as Error).message },
      { status: 500 }
    );
  }
}
