/**
 * The Consulente's routes: `POST /api/allocation-advice/run` (auth, the key, the answers'
 * schema, the SSE events) and `POST /api/allocation-advice/applied` (auth, the schema, no
 * report → 409, the patch).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { verifyIdTokenMock, accountAccessDocGetMock, runMock, interviewMock, getAdviceMock, patchAdviceMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  accountAccessDocGetMock: vi.fn(),
  runMock: vi.fn(),
  interviewMock: vi.fn(),
  getAdviceMock: vi.fn(),
  patchAdviceMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
// The run module reaches the client SDK through the context service: mocked away at import.
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
const { rateLimitMock } = vi.hoisted(() => ({ rateLimitMock: vi.fn(() => ({ allowed: true })) }));
vi.mock('@/lib/server/rateLimit', () => ({ checkRateLimit: rateLimitMock }));
vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: verifyIdTokenMock },
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'account-access') return { doc: vi.fn(() => ({ get: accountAccessDocGetMock })) };
      throw new Error(`Unexpected collection: ${name}`);
    }),
  },
}));
vi.mock('@/lib/server/allocationAdvice/run', async () => {
  const actual = await vi.importActual<typeof import('@/lib/server/allocationAdvice/run')>('@/lib/server/allocationAdvice/run');
  return { runAllocationAdviceStage: runMock, runInterviewRound: interviewMock, AllocationAdviceStageError: actual.AllocationAdviceStageError };
});
vi.mock('@/lib/server/allocationAdvice/store', () => ({
  getAllocationAdviceAdmin: getAdviceMock,
  patchAllocationAdviceAdmin: patchAdviceMock,
}));

import { POST as runRoute } from '@/app/api/allocation-advice/run/route';
import { POST as appliedRoute } from '@/app/api/allocation-advice/applied/route';
import { AllocationAdviceStageError } from '@/lib/server/allocationAdvice/run';

const ANSWERS = {
  age: 35,
  horizonYears: 20,
  lossTolerance: 'media',
  exchange: 'Borsa Italiana (Milano, XMIL)',
  broker: '',
  distributionPolicy: 'accumulazione',
  goals: [],
  goalsReflectReality: true,
  newGoalsNote: '',
  homeRole: 'excluded',
  pensionRole: 'frozen',
  privateEquityRole: 'frozen',
  keepAssets: [],
  avoid: '',
  esg: false,
  notes: '',
};

function post(url: string, body: unknown, authorized = true): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: 'Bearer valid-token' } : {}) },
    body: JSON.stringify(body),
  });
}

async function readSse(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data:'))
    .map((chunk) => JSON.parse(chunk.slice(5).trim()));
}

describe('POST /api/allocation-advice/run', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = 'test-key';
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    accountAccessDocGetMock.mockResolvedValue({ exists: false, data: () => undefined });
  });

  it('refuses an unauthenticated call and a call on another account', async () => {
    expect((await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', answers: ANSWERS }, false))).status).toBe(401);
    expect((await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-2', answers: ANSWERS }))).status).toBe(403);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('answers 503 without the key and 400 on answers the schema refuses', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect((await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', answers: ANSWERS }))).status).toBe(503);
    process.env.ANTHROPIC_API_KEY = 'test-key';
    expect((await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', answers: { ...ANSWERS, age: 5 } }))).status).toBe(400);
    expect(runMock).not.toHaveBeenCalled();
  });

  it('streams the stages and the document on success', async () => {
    runMock.mockImplementation(async ({ onStage }: { onStage: (stage: string) => void }) => {
      onStage('context');
      onStage('strategy');
      return { userId: 'user-1', status: 'ready' };
    });
    const response = await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', answers: ANSWERS }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    const events = await readSse(response);
    expect(events).toEqual([
      { type: 'stage', stage: 'context' },
      { type: 'stage', stage: 'strategy' },
      { type: 'done', document: { userId: 'user-1', status: 'ready' } },
    ]);
    // No stage named is the first one, and the first one counts against the limit.
    expect(runMock.mock.calls[0][0]).toMatchObject({ userId: 'user-1', stage: 'strategy', answers: ANSWERS });
    expect(rateLimitMock).toHaveBeenCalledWith('user-1:allocation-advice', 12, 3_600_000);
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
  });

  // ── One request per stage (Vercel Hobby's 300 s, 2026-10-20) ────────────────────────────

  it('runs the stage the body names without answers, outside the rate limit, and refuses one it does not know', async () => {
    runMock.mockResolvedValue({ userId: 'user-1', status: 'running', stage: 'instruments' });
    const response = await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'instruments' }));
    expect(response.status).toBe(200);
    const events = await readSse(response);
    expect(events.at(-1)).toMatchObject({ type: 'done', document: { stage: 'instruments' } });
    expect(runMock.mock.calls[0][0]).toMatchObject({ userId: 'user-1', stage: 'instruments', answers: undefined });
    expect(rateLimitMock).not.toHaveBeenCalled();

    const review = await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'review' }));
    expect(review.status).toBe(200);
    expect(runMock.mock.calls[1][0]).toMatchObject({ stage: 'review' });

    const unknown = await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'context' }));
    expect(unknown.status).toBe(400);
    expect(runMock).toHaveBeenCalledTimes(2);
  });

  it('revise needs the request, passes it on, and counts against the limit like a run', async () => {
    runMock.mockResolvedValue({ userId: 'user-1', status: 'ready' });
    expect((await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'revise' }))).status).toBe(400);
    expect((await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'revise', request: '   ' }))).status).toBe(400);
    expect(runMock).not.toHaveBeenCalled();

    const response = await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'revise', request: ' solo bond singoli ' }));
    expect(response.status).toBe(200);
    await readSse(response);
    expect(runMock.mock.calls[0][0]).toMatchObject({ userId: 'user-1', stage: 'revise', request: 'solo bond singoli' });
    expect(rateLimitMock).toHaveBeenCalledWith('user-1:allocation-advice', 12, 3_600_000);
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
  });

  it('streams a stage failure as an error event in the product\'s words', async () => {
    runMock.mockRejectedValue(new AllocationAdviceStageError('instruments', 'Il servizio AI non ha risposto.', true));
    const events = await readSse(await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', answers: ANSWERS })));
    expect(events).toEqual([{ type: 'error', error: 'Il servizio AI non ha risposto.', retryable: true }]);
  });

  // ── The interview (2026-11-08: its own branch, the 400s, the rate limit) ─────────────
  const EMPTY_INTERVIEW = { rounds: [], skipped: false };
  const storedRound = (overrides: Record<string, unknown> = {}) => ({
    note: 'Vedo un reddito concentrato.',
    satisfied: false,
    questions: [{ id: 'reddito', kind: 'single', text: 'Quanto dipendi dal reddito?', why: "l'86% delle entrate", options: [{ value: 'si', label: 'Sì' }, { value: 'no', label: 'No' }], allowOther: true }],
    answers: [{ questionId: 'reddito', value: 'si' }],
    model: 'opus-finto',
    askedAt: '2026-11-08T11:00:00.000Z',
    ...overrides,
  });

  it('stage interview calls runInterviewRound, never the stage runner, counts against the limit of 12, and streams the round', async () => {
    const askedAt = new Date('2026-11-08T11:05:00.000Z');
    interviewMock.mockImplementation(async ({ onRound }: { onRound: (round: unknown) => void }) => {
      onRound({ ...storedRound(), answers: undefined, askedAt });
    });
    const response = await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'interview', answers: ANSWERS, interview: EMPTY_INTERVIEW }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    const events = await readSse(response);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'interview', round: { note: 'Vedo un reddito concentrato.', model: 'opus-finto', askedAt: askedAt.toISOString() } });
    expect(runMock).not.toHaveBeenCalled();
    expect(interviewMock).toHaveBeenCalledTimes(1);
    expect(interviewMock.mock.calls[0][0]).toMatchObject({ userId: 'user-1', answers: ANSWERS, previousRounds: [], revision: null });
    expect(rateLimitMock).toHaveBeenCalledTimes(1);
    expect(rateLimitMock).toHaveBeenCalledWith('user-1:allocation-advice', 12, 3_600_000);
  });

  it('hands the previous rounds on with askedAt as a Date, and the revision request when there is one', async () => {
    interviewMock.mockResolvedValue(undefined);
    await readSse(await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'interview', answers: ANSWERS, interview: { rounds: [storedRound()], skipped: false } })));
    const previous = interviewMock.mock.calls[0][0].previousRounds;
    expect(previous).toHaveLength(1);
    expect(previous[0].askedAt).toBeInstanceOf(Date);
    expect(previous[0].answers).toEqual([{ questionId: 'reddito', value: 'si' }]);

    await readSse(await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'interview', answers: ANSWERS, interview: EMPTY_INTERVIEW, revision: { requests: '  niente ornitorinchi ' } })));
    expect(interviewMock.mock.calls[1][0]).toMatchObject({ previousRounds: [], revision: { requests: 'niente ornitorinchi' } });
  });

  it('refuses, with 400 and no model call, a round without answers or interview, a skipped interview, a third-round-plus and a revision round after one', async () => {
    const run = (body: Record<string, unknown>) => runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'interview', ...body }));
    expect((await run({ interview: EMPTY_INTERVIEW })).status).toBe(400);
    expect((await run({ answers: ANSWERS })).status).toBe(400);
    expect((await run({ answers: ANSWERS, interview: { rounds: 'no', skipped: false } })).status).toBe(400);
    const skipped = await run({ answers: ANSWERS, interview: { rounds: [], skipped: true } });
    expect(skipped.status).toBe(400);
    expect(await skipped.json()).toEqual({ error: 'Il colloquio è stato saltato.' });
    const three = await run({ answers: ANSWERS, interview: { rounds: [storedRound(), storedRound(), storedRound()], skipped: false } });
    expect(three.status).toBe(400);
    expect(await three.json()).toEqual({ error: 'Il colloquio ha già tre tornate: avvia la ricerca.' });
    const second = await run({ answers: ANSWERS, interview: { rounds: [storedRound()], skipped: false }, revision: { requests: 'niente ornitorinchi' } });
    expect(second.status).toBe(400);
    expect(await second.json()).toEqual({ error: "Prima della revisione c'è una sola tornata di domande." });
    expect((await run({ answers: ANSWERS, interview: EMPTY_INTERVIEW, revision: { requests: '' } })).status).toBe(400);
    expect(interviewMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
    // A 400 costs no slot.
    expect(rateLimitMock).not.toHaveBeenCalled();
  });

  it('streams the interview failure as an error event and a 429 when the twelve slots are gone', async () => {
    interviewMock.mockRejectedValue(new AllocationAdviceStageError('interview', 'Il modello non ha prodotto domande leggibili. Riprova.', true));
    const events = await readSse(await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'interview', answers: ANSWERS, interview: EMPTY_INTERVIEW })));
    expect(events).toEqual([{ type: 'error', error: 'Il modello non ha prodotto domande leggibili. Riprova.', retryable: true }]);
    rateLimitMock.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 60 } as never);
    const limited = await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'interview', answers: ANSWERS, interview: EMPTY_INTERVIEW }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('60');
    expect(interviewMock).toHaveBeenCalledTimes(1);
  });

  it('the strategy and the revise carry the interview to the stage runner; a revise with two rounds is refused', async () => {
    runMock.mockResolvedValue({ userId: 'user-1', status: 'ready' });
    const interview = { rounds: [storedRound()], skipped: false };
    await readSse(await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'strategy', answers: ANSWERS, interview })));
    expect(runMock.mock.calls[0][0]).toMatchObject({ stage: 'strategy', interview: { skipped: false } });
    expect(runMock.mock.calls[0][0].interview.rounds[0].askedAt).toBeInstanceOf(Date);
    await readSse(await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'revise', request: 'niente ornitorinchi', interview: { rounds: [], skipped: true } })));
    expect(runMock.mock.calls[1][0]).toMatchObject({ stage: 'revise', request: 'niente ornitorinchi', interview: { rounds: [], skipped: true } });
    // An older client, no interview key: null, as before.
    await readSse(await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', answers: ANSWERS })));
    expect(runMock.mock.calls[2][0]).toMatchObject({ stage: 'strategy', interview: null });
    const two = await runRoute(post('http://localhost/api/allocation-advice/run', { userId: 'user-1', stage: 'revise', request: 'x', interview: { rounds: [storedRound(), storedRound()], skipped: false } }));
    expect(two.status).toBe(400);
    expect(runMock).toHaveBeenCalledTimes(3);
  });
});

describe('POST /api/allocation-advice/applied', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-1' });
    accountAccessDocGetMock.mockResolvedValue({ exists: false, data: () => undefined });
    patchAdviceMock.mockResolvedValue(undefined);
  });

  const applied = { targetsWritten: true, rolesChanged: 1, goalsWritten: 2 };

  it('refuses a bad body and a document with no report', async () => {
    expect((await appliedRoute(post('http://localhost/api/allocation-advice/applied', { userId: 'user-1', applied: { targetsWritten: 'yes' } }))).status).toBe(400);
    getAdviceMock.mockResolvedValue(null);
    expect((await appliedRoute(post('http://localhost/api/allocation-advice/applied', { userId: 'user-1', applied }))).status).toBe(409);
    expect(patchAdviceMock).not.toHaveBeenCalled();
  });

  it('marks the document applied with what was written', async () => {
    getAdviceMock.mockResolvedValue({ userId: 'user-1', status: 'ready', report: { markdown: 'x', proposal: null } });
    const response = await appliedRoute(post('http://localhost/api/allocation-advice/applied', { userId: 'user-1', applied }));
    expect(response.status).toBe(200);
    expect(patchAdviceMock).toHaveBeenCalledWith('user-1', { status: 'applied', applied: expect.objectContaining({ ...applied, at: expect.any(Date) }) });
  });
});
