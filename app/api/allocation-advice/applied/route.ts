import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertCanAccessAccount, getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { parseOr400 } from '@/lib/server/validation';
import { getAllocationAdviceAdmin, patchAllocationAdviceAdmin } from '@/lib/server/allocationAdvice/store';

/**
 * POST /api/allocation-advice/applied — marks the Consulente's last run as applied
 * (2026-10-20). The writes themselves — the targets, the roles, the goals — happen on the
 * client through their own services before this call; this route only records what was
 * applied, on a document the client cannot write (the rules say so).
 *
 * Body: { userId, applied: { targetsWritten, rolesChanged, goalsWritten, planId?, planAction? } }. A second
 * POST on an applied document (the plan of accumulation created later from «Applica», 2026-11-20)
 * keeps the first `applied.at`: «applicato il …» stays the day the settings were applied.
 */
const appliedSchema = z.object({
  targetsWritten: z.boolean(),
  rolesChanged: z.number().int().nonnegative(),
  goalsWritten: z.number().int().nonnegative(),
  planId: z.string().min(1).optional(),
  planAction: z.enum(['create', 'replace', 'revise']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const body = (await request.json().catch(() => ({}))) as { userId?: unknown; applied?: unknown };
    const ownerId = typeof body.userId === 'string' ? body.userId : null;
    await assertCanAccessAccount(decodedToken, ownerId);

    const parsed = parseOr400(appliedSchema, body.applied);
    if (!parsed.ok) return parsed.response;

    const userId = ownerId as string;
    const document = await getAllocationAdviceAdmin(userId);
    if (!document || !document.report) {
      return NextResponse.json({ error: 'Nessun percorso concluso da applicare.' }, { status: 409 });
    }

    const applied = { at: document.status === 'applied' && document.applied ? document.applied.at : new Date(), ...parsed.data };
    await patchAllocationAdviceAdmin(userId, { status: 'applied', applied });
    return NextResponse.json({ applied });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    console.error('[API /allocation-advice/applied] POST error:', error);
    return NextResponse.json({ error: "Impossibile registrare l'applicazione del percorso" }, { status: 500 });
  }
}
