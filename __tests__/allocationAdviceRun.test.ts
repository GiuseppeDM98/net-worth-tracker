/**
 * The Consulente's run (lib/server/allocationAdvice/run.ts): the three model calls in order
 * with their models, efforts, tools and answer formats, the document persisted after every
 * stage, a proposal the schema refuses that fails the strategy, a `max_tokens` cut said in the
 * product's words, the review's proposal falling back to the strategy's, a paused turn resumed.
 * The SDK is answered by hand-written final messages (`beta.messages.stream(...).finalMessage()`).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import type { AllocationAdviceAnswers } from '@/lib/utils/allocationAdviceProposal';

let firstWrite: unknown = null;
const { setMock, patchMock, getMock, ytdMock, cashflowMock, profilesMock, archiveMock, historyMock } = vi.hoisted(() => ({
  setMock: vi.fn(),
  patchMock: vi.fn(),
  getMock: vi.fn(),
  ytdMock: vi.fn(),
  cashflowMock: vi.fn(),
  profilesMock: vi.fn(),
  archiveMock: vi.fn(),
  historyMock: vi.fn(),
}));
const EMPTY_CASHFLOW_INPUTS = { expenses: [], todayIso: '2026-10-20', categories: [], assets: [], settings: null, assetValueOf: () => 0 };

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/server/allocationAdvice/store', () => ({
  setAllocationAdviceAdmin: setMock,
  patchAllocationAdviceAdmin: patchMock,
  getAllocationAdviceAdmin: getMock,
  archiveAllocationAdviceAdmin: archiveMock,
  listAllocationAdviceHistoryAdmin: historyMock,
}));
vi.mock('@/lib/services/assistantMonthContextService', () => ({ buildAssistantYtdContext: ytdMock, fetchCashflowBlockInputs: cashflowMock }));
vi.mock('@/lib/server/exposure/instrumentProfileService', () => ({ resolveInstrumentProfiles: profilesMock }));
// Partial: the strategy prints the cashflow block through the real `formatCashflowBlockSection`.
vi.mock('@/lib/server/assistant/prompts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/assistant/prompts')>()),
  formatBundleForPrompt: () => 'DATI',
  formatPortfolioForPrompt: () => ['STRUMENTI'],
}));

import {
  runAllocationAdvice,
  runAllocationAdviceStage,
  runInterviewRound,
  AllocationAdviceStageError,
  ALLOCATION_ADVICE_INTERVIEW_MAX_TOKENS,
  ALLOCATION_ADVICE_MAX_CONTINUATIONS,
  ALLOCATION_ADVICE_MAX_TOKENS,
} from '@/lib/server/allocationAdvice/run';
import type { AllocationAdviceDocument, AllocationAdviceInterview, AllocationAdviceInterviewRound } from '@/types/allocationAdvice';
import {
  ALLOCATION_ADVICE_INSTRUMENTS_EFFORT,
  ALLOCATION_ADVICE_INSTRUMENTS_MODEL,
  ALLOCATION_ADVICE_STRATEGY_EFFORT,
  ALLOCATION_ADVICE_STRATEGY_MODEL,
} from '@/lib/constants/aiModels';

const ANSWERS: AllocationAdviceAnswers = {
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

const PROPOSAL = {
  summary: 'Strategia.',
  classes: [
    { assetClass: 'equity', targetPercentage: 60, rationale: '', subTargets: [] },
    { assetClass: 'bonds', targetPercentage: 40, rationale: '', subTargets: [] },
  ],
  assetRoles: [],
  goals: [],
  reviewByIso: '2028-10-20',
  reviewReason: '',
  risks: [],
};

/** A model's final message, as the SDK's stream accumulator hands it back. */
function message(text: string, stopReason = 'end_turn', model = 'answered-model', webSearch = false, extra: unknown[] = []) {
  return {
    model,
    stop_reason: stopReason,
    content: [
      ...(webSearch ? [{ type: 'server_tool_use', id: 't', name: 'web_search', input: {} }] : []),
      ...extra,
      ...(text ? [{ type: 'text', text, citations: null }] : []),
    ],
  };
}

const strategyText = (proposal: unknown) => JSON.stringify({ markdown: '# La situazione\nTesto strategia.', proposal });
const instrumentsText = '- All World: trovato.\n\n```instrument-candidates\n{"sleeves": [{"assetClass": "equity", "subTarget": "All World", "candidates": [{"name": "ETF Mondo", "exchange": "Borsa Italiana", "note": "ok"}]}]}\n```';
const reviewText = (proposal: unknown) => JSON.stringify({ markdown: '# In una frase\nReport.', proposal });

/** Answers each `beta.messages.stream` call, in order, with one final message. */
function answerWith(...messages: unknown[]) {
  const spy = vi.spyOn(Anthropic.Beta.Messages.prototype, 'stream');
  for (const m of messages) spy.mockReturnValueOnce({ finalMessage: async () => m } as never);
  return spy;
}

type Params = Record<string, unknown> & { output_config: { effort: string; format?: { type: string; schema: Record<string, unknown> } } };

const NOW = new Date('2026-10-20T10:00:00.000Z');
/** A portfolio with nothing in it: the OBBLIGAZIONI block says so and no profile is asked. */
const EMPTY_PORTFOLIO = { holdings: [], dividends: { coupons: [] } };
const afterStrategy = (): AllocationAdviceDocument => ({
  userId: 'u1',
  status: 'running',
  answers: ANSWERS,
  stage: 'strategy',
  createdAt: NOW,
  updatedAt: NOW,
  startedAt: NOW,
  strategy: { markdown: '# La situazione\nTesto strategia.', proposal: PROPOSAL as never, model: 'opus', finishedAt: NOW },
  instruments: null,
  report: null,
  error: null,
  applied: null,
  interview: null,
});
const userTurn = (call: unknown[]) => String((call[0] as { messages: { content: string }[] }).messages[0].content);

describe('runAllocationAdvice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    // The run mutates ONE document object as it goes: the mock keeps a copy of what it was handed.
    setMock.mockImplementation(async (document: unknown) => { firstWrite = structuredClone(document); });
    patchMock.mockResolvedValue(undefined);
    archiveMock.mockResolvedValue(undefined);
    historyMock.mockResolvedValue([]);
    ytdMock.mockResolvedValue({ portfolio: EMPTY_PORTFOLIO });
    cashflowMock.mockResolvedValue(EMPTY_CASHFLOW_INPUTS);
  });

  it('runs the three stages in order, on their models, efforts and formats, with web search only for the instruments, and persists each', async () => {
    const reviewed = { ...PROPOSAL, summary: 'Rivista.' };
    const calls = answerWith(message(strategyText(PROPOSAL), 'end_turn', 'opus'), message(instrumentsText, 'end_turn', 'sonnet', true), message(reviewText(reviewed), 'end_turn', 'opus'));
    const stages: string[] = [];

    const document = await runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: (stage) => stages.push(stage), now: new Date('2026-10-20T10:00:00.000Z') });

    expect(stages).toEqual(['context', 'strategy', 'instruments', 'review']);
    expect(calls).toHaveBeenCalledTimes(3);
    const [strategyCall, instrumentsCall, reviewCall] = calls.mock.calls.map((call) => call[0] as unknown as Params);
    expect(strategyCall.model).toBe(ALLOCATION_ADVICE_STRATEGY_MODEL);
    expect(strategyCall.max_tokens).toBe(ALLOCATION_ADVICE_MAX_TOKENS);
    expect(strategyCall.tools).toBeUndefined();
    expect(strategyCall.fallbacks).toBe('default');
    expect(strategyCall.output_config.effort).toBe(ALLOCATION_ADVICE_STRATEGY_EFFORT);
    // The strategy and the review answer as a structured output; the search cannot (citations).
    expect(strategyCall.output_config.format?.type).toBe('json_schema');
    expect(Object.keys(strategyCall.output_config.format?.schema.properties as object)).toEqual(['markdown', 'proposal']);
    expect(instrumentsCall.model).toBe(ALLOCATION_ADVICE_INSTRUMENTS_MODEL);
    expect((instrumentsCall.tools as { type: string }[])[0].type).toBe('web_search_20260209');
    expect(instrumentsCall.output_config.effort).toBe(ALLOCATION_ADVICE_INSTRUMENTS_EFFORT);
    expect(instrumentsCall.output_config.format).toBeUndefined();
    expect(reviewCall.model).toBe(ALLOCATION_ADVICE_STRATEGY_MODEL);
    expect(reviewCall.tools).toBeUndefined();
    expect(reviewCall.output_config.format?.type).toBe('json_schema');

    expect(document.status).toBe('ready');
    expect(document.strategy?.proposal?.summary).toBe('Strategia.');
    expect(document.strategy?.markdown).toBe('# La situazione\nTesto strategia.');
    expect(document.strategy?.model).toBe('opus');
    expect(document.instruments?.webSearchUsed).toBe(true);
    expect(document.instruments?.candidates?.sleeves[0].candidates[0].name).toBe('ETF Mondo');
    expect(document.report?.proposal?.summary).toBe('Rivista.');
    expect(document.report?.markdown).toBe('# In una frase\nReport.');

    // Persisted whole at the start, then stage by stage.
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(firstWrite).toMatchObject({ userId: 'u1', status: 'running', stage: 'context' });
    const patches = patchMock.mock.calls.map((call) => call[1] as Record<string, unknown>);
    expect(patches.map((patch) => Object.keys(patch)[0])).toEqual(['stage', 'strategy', 'stage', 'instruments', 'stage', 'report']);
    expect(patches[5]).toMatchObject({ status: 'ready' });
  });

  it("keeps the strategy's proposal when the review's breaks a sum, and its markdown", async () => {
    const broken = { ...PROPOSAL, summary: 'Rotta.', classes: [{ ...PROPOSAL.classes[0], targetPercentage: 50 }, PROPOSAL.classes[1]] };
    answerWith(message(strategyText(PROPOSAL)), message(instrumentsText), message(reviewText(broken)));
    const document = await runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: vi.fn() });
    expect(document.report?.proposal?.summary).toBe('Strategia.');
    expect(document.report?.markdown).toBe('# In una frase\nReport.');
  });

  it('fails the run when the strategy answers no readable proposal, and persists the failure', async () => {
    answerWith(message('Solo testo.'));
    await expect(runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: vi.fn() })).rejects.toMatchObject({ stage: 'strategy', retryable: true });
    const last = patchMock.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(last).toMatchObject({ status: 'failed', stage: 'strategy' });
    expect(String(last.error)).toMatch(/proposta leggibile/);
  });

  it('fails the strategy on a proposal whose classes do not sum to 100 (a bound the API does not enforce)', async () => {
    answerWith(message(strategyText({ ...PROPOSAL, classes: [PROPOSAL.classes[0]] })));
    await expect(runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: vi.fn() })).rejects.toMatchObject({ stage: 'strategy', retryable: true, message: expect.stringMatching(/proposta leggibile/) });
  });

  it("says a max_tokens cut and a refusal in the product's words", async () => {
    answerWith(message(strategyText(PROPOSAL), 'max_tokens'));
    await expect(runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: vi.fn() })).rejects.toSatisfy(
      (error: unknown) => error instanceof AllocationAdviceStageError && /limite di lunghezza/.test(error.message) && error.retryable
    );
    vi.restoreAllMocks();
    answerWith(message('', 'refusal'));
    await expect(runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: vi.fn() })).rejects.toSatisfy(
      (error: unknown) => error instanceof AllocationAdviceStageError && /rifiutato/.test(error.message) && !error.retryable
    );
  });

  it("maps an overload to a retryable failure in the product's words", async () => {
    const envelope = { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } };
    const overloaded = Anthropic.APIError.generate(529, envelope, 'Overloaded', new Headers());
    vi.spyOn(Anthropic.Beta.Messages.prototype, 'stream').mockReturnValueOnce({ finalMessage: () => Promise.reject(overloaded) } as never);
    await expect(runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: vi.fn() })).rejects.toMatchObject({ stage: 'strategy', retryable: true, message: expect.stringMatching(/sovraccarichi/) });
  });

  it('names the model the final message names, after a mid-stream fallback (2026-10-23)', async () => {
    const fallback = { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-5' } };
    answerWith(message(strategyText(PROPOSAL), 'end_turn', 'claude-opus-5', false, [fallback]));
    const document = await runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', answers: ANSWERS, onStage: vi.fn() });
    expect(document.strategy?.model).toBe('claude-opus-5');
  });
});

// ── One request per stage (Vercel Hobby's 300 s ceiling, 2026-10-20) ─────────────────────
describe('runAllocationAdviceStage', () => {

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    setMock.mockResolvedValue(undefined);
    patchMock.mockResolvedValue(undefined);
    archiveMock.mockResolvedValue(undefined);
    historyMock.mockResolvedValue([]);
    ytdMock.mockResolvedValue({ portfolio: EMPTY_PORTFOLIO });
    cashflowMock.mockResolvedValue(EMPTY_CASHFLOW_INPUTS);
  });

  it('the strategy creates the document and stops there; the instruments continue the persisted one from the store', async () => {
    const calls = answerWith(message(strategyText(PROPOSAL), 'end_turn', 'opus'), message(instrumentsText, 'end_turn', 'sonnet', true));
    const stages: string[] = [];

    const first = await runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', answers: ANSWERS, onStage: (stage) => stages.push(stage), now: NOW });
    expect(stages).toEqual(['context', 'strategy']);
    expect(first.status).toBe('running');
    expect(first.strategy?.proposal?.summary).toBe('Strategia.');
    expect(first.instruments).toBeNull();
    expect(calls).toHaveBeenCalledTimes(1);

    getMock.mockResolvedValue(afterStrategy());
    const second = await runAllocationAdviceStage({ userId: 'u1', stage: 'instruments', onStage: (stage) => stages.push(stage) });
    expect(stages).toEqual(['context', 'strategy', 'instruments']);
    expect(getMock).toHaveBeenCalledWith('u1');
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(second.instruments?.candidates?.sleeves[0].candidates[0].name).toBe('ETF Mondo');
    // The stage is written before the model is called, with the run back to running.
    const entered = patchMock.mock.calls.map((call) => call[1] as Record<string, unknown>).find((patch) => patch.stage === 'instruments');
    expect(entered).toMatchObject({ stage: 'instruments', status: 'running', error: null });
  });

  it('the instruments resume a paused turn: the paused answer goes back as the assistant message, the texts are joined (2026-10-23)', async () => {
    const paused = message('- All World: ', 'pause_turn', 'sonnet', true);
    const calls = answerWith(paused, message('trovato.\n\n' + instrumentsText.split('\n\n')[1], 'end_turn', 'sonnet'));

    const document = await runAllocationAdviceStage({ userId: 'u1', stage: 'instruments', document: afterStrategy(), onStage: vi.fn() });

    expect(calls).toHaveBeenCalledTimes(2);
    const [first, second] = calls.mock.calls.map((call) => (call[0] as unknown as { messages: { role: string; content: unknown }[] }).messages);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
    expect(second[1]).toEqual({ role: 'assistant', content: paused.content });
    expect(document.instruments?.markdown).toBe('- All World: trovato.');
    expect(document.instruments?.webSearchUsed).toBe(true);
    expect(document.instruments?.candidates?.sleeves[0].candidates[0].name).toBe('ETF Mondo');
  });

  it(`fails a stage still paused after ${ALLOCATION_ADVICE_MAX_CONTINUATIONS} resumptions, retryable`, async () => {
    const calls = answerWith(...Array.from({ length: ALLOCATION_ADVICE_MAX_CONTINUATIONS + 1 }, () => message('ancora…', 'pause_turn', 'sonnet', true)));
    await expect(runAllocationAdviceStage({ userId: 'u1', stage: 'instruments', document: afterStrategy(), onStage: vi.fn() })).rejects.toMatchObject({
      stage: 'instruments',
      retryable: true,
      message: expect.stringMatching(/interrotta/),
    });
    expect(calls).toHaveBeenCalledTimes(ALLOCATION_ADVICE_MAX_CONTINUATIONS + 1);
  });

  it('the review reads the strategy and the instruments with their blocks put back, and closes the run', async () => {
    const calls = answerWith(message(reviewText({ ...PROPOSAL, summary: 'Rivista.' })));
    const document = afterStrategy();
    document.instruments = { markdown: '- All World: trovato.', candidates: { sleeves: [{ assetClass: 'equity', subTarget: 'All World', candidates: [{ name: 'ETF Mondo', exchange: 'Borsa Italiana', note: 'ok' }] }] } as never, model: 'sonnet', webSearchUsed: true, finishedAt: NOW };

    const closed = await runAllocationAdviceStage({ userId: 'u1', stage: 'review', document, onStage: vi.fn() });

    expect(closed.status).toBe('ready');
    expect(closed.report?.proposal?.summary).toBe('Rivista.');
    const userContent = String((calls.mock.calls[0][0] as unknown as { messages: { content: string }[] }).messages[0].content);
    expect(userContent).toContain('```allocation-proposal');
    expect(userContent).toContain('"summary":"Strategia."');
    expect(userContent).toContain('```instrument-candidates');
    expect(getMock).not.toHaveBeenCalled();
  });

  it('the strategy reads the plan in force from the last document before replacing it (2026-10-20)', async () => {
    const calls = answerWith(message(strategyText(PROPOSAL), 'end_turn', 'opus'));
    const last = afterStrategy();
    last.status = 'applied';
    last.report = { markdown: '# Report\nIl piano di prima.', proposal: PROPOSAL as never, model: 'opus', finishedAt: NOW };
    last.applied = { at: NOW, targetsWritten: true, rolesChanged: 0, goalsWritten: 0 };
    last.revisions = [{ request: 'meno cripto', at: NOW }];
    getMock.mockResolvedValue(last);

    const next = await runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', answers: ANSWERS, onStage: vi.fn(), now: NOW });

    expect(getMock).toHaveBeenCalledWith('u1');
    const userContent = String((calls.mock.calls[0][0] as unknown as { messages: { content: string }[] }).messages[0].content);
    expect(userContent).toContain('--- IL PIANO IN VIGORE E IL PERCHÉ (il report del percorso precedente, del 2026-10-20; applicato alle impostazioni il 2026-10-20; da rivedere entro il 2028-10-20) ---\n# Report\nIl piano di prima.');
    expect(userContent).toContain('1. meno cripto');
    // The new document starts clean: the old report is the prompt's, not the document's.
    expect(next.report).toBeNull();
    expect(next.revisions).toBeUndefined();
  });

  it('revise: the review again on a finished report, the request kept on the document (2026-10-20)', async () => {
    const calls = answerWith(message(reviewText({ ...PROPOSAL, summary: 'Rivista su richiesta.' })));
    const document = afterStrategy();
    document.instruments = { markdown: '- trovato.', candidates: null, model: 'sonnet', webSearchUsed: true, finishedAt: NOW };
    document.report = { markdown: '# Report\nPrima versione.', proposal: PROPOSAL as never, model: 'opus', finishedAt: NOW };
    document.status = 'applied';
    document.revisions = [{ request: 'meno cripto', at: NOW }];

    const revised = await runAllocationAdviceStage({ userId: 'u1', stage: 'revise', document, request: 'solo bond singoli', onStage: vi.fn() });

    expect(revised.status).toBe('ready');
    expect(revised.report?.proposal?.summary).toBe('Rivista su richiesta.');
    expect(revised.report?.markdown).toBe('# In una frase\nReport.');
    expect(revised.revisions?.map((row) => row.request)).toEqual(['meno cripto', 'solo bond singoli']);
    const params = calls.mock.calls[0][0] as unknown as Params & { messages: { content: string }[] };
    expect(params.output_config.format?.type).toBe('json_schema');
    const userContent = String(params.messages[0].content);
    expect(userContent).toContain('Prima versione.');
    expect(userContent).toContain('1. meno cripto\n2. solo bond singoli');
    expect(patchMock.mock.calls.at(-1)?.[1]).toMatchObject({ status: 'ready', revisions: [expect.objectContaining({ request: 'meno cripto' }), expect.objectContaining({ request: 'solo bond singoli' })] });
  });

  it('revise refuses a document with no report, and an empty request, without calling a model', async () => {
    const calls = vi.spyOn(Anthropic.Beta.Messages.prototype, 'stream');
    await expect(runAllocationAdviceStage({ userId: 'u1', stage: 'revise', document: afterStrategy(), request: 'x', onStage: vi.fn() })).rejects.toMatchObject({ stage: 'review', retryable: false, message: expect.stringMatching(/report finito/) });
    const withReport = { ...afterStrategy(), instruments: { markdown: '', candidates: null, model: 's', webSearchUsed: false, finishedAt: NOW }, report: { markdown: 'r', proposal: PROPOSAL as never, model: 'o', finishedAt: NOW } };
    await expect(runAllocationAdviceStage({ userId: 'u1', stage: 'revise', document: withReport, onStage: vi.fn() })).rejects.toMatchObject({ stage: 'review', retryable: false });
    expect(calls).not.toHaveBeenCalled();
  });

  it("refuses to continue what is not there, in the product's words, without calling a model", async () => {
    const calls = vi.spyOn(Anthropic.Beta.Messages.prototype, 'stream');
    getMock.mockResolvedValue(null);
    await expect(runAllocationAdviceStage({ userId: 'u1', stage: 'instruments', onStage: vi.fn() })).rejects.toMatchObject({ stage: 'instruments', retryable: false, message: expect.stringMatching(/Non trovo il percorso/) });

    const noStrategy = { ...afterStrategy(), strategy: null };
    await expect(runAllocationAdviceStage({ userId: 'u1', stage: 'instruments', document: noStrategy, onStage: vi.fn() })).rejects.toMatchObject({ stage: 'instruments', retryable: false });
    expect(patchMock.mock.calls.at(-1)?.[1]).toMatchObject({ status: 'failed', stage: 'instruments' });

    await expect(runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', onStage: vi.fn() })).rejects.toMatchObject({ stage: 'strategy', retryable: false });
    expect(calls).not.toHaveBeenCalled();
  });
  // ── The CASHFLOW 12 MESI block (2026-11): read once per strategy, never by the later stages ──

  it('a whole run reads the cashflow block ONCE, with the owner and the run clock, and only the strategy carries it', async () => {
    const calls = answerWith(message(strategyText(PROPOSAL), 'end_turn', 'opus'), message(instrumentsText, 'end_turn', 'sonnet', true), message(reviewText(PROPOSAL), 'end_turn', 'opus'));
    await runAllocationAdvice({ userId: 'u1', answers: ANSWERS, onStage: vi.fn(), now: NOW });
    expect(cashflowMock).toHaveBeenCalledTimes(1);
    expect(cashflowMock).toHaveBeenCalledWith('u1', NOW);
    const [strategy, instruments, review] = calls.mock.calls.map(userTurn);
    expect(strategy).toContain('--- CASHFLOW 12 MESI (');
    expect(strategy).toContain('FAMIGLIA, OBBLIGAZIONI e CASHFLOW 12 MESI sono esaustivi');
    expect(instruments).not.toContain('CASHFLOW 12 MESI');
    expect(review).not.toContain('CASHFLOW 12 MESI');
  });

  it('the instruments, the review and a revision never read the cashflow block', async () => {
    answerWith(message(instrumentsText, 'end_turn', 'sonnet', true));
    await runAllocationAdviceStage({ userId: 'u1', stage: 'instruments', document: afterStrategy(), onStage: vi.fn() });
    const withInstruments = { ...afterStrategy(), instruments: { markdown: '- trovato.', candidates: null, model: 'sonnet', webSearchUsed: true, finishedAt: NOW } };
    answerWith(message(reviewText(PROPOSAL)));
    await runAllocationAdviceStage({ userId: 'u1', stage: 'review', document: structuredClone(withInstruments), onStage: vi.fn() });
    answerWith(message(reviewText(PROPOSAL)));
    const withReport = { ...structuredClone(withInstruments), report: { markdown: 'r', proposal: PROPOSAL as never, model: 'o', finishedAt: NOW } };
    await runAllocationAdviceStage({ userId: 'u1', stage: 'revise', document: withReport, request: 'meno cripto', onStage: vi.fn() });
    expect(cashflowMock).not.toHaveBeenCalled();
  });

  it('a failed cashflow read fails the strategy at the context, retryable, and calls no model (never a silent empty block)', async () => {
    cashflowMock.mockRejectedValue(new Error('read failed'));
    const calls = vi.spyOn(Anthropic.Beta.Messages.prototype, 'stream');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', answers: ANSWERS, onStage: vi.fn(), now: NOW })).rejects.toMatchObject({
      stage: 'context',
      retryable: true,
      message: 'Il percorso si è interrotto per un errore imprevisto. Riprova fra qualche istante.',
    });
    expect(calls).not.toHaveBeenCalled();
    expect(patchMock.mock.calls.at(-1)?.[1]).toMatchObject({ status: 'failed', stage: 'context' });
  });
});

// ── The interview round (2026-11-08: no write, the format, the revision mode) ──────────────
const QUESTION = (id: string, kind: 'single' | 'multiple' = 'single') => ({ id, kind, text: `Domanda ${id}?`, why: "copre l'86% delle entrate", options: [{ value: 'si', label: 'Sì' }, { value: 'no', label: 'No' }], allowOther: false });
const roundText = (questions: unknown[], note = 'Vedo un reddito concentrato.', satisfied = false) => JSON.stringify({ note, satisfied, questions });
const ROUND: AllocationAdviceInterviewRound = { note: 'Vedo un reddito concentrato.', satisfied: false, questions: [{ ...QUESTION('reddito'), allowOther: true }], answers: [{ questionId: 'reddito', value: 'si' }], model: 'opus-finto', askedAt: NOW };
const ONE_ROUND: AllocationAdviceInterview = { rounds: [ROUND], skipped: false };

describe('runInterviewRound', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    setMock.mockResolvedValue(undefined);
    patchMock.mockResolvedValue(undefined);
    archiveMock.mockResolvedValue(undefined);
    historyMock.mockResolvedValue([]);
    getMock.mockResolvedValue(null);
    ytdMock.mockResolvedValue({ portfolio: EMPTY_PORTFOLIO });
    cashflowMock.mockResolvedValue(EMPTY_CASHFLOW_INPUTS);
  });

  it('calls the strategy model ONCE with its effort, the interview budget and the round\'s schema, writes nothing, and hands the round on', async () => {
    const calls = answerWith(message(roundText([{ ...QUESTION('reddito'), allowOther: false }]), 'end_turn', 'opus-finto'));
    const onRound = vi.fn();
    await runInterviewRound({ userId: 'u1', answers: ANSWERS, previousRounds: [], onRound, now: NOW });
    expect(calls).toHaveBeenCalledTimes(1);
    const params = calls.mock.calls[0][0] as unknown as Params & { max_tokens: number; model: string; messages: { content: string }[] };
    expect(params.model).toBe(ALLOCATION_ADVICE_STRATEGY_MODEL);
    expect(params.output_config.effort).toBe(ALLOCATION_ADVICE_STRATEGY_EFFORT);
    expect(params.max_tokens).toBe(ALLOCATION_ADVICE_INTERVIEW_MAX_TOKENS);
    expect(params.output_config.format?.type).toBe('json_schema');
    expect(Object.keys((params.output_config.format?.schema as { properties: Record<string, unknown> }).properties)).toEqual(['note', 'satisfied', 'questions']);
    expect(params).not.toHaveProperty('tools');
    const userContent = String(params.messages[0].content);
    expect(userContent).toContain('--- RISPOSTE DEL PERCORSO ---');
    expect(userContent).toContain('DATI');
    expect(userContent).toContain('--- CASHFLOW 12 MESI (');
    expect(userContent).toContain('Questa è la tornata 1 di 3.');
    expect(cashflowMock).toHaveBeenCalledWith('u1', NOW);
    // The store read once; the round, with the model that answered and a clock; allowOther forced on.
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(onRound).toHaveBeenCalledTimes(1);
    const round = onRound.mock.calls[0][0];
    expect(round).toMatchObject({ note: 'Vedo un reddito concentrato.', satisfied: false, model: 'opus-finto' });
    expect(round.questions[0].allowOther).toBe(true);
    expect(round.askedAt).toBeInstanceOf(Date);
    // Never a write: the rounds live in the browser until the strategy's body carries them.
    expect(setMock).not.toHaveBeenCalled();
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('prints the previous rounds and the plan in force, and numbers the round after them', async () => {
    getMock.mockResolvedValue({ ...afterStrategy(), status: 'ready', report: { markdown: '# Report\nIl piano di prima.', proposal: PROPOSAL as never, model: 'o', finishedAt: NOW } });
    const calls = answerWith(message(roundText([], 'Basta così.', true)));
    const onRound = vi.fn();
    await runInterviewRound({ userId: 'u1', answers: ANSWERS, previousRounds: [ROUND], onRound, now: NOW });
    const userContent = String((calls.mock.calls[0][0] as unknown as { messages: { content: string }[] }).messages[0].content);
    expect(userContent).toContain('--- IL PIANO IN VIGORE E IL PERCHÉ');
    expect(userContent).toContain('--- LE TORNATE PRECEDENTI ---\nTornata 1 — nota del Consulente: «Vedo un reddito concentrato.»');
    expect(userContent).toContain('- Domanda reddito? (perché: copre l\'86% delle entrate) → Sì');
    expect(userContent).toContain('Questa è la tornata 2 di 3.');
    expect(onRound.mock.calls[0][0]).toMatchObject({ note: 'Basta così.', satisfied: true, questions: [] });
    expect(setMock).not.toHaveBeenCalled();
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('keeps four of five questions and logs the fifth; a text that is not a round fails the interview, retryable, with no write', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    answerWith(message(roundText([QUESTION('a'), QUESTION('b'), QUESTION('c'), QUESTION('d'), QUESTION('e')])));
    const onRound = vi.fn();
    await runInterviewRound({ userId: 'u1', answers: ANSWERS, previousRounds: [], onRound });
    expect(onRound.mock.calls[0][0].questions.map((q: { id: string }) => q.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(warn).toHaveBeenCalledWith('[consulente] interview question refused', expect.stringContaining('domanda 4 (e)'));

    answerWith(message('Non ho domande.'));
    await expect(runInterviewRound({ userId: 'u1', answers: ANSWERS, previousRounds: [], onRound: vi.fn() })).rejects.toMatchObject({ stage: 'interview', retryable: true, message: 'Il modello non ha prodotto domande leggibili. Riprova.' });
    expect(setMock).not.toHaveBeenCalled();
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('a max_tokens cut and a refusal are said in the product\'s words, on the interview stage', async () => {
    answerWith(message(roundText([]), 'max_tokens'));
    const cut = await runInterviewRound({ userId: 'u1', answers: ANSWERS, previousRounds: [], onRound: vi.fn() }).catch((error: unknown) => error);
    expect(cut).toBeInstanceOf(AllocationAdviceStageError);
    expect(cut).toMatchObject({ stage: 'interview', retryable: true, message: expect.stringMatching(/limite di lunghezza/) });
    // A failed round still writes nothing: the document is the strategy's alone.
    expect(setMock).not.toHaveBeenCalled();
    expect(patchMock).not.toHaveBeenCalled();
    answerWith(message('', 'refusal'));
    await expect(runInterviewRound({ userId: 'u1', answers: ANSWERS, previousRounds: [], onRound: vi.fn() })).rejects.toMatchObject({ stage: 'interview', retryable: false });
  });

  it('a failed context read fails the round at the interview stage without a model call', async () => {
    cashflowMock.mockRejectedValue(new Error('read failed'));
    const calls = vi.spyOn(Anthropic.Beta.Messages.prototype, 'stream');
    await expect(runInterviewRound({ userId: 'u1', answers: ANSWERS, previousRounds: [], onRound: vi.fn() })).rejects.toThrow('read failed');
    expect(calls).not.toHaveBeenCalled();
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('in revision mode needs a finished report, prints it with every request numbered and no plan in force (decision 24)', async () => {
    const calls = vi.spyOn(Anthropic.Beta.Messages.prototype, 'stream');
    await expect(runInterviewRound({ userId: 'u1', answers: ANSWERS, previousRounds: [], revision: { requests: 'niente ornitorinchi' }, onRound: vi.fn() })).rejects.toMatchObject({ stage: 'interview', retryable: false, message: "Non c'è un report finito da rivedere. Avvia la ricerca." });
    getMock.mockResolvedValue(afterStrategy());
    await expect(runInterviewRound({ userId: 'u1', answers: ANSWERS, previousRounds: [], revision: { requests: 'niente ornitorinchi' }, onRound: vi.fn() })).rejects.toMatchObject({ stage: 'interview' });
    expect(calls).not.toHaveBeenCalled();

    getMock.mockResolvedValue({ ...afterStrategy(), status: 'ready', report: { markdown: '# Report\nIl piano di prima.', proposal: PROPOSAL as never, model: 'o', finishedAt: NOW }, revisions: [{ request: 'meno cripto', at: NOW }] });
    answerWith(message(roundText([QUESTION('cedere')])));
    const onRound = vi.fn();
    await runInterviewRound({ userId: 'u1', answers: ANSWERS, previousRounds: [], revision: { requests: 'niente ornitorinchi' }, onRound });
    const userContent = String((calls.mock.calls[0][0] as unknown as { messages: { content: string }[] }).messages[0].content);
    expect(userContent).toContain('--- IL REPORT DA RIVEDERE ---\n# Report\nIl piano di prima.');
    expect(userContent).toContain('```allocation-proposal');
    expect(userContent).toContain('1. meno cripto\n2. niente ornitorinchi');
    expect(userContent).toContain("Questa tornata riguarda SOLO l'ultima richiesta di modifica");
    expect(userContent).not.toContain('IL PIANO IN VIGORE');
    expect(userContent).not.toContain('Questa è la tornata');
    expect(onRound).toHaveBeenCalledTimes(1);
    expect(setMock).not.toHaveBeenCalled();
    expect(patchMock).not.toHaveBeenCalled();
  });
});

describe('the interview on the run (the IL COLLOQUIO block and the document, 2026-11-08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    setMock.mockImplementation(async (document: unknown) => { firstWrite = structuredClone(document); });
    patchMock.mockResolvedValue(undefined);
    archiveMock.mockResolvedValue(undefined);
    historyMock.mockResolvedValue([]);
    getMock.mockResolvedValue(null);
    ytdMock.mockResolvedValue({ portfolio: EMPTY_PORTFOLIO });
    cashflowMock.mockResolvedValue(EMPTY_CASHFLOW_INPUTS);
  });

  it('the strategy writes the interview on the new document and prints it; the review prints it too, the instruments never', async () => {
    const calls = answerWith(message(strategyText(PROPOSAL)));
    await runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', answers: ANSWERS, interview: ONE_ROUND, onStage: vi.fn(), now: NOW });
    expect(firstWrite).toMatchObject({ interview: { rounds: [expect.objectContaining({ note: 'Vedo un reddito concentrato.' })], skipped: false }, revisionInterview: null });
    const strategy = userTurn(calls.mock.calls[0]);
    expect(strategy).toContain('--- IL COLLOQUIO (1 tornata) ---');
    expect(strategy).toContain('→ Sì');
    expect(strategy).toContain('Tieni conto di queste risposte nella sezione «La situazione».');

    const document = { ...afterStrategy(), interview: ONE_ROUND };
    answerWith(message(instrumentsText, 'end_turn', 'sonnet', true));
    await runAllocationAdviceStage({ userId: 'u1', stage: 'instruments', document: structuredClone(document), onStage: vi.fn() });
    expect(userTurn(calls.mock.calls[1])).not.toContain('IL COLLOQUIO');

    const withInstruments = { ...document, instruments: { markdown: '- trovato.', candidates: null, model: 'sonnet', webSearchUsed: true, finishedAt: NOW } };
    answerWith(message(reviewText(PROPOSAL)));
    await runAllocationAdviceStage({ userId: 'u1', stage: 'review', document: structuredClone(withInstruments), onStage: vi.fn() });
    const review = userTurn(calls.mock.calls[2]);
    expect(review).toContain('--- IL COLLOQUIO (1 tornata) ---');
    expect(review).not.toContain('Tieni conto di queste risposte');
  });

  it('without an interview the strategy writes interview null and a skipped one prints the one sentence', async () => {
    const calls = answerWith(message(strategyText(PROPOSAL)));
    await runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', answers: ANSWERS, onStage: vi.fn(), now: NOW });
    expect(firstWrite).toMatchObject({ interview: null, revisionInterview: null });
    expect(userTurn(calls.mock.calls[0])).not.toContain('colloquio');
    answerWith(message(strategyText(PROPOSAL)));
    await runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', answers: ANSWERS, interview: { rounds: [], skipped: true }, onStage: vi.fn(), now: NOW });
    expect(userTurn(calls.mock.calls[1])).toContain("L'utente ha saltato il colloquio.");
    expect(firstWrite).toMatchObject({ interview: { rounds: [], skipped: true } });
  });

  it('the revision prints ITS round and patches revisionInterview; a skipped one is patched as such (decision 24)', async () => {
    const withReport = { ...afterStrategy(), instruments: { markdown: '', candidates: null, model: 's', webSearchUsed: false, finishedAt: NOW }, report: { markdown: 'Prima versione.', proposal: PROPOSAL as never, model: 'o', finishedAt: NOW } };
    const calls = answerWith(message(reviewText(PROPOSAL)));
    await runAllocationAdviceStage({ userId: 'u1', stage: 'revise', document: structuredClone(withReport), request: 'niente ornitorinchi', interview: ONE_ROUND, onStage: vi.fn() });
    const revision = userTurn(calls.mock.calls[0]);
    expect(revision).toContain("Prima di questa revisione il Consulente ha fatto una tornata di domande sull'ultima richiesta:");
    expect(revision).toContain('--- IL COLLOQUIO (1 tornata) ---');
    expect(revision).toContain("Applica l'ultima richiesta alla luce di queste risposte.");
    expect(patchMock.mock.calls.at(-1)?.[1]).toMatchObject({ status: 'ready', revisionInterview: { rounds: [expect.objectContaining({ note: 'Vedo un reddito concentrato.' })], skipped: false } });

    answerWith(message(reviewText(PROPOSAL)));
    await runAllocationAdviceStage({ userId: 'u1', stage: 'revise', document: structuredClone(withReport), request: 'meno cripto', interview: { rounds: [], skipped: true }, onStage: vi.fn() });
    expect(userTurn(calls.mock.calls[1])).not.toContain('Prima di questa revisione');
    expect(patchMock.mock.calls.at(-1)?.[1]).toMatchObject({ revisionInterview: { rounds: [], skipped: true } });
  });
});

// ── The OBBLIGAZIONI block (owner, 2026-11-08, after the interview's phase F on the mirror) ─────────────────────
describe('the bond block in the Consulente context', () => {
  const eur = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
  /** Only what the block reads: the formatters of the rest are mocked above. */
  const BOND_PORTFOLIO = {
    holdings: [
      { assetId: 'b1', name: 'ETF Bond Euro', ticker: 'BEUR', profileTicker: 'BEUR.MI', type: 'etf', assetClass: 'bonds', valueEur: 10000, role: 'tradable' },
      { assetId: 'b2', name: 'BTP Esempio 2030', type: 'bond', assetClass: 'bonds', valueEur: 5000, role: 'tradable', maturityIso: '2030-03-01' },
      { assetId: 'e1', name: 'ETF Mondo', ticker: 'MONDO.MI', profileTicker: 'MONDO.MI', type: 'etf', assetClass: 'equity', valueEur: 12000, role: 'tradable' },
    ],
    dividends: { coupons: [] },
  };
  const YAHOO = { response: { profiles: { 'BEUR.MI': { ticker: 'BEUR.MI', fund: { fetchedAt: '2026-11-01T10:00:00.000Z', schema: 2, holdingsBasis: 'fund', family: null, bond: { durationYears: 2.42, maturityYears: 9.807 } } } }, oldestFetchedAt: null } };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    setMock.mockResolvedValue(undefined);
    patchMock.mockResolvedValue(undefined);
    archiveMock.mockResolvedValue(undefined);
    historyMock.mockResolvedValue([]);
    getMock.mockResolvedValue(null);
    cashflowMock.mockResolvedValue(EMPTY_CASHFLOW_INPUTS);
  });

  it('with no bond in the portfolio the block says so, under the data, and no profile is asked', async () => {
    ytdMock.mockResolvedValue({ portfolio: EMPTY_PORTFOLIO });
    const calls = answerWith(message(roundText([], 'Nota.', true)));
    await runInterviewRound({ userId: 'u1', answers: ANSWERS, previousRounds: [], onRound: vi.fn(), now: NOW });
    expect(profilesMock).not.toHaveBeenCalled();
    expect(userTurn(calls.mock.calls[0])).toContain('DATI\n\n--- OBBLIGAZIONI: SCADENZE E DURATION ---\nNessun titolo né ETF obbligazionario in portafoglio.');
  });

  it("asks the profile cache for the bond ETFs only (module fund, raw ticker, the run clock) and prints Yahoo's duration to the strategy and the instruments alike", async () => {
    ytdMock.mockResolvedValue({ portfolio: BOND_PORTFOLIO });
    profilesMock.mockResolvedValue(YAHOO);
    const calls = answerWith(message(strategyText(PROPOSAL)), message(instrumentsText, 'end_turn', 'sonnet', true));
    const first = await runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', answers: ANSWERS, onStage: vi.fn(), now: NOW });
    await runAllocationAdviceStage({ userId: 'u1', stage: 'instruments', document: first, onStage: vi.fn(), now: NOW });

    expect(profilesMock).toHaveBeenCalledTimes(2);
    expect(profilesMock.mock.calls[0][0]).toEqual([{ ticker: 'BEUR.MI', module: 'fund' }]);
    expect(profilesMock.mock.calls[0][1]).toEqual({ now: NOW });
    expect(calls).toHaveBeenCalledTimes(2);
    for (const call of calls.mock.calls) {
      const turn = userTurn(call);
      expect(turn).toContain('--- OBBLIGAZIONI: SCADENZE E DURATION (1 titolo, 1 ETF o fondo; le scadenze degli obiettivi sono nelle risposte del percorso) ---');
      expect(turn).toContain(`- BTP Esempio 2030: scade il 2030-03-01 (3,4 anni), valore ${eur(5000)}, negoziabile`);
      expect(turn).toContain(`- ETF Bond Euro (BEUR): duration 2,4 anni, scadenza media 9,8 anni, letto il 2026-11-01, valore ${eur(10000)}, negoziabile`);
      expect(turn).not.toContain('ETF Mondo (MONDO.MI): duration');
    }
    // The instruments read the holdings and, under them, the block.
    expect(userTurn(calls.mock.calls[1])).toContain('STRUMENTI\n\n--- OBBLIGAZIONI');
  });

  it('a failed profile read never fails the round: the block says the durations were not read', async () => {
    ytdMock.mockResolvedValue({ portfolio: BOND_PORTFOLIO });
    profilesMock.mockRejectedValue(new Error('yahoo down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const calls = answerWith(message(roundText([], 'Nota.', true)));
    await runInterviewRound({ userId: 'u1', answers: ANSWERS, previousRounds: [], onRound: vi.fn(), now: NOW });
    expect(userTurn(calls.mock.calls[0])).toContain(`- ETF Bond Euro (BEUR): duration non letta (profili non disponibili in questa corsa), valore ${eur(10000)}, negoziabile`);
    expect(errorSpy).toHaveBeenCalledWith('[consulente] bond profiles not read', expect.any(Error));
  });
});

// ── The previous paths (owner, 2026-11-08, after the interview's phase F on the mirror) ──────────────────────────
describe('the previous paths: the archive and the block', () => {
  const finished = (createdIso: string, summary: string): AllocationAdviceDocument => ({
    ...afterStrategy(),
    status: 'ready',
    stage: 'review',
    createdAt: new Date(createdIso),
    report: { markdown: '# Report', proposal: { ...PROPOSAL, summary } as never, model: 'o', finishedAt: new Date(createdIso) },
    revisions: [],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    setMock.mockResolvedValue(undefined);
    patchMock.mockResolvedValue(undefined);
    archiveMock.mockResolvedValue(undefined);
    historyMock.mockResolvedValue([]);
    ytdMock.mockResolvedValue({ portfolio: EMPTY_PORTFOLIO });
    cashflowMock.mockResolvedValue(EMPTY_CASHFLOW_INPUTS);
  });

  it('the strategy archives the replaced document when it has a report, BEFORE writing the new one, and lists it with the archive, the most recent first', async () => {
    const live = finished('2026-06-01T10:00:00.000Z', 'Piano di giugno.');
    const older = finished('2025-06-01T10:00:00.000Z', "Piano dell'anno prima.");
    getMock.mockResolvedValue(live);
    historyMock.mockResolvedValue([older]);
    const calls = answerWith(message(strategyText(PROPOSAL)));

    await runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', answers: ANSWERS, onStage: vi.fn(), now: NOW });

    expect(historyMock).toHaveBeenCalledWith('u1', 6);
    expect(archiveMock).toHaveBeenCalledTimes(1);
    expect(archiveMock.mock.calls[0][0]).toBe(live);
    expect(archiveMock.mock.invocationCallOrder[0]).toBeLessThan(setMock.mock.invocationCallOrder[0]);
    const turn = userTurn(calls.mock.calls[0]);
    expect(turn).toContain('--- I PERCORSI PRECEDENTI (2 percorsi, dal più recente; il report del primo è il piano in vigore) ---');
    expect(turn.indexOf('--- IL PIANO IN VIGORE')).toBeLessThan(turn.indexOf('--- I PERCORSI PRECEDENTI'));
    expect(turn.indexOf('## Percorso del 2026-06-01')).toBeLessThan(turn.indexOf('## Percorso del 2025-06-01'));
    expect(turn).toContain('Proposta di allora: Piano di giugno. — ');
    expect(turn).toContain("Proposta di allora: Piano dell'anno prima. — ");
  });

  it('a replaced document without a report is neither archived nor listed; with no path at all the block is absent', async () => {
    getMock.mockResolvedValue({ ...afterStrategy(), status: 'failed' });
    const calls = answerWith(message(strategyText(PROPOSAL)));
    await runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', answers: ANSWERS, onStage: vi.fn(), now: NOW });
    expect(historyMock).toHaveBeenCalledWith('u1', 6);
    expect(archiveMock).not.toHaveBeenCalled();
    expect(userTurn(calls.mock.calls[0])).not.toContain('I PERCORSI PRECEDENTI');
  });

  it("the interview of a new path reads the live report and the archive and writes nothing; the revision's round reads neither", async () => {
    getMock.mockResolvedValue(finished('2026-06-01T10:00:00.000Z', 'Piano di giugno.'));
    const calls = answerWith(message(roundText([], 'Nota.', true)));
    await runInterviewRound({ userId: 'u1', answers: ANSWERS, previousRounds: [], onRound: vi.fn(), now: NOW });
    expect(historyMock).toHaveBeenCalledWith('u1', 6);
    expect(archiveMock).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalled();
    const turn = userTurn(calls.mock.calls[0]);
    expect(turn).toContain('--- I PERCORSI PRECEDENTI (1 percorso, dal più recente; il report del primo è il piano in vigore) ---');
    expect(turn.indexOf('--- I PERCORSI PRECEDENTI')).toBeLessThan(turn.indexOf('Questa è la tornata 1 di 3.'));
    expect(patchMock).not.toHaveBeenCalled();

    historyMock.mockClear();
    const revisionCalls = answerWith(message(roundText([], 'Nota.', true)));
    await runInterviewRound({ userId: 'u1', answers: ANSWERS, previousRounds: [], revision: { requests: 'meno cripto' }, onRound: vi.fn(), now: NOW });
    expect(historyMock).not.toHaveBeenCalled();
    // The same spy keeps every call: the revision's round is the last one.
    expect(userTurn(revisionCalls.mock.calls.at(-1)!)).not.toContain('I PERCORSI PRECEDENTI');
    expect(userTurn(revisionCalls.mock.calls.at(-1)!)).toContain('--- IL REPORT DA RIVEDERE ---');
  });

  it('a failed archive read or copy never fails the path: the block says the archive was not read, the errors go to the log', async () => {
    getMock.mockResolvedValue(finished('2026-06-01T10:00:00.000Z', 'Piano di giugno.'));
    historyMock.mockRejectedValue(new Error('firestore down'));
    archiveMock.mockRejectedValue(new Error('firestore down'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const calls = answerWith(message(strategyText(PROPOSAL)));

    const document = await runAllocationAdviceStage({ userId: 'u1', stage: 'strategy', answers: ANSWERS, onStage: vi.fn(), now: NOW });

    expect(document.status).toBe('running');
    expect(document.strategy?.proposal?.summary).toBe('Strategia.');
    expect(userTurn(calls.mock.calls[0])).toContain("(1 percorso, dal più recente; il report del primo è il piano in vigore) ---\nL'archivio dei percorsi non è stato letto in questa corsa: qui c'è solo l'ultimo.");
    expect(errorSpy).toHaveBeenCalledWith('[consulente] history not read', expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith('[consulente] previous path not archived', expect.any(Error));
  });
});
