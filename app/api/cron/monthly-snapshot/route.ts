import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { updateHallOfFame } from '@/lib/services/hallOfFameService.server';
import {
  isLastDayOfMonthItaly,
  isLastDayOfQuarterItaly,
  isLastDayOfHalfYearItaly,
  isLastDayOfYearItaly,
  monthToQuarter,
  monthToSemester,
  getSettingsAdmin,
  buildAndSendForPeriod,
  buildAndSendQuarterly,
  buildAndSendSemiAnnual,
  buildAndSendYearly,
} from '@/lib/server/monthlyEmailService';
import { getItalyMonthYear } from '@/lib/utils/dateHelpers';
import { refreshEcbRatesIfStale } from '@/lib/server/ecbRatesService';
import { isWeeklyBudgetDayItaly, buildAndSendWeeklyBudget } from '@/lib/server/weeklyBudgetEmailService';

/**
 * GET /api/cron/monthly-snapshot
 *
 * Daily automated snapshot creation cron job
 * Scheduled execution: every day at 18:00 UTC (19:00/20:00 CET) via Vercel Cron
 *
 * Runs daily — snapshot ID is {userId}-{year}-{month}, so each run overwrites
 * the same document throughout the month (upsert via .set()). The last run of
 * the month becomes the permanent historical record.
 * Emails are guarded by isLastDayOfMonthItaly / isLastDayOfQuarterItaly /
 * isLastDayOfYearItaly and are only sent once on the appropriate day.
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

    // Refresh ECB rate cache if stale — non-blocking so the cron never fails because of this
    try {
      await refreshEcbRatesIfStale();
      console.log('[cron] ECB rate cache refreshed');
    } catch (ecbError) {
      console.error('[cron] ECB rate cache refresh failed (non-blocking):', ecbError);
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

    // Phase 4: Send semi-annual summary emails (only on June 30 / December 31).
    // Note: a half-year-end coincides with a quarter-end (Q2/Q4) and, on Dec 31, with the
    // year-end too — these are independent opt-in emails, so a user enabling several toggles
    // can receive more than one summary on the same day. That is intentional.
    const semiAnnualEmailResults = { sent: 0, skipped: 0, errors: 0 };
    if (isLastDayOfHalfYearItaly(now)) {
      const { year, month } = getItalyMonthYear(now);
      const semester = monthToSemester(month);
      console.log(`Last day of H${semester} detected — sending semi-annual emails for H${semester}/${year}`);

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;

        if (userId === process.env.NEXT_PUBLIC_DEMO_USER_ID) {
          semiAnnualEmailResults.skipped++;
          continue;
        }

        try {
          const settings = await getSettingsAdmin(userId);
          if (!settings?.semiAnnualEmailEnabled || !settings.monthlyEmailRecipients?.length) {
            semiAnnualEmailResults.skipped++;
            continue;
          }

          const sent = await buildAndSendSemiAnnual(userId, settings.monthlyEmailRecipients, year, semester);
          if (!sent) {
            console.warn(`No H${semester} snapshot found for user ${userId} — skipping semi-annual email`);
            semiAnnualEmailResults.skipped++;
          } else {
            semiAnnualEmailResults.sent++;
            console.log(`Semi-annual email sent for user ${userId}`);
          }
        } catch (emailError) {
          console.error(`Semi-annual email failed for user ${userId}:`, emailError);
          semiAnnualEmailResults.errors++;
        }
      }
    }

    // Phase 5: Send yearly summary emails (only on December 31)
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

    // Phase 6: Send weekly budget status emails (every Sunday)
    const weeklyBudgetEmailResults = { sent: 0, skipped: 0, errors: 0 };
    if (isWeeklyBudgetDayItaly(now)) {
      console.log('Sunday detected — sending weekly budget emails');

      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;

        if (userId === process.env.NEXT_PUBLIC_DEMO_USER_ID) {
          weeklyBudgetEmailResults.skipped++;
          continue;
        }

        try {
          const settings = await getSettingsAdmin(userId);
          if (!settings?.weeklyBudgetEmailEnabled || !settings.monthlyEmailRecipients?.length) {
            weeklyBudgetEmailResults.skipped++;
            continue;
          }

          const sent = await buildAndSendWeeklyBudget(userId, settings.monthlyEmailRecipients, now);
          if (!sent) {
            weeklyBudgetEmailResults.skipped++;
          } else {
            weeklyBudgetEmailResults.sent++;
            console.log(`Weekly budget email sent for user ${userId}`);
          }
        } catch (emailError) {
          console.error(`Weekly budget email failed for user ${userId}:`, emailError);
          weeklyBudgetEmailResults.errors++;
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
      semiAnnualEmailSummary: semiAnnualEmailResults,
      yearlyEmailSummary: yearlyEmailResults,
      weeklyBudgetEmailSummary: weeklyBudgetEmailResults,
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
