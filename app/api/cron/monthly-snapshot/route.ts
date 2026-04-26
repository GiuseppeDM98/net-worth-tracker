import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { updateHallOfFame } from '@/lib/services/hallOfFameService.server';
import {
  isLastDayOfMonthItaly,
  isLastDayOfQuarterItaly,
  isLastDayOfYearItaly,
  monthToQuarter,
  getSettingsAdmin,
  buildAndSendForPeriod,
  buildAndSendQuarterly,
  buildAndSendYearly,
} from '@/lib/server/monthlyEmailService';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';

/**
 * GET /api/cron/monthly-snapshot
 *
 * Monthly automated snapshot creation cron job
 * Scheduled execution: 1st of each month at 00:00 UTC via Vercel Cron
 *
 * Orchestration Pattern:
 *   - Fetches all users from database
 *   - For each user: Calls /api/portfolio/snapshot internally
 *   - After each snapshot: Updates Hall of Fame rankings
 *   - Collects results and errors for monitoring
 *
 * Why internal fetch instead of direct service calls?
 *   - Reuses existing snapshot logic (price updates, calculations)
 *   - Maintains single source of truth for snapshot creation
 *   - Simplifies error handling and response formatting
 *
 * Error Handling:
 *   - Non-blocking: One user's failure doesn't stop others
 *   - Hall of Fame update failures are logged but don't fail the job
 *   - Returns summary of successes and failures
 *
 * Security:
 *   - Requires CRON_SECRET via Authorization header
 *   - Uses Admin SDK for cross-user operations
 *
 * Related:
 *   - portfolio/snapshot/route.ts: Called internally for each user
 *   - hallOfFameService.server.ts: Ranking updates after snapshots
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all users
    const usersRef = adminDb.collection('users');
    const usersSnapshot = await usersRef.get();

    if (usersSnapshot.empty) {
      return NextResponse.json({
        success: true,
        message: 'No users found',
        snapshotsCreated: 0,
      });
    }

    const results = [];
    const errors = [];

    // Create snapshot for each user
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      try {
        // Call the snapshot API for this user
        const snapshotResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/portfolio/snapshot`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId,
              cronSecret: process.env.CRON_SECRET,
            }),
          }
        );

        const snapshotResult = await snapshotResponse.json();

        if (snapshotResult.success) {
          // Update Hall of Fame after successful snapshot creation
          try {
            await updateHallOfFame(userId);
            console.log(`Hall of Fame updated for user ${userId}`);
          } catch (hallOfFameError) {
            console.error(`Error updating Hall of Fame for user ${userId}:`, hallOfFameError);
            // Don't fail the snapshot creation if Hall of Fame update fails
          }

          results.push({
            userId,
            snapshotId: snapshotResult.snapshotId,
            message: snapshotResult.message,
          });
        } else {
          errors.push({
            userId,
            error: snapshotResult.error || 'Unknown error',
          });
        }
      } catch (error) {
        console.error(`Error creating snapshot for user ${userId}:`, error);
        errors.push({
          userId,
          error: (error as Error).message,
        });
      }
    }

    // Phase 2: Send monthly summary emails (only on the last day of the month)
    const now = new Date();
    const emailResults = { sent: 0, skipped: 0, errors: 0 };
    if (isLastDayOfMonthItaly(now)) {
      const { year, month } = getItalyMonthYear(now);
      console.log(`Last day of month detected — sending summary emails for ${month}/${year}`);

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;

        // Skip demo user — its data is synthetic
        if (userId === process.env.NEXT_PUBLIC_DEMO_USER_ID) {
          emailResults.skipped++;
          continue;
        }

        try {
          const settings = await getSettingsAdmin(userId);
          if (!settings?.monthlyEmailEnabled || !settings.monthlyEmailRecipients?.length) {
            emailResults.skipped++;
            continue;
          }

          const sent = await buildAndSendForPeriod(userId, settings.monthlyEmailRecipients, 'monthly', year, month);
          if (!sent) {
            console.warn(`No snapshot found for user ${userId} — skipping monthly email`);
            emailResults.skipped++;
          } else {
            emailResults.sent++;
            console.log(`Monthly email sent for user ${userId}`);
          }
        } catch (emailError) {
          console.error(`Monthly email failed for user ${userId}:`, emailError);
          emailResults.errors++;
        }
      }
    }

    // Phase 3: Send quarterly summary emails (only on the last day of a quarter)
    const quarterlyEmailResults = { sent: 0, skipped: 0, errors: 0 };
    if (isLastDayOfQuarterItaly(now)) {
      const { year, month } = getItalyMonthYear(now);
      const quarter = monthToQuarter(month);
      console.log(`Last day of Q${quarter} detected — sending quarterly emails for Q${quarter}/${year}`);

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;

        if (userId === process.env.NEXT_PUBLIC_DEMO_USER_ID) {
          quarterlyEmailResults.skipped++;
          continue;
        }

        try {
          const settings = await getSettingsAdmin(userId);
          if (!settings?.quarterlyEmailEnabled || !settings.monthlyEmailRecipients?.length) {
            quarterlyEmailResults.skipped++;
            continue;
          }

          const sent = await buildAndSendQuarterly(userId, settings.monthlyEmailRecipients, year, quarter);
          if (!sent) {
            console.warn(`No Q${quarter} snapshot found for user ${userId} — skipping quarterly email`);
            quarterlyEmailResults.skipped++;
          } else {
            quarterlyEmailResults.sent++;
            console.log(`Quarterly email sent for user ${userId}`);
          }
        } catch (emailError) {
          console.error(`Quarterly email failed for user ${userId}:`, emailError);
          quarterlyEmailResults.errors++;
        }
      }
    }

    // Phase 4: Send yearly summary emails (only on December 31)
    const yearlyEmailResults = { sent: 0, skipped: 0, errors: 0 };
    if (isLastDayOfYearItaly(now)) {
      const { year } = getItalyMonthYear(now);
      console.log(`December 31 detected — sending yearly emails for ${year}`);

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;

        if (userId === process.env.NEXT_PUBLIC_DEMO_USER_ID) {
          yearlyEmailResults.skipped++;
          continue;
        }

        try {
          const settings = await getSettingsAdmin(userId);
          if (!settings?.yearlyEmailEnabled || !settings.monthlyEmailRecipients?.length) {
            yearlyEmailResults.skipped++;
            continue;
          }

          const sent = await buildAndSendYearly(userId, settings.monthlyEmailRecipients, year);
          if (!sent) {
            console.warn(`No December snapshot found for user ${userId} — skipping yearly email`);
            yearlyEmailResults.skipped++;
          } else {
            yearlyEmailResults.sent++;
            console.log(`Yearly email sent for user ${userId}`);
          }
        } catch (emailError) {
          console.error(`Yearly email failed for user ${userId}:`, emailError);
          yearlyEmailResults.errors++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Monthly snapshots job completed`,
      timestamp: new Date().toISOString(),
      snapshotsCreated: results.length,
      errors: errors.length,
      results,
      errorDetails: errors,
      emailSummary: emailResults,
      quarterlyEmailSummary: quarterlyEmailResults,
      yearlyEmailSummary: yearlyEmailResults,
    });
  } catch (error) {
    console.error('Error in monthly snapshot cron job:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to execute monthly snapshot job',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
