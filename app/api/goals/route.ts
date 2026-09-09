import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { goalProposalSchema, parseOr400 } from '@/lib/server/validation';
import { appendInvestmentGoal } from '@/lib/server/goalData';
import { InvestmentGoal } from '@/types/goals';

/**
 * POST /api/goals
 *
 * Create one Goal-Based Investing goal. Body: { userId, goal: GoalProposal }.
 *
 * This is the confirmation half of the assistant's ```goal-proposal protocol: the model
 * proposes, the user presses Conferma, and only then does anything get written. The route
 * exists because the goal document is rewritten whole and the FIRE page writes the same
 * document — the append has to be transactional, which needs the Admin SDK.
 *
 * The write itself (id, colour, transaction) lives in lib/server/goalData.ts; the handler
 * only authenticates, validates and delegates.
 */
export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    // Empty/invalid JSON must not throw before the auth and validation checks run.
    const body = (await request.json().catch(() => ({}))) as { userId?: unknown; goal?: unknown };
    const ownerId = typeof body.userId === 'string' ? body.userId : null;

    // Delegation-aware: a shared-account member can create goals for the owner.
    await assertCanAccessAccount(decodedToken, ownerId);

    const parsed = parseOr400(goalProposalSchema, body.goal);
    if (!parsed.ok) return parsed.response;

    const now = new Date();
    const goal: Omit<InvestmentGoal, 'color'> = {
      id: crypto.randomUUID(),
      name: parsed.data.name,
      priority: parsed.data.priority,
      createdAt: now,
      updatedAt: now,
      ...(parsed.data.targetAmount != null ? { targetAmount: parsed.data.targetAmount } : {}),
      ...(parsed.data.targetDateIso != null ? { targetDate: parsed.data.targetDateIso } : {}),
      ...(parsed.data.monthlyContribution != null
        ? { monthlyContribution: parsed.data.monthlyContribution }
        : {}),
      ...(parsed.data.recommendedAllocation != null
        ? { recommendedAllocation: parsed.data.recommendedAllocation }
        : {}),
      ...(parsed.data.notes != null ? { notes: parsed.data.notes } : {}),
    };

    const created = await appendInvestmentGoal(ownerId as string, goal);

    return NextResponse.json({ goal: created });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('[API /goals] POST error:', error);
    return NextResponse.json({ error: "Impossibile creare l'obiettivo" }, { status: 500 });
  }
}
