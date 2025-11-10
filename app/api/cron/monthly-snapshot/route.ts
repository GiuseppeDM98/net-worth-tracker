import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

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

    // Check if today is the last day of the month in Europe/Rome timezone
    const now = new Date();
    const romeTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
    const romeHour = romeTime.getHours();

    // Check if it's between 22:00 and 22:59
    if (romeHour !== 22) {
      return NextResponse.json({
        success: false,
        message: `Not the correct hour. Current time in Rome: ${romeHour}:${romeTime.getMinutes()}`,
        executed: false,
      });
    }

    // Check if it's the last day of the month
    const currentDay = romeTime.getDate();
    const lastDayOfMonth = new Date(
      romeTime.getFullYear(),
      romeTime.getMonth() + 1,
      0
    ).getDate();

    if (currentDay !== lastDayOfMonth) {
      return NextResponse.json({
        success: false,
        message: `Not the last day of month. Current day: ${currentDay}, Last day: ${lastDayOfMonth}`,
        executed: false,
      });
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

    return NextResponse.json({
      success: true,
      message: `Monthly snapshots job completed`,
      timestamp: new Date().toISOString(),
      romeTime: romeTime.toISOString(),
      snapshotsCreated: results.length,
      errors: errors.length,
      results,
      errorDetails: errors,
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
