import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { updateHallOfFame } from '@/lib/services/hallOfFameService.server';
import { refreshEcbRatesIfStale } from '@/lib/server/ecbRatesService';
import { evaluateActiveGoals } from '@/lib/server/assistant/goalEvaluationService';
import { captureBudgetHistory } from '@/lib/server/budgetHistoryService';
import { verifyCronSecret } from '@/lib/server/apiAuth';

/**
 * GET /api/cron/monthly-snapshot
 *
 * Daily automated snapshot creation cron job
 * Scheduled execution: every day at 18:00 UTC (19:00/20:00 CET) via Vercel Cron
 *
 * Runs daily — snapshot ID is {userId}-{year}-{month}, so each run overwrites
 * the same document throughout the month (upsert via .set()). The last run of
 * the month becomes the month's permanent record. The same call also files the
 * day's row in dailySnapshots/{userId}/months/{YYYY-MM} (since 2026-11-23,
 * lib/server/dailySnapshotStore.ts), so every evening is kept there; an account
 * with no asset gets neither.
 * This route sends no email: the periodic emails have their own cron an hour later
 * (/api/cron/periodic-emails, since 2026-11-28). The
 * assistant's goal re-evaluation (phase 7) runs every day, like the snapshot, and so
 * does the budget history capture (phase 8): budgetHistory/{userId}/months/{YYYY-MM}
 * is overwritten daily, so a month's record is its last captured configuration — the
 * ceiling "as it was", which budgets/{userId} alone cannot tell.
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
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!verifyCronSecret(token)) {
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

    // The goals and the budget history (phases 7 and 8) read the same instant.
    const now = new Date();

    // Phase 7: Re-evaluate the assistant's structured goals (every day).
    // Runs after Phase 1 so it reads the snapshot written for the current month a
    // few lines above. This is what makes a goal reached "by itself" — the market
    // moved, not the user — surface without anyone opening the assistant.
    const goalEvaluationResults = { evaluated: 0, suggestions: 0, skipped: 0, errors: 0 };
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      if (userId === process.env.NEXT_PUBLIC_DEMO_USER_ID) {
        goalEvaluationResults.skipped++;
        continue;
      }

      try {
        const result = await evaluateActiveGoals(userId);
        if (result.skippedReason) {
          goalEvaluationResults.skipped++;
        } else {
          goalEvaluationResults.evaluated += result.evaluatedGoals;
          goalEvaluationResults.suggestions += result.suggestionsCreated;
        }
      } catch (goalError) {
        console.error(`Goal re-evaluation failed for user ${userId}:`, goalError);
        goalEvaluationResults.errors++;
      }
    }

    // Phase 8: Capture every budget configuration under the current month (every day).
    // The Budget tab reads these records to compare a closed month with the ceiling it
    // had, not with today's; non-fatal like the ECB refresh.
    let budgetHistorySummary = { captured: 0, skipped: 0, errors: 0 };
    try {
      budgetHistorySummary = await captureBudgetHistory(now, process.env.NEXT_PUBLIC_DEMO_USER_ID);
      console.log(`[cron] budget history captured for ${budgetHistorySummary.captured} users`);
    } catch (historyError) {
      console.error('[cron] budget history capture failed (non-blocking):', historyError);
    }

    return NextResponse.json({
      success: true,
      message: `Monthly snapshots job completed`,
      timestamp: new Date().toISOString(),
      snapshotsCreated: results.length,
      errors: errors.length,
      results,
      errorDetails: errors,
      goalEvaluationSummary: goalEvaluationResults,
      budgetHistorySummary,
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
