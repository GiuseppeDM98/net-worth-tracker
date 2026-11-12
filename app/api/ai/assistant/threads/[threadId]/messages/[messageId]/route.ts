import { NextRequest, NextResponse } from 'next/server';
import {
  assertCanAccessAccount,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { isAssistantStoreError, setAssistantMessageProposal } from '@/lib/server/assistant/store';
import { parseOr400, proposalPatchSchema } from '@/lib/server/validation';

/**
 * PATCH /api/ai/assistant/threads/[threadId]/messages/[messageId]
 *
 * Records the outcome of ONE card of an assistant message — a row written on «Conferma», a
 * proposal ignored — under `proposals[key]` of the message document, so the thread shows the
 * outcome after a reload and the same row is never confirmed twice. The row itself is written by
 * the browser through the expense services; this route only remembers that it was.
 *
 * `userId` is the account the thread belongs to (the owner's, for a co-owner): the store answers
 * 403 for another account's thread and 404 for a thread or a message that does not exist.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string; messageId: string }> }
) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    const parsed = parseOr400(proposalPatchSchema, await request.json());
    if (!parsed.ok) return parsed.response;
    const { userId, key, ...state } = parsed.data;

    await assertCanAccessAccount(decodedToken, userId);

    const { threadId, messageId } = await params;
    const proposal = await setAssistantMessageProposal(userId, threadId, messageId, key, state);

    return NextResponse.json({ proposal });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (isAssistantStoreError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('[API /ai/assistant/threads/[threadId]/messages/[messageId]] PATCH error:', error);
    return NextResponse.json(
      { error: "Impossibile salvare l'esito della proposta" },
      { status: 500 }
    );
  }
}
