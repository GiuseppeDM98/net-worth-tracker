import { NextRequest, NextResponse } from 'next/server';
import { updateHallOfFame } from '@/lib/services/hallOfFameService.server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    // Validate required fields
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Recalculate Hall of Fame
    await updateHallOfFame(userId);

    return NextResponse.json({
      success: true,
      message: 'Hall of Fame recalculated successfully',
    });
  } catch (error) {
    console.error('Error recalculating Hall of Fame:', error);
    return NextResponse.json(
      { error: 'Failed to recalculate Hall of Fame' },
      { status: 500 }
    );
  }
}
