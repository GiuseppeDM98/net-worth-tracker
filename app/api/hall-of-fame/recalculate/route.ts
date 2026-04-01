import { NextRequest, NextResponse } from 'next/server';
import { updateHallOfFame } from '@/lib/services/hallOfFameService.server';
import {
  assertSameUser,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';

/**
 * POST /api/hall-of-fame/recalculate
 *
 * Manually trigger Hall of Fame rankings recalculation for a single user
 *
 * Request Body:
 *   {
 *     userId: string  // Required
 *   }
 *
 * Response:
 *   {
 *     success: boolean,
 *     message: string
 *   }
 *
 * Use Cases:
 *   - Manual refresh after data corrections
 *   - Recovery from failed automatic updates
 *   - Admin operations
 *
 * Related:
 *   - hallOfFameService.server.ts: Ranking calculation logic
 *   - portfolio/snapshot/manual/route.ts: Automatic trigger after snapshot
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const body = await request.json();
    const { userId } = body;

    assertSameUser(decodedToken, userId);

    // Recalculate Hall of Fame
    await updateHallOfFame(userId);

    return NextResponse.json({
      success: true,
      message: 'Hall of Fame recalculated successfully',
    });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('Error recalculating Hall of Fame:', error);
    return NextResponse.json(
      { error: 'Failed to recalculate Hall of Fame' },
      { status: 500 }
    );
  }
}
