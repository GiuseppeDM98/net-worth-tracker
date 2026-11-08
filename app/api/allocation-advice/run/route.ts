import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assertCanAccessAccount, getApiAuthErrorResponse, requireFirebaseAuth } from '@/lib/server/apiAuth';
import { parseOr400 } from '@/lib/server/validation';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { allocationAdviceAnswersSchema, interviewSchema, type AllocationAdviceAnswers, type AllocationAdviceInterview } from '@/lib/utils/allocationAdviceProposal';
import { AllocationAdviceStageError, runAllocationAdviceStage, runInterviewRound } from '@/lib/server/allocationAdvice/run';
import { ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS, ALLOCATION_ADVICE_RUN_STAGES, type AllocationAdviceRunEvent, type AllocationAdviceRunStage } from '@/types/allocationAdvice';

/**
 * POST /api/allocation-advice/run — the Consulente's run (2026-10-20).
 *
 * Body: { userId, stage, answers?, request?, interview?, revision? }. ONE stage per request (`strategy` · `instruments` ·
 * `review`, plus `revise` — «Chiedi una modifica» on a finished report, with `request`): the strategy takes the answers, validated against the ONE schema the screens typed
 * them with, and creates the document; the other two continue the persisted document. Each
 * request streams SSE (`stage` events, then `done` with the document, or `error`), and the
 * client chains the three (`useConsulenteRun`), retrying a failed stage from itself.
 *
 * `stage: 'interview'` (2026-11-08, doc/ai/AI-04-colloquio.md) is a branch of its own: with
 * `answers` and `interview` (the rounds so far; `revision: { requests }` for the ONE round before
 * a «Chiedi una modifica») it calls `runInterviewRound` — never `runAllocationAdviceStage`, no
 * write to `allocationAdvice/{uid}` — and streams one terminal event, `interview` or `error`.
 * The strategy and the revise carry `interview` into the document (`interview`, `revisionInterview`).
 *
 * Why three requests: a model call with reasoning (two on Opus 5.5, one on Sonnet 5.5 with web
 * search) is minutes — the owner's run of 2026-10-20 took 396 s, the strategy alone 210 s — and
 * Vercel's Hobby plan stops a function at 300 s (60 s without Fluid compute: it must be on).
 * `maxDuration` is that ceiling; a stage that outlives it is cut with a 504 and the document
 * stays on that stage, which «Riprova» resumes.
 */
export const maxDuration = 300;

/** What «Chiedi una modifica» may say: one request, a paragraph at most. */
const revisionRequestSchema = z.string().trim().min(1).max(1000);

/** 12 model requests an hour per warm instance (interview rounds, strategy, revise; instruments and review do not count). */
const RUN_RATE_LIMIT_MAX = 12;
const RUN_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const revisionSchema = z.object({ requests: revisionRequestSchema });

function encodeEvent(event: AllocationAdviceRunEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'Servizio AI non configurato. Aggiungi ANTHROPIC_API_KEY per abilitare il Consulente.' },
        { status: 503 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as { userId?: unknown; stage?: unknown; answers?: unknown; request?: unknown; interview?: unknown; revision?: unknown };
    const ownerId = typeof body.userId === 'string' ? body.userId : null;
    await assertCanAccessAccount(decodedToken, ownerId);

    // No stage is the first one (an older client); a stage outside the three, the revise and the interview is a bad request.
    const stage: AllocationAdviceRunStage | 'interview' | null =
      body.stage === undefined
        ? 'strategy'
        : body.stage === 'revise'
          ? 'revise'
          : body.stage === 'interview'
            ? 'interview'
            : ALLOCATION_ADVICE_RUN_STAGES.find((item) => item === body.stage) ?? null;
    if (stage === null) return NextResponse.json({ error: 'Fase del percorso non riconosciuta' }, { status: 400 });

    let answers: AllocationAdviceAnswers | undefined;
    if (stage === 'strategy' || stage === 'interview') {
      const parsed = parseOr400(allocationAdviceAnswersSchema, body.answers);
      if (!parsed.ok) return parsed.response;
      answers = parsed.data;
    }
    let revisionRequest: string | undefined;
    if (stage === 'revise') {
      const parsed = parseOr400(revisionRequestSchema, body.request);
      if (!parsed.ok) return parsed.response;
      revisionRequest = parsed.data;
    }
    // The interview: required by an `interview` request (`{ rounds: [], skipped: false }` asks
    // round 1), optional for the strategy and the revise (absent → null, an older client).
    let interview: AllocationAdviceInterview | null = null;
    if (stage === 'interview' || body.interview !== undefined) {
      const parsed = parseOr400(interviewSchema, body.interview);
      if (!parsed.ok) return parsed.response;
      interview = parsed.data;
    }
    let revision: { requests: string } | null = null;
    if (stage === 'interview' && body.revision !== undefined) {
      const parsed = parseOr400(revisionSchema, body.revision);
      if (!parsed.ok) return parsed.response;
      revision = parsed.data;
    }
    // Before any slot: a round that cannot be asked, or a revise with more than its one round.
    if (stage === 'interview' && interview) {
      if (interview.skipped) return NextResponse.json({ error: 'Il colloquio è stato saltato.' }, { status: 400 });
      if (interview.rounds.length >= ALLOCATION_ADVICE_INTERVIEW_MAX_ROUNDS) return NextResponse.json({ error: 'Il colloquio ha già tre tornate: avvia la ricerca.' }, { status: 400 });
      if (revision && interview.rounds.length > 0) return NextResponse.json({ error: "Prima della revisione c'è una sola tornata di domande." }, { status: 400 });
    }
    if (stage === 'revise' && interview && interview.rounds.length > 1) {
      return NextResponse.json({ error: "Prima della revisione c'è una sola tornata di domande." }, { status: 400 });
    }

    // The limit counts MODEL REQUESTS, after the body is known good (a 400 costs no slot): an
    // interview round, the strategy and a revision are one call each; instruments and review continue a run.
    const rateLimit =
      stage === 'strategy' || stage === 'revise' || stage === 'interview'
        ? checkRateLimit(`${ownerId}:allocation-advice`, RUN_RATE_LIMIT_MAX, RUN_RATE_LIMIT_WINDOW_MS)
        : { allowed: true as const, retryAfterSeconds: 0 };
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Hai fatto troppe richieste al Consulente in un\'ora. Riprova più tardi.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      );
    }
    const userId = ownerId as string;

    console.info('[allocation-advice/run] request', { route: '/api/allocation-advice/run', stage, goals: answers?.goals.length ?? null, rounds: interview?.rounds.length ?? null });

    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (stage === 'interview') {
            // Its own entry point: one terminal event, no `done`, no write (criterion 1 of AI-04).
            await runInterviewRound({
              userId,
              answers: answers as AllocationAdviceAnswers,
              previousRounds: interview?.rounds ?? [],
              revision,
              onRound: (round) => controller.enqueue(encodeEvent({ type: 'interview', round })),
            });
            return;
          }
          const document = await runAllocationAdviceStage({
            userId,
            stage,
            answers,
            request: revisionRequest,
            interview,
            onStage: (reached) => controller.enqueue(encodeEvent({ type: 'stage', stage: reached })),
          });
          controller.enqueue(encodeEvent({ type: 'done', document }));
        } catch (error) {
          const failure = error instanceof AllocationAdviceStageError ? error : null;
          if (!failure) console.error('[allocation-advice/run] stream error', error);
          controller.enqueue(
            encodeEvent({
              type: 'error',
              error: failure?.message ?? 'Il percorso si è interrotto per un errore imprevisto. Riprova fra qualche istante.',
              retryable: failure?.retryable ?? true,
            })
          );
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    });
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    console.error('[API /allocation-advice/run] POST error:', error);
    return NextResponse.json({ error: 'Impossibile avviare il percorso del Consulente' }, { status: 500 });
  }
}
